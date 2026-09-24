/**
 * Google Drive sync (Premium) — appDataFolder JSON snapshots via Drive REST.
 * Auth handled by expo-auth-session (Google); tokens stored in SecureStore
 * by the caller. Syncs: books registry, progress, bookmarks, quotes, settings.
 */
import { getDb } from '@/db/client';

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export interface DriveSnapshot {
  version: 1;
  exportedAt: number;
  books: unknown[];
  bookmarks: unknown[];
  quotes: unknown[];
  collections: unknown[];
  collectionBooks?: unknown[];
  settings: unknown[];
}

/** Typed fetch failure so callers can distinguish auth expiry from offline. */
export class DriveError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function isAuthError(e: unknown): boolean {
  return e instanceof DriveError && (e.status === 401 || e.status === 403);
}

async function checked(res: Response, what: string): Promise<Response> {
  if (!res.ok) throw new DriveError(`${what} failed (${res.status})`, res.status);
  return res;
}

export async function buildSnapshot(): Promise<DriveSnapshot> {
  const db = await getDb();
  const [books, bookmarks, quotes, collections, collectionBooks, settings] = await Promise.all([
    db.getAllAsync('SELECT * FROM books'),
    db.getAllAsync('SELECT * FROM bookmarks'),
    db.getAllAsync('SELECT * FROM quotes'),
    db.getAllAsync('SELECT * FROM collections'),
    db.getAllAsync('SELECT * FROM collection_books'),
    db.getAllAsync('SELECT * FROM reading_settings'),
  ]);
  return { version: 1, exportedAt: Date.now(), books, bookmarks, quotes, collections, collectionBooks, settings };
}

