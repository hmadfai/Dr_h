/**
 * Builds the human-reviewable authorization summary shown before arming
 * automatic mode, and a stable hash over every field that — if changed —
 * must force re-authorization (spec section 4: "Any material change to
 * club, dates, fallback options, price cap, payment method, or cancellation
 * policy must require re-authorization.").
 */

import { createHash } from 'node:crypto';
import type { AdapterMode, BookingRule, Club } from './types.js';

export interface CancellationPolicyInfo {
  /** True only if the adapter/club actually returned a cancellation policy; never fabricated. */
  available: boolean;
  summary: string;
  nonRefundableFeesSummary: string | null;
}

export interface AuthorizationReviewInput {
  mode: AdapterMode;
  club: Club;
  accountLabel: string | null;
  rule: BookingRule;
  /** Payment method label as observed in the real/mock workflow — never a raw card number or CVV. */
  allowedPaymentMethodLabel: string;
  cancellationPolicy: CancellationPolicyInfo;
  authorizationExpiresAtUtc: string | null;
}

export interface AuthorizationReviewSummary {
  mode: AdapterMode;
  accountLabel: string | null;
  club: { id: string; name: string; location: string; timezone: string; verified: boolean };
  playDate: BookingRule['playDate'];
  preferredStartTime: string;
  durationMinutes: number;
  preferredCourtIds: string[] | 'any';
  fallbackOptions: BookingRule['fallbackOptions'];
  exactTimeOnly: boolean;
  release: BookingRule['release'];
  maxTotalPrice: number;
  currency: string;
  maxSuccessfulBookingsPerOccurrence: number;
  maxFutureActiveBookings: number;
  allowedPaymentMethodLabel: string;
  cancellationPolicy: CancellationPolicyInfo;
  authorizationExpiresAtUtc: string | null;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize(obj[key]);
        return acc;
      }, {});
  }
  return value;
}

/** Fields that, if changed, invalidate an existing authorization and require re-review (per spec section 4). */
function materialFieldsFor(input: AuthorizationReviewInput): Record<string, unknown> {
  return {
    clubId: input.club.id,
    clubVerified: input.club.verified,
    playDate: input.rule.playDate,
    preferredStartTime: input.rule.preferredStartTime,
    durationMinutes: input.rule.durationMinutes,
    preferredCourtIds: input.rule.preferredCourtIds,
    exactTimeOnly: input.rule.exactTimeOnly,
    fallbackOptions: input.rule.fallbackOptions,
    release: input.rule.release,
    maxTotalPrice: input.rule.maxTotalPrice,
    currency: input.rule.currency,
    allowedPaymentMethodLabel: input.allowedPaymentMethodLabel,
    cancellationPolicyAvailable: input.cancellationPolicy.available,
    cancellationPolicySummary: input.cancellationPolicy.summary,
    maxSuccessfulBookingsPerOccurrence: input.rule.maxSuccessfulBookingsPerOccurrence,
    maxFutureActiveBookings: input.rule.maxFutureActiveBookings
  };
}

export function computeCoveredFieldsHash(input: AuthorizationReviewInput): string {
  const canonical = JSON.stringify(canonicalize(materialFieldsFor(input)));
  return createHash('sha256').update(canonical).digest('hex');
}

export function buildAuthorizationSummary(input: AuthorizationReviewInput): AuthorizationReviewSummary {
  return {
    mode: input.mode,
    accountLabel: input.accountLabel,
    club: {
      id: input.club.id,
      name: input.club.name,
      location: input.club.location,
      timezone: input.club.timezone,
      verified: input.club.verified
    },
    playDate: input.rule.playDate,
    preferredStartTime: input.rule.preferredStartTime,
    durationMinutes: input.rule.durationMinutes,
    preferredCourtIds: input.rule.preferredCourtIds,
    fallbackOptions: input.rule.fallbackOptions,
    exactTimeOnly: input.rule.exactTimeOnly,
    release: input.rule.release,
    maxTotalPrice: input.rule.maxTotalPrice,
    currency: input.rule.currency,
    maxSuccessfulBookingsPerOccurrence: input.rule.maxSuccessfulBookingsPerOccurrence,
    maxFutureActiveBookings: input.rule.maxFutureActiveBookings,
    allowedPaymentMethodLabel: input.allowedPaymentMethodLabel,
    cancellationPolicy: input.cancellationPolicy,
    authorizationExpiresAtUtc: input.authorizationExpiresAtUtc
  };
}

/**
 * Returns true if `currentInput`'s material fields differ from the hash
 * recorded on a previously-granted authorization — meaning that
 * authorization no longer covers the current configuration and unattended
 * checkout must stop until the user re-reviews and re-arms.
 */
export function hasMaterialChange(previousHash: string, currentInput: AuthorizationReviewInput): boolean {
  return computeCoveredFieldsHash(currentInput) !== previousHash;
}

/**
 * Spec: "If cancellation terms cannot be obtained or materially change, stop
 * unattended checkout and require review." Call this at preflight time, not
 * just at arming time, in case the club's policy changed since authorization.
 */
export function cancellationPolicyBlocksUnattendedCheckout(policy: CancellationPolicyInfo): boolean {
  return !policy.available;
}
