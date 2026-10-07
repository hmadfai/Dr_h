/**
 * Core domain model. This module has no dependency on Electron, SQLite, or any
 * I/O library — it is pure data + types so it can be unit tested with plain
 * Vitest in Node, independent of the desktop shell.
 */

/** IANA timezone identifier, e.g. "Europe/Madrid". Validated at the edges (zod), not here. */
export type IanaTimeZone = string;

/** ISO-8601 UTC instant string, e.g. "2026-11-03T18:00:00.000Z". Always store time at rest in UTC. */
export type UtcIsoString = string;

/** Local wall-clock time of day, "HH:MM", 24h, no timezone (interpreted against a club's IANA zone). */
export type LocalTimeOfDay = string;

/** ISO calendar date "YYYY-MM-DD", no time component. */
export type IsoDate = string;

export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export const ALL_WEEKDAYS: readonly Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export type AdapterMode = 'mock' | 'assisted' | 'automatic';

export interface Club {
  /** Stable identifier from the integration source. For mock data this is a synthetic id. */
  id: string;
  name: string;
  /** Free-text location/address as shown by the source, for disambiguating similarly named venues. */
  location: string;
  timezone: IanaTimeZone;
  /** The exact URL the user confirmed resolves to this club (assisted mode opens this). */
  sourceUrl: string | null;
  /** Whether this club identity was confirmed via a verified lookup (mock adapter) vs pasted by the user. */
  verified: boolean;
}

export interface CourtInfo {
  id: string;
  name: string;
  surface: 'indoor' | 'outdoor' | 'unknown';
}

/** One-off date, or a recurring weekday pattern with optional end conditions. */
export type PlayDatePattern =
  | { kind: 'one-off'; date: IsoDate }
  | {
      kind: 'recurring';
      weekdays: Weekday[];
      /** Inclusive. If both endDate and occurrenceLimit are set, whichever comes first applies. */
      endDate: IsoDate | null;
      occurrenceLimit: number | null;
    };

export type ReleaseRule =
  | {
      kind: 'one-off-timestamp';
      /** Exact release instant, already resolved to UTC at rule-creation time. */
      releaseAtUtc: UtcIsoString;
      verified: false;
    }
  | {
      kind: 'days-before-at-local-time';
      /** Whole calendar days before the playing date, evaluated in the club's own calendar — never a fixed 24h*N offset. */
      daysBefore: number;
      /** Club-local time of day the release happens on that calendar day. */
      localTime: LocalTimeOfDay;
      /** True only if this timing was confirmed from a documented/observed club policy; false if the user is guessing. */
      verified: boolean;
    };

export type AmbiguousLocalTimePolicy = 'earliest' | 'latest';
export type NonexistentLocalTimePolicy = 'push-forward' | 'push-back';

export interface FallbackOption {
  startTime: LocalTimeOfDay;
  courtIds: string[] | 'any';
}

export interface BookingRule {
  id: string;
  name: string;
  clubId: string;
  playDate: PlayDatePattern;
  preferredStartTime: LocalTimeOfDay;
  durationMinutes: number;
  /** Ordered by priority; 'any' means any eligible court. */
  preferredCourtIds: string[] | 'any';
  surfacePreference: 'indoor' | 'outdoor' | 'no-preference';
  /** When true (the default), only the exact preferredStartTime is eligible — fallbackOptions are ignored. */
  exactTimeOnly: boolean;
  fallbackOptions: FallbackOption[];
  maxTotalPrice: number;
  currency: string;
  maxSuccessfulBookingsPerOccurrence: number;
  maxFutureActiveBookings: number;
  exclusionDates: IsoDate[];
  release: ReleaseRule;
  preflightMinutesBeforeRelease: number;
  /** Bounded polling window after release, in seconds, during which the engine may keep checking. */
  pollingWindowSeconds: number;
  pollingIntervalSeconds: number;
  ambiguousLocalTimePolicy: AmbiguousLocalTimePolicy;
  nonexistentLocalTimePolicy: NonexistentLocalTimePolicy;
  mode: Exclude<AdapterMode, 'automatic'> | 'automatic';
  createdAtUtc: UtcIsoString;
  updatedAtUtc: UtcIsoString;
}

