import type { AppDatabase } from '../db.js';
import type { AdapterMode, BookingRecord } from '../../domain/types.js';
import type { BookingRecordDraft } from '../../engine/bookingEngine.js';

interface BookingRow {
  id: string;
  occurrence_id: string;
  rule_id: string;
  club_id: string;
  intent_id: string;
  outcome: BookingRecord['outcome'];
  booking_reference: string | null;
  court_id: string | null;
  court_name: string | null;
  start_utc: string | null;
  end_utc: string | null;
  price: number | null;
  currency: string | null;
  failure_reason: string | null;
  mode: AdapterMode;
  created_at_utc: string;
}

function rowToRecord(row: BookingRow): BookingRecord {
  return {
    id: row.id,
    occurrenceId: row.occurrence_id,
    ruleId: row.rule_id,
    clubId: row.club_id,
    intentId: row.intent_id,
    outcome: row.outcome,
    bookingReference: row.booking_reference,
    courtId: row.court_id,
    courtName: row.court_name,
    startUtc: row.start_utc,
    endUtc: row.end_utc,
    price: row.price,
    currency: row.currency,
    failureReason: row.failure_reason,
    mode: row.mode,
    createdAtUtc: row.created_at_utc
  };
}

export class BookingRepository {
  constructor(private readonly db: AppDatabase) {}

  insert(id: string, draft: BookingRecordDraft, mode: AdapterMode, createdAtUtc: string): void {
    this.db
      .prepare(
        `INSERT INTO booking_records (
           id, occurrence_id, rule_id, club_id, intent_id, outcome, booking_reference,
           court_id, court_name, start_utc, end_utc, price, currency, failure_reason, mode, created_at_utc
         ) VALUES (
           @id, @occurrenceId, @ruleId, @clubId, @intentId, @outcome, @bookingReference,
           @courtId, @courtName, @startUtc, @endUtc, @price, @currency, @failureReason, @mode, @createdAtUtc
         )`
      )
      .run({ id, ...draft, mode, createdAtUtc });
  }

  listByRule(ruleId: string): BookingRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM booking_records WHERE rule_id = ? ORDER BY created_at_utc DESC')
      .all(ruleId) as BookingRow[];
    return rows.map(rowToRecord);
  }

  listRecent(limit: number): BookingRecord[] {
    const rows = this.db.prepare('SELECT * FROM booking_records ORDER BY created_at_utc DESC LIMIT ?').all(limit) as BookingRow[];
    return rows.map(rowToRecord);
  }

  listByOccurrence(occurrenceId: string): BookingRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM booking_records WHERE occurrence_id = ? ORDER BY created_at_utc DESC')
      .all(occurrenceId) as BookingRow[];
    return rows.map(rowToRecord);
  }
}
