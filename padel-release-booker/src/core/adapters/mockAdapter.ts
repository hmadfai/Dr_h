/**
 * Deterministic, fully offline adapter. Never makes a network call. Used for
 * local development, demos, and the automated test suite, and clearly
 * surfaced as "Mock" everywhere in the UI so its results are never confused
 * with a real Playtomic booking (see docs/integration-feasibility.md).
 *
 * All of the actual decision logic ("what happens when I call checkAvailability
 * right now") lives in the injected `MockWorld`, which tests control directly.
 * This keeps the adapter itself trivial and keeps scenario-authoring in the
 * test files where it is easy to read.
 */

import type { Clock } from '../time/clock.js';
import type {
  AdapterCapabilities,
  AvailabilitySlot,
  Club,
  CourtInfo,
  SessionInfo
} from '../domain/types.js';
import type {
  AssistedOpenContext,
  AvailabilityQuery,
  BookingSubmitParams,
  BookingSubmitResult,
  ExistingBookingQuery,
  ExistingBookingResult,
  PlaytomicAdapter
} from './PlaytomicAdapter.js';
import { AdapterCapabilityError } from './PlaytomicAdapter.js';
import { NetworkError, RateLimitedError, RequiresUserActionError, SessionExpiredError, UnknownOutcomeError } from './errors.js';

export type MockAvailabilityResult =
  | { kind: 'ok'; slots: AvailabilitySlot[] }
  | { kind: 'rate-limited'; retryAfterSeconds: number }
  | { kind: 'network-error' }
  | { kind: 'session-expired' }
  | { kind: 'requires-user-action'; reason: string };

export type MockSubmitResult =
  | { kind: 'confirmed'; result: BookingSubmitResult }
  | { kind: 'failed'; result: BookingSubmitResult }
  | { kind: 'timeout-unknown' }
  | { kind: 'requires-user-action'; reason: string }
  | { kind: 'rate-limited'; retryAfterSeconds: number }
  | { kind: 'network-error' };

export interface MockWorld {
  session: SessionInfo;
  clubs: Club[];
  courtsByClubId: Record<string, CourtInfo[]>;
  existingBooking: ExistingBookingResult | null;
  getAvailability(query: AvailabilityQuery, nowWallMs: number): MockAvailabilityResult;
  submitBooking(params: BookingSubmitParams, nowWallMs: number): MockSubmitResult;
  /** Records every opened "assisted" URL so tests can assert on it without a real browser. */
  openedUrls: AssistedOpenContext[];
}

export function createDefaultMockWorld(): MockWorld {
  return {
    session: {
      mode: 'mock',
      state: 'connected',
      accountLabel: 'mock-player@example.invalid',
      connectedAtUtc: new Date(0).toISOString(),
      expiresAtUtc: null,
      lastError: null
    },
    clubs: [],
    courtsByClubId: {},
    existingBooking: null,
    getAvailability: () => ({ kind: 'ok', slots: [] }),
    submitBooking: () => ({ kind: 'failed', result: { outcome: 'FAILED', bookingReference: null, price: null, currency: null, failureReason: 'No scenario configured.' } }),
    openedUrls: []
  };
}

export class MockPlaytomicAdapter implements PlaytomicAdapter {
  readonly mode = 'mock' as const;
  readonly capabilities: AdapterCapabilities = {
    supportsClubSearch: true,
    supportsAvailabilityCheck: true,
    supportsAutomaticBooking: true,
    supportsReconciliation: true,
    touchesRealService: false
  };

  constructor(
    private readonly world: MockWorld,
    private readonly clock: Clock
  ) {}

  async getSession(): Promise<SessionInfo> {
    return this.world.session;
  }

  async connect(): Promise<SessionInfo> {
    this.world.session = { ...this.world.session, state: 'connected', connectedAtUtc: new Date(this.clock.nowWallMs()).toISOString(), lastError: null };
    return this.world.session;
  }

  async disconnect(): Promise<void> {
    this.world.session = { ...this.world.session, state: 'disconnected', connectedAtUtc: null, expiresAtUtc: null };
  }

  async searchClubs(query: string): Promise<Club[]> {
    const q = query.trim().toLowerCase();
    return this.world.clubs.filter((c) => c.name.toLowerCase().includes(q));
  }

  async resolveClubByUrl(url: string): Promise<Club> {
    const found = this.world.clubs.find((c) => c.sourceUrl === url);
    if (!found) throw new Error(`No mock club registered for URL: ${url}`);
    return found;
  }

  async listCourts(clubId: string): Promise<CourtInfo[]> {
    return this.world.courtsByClubId[clubId] ?? [];
  }

  async checkAvailability(query: AvailabilityQuery): Promise<AvailabilitySlot[]> {
    const outcome = this.world.getAvailability(query, this.clock.nowWallMs());
    switch (outcome.kind) {
      case 'ok':
        return outcome.slots;
      case 'rate-limited':
        throw new RateLimitedError(outcome.retryAfterSeconds);
      case 'network-error':
        throw new NetworkError();
      case 'session-expired':
        throw new SessionExpiredError();
      case 'requires-user-action':
        throw new RequiresUserActionError(outcome.reason);
    }
  }

  async submitBooking(params: BookingSubmitParams): Promise<BookingSubmitResult> {
    const outcome = this.world.submitBooking(params, this.clock.nowWallMs());
    switch (outcome.kind) {
      case 'confirmed':
      case 'failed':
        return outcome.result;
      case 'timeout-unknown':
        throw new UnknownOutcomeError();
      case 'requires-user-action':
        throw new RequiresUserActionError(outcome.reason);
      case 'rate-limited':
        throw new RateLimitedError(outcome.retryAfterSeconds);
      case 'network-error':
        throw new NetworkError();
    }
  }

  async findExistingBooking(_query: ExistingBookingQuery): Promise<ExistingBookingResult> {
    return this.world.existingBooking ?? { found: false, bookingReference: null, courtId: null, price: null, currency: null };
  }

  async notifyAndOpenBookingPage(context: AssistedOpenContext): Promise<void> {
    // The mock adapter supports this purely to let the booking-history/notification
    // UI be exercised in demos; it never opens a real browser.
    this.world.openedUrls.push(context);
  }
}

export function assertMockNeverClaimsReal(adapter: PlaytomicAdapter): void {
  if (adapter.capabilities.touchesRealService) {
    throw new AdapterCapabilityError(adapter.mode, 'mock-adapter-invariant: touchesRealService must be false');
  }
}
