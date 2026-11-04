/**
 * The only adapter that touches the real Playtomic service. It never calls
 * any Playtomic API and never drives a scripted browser session. It does
 * exactly two things:
 *   1. Sends a native notification.
 *   2. Opens the user's confirmed, allowlisted club URL in their normal,
 *      human-operated default browser.
 * Every actual booking step (login, search, slot selection, payment) is
 * performed by the human, not this code. See docs/integration-feasibility.md
 * for why this is the only "real" mode implemented.
 */

import type { AdapterCapabilities, Club, CourtInfo, SessionInfo } from '../domain/types.js';
import type {
  AssistedOpenContext,
  AvailabilityQuery,
  BookingSubmitParams,
  ConnectOptions,
  ExistingBookingQuery,
  PlaytomicAdapter
} from './PlaytomicAdapter.js';
import { AdapterCapabilityError } from './PlaytomicAdapter.js';
import { assertAllowedExternalUrl } from '../urlAllowlist.js';
import type { Notifier } from '../notifications/notifier.js';

export interface ExternalUrlOpener {
  open(url: string): Promise<void>;
}

/** Clock-independent, mutable session record the UI updates when the user self-reports login status. */
export interface AssistedSessionStore {
  get(): SessionInfo;
  set(session: SessionInfo): void;
}

export class AssistedPlaytomicAdapter implements PlaytomicAdapter {
  readonly mode = 'assisted' as const;
  readonly capabilities: AdapterCapabilities = {
    supportsClubSearch: false,
    supportsAvailabilityCheck: false,
    supportsAutomaticBooking: false,
    supportsReconciliation: false,
    touchesRealService: true
  };

  constructor(
    private readonly opener: ExternalUrlOpener,
    private readonly notifier: Notifier,
    private readonly sessionStore: AssistedSessionStore
  ) {}

  async getSession(): Promise<SessionInfo> {
    return this.sessionStore.get();
  }

  async connect(options?: ConnectOptions): Promise<SessionInfo> {
    const url = assertAllowedExternalUrl('https://playtomic.com/login');
    await this.opener.open(url.toString());
    // We cannot verify a real login from here (no automation). The UI must ask
    // the user to confirm once they have actually signed in.
    const current = this.sessionStore.get();
    const next: SessionInfo = {
      ...current,
      mode: 'assisted',
      state: 'connecting',
      accountLabel: options?.hint ?? current.accountLabel,
      lastError: null
    };
    this.sessionStore.set(next);
    return next;
  }

  async disconnect(): Promise<void> {
    this.sessionStore.set({
      mode: 'assisted',
      state: 'disconnected',
      accountLabel: null,
      connectedAtUtc: null,
      expiresAtUtc: null,
      lastError: null
    });
  }

  async searchClubs(): Promise<Club[]> {
    throw new AdapterCapabilityError(this.mode, 'searchClubs');
  }

  async resolveClubByUrl(url: string): Promise<Club> {
    // No verified lookup exists without a supported API (see integration
    // feasibility report). We only validate that the URL is on the allowed
    // Playtomic host; the human must confirm the club's actual name/location/
    // timezone themselves after visiting the page, and the result is marked
    // `verified: false` so the UI can require an explicit confirmation step.
    const parsed = assertAllowedExternalUrl(url);
    return {
      id: `url:${parsed.toString()}`,
      name: '(unconfirmed — enter the name shown on the club page)',
      location: '(unconfirmed — enter the location shown on the club page)',
      timezone: 'Etc/UTC',
      sourceUrl: parsed.toString(),
      verified: false
    };
  }

  async listCourts(): Promise<CourtInfo[]> {
    throw new AdapterCapabilityError(this.mode, 'listCourts');
  }

  async checkAvailability(_query: AvailabilityQuery): Promise<never> {
    throw new AdapterCapabilityError(this.mode, 'checkAvailability');
  }

  async submitBooking(_params: BookingSubmitParams): Promise<never> {
    throw new AdapterCapabilityError(this.mode, 'submitBooking');
  }

  async findExistingBooking(_query: ExistingBookingQuery): Promise<never> {
    throw new AdapterCapabilityError(this.mode, 'findExistingBooking');
  }

  async notifyAndOpenBookingPage(context: AssistedOpenContext): Promise<void> {
    const url = assertAllowedExternalUrl(context.clubUrl);
    await this.notifier.notify(
      'Padel Release Booker: slots may be releasing now',
      `${context.clubName} — ${context.playDate} ${context.preferredStartTime} (${context.durationMinutes} min). Opening the booking page for you.`
    );
    await this.opener.open(url.toString());
  }
}
