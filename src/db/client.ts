import * as SQLite from 'expo-sqlite';
import { migrations, SCHEMA_VERSION } from './schema';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('readnest.db', {
        enableChangeListener: false,
      });
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      const current = row?.user_version ?? 0;
      for (let v = current; v < SCHEMA_VERSION; v++) {
        const stmts = migrations[v];
        if (!stmts) continue;
        for (const sql of stmts) {
          try {
            await db.execAsync(sql);
          } catch (e) {
            // FTS5 is optional: older/custom SQLite builds may lack it.
            // Search falls back to LIKE, so skip FTS statements but still
            // advance user_version to avoid a retry loop every launch.
            if (/books_fts/i.test(sql)) continue;
            throw e;
          }
        }
        await db.execAsync(`PRAGMA user_version = ${v + 1};`);
      }
      return db;
    })();
  }
  return dbPromise;
}

/** For tests / settings "Reset library" */
export async function resetDb(): Promise<void> {
  const db = await getDb();
  await db.execAsync(
    `PRAGMA foreign_keys = OFF;
     DROP TABLE IF EXISTS page_thumbnails; DROP TABLE IF EXISTS sync_log;
     DROP TABLE IF EXISTS dictionary_history; DROP TABLE IF EXISTS reading_sessions;
     DROP TABLE IF EXISTS reading_settings; DROP TABLE IF EXISTS quotes;
     DROP TABLE IF EXISTS bookmarks; DROP TABLE IF EXISTS collection_books;
     DROP TABLE IF EXISTS collections; DROP TABLE IF EXISTS books;
     DROP TABLE IF EXISTS folders; DROP TABLE IF EXISTS kv;
     DROP TABLE IF EXISTS books_fts;
     PRAGMA user_version = 0; PRAGMA foreign_keys = ON;`,
  );
  dbPromise = null;
  await getDb();
}
