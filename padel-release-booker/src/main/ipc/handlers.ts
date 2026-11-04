import { ipcMain } from 'electron';
import { z } from 'zod';
import { IPC_CHANNELS } from '../../shared/ipc.js';
import type { AppRuntime } from '../appRuntime.js';
import { bookingRuleInputSchema, clubUrlInputSchema, userOutcomeSchema } from '../../core/domain/validation.js';
import { planUpcomingOccurrences } from '../../core/time/releaseSchedule.js';
import { exportDiagnostics } from '../diagnostics.js';
import type { Clock } from '../../core/time/clock.js';
import type { SecretsStore } from '../../core/security/secretsStore.js';
import { buildAuthorizationSummary, computeCoveredFieldsHash } from '../../core/domain/authorization.js';
import { ElectronExternalUrlOpener } from '../shell/externalUrlOpener.js';

const connectRequestSchema = z.object({ mode: z.enum(['mock', 'assisted', 'automatic']), hint: z.string().optional() });
const armRequestSchema = z.object({ ruleId: z.string().min(1), reviewedSummaryHash: z.string().min(1) });
const reportOutcomeSchema = z.object({ occurrenceId: z.string().min(1), outcome: userOutcomeSchema, bookingReference: z.string().optional() });
const clubSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  location: z.string().min(1),
  timezone: z.string().min(1),
  sourceUrl: z.string().url().nullable(),
  verified: z.boolean()
});

