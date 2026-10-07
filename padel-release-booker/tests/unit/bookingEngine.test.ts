import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/core/time/clock.js';
import { assertMockNeverClaimsReal, createDefaultMockWorld, MockPlaytomicAdapter } from '../../src/core/adapters/mockAdapter.js';
import type { MockWorld } from '../../src/core/adapters/mockAdapter.js';
import { InMemoryOccurrenceLockStore } from '../../src/core/engine/duplicateGuard.js';
import { pollOccurrenceOnce, reconcileUnknownOutcome, runPreflight } from '../../src/core/engine/bookingEngine.js';
import type { BookingCountProvider, PollContext } from '../../src/core/engine/bookingEngine.js';
import { buildFictionalRule, buildOccurrence, FICTIONAL_CLUB } from '../helpers/fixtures.js';
import { AssistedPlaytomicAdapter } from '../../src/core/adapters/assistedAdapter.js';
import { RecordingNotifier } from '../../src/core/notifications/notifier.js';

const zeroCountProvider: BookingCountProvider = {
  countActiveBookingsForRule: async () => 0,
  countSuccessfulBookingsForOccurrence: async () => 0
};

function makeContext(
  overrides: Partial<PollContext> & { world?: MockWorld } = {}
): { ctx: PollContext; world: MockWorld; clock: FakeClock; lockStore: InMemoryOccurrenceLockStore } {
  const rule = buildFictionalRule();
  const occurrence = buildOccurrence(rule);
  const clock = new FakeClock(Date.parse(occurrence.releaseAtUtc));
  const world = overrides.world ?? createDefaultMockWorld();
  const adapter = new MockPlaytomicAdapter(world, clock);
  const lockStore = new InMemoryOccurrenceLockStore();
  const ctx: PollContext = {
    occurrence,
    rule,
    clubTimezone: FICTIONAL_CLUB.timezone,
    clubId: FICTIONAL_CLUB.id,
    clubName: FICTIONAL_CLUB.name,
    clubUrl: FICTIONAL_CLUB.sourceUrl,
    adapter,
    lockStore,
    countProvider: zeroCountProvider,
    clock,
    workerId: 'worker-1',
    lockTtlMs: 5 * 60_000,
    ...overrides
  };
  return { ctx, world, clock, lockStore };
}

const SLOT = {
  courtId: 'court-1',
  courtName: 'Court 1 (indoor)',
  surface: 'indoor' as const,
  startUtc: '2026-11-10T18:00:00.000Z',
  endUtc: '2026-11-10T19:30:00.000Z',
  price: 24,
  currency: 'EUR'
};

describe('mock adapter invariants', () => {
  it('never claims to touch the real service', () => {
    const { ctx } = makeContext();
    expect(() => assertMockNeverClaimsReal(ctx.adapter)).not.toThrow();
  });
});

