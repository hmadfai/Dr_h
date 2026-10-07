import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { AppDatabase } from '../core/persistence/db.js';
import { ClubRepository } from '../core/persistence/repositories/clubRepository.js';
import { RuleRepository } from '../core/persistence/repositories/ruleRepository.js';
import { OccurrenceRepository } from '../core/persistence/repositories/occurrenceRepository.js';
import { BookingRepository } from '../core/persistence/repositories/bookingRepository.js';
import { AuthorizationRepository } from '../core/persistence/repositories/authorizationRepository.js';
import { SqliteOccurrenceLockStore } from '../core/persistence/repositories/occurrenceLockRepository.js';
import { SessionRepository } from '../core/persistence/repositories/sessionRepository.js';
import { Scheduler } from '../core/engine/scheduler.js';
import type { SchedulerCallbacks } from '../core/engine/scheduler.js';
import { pollOccurrenceOnce, reconcileUnknownOutcome, runPreflight } from '../core/engine/bookingEngine.js';
import { applyOccurrenceEvent } from '../core/domain/stateMachine.js';
import type { OccurrenceEvent } from '../core/domain/stateMachine.js';
import { buildUpcomingOccurrences } from '../core/domain/occurrenceFactory.js';
import { computeCoveredFieldsHash, buildAuthorizationSummary } from '../core/domain/authorization.js';
import type { AuthorizationReviewInput } from '../core/domain/authorization.js';
import type { Clock } from '../core/time/clock.js';
import type { AdapterMode, BookingRule, Club, SessionInfo } from '../core/domain/types.js';
import type { PlaytomicAdapter } from '../core/adapters/PlaytomicAdapter.js';
import { assertMockNeverClaimsReal, createDefaultMockWorld, MockPlaytomicAdapter } from '../core/adapters/mockAdapter.js';
import type { MockWorld } from '../core/adapters/mockAdapter.js';
import { AssistedPlaytomicAdapter } from '../core/adapters/assistedAdapter.js';
import type { ExternalUrlOpener } from '../core/adapters/assistedAdapter.js';
import type { Notifier } from '../core/notifications/notifier.js';
import type { BookingRuleInput } from '../core/domain/validation.js';
import { buildFictionalMockWorld } from './mockFixtures.js';

export interface AppRuntimeDeps {
  db: AppDatabase;
  clock: Clock;
  externalUrlOpener: ExternalUrlOpener;
  notifier: Notifier;
  /** Persisted app-level settings, e.g. emergency-stop flag. Kept tiny and separate from business tables. */
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
}

export interface RuntimeEvents {
  heartbeat: { nowWallMs: number; activeOccurrenceCount: number };
  notice: { level: 'info' | 'warning' | 'error'; title: string; body: string };
}

const SCHEDULER_TICK_MS = 5_000;
const CATCH_UP_WINDOW_SECONDS = 15 * 60; // 15 minutes: how late we'll still attempt a first catch-up check after waking.
const LOCK_TTL_MS = 5 * 60_000;

/**
 * Wires persistence, the scheduler, the booking engine, and whichever
 * adapter is currently connected into one runnable unit. This is the only
 * class the Electron main process entry point and the IPC handlers need to
 * talk to.
 */
export class AppRuntime extends EventEmitter {
  readonly workerId = randomUUID();

  readonly clubs: ClubRepository;
  readonly rules: RuleRepository;
  readonly occurrences: OccurrenceRepository;
  readonly bookings: BookingRepository;
  readonly authorizations: AuthorizationRepository;
  readonly sessions: SessionRepository;
  readonly lockStore: SqliteOccurrenceLockStore;
  readonly scheduler: Scheduler;

  private currentMode: AdapterMode = 'mock';
  private mockWorld: MockWorld;
  private adapter: PlaytomicAdapter;
  private assistedSession: SessionInfo = {
    mode: 'assisted',
    state: 'disconnected',
    accountLabel: null,
    connectedAtUtc: null,
    expiresAtUtc: null,
    lastError: null
  };

