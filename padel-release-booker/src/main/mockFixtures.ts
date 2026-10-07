/**
 * Default sandbox data for Mock mode. Entirely fictional — never a real
 * Playtomic club — used so the app is immediately explorable without any
 * setup. Clearly separate from the "verified vs user-entered" club data a
 * real (assisted) connection would use.
 */
import { createDefaultMockWorld } from '../core/adapters/mockAdapter.js';
import type { MockWorld } from '../core/adapters/mockAdapter.js';

export function buildFictionalMockWorld(): MockWorld {
  const world = createDefaultMockWorld();
  world.clubs = [
    {
      id: 'club-fictional-riverside',
      name: 'Riverside Padel Club (fictional — sample data)',
      location: '1 Example Lane, Faketown, Imaginary County',
      timezone: 'Europe/Madrid',
      sourceUrl: 'https://playtomic.com/clubs/fictional-riverside-padel-club',
      verified: true
    },
    {
      id: 'club-fictional-harbourview',
      name: 'Harbourview Padel & Tennis (fictional — sample data)',
      location: '22 Pretend Quay, Faketown',
      timezone: 'Europe/London',
      sourceUrl: 'https://playtomic.com/clubs/fictional-harbourview',
      verified: true
    }
  ];
  world.courtsByClubId = {
    'club-fictional-riverside': [
      { id: 'court-1', name: 'Court 1 (indoor)', surface: 'indoor' },
      { id: 'court-2', name: 'Court 2 (indoor)', surface: 'indoor' },
      { id: 'court-3', name: 'Court 3 (outdoor)', surface: 'outdoor' }
    ],
    'club-fictional-harbourview': [
      { id: 'court-a', name: 'Court A (outdoor)', surface: 'outdoor' },
      { id: 'court-b', name: 'Court B (outdoor)', surface: 'outdoor' }
    ]
  };
  // Demo behavior: by default, the preferred slot becomes available exactly
  // at release and books successfully, so a first-time user sees the whole
  // pipeline work end-to-end before configuring anything themselves.
  world.getAvailability = (query) => ({
    kind: 'ok',
    slots: [
      {
        courtId: 'court-1',
        courtName: 'Court 1 (indoor)',
        surface: 'indoor',
        startUtc: query.startUtc,
        endUtc: query.endUtc,
        price: 24,
        currency: 'EUR'
      }
    ]
  });
  world.submitBooking = (params) => ({
    kind: 'confirmed',
    result: {
      outcome: 'CONFIRMED',
      bookingReference: `MOCK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      price: Math.min(24, params.maxTotalPrice),
      currency: params.currency,
      failureReason: null
    }
  });
  return world;
}
