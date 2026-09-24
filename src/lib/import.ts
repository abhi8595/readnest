import * as DocumentPicker from 'expo-document-picker';
import { findBookByHash, upsertBook } from '@/db/repositories';
import type { BookRow } from '@/db/schema';
import { formatFromFilename, titleFromFilename } from './formats';
import { contentKey, copyIntoLibrary, deleteFile, fileSize } from './files';
import { extractEpubMetadata } from './epub';
import { extractTextMetadata } from './textextract';
import { parseMobiHeader } from './mobi';

export interface ImportResult {
  imported: number;
  skipped: string[];
  errors: string[];
}

/**
 * Hard ceiling for a single book: above this, pure-JS parsing (base64 of the
 * whole file on the JS thread) will OOM on most phones. The copy is removed
 * and the caller reports an honest error instead of crashing.
 */
export const MAX_BOOK_BYTES = 300 * 1024 * 1024;

/**
 * Import one file into the library (copy + metadata + dedupe key).
 * Shared by the manual picker and the Android "Open with ReadNest" intent.
 * Throws `UNSUPPORTED:<name>` for unknown extensions.
 */
export async function importFileFromUri(uri: string, fileName: string, size?: number): Promise<BookRow> {
  const format = formatFromFilename(fileName);
  if (!format) throw new Error(`UNSUPPORTED:${fileName}`);

  const dest = await copyIntoLibrary(uri, fileName);
  const fileBytes = size ?? (await fileSize(dest));
  if (fileBytes <= 0) {
    await deleteFile(dest);
    throw new Error(`EMPTY:${fileName}`);
  }
  if (fileBytes > MAX_BOOK_BYTES) {
    await deleteFile(dest);
    throw new Error(`TOO_LARGE:${fileName} (${Math.round(fileBytes / 1048576)}MB exceeds the 300MB limit)`);
  }
  const hash = await contentKey(dest, fileBytes);

  // Content dedupe: same bytes under a rename → keep original, drop the copy.
  if (hash) {
    const dupe = await findBookByHash(hash);
    if (dupe && dupe.file_uri !== dest) {
      await deleteFile(dest);
      return dupe;
    }
  }

  let title = titleFromFilename(fileName);
  let author: string | null = null;
  let cover: string | null = null;
  let language: string | null = null;
  let description: string | null = null;

  if (format === 'epub') {
    try {
      const meta = await extractEpubMetadata(dest);
      if (meta.title) title = meta.title;
      if (meta.creator) author = meta.creator;
      if (meta.coverBase64) {
        const { writeCover } = await import('./files');
        const { uid } = await import('@/db/repositories');
        cover = await writeCover(uid(), meta.coverBase64, meta.coverExt);
      }
      language = meta.language;
      description = meta.description;
    } catch { /* keep filename fallback */ }
  } else if (format === 'txt' || format === 'fb2' || format === 'docx' || format === 'odt') {
    try {
      const meta = await extractTextMetadata(dest, format);
      if (meta.title) title = meta.title;
      if (meta.author) author = meta.author;
    } catch { /* fallback */ }
  } else if (format === 'mobi' || format === 'azw3') {
    try {
      const meta = await parseMobiHeader(dest);
      if (meta.title) title = meta.title;
      if (meta.author) author = meta.author;
    } catch { /* fallback */ }
  }

  return upsertBook({
    file_uri: dest, format, title, author,
    file_size: fileBytes, content_hash: hash, cover_uri: cover,
    language, description, folder_path: 'Imported',
  });
}

/**
 * Manual import via system picker. Supports multi-select; copies into library,
 * extracts metadata per format, computes duplicate keys. Works in Expo Go.
 */
export async function pickAndImport(): Promise<ImportResult> {
  const res: ImportResult = { imported: 0, skipped: [], errors: [] };
  const picked = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: [
      'application/epub+zip', 'application/pdf', 'text/plain', 'text/markdown',
      'application/x-fictionbook+xml', 'application/x-mobipocket-ebook',
      'application/vnd.amazon.ebook', 'application/zip',
      'application/vnd.comicbook+zip', 'application/vnd.comicbook-rar',
      'application/x-rar-compressed',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.ms-htmlhelp', 'image/vnd.djvu', 'application/octet-stream',
    ],
  });
  if (picked.canceled) return res;

  for (const asset of picked.assets) {
    try {
      const name = asset.name ?? asset.uri.split('/').pop() ?? 'book';
      await importFileFromUri(asset.uri, name, asset.size ?? undefined);
      res.imported++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Import failed';
      if (msg.startsWith('UNSUPPORTED:')) res.skipped.push(msg.slice('UNSUPPORTED:'.length));
      else if (msg.startsWith('EMPTY:')) res.skipped.push(`${msg.slice('EMPTY:'.length)} (empty file)`);
      else if (msg.startsWith('TOO_LARGE:')) res.errors.push(msg.slice('TOO_LARGE:'.length));
      else res.errors.push(msg);
    }
  }
  return res;
}