  constructor(private readonly deps: AppRuntimeDeps) {
    super();
    this.clubs = new ClubRepository(deps.db);
    this.rules = new RuleRepository(deps.db);
    this.occurrences = new OccurrenceRepository(deps.db);
    this.bookings = new BookingRepository(deps.db);
    this.authorizations = new AuthorizationRepository(deps.db);
    this.sessions = new SessionRepository(deps.db);
    this.lockStore = new SqliteOccurrenceLockStore(deps.db);

    this.mockWorld = buildFictionalMockWorld();
    this.adapter = new MockPlaytomicAdapter(this.mockWorld, deps.clock);
    assertMockNeverClaimsReal(this.adapter);

    const storedAssisted = this.sessions.get('assisted');
    if (storedAssisted) this.assistedSession = storedAssisted;

    this.scheduler = new Scheduler(
      deps.clock,
      { tickIntervalMs: SCHEDULER_TICK_MS, catchUpWindowSeconds: CATCH_UP_WINDOW_SECONDS },
      this.buildSchedulerCallbacks()
    );
  }

  start(): void {
    this.scheduler.start();
  }

  stop(): void {
    this.scheduler.stop();
  }

  /** Call after Electron's powerMonitor reports a resume-from-sleep (or similar) event. */
  notifyWoke(): void {
    this.scheduler.triggerImmediateTick();
  }

  isEmergencyStopped(): boolean {
    return this.deps.getMeta('emergency_stopped') === '1';
  }

  async emergencyStop(): Promise<void> {
    this.deps.setMeta('emergency_stopped', '1');
    this.emit('notice', { level: 'warning', title: 'Emergency stop engaged', body: 'All automatic scheduling is paused. No new booking attempts will start until you resume.' });
  }

  async emergencyResume(): Promise<void> {
    this.deps.setMeta('emergency_stopped', '0');
    this.emit('notice', { level: 'info', title: 'Emergency stop lifted', body: 'Automatic scheduling has resumed.' });
  }

  getMode(): AdapterMode {
    return this.currentMode;
  }

  getAdapter(): PlaytomicAdapter {
    return this.adapter;
  }

  async connect(mode: AdapterMode, hint?: string): Promise<SessionInfo> {
    if (mode === 'automatic') {
      throw new Error('Automatic mode has no live adapter (see docs/integration-feasibility.md). Connect using "mock" (sandbox) or "assisted" instead.');
    }
    this.currentMode = mode;
    if (mode === 'mock') {
      this.adapter = new MockPlaytomicAdapter(this.mockWorld, this.deps.clock);
      assertMockNeverClaimsReal(this.adapter);
      const session = await this.adapter.connect(hint ? { hint } : undefined);
      return session;
    }
    this.adapter = new AssistedPlaytomicAdapter(this.deps.externalUrlOpener, this.deps.notifier, {
      get: () => this.assistedSession,
      set: (s) => {
        this.assistedSession = s;
        this.sessions.save(s);
      }
    });
    return this.adapter.connect(hint ? { hint } : undefined);
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
  }

  async resolveClubByUrl(url: string): Promise<Club> {
    return this.adapter.resolveClubByUrl(url);
  }

  confirmClub(club: Club): void {
    this.clubs.upsert(club);
  }

  async createRuleWithOccurrences(input: BookingRuleInput, nowUtc: string): Promise<{ rule: BookingRule; warnings: string[] }> {
    const club = this.clubs.getById(input.clubId);
    if (!club) throw new Error('Unknown club. Resolve and confirm the club before creating a rule.');

    const rule: BookingRule = { ...input, id: randomUUID(), createdAtUtc: nowUtc, updatedAtUtc: nowUtc };
    this.rules.upsert(rule);

    const built = buildUpcomingOccurrences(rule, club.timezone, nowUtc.slice(0, 10), 10, nowUtc);
    const warnings: string[] = [];
    for (const { occurrence, warnings: w } of built) {
      if (!this.occurrences.findByRuleAndPlayDate(rule.id, occurrence.playDate)) {
        this.occurrences.insert(occurrence);
      }
      warnings.push(...w.map((x) => x.message));
    }
    return { rule, warnings };
  }

