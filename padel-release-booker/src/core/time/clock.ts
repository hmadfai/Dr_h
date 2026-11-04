/**
 * Clock abstraction. The booking engine must never call `Date.now()` or
 * `setTimeout` directly so that:
 *  - tests can inject a fake clock and simulate release timestamps, sleep/wake,
 *    and DST transitions deterministically;
 *  - production code can distinguish short-duration waits (which should use a
 *    monotonic clock, immune to wall-clock jumps) from schedule evaluation
 *    (which must always re-read wall-clock time, because the wall clock is
 *    the only thing that matters for "has the release moment arrived?").
 */

export interface Clock {
  /** Wall-clock "now", in epoch milliseconds. Can jump forward/back (NTP sync, timezone change, sleep/wake). */
  nowWallMs(): number;
  /** Monotonic "now", in milliseconds, immune to wall-clock adjustments. Only meaningful as a delta between two calls. */
  nowMonotonicMs(): number;
  /**
   * Schedule `fn` to run after at most `ms` of monotonic time, but the caller
   * is expected to re-validate wall-clock conditions when it fires, because a
   * long wait (e.g. "sleep until release") may span system sleep, in which
   * case most platforms simply delay the timer rather than firing it on time.
   */
  setTimer(fn: () => void, ms: number): TimerHandle;
  clearTimer(handle: TimerHandle): void;
}

export type TimerHandle = { readonly __brand: 'TimerHandle' };

export class SystemClock implements Clock {
  nowWallMs(): number {
    return Date.now();
  }

  nowMonotonicMs(): number {
    return performance.now();
  }

  setTimer(fn: () => void, ms: number): TimerHandle {
    const t = setTimeout(fn, Math.max(0, ms));
    return t as unknown as TimerHandle;
  }

  clearTimer(handle: TimerHandle): void {
    clearTimeout(handle as unknown as NodeJS.Timeout);
  }
}

/**
 * Deterministic clock for tests. Time only advances when `advance()` is
 * called; timers fire in monotonic order. Useful for simulating "the app was
 * asleep for 6 hours and release time passed" by jumping wall time without
 * jumping monotonic time (sleep), or jumping both (normal elapsed time).
 */
export class FakeClock implements Clock {
  private wallMs: number;
  private monotonicMs = 0;
  private nextHandle = 1;
  private readonly timers = new Map<number, { dueMonotonicMs: number; fn: () => void }>();

  constructor(initialWallMs: number) {
    this.wallMs = initialWallMs;
  }

  nowWallMs(): number {
    return this.wallMs;
  }

  nowMonotonicMs(): number {
    return this.monotonicMs;
  }

  setTimer(fn: () => void, ms: number): TimerHandle {
    const handle = this.nextHandle++;
    this.timers.set(handle, { dueMonotonicMs: this.monotonicMs + Math.max(0, ms), fn });
    return { __brand: 'TimerHandle', handle } as unknown as TimerHandle;
  }

  clearTimer(handle: TimerHandle): void {
    const h = (handle as unknown as { handle: number }).handle;
    this.timers.delete(h);
  }

  /** Advance both monotonic and wall time together by `ms` (normal elapsed time), firing due timers in order. */
  advanceBoth(ms: number): void {
    const target = this.monotonicMs + ms;
    while (true) {
      const due = [...this.timers.entries()]
        .filter(([, t]) => t.dueMonotonicMs <= target)
        .sort((a, b) => a[1].dueMonotonicMs - b[1].dueMonotonicMs);
      const next = due[0];
      if (!next) break;
      const [handle, timer] = next;
      this.timers.delete(handle);
      const delta = timer.dueMonotonicMs - this.monotonicMs;
      this.monotonicMs += delta;
      this.wallMs += delta;
      timer.fn();
    }
    const remaining = target - this.monotonicMs;
    this.monotonicMs = target;
    this.wallMs += remaining;
  }

  /**
   * Simulate the Mac sleeping: wall-clock jumps forward by `ms` (real-world
   * elapsed time) but monotonic time does not advance, and no timers fire
   * during the jump — exactly like a laptop lid being closed. Callers that
   * poll wall-clock conditions on their next tick will see the jump; timers
   * scheduled purely on monotonic duration will not fire until real
   * (post-wake) monotonic time catches up.
   */
  simulateSleep(ms: number): void {
    this.wallMs += ms;
  }

  /** Fire any timers currently due, without advancing time further. */
  flushDueTimers(): void {
    while (true) {
      const due = [...this.timers.entries()].filter(([, t]) => t.dueMonotonicMs <= this.monotonicMs);
      if (due.length === 0) break;
      for (const [handle, timer] of due) {
        this.timers.delete(handle);
        timer.fn();
      }
    }
  }
}