describe('pollOccurrenceOnce — automatic (mock) path', () => {
  it('books immediately when the preferred slot is available precisely at release', async () => {
    const { ctx, world } = makeContext();
    world.getAvailability = () => ({ kind: 'ok', slots: [SLOT] });
    world.submitBooking = () => ({
      kind: 'confirmed',
      result: { outcome: 'CONFIRMED', bookingReference: 'MOCK-REF-1', price: 24, currency: 'EUR', failureReason: null }
    });

    const outcome = await pollOccurrenceOnce(ctx);
    expect(outcome.events.map((e) => e.type)).toEqual(['AVAILABILITY_FOUND', 'SUBMIT_CONFIRMED']);
    expect(outcome.bookingRecord?.outcome).toBe('CONFIRMED');
    expect(outcome.bookingRecord?.bookingReference).toBe('MOCK-REF-1');
  });

  it('keeps polling (no events) when slots have not appeared yet, then books once they do (appearing later than release)', async () => {
    const { ctx, world, clock } = makeContext();
    world.getAvailability = (_q, nowWallMs) => (nowWallMs < Date.parse('2026-11-03T07:00:30.000Z') ? { kind: 'ok', slots: [] } : { kind: 'ok', slots: [SLOT] });
    world.submitBooking = () => ({
      kind: 'confirmed',
      result: { outcome: 'CONFIRMED', bookingReference: 'MOCK-REF-2', price: 24, currency: 'EUR', failureReason: null }
    });

    const early = await pollOccurrenceOnce(ctx);
    expect(early.events).toEqual([]);

    clock.advanceBoth(30_000);
    const later = await pollOccurrenceOnce(ctx);
    expect(later.events.map((e) => e.type)).toEqual(['AVAILABILITY_FOUND', 'SUBMIT_CONFIRMED']);
  });

  it('falls back to the approved alternative when the preferred court is taken', async () => {
    const { ctx, world } = makeContext();
    ctx.rule = { ...ctx.rule, exactTimeOnly: false };

    world.getAvailability = (q) => {
      if (q.courtIds !== 'any' && q.courtIds.includes('court-1')) return { kind: 'ok', slots: [] };
      return { kind: 'ok', slots: [{ ...SLOT, courtId: 'court-2', startUtc: '2026-11-10T18:30:00.000Z', endUtc: '2026-11-10T20:00:00.000Z' }] };
    };
    world.submitBooking = (params) => ({
      kind: 'confirmed',
      result: { outcome: 'CONFIRMED', bookingReference: `MOCK-${params.courtId}`, price: 24, currency: 'EUR', failureReason: null }
    });

    const outcome = await pollOccurrenceOnce(ctx);
    expect(outcome.bookingRecord?.courtId).toBe('court-2');
    expect(outcome.bookingRecord?.bookingReference).toBe('MOCK-court-2');
  });

  it('expires with no booking attempt when no approved fallback is available and nothing matches', async () => {
    const { ctx, world } = makeContext();
    world.getAvailability = () => ({ kind: 'ok', slots: [] });
    const outcome = await pollOccurrenceOnce(ctx);
    expect(outcome.events).toEqual([]);
    expect(outcome.bookingRecord).toBeNull();
  });

  it('never attempts a booking when the only slot exceeds the price cap', async () => {
    const { ctx, world } = makeContext();
    world.getAvailability = () => ({ kind: 'ok', slots: [{ ...SLOT, price: 999 }] });
    let submitCalled = false;
    world.submitBooking = () => {
      submitCalled = true;
      return { kind: 'confirmed', result: { outcome: 'CONFIRMED', bookingReference: 'x', price: 999, currency: 'EUR', failureReason: null } };
    };
    const outcome = await pollOccurrenceOnce(ctx);
    expect(outcome.events).toEqual([]);
    expect(submitCalled).toBe(false);
  });

  it('never attempts a booking when the only slot has a mismatched currency', async () => {
    const { ctx, world } = makeContext();
    world.getAvailability = () => ({ kind: 'ok', slots: [{ ...SLOT, currency: 'USD' }] });
    let submitCalled = false;
    world.submitBooking = () => {
      submitCalled = true;
      return { kind: 'confirmed', result: { outcome: 'CONFIRMED', bookingReference: 'x', price: 24, currency: 'USD', failureReason: null } };
    };
    const outcome = await pollOccurrenceOnce(ctx);
    expect(outcome.events).toEqual([]);
    expect(submitCalled).toBe(false);
  });

  it('requires user action on a CAPTCHA/MFA/payment challenge during submission', async () => {
    const { ctx, world } = makeContext();
    world.getAvailability = () => ({ kind: 'ok', slots: [SLOT] });
    world.submitBooking = () => ({ kind: 'requires-user-action', reason: '3-D Secure confirmation required' });

    const outcome = await pollOccurrenceOnce(ctx);
    expect(outcome.events.map((e) => e.type)).toEqual(['AVAILABILITY_FOUND', 'REQUIRES_USER_ACTION']);
    expect(outcome.bookingRecord?.outcome).toBe('AWAITING_USER_ACTION');
  });

  it('respects rate limiting and reports Retry-After to the caller without booking', async () => {
    const { ctx, world } = makeContext();
    world.getAvailability = () => ({ kind: 'rate-limited', retryAfterSeconds: 12 });
    const outcome = await pollOccurrenceOnce(ctx);
    expect(outcome.events).toEqual([]);
    expect(outcome.retryAfterSeconds).toBe(12);
  });

  it('treats a network failure before submission as safely retryable (no state change)', async () => {
    const { ctx, world } = makeContext();
    world.getAvailability = () => ({ kind: 'network-error' });
    const outcome = await pollOccurrenceOnce(ctx);
    expect(outcome.events).toEqual([]);
    expect(outcome.bookingRecord).toBeNull();
  });

  it('marks UNKNOWN_OUTCOME — never a blind retry — when submission times out after possibly succeeding', async () => {
    const { ctx, world } = makeContext();
    world.getAvailability = () => ({ kind: 'ok', slots: [SLOT] });
    world.submitBooking = () => ({ kind: 'timeout-unknown' });

    const outcome = await pollOccurrenceOnce(ctx);
    expect(outcome.events.map((e) => e.type)).toEqual(['AVAILABILITY_FOUND', 'SUBMIT_TIMEOUT_UNKNOWN']);
    expect(outcome.bookingRecord?.outcome).toBe('UNKNOWN');
  });

  it('session expiry during checking requires user action, not a crash or silent retry', async () => {
    const { ctx, world } = makeContext();
    world.getAvailability = () => ({ kind: 'session-expired' });
    const outcome = await pollOccurrenceOnce(ctx);
    expect(outcome.events).toEqual([{ type: 'REQUIRES_USER_ACTION', reason: 'Session expired; reconnect to continue.' }]);
  });

  it('does not double-submit when a second local worker holds the occurrence lock', async () => {
    const { ctx, world, lockStore, clock } = makeContext();
    world.getAvailability = () => ({ kind: 'ok', slots: [SLOT] });
    let submitCount = 0;
    world.submitBooking = () => {
      submitCount += 1;
      return { kind: 'confirmed', result: { outcome: 'CONFIRMED', bookingReference: 'x', price: 24, currency: 'EUR', failureReason: null } };
    };
    // Simulate a second competing worker already holding the lock.
    lockStore.tryAcquire(ctx.occurrence.id, 'worker-2', clock.nowWallMs(), 5 * 60_000);

    const outcome = await pollOccurrenceOnce(ctx);
    expect(outcome.events).toEqual([]);
    expect(submitCount).toBe(0);
  });

  it('skips submission once maxSuccessfulBookingsPerOccurrence is already reached', async () => {
    const { ctx, world } = makeContext({ countProvider: { countActiveBookingsForRule: async () => 0, countSuccessfulBookingsForOccurrence: async () => 1 } });
    world.getAvailability = () => ({ kind: 'ok', slots: [SLOT] });
    let submitCalled = false;
    world.submitBooking = () => {
      submitCalled = true;
      return { kind: 'confirmed', result: { outcome: 'CONFIRMED', bookingReference: 'x', price: 24, currency: 'EUR', failureReason: null } };
    };
    const outcome = await pollOccurrenceOnce(ctx);
    expect(submitCalled).toBe(false);
    expect(outcome.events.map((e) => e.type)).toEqual(['AVAILABILITY_FOUND', 'SUBMIT_FAILED']);
  });

  it('skips submission once maxFutureActiveBookings for the rule is already reached', async () => {
    const { ctx, world } = makeContext({ countProvider: { countActiveBookingsForRule: async () => 99, countSuccessfulBookingsForOccurrence: async () => 0 } });
    world.getAvailability = () => ({ kind: 'ok', slots: [SLOT] });
    const outcome = await pollOccurrenceOnce(ctx);
    expect(outcome.events.map((e) => e.type)).toEqual(['AVAILABILITY_FOUND', 'SUBMIT_FAILED']);
    expect(outcome.bookingRecord?.failureReason).toMatch(/future active bookings/);
  });

  it('detects a pre-existing matching booking and avoids a duplicate submission', async () => {
    const { ctx, world } = makeContext();
    world.getAvailability = () => ({ kind: 'ok', slots: [SLOT] });
    world.existingBooking = { found: true, bookingReference: 'ALREADY-BOOKED', courtId: 'court-1', price: 24, currency: 'EUR' };
    let submitCalled = false;
    world.submitBooking = () => {
      submitCalled = true;
      return { kind: 'confirmed', result: { outcome: 'CONFIRMED', bookingReference: 'x', price: 24, currency: 'EUR', failureReason: null } };
    };
    const outcome = await pollOccurrenceOnce(ctx);
    expect(submitCalled).toBe(false);
    expect(outcome.bookingRecord?.bookingReference).toBe('ALREADY-BOOKED');
  });
});

