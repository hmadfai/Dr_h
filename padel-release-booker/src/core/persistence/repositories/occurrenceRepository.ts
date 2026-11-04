import type { AppDatabase } from '../db.js';
import type { Occurrence, OccurrenceStatus } from '../../domain/types.js';
import type { SchedulableOccurrence, SchedulableStatus } from '../../engine/scheduler.js';

interface OccurrenceRow {
  id: string;
  rule_id: string;
  play_date: string;
  play_start_utc: string;
  play_end_utc: string;
  release_at_utc: string;
  status: OccurrenceStatus;
  paused_from_status: OccurrenceStatus | null;
  terminal_reason: string | null;
  intent_id: string;
  locked_by_worker_id: string | null;
  lock_expires_at_utc: string | null;
  created_at_utc: string;
  updated_at_utc: string;
}

function rowToOccurrence(row: OccurrenceRow): Occurrence {
  return {
    id: row.id,
    ruleId: row.rule_id,
    playDate: row.play_date,
    playStartUtc: row.play_start_utc,
    playEndUtc: row.play_end_utc,
    releaseAtUtc: row.release_at_utc,
    status: row.status,
    pausedFromStatus: row.paused_from_status,
    terminalReason: row.terminal_reason,
    intentId: row.intent_id,
    lockedByWorkerId: row.locked_by_worker_id,
    lockExpiresAtUtc: row.lock_expires_at_utc,
    createdAtUtc: row.created_at_utc,
    updatedAtUtc: row.updated_at_utc
  };
}

const ACTIVE_STATUSES: OccurrenceStatus[] = ['ARMED', 'WAITING_FOR_RELEASE', 'CHECKING', 'PREFLIGHT'];

export class OccurrenceRepository {
  constructor(private readonly db: AppDatabase) {}

  insert(occurrence: Occurrence): void {
    this.db
      .prepare(
        `INSERT INTO occurrences (
           id, rule_id, play_date, play_start_utc, play_end_utc, release_at_utc, status,
           paused_from_status, terminal_reason, intent_id, locked_by_worker_id, lock_expires_at_utc,
           created_at_utc, updated_at_utc
         ) VALUES (
           @id, @ruleId, @playDate, @playStartUtc, @playEndUtc, @releaseAtUtc, @status,
           @pausedFromStatus, @terminalReason, @intentId, @lockedByWorkerId, @lockExpiresAtUtc,
           @createdAtUtc, @updatedAtUtc
         )`
      )
      .run(occurrence);
  }

  getById(id: string): Occurrence | null {
    const row = this.db.prepare('SELECT * FROM occurrences WHERE id = ?').get(id) as OccurrenceRow | undefined;
    return row ? rowToOccurrence(row) : null;
  }

  findByRuleAndPlayDate(ruleId: string, playDate: string): Occurrence | null {
    const row = this.db
      .prepare('SELECT * FROM occurrences WHERE rule_id = ? AND play_date = ?')
      .get(ruleId, playDate) as OccurrenceRow | undefined;
    return row ? rowToOccurrence(row) : null;
  }

  listByRule(ruleId: string): Occurrence[] {
    const rows = this.db.prepare('SELECT * FROM occurrences WHERE rule_id = ? ORDER BY play_date').all(ruleId) as OccurrenceRow[];
    return rows.map(rowToOccurrence);
  }

  updateStatus(id: string, status: OccurrenceStatus, pausedFromStatus: OccurrenceStatus | null, terminalReason: string | null, nowUtc: string): void {
    this.db
      .prepare('UPDATE occurrences SET status = ?, paused_from_status = ?, terminal_reason = ?, updated_at_utc = ? WHERE id = ?')
      .run(status, pausedFromStatus, terminalReason, nowUtc, id);
  }

  /**
   * Occurrences the scheduler should evaluate: active automatic states, plus
   * rules that are not paused. Joins booking_rules to exclude occurrences
   * whose rule has been globally paused (emergency stop / per-rule pause) and
   * to pull the per-rule timing fields the scheduler needs.
   */
  listSchedulable(): SchedulableOccurrence[] {
    const placeholders = ACTIVE_STATUSES.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT o.id, o.status, o.release_at_utc, r.preflight_minutes_before_release, r.polling_window_seconds, r.polling_interval_seconds
         FROM occurrences o
         JOIN booking_rules r ON r.id = o.rule_id
         WHERE o.status IN (${placeholders}) AND r.is_paused = 0`
      )
      .all(...ACTIVE_STATUSES) as {
      id: string;
      status: SchedulableStatus;
      release_at_utc: string;
      preflight_minutes_before_release: number;
      polling_window_seconds: number;
      polling_interval_seconds: number;
    }[];
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      releaseAtUtc: r.release_at_utc,
      preflightMinutesBeforeRelease: r.preflight_minutes_before_release,
      pollingWindowSeconds: r.polling_window_seconds,
      pollingIntervalSeconds: r.polling_interval_seconds
    }));
  }

  countActiveForRule(ruleId: string, nowUtc: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as c FROM booking_records b
         JOIN occurrences o ON o.id = b.occurrence_id
         WHERE b.rule_id = ? AND b.outcome = 'CONFIRMED' AND o.play_start_utc > ?`
      )
      .get(ruleId, nowUtc) as { c: number };
    return row.c;
  }

  countSuccessfulForOccurrence(occurrenceId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as c FROM booking_records WHERE occurrence_id = ? AND outcome = 'CONFIRMED'`)
      .get(occurrenceId) as { c: number };
    return row.c;
  }
}
