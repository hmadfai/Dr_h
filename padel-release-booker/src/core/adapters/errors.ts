/**
 * Structured error types adapters throw so the booking engine can react
 * correctly (backoff, pause for user action, reconcile) instead of treating
 * every failure the same way.
 */

export class RateLimitedError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Rate limited; retry after ${retryAfterSeconds}s.`);
  }
}

export class NetworkError extends Error {
  constructor(message = 'Network request failed before a result could be observed.') {
    super(message);
  }
}

export class SessionExpiredError extends Error {
  constructor(message = 'The Playtomic session has expired; reconnect to continue.') {
    super(message);
  }
}

/** Thrown when a CAPTCHA, MFA challenge, 3-D Secure, or other security/payment check needs a human. */
export class RequiresUserActionError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

/** Thrown by submitBooking when the outcome genuinely cannot be determined (e.g. the HTTP call timed out). */
export class UnknownOutcomeError extends Error {
  constructor(message = 'Booking submission timed out; outcome unknown.') {
    super(message);
  }
}
