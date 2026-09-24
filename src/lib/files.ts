/**
 * File helpers — works in Expo Go AND dev-client/EAS builds.
 * Uses the expo-file-system v56 surface: Paths + File for locations/sizes,
 * legacy copy/read/write helpers for transfers.
 */
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';

const slash = (u: string) => (u.endsWith('/') ? u : `${u}/`);
const DIRS = slash(FileSystem.Paths.document.uri);

export const AppDirs = {
  root: DIRS,
  books: `${DIRS}books/`,
  covers: `${DIRS}covers/`,
  thumbs: `${DIRS}thumbs/`,
  fonts: `${DIRS}fonts/`,
  cache: `${slash(FileSystem.Paths.cache.uri)}readnest/`,
};

export async function ensureDirs(): Promise<void> {
  for (const d of [AppDirs.books, AppDirs.covers, AppDirs.thumbs, AppDirs.fonts, AppDirs.cache]) {
    const info = await FileSystem.getInfoAsync(d);
    if (!info.exists) await FileSystem.makeDirectoryAsync(d, { intermediates: true });
  }
}

/** Copy an imported file into the app library; returns new URI. */
export async function copyIntoLibrary(srcUri: string, filename: string): Promise<string> {
  await ensureDirs();
  const safe = filename.replace(/[^\w.\-() ]+/g, '_');
  let dest = `${AppDirs.books}${Date.now()}_${safe}`;
  // de-dup filename
  let i = 1;
  while ((await FileSystem.getInfoAsync(dest)).exists) {
    dest = `${AppDirs.books}${Date.now()}_${i}_${safe}`;
    i++;
  }
  await FileSystem.copyAsync({ from: srcUri, to: dest });
  return dest;
}

export async function fileSize(uri: string): Promise<number> {
  try {
    const size = new FileSystem.File(uri).size;
    if (typeof size === 'number' && Number.isFinite(size) && size > 0) return size;
  } catch { /* content:// URIs or File API unsupported */ }
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && typeof (info as { size?: number }).size === 'number') {
      return (info as { size?: number }).size!;
    }
  } catch { /* missing file */ }
  return 0;
}

/**
 * Duplicate key: size + head/middle/tail sample hash (avoids hashing whole file).
 * 32KB head + 32KB middle + 32KB tail catches real duplicates incl. renames,
 * while distinguishing same-template files that differ only in the middle.
 * Short/failed reads degrade to a weaker key (documented, never throws).
 */
export async function contentKey(uri: string, size: number): Promise<string | null> {
  try {
    const SAMPLE = 32768;
    const readAt = (position: number, length: number) =>
      FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
        length: Math.max(0, Math.min(length, size - position)),
        position: Math.max(0, position),
      }).catch(() => '');
    const head = size > 0 ? await readAt(0, Math.min(SAMPLE, size)) : '';
    const tail = size > SAMPLE ? await readAt(Math.max(0, size - SAMPLE), SAMPLE) : '';
    const middle = size > SAMPLE * 2
      ? await readAt(Math.floor(size / 2 - SAMPLE / 2), SAMPLE)
      : '';
    if (!head && !tail && !middle) return null;
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${size}:${head.slice(0, 16384)}:${middle.slice(0, 16384)}:${tail.slice(0, 16384)}`,
    );
  } catch {
    return null;
  }
}

export async function deleteFile(uri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch { /* already gone */ }
}

export async function writeCover(bookId: string, base64: string, ext = 'jpg'): Promise<string> {
  await ensureDirs();
  const uri = `${AppDirs.covers}${bookId}.${ext}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}