async function findSnapshotId(token: string): Promise<string | null> {
  const q = encodeURIComponent(`name='readnest-backup.json' and 'appDataFolder' in parents and trashed=false`);
  const res = await fetch(`${DRIVE_FILES}?q=${q}&spaces=appDataFolder&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await checked(res, 'Drive list');
  const json = (await res.json()) as { files?: { id: string }[] };
  return json.files?.[0]?.id ?? null;
}

export async function pushToDrive(token: string): Promise<void> {
  const snap = await buildSnapshot();
  const body = JSON.stringify(snap);
  const existing = await findSnapshotId(token);
  const metadata = { name: 'readnest-backup.json', parents: existing ? undefined : ['appDataFolder'] };
  const boundary = `rn_${Date.now()}`;
  const multipart = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    body,
    `--${boundary}--`,
  ].join('\r\n');
  const url = existing ? `${DRIVE_UPLOAD}/${existing}?uploadType=multipart` : `${DRIVE_UPLOAD}?uploadType=multipart`;
  const res = await fetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  await checked(res, 'Drive upload');
}

export async function pullFromDrive(token: string): Promise<DriveSnapshot | null> {
  const id = await findSnapshotId(token);
  if (!id) return null;
  const res = await fetch(`${DRIVE_FILES}/${id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  await checked(res, 'Drive download');
  const snap = (await res.json()) as DriveSnapshot;
  if (!snap || snap.version !== 1 || !Array.isArray(snap.books)) {
    throw new DriveError('Remote backup is unreadable (version mismatch).', 422);
  }
  return snap;
}

/** Snapshot fields are untrusted JSON — coerce to valid SQLite bind values. */
const s = (x: unknown): string | null => (typeof x === 'string' ? x : null);
const n = (x: unknown, dflt = 0): number => (typeof x === 'number' && Number.isFinite(x) ? x : dflt);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** Field-level merge: remote wins only when newer (wall-clock LWW per row). */
export interface MergeOptions {
  /**
   * Timestamp of the last successful sync (any backend). A remote row that
   * overwrites a local row modified after `since` counts as a conflict
   * (both sides changed) — newest still wins, but the UI says so.
   */
  since?: number;
}

export interface MergeResult {
  merged: number;
  /** Remote-wins overwrites where the local row had also changed. */
  conflicts: number;
}

/**
 * A3 — rename/move-proof identity: match a remote book to a local row by
 * content hash when the id differs (re-imports, moved files, new devices).
 * Pure — unit tested.
 */
export function findLocalBookId(
  localIds: Set<string>,
  hashToId: Map<string, string>,
  remote: { id: string; content_hash?: string | null },
): { id: string; viaHash: boolean } | null {
  if (localIds.has(remote.id)) return { id: remote.id, viaHash: false };
  if (typeof remote.content_hash === 'string' && remote.content_hash) {
    const hid = hashToId.get(remote.content_hash);
    if (hid) return { id: hid, viaHash: true };
  }
  return null;
}

/** A3 — both sides changed since the last sync and remote is newer. Pure. */
export function isConflict(localUpdatedAt: number, remoteUpdatedAt: number, since?: number): boolean {
  if (since == null) return false;
  return remoteUpdatedAt > localUpdatedAt && localUpdatedAt > since;
}

export async function mergeSnapshot(snap: DriveSnapshot, opts?: MergeOptions): Promise<MergeResult> {
  const db = await getDb();
  let merged = 0;
  let conflicts = 0;
  const since = opts?.since;
  // A3 — remote book ids that turned out to be renames/moves of local rows.
  const remappedBookIds = new Map<string, string>();
  const rows = (snap.books ?? []) as Record<string, unknown>[];
  for (const b of rows.slice(0, 5000)) {
    if (typeof b.id !== 'string' || typeof b.file_uri !== 'string') continue;
    const cur = await db.getFirstAsync<{ reading_progress: number; last_read_at: number | null; date_modified: number }>(
      'SELECT reading_progress, last_read_at, date_modified FROM books WHERE id=?', [b.id]);
    if (!cur) {
      // A3 — same book under a different id? (re-import, moved file, new
      // device). Match by content hash so highlights stay attached.
      let localId: string | null = null;
      if (typeof b.content_hash === 'string' && b.content_hash) {
        const hit = await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM books WHERE content_hash=? LIMIT 1', [b.content_hash]);
        localId = hit?.id ?? null;
      }
      if (localId) {
        remappedBookIds.set(b.id, localId);
        const remoteProgressAt = n(b.last_read_at);
        await db.runAsync('UPDATE books SET reading_progress=?, last_location=?, last_read_at=? WHERE id=?',
          [n(b.reading_progress), s(b.last_location), num(b.last_read_at), localId]);
        if (remoteProgressAt > 0) merged++;
        continue;
      }
      // Cross-device rows reference absolute paths that don't exist here:
      // keep registry/progress, verify the file before opening (reader handles missing files).
      await db.runAsync(
        `INSERT INTO books (id,file_uri,saf_uri,title,author,series,series_index,format,mime,file_size,content_hash,cover_uri,description,publisher,published_year,language,page_count,date_added,date_modified,last_read_at,last_location,reading_progress,is_favorite,is_archived,folder_path,rating,read_count,last_finished_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [b.id, b.file_uri, s(b.saf_uri), s(b.title), s(b.author), s(b.series),
         num(b.series_index), s(b.format) ?? 'epub', s(b.mime), n(b.file_size), s(b.content_hash),
         s(b.cover_uri), s(b.description), s(b.publisher), num(b.published_year),
         s(b.language), num(b.page_count), n(b.date_added, Date.now()),
         n(b.date_modified, Date.now()), num(b.last_read_at), s(b.last_location),
         n(b.reading_progress), n(b.is_favorite), n(b.is_archived),
         s(b.folder_path), n(b.rating), n(b.read_count), num(b.last_finished_at)]);
      merged++;
    } else {
      const remoteProgressAt = n(b.last_read_at);
      const remoteModified = n(b.date_modified);
      if (remoteProgressAt > (cur.last_read_at ?? 0)) {
        if (since != null && (cur.last_read_at ?? 0) > since) conflicts++;
        await db.runAsync('UPDATE books SET reading_progress=?, last_location=?, last_read_at=? WHERE id=?',
          [n(b.reading_progress), s(b.last_location), num(b.last_read_at), b.id]);
        merged++;
      } else if (remoteModified > (cur.date_modified ?? 0)) {
        await db.runAsync(
          `UPDATE books SET title=?, author=?, series=?, cover_uri=?, description=?, date_modified=?,
            rating=MAX(COALESCE(rating,0), ?), read_count=MAX(COALESCE(read_count,0), ?) WHERE id=?`,
          [s(b.title), s(b.author), s(b.series), s(b.cover_uri), s(b.description), remoteModified,
           n(b.rating), n(b.read_count), b.id]);
        merged++;
      }
    }
  }
  // A3 — local book ids for orphan protection + quote remapping.
  const bookIds = new Set(
    (await db.getAllAsync<{ id: string }>('SELECT id FROM books')).map((r) => r.id),
  );
  for (const q of ((snap.quotes ?? []) as Record<string, unknown>[]).slice(0, 5000)) {
    if (typeof q.id !== 'string' || typeof q.book_id !== 'string' || typeof q.text !== 'string') continue;
    // Renamed/moved book on the other device → attach to the local row.
    const bookId = remappedBookIds.get(q.book_id) ?? q.book_id;
    if (!bookIds.has(bookId)) continue;
    const cur = await db.getFirstAsync<{ updated_at: number }>('SELECT updated_at FROM quotes WHERE id=?', [q.id]);
    const remoteAt = n(q.updated_at, Date.now());
    if (!cur || remoteAt >= cur.updated_at) {
      if (cur && isConflict(cur.updated_at, remoteAt, since)) conflicts++;
      await db.runAsync(
        `INSERT INTO quotes (id,book_id,text,note,color,location,chapter,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET text=excluded.text, note=excluded.note, color=excluded.color, location=excluded.location, chapter=excluded.chapter, updated_at=excluded.updated_at`,
        [q.id, bookId, q.text, s(q.note), s(q.color), s(q.location), s(q.chapter), n(q.created_at, Date.now()), remoteAt]);
      merged++;
    }
  }
  for (const m of ((snap.bookmarks ?? []) as Record<string, unknown>[]).slice(0, 5000)) {
    if (typeof m.id !== 'string' || typeof m.book_id !== 'string' || typeof m.location !== 'string') continue;
    const bookId = remappedBookIds.get(m.book_id) ?? m.book_id;
    if (!bookIds.has(bookId)) continue;
    const cur = await db.getFirstAsync<{ label: string | null }>('SELECT label FROM bookmarks WHERE id=?', [m.id]);
    if (!cur) {
      await db.runAsync('INSERT INTO bookmarks (id,book_id,location,label,created_at) VALUES (?,?,?,?,?)',
        [m.id, bookId, m.location, s(m.label), n(m.created_at, Date.now())]);
      merged++;
    } else if (s(m.label) !== cur.label) {
      await db.runAsync('UPDATE bookmarks SET label=? WHERE id=?', [s(m.label), m.id]);
      merged++;
    }
  }
  // Collections + membership (previously snapshotted but never merged).
  for (const c of ((snap.collections ?? []) as Record<string, unknown>[]).slice(0, 1000)) {
    if (typeof c.id !== 'string' || typeof c.name !== 'string') continue;
    await db.runAsync(
      `INSERT INTO collections (id,name,color,icon,sort_order,created_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color, icon=excluded.icon`,
      [c.id, c.name, s(c.color), s(c.icon), n((c as Record<string, unknown>).sort_order), n(c.created_at, Date.now())]);
    // Legacy snapshots embedded membership as GROUP_CONCAT book_ids; new ones use collectionBooks.
    const legacy = typeof c.book_ids === 'string' ? c.book_ids.split(',').filter(Boolean) : [];
    for (const bid of legacy) {
      if (!bookIds.has(bid)) continue;
      await db.runAsync('INSERT OR IGNORE INTO collection_books (collection_id,book_id,added_at) VALUES (?,?,?)',
        [c.id, bid, Date.now()]);
    }
  }
  for (const cb of ((snap.collectionBooks ?? []) as Record<string, unknown>[]).slice(0, 10000)) {
    if (typeof cb.collection_id !== 'string' || typeof cb.book_id !== 'string') continue;
    await db.runAsync('INSERT OR IGNORE INTO collection_books (collection_id,book_id,added_at) VALUES (?,?,?)',
      [cb.collection_id, cb.book_id, n(cb.added_at, Date.now())]);
  }
  // Per-book reader settings (last writer wins; rows carry no timestamp).
  for (const r of ((snap.settings ?? []) as Record<string, unknown>[]).slice(0, 5000)) {
    if (typeof r.book_id !== 'string') continue;
    await db.runAsync(
      `INSERT INTO reading_settings (book_id,theme,font_family,custom_font_uri,font_size,font_weight,line_spacing,margin,hyphenation,brightness,orientation,page_mode,tts_rate,tts_voice)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(book_id) DO UPDATE SET theme=excluded.theme, font_family=excluded.font_family,
         custom_font_uri=excluded.custom_font_uri, font_size=excluded.font_size, font_weight=excluded.font_weight,
         line_spacing=excluded.line_spacing, margin=excluded.margin, hyphenation=excluded.hyphenation,
         brightness=excluded.brightness, orientation=excluded.orientation, page_mode=excluded.page_mode,
         tts_rate=excluded.tts_rate, tts_voice=excluded.tts_voice`,
      [r.book_id, s(r.theme) ?? 'day', s(r.font_family) ?? 'crimson', s(r.custom_font_uri),
       n(r.font_size, 18), n(r.font_weight, 400), typeof r.line_spacing === 'number' ? r.line_spacing : 1.6,
       s(r.margin) ?? 'M', n(r.hyphenation, 1), num(r.brightness), s(r.orientation) ?? 'system',
       s(r.page_mode) ?? 'paginated', typeof r.tts_rate === 'number' ? r.tts_rate : 1.0, s(r.tts_voice)]);
  }
  return { merged, conflicts };
}
