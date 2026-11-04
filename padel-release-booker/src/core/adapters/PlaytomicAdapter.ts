/**
 * The single seam through which the booking engine talks to "Playtomic".
 * See docs/integration-feasibility.md for why there is no automatic adapter
 * that actually submits a real booking: only `mock` (offline simulation) and
 * `assisted` (opens the real site for a human to finish) are implemented.
 *
 * Every adapter implementation must be explicit about `capabilities` so the
 * booking engine never has to guess what an adapter can do.
 */

import type {
  AdapterCapabilities,
  AdapterMode,
  AvailabilitySlot,
  BookingOutcome,
  Club,
  CourtInfo,
  SessionInfo,
  UtcIsoString
} from '../domain/types.js';

export class AdapterCapabilityError extends Error {
  constructor(adapterMode: AdapterMode, capability: string) {
    super(`Adapter mode "${adapterMode}" does not support "${capability}".`);
  }
}

export interface ConnectOptions {
  /** Opaque, adapter-specific hint; e.g. mock accepts a fixture name. Never a password. */
  hint?: string;
}

export interface AvailabilityQuery {
  clubId: string;
  playDate: string;
  startUtc: UtcIsoString;
  endUtc: UtcIsoString;
  courtIds: string[] | 'any';
}

export interface BookingSubmitParams {
  clubId: string;
  courtId: string;
  startUtc: UtcIsoString;
  endUtc: UtcIsoString;
  maxTotalPrice: number;
  currency: string;
  /** Local idempotency key; adapters that support server-side idempotency keys must forward it. */
  intentId: string;
}

export interface BookingSubmitResult {
  outcome: BookingOutcome;
  bookingReference: string | null;
  price: number | null;
  currency: string | null;
  failureReason: string | null;
}

export interface ExistingBookingQuery {
  clubId: string;
  intentId: string;
  startUtc: UtcIsoString;
  endUtc: UtcIsoString;
}

export interface ExistingBookingResult {
  found: boolean;
  bookingReference: string | null;
  courtId: string | null;
  price: number | null;
  currency: string | null;
}

/** Context passed to assisted-mode "open the booking page" actions. Never includes credentials. */
export interface AssistedOpenContext {
  clubName: string;
  clubUrl: string;
  playDate: string;
  preferredStartTime: string;
  durationMinutes: number;
}

export interface PlaytomicAdapter {
  readonly mode: AdapterMode;
  readonly capabilities: AdapterCapabilities;

  getSession(): Promise<SessionInfo>;
  connect(options?: ConnectOptions): Promise<SessionInfo>;
  disconnect(): Promise<void>;

  searchClubs(query: string): Promise<Club[]>;
  resolveClubByUrl(url: string): Promise<Club>;
  listCourts(clubId: string): Promise<CourtInfo[]>;

  checkAvailability(query: AvailabilityQuery): Promise<AvailabilitySlot[]>;
  submitBooking(params: BookingSubmitParams): Promise<BookingSubmitResult>;
  findExistingBooking(query: ExistingBookingQuery): Promise<ExistingBookingResult>;

  /**
   * Assisted mode only: notify the user and open the real, allowlisted
   * booking page in their default browser. Implementations for adapters that
   * do not support this must throw AdapterCapabilityError.
   */
  notifyAndOpenBookingPage(context: AssistedOpenContext): Promise<void>;
}
