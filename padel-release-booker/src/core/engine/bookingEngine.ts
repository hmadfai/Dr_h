/**
 * The booking engine: the orchestration logic that runs once per scheduler
 * tick for a single occurrence. It is deliberately I/O-interface-driven
 * (adapter, lock store, count provider are all injected interfaces) so it
 * can be fully exercised with the mock adapter + fake clock in tests,
 * without a database or Electron.
 *
 * This module never decides *when* to run — the scheduler does that by
 * comparing wall-clock time to stored timestamps. This module only decides
 * *what happens* once invoked, and returns a description of state-machine
 * events + any booking record to persist; it never writes to storage
 * directly.
 */

import type { Clock } from '../time/clock.js';
import type { BookingOutcome, BookingRule, Occurrence, UtcIsoString } from '../domain/types.js';
import type { OccurrenceEvent } from '../domain/stateMachine.js';
import type { PlaytomicAdapter } from '../adapters/PlaytomicAdapter.js';
import { NetworkError, RateLimitedError, RequiresUserActionError, SessionExpiredError, UnknownOutcomeError } from '../adapters/errors.js';
import { resolveFallbackCandidates } from '../time/releaseSchedule.js';
import type { OccurrenceLockStore } from './duplicateGuard.js';

export interface BookingCountProvider {
  /** Count of CONFIRMED bookings for this rule whose play time is still in the future. */
  countActiveBookingsForRule(ruleId: string): Promise<number>;
  /** Count of CONFIRMED bookings already recorded for this specific occurrence. */
  countSuccessfulBookingsForOccurrence(occurrenceId: string): Promise<number>;
}

export interface BookingRecordDraft {
  occurrenceId: string;
  ruleId: string;
  clubId: string;
  intentId: string;
  outcome: BookingOutcome;
  bookingReference: string | null;
  courtId: string | null;
  courtName: string | null;
  startUtc: UtcIsoString | null;
  endUtc: UtcIsoString | null;
  price: number | null;
  currency: string | null;
  failureReason: string | null;
}

export interface PollOutcome {
  events: OccurrenceEvent[];
  bookingRecord: BookingRecordDraft | null;
  /** Set when the adapter asked us to wait before the next automatic attempt (HTTP 429 Retry-After or equivalent). */
  retryAfterSeconds: number | null;
  log: string[];
}

export interface PollContext {
  occurrence: Occurrence;
  rule: BookingRule;
  clubTimezone: string;
  clubId: string;
  clubName: string;
  clubUrl: string | null;
  adapter: PlaytomicAdapter;
  lockStore: OccurrenceLockStore;
  countProvider: BookingCountProvider;
  clock: Clock;
  workerId: string;
  lockTtlMs: number;
}

function noneEvent(log: string[]): PollOutcome {
  return { events: [], bookingRecord: null, retryAfterSeconds: null, log };
}

/**
 * Run exactly one CHECKING-phase attempt: in assisted mode this means
 * "notify + open the real page, hand off to the human"; in an
 * automatic-capable adapter (today, only the mock adapter) this means
 * "check availability across approved candidates, and if one matches,
 * attempt a single booking submission."
 */
