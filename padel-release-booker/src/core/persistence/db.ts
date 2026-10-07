import Database from 'better-sqlite3';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.js';

export type AppDatabase = Database.Database;

export interface OpenDatabaseOptions {
  /** Pass ':memory:' in tests for a throwaway database. */
  filePath: string;
  readonly?: boolean;
}

export function openDatabase(options: OpenDatabaseOptions): AppDatabase {
  const db = new Database(options.filePath, { readonly: options.readonly ?? false });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);

  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get('schema_version') as { value: string } | undefined;
  if (!row) {
    db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
  }
  // Future migrations would branch on the stored version here. Only one
  // schema version exists so far.

  return db;
}
