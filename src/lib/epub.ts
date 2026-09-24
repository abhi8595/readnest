/**
 * Lightweight pure-JS EPUB parser (works in Expo Go — no native modules).
 * Uses jszip + fast-xml-parser. Handles EPUB 2 (NCX) and EPUB 3 (nav).
 */
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import * as FileSystem from 'expo-file-system';

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export interface EpubMeta {
  title: string | null;
  creator: string | null;
  language: string | null;
  description: string | null;
  coverBase64: string | null;
  coverExt: 'jpg' | 'png';
}

export interface EpubChapter {
  id: string;
  href: string;
  label: string;
  /** Sanitized body HTML (images inlined as data URIs when small) */
  html: string;
}

export interface EpubBook {
  meta: EpubMeta;
  chapters: EpubChapter[];
  toc: { id: string; label: string; href: string; level: number }[];
}

async function loadZip(uri: string): Promise<JSZip> {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return JSZip.loadAsync(b64, { base64: true });
}

function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(0, i + 1) : '';
}

function stripScripts(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/ on\w+="[^"]*"/gi, '');
}

export async function extractEpubMetadata(uri: string): Promise<EpubMeta> {
  const zip = await loadZip(uri);
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('Invalid EPUB: container.xml missing');
  const container = xml.parse(containerXml);
  const rootfile = container?.container?.rootfiles?.rootfile;
  const opfPath: string = Array.isArray(rootfile) ? rootfile[0]['@_full-path'] : rootfile?.['@_full-path'];
  if (!opfPath) throw new Error('Invalid EPUB: OPF missing');
  const opf = xml.parse((await zip.file(opfPath)?.async('string')) ?? '');
  const md = opf?.package?.metadata ?? {};
  const title = md['dc:title'] ? String(Array.isArray(md['dc:title']) ? md['dc:title'][0] : md['dc:title']) : null;
  const creatorRaw = md['dc:creator'];
  const creator = creatorRaw ? String(Array.isArray(creatorRaw) ? creatorRaw[0]?.['#text'] ?? creatorRaw[0] : creatorRaw?.['#text'] ?? creatorRaw) : null;
  const language = md['dc:language'] ? String(md['dc:language']) : null;
  const description = md['dc:description'] ? String(md['dc:description']).slice(0, 2000) : null;

  // cover: EPUB3 properties="cover-image" or EPUB2 meta name="cover"
  let coverHref: string | null = null;
  const manifestItems = opf?.package?.manifest?.item ?? [];
  const items = Array.isArray(manifestItems) ? manifestItems : [manifestItems];
  const coverItem = items.find((it: Record<string, string>) => String(it['@_properties'] ?? '').includes('cover-image'));
  if (coverItem) coverHref = String(coverItem['@_href']);
  if (!coverHref) {
    const metas = md?.meta ? (Array.isArray(md.meta) ? md.meta : [md.meta]) : [];
    const coverMeta = metas.find((m: Record<string, string>) => m['@_name'] === 'cover');
    if (coverMeta) {
      const ref = items.find((it: Record<string, string>) => it['@_id'] === coverMeta['@_content']);
      if (ref) coverHref = String(ref['@_href']);
    }
  }
  let coverBase64: string | null = null;
  let coverExt: 'jpg' | 'png' = 'jpg';
  if (coverHref) {
    try {
      const full = dirOf(opfPath) + decodeURIComponent(coverHref);
      const file = zip.file(full);
      if (file) {
        coverBase64 = await file.async('base64');
        coverExt = full.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
      }
    } catch { /* no cover */ }
  }
  return { title, creator, language, description, coverBase64, coverExt };
}

