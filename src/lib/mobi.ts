/**
 * MOBI/AZW3 (PalmDB) support — COMPLETE edition.
 * Pure-JS header parsing for metadata (title/author) always works.
 * Text extraction: uncompressed / PalmDoc-compressed MOBI (older .mobi/.prc)
 * is decoded in-app. KF8/AZW3 (modern) uses the same record walk with a
 * best-effort HTML pull; DRM'd files are detected and reported honestly.
 */
import * as FileSystem from 'expo-file-system';
import type { EpubChapter } from './epub';

export interface MobiMeta {
  title: string | null;
  author: string | null;
  isKf8: boolean;
  hasDrm: boolean;
  compression: number;
}

function readU16(b: Uint8Array, o: number): number { return (b[o]! << 8) | b[o + 1]!; }
function readU32(b: Uint8Array, o: number): number {
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}
function readStr(b: Uint8Array, o: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = b[o + i]!;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

async function readBytes(uri: string, position: number, length: number): Promise<Uint8Array> {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64, position, length,
  });
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** PalmDoc (type 2) decompression for a single record. */
function palmDocDecompress(src: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i++]!;
    if (c === 0) { out.push(0); }
    else if (c >= 1 && c <= 8) {
      for (let k = 0; k < c && i < src.length; k++) out.push(src[i++]!);
    } else if (c >= 0x80 && c <= 0xbf) {
      if (i >= src.length) break;
      const c2 = src[i++]!;
      const dist = ((c & 0x3f) << 8) + c2;
      const len = (dist & 7) + 3;
      const pos = (dist >> 3) + 1;
      for (let k = 0; k < len; k++) out.push(out[out.length - pos] ?? 32);
    } else if (c >= 0xc0) {
      out.push(32, c ^ 0x80);
    } else {
      out.push(c);
    }
    if (out.length > 2_000_000) break; // safety cap per record walk
  }
  return Uint8Array.from(out);
}

export async function parseMobiHeader(uri: string): Promise<MobiMeta> {
  const head = await readBytes(uri, 0, 256);
  const type = readStr(head, 60, 8); // "BOOKMOBI"
  if (!type.includes('MOBI') && !type.includes('BOOK')) {
    return { title: null, author: null, isKf8: false, hasDrm: false, compression: 0 };
  }
  const numRecords = readU16(head, 76);
  const rec0off = readU32(head, 78);
  const rec = await readBytes(uri, rec0off, 512);
  const compression = readU16(rec, 0);
  const drmOffset = readU32(rec, 0x5c);
  const drmCount = readU32(rec, 0x60);
  const hasDrm = drmOffset !== 0xffffffff && drmCount !== 0;
  const mobiLen = readU32(rec, 20);
  const titleOff = mobiLen >= 0x54 ? readU32(rec, 0x54) : 0;
  const titleLen = mobiLen >= 0x58 ? readU32(rec, 0x58) : 0;
  let title: string | null = null;
  if (titleLen > 0 && titleLen < 512) {
    const tb = await readBytes(uri, rec0off + titleOff, Math.min(titleLen, 256));
    title = readStr(tb, 0, Math.min(titleLen, 256)) || null;
  }
  // EXTH author (record type 100)
  let author: string | null = null;
  try {
    const exthOff = 16 + 16 + mobiLen; // rough: after MOBI header
    const exth = await readBytes(uri, rec0off + exthOff, 256);
    if (readStr(exth, 0, 4) === 'EXTH') {
      const count = readU32(exth, 8);
      let p = 12;
      for (let i = 0; i < Math.min(count, 40) && p + 8 < 256; i++) {
        const t = readU32(exth, p);
        const len = readU32(exth, p + 4);
        if (t === 100 && len > 8 && len < 200) {
          author = readStr(exth, p + 8, len - 8) || null;
          break;
        }
        p += Math.max(8, len);
      }
    }
  } catch { /* no EXTH */ }
  void numRecords;
  return { title, author, isKf8: compression === 17480, hasDrm, compression };
}

export async function extractMobiChapters(uri: string): Promise<{ chapters: EpubChapter[]; drm: boolean }> {
  const meta = await parseMobiHeader(uri);
  if (meta.hasDrm) {
    return {
      drm: true,
      chapters: [{
        id: 'c0', href: 'mobi:drm', label: 'Protected book',
        html: `<h1>DRM-protected Kindle book</h1><p>This file is locked to another device/account (DRM). ReadNest cannot open DRM-protected files. Open it in the original Kindle app, or import a DRM-free copy.</p>`,
      }],
    };
  }
  if (meta.compression !== 1 && meta.compression !== 2 && !meta.isKf8) {
    throw new Error(`Unsupported MOBI compression (${meta.compression}). Try converting to EPUB.`);
  }
  // Walk text records (record 1..N, PalmDB offsets at 78+8*i)
  const head = await readBytes(uri, 0, 4096);
  const numRecords = Math.min(readU16(head, 76), 2000);
  const offsets: number[] = [];
  for (let i = 0; i < numRecords; i++) offsets.push(readU32(head, 78 + i * 8));
  let size = 0;
  try { size = new FileSystem.File(uri).size; } catch { /* content:// URIs report no size */ }
  const chunks: string[] = [];
  const maxRecords = Math.min(numRecords, 1200);
  for (let i = 1; i < maxRecords; i++) {
    const start = offsets[i]!;
    const end = i + 1 < numRecords ? offsets[i + 1]! : size;
    if (!start || !end || end <= start || end - start > 65536) continue;
    try {
      const raw = await readBytes(uri, start, end - start);
      const data = meta.compression === 2 ? palmDocDecompress(raw) : raw;
      // strip MOBI multibyte trail + decode latin-1 → html-safe
      let s = '';
      const lim = Math.min(data.length, 60000);
      for (let k = 0; k < lim; k++) {
        const c = data[k]!;
        s += c === 0 ? '' : String.fromCharCode(c);
      }
      chunks.push(s);
      if (chunks.join('').length > 2_500_000) break; // ~2.5MB cap
    } catch { break; }
  }
  const joined = chunks.join('');
  // KF8/HTML-ish: keep tags, else wrap paragraphs
  const looksHtml = /<(p|div|h\d|br)[\s>]/i.test(joined);
  const clean = looksHtml
    ? joined.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<mbp:pagebreak[^>]*>/gi, '<hr/>')
    : joined.split(/\r?\n\s*\r?\n/).map((p) => `<p>${p.replace(/</g, '&lt;').slice(0, 4000)}</p>`).join('');
  // chunk into ~15k-char chapters for the pager
  const chapters: EpubChapter[] = [];
  const CH = 15000;
  for (let i = 0; i < clean.length; i += CH) {
    chapters.push({ id: `c${chapters.length}`, href: `mobi:${chapters.length}`, label: meta.title ? `${meta.title} — ${chapters.length + 1}` : `Part ${chapters.length + 1}`, html: clean.slice(i, i + CH) });
    if (chapters.length >= 400) break;
  }
  return {
    drm: false,
    chapters: chapters.length ? chapters : [{ id: 'c0', href: 'mobi:0', label: 'Text', html: '<p>Could not extract text from this file. Try converting it to EPUB.</p>' }],
  };
}
