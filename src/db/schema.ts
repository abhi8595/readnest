/**
 * ReadNest SQLite schema (expo-sqlite). COMPLETE edition — includes tables for
 * every feature: library, collections, bookmarks, quotes/notes, per-book reader
 * settings, reading sessions/stats, TTS state, dictionary history, sync log.
 *
 * Migration strategy: linear `migrations` array; PRAGMA user_version tracks level.
 */

export const SCHEMA_VERSION = 6;

export const migrations: string[][] = [
  // v1 — core library (master prompt §6, extended)
  [
    `CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      file_uri TEXT NOT NULL,
      saf_uri TEXT,
      title TEXT,
      author TEXT,
      series TEXT,
      series_index REAL,
      format TEXT NOT NULL,
      mime TEXT,
      file_size INTEGER DEFAULT 0,
      content_hash TEXT,
      cover_uri TEXT,
      description TEXT,
      publisher TEXT,
      published_year INTEGER,
      language TEXT,
      page_count INTEGER,
      date_added INTEGER NOT NULL,
      date_modified INTEGER NOT NULL,
      last_read_at INTEGER,
      last_location TEXT,
      reading_progress REAL DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      folder_path TEXT
    );`,
    `CREATE INDEX IF NOT EXISTS idx_books_format ON books(format);`,
    `CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);`,
    `CREATE INDEX IF NOT EXISTS idx_books_lastread ON books(last_read_at);`,
    `CREATE INDEX IF NOT EXISTS idx_books_hash ON books(content_hash);`,
    `CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS collection_books (
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (collection_id, book_id)
    );`,
    `CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      location TEXT NOT NULL,
      label TEXT,
      created_at INTEGER NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_bookmarks_book ON bookmarks(book_id);`,
    `CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      note TEXT,
      color TEXT,
      location TEXT,
      chapter TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_quotes_book ON quotes(book_id);`,
    `CREATE TABLE IF NOT EXISTS reading_settings (
      book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
      theme TEXT DEFAULT 'day',
      font_family TEXT DEFAULT 'crimson',
      custom_font_uri TEXT,
      font_size INTEGER DEFAULT 18,
      font_weight INTEGER DEFAULT 400,
      line_spacing REAL DEFAULT 1.6,
      margin TEXT DEFAULT 'M',
      hyphenation INTEGER DEFAULT 1,
      brightness REAL,
      orientation TEXT DEFAULT 'system',
      page_mode TEXT DEFAULT 'paginated',
      tts_rate REAL DEFAULT 1.0,
      tts_voice TEXT
    );`,
  ],
  // v2 — stats, TTS, dictionary, sync
  [
    `CREATE TABLE IF NOT EXISTS reading_sessions (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      seconds INTEGER DEFAULT 0,
      progress_from REAL DEFAULT 0,
      progress_to REAL DEFAULT 0
    );`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_day ON reading_sessions(started_at);`,
    `CREATE TABLE IF NOT EXISTS dictionary_history (
      id TEXT PRIMARY KEY,
      word TEXT NOT NULL,
      book_id TEXT REFERENCES books(id) ON DELETE SET NULL,
      looked_up_at INTEGER NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_dict_word ON dictionary_history(word);`,
    `CREATE TABLE IF NOT EXISTS sync_log (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT,
      created_at INTEGER NOT NULL,
      synced_at INTEGER
    );`,
    `CREATE INDEX IF NOT EXISTS idx_sync_pending ON sync_log(synced_at);`,
    `CREATE TABLE IF NOT EXISTS page_thumbnails (
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      page_index INTEGER NOT NULL,
      thumb_uri TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (book_id, page_index)
    );`,
  ],
  // v3 — folders allowlist (SAF persisted URIs) + app kv
  [
    `CREATE TABLE IF NOT EXISTS folders (
      uri TEXT PRIMARY KEY,
      label TEXT,
      added_at INTEGER NOT NULL,
      last_scanned_at INTEGER
    );`,
    `CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );`,
  ],
  // v4 — full-text search over library metadata (FTS5 + sync triggers + backfill)
  [
    `CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
      title, author, series, description, publisher, language, folder_path,
      content='books', content_rowid='rowid'
    );`,
    `CREATE TRIGGER IF NOT EXISTS books_ai AFTER INSERT ON books BEGIN
       INSERT INTO books_fts(rowid, title, author, series, description, publisher, language, folder_path)
       VALUES (new.rowid, new.title, new.author, new.series, new.description, new.publisher, new.language, new.folder_path);
     END;`,
    `CREATE TRIGGER IF NOT EXISTS books_ad AFTER DELETE ON books BEGIN
       INSERT INTO books_fts(books_fts, rowid, title, author, series, description, publisher, language, folder_path)
       VALUES ('delete', old.rowid, old.title, old.author, old.series, old.description, old.publisher, old.language, old.folder_path);
     END;`,
    `CREATE TRIGGER IF NOT EXISTS books_au AFTER UPDATE ON books BEGIN
       INSERT INTO books_fts(books_fts, rowid, title, author, series, description, publisher, language, folder_path)
       VALUES ('delete', old.rowid, old.title, old.author, old.series, old.description, old.publisher, old.language, old.folder_path);
       INSERT INTO books_fts(rowid, title, author, series, description, publisher, language, folder_path)
       VALUES (new.rowid, new.title, new.author, new.series, new.description, new.publisher, new.language, new.folder_path);
     END;`,
    `INSERT INTO books_fts(rowid, title, author, series, description, publisher, language, folder_path)
     SELECT rowid, title, author, series, description, publisher, language, folder_path FROM books
     WHERE rowid NOT IN (SELECT rowid FROM books_fts);`,
  ],
  // v5 — Phase 4 (newfeaturePlan.md D1/D2/C3): per-book focus aids + TTS resume
  [
    `ALTER TABLE reading_settings ADD COLUMN focus_mode TEXT DEFAULT 'off';`,
    `ALTER TABLE reading_settings ADD COLUMN bionic INTEGER DEFAULT 0;`,
    `ALTER TABLE reading_settings ADD COLUMN irlen_tint TEXT DEFAULT 'none';`,
    `ALTER TABLE reading_settings ADD COLUMN tts_index INTEGER DEFAULT 0;`,
  ],
  // v6 — Phase F2 (newfeaturePlan.md): star ratings + re-read tracking
  [
    `ALTER TABLE books ADD COLUMN rating INTEGER DEFAULT 0;`,
    `ALTER TABLE books ADD COLUMN read_count INTEGER DEFAULT 0;`,
    `ALTER TABLE books ADD COLUMN last_finished_at INTEGER;`,
  ],
];

export type BookFormat =
  | 'epub' | 'pdf' | 'mobi' | 'azw3' | 'cbz' | 'cbr'
  | 'djvu' | 'fb2' | 'txt' | 'doc' | 'docx' | 'odt' | 'chm';

export interface BookRow {
  id: string;
  file_uri: string;
  saf_uri: string | null;
  title: string | null;
  author: string | null;
  series: string | null;
  series_index: number | null;
  format: BookFormat;
  mime: string | null;
  file_size: number;
  content_hash: string | null;
  cover_uri: string | null;
  description: string | null;
  publisher: string | null;
  published_year: number | null;
  language: string | null;
  page_count: number | null;
  date_added: number;
  date_modified: number;
  last_read_at: number | null;
  last_location: string | null;
  reading_progress: number;
  is_favorite: number;
  is_archived: number;
  folder_path: string | null;
  /** F2 — star rating 0–5, times finished, last finish timestamp. */
  rating: number;
  read_count: number;
  last_finished_at: number | null;
}

export interface CollectionRow {
  id: string; name: string; color: string | null; icon: string | null;
  sort_order: number; created_at: number;
}
export interface BookmarkRow {
  id: string; book_id: string; location: string; label: string | null; created_at: number;
}
export interface QuoteRow {
  id: string; book_id: string; text: string; note: string | null; color: string | null;
  location: string | null; chapter: string | null; created_at: number; updated_at: number;
}
export interface ReadingSettingsRow {
  book_id: string; theme: string; font_family: string; custom_font_uri: string | null;
  font_size: number; font_weight: number; line_spacing: number; margin: string;
  hyphenation: number; brightness: number | null; orientation: string; page_mode: string;
  tts_rate: number; tts_voice: string | null;
  focus_mode: string; bionic: number; irlen_tint: string | null; tts_index: number;
}
