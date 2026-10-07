/**
 * Timezone-aware calendar arithmetic for play dates and release timestamps.
 *
 * Design rules this module enforces (see spec section 5):
 *  - Timestamps are always stored/returned in UTC; club-local time is only
 *    used transiently to resolve a *specific* calendar date + time-of-day
 *    into a UTC instant.
 *  - "N days before" is calendar-day arithmetic (Y/M/D minus N days), never a
 *    fixed `N * 86400` second/millisecond offset — that would be wrong across
 *    a DST transition.
 *  - Ambiguous local times (the repeated hour when clocks fall back) and
 *    nonexistent local times (the skipped hour when clocks spring forward)
 *    are detected explicitly, not left to whatever a date library happens to
 *    default to, and are resolved according to an explicit, user-visible
 *    policy.
 */

import { DateTime, IANAZone } from 'luxon';
import type {
  FallbackOption,
  IsoDate,
  LocalTimeOfDay,
  PlayDatePattern,
  Weekday,
  AmbiguousLocalTimePolicy,
  NonexistentLocalTimePolicy,
  ReleaseRule,
  UtcIsoString
} from '../domain/types.js';
import { ALL_WEEKDAYS } from '../domain/types.js';

export interface LocalTimeResolution {
  utc: UtcIsoString;
  /**
   * 'unambiguous': the local time maps to exactly one UTC instant, the normal case.
   * 'ambiguous-resolved': the local time occurs twice (DST fall-back); resolved per policy.
   * 'nonexistent-resolved': the local time does not occur that day (DST spring-forward gap); resolved per policy.
   */
  kind: 'unambiguous' | 'ambiguous-resolved' | 'nonexistent-resolved';
}

