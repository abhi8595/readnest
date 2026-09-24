import * as Crypto from 'expo-crypto';
import { getDb } from './client';
import type { BookFormat, BookRow, BookmarkRow, CollectionRow, QuoteRow, ReadingSettingsRow } from './schema';

export const uid = () => Crypto.randomUUID();
export const now = () => Date.now();

/* ── Books ─────────────────────────────────────────────── */
/** Hash lookup so import/scan can skip copies that duplicate an existing book. */
export async function findBookByHash(hash: string): Promise<BookRow | null> {
  const db = await getDb();
  return db.getFirstAsync<BookRow>('SELECT * FROM books WHERE content_hash = ? LIMIT 1', [hash]);
}

export async function upsertBook(b: Partial<BookRow> & { file_uri: string; format: BookFormat }): Promise<BookRow> {
  const db = await getDb();
  const existing = await db.getFirstAsync<BookRow>('SELECT * FROM books WHERE file_uri = ?', [b.file_uri]);
  const t = now();
  if (existing) {
    await db.runAsync(
      `UPDATE books SET title=?, author=?, series=?, format=?, file_size=?, cover_uri=?,
        description=?, publisher=?, published_year=?, language=?, page_count=?, date_modified=?,
        content_hash=?, folder_path=?, saf_uri=? WHERE id=?`,
      [b.title ?? existing.title, b.author ?? existing.author, b.series ?? existing.series,
       b.format, b.file_size ?? existing.file_size, b.cover_uri ?? existing.cover_uri,
       b.description ?? existing.description, b.publisher ?? existing.publisher,
       b.published_year ?? existing.published_year, b.language ?? existing.language,
       b.page_count ?? existing.page_count, t, b.content_hash ?? existing.content_hash,
       b.folder_path ?? existing.folder_path, b.saf_uri ?? existing.saf_uri, existing.id],
    );
    return (await db.getFirstAsync<BookRow>('SELECT * FROM books WHERE id=?', [existing.id])) as BookRow;
  }
  // Safety net: same content under a different path → keep the original row.
  if (b.content_hash) {
    const dupe = await db.getFirstAsync<BookRow>('SELECT * FROM books WHERE content_hash = ? LIMIT 1', [b.content_hash]);
    if (dupe) return dupe;
  }
  const row: BookRow = {
    id: uid(), file_uri: b.file_uri, saf_uri: b.saf_uri ?? null,
    title: b.title ?? null, author: b.author ?? null, series: b.series ?? null,
    series_index: b.series_index ?? null, format: b.format, mime: b.mime ?? null,
    file_size: b.file_size ?? 0, content_hash: b.content_hash ?? null, cover_uri: b.cover_uri ?? null,
    description: b.description ?? null, publisher: b.publisher ?? null,
    published_year: b.published_year ?? null, language: b.language ?? null,
    page_count: b.page_count ?? null, date_added: t, date_modified: t,
    last_read_at: null, last_location: null, reading_progress: 0,
    is_favorite: 0, is_archived: 0, folder_path: b.folder_path ?? null,
    rating: b.rating ?? 0, read_count: b.read_count ?? 0, last_finished_at: b.last_finished_at ?? null,
  };
  await db.runAsync(
    `INSERT INTO books (id,file_uri,saf_uri,title,author,series,series_index,format,mime,file_size,
      content_hash,cover_uri,description,publisher,published_year,language,page_count,date_added,
      date_modified,last_read_at,last_location,reading_progress,is_favorite,is_archived,folder_path,
      rating,read_count,last_finished_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [row.id, row.file_uri, row.saf_uri, row.title, row.author, row.series, row.series_index,
     row.format, row.mime, row.file_size, row.content_hash, row.cover_uri, row.description,
     row.publisher, row.published_year, row.language, row.page_count, row.date_added,
     row.date_modified, row.last_read_at, row.last_location, row.reading_progress,
     row.is_favorite, row.is_archived, row.folder_path,
     row.rating, row.read_count, row.last_finished_at],
  );
  return row;
}

export async function listBooks(orderBy = 'date_added DESC'): Promise<BookRow[]> {
  const db = await getDb();
  const allowed = new Set(['date_added DESC', 'date_modified DESC', 'title ASC', 'author ASC', 'file_size DESC', 'last_read_at DESC']);
  const order = allowed.has(orderBy) ? orderBy : 'date_added DESC';
  return db.getAllAsync<BookRow>(`SELECT * FROM books WHERE is_archived = 0 ORDER BY ${order}`);
}

/** F1 — cursor/offset pagination for 5000+ book libraries (Moon+ crash
 * switchers). Keeps the default `listBooks` path for small libraries. */
export const LIBRARY_PAGE_SIZE = 100;

export async function countBooks(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM books WHERE is_archived = 0');
  return r?.n ?? 0;
}

export async function listBooksPaged(
  orderBy = 'date_added DESC',
  limit = LIBRARY_PAGE_SIZE,
  offset = 0,
): Promise<BookRow[]> {
  const db = await getDb();
  const allowed = new Set(['date_added DESC', 'date_modified DESC', 'title ASC', 'author ASC', 'file_size DESC', 'last_read_at DESC']);
  const order = allowed.has(orderBy) ? orderBy : 'date_added DESC';
  const n = Math.max(1, Math.min(500, Math.floor(limit)));
  const off = Math.max(0, Math.floor(offset));
  return db.getAllAsync<BookRow>(`SELECT * FROM books WHERE is_archived = 0 ORDER BY ${order} LIMIT ? OFFSET ?`, [n, off]);
}

/** Escape a raw LIKE pattern (wildcards become literals). */
function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Strip FTS5 operators so user input is always plain prefix terms. */
function ftsQuery(q: string): string | null {
  const terms = q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10);
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t}"*`).join(' ');
}

