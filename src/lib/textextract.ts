/**
 * Text-format extractors: TXT/MD, FB2, DOCX, ODT → normalized chapters.
 * Pure JS (Expo Go compatible). MOBI/AZW3 handled in mobi.ts.
 */
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import * as FileSystem from 'expo-file-system';
import type { EpubChapter } from './epub';
import type { BookFormat } from '@/db/schema';

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export interface TextMeta { title: string | null; author: string | null; }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function extractTextMetadata(uri: string, format: BookFormat): Promise<TextMeta> {
  if (format === 'fb2') {
    const raw = await FileSystem.readAsStringAsync(uri);
    const doc = xml.parse(raw);
    const info = doc?.FictionBook?.description?.['title-info'] ?? {};
    const first = info?.author?.['first-name'] ?? info?.author?.[0]?.['first-name'] ?? '';
    const last = info?.author?.['last-name'] ?? info?.author?.[0]?.['last-name'] ?? '';
    return {
      title: info?.['book-title'] ? String(info['book-title']) : null,
      author: `${first} ${last}`.trim() || null,
    };
  }
  if (format === 'docx' || format === 'odt') {
    try {
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const zip = await JSZip.loadAsync(b64, { base64: true });
      const core = await zip.file('docProps/core.xml')?.async('string');
      if (core) {
        const doc = xml.parse(core);
        const cp = doc?.['cp:coreProperties'] ?? {};
        const t = cp['dc:title'] ? String(cp['dc:title']) : null;
        const a = cp['dc:creator'] ? String(cp['dc:creator']) : null;
        if (t || a) return { title: t, author: a };
      }
    } catch { /* ignore */ }
  }
  if (format === 'txt') {
    // first non-empty line as title candidate (<= 80 chars)
    const head = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8, length: 2000, position: 0,
    });
    const line = head.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
    return { title: line && line.length <= 80 ? line : null, author: null };
  }
  return { title: null, author: null };
}

export async function extractTextChapters(uri: string, format: BookFormat): Promise<EpubChapter[]> {
  if (format === 'txt') {
    const raw = await FileSystem.readAsStringAsync(uri);
    // split markdown-ish: "# " headings become chapters; else chunk ~12k chars
    const parts = raw.split(/^#{1,3}\s+.+$/m).length > 1
      ? splitMarkdown(raw)
      : chunkText(raw, 12000);
    return parts.map((p, i) => ({
      id: `c${i}`, href: `txt:${i}`, label: p.label,
      html: p.body.split(/\n{2,}/).map((para) => `<p>${esc(para.trim()).replace(/\n/g, '<br/>')}</p>`).join(''),
    }));
  }
  if (format === 'fb2') {
    const raw = await FileSystem.readAsStringAsync(uri);
    const doc = xml.parse(raw);
    const bodies = doc?.FictionBook?.body;
    const arr = bodies ? (Array.isArray(bodies) ? bodies : [bodies]) : [];
    const chapters: EpubChapter[] = [];
    let i = 0;
    for (const body of arr) {
      const sections = body?.section ? (Array.isArray(body.section) ? body.section : [body.section]) : [];
      if (sections.length === 0) {
        chapters.push(fb2SectionToChapter(body, i++, `Part ${i}`));
      } else {
        for (const s of sections.slice(0, 300)) {
          const title = s?.title?.p ? String(Array.isArray(s.title.p) ? s.title.p[0] : s.title.p).slice(0, 120) : `Chapter ${i + 1}`;
          chapters.push(fb2SectionToChapter(s, i++, title));
        }
      }
    }
    return chapters.length ? chapters : [{ id: 'c0', href: 'fb2:0', label: 'Text', html: '<p>Empty document.</p>' }];
  }
  if (format === 'docx') {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const zip = await JSZip.loadAsync(b64, { base64: true });
    const docXml = (await zip.file('word/document.xml')?.async('string')) ?? '';
    const doc = xml.parse(docXml);
    const paras = doc?.['w:document']?.['w:body']?.['w:p'] ?? [];
    const arr = Array.isArray(paras) ? paras : [paras];
    const blocks: { style: string; text: string }[] = arr.map((p: Record<string, unknown>) => {
      const style = String((p['w:pPr'] as Record<string, Record<string, string>> | undefined)?.['w:pStyle']?.['@_w:val'] ?? 'Normal');
      const runs = (p['w:r'] ? (Array.isArray(p['w:r']) ? p['w:r'] : [p['w:r']]) : []) as Record<string, unknown>[];
      const text = runs.map((r) => {
        const t = (r as Record<string, unknown>)['w:t'];
        if (typeof t === 'string') return t;
        if (t && typeof t === 'object') return String((t as Record<string, string>)['#text'] ?? '');
        return '';
      }).join('');
      return { style, text };
    }).filter((b: { text: string }) => b.text.trim().length > 0);
    return paragraphsToChapters(blocks);
  }
  if (format === 'odt') {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const zip = await JSZip.loadAsync(b64, { base64: true });
    const contentXml = (await zip.file('content.xml')?.async('string')) ?? '';
    const doc = xml.parse(contentXml);
    const body = doc?.['office:document-content']?.['office:body']?.['office:text'] ?? {};
    const paras = [...(toArr(body['text:p'])), ...interleaveHeadings(body)];
    const blocks = paras
      .map((p: unknown) => ({ style: 'Normal', text: paraText(p) }))
      .filter((b: { text: string }) => b.text.trim().length > 0);
    return paragraphsToChapters(blocks);
  }
  throw new Error(`No text extractor for ${format}`);
}

/* helpers */
function toArr<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}
function interleaveHeadings(body: Record<string, unknown>): unknown[] {
  return toArr(body['text:h'] as unknown);
}
function paraText(p: unknown): string {
  if (typeof p === 'string') return p;
  if (p && typeof p === 'object') {
    const o = p as Record<string, unknown>;
    if (typeof o['#text'] === 'string') return o['#text'];
    return Object.values(o).map((v) => (typeof v === 'string' ? v : '')).join('');
  }
  return '';
}

