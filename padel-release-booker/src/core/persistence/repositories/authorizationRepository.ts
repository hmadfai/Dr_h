import type { AppDatabase } from '../db.js';
import type { AuthorizationSnapshot } from '../../domain/types.js';

interface AuthRow {
  id: string;
  rule_id: string;
  version: number;
  created_at_utc: string;
  expires_at_utc: string | null;
  summary_json: string;
  covered_fields_hash: string;
  revoked_at_utc: string | null;
}

function rowToSnapshot(row: AuthRow): AuthorizationSnapshot {
  return {
    id: row.id,
    ruleId: row.rule_id,
    version: row.version,
    createdAtUtc: row.created_at_utc,
    expiresAtUtc: row.expires_at_utc,
    summaryJson: row.summary_json,
    coveredFieldsHash: row.covered_fields_hash,
    revokedAtUtc: row.revoked_at_utc
  };
}

export class AuthorizationRepository {
  constructor(private readonly db: AppDatabase) {}

  insert(snapshot: AuthorizationSnapshot): void {
    this.db
      .prepare(
        `INSERT INTO authorization_snapshots (id, rule_id, version, created_at_utc, expires_at_utc, summary_json, covered_fields_hash, revoked_at_utc)
         VALUES (@id, @ruleId, @version, @createdAtUtc, @expiresAtUtc, @summaryJson, @coveredFieldsHash, @revokedAtUtc)`
      )
      .run(snapshot);
  }

  getActiveForRule(ruleId: string): AuthorizationSnapshot | null {
    const row = this.db
      .prepare(
        `SELECT * FROM authorization_snapshots WHERE rule_id = ? AND revoked_at_utc IS NULL ORDER BY version DESC LIMIT 1`
      )
      .get(ruleId) as AuthRow | undefined;
    return row ? rowToSnapshot(row) : null;
  }

  listForRule(ruleId: string): AuthorizationSnapshot[] {
    const rows = this.db
      .prepare('SELECT * FROM authorization_snapshots WHERE rule_id = ? ORDER BY version DESC')
      .all(ruleId) as AuthRow[];
    return rows.map(rowToSnapshot);
  }

  revoke(id: string, revokedAtUtc: string): void {
    this.db.prepare('UPDATE authorization_snapshots SET revoked_at_utc = ? WHERE id = ?').run(revokedAtUtc, id);
  }

  nextVersion(ruleId: string): number {
    const row = this.db
      .prepare('SELECT MAX(version) as maxVersion FROM authorization_snapshots WHERE rule_id = ?')
      .get(ruleId) as { maxVersion: number | null };
    return (row.maxVersion ?? 0) + 1;
  }
}