export async function searchBooks(q: string): Promise<BookRow[]> {
  const db = await getDb();
  const query = q.trim();
  if (!query) {
    return db.getAllAsync<BookRow>(
      'SELECT * FROM books WHERE is_archived=0 ORDER BY last_read_at DESC, date_added DESC LIMIT 200',
    );
  }
  // Full-text first (title/author/series/description/publisher/language/folder).
  const match = ftsQuery(query);
  if (match) {
    try {
      const fts = await db.getAllAsync<BookRow>(
        `SELECT b.* FROM books_fts f JOIN books b ON b.rowid = f.rowid
         WHERE books_fts MATCH ? AND b.is_archived = 0
         ORDER BY b.last_read_at DESC, b.date_added DESC LIMIT 200`,
        [match],
      );
      if (fts.length > 0) return fts;
      // fall through to LIKE when FTS has no hits (e.g. format codes like "ep")
    } catch { /* FTS missing on old DBs — fall through to LIKE */ }
  }
  const like = `%${escapeLike(query)}%`;
  return db.getAllAsync<BookRow>(
    `SELECT * FROM books WHERE is_archived=0 AND
     (title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\' OR series LIKE ? ESCAPE '\\'
      OR format LIKE ? ESCAPE '\\' OR folder_path LIKE ? ESCAPE '\\'
      OR description LIKE ? ESCAPE '\\' OR publisher LIKE ? ESCAPE '\\')
     ORDER BY last_read_at DESC, date_added DESC LIMIT 200`,
    [like, like, like, like, like, like, like],
  );
}

export async function getBook(id: string): Promise<BookRow | null> {
  const db = await getDb();
  return db.getFirstAsync<BookRow>('SELECT * FROM books WHERE id=?', [id]);
}

export async function updateProgress(id: string, progress: number, location?: string): Promise<void> {
  const db = await getDb();
  const clamped = Math.min(1, Math.max(0, progress));
  const cur = await db.getFirstAsync<{ reading_progress: number }>(
    'SELECT reading_progress FROM books WHERE id=?', [id]);
  const wasFinished = (cur?.reading_progress ?? 0) >= 0.99;
  const nowFinished = clamped >= 0.99;
  if (!wasFinished && nowFinished) {
    // F2 — finished (again): re-read tracking.
    await db.runAsync(
      'UPDATE books SET reading_progress=?, last_location=COALESCE(?,last_location), last_read_at=?, read_count=read_count+1, last_finished_at=? WHERE id=?',
      [clamped, location ?? null, now(), now(), id],
    );
  } else {
    await db.runAsync(
      'UPDATE books SET reading_progress=?, last_location=COALESCE(?,last_location), last_read_at=? WHERE id=?',
      [clamped, location ?? null, now(), id],
    );
  }
}

/** F2 — star rating 0–5 (bumps date_modified so sync carries it). */
export async function setRating(id: string, stars: number): Promise<void> {
  const db = await getDb();
  const r = Math.max(0, Math.min(5, Math.round(stars)));
  await db.runAsync('UPDATE books SET rating=?, date_modified=? WHERE id=?', [r, now(), id]);
}

export async function toggleFavorite(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE books SET is_favorite = 1 - is_favorite WHERE id=?', [id]);
}

export async function renameBook(id: string, title: string, author?: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE books SET title=?, author=COALESCE(?,author) WHERE id=?', [title, author ?? null, id]);
}

