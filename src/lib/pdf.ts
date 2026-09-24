/**
 * B3 — In-PDF text search + auto-TOC for outline-less PDFs.
 *
 * Pure JS, Expo Go compatible. No native PDF text APIs are used: we parse
 * uncompressed content streams (`BT…ET` with `Tj`/`TJ`) directly from the
 * file bytes. Compressed (FlateDecode) streams are skipped honestly — when
 * no text layer is found we return [] and the UI says so instead of faking
 * results.
 */
import * as FileSystem from 'expo-file-system';
import type { TocItem } from '@/stores/useReaderStore';

export interface PdfSearchHit {
  page: number;
  snippet: string;
}

/** Decode a PDF literal string body (escapes + octal). */
function decodeLiteral(body: string): string {
  return body.replace(/\\([nrtbf()\\]|0[0-7]{0,3}|[0-7]{3})/g, (m, g: string) => {
    switch (g) {
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case 'b': return '\b';
      case 'f': return '\f';
      case '(': return '(';
      case ')': return ')';
      case '\\': return '\\';
      default: {
        const n = parseInt(g, 8);
        return Number.isFinite(n) ? String.fromCharCode(n) : m;
      }
    }
  });
}

/** Decode a PDF hex string (UTF-16BE with BOM, else PDFDoc≈latin1). */
function decodeHex(hex: string): string {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length === 0) return '';
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i] as number) * 256 + (bytes[i + 1] as number));
    }
    return out;
  }
  return bytes.map((b) => String.fromCharCode(b)).join('');
}

function extractStringsFromBlock(block: string): string {
  const parts: string[] = [];
  // […]TJ arrays (kerned runs) — collect every literal/hex inside.
  const tjRe = /\[((?:[^\[\]]|\[[^\]]*\])*)\]\s*TJ/g;
  let m: RegExpExecArray | null;
  const consumed: [number, number][] = [];
  while ((m = tjRe.exec(block)) !== null) {
    consumed.push([m.index, m.index + m[0].length]);
    const inner = m[1] ?? '';
    let l: RegExpExecArray | null;
    const litRe = /\(((?:\\.|[^()\\])*)\)/g;
    while ((l = litRe.exec(inner)) !== null) parts.push(decodeLiteral(l[1] ?? ''));
    const hexRe = /<([0-9a-fA-F\s]+)>/g;
    let hx: RegExpExecArray | null;
    while ((hx = hexRe.exec(inner)) !== null) parts.push(decodeHex(hx[1] ?? ''));
  }
  // Standalone (…)Tj outside TJ arrays.
  const inConsumed = (idx: number) => consumed.some(([a, b]) => idx >= a && idx <= b);
  const tjSingle = /\(((?:\\.|[^()\\])*)\)\s*Tj/g;
  while ((m = tjSingle.exec(block)) !== null) {
    if (inConsumed(m.index)) continue;
    parts.push(decodeLiteral(m[1] ?? ''));
  }
  const hexSingle = /<([0-9a-fA-F\s]{4,})>\s*Tj/g;
  while ((m = hexSingle.exec(block)) !== null) {
    if (inConsumed(m.index)) continue;
    parts.push(decodeHex(m[1] ?? ''));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Split raw PDF source into per-page text (uncompressed text layer only).
 * Attribution is structural: page objects (`/Type /Page`) reference their
 * content streams (`/Contents N 0 R`), so each BT…ET block is mapped through
 * its enclosing object number. Falls back to nearest-preceding-page when
 * the xref structure can't be resolved.
 */
export function extractPdfPageTexts(raw: string): string[] {
  const pageMarks: number[] = [];
  const pageRe = /\/Type\s*\/Page[^s]/g;
  let pm: RegExpExecArray | null;
  while ((pm = pageRe.exec(raw)) !== null) pageMarks.push(pm.index);
  if (pageMarks.length === 0) return [];

  // Map content-stream object number → page index.
  const contentToPage = new Map<number, number>();
  const objRe = /(\d+)\s+0\s+obj([\s\S]*?)endobj/g;
  let om: RegExpExecArray | null;
  let pageIdx = 0;
  while ((om = objRe.exec(raw)) !== null) {
    const body = om[2] ?? '';
    if (/\/Type\s*\/Page[^s]/.test(body)) {
      const cm = /\/Contents\s+(\d+)\s+0\s+R/.exec(body);
      if (cm?.[1]) contentToPage.set(parseInt(cm[1], 10), pageIdx);
      pageIdx++;
    }
  }

  const pages: string[] = pageMarks.map(() => '');
  const put = (page: number, text: string) => {
    const p = Math.max(0, Math.min(pages.length - 1, page));
    pages[p] = `${pages[p]}${pages[p] ? '\n' : ''}${text}`;
  };
  const btRe = /BT([\s\S]*?)ET/g;
  let bm: RegExpExecArray | null;
  while ((bm = btRe.exec(raw)) !== null) {
    const idx = bm.index;
    const text = extractStringsFromBlock(bm[1] ?? '');
    if (!text) continue;
    // Enclosing object: nearest preceding "N 0 obj" whose body opens a
    // stream (the content stream holding this BT block).
    let page: number | null = null;
    const head = raw.slice(Math.max(0, idx - 2000), idx);
    const objHeads = [...head.matchAll(/(\d+)\s+0\s+obj/g)];
    const lastHead = objHeads[objHeads.length - 1];
    if (lastHead?.[1] && /stream[\s\S]*$/.test(head.slice(lastHead.index ?? 0))) {
      const mapped = contentToPage.get(parseInt(lastHead[1], 10));
      if (mapped !== undefined) page = mapped;
    }
    if (page === null) {
      page = 0;
      for (let i = 0; i < pageMarks.length; i++) {
        if ((pageMarks[i] as number) <= idx) page = i;
        else break;
      }
    }
    put(page, text);
  }
  return pages.map((p) => p.trim());
}

/** Read a PDF file and return per-page text (may be [] when no text layer). */
export async function extractPdfText(uri: string): Promise<string[]> {
  try {
    const raw = await FileSystem.readAsStringAsync(uri);
    const pages = extractPdfPageTexts(raw.slice(0, 8_000_000));
    return pages;
  } catch {
    return [];
  }
}

/** Case-insensitive search over per-page text → capped hits with snippets. */
export function searchPdfPages(pages: string[], query: string, limit = 20): PdfSearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: PdfSearchHit[] = [];
  for (let i = 0; i < pages.length && out.length < limit; i++) {
    const text = pages[i] ?? '';
    const idx = text.toLowerCase().indexOf(q);
    if (idx >= 0) {
      const start = Math.max(0, idx - 60);
      const snippet = `…${text.slice(start, idx + query.trim().length + 120).trim()}…`;
      out.push({ page: i + 1, snippet });
    }
  }
  return out;
}

