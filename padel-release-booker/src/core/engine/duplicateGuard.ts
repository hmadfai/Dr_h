/**
 * Per-occurrence execution lock. This guarantees at most one local worker
 * (within this app, or — if you ever ran two copies — across copies sharing
 * the same database file) is actively attempting a booking for a given
 * occurrence at a time.
 *
 * IMPORTANT (see spec section 6): this local lock does **not** guarantee
 * exactly-once execution against Playtomic itself. A submission can still
 * reach Playtomic's servers and then the HTTP response can be lost (timeout,
 * crash, network drop) — the lock only prevents *this app* from racing
 * itself; it cannot prevent a successful-but-unconfirmed remote booking from
 * being retried blindly. That is why `submitBooking` failures are mapped to
 * UNKNOWN_OUTCOME + reconciliation rather than "lock released, try again".
 */

export interface OccurrenceLockStore {
  /** Returns true if the lock was acquired (or renewed by the same worker), false if held by another live worker. */
  tryAcquire(occurrenceId: string, workerId: string, nowWallMs: number, ttlMs: number): boolean;
  release(occurrenceId: string, workerId: string): void;
  isHeldByOther(occurrenceId: string, workerId: string, nowWallMs: number): boolean;
}

interface LockRow {
  workerId: string;
  expiresAtMs: number;
}

export class InMemoryOccurrenceLockStore implements OccurrenceLockStore {
  private readonly locks = new Map<string, LockRow>();

  tryAcquire(occurrenceId: string, workerId: string, nowWallMs: number, ttlMs: number): boolean {
    const existing = this.locks.get(occurrenceId);
    if (existing && existing.workerId !== workerId && existing.expiresAtMs > nowWallMs) {
      return false;
    }
    this.locks.set(occurrenceId, { workerId, expiresAtMs: nowWallMs + ttlMs });
    return true;
  }

  release(occurrenceId: string, workerId: string): void {
    const existing = this.locks.get(occurrenceId);
    if (existing && existing.workerId === workerId) {
      this.locks.delete(occurrenceId);
    }
  }

  isHeldByOther(occurrenceId: string, workerId: string, nowWallMs: number): boolean {
    const existing = this.locks.get(occurrenceId);
    return !!existing && existing.workerId !== workerId && existing.expiresAtMs > nowWallMs;
  }
}
