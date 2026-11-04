import type { AppDatabase } from '../db.js';
import type { AdapterMode, SessionInfo } from '../../domain/types.js';

interface SessionRow {
  mode: AdapterMode;
  state: SessionInfo['state'];
  account_label: string | null;
  connected_at_utc: string | null;
  expires_at_utc: string | null;
  last_error: string | null;
}

function rowToSession(row: SessionRow): SessionInfo {
  return {
    mode: row.mode,
    state: row.state,
    accountLabel: row.account_label,
    connectedAtUtc: row.connected_at_utc,
    expiresAtUtc: row.expires_at_utc,
    lastError: row.last_error
  };
}

/** Only non-secret connection metadata lives here. Tokens/cookies live in Keychain via secretsStore. */
export class SessionRepository {
  constructor(private readonly db: AppDatabase) {}

  save(session: SessionInfo): void {
    this.db
      .prepare(
        `INSERT INTO connection_sessions (mode, state, account_label, connected_at_utc, expires_at_utc, last_error)
         VALUES (@mode, @state, @accountLabel, @connectedAtUtc, @expiresAtUtc, @lastError)
         ON CONFLICT(mode) DO UPDATE SET
           state = excluded.state, account_label = excluded.account_label,
           connected_at_utc = excluded.connected_at_utc, expires_at_utc = excluded.expires_at_utc,
           last_error = excluded.last_error`
      )
      .run(session);
  }

  get(mode: AdapterMode): SessionInfo | null {
    const row = this.db.prepare('SELECT * FROM connection_sessions WHERE mode = ?').get(mode) as SessionRow | undefined;
    return row ? rowToSession(row) : null;
  }

  clear(mode: AdapterMode): void {
    this.db.prepare('DELETE FROM connection_sessions WHERE mode = ?').run(mode);
  }
}