export async function deleteBook(id: string): Promise<void> {
  const db = await getDb();
  const book = await db.getFirstAsync<BookRow>('SELECT * FROM books WHERE id=?', [id]);
  await db.runAsync('DELETE FROM books WHERE id=?', [id]);
  // Remove orphaned files: book, cover, page thumbs, extracted comic pages.
  if (book) {
    try {
      const { AppDirs, deleteFile } = await import('@/lib/files');
      const targets = [book.file_uri, book.cover_uri].filter((u): u is string => !!u);
      await Promise.all(targets.map((u) => deleteFile(u)));
      const FileSystem = await import('expo-file-system');
      const prefix = `${AppDirs.thumbs}${id}`;
      const comicDir = `${AppDirs.cache}comics/${id}/`;
      for (const uri of [prefix, comicDir]) {
        try {
          const info = await FileSystem.getInfoAsync(uri);
          if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch { /* best-effort */ }
      }
    } catch { /* DB delete already succeeded */ }
  }
}

export async function findDuplicates(): Promise<BookRow[][]> {
  const db = await getDb();
  const rows = await db.getAllAsync<BookRow>(
    `SELECT * FROM books WHERE content_hash IS NOT NULL ORDER BY content_hash`,
  );
  const groups = new Map<string, BookRow[]>();
  for (const r of rows) {
    const k = r.content_hash as string;
    const g = groups.get(k) ?? [];
    g.push(r);
    groups.set(k, g);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

export async function distinctAuthors(): Promise<{ author: string; count: number }[]> {
  const db = await getDb();
  return db.getAllAsync('SELECT author, COUNT(*) as count FROM books WHERE author IS NOT NULL GROUP BY author ORDER BY author');
}

export async function distinctSeries(): Promise<{ series: string; count: number }[]> {
  const db = await getDb();
  return db.getAllAsync('SELECT series, COUNT(*) as count FROM books WHERE series IS NOT NULL GROUP BY series ORDER BY series');
}

/** F2 — per-series progress for the "unfinished series" view. */
export interface SeriesProgress {
  series: string;
  total: number;
  finished: number;
  reads: number;
}

export async function seriesProgress(): Promise<SeriesProgress[]> {
  const db = await getDb();
  try {
    return db.getAllAsync(
      `SELECT series, COUNT(*) as total,
        SUM(CASE WHEN reading_progress >= 0.99 THEN 1 ELSE 0 END) as finished,
        SUM(COALESCE(read_count, 0)) as reads
       FROM books WHERE series IS NOT NULL AND is_archived = 0
       GROUP BY series ORDER BY series`,
    );
  } catch {
    // v6 columns missing (very old DB mid-migration) — degrade gracefully.
    const rows = await distinctSeries();
    return rows.map((r) => ({ series: r.series, total: r.count, finished: 0, reads: 0 }));
  }
}

/* ── Collections ───────────────────────────────────────── */
export async function listCollections(): Promise<(CollectionRow & { count: number })[]> {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT c.*, COUNT(cb.book_id) as count FROM collections c
     LEFT JOIN collection_books cb ON cb.collection_id = c.id
     GROUP BY c.id ORDER BY c.sort_order, c.name`,
  );
}
export async function createCollection(name: string, color?: string): Promise<CollectionRow> {
  const db = await getDb();
  const row: CollectionRow = { id: uid(), name, color: color ?? null, icon: null, sort_order: 0, created_at: now() };
  await db.runAsync('INSERT INTO collections (id,name,color,icon,sort_order,created_at) VALUES (?,?,?,?,?,?)',
    [row.id, row.name, row.color, row.icon, row.sort_order, row.created_at]);
  return row;
}
export async function addToCollection(cid: string, bid: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR IGNORE INTO collection_books (collection_id,book_id,added_at) VALUES (?,?,?)', [cid, bid, now()]);
}
export async function removeFromCollection(cid: string, bid: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM collection_books WHERE collection_id=? AND book_id=?', [cid, bid]);
}
export async function booksInCollection(cid: string): Promise<BookRow[]> {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT b.* FROM books b JOIN collection_books cb ON cb.book_id=b.id WHERE cb.collection_id=? ORDER BY cb.added_at DESC`, [cid]);
}
export async function deleteCollection(cid: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM collections WHERE id=?', [cid]);
}

/* ── Bookmarks / Quotes ────────────────────────────────── */
export async function listBookmarks(bookId: string): Promise<BookmarkRow[]> {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM bookmarks WHERE book_id=? ORDER BY created_at DESC', [bookId]);
}
export async function addBookmark(bookId: string, location: string, label?: string): Promise<BookmarkRow> {
  const db = await getDb();
  const row: BookmarkRow = { id: uid(), book_id: bookId, location, label: label ?? null, created_at: now() };
  await db.runAsync('INSERT INTO bookmarks (id,book_id,location,label,created_at) VALUES (?,?,?,?,?)',
    [row.id, row.book_id, row.location, row.label, row.created_at]);
  return row;
}
export async function deleteBookmark(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM bookmarks WHERE id=?', [id]);
}
export async function listQuotes(bookId?: string): Promise<(QuoteRow & { book_title: string | null })[]> {
  const db = await getDb();
  return bookId
    ? db.getAllAsync('SELECT q.*, b.title as book_title FROM quotes q JOIN books b ON b.id=q.book_id WHERE q.book_id=? ORDER BY q.updated_at DESC', [bookId])
    : db.getAllAsync('SELECT q.*, b.title as book_title FROM quotes q JOIN books b ON b.id=q.book_id ORDER BY q.updated_at DESC LIMIT 500');
}
export async function upsertQuote(q: Partial<QuoteRow> & { book_id: string; text: string }): Promise<void> {
  const db = await getDb();
  const t = now();
  if (q.id) {
    await db.runAsync('UPDATE quotes SET text=?, note=?, color=?, location=?, chapter=?, updated_at=? WHERE id=?',
      [q.text, q.note ?? null, q.color ?? null, q.location ?? null, q.chapter ?? null, t, q.id]);
  } else {
    await db.runAsync('INSERT INTO quotes (id,book_id,text,note,color,location,chapter,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [uid(), q.book_id, q.text, q.note ?? null, q.color ?? null, q.location ?? null, q.chapter ?? null, t, t]);
  }
}
export async function deleteQuote(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM quotes WHERE id=?', [id]);
}

/* ── Reading settings / sessions / misc ────────────────── */
export async function getReadingSettings(bookId: string): Promise<ReadingSettingsRow | null> {
  const db = await getDb();
  return db.getFirstAsync<ReadingSettingsRow>('SELECT * FROM reading_settings WHERE book_id=?', [bookId]);
}
export async function saveReadingSettings(s: ReadingSettingsRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO reading_settings (book_id,theme,font_family,custom_font_uri,font_size,font_weight,line_spacing,margin,hyphenation,brightness,orientation,page_mode,tts_rate,tts_voice,focus_mode,bionic,irlen_tint,tts_index)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(book_id) DO UPDATE SET theme=excluded.theme, font_family=excluded.font_family,
       custom_font_uri=excluded.custom_font_uri, font_size=excluded.font_size, font_weight=excluded.font_weight,
       line_spacing=excluded.line_spacing, margin=excluded.margin, hyphenation=excluded.hyphenation,
       brightness=excluded.brightness, orientation=excluded.orientation, page_mode=excluded.page_mode,
       tts_rate=excluded.tts_rate, tts_voice=excluded.tts_voice,
       focus_mode=excluded.focus_mode, bionic=excluded.bionic,
       irlen_tint=excluded.irlen_tint, tts_index=excluded.tts_index`,
    [s.book_id, s.theme, s.font_family, s.custom_font_uri, s.font_size, s.font_weight, s.line_spacing,
     s.margin, s.hyphenation, s.brightness, s.orientation, s.page_mode, s.tts_rate, s.tts_voice,
     (s as { focus_mode?: string }).focus_mode ?? 'off',
     (s as { bionic?: number }).bionic ?? 0,
     (s as { irlen_tint?: string | null }).irlen_tint ?? 'none',
     (s as { tts_index?: number }).tts_index ?? 0],
  );
}
export async function logSession(bookId: string, seconds: number, from: number, to: number): Promise<void> {
  const db = await getDb();
  const t = now();
  await db.runAsync('INSERT INTO reading_sessions (id,book_id,started_at,ended_at,seconds,progress_from,progress_to) VALUES (?,?,?,?,?,?,?)',
    [uid(), bookId, t - seconds * 1000, t, seconds, from, to]);
}
export async function totalReadingSeconds(since?: number): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ s: number }>(
    since ? 'SELECT COALESCE(SUM(seconds),0) as s FROM reading_sessions WHERE started_at>=?' : 'SELECT COALESCE(SUM(seconds),0) as s FROM reading_sessions',
    since ? [since] : [],
  );
  return r?.s ?? 0;
}
export async function addDictLookup(word: string, bookId?: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO dictionary_history (id,word,book_id,looked_up_at) VALUES (?,?,?,?)', [uid(), word.toLowerCase(), bookId ?? null, now()]);
}
export async function recentDictLookups(): Promise<{ word: string; looked_up_at: number }[]> {
  const db = await getDb();
  return db.getAllAsync('SELECT word, MAX(looked_up_at) as looked_up_at FROM dictionary_history GROUP BY word ORDER BY looked_up_at DESC LIMIT 50');
}
export async function kvGet(key: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key=?', [key]);
  return r?.value ?? null;
}
export async function kvSet(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO kv (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value]);
}
