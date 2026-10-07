import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  generateUpcomingPlayDates,
  isoDateToWeekday,
  planUpcomingOccurrences,
  resolveFallbackCandidates,
  resolveLocalTimeToUtc
} from '../../src/core/time/releaseSchedule.js';

describe('resolveLocalTimeToUtc', () => {
  it('resolves a normal, non-DST local time correctly', () => {
    const res = resolveLocalTimeToUtc('2026-06-15', '18:00', 'Europe/Madrid', 'latest', 'push-forward');
    expect(res.kind).toBe('unambiguous');
    // Europe/Madrid is UTC+2 in June (CEST)
    expect(res.utc).toBe('2026-06-15T16:00:00.000Z');
  });

  it('detects and resolves the nonexistent local time at a spring-forward gap (push-forward)', () => {
    // Europe/Madrid springs forward on 2026-03-29 at 02:00 -> 03:00 local (CET -> CEST);
    // 02:30 never happens. push-forward takes the chronologically later candidate instant,
    // which actually displays as 03:30 CEST — i.e. the wall clock reading "jumps forward"
    // across the gap, landing exactly one gap-width after the literal requested time.
    const res = resolveLocalTimeToUtc('2026-03-29', '02:30', 'Europe/Madrid', 'latest', 'push-forward');
    expect(res.kind).toBe('nonexistent-resolved');
    expect(res.utc).toBe('2026-03-29T01:30:00.000Z');
  });

  it('detects and resolves the nonexistent local time at a spring-forward gap (push-back)', () => {
    // push-back takes the chronologically earlier candidate instant, which displays as
    // 01:30 CET — i.e. clamped to just before the gap opens.
    const res = resolveLocalTimeToUtc('2026-03-29', '02:30', 'Europe/Madrid', 'latest', 'push-back');
    expect(res.kind).toBe('nonexistent-resolved');
    expect(res.utc).toBe('2026-03-29T00:30:00.000Z');
  });

  it('detects and resolves an ambiguous local time at a fall-back transition (earliest)', () => {
    // Europe/Madrid falls back on 2026-10-25 at 03:00 -> 02:00 local (CEST -> CET); 02:30 occurs twice.
    const earliest = resolveLocalTimeToUtc('2026-10-25', '02:30', 'Europe/Madrid', 'earliest', 'push-forward');
    expect(earliest.kind).toBe('ambiguous-resolved');
    const latest = resolveLocalTimeToUtc('2026-10-25', '02:30', 'Europe/Madrid', 'latest', 'push-forward');
    expect(latest.kind).toBe('ambiguous-resolved');
    expect(Date.parse(earliest.utc)).toBeLessThan(Date.parse(latest.utc));
    expect(Date.parse(latest.utc) - Date.parse(earliest.utc)).toBe(60 * 60 * 1000);
  });

  it('is stable for a timezone with no DST (UTC)', () => {
    const res = resolveLocalTimeToUtc('2026-01-01', '09:00', 'Etc/UTC', 'latest', 'push-forward');
    expect(res.kind).toBe('unambiguous');
    expect(res.utc).toBe('2026-01-01T09:00:00.000Z');
  });
});

describe('addCalendarDays', () => {
  it('subtracts calendar days across a DST boundary without using a fixed 24h offset', () => {
    // 7 calendar days before 2026-03-29 (the Madrid spring-forward date) is 2026-03-22, not
    // some time-shifted equivalent — calendar subtraction must stay purely date-based.
    expect(addCalendarDays('2026-03-29', -7)).toBe('2026-03-22');
    expect(addCalendarDays('2026-01-30', 5)).toBe('2026-02-04');
    expect(addCalendarDays('2026-12-30', 5)).toBe('2027-01-04');
  });
});

describe('isoDateToWeekday', () => {
  it('maps dates to the correct weekday', () => {
    expect(isoDateToWeekday('2026-10-07')).toBe('WED');
    expect(isoDateToWeekday('2026-10-12')).toBe('MON');
  });
});