function parseIsoDate(date: IsoDate): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid ISO date: ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function parseLocalTime(time: LocalTimeOfDay): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new Error(`Invalid local time of day: ${time}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`Invalid local time of day: ${time}`);
  return { hour, minute };
}

/**
 * Resolve a club-local calendar date + time-of-day into a UTC instant,
 * explicitly handling DST ambiguity/nonexistence. See module doc for the
 * detection algorithm.
 */
export function resolveLocalTimeToUtc(
  date: IsoDate,
  time: LocalTimeOfDay,
  timezone: string,
  ambiguousPolicy: AmbiguousLocalTimePolicy,
  nonexistentPolicy: NonexistentLocalTimePolicy
): LocalTimeResolution {
  const { year, month, day } = parseIsoDate(date);
  const { hour, minute } = parseLocalTime(time);
  const zone = IANAZone.create(timezone);
  if (!zone.isValid) throw new Error(`Invalid IANA timezone: ${timezone}`);

  // Anchor: treat the requested wall-clock fields as if they were UTC, purely
  // as a numeric seed for offset lookups. This value is never itself returned.
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  const offsetAtNaive = zone.offset(naiveUtcMs);
  const offsetOneDayEarlier = zone.offset(naiveUtcMs - 24 * 60 * 60 * 1000);

  const candidateOffsets = [...new Set([offsetAtNaive, offsetOneDayEarlier])];

  const selfConsistent: number[] = [];
  for (const offsetMinutes of candidateOffsets) {
    const candidateUtcMs = naiveUtcMs - offsetMinutes * 60_000;
    const offsetAtCandidate = zone.offset(candidateUtcMs);
    if (offsetAtCandidate === offsetMinutes) {
      selfConsistent.push(candidateUtcMs);
    }
  }
  const distinctValidInstants = [...new Set(selfConsistent)];

  if (distinctValidInstants.length === 1) {
    return { utc: new Date(distinctValidInstants[0] as number).toISOString(), kind: 'unambiguous' };
  }

  if (distinctValidInstants.length >= 2) {
    const sorted = [...distinctValidInstants].sort((a, b) => a - b);
    const chosen = ambiguousPolicy === 'earliest' ? sorted[0] : sorted[sorted.length - 1];
    return { utc: new Date(chosen as number).toISOString(), kind: 'ambiguous-resolved' };
  }

  // Nonexistent local time (spring-forward gap): neither candidate offset is
  // self-consistent at the instant it implies, because the requested wall
  // clock reading simply never occurs. We still compute both candidate UTC
  // instants (one per side of the transition) and pick between them:
  //   - "push-forward" takes the chronologically LATER candidate. Its real
  //     local reading (re-derived from the zone, not assumed) ends up after
  //     the gap — e.g. a requested 02:30 in a 02:00->03:00 gap resolves to an
  //     instant that actually displays as 03:30, the same offset-worth of
  //     time past the gap's end.
  //   - "push-back" takes the chronologically EARLIER candidate, whose real
  //     local reading falls just before the gap opens.
  const utcUsing = (offsetMinutes: number): number => naiveUtcMs - offsetMinutes * 60_000;
  const candidates = candidateOffsets.map((o) => ({ offset: o, utcMs: utcUsing(o) }));
  candidates.sort((a, b) => a.utcMs - b.utcMs);
  const earlier = candidates[0] as { offset: number; utcMs: number };
  const later = (candidates[1] ?? candidates[0]) as { offset: number; utcMs: number };
  const chosen = nonexistentPolicy === 'push-back' ? earlier : later;
  return { utc: new Date(chosen.utcMs).toISOString(), kind: 'nonexistent-resolved' };
}

/** Add whole calendar days to an ISO date using proper calendar arithmetic (handles month/year rollover and DST correctly). */
export function addCalendarDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const dt = DateTime.utc(year, month, day).plus({ days });
  return dt.toISODate() as IsoDate;
}

export function isoDateToWeekday(date: IsoDate): Weekday {
  const { year, month, day } = parseIsoDate(date);
  const weekdayIndex = DateTime.utc(year, month, day).weekday; // 1 = Monday .. 7 = Sunday
  return ALL_WEEKDAYS[weekdayIndex - 1] as Weekday;
}

export function todayIsoDate(referenceWallMs: number, timezone: string): IsoDate {
  return DateTime.fromMillis(referenceWallMs, { zone: timezone }).toISODate() as IsoDate;
}

/**
 * Generate the next `count` playing dates that satisfy `pattern`, starting
 * from (and including) `fromDate`, skipping `exclusions`.
 */
export function generateUpcomingPlayDates(
  pattern: PlayDatePattern,
  fromDate: IsoDate,
  count: number,
  exclusions: readonly IsoDate[]
): IsoDate[] {
  const excludedSet = new Set(exclusions);
  const results: IsoDate[] = [];

  if (pattern.kind === 'one-off') {
    if (pattern.date >= fromDate && !excludedSet.has(pattern.date)) {
      results.push(pattern.date);
    }
    return results;
  }

  const weekdaySet = new Set(pattern.weekdays);
  let cursor = fromDate;
  let occurrencesEmitted = 0;
  // Bound the scan so a misconfigured rule (e.g. empty weekdays) cannot loop forever.
  for (let i = 0; i < 3650 && results.length < count; i += 1) {
    if (pattern.endDate && cursor > pattern.endDate) break;
    if (pattern.occurrenceLimit !== null && occurrencesEmitted >= pattern.occurrenceLimit) break;
    if (weekdaySet.has(isoDateToWeekday(cursor))) {
      occurrencesEmitted += 1;
      if (!excludedSet.has(cursor)) {
        results.push(cursor);
      }
    }
    cursor = addCalendarDays(cursor, 1);
  }
  return results;
}

export interface OccurrencePlanWarning {
  code: 'nonexistent-play-time' | 'ambiguous-play-time' | 'nonexistent-release-time' | 'ambiguous-release-time';
  message: string;
}

export interface OccurrencePlanEntry {
  playDate: IsoDate;
  playStartUtc: UtcIsoString;
  playEndUtc: UtcIsoString;
  releaseAtUtc: UtcIsoString;
  warnings: OccurrencePlanWarning[];
}

export interface OccurrencePlanInput {
  playDatePattern: PlayDatePattern;
  preferredStartTime: LocalTimeOfDay;
  durationMinutes: number;
  release: ReleaseRule;
  timezone: string;
  ambiguousLocalTimePolicy: AmbiguousLocalTimePolicy;
  nonexistentLocalTimePolicy: NonexistentLocalTimePolicy;
  exclusionDates: readonly IsoDate[];
}

/** Preview the next `count` occurrences (playing date + resolved UTC play/release instants) for a rule. */
export function planUpcomingOccurrences(
  input: OccurrencePlanInput,
  fromDate: IsoDate,
  count: number
): OccurrencePlanEntry[] {
  const playDates = generateUpcomingPlayDates(input.playDatePattern, fromDate, count, input.exclusionDates);

  return playDates.map((playDate) => {
    const warnings: OccurrencePlanWarning[] = [];

    const startRes = resolveLocalTimeToUtc(
      playDate,
      input.preferredStartTime,
      input.timezone,
      input.ambiguousLocalTimePolicy,
      input.nonexistentLocalTimePolicy
    );
    if (startRes.kind === 'nonexistent-resolved') {
      warnings.push({
        code: 'nonexistent-play-time',
        message: `${input.preferredStartTime} does not exist in ${input.timezone} on ${playDate} (DST spring-forward); resolved using the "${input.nonexistentLocalTimePolicy}" policy.`
      });
    } else if (startRes.kind === 'ambiguous-resolved') {
      warnings.push({
        code: 'ambiguous-play-time',
        message: `${input.preferredStartTime} occurs twice in ${input.timezone} on ${playDate} (DST fall-back); resolved using the "${input.ambiguousLocalTimePolicy}" policy.`
      });
    }

    const playStartUtc = startRes.utc;
    const playEndUtc = new Date(new Date(playStartUtc).getTime() + input.durationMinutes * 60_000).toISOString();

    let releaseAtUtc: UtcIsoString;
    if (input.release.kind === 'one-off-timestamp') {
      releaseAtUtc = input.release.releaseAtUtc;
    } else {
      const releaseDate = addCalendarDays(playDate, -input.release.daysBefore);
      const releaseRes = resolveLocalTimeToUtc(
        releaseDate,
        input.release.localTime,
        input.timezone,
        input.ambiguousLocalTimePolicy,
        input.nonexistentLocalTimePolicy
      );
      if (releaseRes.kind === 'nonexistent-resolved') {
        warnings.push({
          code: 'nonexistent-release-time',
          message: `Release time ${input.release.localTime} does not exist in ${input.timezone} on ${releaseDate} (DST spring-forward); resolved using the "${input.nonexistentLocalTimePolicy}" policy.`
        });
      } else if (releaseRes.kind === 'ambiguous-resolved') {
        warnings.push({
          code: 'ambiguous-release-time',
          message: `Release time ${input.release.localTime} occurs twice in ${input.timezone} on ${releaseDate} (DST fall-back); resolved using the "${input.ambiguousLocalTimePolicy}" policy.`
        });
      }
      releaseAtUtc = releaseRes.utc;
    }

    return { playDate, playStartUtc, playEndUtc, releaseAtUtc, warnings };
  });
}

/**
 * Build the ordered list of (start time, eligible courts) candidates the
 * booking engine is allowed to try for one occurrence, in priority order.
 * The first entry always uses the rule's preferred time/courts. When
 * `exactTimeOnly` is true, no other entry is included, regardless of how
 * many fallback options were configured.
 */
export function resolveFallbackCandidates(
  playDate: IsoDate,
  timezone: string,
  exactTimeOnly: boolean,
  preferredStartTime: LocalTimeOfDay,
  preferredCourtIds: string[] | 'any',
  fallbackOptions: readonly FallbackOption[],
  ambiguousPolicy: AmbiguousLocalTimePolicy,
  nonexistentPolicy: NonexistentLocalTimePolicy
): { startTime: LocalTimeOfDay; startUtc: UtcIsoString; courtIds: string[] | 'any' }[] {
  const candidates: { startTime: LocalTimeOfDay; courtIds: string[] | 'any' }[] = [
    { startTime: preferredStartTime, courtIds: preferredCourtIds }
  ];
  if (!exactTimeOnly) {
    for (const option of fallbackOptions) {
      candidates.push({ startTime: option.startTime, courtIds: option.courtIds });
    }
  }
  return candidates.map((candidate) => ({
    startTime: candidate.startTime,
    courtIds: candidate.courtIds,
    startUtc: resolveLocalTimeToUtc(playDate, candidate.startTime, timezone, ambiguousPolicy, nonexistentPolicy).utc
  }));
}
