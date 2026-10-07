/**
 * Decides *when* to act on each occurrence. Deliberately dumb about *what*
 * to do — every actual decision (preflight checks, availability checks,
 * submission) is delegated to callbacks backed by the booking engine.
 *
 * Re-reads wall-clock time on every tick rather than relying on a single
 * long-lived timer per occurrence, specifically so that:
 *  - Mac sleep/wake is handled correctly: `setTimeout` durations spanning a
 *    sleep period are unreliable (they may fire immediately on wake, or be
 *    delayed) — but re-evaluating wall-clock time on the next tick after
 *    wake always gives the right answer.
 *  - Manual system clock changes / timezone changes self-correct on the next
 *    tick instead of requiring a restart.
 */

import type { Clock, TimerHandle } from '../time/clock.js';

export type SchedulableStatus =
  | 'ARMED'
  | 'WAITING_FOR_RELEASE'
  | 'CHECKING'
  | 'AWAITING_USER_ACTION'
  | 'UNKNOWN_OUTCOME'
  | 'PAUSED'
  | 'CONFIRMED'
  | 'FAILED'
  | 'EXPIRED'
  | 'PREFLIGHT'
  | 'DRAFT';

export interface SchedulableOccurrence {
  id: string;
  status: SchedulableStatus;
  releaseAtUtc: string;
  preflightMinutesBeforeRelease: number;
  pollingWindowSeconds: number;
  pollingIntervalSeconds: number;
}

export interface SchedulerCallbacks {
  listActiveOccurrences(): Promise<SchedulableOccurrence[]>;
  onPreflightDue(occurrenceId: string): Promise<void>;
  /** First CHECKING-phase action at (or shortly after) the release instant. */
  onReleaseReached(occurrenceId: string): Promise<void>;
  /** Subsequent CHECKING-phase polls. Returns a server-provided retry delay, if any. */
  onPollTick(occurrenceId: string): Promise<{ retryAfterSeconds: number | null }>;
  onPollingWindowExpired(occurrenceId: string): Promise<void>;
  onMissedWhileAsleep(occurrenceId: string): Promise<void>;
  onHeartbeat?(info: { nowWallMs: number; activeCount: number }): void;
}

export interface SchedulerOptions {
  tickIntervalMs: number;
  /**
   * How long after the release instant we are still willing to run the
   * *first* catch-up check if the app only wakes up / restarts after release
   * has already passed (e.g. the Mac was asleep). Beyond this, the
   * occurrence is marked missed rather than attempted late.
   */
  catchUpWindowSeconds: number;
}

export class Scheduler {
  private timer: TimerHandle | null = null;
  private running = false;
  private readonly nextPollDueMs = new Map<string, number>();
  /** Guards against overlapping ticks if a tick's async work runs longer than the interval. */
  private tickInFlight = false;

  constructor(
    private readonly clock: Clock,
    private readonly options: SchedulerOptions,
    private readonly callbacks: SchedulerCallbacks
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNextTick(0);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      this.clock.clearTimer(this.timer);
      this.timer = null;
    }
  }

  /** Call after Electron's powerMonitor reports a resume-from-sleep (or similar) event, to re-evaluate immediately rather than waiting for the next scheduled tick. */
  triggerImmediateTick(): void {
    if (!this.running) return;
    if (this.timer) {
      this.clock.clearTimer(this.timer);
      this.timer = null;
    }
    this.scheduleNextTick(0);
  }

  private scheduleNextTick(delayMs: number): void {
    this.timer = this.clock.setTimer(() => {
      void this.tick().finally(() => {
        if (this.running) this.scheduleNextTick(this.options.tickIntervalMs);
      });
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (this.tickInFlight) return;
    this.tickInFlight = true;
    try {
      const nowWallMs = this.clock.nowWallMs();
      const occurrences = await this.callbacks.listActiveOccurrences();
      this.callbacks.onHeartbeat?.({ nowWallMs, activeCount: occurrences.length });

      for (const occ of occurrences) {
        await this.processOccurrence(occ, nowWallMs);
      }
    } finally {
      this.tickInFlight = false;
    }
  }

  private async processOccurrence(occ: SchedulableOccurrence, nowWallMs: number): Promise<void> {
    const releaseAtMs = Date.parse(occ.releaseAtUtc);
    const preflightAtMs = releaseAtMs - occ.preflightMinutesBeforeRelease * 60_000;
    const pollingWindowEndMs = releaseAtMs + occ.pollingWindowSeconds * 1000;
    const catchUpDeadlineMs = releaseAtMs + this.options.catchUpWindowSeconds * 1000;

    switch (occ.status) {
      case 'ARMED': {
        if (nowWallMs >= preflightAtMs) {
          await this.callbacks.onPreflightDue(occ.id);
        }
        return;
      }
      case 'WAITING_FOR_RELEASE': {
        if (nowWallMs < releaseAtMs) return;
        if (nowWallMs > catchUpDeadlineMs) {
          await this.callbacks.onMissedWhileAsleep(occ.id);
          return;
        }
        this.nextPollDueMs.delete(occ.id);
        await this.callbacks.onReleaseReached(occ.id);
        return;
      }
      case 'CHECKING': {
        if (nowWallMs >= pollingWindowEndMs) {
          this.nextPollDueMs.delete(occ.id);
          await this.callbacks.onPollingWindowExpired(occ.id);
          return;
        }
        const due = this.nextPollDueMs.get(occ.id) ?? nowWallMs;
        if (nowWallMs >= due) {
          const result = await this.callbacks.onPollTick(occ.id);
          const delaySeconds = result.retryAfterSeconds ?? occ.pollingIntervalSeconds;
          this.nextPollDueMs.set(occ.id, nowWallMs + delaySeconds * 1000);
        }
        return;
      }
      default:
        // PREFLIGHT is transitional within onPreflightDue(); AWAITING_USER_ACTION,
        // UNKNOWN_OUTCOME, PAUSED, and terminal states are not scheduler-driven.
        return;
    }
  }
}
