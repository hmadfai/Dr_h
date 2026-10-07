import { describe, expect, it } from 'vitest';
import { buildAuthorizationSummary, cancellationPolicyBlocksUnattendedCheckout, computeCoveredFieldsHash, hasMaterialChange } from '../../src/core/domain/authorization.js';
import type { AuthorizationReviewInput } from '../../src/core/domain/authorization.js';
import { buildFictionalRule, FICTIONAL_CLUB } from '../helpers/fixtures.js';

function makeInput(overrides: Partial<AuthorizationReviewInput> = {}): AuthorizationReviewInput {
  return {
    mode: 'mock',
    club: FICTIONAL_CLUB,
    accountLabel: 'player@example.invalid',
    rule: buildFictionalRule(),
    allowedPaymentMethodLabel: 'Visa •••• 4242 (on file with Playtomic)',
    cancellationPolicy: { available: true, summary: 'Free cancellation up to 24h before.', nonRefundableFeesSummary: null },
    authorizationExpiresAtUtc: null,
    ...overrides
  };
}

describe('authorization snapshot', () => {
  it('produces a stable hash for identical material fields', () => {
    const a = computeCoveredFieldsHash(makeInput());
    const b = computeCoveredFieldsHash(makeInput());
    expect(a).toBe(b);
  });

  it('changes the hash when the price cap changes', () => {
    const base = computeCoveredFieldsHash(makeInput());
    const changed = computeCoveredFieldsHash(makeInput({ rule: buildFictionalRule({ maxTotalPrice: 999 }) }));
    expect(changed).not.toBe(base);
  });

  it('changes the hash when the club changes', () => {
    const base = computeCoveredFieldsHash(makeInput());
    const changed = computeCoveredFieldsHash(makeInput({ club: { ...FICTIONAL_CLUB, id: 'a-different-club' } }));
    expect(changed).not.toBe(base);
  });

  it('changes the hash when the cancellation policy summary changes', () => {
    const base = computeCoveredFieldsHash(makeInput());
    const changed = computeCoveredFieldsHash(
      makeInput({ cancellationPolicy: { available: true, summary: 'No refunds at all.', nonRefundableFeesSummary: null } })
    );
    expect(changed).not.toBe(base);
  });

  it('does not change the hash for fields that are not material (e.g. the account label)', () => {
    const base = computeCoveredFieldsHash(makeInput());
    const changed = computeCoveredFieldsHash(makeInput({ accountLabel: 'someone-else@example.invalid' }));
    expect(changed).toBe(base);
  });

  it('hasMaterialChange detects drift against a previously stored hash', () => {
    const original = makeInput();
    const previousHash = computeCoveredFieldsHash(original);
    expect(hasMaterialChange(previousHash, original)).toBe(false);
    const driftedRule = { ...original.rule, maxTotalPrice: original.rule.maxTotalPrice + 5 };
    expect(hasMaterialChange(previousHash, { ...original, rule: driftedRule })).toBe(true);
  });

  it('builds a human-readable summary including every field the review screen must show', () => {
    const summary = buildAuthorizationSummary(makeInput());
    expect(summary.club.name).toBe(FICTIONAL_CLUB.name);
    expect(summary.maxTotalPrice).toBe(28);
    expect(summary.currency).toBe('EUR');
    expect(summary.allowedPaymentMethodLabel).toContain('Visa');
    expect(summary.cancellationPolicy.available).toBe(true);
  });
});

describe('cancellationPolicyBlocksUnattendedCheckout', () => {
  it('blocks when the policy was not obtained', () => {
    expect(cancellationPolicyBlocksUnattendedCheckout({ available: false, summary: '', nonRefundableFeesSummary: null })).toBe(true);
  });

  it('does not block when a policy is available, regardless of its content', () => {
    expect(cancellationPolicyBlocksUnattendedCheckout({ available: true, summary: 'No refunds.', nonRefundableFeesSummary: 'Full fee if cancelled late.' })).toBe(
      false
    );
  });
});