describe('generateUpcomingPlayDates', () => {
  it('returns the one-off date only if on/after fromDate and not excluded', () => {
    expect(generateUpcomingPlayDates({ kind: 'one-off', date: '2026-11-03' }, '2026-10-01', 5, [])).toEqual(['2026-11-03']);
    expect(generateUpcomingPlayDates({ kind: 'one-off', date: '2026-09-01' }, '2026-10-01', 5, [])).toEqual([]);
    expect(generateUpcomingPlayDates({ kind: 'one-off', date: '2026-11-03' }, '2026-10-01', 5, ['2026-11-03'])).toEqual([]);
  });

  it('generates recurring weekday occurrences honoring exclusions, end date, and occurrence limit', () => {
    const pattern = { kind: 'recurring' as const, weekdays: ['TUE' as const], endDate: null, occurrenceLimit: null };
    const dates = generateUpcomingPlayDates(pattern, '2026-10-07', 4, ['2026-10-20']);
    // Tuesdays from 2026-10-07: 10-13, 10-20 (excluded), 10-27, 11-03, 11-10
    expect(dates).toEqual(['2026-10-13', '2026-10-27', '2026-11-03', '2026-11-10']);
  });

  it('stops at occurrenceLimit counting excluded dates as consumed occurrences', () => {
    const pattern = { kind: 'recurring' as const, weekdays: ['TUE' as const], endDate: null, occurrenceLimit: 2 };
    const dates = generateUpcomingPlayDates(pattern, '2026-10-07', 10, ['2026-10-13']);
    // Only 2 occurrences total are allowed; the first (10-13) is excluded, so only 10-20 remains.
    expect(dates).toEqual(['2026-10-20']);
  });

  it('stops at endDate', () => {
    const pattern = { kind: 'recurring' as const, weekdays: ['TUE' as const], endDate: '2026-10-20', occurrenceLimit: null };
    const dates = generateUpcomingPlayDates(pattern, '2026-10-07', 10, []);
    expect(dates).toEqual(['2026-10-13', '2026-10-20']);
  });
});

describe('planUpcomingOccurrences', () => {
  it('computes playStart/playEnd/release instants and preserves warnings for a days-before release rule', () => {
    const plan = planUpcomingOccurrences(
      {
        playDatePattern: { kind: 'one-off', date: '2026-11-10' },
        preferredStartTime: '19:00',
        durationMinutes: 90,
        release: { kind: 'days-before-at-local-time', daysBefore: 7, localTime: '08:00', verified: true },
        timezone: 'Europe/Madrid',
        ambiguousLocalTimePolicy: 'latest',
        nonexistentLocalTimePolicy: 'push-forward',
        exclusionDates: []
      },
      '2026-10-01',
      5
    );
    expect(plan).toHaveLength(1);
    const entry = plan[0]!;
    expect(entry.playDate).toBe('2026-11-10');
    // Madrid is UTC+1 in November (CET)
    expect(entry.playStartUtc).toBe('2026-11-10T18:00:00.000Z');
    expect(entry.playEndUtc).toBe('2026-11-10T19:30:00.000Z');
    // release date = 2026-11-03 (7 calendar days before), 08:00 CET -> 07:00Z
    expect(entry.releaseAtUtc).toBe('2026-11-03T07:00:00.000Z');
    expect(entry.warnings).toEqual([]);
  });

  it('surfaces a warning when the release time falls in a DST gap', () => {
    const plan = planUpcomingOccurrences(
      {
        playDatePattern: { kind: 'one-off', date: '2026-04-05' },
        preferredStartTime: '19:00',
        durationMinutes: 60,
        release: { kind: 'days-before-at-local-time', daysBefore: 7, localTime: '02:30', verified: true },
        timezone: 'Europe/Madrid',
        ambiguousLocalTimePolicy: 'latest',
        nonexistentLocalTimePolicy: 'push-forward',
        exclusionDates: []
      },
      '2026-03-01',
      5
    );
    expect(plan[0]!.warnings.some((w) => w.code === 'nonexistent-release-time')).toBe(true);
  });
});

describe('resolveFallbackCandidates', () => {
  it('returns only the preferred candidate when exactTimeOnly is true', () => {
    const candidates = resolveFallbackCandidates(
      '2026-11-10',
      'Europe/Madrid',
      true,
      '19:00',
      ['court-1'],
      [{ startTime: '20:00', courtIds: 'any' }],
      'latest',
      'push-forward'
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.startTime).toBe('19:00');
    expect(candidates[0]!.courtIds).toEqual(['court-1']);
  });

  it('includes fallback options, in order, when exactTimeOnly is false', () => {
    const candidates = resolveFallbackCandidates(
      '2026-11-10',
      'Europe/Madrid',
      false,
      '19:00',
      ['court-1'],
      [{ startTime: '20:00', courtIds: 'any' }, { startTime: '20:30', courtIds: ['court-2'] }],
      'latest',
      'push-forward'
    );
    expect(candidates.map((c) => c.startTime)).toEqual(['19:00', '20:00', '20:30']);
    expect(candidates[1]!.courtIds).toBe('any');
    expect(candidates[2]!.courtIds).toEqual(['court-2']);
  });
});