  /**
   * Updating a rule is a material change by definition, so any existing
   * authorization for it is revoked here — re-arming requires a fresh
   * review (spec section 4). Future (not-yet-created) occurrences are
   * (re)generated; existing non-DRAFT occurrences are left untouched so an
   * in-flight booking attempt is never disturbed by an edit.
   */
  async updateRuleWithOccurrences(ruleId: string, input: BookingRuleInput, nowUtc: string): Promise<{ rule: BookingRule; warnings: string[] }> {
    const existing = this.rules.getById(ruleId);
    if (!existing) throw new Error('Unknown rule.');
    const club = this.clubs.getById(input.clubId);
    if (!club) throw new Error('Unknown club. Resolve and confirm the club before editing this rule.');

    const rule: BookingRule = { ...input, id: ruleId, createdAtUtc: existing.createdAtUtc, updatedAtUtc: nowUtc };
    this.rules.upsert(rule);

    for (const activeAuth of this.authorizations.listForRule(ruleId)) {
      if (!activeAuth.revokedAtUtc) this.authorizations.revoke(activeAuth.id, nowUtc);
    }

    const built = buildUpcomingOccurrences(rule, club.timezone, nowUtc.slice(0, 10), 10, nowUtc);
    const warnings: string[] = [];
    for (const { occurrence, warnings: w } of built) {
      if (!this.occurrences.findByRuleAndPlayDate(rule.id, occurrence.playDate)) {
        this.occurrences.insert(occurrence);
      }
      warnings.push(...w.map((x) => x.message));
    }
    return { rule, warnings };
  }

  buildAuthorizationReviewInput(ruleId: string, paymentMethodLabel: string, cancellationAvailable: boolean, cancellationSummary: string): AuthorizationReviewInput {
    const rule = this.rules.getById(ruleId);
    if (!rule) throw new Error('Unknown rule.');
    const club = this.clubs.getById(rule.clubId);
    if (!club) throw new Error('Unknown club for rule.');
    return {
      mode: this.currentMode,
      club,
      accountLabel: this.currentMode === 'mock' ? this.mockWorld.session.accountLabel : this.assistedSession.accountLabel,
      rule,
      allowedPaymentMethodLabel: paymentMethodLabel,
      cancellationPolicy: { available: cancellationAvailable, summary: cancellationSummary, nonRefundableFeesSummary: null },
      authorizationExpiresAtUtc: null
    };
  }

  async armRule(ruleId: string, reviewedSummaryHash: string, nowUtc: string): Promise<void> {
    const rule = this.rules.getById(ruleId);
    if (!rule) throw new Error('Unknown rule.');
    const currentHash = computeCoveredFieldsHash(this.buildAuthorizationReviewInput(ruleId, 'Reviewed at arm time', true, 'See review screen'));
    if (currentHash !== reviewedSummaryHash) {
      throw new Error('The rule changed since you last reviewed it. Please review and arm again.');
    }
    const version = this.authorizations.nextVersion(ruleId);
    this.authorizations.insert({
      id: randomUUID(),
      ruleId,
      version,
      createdAtUtc: nowUtc,
      expiresAtUtc: null,
      summaryJson: JSON.stringify(buildAuthorizationSummary(this.buildAuthorizationReviewInput(ruleId, 'Reviewed at arm time', true, 'See review screen'))),
      coveredFieldsHash: currentHash,
      revokedAtUtc: null
    });

    for (const occurrence of this.occurrences.listByRule(ruleId)) {
      if (occurrence.status === 'DRAFT') {
        const result = applyOccurrenceEvent({ status: occurrence.status, pausedFromStatus: null, terminalReason: null }, { type: 'ARM' });
        this.occurrences.updateStatus(occurrence.id, result.status, result.pausedFromStatus, result.terminalReason, nowUtc);
      }
    }
  }

