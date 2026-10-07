import { randomUUID } from 'node:crypto';
import type { BookingRule, Club, Occurrence } from '../../src/core/domain/types.js';

/** Clearly fictional sample data — never a real club. Used across tests and the in-app sample rule. */
export const FICTIONAL_CLUB: Club = {
  id: 'club-fictional-riverside',
  name: 'Riverside Padel Club (fictional — sample data)',
  location: '1 Example Lane, Faketown, Imaginary County',
  timezone: 'Europe/Madrid',
  sourceUrl: 'https://playtomic.com/clubs/fictional-riverside-padel-club',
  verified: true
};

export function buildFictionalRule(overrides: Partial<BookingRule> = {}): BookingRule {
  const base: BookingRule = {
    id: randomUUID(),
    name: 'Tuesday 19:00 sample rule (fictional club)',
    clubId: FICTIONAL_CLUB.id,
    playDate: { kind: 'recurring', weekdays: ['TUE'], endDate: null, occurrenceLimit: null },
    preferredStartTime: '19:00',
    durationMinutes: 90,
    preferredCourtIds: ['court-1'],
    surfacePreference: 'indoor',
    exactTimeOnly: true,
    fallbackOptions: [{ startTime: '19:30', courtIds: ['court-2'] }],
    maxTotalPrice: 28,
    currency: 'EUR',
    maxSuccessfulBookingsPerOccurrence: 1,
    maxFutureActiveBookings: 4,
    exclusionDates: [],
    release: { kind: 'days-before-at-local-time', daysBefore: 7, localTime: '08:00', verified: false },
    preflightMinutesBeforeRelease: 5,
    pollingWindowSeconds: 90,
    pollingIntervalSeconds: 3,
    ambiguousLocalTimePolicy: 'latest',
    nonexistentLocalTimePolicy: 'push-forward',
    mode: 'mock',
    createdAtUtc: new Date(0).toISOString(),
    updatedAtUtc: new Date(0).toISOString()
  };
  return { ...base, ...overrides };
}

export function buildOccurrence(rule: BookingRule, overrides: Partial<Occurrence> = {}): Occurrence {
  const base: Occurrence = {
    id: randomUUID(),
    ruleId: rule.id,
    playDate: '2026-11-10',
    playStartUtc: '2026-11-10T18:00:00.000Z',
    playEndUtc: '2026-11-10T19:30:00.000Z',
    releaseAtUtc: '2026-11-03T07:00:00.000Z',
    status: 'CHECKING',
    pausedFromStatus: null,
    terminalReason: null,
    intentId: randomUUID(),
    lockedByWorkerId: null,
    lockExpiresAtUtc: null,
    createdAtUtc: new Date(0).toISOString(),
    updatedAtUtc: new Date(0).toISOString()
  };
  return { ...base, ...overrides };
}
