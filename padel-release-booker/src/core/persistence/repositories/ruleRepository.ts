import type { AppDatabase } from '../db.js';
import type { BookingRule } from '../../domain/types.js';

interface RuleRow {
  id: string;
  name: string;
  club_id: string;
  play_date_pattern_json: string;
  preferred_start_time: string;
  duration_minutes: number;
  preferred_court_ids_json: string;
  surface_preference: BookingRule['surfacePreference'];
  exact_time_only: number;
  fallback_options_json: string;
  max_total_price: number;
  currency: string;
  max_successful_bookings_per_occurrence: number;
  max_future_active_bookings: number;
  exclusion_dates_json: string;
  release_json: string;
  preflight_minutes_before_release: number;
  polling_window_seconds: number;
  polling_interval_seconds: number;
  ambiguous_local_time_policy: BookingRule['ambiguousLocalTimePolicy'];
  nonexistent_local_time_policy: BookingRule['nonexistentLocalTimePolicy'];
  mode: BookingRule['mode'];
  is_paused: number;
  created_at_utc: string;
  updated_at_utc: string;
}

function rowToRule(row: RuleRow): BookingRule {
  return {
    id: row.id,
    name: row.name,
    clubId: row.club_id,
    playDate: JSON.parse(row.play_date_pattern_json),
    preferredStartTime: row.preferred_start_time,
    durationMinutes: row.duration_minutes,
    preferredCourtIds: JSON.parse(row.preferred_court_ids_json),
    surfacePreference: row.surface_preference,
    exactTimeOnly: row.exact_time_only === 1,
    fallbackOptions: JSON.parse(row.fallback_options_json),
    maxTotalPrice: row.max_total_price,
    currency: row.currency,
    maxSuccessfulBookingsPerOccurrence: row.max_successful_bookings_per_occurrence,
    maxFutureActiveBookings: row.max_future_active_bookings,
    exclusionDates: JSON.parse(row.exclusion_dates_json),
    release: JSON.parse(row.release_json),
    preflightMinutesBeforeRelease: row.preflight_minutes_before_release,
    pollingWindowSeconds: row.polling_window_seconds,
    pollingIntervalSeconds: row.polling_interval_seconds,
    ambiguousLocalTimePolicy: row.ambiguous_local_time_policy,
    nonexistentLocalTimePolicy: row.nonexistent_local_time_policy,
    mode: row.mode,
    createdAtUtc: row.created_at_utc,
    updatedAtUtc: row.updated_at_utc
  };
}

export class RuleRepository {
  constructor(private readonly db: AppDatabase) {}

  upsert(rule: BookingRule): void {
    this.db
      .prepare(
        `INSERT INTO booking_rules (
           id, name, club_id, play_date_pattern_json, preferred_start_time, duration_minutes,
           preferred_court_ids_json, surface_preference, exact_time_only, fallback_options_json,
           max_total_price, currency, max_successful_bookings_per_occurrence, max_future_active_bookings,
           exclusion_dates_json, release_json, preflight_minutes_before_release, polling_window_seconds,
           polling_interval_seconds, ambiguous_local_time_policy, nonexistent_local_time_policy, mode,
           created_at_utc, updated_at_utc
         ) VALUES (
           @id, @name, @clubId, @playDatePatternJson, @preferredStartTime, @durationMinutes,
           @preferredCourtIdsJson, @surfacePreference, @exactTimeOnly, @fallbackOptionsJson,
           @maxTotalPrice, @currency, @maxSuccessfulBookingsPerOccurrence, @maxFutureActiveBookings,
           @exclusionDatesJson, @releaseJson, @preflightMinutesBeforeRelease, @pollingWindowSeconds,
           @pollingIntervalSeconds, @ambiguousLocalTimePolicy, @nonexistentLocalTimePolicy, @mode,
           @createdAtUtc, @updatedAtUtc
         )
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, club_id = excluded.club_id, play_date_pattern_json = excluded.play_date_pattern_json,
           preferred_start_time = excluded.preferred_start_time, duration_minutes = excluded.duration_minutes,
           preferred_court_ids_json = excluded.preferred_court_ids_json, surface_preference = excluded.surface_preference,
           exact_time_only = excluded.exact_time_only, fallback_options_json = excluded.fallback_options_json,
           max_total_price = excluded.max_total_price, currency = excluded.currency,
           max_successful_bookings_per_occurrence = excluded.max_successful_bookings_per_occurrence,
           max_future_active_bookings = excluded.max_future_active_bookings,
           exclusion_dates_json = excluded.exclusion_dates_json, release_json = excluded.release_json,
           preflight_minutes_before_release = excluded.preflight_minutes_before_release,
           polling_window_seconds = excluded.polling_window_seconds, polling_interval_seconds = excluded.polling_interval_seconds,
           ambiguous_local_time_policy = excluded.ambiguous_local_time_policy,
           nonexistent_local_time_policy = excluded.nonexistent_local_time_policy, mode = excluded.mode,
           updated_at_utc = excluded.updated_at_utc`
      )
      .run({
        id: rule.id,
        name: rule.name,
        clubId: rule.clubId,
        playDatePatternJson: JSON.stringify(rule.playDate),
        preferredStartTime: rule.preferredStartTime,
        durationMinutes: rule.durationMinutes,
        preferredCourtIdsJson: JSON.stringify(rule.preferredCourtIds),
        surfacePreference: rule.surfacePreference,
        exactTimeOnly: rule.exactTimeOnly ? 1 : 0,
        fallbackOptionsJson: JSON.stringify(rule.fallbackOptions),
        maxTotalPrice: rule.maxTotalPrice,
        currency: rule.currency,
        maxSuccessfulBookingsPerOccurrence: rule.maxSuccessfulBookingsPerOccurrence,
        maxFutureActiveBookings: rule.maxFutureActiveBookings,
        exclusionDatesJson: JSON.stringify(rule.exclusionDates),
        releaseJson: JSON.stringify(rule.release),
        preflightMinutesBeforeRelease: rule.preflightMinutesBeforeRelease,
        pollingWindowSeconds: rule.pollingWindowSeconds,
        pollingIntervalSeconds: rule.pollingIntervalSeconds,
        ambiguousLocalTimePolicy: rule.ambiguousLocalTimePolicy,
        nonexistentLocalTimePolicy: rule.nonexistentLocalTimePolicy,
        mode: rule.mode,
        createdAtUtc: rule.createdAtUtc,
        updatedAtUtc: rule.updatedAtUtc
      });
  }

  getById(id: string): BookingRule | null {
    const row = this.db.prepare('SELECT * FROM booking_rules WHERE id = ?').get(id) as RuleRow | undefined;
    return row ? rowToRule(row) : null;
  }

  list(): BookingRule[] {
    const rows = this.db.prepare('SELECT * FROM booking_rules ORDER BY created_at_utc').all() as RuleRow[];
    return rows.map(rowToRule);
  }

  setPaused(ruleId: string, paused: boolean): void {
    this.db.prepare('UPDATE booking_rules SET is_paused = ? WHERE id = ?').run(paused ? 1 : 0, ruleId);
  }

  isPaused(ruleId: string): boolean {
    const row = this.db.prepare('SELECT is_paused FROM booking_rules WHERE id = ?').get(ruleId) as { is_paused: number } | undefined;
    return row ? row.is_paused === 1 : false;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM booking_rules WHERE id = ?').run(id);
  }
}