  private async withOccurrence(occurrenceId: string, fn: (ctx: { rule: BookingRule; club: Club }) => Promise<void>): Promise<void> {
    const occurrence = this.occurrences.getById(occurrenceId);
    if (!occurrence) return;
    const rule = this.rules.getById(occurrence.ruleId);
    if (!rule) return;
    const club = this.clubs.getById(rule.clubId);
    if (!club) return;
    await fn({ rule, club });
  }

  private applyAndPersist(occurrenceId: string, event: OccurrenceEvent, nowUtc: string): void {
    const occurrence = this.occurrences.getById(occurrenceId);
    if (!occurrence) return;
    const result = applyOccurrenceEvent({ status: occurrence.status, pausedFromStatus: occurrence.pausedFromStatus, terminalReason: occurrence.terminalReason }, event);
    this.occurrences.updateStatus(occurrenceId, result.status, result.pausedFromStatus, result.terminalReason, nowUtc);
  }

  private buildSchedulerCallbacks(): SchedulerCallbacks {
    return {
      listActiveOccurrences: async () => {
        if (this.isEmergencyStopped()) return [];
        return this.occurrences.listSchedulable();
      },
      onPreflightDue: async (occurrenceId) => {
        await this.withOccurrence(occurrenceId, async ({ rule }) => {
          const occurrence = this.occurrences.getById(occurrenceId)!;
          const club = this.clubs.getById(rule.clubId)!;
          const activeAuth = this.authorizations.getActiveForRule(rule.id);
          const currentHash = computeCoveredFieldsHash(this.buildAuthorizationReviewInput(rule.id, 'Reviewed at arm time', true, 'See review screen'));
          const authorizationValid = !!activeAuth && activeAuth.coveredFieldsHash === currentHash;
          const outcome = await runPreflight({
            occurrence,
            rule,
            adapter: this.adapter,
            clubUrl: club.sourceUrl,
            authorizationValid,
            authorizationFailureReason: authorizationValid ? null : 'Rule or club changed since authorization; re-arm required.'
          });
          this.applyAndPersist(occurrenceId, outcome.event, new Date(this.deps.clock.nowWallMs()).toISOString());
          if (outcome.event.type !== 'PREFLIGHT_PASSED') {
            this.emit('notice', { level: 'warning', title: `Preflight needs attention: ${rule.name}`, body: outcome.log.join(' ') });
          }
        });
      },
      onReleaseReached: async (occurrenceId) => {
        this.applyAndPersist(occurrenceId, { type: 'RELEASE_TIME_REACHED' }, new Date(this.deps.clock.nowWallMs()).toISOString());
        await this.pollOnce(occurrenceId);
      },
      onPollTick: async (occurrenceId) => {
        return this.pollOnce(occurrenceId);
      },
      onPollingWindowExpired: async (occurrenceId) => {
        this.applyAndPersist(occurrenceId, { type: 'POLLING_WINDOW_EXPIRED' }, new Date(this.deps.clock.nowWallMs()).toISOString());
      },
      onMissedWhileAsleep: async (occurrenceId) => {
        this.applyAndPersist(
          occurrenceId,
          { type: 'EXPIRE', reason: 'The release time passed while the app was not running or the Mac was asleep, beyond the catch-up window.' },
          new Date(this.deps.clock.nowWallMs()).toISOString()
        );
        await this.withOccurrence(occurrenceId, async ({ rule }) => {
          this.emit('notice', { level: 'warning', title: `Missed release: ${rule.name}`, body: 'The app could not check in time (asleep, closed, or out of catch-up window). No booking was attempted.' });
        });
      },
      onHeartbeat: (info) => this.emit('heartbeat', info)
    };
  }

