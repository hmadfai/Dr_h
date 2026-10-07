import { describe, expect, it } from 'vitest';
import { InMemoryOccurrenceLockStore } from '../../src/core/engine/duplicateGuard.js';

describe('InMemoryOccurrenceLockStore', () => {
  it('lets one worker acquire, renew, and release its own lock', () => {
    const store = new InMemoryOccurrenceLockStore();
    expect(store.tryAcquire('occ-1', 'worker-a', 1000, 5000)).toBe(true);
    expect(store.tryAcquire('occ-1', 'worker-a', 2000, 5000)).toBe(true); // renew
    store.release('occ-1', 'worker-a');
    expect(store.isHeldByOther('occ-1', 'worker-b', 2500)).toBe(false);
  });

  it('refuses a second worker while the first worker holds a live lock (two competing local workers)', () => {
    const store = new InMemoryOccurrenceLockStore();
    expect(store.tryAcquire('occ-1', 'worker-a', 1000, 5000)).toBe(true);
    expect(store.tryAcquire('occ-1', 'worker-b', 1500, 5000)).toBe(false);
    expect(store.isHeldByOther('occ-1', 'worker-b', 1500)).toBe(true);
  });

  it('allows acquisition once the previous lock has expired', () => {
    const store = new InMemoryOccurrenceLockStore();
    expect(store.tryAcquire('occ-1', 'worker-a', 1000, 1000)).toBe(true); // expires at 2000
    expect(store.tryAcquire('occ-1', 'worker-b', 2500, 1000)).toBe(true);
  });

  it('does not let a worker release a lock it does not hold', () => {
    const store = new InMemoryOccurrenceLockStore();
    store.tryAcquire('occ-1', 'worker-a', 1000, 5000);
    store.release('occ-1', 'worker-b');
    expect(store.isHeldByOther('occ-1', 'worker-b', 1500)).toBe(true);
  });
});