describe('pollOccurrenceOnce — assisted path', () => {
  it('opens the booking page, notifies, and hands off to the user instead of checking/booking automatically', async () => {
    const notifier = new RecordingNotifier();
    const openedUrls: string[] = [];
    const assistedAdapter = new AssistedPlaytomicAdapter(
      { open: async (url) => { openedUrls.push(url); } },
      notifier,
      { get: () => ({ mode: 'assisted', state: 'connected', accountLabel: 'me', connectedAtUtc: null, expiresAtUtc: null, lastError: null }), set: () => {} }
    );
    const { ctx } = makeContext({ adapter: assistedAdapter });

    const outcome = await pollOccurrenceOnce(ctx);
    expect(openedUrls).toEqual([FICTIONAL_CLUB.sourceUrl]);
    expect(notifier.sent).toHaveLength(1);
    expect(outcome.events).toEqual([{ type: 'REQUIRES_USER_ACTION', reason: 'Assisted mode: complete the booking in your browser, then record the outcome.' }]);
  });
});

describe('reconcileUnknownOutcome', () => {
  it('reconciles to CONFIRMED when an authoritative check finds the booking', async () => {
    const { ctx, world, lockStore } = makeContext();
    world.existingBooking = { found: true, bookingReference: 'REF-RECONCILED', courtId: 'court-1', price: 24, currency: 'EUR' };
    lockStore.tryAcquire(ctx.occurrence.id, ctx.workerId, ctx.clock.nowWallMs(), 60_000);

    const result = await reconcileUnknownOutcome({ occurrence: ctx.occurrence, rule: ctx.rule, clubId: ctx.clubId, adapter: ctx.adapter, lockStore, workerId: ctx.workerId });
    expect(result.event).toEqual({ type: 'RECONCILED_CONFIRMED' });
    expect(result.bookingRecord?.bookingReference).toBe('REF-RECONCILED');
    expect(lockStore.isHeldByOther(ctx.occurrence.id, 'someone-else', ctx.clock.nowWallMs())).toBe(false);
  });

  it('reconciles to FAILED (not booked) when an authoritative check finds nothing', async () => {
    const { ctx, lockStore } = makeContext();
    const result = await reconcileUnknownOutcome({ occurrence: ctx.occurrence, rule: ctx.rule, clubId: ctx.clubId, adapter: ctx.adapter, lockStore, workerId: ctx.workerId });
    expect(result.event.type).toBe('RECONCILED_NOT_BOOKED');
  });

  it('requires manual review when the adapter cannot reconcile at all', async () => {
    const { ctx, lockStore } = makeContext({ adapter: new AssistedPlaytomicAdapter({ open: async () => {} }, new RecordingNotifier(), { get: () => ({ mode: 'assisted', state: 'connected', accountLabel: null, connectedAtUtc: null, expiresAtUtc: null, lastError: null }), set: () => {} }) });
    const result = await reconcileUnknownOutcome({ occurrence: ctx.occurrence, rule: ctx.rule, clubId: ctx.clubId, adapter: ctx.adapter, lockStore, workerId: ctx.workerId });
    expect(result.event.type).toBe('RECONCILIATION_INCONCLUSIVE');
  });
});

