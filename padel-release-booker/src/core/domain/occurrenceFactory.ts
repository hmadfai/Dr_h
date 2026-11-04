import { randomUUID } from 'node:crypto';
import type { BookingRule, Occurrence } from './types.js';
import { planUpcomingOccurrences, type OccurrencePlanWarning } from '../time/releaseSchedule.js';

export interface BuiltOccurrence {
  occurrence: Occurrence;
  warnings: OccurrencePlanWarning[];
}

/**
 * Deterministically build the next occurrence(s) for a rule that do not
 * already exist, given the current wall-clock "now" and the club timezone.
 * Idempotent: if an occurrence already exists for a given play date (unique
 * constraint on (rule_id, play_date) in SQLite), callers should skip
 * creating a duplicate — `intentId` only matters for brand-new rows.
 */
export function buildUpcomingOccurrences(rule: BookingRule, timezone: string, fromIsoDate: string, count: number, nowUtc: string): BuiltOccurrence[] {
  const plan = planUpcomingOccurrences(
    {
      playDatePattern: rule.playDate,
      preferredStartTime: rule.preferredStartTime,
      durationMinutes: rule.durationMinutes,
      release: rule.release,
      timezone,
      ambiguousLocalTimePolicy: rule.ambiguousLocalTimePolicy,
      nonexistentLocalTimePolicy: rule.nonexistentLocalTimePolicy,
      exclusionDates: rule.exclusionDates
    },
    fromIsoDate,
    count
  );

  return plan.map((entry) => ({
    occurrence: {
      id: randomUUID(),
      ruleId: rule.id,
      playDate: entry.playDate,
      playStartUtc: entry.playStartUtc,
      playEndUtc: entry.playEndUtc,
      releaseAtUtc: entry.releaseAtUtc,
      status: 'DRAFT',
      pausedFromStatus: null,
      terminalReason: null,
      intentId: randomUUID(),
      lockedByWorkerId: null,
      lockExpiresAtUtc: null,
      createdAtUtc: nowUtc,
      updatedAtUtc: nowUtc
    },
    warnings: entry.warnings
  }));
}