const HEADING_RE =
  /^(chapter|part|section|book|volume|episode|lesson|lecture)\s+(\d+|[ivxlc]+)\b[:.\-–—\s]*(.*)$/i;
const NUMBERED_RE = /^(\d{1,3}(?:\.\d{1,3}){0,3})\s+(.{3,90})$/;

/**
 * Auto-TOC heuristic for outline-less PDFs: heading-like lines
 * (Chapter N / numbered sections / short title-case lines) → TocItems
 * pointing at `pdf:<page>` hrefs (the reader jumps by page).
 */
export function autoTocFromPdfPages(pages: string[], limit = 60): TocItem[] {
  const items: TocItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < pages.length && items.length < limit; i++) {
    const text = pages[i] ?? '';
    // Lines: split on newlines first, fall back to sentence-ish chunks.
    const rawLines = text.includes('\n') ? text.split('\n') : text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
    for (const raw of rawLines.slice(0, 40)) {
      const line = raw.trim().replace(/\s+/g, ' ');
      if (line.length < 3 || line.length > 110) continue;
      if (seen.has(line.toLowerCase())) continue;
      let label: string | null = null;
      if (HEADING_RE.test(line)) label = line.slice(0, 110);
      else if (NUMBERED_RE.test(line)) label = line.slice(0, 110);
      else if (/^[A-Z0-9][A-Z0-9\s,'’\-–—:;()]{5,80}$/.test(line) && line === line.toUpperCase()) {
        label = line.slice(0, 110);
      }
      if (label) {
        seen.add(line.toLowerCase());
        items.push({ id: `pdf-toc-${items.length}`, label, href: `pdf:${i + 1}`, level: 0 });
      }
    }
  }
  return items;
}