export async function parseEpub(uri: string, opts?: { inlineImages?: boolean }): Promise<EpubBook> {
  const zip = await loadZip(uri);
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('Invalid EPUB');
  const container = xml.parse(containerXml);
  const rootfile = container?.container?.rootfiles?.rootfile;
  const opfPath: string = Array.isArray(rootfile) ? rootfile[0]['@_full-path'] : rootfile?.['@_full-path'];
  const base = dirOf(opfPath);
  const opf = xml.parse((await zip.file(opfPath)?.async('string')) ?? '');
  const manifestRaw = opf?.package?.manifest?.item ?? [];
  const manifest: Record<string, string>[] = Array.isArray(manifestRaw) ? manifestRaw : [manifestRaw];
  const byId = new Map(manifest.map((m) => [String(m['@_id']), String(m['@_href'])]));
  const spineRaw = opf?.package?.spine?.itemref ?? [];
  const spine: Record<string, string>[] = Array.isArray(spineRaw) ? spineRaw : [spineRaw];

  // TOC: try EPUB3 nav then NCX
  const toc: EpubBook['toc'] = [];
  const navItem = manifest.find((m) => String(m['@_properties'] ?? '').includes('nav'));
  if (navItem) {
    try {
      const navHtml = (await zip.file(base + decodeURIComponent(String(navItem['@_href'])))?.async('string')) ?? '';
      const re = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
      let m: RegExpExecArray | null;
      let i = 0;
      while ((m = re.exec(navHtml)) !== null && i < 500) {
        const navLabel = (m[2] ?? '').trim().slice(0, 120);
        const navHref = m[1] ?? '';
        toc.push({ id: `t${i}`, label: navLabel, href: navHref, level: 0 });
        i++;
      }
    } catch { /* fall through to NCX */ }
  }
  if (toc.length === 0) {
    const ncxId = String(opf?.package?.spine?.['@_toc'] ?? 'ncx');
    const ncxHref = byId.get(ncxId) ?? manifest.find((m) => String(m['@_href']).endsWith('.ncx'))?.['@_href'];
    if (ncxHref) {
      try {
        const ncx = xml.parse((await zip.file(base + decodeURIComponent(String(ncxHref)))?.async('string')) ?? '');
        const points = ncx?.ncx?.navMap?.navPoint;
        const arr = points ? (Array.isArray(points) ? points : [points]) : [];
        const walk = (nodes: Record<string, unknown>[], level: number) => {
          for (const n of nodes.slice(0, 300)) {
            const label = String((n as { navLabel?: { text?: string } }).navLabel?.text ?? 'Section');
            const href = String((n as { content?: { '@_src'?: string } }).content?.['@_src'] ?? '');
            toc.push({ id: `t${toc.length}`, label: label.slice(0, 120), href, level });
            const kids = (n as Record<string, unknown>).navPoint;
            if (kids) walk((Array.isArray(kids) ? kids : [kids]) as Record<string, unknown>[], level + 1);
          }
        };
        walk(arr as Record<string, unknown>[], 0);
      } catch { /* no toc */ }
    }
  }

  // Chapters
  const chapters: EpubChapter[] = [];
  let idx = 0;
  for (const ref of spine) {
    const idref = String(ref['@_idref']);
    const linear = String(ref['@_linear'] ?? 'yes');
    if (linear === 'no') continue;
    const href = byId.get(idref);
    if (!href || !/\.(x?html?|xml)$/i.test(href)) continue;
    try {
      const raw = (await zip.file(base + decodeURIComponent(href))?.async('string')) ?? '';
      const body = raw.match(/<body[\s\S]*<\/body>/i)?.[0] ?? raw;
      let html = stripScripts(body);
      if (opts?.inlineImages !== false) {
        // inline images < 300KB as data URIs (cap 15 per chapter)
        const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].slice(0, 15);
        for (const im of imgs) {
          const src = im[1] ?? '';
          if (!src || src.startsWith('data:') || src.startsWith('http')) continue;
          try {
            const imgPath = base + decodeURIComponent(src.replace(/^\.\//, ''));
            const f = zip.file(imgPath) ?? zip.file(base + (src.split('/').pop() ?? ''));
            if (!f) continue;
            const buf = await f.async('uint8array');
            if (buf.byteLength > 300 * 1024) continue;
            const ext = imgPath.toLowerCase().endsWith('.png') ? 'png' : imgPath.toLowerCase().endsWith('.gif') ? 'gif' : 'jpeg';
            let bin = '';
            for (let i = 0; i < buf.byteLength; i++) bin += String.fromCharCode(buf[i] ?? 0);
            // btoa on chunks
            const b64 = btoa(bin);
            html = html.replace(src, `data:image/${ext};base64,${b64}`);
          } catch { /* leave remote */ }
        }
      }
      const chapToc = toc.find((t) => href.includes(t.href.split('#')[0] ?? ''));
      chapters.push({ id: `c${idx}`, href, label: chapToc?.label ?? `Chapter ${idx + 1}`, html });
      idx++;
      if (idx >= 400) break;
    } catch { /* skip broken spine item */ }
  }

  const meta = await extractEpubMetadata(uri).catch<EpubMeta>(() => ({
    title: null, creator: null, language: null, description: null, coverBase64: null, coverExt: 'jpg',
  }));
  return { meta, chapters, toc };
}

/** Plain-text extraction for TTS / search-in-book (cached by caller). */
export function epubToText(chapters: EpubChapter[]): { text: string; offsets: { chapterId: string; start: number }[] } {
  let text = '';
  const offsets: { chapterId: string; start: number }[] = [];
  for (const c of chapters) {
    const plain = c.html
      .replace(/<\/(p|h\d|li|div|br|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    offsets.push({ chapterId: c.id, start: text.length });
    text += (text ? '\n\n' : '') + plain;
  }
  return { text, offsets };
}