export async function pollOccurrenceOnce(ctx: PollContext): Promise<PollOutcome> {
  const log: string[] = [];
  const { adapter, occurrence, rule } = ctx;

  if (!adapter.capabilities.supportsAutomaticBooking) {
    if (!ctx.clubUrl) {
      log.push('Assisted mode requires a confirmed club URL; none is set.');
      return { events: [{ type: 'REQUIRES_USER_ACTION', reason: 'Club URL is not confirmed; open Club Selection to resolve it.' }], bookingRecord: null, retryAfterSeconds: null, log };
    }
    await adapter.notifyAndOpenBookingPage({
      clubName: ctx.clubName,
      clubUrl: ctx.clubUrl,
      playDate: occurrence.playDate,
      preferredStartTime: rule.preferredStartTime,
      durationMinutes: rule.durationMinutes
    });
    log.push(`Assisted mode: opened ${ctx.clubUrl} and sent a notification. Awaiting your confirmation of the outcome.`);
    return {
      events: [{ type: 'REQUIRES_USER_ACTION', reason: 'Assisted mode: complete the booking in your browser, then record the outcome.' }],
      bookingRecord: null,
      retryAfterSeconds: null,
      log
    };
  }

  const candidates = resolveFallbackCandidates(
    occurrence.playDate,
    ctx.clubTimezone,
    rule.exactTimeOnly,
    rule.preferredStartTime,
    rule.preferredCourtIds,
    rule.fallbackOptions,
    rule.ambiguousLocalTimePolicy,
    rule.nonexistentLocalTimePolicy
  );

  for (const candidate of candidates) {
    const endUtc = new Date(new Date(candidate.startUtc).getTime() + rule.durationMinutes * 60_000).toISOString();

    let slots;
    try {
      slots = await adapter.checkAvailability({
        clubId: ctx.clubId,
        playDate: occurrence.playDate,
        startUtc: candidate.startUtc,
        endUtc,
        courtIds: candidate.courtIds
      });
    } catch (err) {
      if (err instanceof RateLimitedError) {
        log.push(`Rate limited while checking availability for ${candidate.startTime}; retry after ${err.retryAfterSeconds}s.`);
        return { events: [], bookingRecord: null, retryAfterSeconds: err.retryAfterSeconds, log };
      }
      if (err instanceof NetworkError) {
        log.push(`Network error while checking availability for ${candidate.startTime}; will retry within the polling window.`);
        return noneEvent(log);
      }
      if (err instanceof SessionExpiredError) {
        log.push('Session expired while checking availability.');
        return { events: [{ type: 'REQUIRES_USER_ACTION', reason: 'Session expired; reconnect to continue.' }], bookingRecord: null, retryAfterSeconds: null, log };
      }
      if (err instanceof RequiresUserActionError) {
        log.push(`Checking availability requires user action: ${err.reason}`);
        return { events: [{ type: 'REQUIRES_USER_ACTION', reason: err.reason }], bookingRecord: null, retryAfterSeconds: null, log };
      }
      throw err;
    }

    const eligible = slots.filter((slot) => {
      if (slot.currency !== rule.currency) return false;
      if (slot.price > rule.maxTotalPrice) return false;
      if (rule.surfacePreference !== 'no-preference' && slot.surface !== 'unknown' && slot.surface !== rule.surfacePreference) return false;
      if (candidate.courtIds !== 'any' && !candidate.courtIds.includes(slot.courtId)) return false;
      return true;
    });

    if (eligible.length === 0) {
      log.push(`No eligible slot yet for ${candidate.startTime} (checked ${slots.length} slot(s)).`);
      continue;
    }

    const chosen = eligible[0]!;
    log.push(`Eligible slot found: court ${chosen.courtName} at ${candidate.startTime} for ${chosen.price} ${chosen.currency}.`);

    const [activeCount, successfulForThisOccurrence] = await Promise.all([
      ctx.countProvider.countActiveBookingsForRule(rule.id),
      ctx.countProvider.countSuccessfulBookingsForOccurrence(occurrence.id)
    ]);
    if (successfulForThisOccurrence >= rule.maxSuccessfulBookingsPerOccurrence) {
      log.push('Skipped: this occurrence already has its allowed number of successful bookings.');
      return {
        events: [{ type: 'AVAILABILITY_FOUND' }, { type: 'SUBMIT_FAILED', reason: 'Occurrence already has the maximum allowed successful bookings.' }],
        bookingRecord: buildDraft(ctx, chosen, 'FAILED', null, 'Occurrence already has the maximum allowed successful bookings.'),
        retryAfterSeconds: null,
        log
      };
    }
    if (activeCount >= rule.maxFutureActiveBookings) {
      log.push('Skipped: this rule already has the maximum allowed future active bookings.');
      return {
        events: [{ type: 'AVAILABILITY_FOUND' }, { type: 'SUBMIT_FAILED', reason: 'Rule already has the maximum allowed future active bookings.' }],
        bookingRecord: buildDraft(ctx, chosen, 'FAILED', null, 'Rule already has the maximum allowed future active bookings.'),
        retryAfterSeconds: null,
        log
      };
    }

    if (adapter.capabilities.supportsReconciliation) {
      const existing = await adapter.findExistingBooking({
        clubId: ctx.clubId,
        intentId: occurrence.intentId,
        startUtc: chosen.startUtc,
        endUtc: chosen.endUtc
      });
      if (existing.found) {
        log.push('Found an existing matching booking before submitting; treating as already confirmed (no duplicate submission).');
        return {
          events: [{ type: 'AVAILABILITY_FOUND' }, { type: 'SUBMIT_CONFIRMED' }],
          bookingRecord: buildDraft(ctx, chosen, 'CONFIRMED', existing.bookingReference, null),
          retryAfterSeconds: null,
          log
        };
      }
    }

    const acquired = ctx.lockStore.tryAcquire(occurrence.id, ctx.workerId, ctx.clock.nowWallMs(), ctx.lockTtlMs);
    if (!acquired) {
      log.push('Another local worker already holds the execution lock for this occurrence; backing off.');
      return noneEvent(log);
    }

    try {
      const result = await adapter.submitBooking({
        clubId: ctx.clubId,
        courtId: chosen.courtId,
        startUtc: chosen.startUtc,
        endUtc: chosen.endUtc,
        maxTotalPrice: rule.maxTotalPrice,
        currency: rule.currency,
        intentId: occurrence.intentId
      });

      if (result.outcome === 'CONFIRMED') {
        ctx.lockStore.release(occurrence.id, ctx.workerId);
        log.push(`Booking confirmed: ${result.bookingReference ?? '(no reference returned)'}.`);
        return {
          events: [{ type: 'AVAILABILITY_FOUND' }, { type: 'SUBMIT_CONFIRMED' }],
          bookingRecord: buildDraft(ctx, chosen, 'CONFIRMED', result.bookingReference, null, result.price, result.currency),
          retryAfterSeconds: null,
          log
        };
      }

      ctx.lockStore.release(occurrence.id, ctx.workerId);
      const reason = result.failureReason ?? 'Submission failed for an unspecified reason.';
      log.push(`Submission failed for this candidate: ${reason}`);
      const takenLike = /taken|unavailable|no longer available|conflict/i.test(reason);
      if (takenLike) {
        // Spec: only try explicitly approved alternatives, never leave multiple
        // simultaneous holds. Since submitBooking already resolved (no hold left
        // open) we can safely move on to the next approved candidate, if any.
        continue;
      }
      return {
        events: [{ type: 'AVAILABILITY_FOUND' }, { type: 'SUBMIT_FAILED', reason }],
        bookingRecord: buildDraft(ctx, chosen, 'FAILED', null, reason),
        retryAfterSeconds: null,
        log
      };
    } catch (err) {
      if (err instanceof RequiresUserActionError) {
        log.push(`Submission requires user action: ${err.reason}`);
        // Lock is intentionally kept — no further automatic attempt may run
        // for this occurrence while a human-required step is outstanding.
        return {
          events: [{ type: 'AVAILABILITY_FOUND' }, { type: 'REQUIRES_USER_ACTION', reason: err.reason }],
          bookingRecord: buildDraft(ctx, chosen, 'AWAITING_USER_ACTION', null, err.reason),
          retryAfterSeconds: null,
          log
        };
      }
      // NetworkError, UnknownOutcomeError, RateLimitedError (on submit), or any
      // unexpected error: we cannot prove whether Playtomic processed the
      // request. Never retry submission blindly. Lock stays held until
      // reconciliation runs.
      const reason = err instanceof Error ? err.message : 'Unknown error during submission.';
      log.push(`Submission outcome unknown: ${reason}. Will require reconciliation before any further action.`);
      return {
        events: [{ type: 'AVAILABILITY_FOUND' }, { type: 'SUBMIT_TIMEOUT_UNKNOWN' }],
        bookingRecord: buildDraft(ctx, chosen, 'UNKNOWN', null, reason),
        retryAfterSeconds: null,
        log
      };
    }
  }

  log.push('No eligible slot observed across any approved candidate this attempt.');
  return noneEvent(log);
}