  private async pollOnce(occurrenceId: string): Promise<{ retryAfterSeconds: number | null }> {
    let retryAfterSeconds: number | null = null;
    await this.withOccurrence(occurrenceId, async ({ rule, club }) => {
      const occurrence = this.occurrences.getById(occurrenceId)!;
      if (occurrence.status !== 'CHECKING') return;
      const outcome = await pollOccurrenceOnce({
        occurrence,
        rule,
        clubTimezone: club.timezone,
        clubId: club.id,
        clubName: club.name,
        clubUrl: club.sourceUrl,
        adapter: this.adapter,
        lockStore: this.lockStore,
        countProvider: {
          countActiveBookingsForRule: async (ruleId) => this.occurrences.countActiveForRule(ruleId, new Date(this.deps.clock.nowWallMs()).toISOString()),
          countSuccessfulBookingsForOccurrence: async (id) => this.occurrences.countSuccessfulForOccurrence(id)
        },
        clock: this.deps.clock,
        workerId: this.workerId,
        lockTtlMs: LOCK_TTL_MS
      });
      retryAfterSeconds = outcome.retryAfterSeconds;
      const nowUtc = new Date(this.deps.clock.nowWallMs()).toISOString();
      for (const event of outcome.events) {
        this.applyAndPersist(occurrenceId, event, nowUtc);
      }
      if (outcome.bookingRecord) {
        this.bookings.insert(randomUUID(), outcome.bookingRecord, this.currentMode, nowUtc);
      }
      if (outcome.events.some((e) => e.type === 'SUBMIT_CONFIRMED')) {
        this.emit('notice', { level: 'info', title: `Booked: ${rule.name}`, body: `Confirmed for ${occurrence.playDate}.` });
      }
      if (outcome.events.some((e) => e.type === 'REQUIRES_USER_ACTION')) {
        this.emit('notice', { level: 'warning', title: `Action needed: ${rule.name}`, body: outcome.log.join(' ') });
      }
      if (outcome.events.some((e) => e.type === 'SUBMIT_TIMEOUT_UNKNOWN')) {
        this.emit('notice', { level: 'error', title: `Unknown outcome: ${rule.name}`, body: 'Submission timed out; reconciling before any further action.' });
        void this.reconcile(occurrenceId);
      }
    });
    return { retryAfterSeconds };
  }

  async reconcile(occurrenceId: string): Promise<void> {
    await this.withOccurrence(occurrenceId, async ({ rule, club }) => {
      const occurrence = this.occurrences.getById(occurrenceId)!;
      if (occurrence.status !== 'UNKNOWN_OUTCOME') return;
      const outcome = await reconcileUnknownOutcome({ occurrence, rule, clubId: club.id, adapter: this.adapter, lockStore: this.lockStore, workerId: this.workerId });
      const nowUtc = new Date(this.deps.clock.nowWallMs()).toISOString();
      this.applyAndPersist(occurrenceId, outcome.event, nowUtc);
      if (outcome.bookingRecord) {
        this.bookings.insert(randomUUID(), outcome.bookingRecord, this.currentMode, nowUtc);
      }
    });
  }

  async reportUserOutcome(occurrenceId: string, outcome: 'booked' | 'not-booked' | 'unknown', bookingReference: string | null): Promise<void> {
    const occurrence = this.occurrences.getById(occurrenceId);
    if (!occurrence) return;
    const nowUtc = new Date(this.deps.clock.nowWallMs()).toISOString();
    const event: OccurrenceEvent =
      outcome === 'booked'
        ? { type: 'USER_CONFIRMED_BOOKED' }
        : outcome === 'not-booked'
          ? { type: 'USER_CONFIRMED_NOT_BOOKED', reason: 'User reported the booking did not complete.' }
          : { type: 'USER_REPORTED_STILL_UNKNOWN' };
    this.applyAndPersist(occurrenceId, event, nowUtc);
    if (outcome === 'booked') {
      await this.withOccurrence(occurrenceId, async ({ rule, club }) => {
        this.bookings.insert(
          randomUUID(),
          {
            occurrenceId,
            ruleId: rule.id,
            clubId: club.id,
            intentId: occurrence.intentId,
            outcome: 'CONFIRMED',
            bookingReference: bookingReference ?? null,
            courtId: null,
            courtName: null,
            startUtc: occurrence.playStartUtc,
            endUtc: occurrence.playEndUtc,
            price: null,
            currency: null,
            failureReason: null
          },
          this.currentMode,
          nowUtc
        );
      });
    }
  }
}
