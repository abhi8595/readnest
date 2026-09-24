/**
 * Device scan — Play-compliant via Storage Access Framework (no
 * MANAGE_EXTERNAL_STORAGE). User grants folder access once; we persist the
 * SAF URI and recursively enumerate supported files.
 *
 * NOTE: SAF directory listing needs a dev-client/EAS build
 * (expo-file-system StorageAccessFramework). In Expo Go we gracefully
 * degrade to manual import only.
 *
 * Found files are COPIED into app storage (books dir): the OS can revoke
 * SAF grants or the user can move the original, but library entries must
 * keep opening. The SAF URI is kept for rescan identity + dedupe.
 */
import * as FileSystem from 'expo-file-system';
import { findBookByHash, upsertBook } from '@/db/repositories';
import { getDb } from '@/db/client';
import { formatFromFilename, titleFromFilename } from './formats';
import { contentKey, copyIntoLibrary, deleteFile, fileSize } from './files';
import { MAX_BOOK_BYTES } from './import';

export interface ScanProgress {
  done: number;
  total: number;
  current: string | null;
}

export interface ScanResult {
  found: number;
  /** Files skipped (0-byte, duplicate content, unknown after re-check). */
  skipped: number;
  /** Entries that failed with an error (permission, copy, hash). */
  errors: string[];
}

type ProgressCb = (p: ScanProgress) => void;

type SafApi = {
  requestDirectoryPermissionsAsync: () => Promise<{ granted: boolean; directoryUri: string }>;
  readDirectoryAsync: (uri: string) => Promise<string[]>;
};

function saf(): SafApi | null {
  try {
    return (FileSystem as unknown as { StorageAccessFramework?: SafApi }).StorageAccessFramework ?? null;
  } catch {
    return null;
  }
}

/** Derive a human label from a SAF tree URI (…%3ADownloads → "Downloads"). */
export function folderLabelFor(safUri: string): string {
  try {
    const tail = safUri.split('%3A').pop() ?? safUri.split(':').pop() ?? '';
    const clean = decodeURIComponent(tail).split('/').filter(Boolean).pop() ?? '';
    return clean || 'Granted folder';
  } catch {
    return 'Granted folder';
  }
}

/** Ask the user to grant a folder (Downloads etc.). Returns SAF URI or null. */
export async function requestFolderAccess(): Promise<string | null> {
  try {
    const api = saf();
    if (!api) return null; // Expo Go
    const res = await api.requestDirectoryPermissionsAsync();
    if (!res.granted) return null;
    const db = await getDb();
    await db.runAsync('INSERT OR REPLACE INTO folders (uri,label,added_at) VALUES (?,?,?)',
      [res.directoryUri, folderLabelFor(res.directoryUri), Date.now()]);
    return res.directoryUri;
  } catch {
    return null;
  }
}

export async function listGrantedFolders(): Promise<{ uri: string; label: string | null }[]> {
  const db = await getDb();
  return db.getAllAsync('SELECT uri, label FROM folders ORDER BY added_at DESC');
}

/** True when the persisted grant still lists (re-grant needed otherwise). */
export async function checkFolderAccess(safUri: string): Promise<boolean> {
  const api = saf();
  if (!api) return false;
  try {
    await api.readDirectoryAsync(safUri);
    return true;
  } catch {
    return false;
  }
}

/** Forget a stale/revoked grant. */
export async function removeGrantedFolder(safUri: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM folders WHERE uri=?', [safUri]);
}

/** Recursive SAF scan. Copies each match into app storage, registers it. */
export async function scanFolder(safUri: string, onProgress: ProgressCb): Promise<ScanResult> {
  const api = saf();
  if (!api) throw new Error('Folder scan needs a dev-client build. Use “Add files” instead.');

  // Fail fast with a re-grant hint instead of a silent empty scan.
  let probe: string[];
  try {
    probe = await api.readDirectoryAsync(safUri);
  } catch {
    throw new Error('Folder access was revoked. Grant the folder again, then rescan.');
  }

  const stack: string[] = [safUri];
  const files: string[] = [];
  const errors: string[] = [];
  // Phase 1: enumerate (cap 5k entries for sanity)
  let truncated = false;
  void probe;
  while (stack.length > 0 && files.length < 5000) {
    const dir = stack.pop() as string;
    let entries: string[] = [];
    try {
      entries = await api.readDirectoryAsync(dir);
    } catch {
      errors.push(`Cannot list: ${dir.slice(0, 80)}`);
      continue;
    }
    for (const e of entries) {
      if (e.endsWith('/')) stack.push(e);
      else {
        try {
          if (formatFromFilename(decodeURIComponent(e.split('/').pop() ?? ''))) files.push(e);
        } catch {
          errors.push(`Bad filename: ${e.slice(0, 80)}`);
        }
      }
      if (files.length >= 5000) { truncated = true; break; }
    }
  }
  if (truncated) errors.push('Folder has more than 5000 supported files — only the first 5000 were indexed.');

  // Phase 2: copy into library + register (deduped by content hash)
  let found = 0;
  let skipped = 0;
  for (let i = 0; i < files.length; i++) {
    const uri = files[i] as string;
    let name = 'book';
    try { name = decodeURIComponent(uri.split('/').pop() ?? 'book'); } catch { /* keep default */ }
    onProgress({ done: i, total: files.length, current: name });
    const format = formatFromFilename(name);
    if (!format) { skipped++; continue; }
    try {
      const dest = await copyIntoLibrary(uri, name);
      const fileSizeBytes = await fileSize(dest);
      if (fileSizeBytes <= 0) { await deleteFile(dest); skipped++; continue; }
      if (fileSizeBytes > MAX_BOOK_BYTES) {
        await deleteFile(dest);
        errors.push(`Too large (>300MB), skipped: ${name.slice(0, 60)}`);
        skipped++;
        continue;
      }
      const hash = await contentKey(dest, fileSizeBytes);
      if (hash) {
        const dupe = await findBookByHash(hash);
        if (dupe && dupe.file_uri !== dest) { await deleteFile(dest); skipped++; continue; }
      }
      await upsertBook({
        file_uri: dest, saf_uri: uri, format,
        title: titleFromFilename(name), file_size: fileSizeBytes,
        content_hash: hash, folder_path: folderLabelFor(safUri),
      });
      found++;
    } catch {
      errors.push(`Import failed: ${name.slice(0, 80)}`);
      skipped++;
      continue;
    }
  }
  onProgress({ done: files.length, total: files.length, current: null });
  const db = await getDb();
  await db.runAsync('UPDATE folders SET last_scanned_at=? WHERE uri=?', [Date.now(), safUri]);
  return { found, skipped, errors };
}