function buildDraft(
  ctx: PollContext,
  chosen: { courtId: string; courtName: string; startUtc: UtcIsoString; endUtc: UtcIsoString },
  outcome: BookingOutcome,
  bookingReference: string | null,
  failureReason: string | null,
  price: number | null = null,
  currency: string | null = null
): BookingRecordDraft {
  return {
    occurrenceId: ctx.occurrence.id,
    ruleId: ctx.rule.id,
    clubId: ctx.clubId,
    intentId: ctx.occurrence.intentId,
    outcome,
    bookingReference,
    courtId: chosen.courtId,
    courtName: chosen.courtName,
    startUtc: chosen.startUtc,
    endUtc: chosen.endUtc,
    price,
    currency,
    failureReason
  };
}

export interface PreflightContext {
  occurrence: Occurrence;
  rule: BookingRule;
  adapter: PlaytomicAdapter;
  clubUrl: string | null;
  /** Null means "no active authorization snapshot covers this rule" — preflight must fail closed. */
  authorizationValid: boolean;
  authorizationFailureReason: string | null;
}

export interface PreflightOutcome {
  event: OccurrenceEvent;
  log: string[];
}

/**
 * Validate everything that must be true before we are allowed to enter
 * WAITING_FOR_RELEASE: session state, authorization, and (for assisted mode)
 * that we have a confirmed club URL to open. Never submits anything.
 */
