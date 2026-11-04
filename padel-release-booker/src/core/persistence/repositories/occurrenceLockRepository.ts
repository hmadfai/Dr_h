import type { AppDatabase } from '../db.js';
import type { OccurrenceLockStore } from '../../engine/duplicateGuard.js';

/**
 * Durable, cross-process-safe version of the in-memory lock store, backed by
 * SQLite so a lock survives an app restart (important: if the app crashes
 * mid-BOOKING, we do not want a fresh process to immediately retry
 * submission for the same occurrence before reconciliation has run).
 */
export class SqliteOccurrenceLockStore implements OccurrenceLockStore {
  constructor(private readonly db: AppDatabase) {}

  tryAcquire(occurrenceId: string, workerId: string, nowWallMs: number, ttlMs: number): boolean {
    const tx = this.db.transaction((): boolean => {
      const row = this.db.prepare('SELECT worker_id, expires_at_ms FROM occurrence_locks WHERE occurrence_id = ?').get(occurrenceId) as
        | { worker_id: string; expires_at_ms: number }
        | undefined;

      if (row && row.worker_id !== workerId && row.expires_at_ms > nowWallMs) {
        return false;
      }
      this.db
        .prepare(
          `INSERT INTO occurrence_locks (occurrence_id, worker_id, expires_at_ms) VALUES (?, ?, ?)
           ON CONFLICT(occurrence_id) DO UPDATE SET worker_id = excluded.worker_id, expires_at_ms = excluded.expires_at_ms`
        )
        .run(occurrenceId, workerId, nowWallMs + ttlMs);
      return true;
    });
    return tx();
  }

  release(occurrenceId: string, workerId: string): void {
    this.db.prepare('DELETE FROM occurrence_locks WHERE occurrence_id = ? AND worker_id = ?').run(occurrenceId, workerId);
  }

  isHeldByOther(occurrenceId: string, workerId: string, nowWallMs: number): boolean {
    const row = this.db.prepare('SELECT worker_id, expires_at_ms FROM occurrence_locks WHERE occurrence_id = ?').get(occurrenceId) as
      | { worker_id: string; expires_at_ms: number }
      | undefined;
    return !!row && row.worker_id !== workerId && row.expires_at_ms > nowWallMs;
  }
}