/** Registers every ipcMain.handle() call. Every argument is parsed with zod before use — never trust the renderer. */
export function registerIpcHandlers(runtime: AppRuntime, clock: Clock, secretsStore: SecretsStore): void {
  ipcMain.handle(IPC_CHANNELS.getAppState, async () => {
    const rules = runtime.rules.list().map((r) => ({ ...r, isPaused: runtime.rules.isPaused(r.id) }));
    const session = runtime.getMode() === 'mock' ? await runtime.getAdapter().getSession() : (runtime.sessions.get('assisted') ?? (await runtime.getAdapter().getSession()));
    return {
      mode: runtime.getMode(),
      session,
      clubs: runtime.clubs.list(),
      rules,
      recentBookings: runtime.bookings.listRecent(50),
      emergencyStopped: runtime.isEmergencyStopped(),
      schedulerRunning: true,
      lastHeartbeatWallMs: clock.nowWallMs(),
      platformWarnings: []
    };
  });

  ipcMain.handle(IPC_CHANNELS.connect, async (_e, raw: unknown) => {
    const { mode, hint } = connectRequestSchema.parse(raw);
    return runtime.connect(mode, hint);
  });

  ipcMain.handle(IPC_CHANNELS.disconnect, async () => {
    await runtime.disconnect();
  });

  ipcMain.handle(IPC_CHANNELS.resolveClubByUrl, async (_e, raw: unknown) => {
    const { url } = clubUrlInputSchema.parse(raw);
    return runtime.resolveClubByUrl(url);
  });

  ipcMain.handle(IPC_CHANNELS.confirmClub, async (_e, raw: unknown) => {
    const club = clubSchema.parse(raw);
    runtime.confirmClub(club);
  });

  ipcMain.handle(IPC_CHANNELS.searchClubs, async (_e, raw: unknown) => {
    const query = z.string().min(1).parse(raw);
    return runtime.getAdapter().searchClubs(query);
  });

  ipcMain.handle(IPC_CHANNELS.listCourts, async (_e, raw: unknown) => {
    const clubId = z.string().min(1).parse(raw);
    return runtime.clubs.listCourts(clubId);
  });

  ipcMain.handle(IPC_CHANNELS.createRule, async (_e, raw: unknown) => {
    const input = bookingRuleInputSchema.parse(raw);
    const nowUtc = new Date(clock.nowWallMs()).toISOString();
    const { rule, warnings } = await runtime.createRuleWithOccurrences(input, nowUtc);
    return { rule, occurrences: runtime.occurrences.listByRule(rule.id), warnings };
  });

  ipcMain.handle(IPC_CHANNELS.updateRule, async (_e, rawRuleId: unknown, rawInput: unknown) => {
    const ruleId = z.string().min(1).parse(rawRuleId);
    const input = bookingRuleInputSchema.parse(rawInput);
    const nowUtc = new Date(clock.nowWallMs()).toISOString();
    const { rule, warnings } = await runtime.updateRuleWithOccurrences(ruleId, input, nowUtc);
    return { rule, occurrences: runtime.occurrences.listByRule(rule.id), warnings };
  });

  ipcMain.handle(IPC_CHANNELS.deleteRule, async (_e, raw: unknown) => {
    const ruleId = z.string().min(1).parse(raw);
    runtime.rules.delete(ruleId);
  });

  ipcMain.handle(IPC_CHANNELS.previewOccurrences, async (_e, rawInput: unknown, rawCount: unknown) => {
    const input = bookingRuleInputSchema.parse(rawInput);
    const count = z.number().int().min(1).max(20).parse(rawCount);
    const club = runtime.clubs.getById(input.clubId);
    const timezone = club?.timezone ?? 'Etc/UTC';
    const nowIso = new Date(clock.nowWallMs()).toISOString().slice(0, 10);
    return planUpcomingOccurrences(
      {
        playDatePattern: input.playDate,
        preferredStartTime: input.preferredStartTime,
        durationMinutes: input.durationMinutes,
        release: input.release,
        timezone,
        ambiguousLocalTimePolicy: input.ambiguousLocalTimePolicy,
        nonexistentLocalTimePolicy: input.nonexistentLocalTimePolicy,
        exclusionDates: input.exclusionDates
      },
      nowIso,
      count
    );
  });

  ipcMain.handle(IPC_CHANNELS.buildAuthorizationReview, async (_e, raw: unknown) => {
    const ruleId = z.string().min(1).parse(raw);
    const input = runtime.buildAuthorizationReviewInput(
      ruleId,
      runtime.getMode() === 'mock' ? 'Mock payment method (sandbox — no real payment method is used)' : 'Whatever payment method you select during your own checkout on the real Playtomic site',
      runtime.getMode() === 'mock',
      runtime.getMode() === 'mock'
        ? 'Sandbox cancellation policy: free cancellation anytime (simulated).'
        : 'Not available automatically in assisted mode — read the club\'s real cancellation policy yourself on the booking page before paying.'
    );
    return { ...buildAuthorizationSummary(input), _hash: computeCoveredFieldsHash(input) };
  });

  ipcMain.handle(IPC_CHANNELS.armRule, async (_e, raw: unknown) => {
    const { ruleId, reviewedSummaryHash } = armRequestSchema.parse(raw);
    const nowUtc = new Date(clock.nowWallMs()).toISOString();
    await runtime.armRule(ruleId, reviewedSummaryHash, nowUtc);
    return runtime.authorizations.getActiveForRule(ruleId);
  });

  ipcMain.handle(IPC_CHANNELS.pauseRule, async (_e, raw: unknown) => {
    const ruleId = z.string().min(1).parse(raw);
    runtime.rules.setPaused(ruleId, true);
  });

  ipcMain.handle(IPC_CHANNELS.resumeRule, async (_e, raw: unknown) => {
    const ruleId = z.string().min(1).parse(raw);
    runtime.rules.setPaused(ruleId, false);
  });

  ipcMain.handle(IPC_CHANNELS.emergencyStop, async () => {
    await runtime.emergencyStop();
  });

  ipcMain.handle(IPC_CHANNELS.emergencyResume, async () => {
    await runtime.emergencyResume();
  });

  ipcMain.handle(IPC_CHANNELS.listOccurrences, async (_e, raw: unknown) => {
    const ruleId = z.string().min(1).parse(raw);
    return runtime.occurrences.listByRule(ruleId);
  });

  ipcMain.handle(IPC_CHANNELS.listBookingHistory, async (_e, raw: unknown) => {
    const limit = z.number().int().min(1).max(500).parse(raw);
    return runtime.bookings.listRecent(limit);
  });

  ipcMain.handle(IPC_CHANNELS.reportUserOutcome, async (_e, raw: unknown) => {
    const { occurrenceId, outcome, bookingReference } = reportOutcomeSchema.parse(raw);
    await runtime.reportUserOutcome(occurrenceId, outcome, bookingReference ?? null);
  });

  ipcMain.handle(IPC_CHANNELS.exportDiagnostics, async () => {
    return exportDiagnostics(runtime);
  });

  ipcMain.handle(IPC_CHANNELS.deleteAllLocalData, async () => {
    await secretsStore.clearAll();
    for (const rule of runtime.rules.list()) {
      runtime.rules.delete(rule.id);
    }
  });

  ipcMain.handle(IPC_CHANNELS.openClubPage, async (_e, raw: unknown) => {
    const url = z.string().url().parse(raw);
    await new ElectronExternalUrlOpener().open(url);
  });
}
