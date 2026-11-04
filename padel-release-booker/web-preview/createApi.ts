/**
 * Browser-preview API surface that mirrors src/main/ipc/handlers.ts, but
 * without Electron's ipcMain. Used only by the public web-preview server so
 * reviewers can exercise the real mock AppRuntime in a normal browser.
 */
import { z } from 'zod';
import { bookingRuleInputSchema, clubUrlInputSchema, userOutcomeSchema } from '../src/core/domain/validation.js';
import { planUpcomingOccurrences } from '../src/core/time/releaseSchedule.js';
import { buildAuthorizationSummary, computeCoveredFieldsHash } from '../src/core/domain/authorization.js';
import { assertAllowedExternalUrl } from '../src/core/urlAllowlist.js';
import type { AppRuntime } from '../src/main/appRuntime.js';
import type { Clock } from '../src/core/time/clock.js';
import type { SecretsStore } from '../src/core/security/secretsStore.js';

const connectRequestSchema = z.object({ mode: z.enum(['mock', 'assisted', 'automatic']), hint: z.string().optional() });
const armRequestSchema = z.object({ ruleId: z.string().min(1), reviewedSummaryHash: z.string().min(1) });
const reportOutcomeSchema = z.object({
  occurrenceId: z.string().min(1),
  outcome: userOutcomeSchema,
  bookingReference: z.string().optional()
});
const clubSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  location: z.string().min(1),
  timezone: z.string().min(1),
  sourceUrl: z.string().url().nullable(),
  verified: z.boolean()
});

export type ApiMethod =
  | 'getAppState'
  | 'connect'
  | 'disconnect'
  | 'resolveClubByUrl'
  | 'confirmClub'
  | 'searchClubs'
  | 'listCourts'
  | 'createRule'
  | 'updateRule'
  | 'deleteRule'
  | 'previewOccurrences'
  | 'buildAuthorizationReview'
  | 'armRule'
  | 'pauseRule'
  | 'resumeRule'
  | 'emergencyStop'
  | 'emergencyResume'
  | 'listOccurrences'
  | 'listBookingHistory'
  | 'reportUserOutcome'
  | 'exportDiagnostics'
  | 'deleteAllLocalData'
  | 'openClubPage';

