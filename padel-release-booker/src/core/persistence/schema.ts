/**
 * SQLite schema for all durable local state. Nothing secret is ever stored
 * here: credentials, cookies, and tokens live in macOS Keychain (see
 * `core/security/secretsStore.ts`); this database only holds structured
 * booking data, so it is safe to inspect/back up on disk (though it can
 * still contain personal data such as names/clubs, hence it is `.gitignore`d
 * and excluded from diagnostic exports by default).
 */

export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  timezone TEXT NOT NULL,
  source_url TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  confirmed_at_utc TEXT
);

CREATE TABLE IF NOT EXISTS courts (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  surface TEXT NOT NULL DEFAULT 'unknown'
);

CREATE TABLE IF NOT EXISTS booking_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  play_date_pattern_json TEXT NOT NULL,
  preferred_start_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  preferred_court_ids_json TEXT NOT NULL,
  surface_preference TEXT NOT NULL DEFAULT 'no-preference',
  exact_time_only INTEGER NOT NULL DEFAULT 1,
  fallback_options_json TEXT NOT NULL DEFAULT '[]',
  max_total_price REAL NOT NULL,
  currency TEXT NOT NULL,
  max_successful_bookings_per_occurrence INTEGER NOT NULL DEFAULT 1,
  max_future_active_bookings INTEGER NOT NULL DEFAULT 1,
  exclusion_dates_json TEXT NOT NULL DEFAULT '[]',
  release_json TEXT NOT NULL,
  preflight_minutes_before_release INTEGER NOT NULL DEFAULT 5,
  polling_window_seconds INTEGER NOT NULL DEFAULT 90,
  polling_interval_seconds INTEGER NOT NULL DEFAULT 3,
  ambiguous_local_time_policy TEXT NOT NULL DEFAULT 'latest',
  nonexistent_local_time_policy TEXT NOT NULL DEFAULT 'push-forward',
  mode TEXT NOT NULL DEFAULT 'mock',
  is_paused INTEGER NOT NULL DEFAULT 0,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS occurrences (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES booking_rules(id) ON DELETE CASCADE,
  play_date TEXT NOT NULL,
  play_start_utc TEXT NOT NULL,
  play_end_utc TEXT NOT NULL,
  release_at_utc TEXT NOT NULL,
  status TEXT NOT NULL,
  paused_from_status TEXT,
  terminal_reason TEXT,
  intent_id TEXT NOT NULL UNIQUE,
  locked_by_worker_id TEXT,
  lock_expires_at_utc TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  UNIQUE (rule_id, play_date)
);

CREATE INDEX IF NOT EXISTS idx_occurrences_status ON occurrences(status);
CREATE INDEX IF NOT EXISTS idx_occurrences_rule ON occurrences(rule_id);

CREATE TABLE IF NOT EXISTS booking_records (
  id TEXT PRIMARY KEY,
  occurrence_id TEXT NOT NULL REFERENCES occurrences(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,
  club_id TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  booking_reference TEXT,
  court_id TEXT,
  court_name TEXT,
  start_utc TEXT,
  end_utc TEXT,
  price REAL,
  currency TEXT,
  failure_reason TEXT,
  mode TEXT NOT NULL,
  created_at_utc TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_booking_records_occurrence ON booking_records(occurrence_id);
CREATE INDEX IF NOT EXISTS idx_booking_records_rule ON booking_records(rule_id);

CREATE TABLE IF NOT EXISTS authorization_snapshots (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES booking_rules(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  created_at_utc TEXT NOT NULL,
  expires_at_utc TEXT,
  summary_json TEXT NOT NULL,
  covered_fields_hash TEXT NOT NULL,
  revoked_at_utc TEXT
);

CREATE INDEX IF NOT EXISTS idx_authorization_rule ON authorization_snapshots(rule_id);

CREATE TABLE IF NOT EXISTS occurrence_locks (
  occurrence_id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS connection_sessions (
  mode TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  account_label TEXT,
  connected_at_utc TEXT,
  expires_at_utc TEXT,
  last_error TEXT
);
`;
