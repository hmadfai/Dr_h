import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/core/persistence/db.js';
import { ClubRepository } from '../../src/core/persistence/repositories/clubRepository.js';
import { RuleRepository } from '../../src/core/persistence/repositories/ruleRepository.js';
import { OccurrenceRepository } from '../../src/core/persistence/repositories/occurrenceRepository.js';
import { BookingRepository } from '../../src/core/persistence/repositories/bookingRepository.js';
import { AuthorizationRepository } from '../../src/core/persistence/repositories/authorizationRepository.js';
import { SqliteOccurrenceLockStore } from '../../src/core/persistence/repositories/occurrenceLockRepository.js';
import { buildFictionalRule, buildOccurrence, FICTIONAL_CLUB } from '../helpers/fixtures.js';

function freshDb() {
  return openDatabase({ filePath: ':memory:' });
}

describe('SQLite persistence layer', () => {
  it('round-trips a club, rule, and occurrence', () => {
    const db = freshDb();
    const clubs = new ClubRepository(db);
    const rules = new RuleRepository(db);
    const occurrences = new OccurrenceRepository(db);

    clubs.upsert(FICTIONAL_CLUB);
    expect(clubs.getById(FICTIONAL_CLUB.id)).toEqual(FICTIONAL_CLUB);

    const rule = buildFictionalRule();
    rules.upsert(rule);
    expect(rules.getById(rule.id)).toEqual(rule);

    const occurrence = buildOccurrence(rule, { status: 'ARMED' });
    occurrences.insert(occurrence);
    expect(occurrences.getById(occurrence.id)).toEqual(occurrence);
    expect(occurrences.findByRuleAndPlayDate(rule.id, occurrence.playDate)?.id).toBe(occurrence.id);

    db.close();
  });

  it('enforces one occurrence per (rule, play date) via the unique constraint', () => {
    const db = freshDb();
    const rules = new RuleRepository(db);
    const clubs = new ClubRepository(db);
    const occurrences = new OccurrenceRepository(db);
    clubs.upsert(FICTIONAL_CLUB);
    const rule = buildFictionalRule();
    rules.upsert(rule);
    occurrences.insert(buildOccurrence(rule, { id: 'occ-a', intentId: 'intent-a' }));
    expect(() => occurrences.insert(buildOccurrence(rule, { id: 'occ-b', intentId: 'intent-b' }))).toThrow();
    db.close();
  });

  it('listSchedulable excludes occurrences belonging to a paused rule', () => {
    const db = freshDb();
    const clubs = new ClubRepository(db);
    const rules = new RuleRepository(db);
    const occurrences = new OccurrenceRepository(db);
    clubs.upsert(FICTIONAL_CLUB);
    const rule = buildFictionalRule();
    rules.upsert(rule);
    occurrences.insert(buildOccurrence(rule, { status: 'ARMED' }));

    expect(occurrences.listSchedulable()).toHaveLength(1);
    rules.setPaused(rule.id, true);
    expect(occurrences.listSchedulable()).toHaveLength(0);
    rules.setPaused(rule.id, false);
    expect(occurrences.listSchedulable()).toHaveLength(1);
    db.close();
  });

  it('records booking outcomes and counts active/successful bookings correctly', () => {
    const db = freshDb();
    const clubs = new ClubRepository(db);
    const rules = new RuleRepository(db);
    const occurrences = new OccurrenceRepository(db);
    const bookings = new BookingRepository(db);
    clubs.upsert(FICTIONAL_CLUB);
    const rule = buildFictionalRule();
    rules.upsert(rule);
    const occurrence = buildOccurrence(rule, { playStartUtc: '2099-01-01T00:00:00.000Z' });
    occurrences.insert(occurrence);

    bookings.insert('booking-1', {
      occurrenceId: occurrence.id,
      ruleId: rule.id,
      clubId: rule.clubId,
      intentId: occurrence.intentId,
      outcome: 'CONFIRMED',
      bookingReference: 'REF-1',
      courtId: 'court-1',
      courtName: 'Court 1',
      startUtc: occurrence.playStartUtc,
      endUtc: occurrence.playEndUtc,
      price: 24,
      currency: 'EUR',
      failureReason: null
    }, 'mock', new Date().toISOString());

    expect(occurrences.countSuccessfulForOccurrence(occurrence.id)).toBe(1);
    expect(occurrences.countActiveForRule(rule.id, '2000-01-01T00:00:00.000Z')).toBe(1);
    expect(bookings.listByRule(rule.id)).toHaveLength(1);
  });

  it('tracks the active authorization snapshot and revocation', () => {
    const db = freshDb();
    const clubs = new ClubRepository(db);
    const rules = new RuleRepository(db);
    const auth = new AuthorizationRepository(db);
    clubs.upsert(FICTIONAL_CLUB);
    const rule = buildFictionalRule();
    rules.upsert(rule);

    expect(auth.getActiveForRule(rule.id)).toBeNull();
    const v1 = auth.nextVersion(rule.id);
    auth.insert({ id: 'auth-1', ruleId: rule.id, version: v1, createdAtUtc: new Date().toISOString(), expiresAtUtc: null, summaryJson: '{}', coveredFieldsHash: 'hash-1', revokedAtUtc: null });
    expect(auth.getActiveForRule(rule.id)?.id).toBe('auth-1');

    auth.revoke('auth-1', new Date().toISOString());
    expect(auth.getActiveForRule(rule.id)).toBeNull();

    const v2 = auth.nextVersion(rule.id);
    expect(v2).toBe(2);
  });

  it('SqliteOccurrenceLockStore prevents a second worker from acquiring a live lock', () => {
    const db = freshDb();
    const locks = new SqliteOccurrenceLockStore(db);
    expect(locks.tryAcquire('occ-1', 'worker-a', 1000, 5000)).toBe(true);
    expect(locks.tryAcquire('occ-1', 'worker-b', 1500, 5000)).toBe(false);
    locks.release('occ-1', 'worker-a');
    expect(locks.tryAcquire('occ-1', 'worker-b', 1600, 5000)).toBe(true);
  });
});