export function createApi(runtime: AppRuntime, clock: Clock, secretsStore: SecretsStore) {
  return {
    async getAppState() {
      const rules = runtime.rules.list().map((r) => ({ ...r, isPaused: runtime.rules.isPaused(r.id) }));
      const session =
        runtime.getMode() === 'mock'
          ? await runtime.getAdapter().getSession()
          : (runtime.sessions.get('assisted') ?? (await runtime.getAdapter().getSession()));
      return {
        mode: runtime.getMode(),
        session,
        clubs: runtime.clubs.list(),
        rules,
        recentBookings: runtime.bookings.listRecent(50),
        emergencyStopped: runtime.isEmergencyStopped(),
        schedulerRunning: true,
        lastHeartbeatWallMs: clock.nowWallMs(),
        platformWarnings: [
          'This is a browser preview of the Mock sandbox (real AppRuntime + SQLite). It is not the packaged macOS .app. Tray, Keychain, and native notifications are unavailable here.'
        ]
      };
    },

    async connect(raw: unknown) {
      const { mode, hint } = connectRequestSchema.parse(raw);
      return runtime.connect(mode, hint);
    },

    async disconnect() {
      await runtime.disconnect();
    },

    async resolveClubByUrl(raw: unknown) {
      const { url } = clubUrlInputSchema.parse(raw);
      return runtime.resolveClubByUrl(url);
    },

    async confirmClub(raw: unknown) {
      const club = clubSchema.parse(raw);
      runtime.confirmClub(club);
    },

    async searchClubs(raw: unknown) {
      const query = z.string().min(1).parse(raw);
      return runtime.getAdapter().searchClubs(query);
    },

    async listCourts(raw: unknown) {
      const clubId = z.string().min(1).parse(raw);
      return runtime.clubs.listCourts(clubId);
    },

    async createRule(raw: unknown) {
      const input = bookingRuleInputSchema.parse(raw);
      const nowUtc = new Date(clock.nowWallMs()).toISOString();
      const { rule, warnings } = await runtime.createRuleWithOccurrences(input, nowUtc);
      return { rule, occurrences: runtime.occurrences.listByRule(rule.id), warnings };
    },

    async updateRule(args: unknown) {
      const parsed = z.object({ ruleId: z.string().min(1), input: bookingRuleInputSchema }).parse(args);
      const nowUtc = new Date(clock.nowWallMs()).toISOString();
      const { rule, warnings } = await runtime.updateRuleWithOccurrences(parsed.ruleId, parsed.input, nowUtc);
      return { rule, occurrences: runtime.occurrences.listByRule(rule.id), warnings };
    },

    async deleteRule(raw: unknown) {
      const ruleId = z.string().min(1).parse(raw);
      runtime.rules.delete(ruleId);
    },

    async previewOccurrences(args: unknown) {
      const parsed = z.object({ input: bookingRuleInputSchema, count: z.number().int().min(1).max(20) }).parse(args);
      const club = runtime.clubs.getById(parsed.input.clubId);
      const timezone = club?.timezone ?? 'Etc/UTC';
      const nowIso = new Date(clock.nowWallMs()).toISOString().slice(0, 10);
      return planUpcomingOccurrences(
        {
          playDatePattern: parsed.input.playDate,
          preferredStartTime: parsed.input.preferredStartTime,
          durationMinutes: parsed.input.durationMinutes,
          release: parsed.input.release,
          timezone,
          ambiguousLocalTimePolicy: parsed.input.ambiguousLocalTimePolicy,
          nonexistentLocalTimePolicy: parsed.input.nonexistentLocalTimePolicy,
          exclusionDates: parsed.input.exclusionDates
        },
        nowIso,
        parsed.count
      );
    },

    async buildAuthorizationReview(raw: unknown) {
      const ruleId = z.string().min(1).parse(raw);
      const input = runtime.buildAuthorizationReviewInput(
        ruleId,
        runtime.getMode() === 'mock'
          ? 'Mock payment method (sandbox — no real payment method is used)'
          : 'Whatever payment method you select during your own checkout on the real Playtomic site',
        runtime.getMode() === 'mock',
        runtime.getMode() === 'mock'
          ? 'Sandbox cancellation policy: free cancellation anytime (simulated).'
          : "Not available automatically in assisted mode — read the club's real cancellation policy yourself on the booking page before paying."
      );
      return { ...buildAuthorizationSummary(input), _hash: computeCoveredFieldsHash(input) };
    },

    async armRule(raw: unknown) {
      const { ruleId, reviewedSummaryHash } = armRequestSchema.parse(raw);
      const nowUtc = new Date(clock.nowWallMs()).toISOString();
      await runtime.armRule(ruleId, reviewedSummaryHash, nowUtc);
      return runtime.authorizations.getActiveForRule(ruleId);
    },

    async pauseRule(raw: unknown) {
      const ruleId = z.string().min(1).parse(raw);
      runtime.rules.setPaused(ruleId, true);
    },

    async resumeRule(raw: unknown) {
      const ruleId = z.string().min(1).parse(raw);
      runtime.rules.setPaused(ruleId, false);
    },

    async emergencyStop() {
      await runtime.emergencyStop();
    },

    async emergencyResume() {
      await runtime.emergencyResume();
    },

    async listOccurrences(raw: unknown) {
      const ruleId = z.string().min(1).parse(raw);
      return runtime.occurrences.listByRule(ruleId);
    },

    async listBookingHistory(raw: unknown) {
      const limit = z.number().int().min(1).max(500).parse(raw);
      return runtime.bookings.listRecent(limit);
    },

    async reportUserOutcome(raw: unknown) {
      const { occurrenceId, outcome, bookingReference } = reportOutcomeSchema.parse(raw);
      await runtime.reportUserOutcome(occurrenceId, outcome, bookingReference ?? null);
    },

    async exportDiagnostics() {
      // Browser preview: return the JSON payload as a string (shim triggers a download).
      // Avoid importing Electron's `app` from diagnostics.ts.
      const rules = runtime.rules.list();
      const payload = {
        exportedAtUtc: new Date().toISOString(),
        appMode: runtime.getMode(),
        emergencyStopped: runtime.isEmergencyStopped(),
        preview: true,
        rules: rules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          clubId: rule.clubId,
          mode: rule.mode,
          isPaused: runtime.rules.isPaused(rule.id),
          durationMinutes: rule.durationMinutes,
          maxTotalPrice: rule.maxTotalPrice,
          currency: rule.currency,
          release: rule.release,
          occurrences: runtime.occurrences.listByRule(rule.id).map((o) => ({
            id: o.id,
            playDate: o.playDate,
            status: o.status,
            terminalReason: o.terminalReason,
            releaseAtUtc: o.releaseAtUtc
          })),
          bookings: runtime.bookings.listByRule(rule.id).map((b) => ({
            outcome: b.outcome,
            failureReason: b.failureReason,
            createdAtUtc: b.createdAtUtc,
            mode: b.mode
          }))
        })),
        note: 'Account identifiers are redacted. No credentials, tokens, or cookies are ever stored in this app\'s database, so none can appear here.'
      };
      return JSON.stringify(payload, null, 2);
    },

    async deleteAllLocalData() {
      await secretsStore.clearAll();
      for (const rule of runtime.rules.list()) {
        runtime.rules.delete(rule.id);
      }
    },

    async openClubPage(raw: unknown) {
      const url = z.string().url().parse(raw);
      // Validate allowlist; the browser shim opens the URL itself after this returns.
      assertAllowedExternalUrl(url);
      return { url };
    }
  } as const;
}

export type PreviewApi = ReturnType<typeof createApi>;