describe('runPreflight', () => {
  it('passes when session is connected and authorization is valid', async () => {
    const { ctx } = makeContext();
    const result = await runPreflight({ occurrence: ctx.occurrence, rule: ctx.rule, adapter: ctx.adapter, clubUrl: ctx.clubUrl, authorizationValid: true, authorizationFailureReason: null });
    expect(result.event).toEqual({ type: 'PREFLIGHT_PASSED' });
  });

  it('fails closed when there is no valid authorization', async () => {
    const { ctx } = makeContext();
    const result = await runPreflight({ occurrence: ctx.occurrence, rule: ctx.rule, adapter: ctx.adapter, clubUrl: ctx.clubUrl, authorizationValid: false, authorizationFailureReason: 'Rule changed since last authorization.' });
    expect(result.event.type).toBe('PREFLIGHT_FAILED');
  });

  it('requires user action when the session is expired ahead of release', async () => {
    const { ctx, world } = makeContext();
    world.session = { ...world.session, state: 'expired' };
    const result = await runPreflight({ occurrence: ctx.occurrence, rule: ctx.rule, adapter: ctx.adapter, clubUrl: ctx.clubUrl, authorizationValid: true, authorizationFailureReason: null });
    expect(result.event.type).toBe('REQUIRES_USER_ACTION');
  });
});
