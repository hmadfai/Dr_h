import { describe, expect, it } from 'vitest';
import { applyOccurrenceEvent, IllegalTransitionError, isTerminal } from '../../src/core/domain/stateMachine.js';
import type { TransitionResult } from '../../src/core/domain/stateMachine.js';

function at(status: TransitionResult['status']): TransitionResult {
  return { status, pausedFromStatus: null, terminalReason: null };
}

describe('occurrence state machine', () => {
  it('walks the full happy path from DRAFT to CONFIRMED', () => {
    let s = at('DRAFT');
    s = applyOccurrenceEvent(s, { type: 'ARM' });
    expect(s.status).toBe('ARMED');
    s = applyOccurrenceEvent(s, { type: 'PREFLIGHT_DUE' });
    expect(s.status).toBe('PREFLIGHT');
    s = applyOccurrenceEvent(s, { type: 'PREFLIGHT_PASSED' });
    expect(s.status).toBe('WAITING_FOR_RELEASE');
    s = applyOccurrenceEvent(s, { type: 'RELEASE_TIME_REACHED' });
    expect(s.status).toBe('CHECKING');
    s = applyOccurrenceEvent(s, { type: 'AVAILABILITY_FOUND' });
    expect(s.status).toBe('BOOKING');
    s = applyOccurrenceEvent(s, { type: 'SUBMIT_CONFIRMED' });
    expect(s.status).toBe('CONFIRMED');
    expect(isTerminal(s.status)).toBe(true);
  });

  it('allows CHECKING to loop on itself while polling with no availability yet', () => {
    let s = at('CHECKING');
    s = applyOccurrenceEvent(s, { type: 'NO_AVAILABILITY_YET' });
    expect(s.status).toBe('CHECKING');
  });

  it('expires CHECKING when the polling window closes with nothing eligible', () => {
    const s = applyOccurrenceEvent(at('CHECKING'), { type: 'POLLING_WINDOW_EXPIRED' });
    expect(s.status).toBe('EXPIRED');
    expect(s.terminalReason).toMatch(/polling window/i);
  });

  it('routes BOOKING failures and unknown outcomes correctly', () => {
    expect(applyOccurrenceEvent(at('BOOKING'), { type: 'SUBMIT_FAILED', reason: 'court taken' }).status).toBe('FAILED');
    expect(applyOccurrenceEvent(at('BOOKING'), { type: 'SUBMIT_TIMEOUT_UNKNOWN' }).status).toBe('UNKNOWN_OUTCOME');
    expect(applyOccurrenceEvent(at('BOOKING'), { type: 'REQUIRES_USER_ACTION', reason: '3DS' }).status).toBe('AWAITING_USER_ACTION');
  });

  it('resolves AWAITING_USER_ACTION via all three user-reported outcomes', () => {
    expect(applyOccurrenceEvent(at('AWAITING_USER_ACTION'), { type: 'USER_CONFIRMED_BOOKED' }).status).toBe('CONFIRMED');
    expect(applyOccurrenceEvent(at('AWAITING_USER_ACTION'), { type: 'USER_CONFIRMED_NOT_BOOKED', reason: 'sold out' }).status).toBe('FAILED');
    expect(applyOccurrenceEvent(at('AWAITING_USER_ACTION'), { type: 'USER_REPORTED_STILL_UNKNOWN' }).status).toBe('UNKNOWN_OUTCOME');
  });

  it('resolves UNKNOWN_OUTCOME via reconciliation', () => {
    expect(applyOccurrenceEvent(at('UNKNOWN_OUTCOME'), { type: 'RECONCILED_CONFIRMED' }).status).toBe('CONFIRMED');
    expect(applyOccurrenceEvent(at('UNKNOWN_OUTCOME'), { type: 'RECONCILED_NOT_BOOKED', reason: 'not found' }).status).toBe('FAILED');
    expect(applyOccurrenceEvent(at('UNKNOWN_OUTCOME'), { type: 'RECONCILIATION_INCONCLUSIVE', reason: 'adapter cannot verify' }).status).toBe(
      'AWAITING_USER_ACTION'
    );
  });

  it('pauses from any active state and resumes back to it (emergency stop)', () => {
    for (const status of ['ARMED', 'WAITING_FOR_RELEASE', 'CHECKING', 'BOOKING'] as const) {
      const paused = applyOccurrenceEvent(at(status), { type: 'PAUSE' });
      expect(paused.status).toBe('PAUSED');
      expect(paused.pausedFromStatus).toBe(status);
      const resumed = applyOccurrenceEvent(paused, { type: 'RESUME' });
      expect(resumed.status).toBe(status);
      expect(resumed.pausedFromStatus).toBeNull();
    }
  });

  it('refuses to pause a terminal state or double-pause', () => {
    expect(() => applyOccurrenceEvent(at('CONFIRMED'), { type: 'PAUSE' })).toThrow(IllegalTransitionError);
    expect(() => applyOccurrenceEvent(at('FAILED'), { type: 'PAUSE' })).toThrow(IllegalTransitionError);
    expect(() => applyOccurrenceEvent(at('PAUSED'), { type: 'PAUSE' })).toThrow(IllegalTransitionError);
  });

  it('refuses to resume when not paused', () => {
    expect(() => applyOccurrenceEvent(at('ARMED'), { type: 'RESUME' })).toThrow(IllegalTransitionError);
  });

  it('EXPIRE works from any non-terminal state but not from a terminal one', () => {
    expect(applyOccurrenceEvent(at('WAITING_FOR_RELEASE'), { type: 'EXPIRE', reason: 'missed while asleep' }).status).toBe('EXPIRED');
    expect(() => applyOccurrenceEvent(at('EXPIRED'), { type: 'EXPIRE', reason: 'x' })).toThrow(IllegalTransitionError);
    expect(() => applyOccurrenceEvent(at('CONFIRMED'), { type: 'EXPIRE', reason: 'x' })).toThrow(IllegalTransitionError);
  });

  it('rejects every transition not explicitly modeled', () => {
    expect(() => applyOccurrenceEvent(at('DRAFT'), { type: 'RELEASE_TIME_REACHED' })).toThrow(IllegalTransitionError);
    expect(() => applyOccurrenceEvent(at('WAITING_FOR_RELEASE'), { type: 'SUBMIT_CONFIRMED' })).toThrow(IllegalTransitionError);
    expect(() => applyOccurrenceEvent(at('CONFIRMED'), { type: 'ARM' })).toThrow(IllegalTransitionError);
  });
});
