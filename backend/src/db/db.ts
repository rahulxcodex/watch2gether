import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { config } from '../config';
import fs from 'fs';
import path from 'path';

function getDatabaseSync(): any {
  const req = typeof require !== 'undefined' ? require : (0, eval)('require');
  return req('node:sqlite').DatabaseSync;
}

let sqliteDbInstance: any = null;
let db: BetterSQLite3Database<typeof schema> | null = null;

function createBetterSqlite3Adapter(rawDb: any) {
  return {
    pragma: (str: string) => {
      try {
        return rawDb.prepare('PRAGMA ' + str).all();
      } catch {
        rawDb.exec('PRAGMA ' + str);
        return [];
      }
    },
    exec: (str: string) => rawDb.exec(str),
    prepare: (sqlQuery: string) => {
      const stmt = rawDb.prepare(sqlQuery);
      let isRaw = false;
      const statement = {
        raw: (val = true) => {
          isRaw = !!val;
          return statement;
        },
        run: (...args: any[]) => {
          const res = stmt.run(...args);
          return {
            changes: Number(res.changes || 0),
            lastInsertRowid: Number(res.lastInsertRowid || 0),
          };
        },
        get: (...args: any[]) => {
          const row = stmt.get(...args);
          if (!row) return undefined;
          return isRaw ? Object.values(row) : row;
        },
        all: (...args: any[]) => {
          const rows = stmt.all(...args);
          return isRaw ? rows.map((r: any) => Object.values(r)) : rows;
        },
        iterate: (...args: any[]) => {
          const rows = stmt.all(...args);
          return (function* () {
            for (const r of rows) {
              yield isRaw ? Object.values(r) : r;
            }
          })();
        },
      };
      return statement;
    },
    close: () => rawDb.close(),
    transaction: (fn: Function) => {
      return (...args: any[]) => {
        rawDb.exec('BEGIN');
        try {
          const res = fn(...args);
          rawDb.exec('COMMIT');
          return res;
        } catch (e) {
          rawDb.exec('ROLLBACK');
          throw e;
        }
      };
    },
  };
}

export function initSchema(sqlite: any) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_guest INTEGER NOT NULL DEFAULT 1,
      avatar_url TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_active_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      room_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      host_id TEXT NOT NULL,
      media_url TEXT NOT NULL DEFAULT '',
      media_type TEXT NOT NULL DEFAULT 'MP4',
      playback_state TEXT NOT NULL DEFAULT 'IDLE',
      current_time REAL NOT NULL DEFAULT 0,
      permission_mode TEXT NOT NULL DEFAULT 'HOST_ONLY',
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (host_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_code TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (room_code) REFERENCES rooms(room_code),
      FOREIGN KEY (sender_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON rooms(room_code);
    CREATE INDEX IF NOT EXISTS idx_messages_room_code ON messages(room_code);
  `);
}

export function initDatabase(dbPath?: string): BetterSQLite3Database<typeof schema> {
  const targetPath =
    dbPath ||
    (config.DB_TYPE === 'memory' || config.NODE_ENV === 'test'
      ? ':memory:'
      : config.SQLITE_PATH);

  if (targetPath !== ':memory:') {
    const dir = path.dirname(path.resolve(targetPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const DatabaseSync = getDatabaseSync();
  sqliteDbInstance = new DatabaseSync(targetPath);
  sqliteDbInstance.exec('PRAGMA foreign_keys = ON;');

  const adapter = createBetterSqlite3Adapter(sqliteDbInstance);
  db = drizzle(adapter as any, { schema });
  initSchema(sqliteDbInstance);

  return db;
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    return initDatabase();
  }
  return db;
}

export function closeDatabase(): void {
  if (sqliteDbInstance) {
    try {
      sqliteDbInstance.close();
    } catch {}
    sqliteDbInstance = null;
    db = null;
  }
}