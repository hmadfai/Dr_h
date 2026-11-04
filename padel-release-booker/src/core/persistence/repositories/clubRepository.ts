import type { AppDatabase } from '../db.js';
import type { Club, CourtInfo } from '../../domain/types.js';

interface ClubRow {
  id: string;
  name: string;
  location: string;
  timezone: string;
  source_url: string | null;
  verified: number;
}

function rowToClub(row: ClubRow): Club {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    timezone: row.timezone,
    sourceUrl: row.source_url,
    verified: row.verified === 1
  };
}

export class ClubRepository {
  constructor(private readonly db: AppDatabase) {}

  upsert(club: Club): void {
    this.db
      .prepare(
        `INSERT INTO clubs (id, name, location, timezone, source_url, verified)
         VALUES (@id, @name, @location, @timezone, @sourceUrl, @verified)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           location = excluded.location,
           timezone = excluded.timezone,
           source_url = excluded.source_url,
           verified = excluded.verified`
      )
      .run({ ...club, verified: club.verified ? 1 : 0 });
  }

  getById(id: string): Club | null {
    const row = this.db.prepare('SELECT * FROM clubs WHERE id = ?').get(id) as ClubRow | undefined;
    return row ? rowToClub(row) : null;
  }

  list(): Club[] {
    const rows = this.db.prepare('SELECT * FROM clubs ORDER BY name').all() as ClubRow[];
    return rows.map(rowToClub);
  }

  replaceCourts(clubId: string, courts: CourtInfo[]): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM courts WHERE club_id = ?').run(clubId);
      const insert = this.db.prepare('INSERT INTO courts (id, club_id, name, surface) VALUES (?, ?, ?, ?)');
      for (const court of courts) {
        insert.run(court.id, clubId, court.name, court.surface);
      }
    });
    tx();
  }

  listCourts(clubId: string): CourtInfo[] {
    const rows = this.db.prepare('SELECT id, name, surface FROM courts WHERE club_id = ? ORDER BY name').all(clubId) as {
      id: string;
      name: string;
      surface: CourtInfo['surface'];
    }[];
    return rows;
  }
}