/**
 * Exactly the state set from the project specification. "Missed while
 * asleep" and "booking window closed" are both represented as EXPIRED, with
 * the distinguishing reason recorded in `Occurrence.terminalReason` /
 * `BookingRecord.failureReason` rather than as separate states.
 */
export type OccurrenceStatus =
  | 'DRAFT'
  | 'ARMED'
  | 'PREFLIGHT'
  | 'WAITING_FOR_RELEASE'
  | 'CHECKING'
  | 'BOOKING'
  | 'AWAITING_USER_ACTION'
  | 'CONFIRMED'
  | 'UNKNOWN_OUTCOME'
  | 'FAILED'
  | 'EXPIRED'
  | 'PAUSED';

export interface Occurrence {
  id: string;
  ruleId: string;
  playDate: IsoDate;
  /** Resolved playing start instant, club-local preferredStartTime converted to UTC for this specific date. */
  playStartUtc: UtcIsoString;
  playEndUtc: UtcIsoString;
  /** Resolved release instant for this specific occurrence. */
  releaseAtUtc: UtcIsoString;
  status: OccurrenceStatus;
  /** The status this occurrence was in immediately before PAUSED, so RESUME can continue correctly. */
  pausedFromStatus: OccurrenceStatus | null;
  /** Human-readable explanation for FAILED/EXPIRED/UNKNOWN_OUTCOME, e.g. "missed while asleep; outside catch-up window". */
  terminalReason: string | null;
  /** Unique local intent id used for idempotency / duplicate-submission protection. */
  intentId: string;
  lockedByWorkerId: string | null;
  lockExpiresAtUtc: UtcIsoString | null;
  createdAtUtc: UtcIsoString;
  updatedAtUtc: UtcIsoString;
}

export type BookingOutcome = 'CONFIRMED' | 'FAILED' | 'EXPIRED' | 'AWAITING_USER_ACTION' | 'UNKNOWN';

export interface BookingRecord {
  id: string;
  occurrenceId: string;
  ruleId: string;
  clubId: string;
  intentId: string;
  outcome: BookingOutcome;
  /** Only present once a real/mock adapter has confirmed a booking reference. Never fabricated. */
  bookingReference: string | null;
  courtId: string | null;
  courtName: string | null;
  startUtc: UtcIsoString | null;
  endUtc: UtcIsoString | null;
  price: number | null;
  currency: string | null;
  failureReason: string | null;
  mode: AdapterMode;
  createdAtUtc: UtcIsoString;
}

export interface AuthorizationSnapshot {
  id: string;
  ruleId: string;
  version: number;
  createdAtUtc: UtcIsoString;
  expiresAtUtc: UtcIsoString | null;
  /** Serialized human-readable summary shown at review time; stored so later disputes can see exactly what was approved. */
  summaryJson: string;
  /** Hash of the rule + club + release + price-cap fields covered by this authorization, to detect drift. */
  coveredFieldsHash: string;
  revokedAtUtc: UtcIsoString | null;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'expired' | 'error';

export interface SessionInfo {
  mode: AdapterMode;
  state: ConnectionState;
  accountLabel: string | null;
  connectedAtUtc: UtcIsoString | null;
  expiresAtUtc: UtcIsoString | null;
  lastError: string | null;
}

export interface AvailabilitySlot {
  courtId: string;
  courtName: string;
  surface: 'indoor' | 'outdoor' | 'unknown';
  startUtc: UtcIsoString;
  endUtc: UtcIsoString;
  price: number;
  currency: string;
}

export interface AdapterCapabilities {
  supportsClubSearch: boolean;
  supportsAvailabilityCheck: boolean;
  supportsAutomaticBooking: boolean;
  supportsReconciliation: boolean;
  /** False for mock; true for anything that would touch the real Playtomic service. */
  touchesRealService: boolean;
}
