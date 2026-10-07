/**
 * Pure, synchronous occurrence state machine. No I/O, no clock reads — the
 * engine decides *when* to fire an event; this module only decides whether a
 * transition is legal and what the resulting state is. This separation is
 * what makes exhaustive unit testing of "two competing local workers",
 * "restart during BOOKING", etc. possible without a real scheduler.
 */

import type { OccurrenceStatus } from './types.js';

export type OccurrenceEvent =
  | { type: 'ARM' }
  | { type: 'PREFLIGHT_DUE' }
  | { type: 'PREFLIGHT_PASSED' }
  | { type: 'PREFLIGHT_FAILED'; reason: string }
  | { type: 'RELEASE_TIME_REACHED' }
  | { type: 'AVAILABILITY_FOUND' }
  | { type: 'NO_AVAILABILITY_YET' }
  | { type: 'POLLING_WINDOW_EXPIRED' }
  | { type: 'SUBMIT_CONFIRMED' }
  | { type: 'SUBMIT_FAILED'; reason: string }
  | { type: 'SUBMIT_TIMEOUT_UNKNOWN' }
  | { type: 'REQUIRES_USER_ACTION'; reason: string }
  | { type: 'USER_CONFIRMED_BOOKED' }
  | { type: 'USER_CONFIRMED_NOT_BOOKED'; reason: string }
  | { type: 'USER_REPORTED_STILL_UNKNOWN' }
  | { type: 'RECONCILED_CONFIRMED' }
  | { type: 'RECONCILED_NOT_BOOKED'; reason: string }
  | { type: 'RECONCILIATION_INCONCLUSIVE'; reason: string }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'EXPIRE'; reason: string };

export interface TransitionResult {
  status: OccurrenceStatus;
  pausedFromStatus: OccurrenceStatus | null;
  terminalReason: string | null;
}

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: OccurrenceStatus,
    public readonly event: OccurrenceEvent
  ) {
    super(`Illegal transition: cannot apply event "${event.type}" while in state "${from}"`);
  }
}

const TERMINAL_STATES: ReadonlySet<OccurrenceStatus> = new Set(['CONFIRMED', 'FAILED', 'EXPIRED']);

export function isTerminal(status: OccurrenceStatus): boolean {
  return TERMINAL_STATES.has(status);
}

/**
 * Apply one event to one current state. Throws IllegalTransitionError for
 * any transition not explicitly modeled — this is intentional: silently
 * ignoring an unexpected event in a booking/payment system is exactly the
 * kind of bug that causes duplicate charges.
 */
export function applyOccurrenceEvent(
  current: TransitionResult,
  event: OccurrenceEvent
): TransitionResult {
  const from = current.status;

  // PAUSE is legal from any non-terminal state and always wins.
  if (event.type === 'PAUSE') {
    if (isTerminal(from) || from === 'PAUSED') {
      throw new IllegalTransitionError(from, event);
    }
    return { status: 'PAUSED', pausedFromStatus: from, terminalReason: null };
  }

  if (event.type === 'RESUME') {
    if (from !== 'PAUSED' || current.pausedFromStatus === null) {
      throw new IllegalTransitionError(from, event);
    }
    return { status: current.pausedFromStatus, pausedFromStatus: null, terminalReason: null };
  }

  if (event.type === 'EXPIRE') {
    if (isTerminal(from)) {
      throw new IllegalTransitionError(from, event);
    }
    return { status: 'EXPIRED', pausedFromStatus: null, terminalReason: event.reason };
  }

  switch (from) {
    case 'DRAFT':
      if (event.type === 'ARM') return done('ARMED');
      break;
    case 'ARMED':
      if (event.type === 'PREFLIGHT_DUE') return done('PREFLIGHT');
      break;
    case 'PREFLIGHT':
      if (event.type === 'PREFLIGHT_PASSED') return done('WAITING_FOR_RELEASE');
      if (event.type === 'PREFLIGHT_FAILED') return done('FAILED', event.reason);
      if (event.type === 'REQUIRES_USER_ACTION') return done('AWAITING_USER_ACTION', event.reason);
      break;
    case 'WAITING_FOR_RELEASE':
      if (event.type === 'RELEASE_TIME_REACHED') return done('CHECKING');
      break;
    case 'CHECKING':
      if (event.type === 'AVAILABILITY_FOUND') return done('BOOKING');
      if (event.type === 'NO_AVAILABILITY_YET') return done('CHECKING');
      if (event.type === 'POLLING_WINDOW_EXPIRED') return done('EXPIRED', 'Polling window closed with no eligible availability observed.');
      if (event.type === 'REQUIRES_USER_ACTION') return done('AWAITING_USER_ACTION', event.reason);
      break;
    case 'BOOKING':
      if (event.type === 'SUBMIT_CONFIRMED') return done('CONFIRMED');
      if (event.type === 'SUBMIT_FAILED') return done('FAILED', event.reason);
      if (event.type === 'SUBMIT_TIMEOUT_UNKNOWN') return done('UNKNOWN_OUTCOME');
      if (event.type === 'REQUIRES_USER_ACTION') return done('AWAITING_USER_ACTION', event.reason);
      break;
    case 'AWAITING_USER_ACTION':
      if (event.type === 'USER_CONFIRMED_BOOKED') return done('CONFIRMED');
      if (event.type === 'USER_CONFIRMED_NOT_BOOKED') return done('FAILED', event.reason);
      if (event.type === 'USER_REPORTED_STILL_UNKNOWN') return done('UNKNOWN_OUTCOME');
      break;
    case 'UNKNOWN_OUTCOME':
      if (event.type === 'RECONCILED_CONFIRMED') return done('CONFIRMED');
      if (event.type === 'RECONCILED_NOT_BOOKED') return done('FAILED', event.reason);
      if (event.type === 'RECONCILIATION_INCONCLUSIVE') return done('AWAITING_USER_ACTION', event.reason);
      break;
    case 'CONFIRMED':
    case 'FAILED':
    case 'EXPIRED':
    case 'PAUSED':
      break;
  }

  throw new IllegalTransitionError(from, event);

  function done(status: OccurrenceStatus, terminalReason: string | null = null): TransitionResult {
    return { status, pausedFromStatus: null, terminalReason };
  }
}
