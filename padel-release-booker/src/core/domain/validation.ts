/**
 * zod schemas for every value that crosses the renderer -> main IPC
 * boundary. The preload bridge only exposes typed functions, but a renderer
 * compromised by a bug (or a future dependency) could still send malformed
 * data, so the main process re-validates everything here before it ever
 * reaches the database or the booking engine.
 */
import { z } from 'zod';

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM (24h)');
export const weekdaySchema = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
export const ianaTimezoneSchema = z.string().min(1).refine(
  (tz) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Not a recognized IANA timezone' }
);

export const playDatePatternSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('one-off'), date: isoDateSchema }),
  z.object({
    kind: z.literal('recurring'),
    weekdays: z.array(weekdaySchema).min(1),
    endDate: isoDateSchema.nullable(),
    occurrenceLimit: z.number().int().positive().nullable()
  })
]);

export const releaseRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('one-off-timestamp'), releaseAtUtc: z.string().datetime(), verified: z.literal(false) }),
  z.object({
    kind: z.literal('days-before-at-local-time'),
    daysBefore: z.number().int().min(0).max(60),
    localTime: localTimeSchema,
    verified: z.boolean()
  })
]);

export const fallbackOptionSchema = z.object({
  startTime: localTimeSchema,
  courtIds: z.union([z.array(z.string().min(1)), z.literal('any')])
});

export const bookingRuleInputSchema = z.object({
  name: z.string().min(1).max(200),
  clubId: z.string().min(1),
  playDate: playDatePatternSchema,
  preferredStartTime: localTimeSchema,
  durationMinutes: z.number().int().positive().max(24 * 60),
  preferredCourtIds: z.union([z.array(z.string().min(1)), z.literal('any')]),
  surfacePreference: z.enum(['indoor', 'outdoor', 'no-preference']),
  exactTimeOnly: z.boolean(),
  fallbackOptions: z.array(fallbackOptionSchema).max(10),
  maxTotalPrice: z.number().positive().max(100_000),
  currency: z.string().length(3),
  maxSuccessfulBookingsPerOccurrence: z.number().int().min(1).max(10),
  maxFutureActiveBookings: z.number().int().min(1).max(100),
  exclusionDates: z.array(isoDateSchema).max(500),
  release: releaseRuleSchema,
  preflightMinutesBeforeRelease: z.number().int().min(0).max(120),
  pollingWindowSeconds: z.number().int().min(5).max(3600),
  pollingIntervalSeconds: z.number().int().min(1).max(600),
  ambiguousLocalTimePolicy: z.enum(['earliest', 'latest']),
  nonexistentLocalTimePolicy: z.enum(['push-forward', 'push-back']),
  mode: z.enum(['mock', 'assisted', 'automatic'])
});

export type BookingRuleInput = z.infer<typeof bookingRuleInputSchema>;

export const clubUrlInputSchema = z.object({
  url: z.string().url()
});

export const userOutcomeSchema = z.enum(['booked', 'not-booked', 'unknown']);

export const armRuleInputSchema = z.object({
  ruleId: z.string().min(1),
  reviewedSummaryHash: z.string().min(1)
});