export async function runPreflight(ctx: PreflightContext): Promise<PreflightOutcome> {
  const log: string[] = [];

  if (!ctx.authorizationValid) {
    const reason = ctx.authorizationFailureReason ?? 'No valid authorization snapshot covers this rule.';
    log.push(`Preflight failed: ${reason}`);
    return { event: { type: 'PREFLIGHT_FAILED', reason }, log };
  }

  const session = await ctx.adapter.getSession();
  if (session.state === 'expired' || session.state === 'disconnected' || session.state === 'error') {
    log.push(`Preflight found session state "${session.state}"; user action required before release.`);
    return {
      event: { type: 'REQUIRES_USER_ACTION', reason: `Playtomic session is "${session.state}". Reconnect before the release time.` },
      log
    };
  }

  if (!ctx.adapter.capabilities.supportsAutomaticBooking && !ctx.clubUrl) {
    log.push('Preflight failed: assisted mode has no confirmed club URL.');
    return {
      event: { type: 'REQUIRES_USER_ACTION', reason: 'Confirm the club URL in Club Selection before the release time.' },
      log
    };
  }

  log.push('Preflight passed: session connected, authorization valid, club resolved.');
  return { event: { type: 'PREFLIGHT_PASSED' }, log };
}

export interface ReconcileContext {
  occurrence: Occurrence;
  rule: BookingRule;
  clubId: string;
  adapter: PlaytomicAdapter;
  lockStore: OccurrenceLockStore;
  workerId: string;
}

export interface ReconcileOutcome {
  event: OccurrenceEvent;
  bookingRecord: BookingRecordDraft | null;
  log: string[];
}

/** Attempt to resolve an UNKNOWN_OUTCOME occurrence by asking the adapter for an authoritative existing-booking check. */
export async function reconcileUnknownOutcome(ctx: ReconcileContext): Promise<ReconcileOutcome> {
  const log: string[] = [];
  if (!ctx.adapter.capabilities.supportsReconciliation) {
    ctx.lockStore.release(ctx.occurrence.id, ctx.workerId);
    log.push('Adapter does not support reconciliation; manual review required.');
    return {
      event: { type: 'RECONCILIATION_INCONCLUSIVE', reason: 'This adapter cannot verify booking/payment status automatically. Check your account manually.' },
      bookingRecord: null,
      log
    };
  }

  try {
    const existing = await ctx.adapter.findExistingBooking({
      clubId: ctx.clubId,
      intentId: ctx.occurrence.intentId,
      startUtc: ctx.occurrence.playStartUtc,
      endUtc: ctx.occurrence.playEndUtc
    });
    ctx.lockStore.release(ctx.occurrence.id, ctx.workerId);
    if (existing.found) {
      log.push(`Reconciliation found a matching booking: ${existing.bookingReference ?? '(reference unavailable)'}.`);
      return {
        event: { type: 'RECONCILED_CONFIRMED' },
        bookingRecord: {
          occurrenceId: ctx.occurrence.id,
          ruleId: ctx.rule.id,
          clubId: ctx.clubId,
          intentId: ctx.occurrence.intentId,
          outcome: 'CONFIRMED',
          bookingReference: existing.bookingReference,
          courtId: existing.courtId,
          courtName: null,
          startUtc: ctx.occurrence.playStartUtc,
          endUtc: ctx.occurrence.playEndUtc,
          price: existing.price,
          currency: existing.currency,
          failureReason: null
        },
        log
      };
    }
    log.push('Reconciliation confirmed no matching booking exists.');
    return {
      event: { type: 'RECONCILED_NOT_BOOKED', reason: 'Reconciliation confirmed the submission did not result in a booking.' },
      bookingRecord: null,
      log
    };
  } catch (err) {
    ctx.lockStore.release(ctx.occurrence.id, ctx.workerId);
    const reason = err instanceof Error ? err.message : 'Reconciliation failed for an unknown reason.';
    log.push(`Reconciliation inconclusive: ${reason}`);
    return {
      event: { type: 'RECONCILIATION_INCONCLUSIVE', reason },
      bookingRecord: null,
      log
    };
  }
}
