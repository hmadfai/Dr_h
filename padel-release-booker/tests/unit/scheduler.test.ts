import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/core/time/clock.js';
import { Scheduler } from '../../src/core/engine/scheduler.js';
import type { SchedulableOccurrence, SchedulerCallbacks } from '../../src/core/engine/scheduler.js';

/**
 * FakeClock fires timers synchronously, but the scheduler's tick() is async
 * (it awaits callbacks) and re-schedules its own next timer only once its
 * promise chain resolves. A single large `advanceBoth()` call will only ever
 * fire the *first* currently-registered timer, because later timers in the
 * chain don't exist yet at the moment `advanceBoth` evaluates due timers —
 * they are only created after the async chain for the previous tick settles.
 *
 * `advanceTicks` mirrors how the real scheduler actually runs: advance by
 * one heartbeat interval, let that tick's promise chain fully resolve (which
 * is also when it schedules its own next timer), then repeat. This is slower
 * to write than one big jump but is the only way to correctly simulate
 * multiple heartbeats with a fake clock.
 */
async function flushMicrotasks(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

async function advanceTicks(clock: FakeClock, totalMs: number, stepMs: number): Promise<void> {
  let remaining = totalMs;
  while (remaining > 0) {
    const step = Math.min(stepMs, remaining);
    clock.advanceBoth(step);
    await flushMicrotasks();
    remaining -= step;
  }
}

/** For sleep/wake scenarios: the clock already jumped via simulateSleep; just let the one resulting immediate tick resolve. */
async function settleImmediateTick(clock: FakeClock): Promise<void> {
  clock.flushDueTimers();
  await flushMicrotasks();
}

function occ(overrides: Partial<SchedulableOccurrence> = {}): SchedulableOccurrence {
  return {
    id: 'occ-1',
    status: 'ARMED',
    releaseAtUtc: '2026-11-03T07:00:00.000Z',
    preflightMinutesBeforeRelease: 5,
    pollingWindowSeconds: 90,
    pollingIntervalSeconds: 10,
    ...overrides
  };
}

function makeCallbacks(initial: SchedulableOccurrence) {
  let current = initial;
  const calls: string[] = [];
  const callbacks: SchedulerCallbacks = {
    listActiveOccurrences: async () => [current],
    onPreflightDue: async () => {
      calls.push('preflight');
      current = { ...current, status: 'WAITING_FOR_RELEASE' };
    },
    onReleaseReached: async () => {
      calls.push('release');
      current = { ...current, status: 'CHECKING' };
    },
    onPollTick: async () => {
      calls.push('poll');
      return { retryAfterSeconds: null };
    },
    onPollingWindowExpired: async () => {
      calls.push('expired');
      current = { ...current, status: 'EXPIRED' };
    },
    onMissedWhileAsleep: async () => {
      calls.push('missed');
      current = { ...current, status: 'EXPIRED' };
    }
  };
  return { callbacks, calls };
}

describe('Scheduler', () => {
  it('fires preflight, then release, then polls repeatedly, then expires the polling window', async () => {
    const releaseAtMs = Date.parse('2026-11-03T07:00:00.000Z');
    const clock = new FakeClock(releaseAtMs - 10 * 60_000); // 10 min before release
    const { callbacks, calls } = makeCallbacks(occ());
    const tickIntervalMs = 5_000;
    const scheduler = new Scheduler(clock, { tickIntervalMs, catchUpWindowSeconds: 300 }, callbacks);

    scheduler.start();
    await settleImmediateTick(clock);
    expect(calls).toEqual([]);

    // Cross the preflight threshold (5 min before release).
    await advanceTicks(clock, 5 * 60_000 + tickIntervalMs, tickIntervalMs);
    expect(calls).toContain('preflight');

    // Cross release time.
    await advanceTicks(clock, 5 * 60_000, tickIntervalMs);
    expect(calls).toContain('release');

    // Poll repeatedly within the 90s polling window (10s interval -> several polls).
    await advanceTicks(clock, 60_000, tickIntervalMs);
    const pollCount = calls.filter((c) => c === 'poll').length;
    expect(pollCount).toBeGreaterThan(1);

    // Beyond the 90s polling window -> expired.
    await advanceTicks(clock, 60_000, tickIntervalMs);
    expect(calls).toContain('expired');

    scheduler.stop();
  });

  it('honors a Retry-After hint by delaying the next poll instead of polling on the normal interval', async () => {
    const releaseAtMs = Date.parse('2026-11-03T07:00:00.000Z');
    const clock = new FakeClock(releaseAtMs);
    let callCount = 0;
    const tickIntervalMs = 1_000;
    const callbacks: SchedulerCallbacks = {
      listActiveOccurrences: async () => [occ({ status: 'CHECKING', pollingWindowSeconds: 90, pollingIntervalSeconds: 5 })],
      onPreflightDue: async () => {},
      onReleaseReached: async () => {},
      onPollTick: async () => {
        callCount += 1;
        // First call gets rate-limited for 40s; subsequent calls use the normal interval.
        return { retryAfterSeconds: callCount === 1 ? 40 : null };
      },
      onPollingWindowExpired: async () => {},
      onMissedWhileAsleep: async () => {}
    };
    const scheduler = new Scheduler(clock, { tickIntervalMs, catchUpWindowSeconds: 300 }, callbacks);
    scheduler.start();
    await settleImmediateTick(clock); // first poll happens immediately
    expect(callCount).toBe(1);

    await advanceTicks(clock, 10_000, tickIntervalMs); // within the 40s retry-after window: no second poll yet
    expect(callCount).toBe(1);

    await advanceTicks(clock, 33_000, tickIntervalMs); // now past the 40s retry-after window, before the next 5s-interval poll would be due
    expect(callCount).toBe(2);
    scheduler.stop();
  });

  it('marks an occurrence missed when the Mac was asleep well past the catch-up window', async () => {
    const releaseAtMs = Date.parse('2026-11-03T07:00:00.000Z');
    const clock = new FakeClock(releaseAtMs - 60_000); // 1 min before release
    const { callbacks, calls } = makeCallbacks(occ({ status: 'WAITING_FOR_RELEASE' }));
    const scheduler = new Scheduler(clock, { tickIntervalMs: 1000, catchUpWindowSeconds: 120 }, callbacks);
    scheduler.start();
    await settleImmediateTick(clock);

    // Simulate the Mac sleeping for 2 hours, spanning release and the catch-up window entirely.
    clock.simulateSleep(2 * 60 * 60_000);
    scheduler.triggerImmediateTick();
    await settleImmediateTick(clock);

    expect(calls).toContain('missed');
    expect(calls).not.toContain('release');
    scheduler.stop();
  });

  it('still attempts a catch-up check when woken shortly after release, within the catch-up window', async () => {
    const releaseAtMs = Date.parse('2026-11-03T07:00:00.000Z');
    const clock = new FakeClock(releaseAtMs - 60_000);
    const { callbacks, calls } = makeCallbacks(occ({ status: 'WAITING_FOR_RELEASE' }));
    const scheduler = new Scheduler(clock, { tickIntervalMs: 1000, catchUpWindowSeconds: 300 }, callbacks);
    scheduler.start();
    await settleImmediateTick(clock);

    // Sleep for 90s, past release (which was 60s away) but well within the 300s catch-up window.
    clock.simulateSleep(90_000);
    scheduler.triggerImmediateTick();
    await settleImmediateTick(clock);

    expect(calls).toContain('release');
    expect(calls).not.toContain('missed');
    scheduler.stop();
  });

  it('does not act on PAUSED or terminal occurrences', async () => {
    const clock = new FakeClock(Date.parse('2026-11-03T07:00:00.000Z'));
    const calls: string[] = [];
    const callbacks: SchedulerCallbacks = {
      listActiveOccurrences: async () => [], // a real repository would already exclude PAUSED/terminal rows
      onPreflightDue: async () => {
        calls.push('preflight');
      },
      onReleaseReached: async () => {
        calls.push('release');
      },
      onPollTick: async () => {
        calls.push('poll');
        return { retryAfterSeconds: null };
      },
      onPollingWindowExpired: async () => {
        calls.push('expired');
      },
      onMissedWhileAsleep: async () => {
        calls.push('missed');
      }
    };
    const scheduler = new Scheduler(clock, { tickIntervalMs: 1000, catchUpWindowSeconds: 300 }, callbacks);
    scheduler.start();
    await advanceTicks(clock, 10_000, 1000);
    expect(calls).toEqual([]);
    scheduler.stop();
  });
});