function splitMarkdown(raw: string): { label: string; body: string }[] {
  const out: { label: string; body: string }[] = [];
  const re = /^#{1,3}\s+(.+)$/gm;
  const heads: { title: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) heads.push({ title: (m[1] ?? '').trim(), index: m.index });
  if (!heads.length) return [{ label: 'Text', body: raw }];
  heads.forEach((h, i) => {
    const end = i + 1 < heads.length ? (heads[i + 1] as { index: number }).index : raw.length;
    out.push({ label: h.title.slice(0, 120), body: raw.slice(h.index, end).replace(/^#{1,3}\s+.+$/m, '').trim() });
  });
  return out;
}

function chunkText(raw: string, size: number): { label: string; body: string }[] {
  const paras = raw.split(/\n{2,}/);
  const out: { label: string; body: string }[] = [];
  let cur = '';
  for (const p of paras) {
    if ((cur + p).length > size && cur) {
      out.push({ label: `Part ${out.length + 1}`, body: cur });
      cur = '';
    }
    cur += (cur ? '\n\n' : '') + p;
  }
  if (cur.trim()) out.push({ label: `Part ${out.length + 1}`, body: cur });
  return out.length ? out : [{ label: 'Text', body: raw }];
}

function fb2SectionToChapter(s: Record<string, unknown>, i: number, label: string): EpubChapter {
  const paras = toArr(s.p as string | string[] | undefined);
  const html = paras.slice(0, 2000).map((p) => `<p>${esc(String(p)).slice(0, 5000)}</p>`).join('') || '<p></p>';
  return { id: `c${i}`, href: `fb2:${i}`, label, html };
}

function paragraphsToChapters(blocks: { style: string; text: string }[]): EpubChapter[] {
  const chapters: EpubChapter[] = [];
  let cur: string[] = [];
  let curLabel = 'Document';
  const flush = () => {
    if (cur.length) {
      chapters.push({ id: `c${chapters.length}`, href: `doc:${chapters.length}`, label: curLabel, html: cur.join('') });
      cur = [];
    }
  };
  for (const b of blocks.slice(0, 5000)) {
    if (/^Heading\s?[12]$/.test(b.style) || /^heading/i.test(b.style)) {
      flush();
      curLabel = b.text.slice(0, 120);
    } else {
      cur.push(`<p>${esc(b.text).slice(0, 5000)}</p>`);
    }
    if (cur.length >= 400) { flush(); curLabel = `${curLabel} (cont.)`; }
  }
  flush();
  return chapters.length ? chapters : [{ id: 'c0', href: 'doc:0', label: 'Document', html: '<p>Empty document.</p>' }];
}
