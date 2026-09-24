import type { BookFormat } from '@/db/schema';

/**
 * COMPLETE format registry. Capability tiers:
 * - full: native in-app rendering + reflow + TTS + highlights
 * - paged: native rendering, page-based (PDF/CBZ)
 * - text: extracted-text reading (converted view) + full TTS/highlights
 * - library: metadata + external-open (kept in library, honest fallback)
 */
export type FormatTier = 'full' | 'paged' | 'text' | 'library';

export interface FormatInfo {
  format: BookFormat;
  label: string;
  extensions: string[];
  mime: string[];
  tier: FormatTier;
  badge: string;
}

export const FORMATS: FormatInfo[] = [
  { format: 'epub', label: 'EPUB', extensions: ['epub'], mime: ['application/epub+zip'], tier: 'full', badge: 'EPUB' },
  { format: 'fb2', label: 'FictionBook', extensions: ['fb2', 'fb2.zip'], mime: ['application/x-fictionbook+xml', 'text/xml'], tier: 'full', badge: 'FB2' },
  { format: 'txt', label: 'Plain text', extensions: ['txt', 'text', 'md', 'markdown'], mime: ['text/plain', 'text/markdown'], tier: 'full', badge: 'TXT' },
  { format: 'pdf', label: 'PDF', extensions: ['pdf'], mime: ['application/pdf'], tier: 'paged', badge: 'PDF' },
  { format: 'cbz', label: 'Comic (ZIP)', extensions: ['cbz'], mime: ['application/vnd.comicbook+zip', 'application/zip'], tier: 'paged', badge: 'CBZ' },
  { format: 'cbr', label: 'Comic (RAR)', extensions: ['cbr'], mime: ['application/vnd.comicbook-rar', 'application/x-rar-compressed'], tier: 'library', badge: 'CBR' },
  { format: 'docx', label: 'Word', extensions: ['docx'], mime: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], tier: 'text', badge: 'DOCX' },
  { format: 'odt', label: 'OpenDocument', extensions: ['odt'], mime: ['application/vnd.oasis.opendocument.text'], tier: 'text', badge: 'ODT' },
  { format: 'mobi', label: 'MobiPocket', extensions: ['mobi', 'prc'], mime: ['application/x-mobipocket-ebook'], tier: 'text', badge: 'MOBI' },
  { format: 'azw3', label: 'Kindle KF8', extensions: ['azw3', 'azw'], mime: ['application/vnd.amazon.ebook'], tier: 'text', badge: 'AZW3' },
  { format: 'doc', label: 'Word (legacy)', extensions: ['doc'], mime: ['application/msword'], tier: 'library', badge: 'DOC' },
  { format: 'chm', label: 'Compiled HTML', extensions: ['chm'], mime: ['application/vnd.ms-htmlhelp'], tier: 'library', badge: 'CHM' },
  { format: 'djvu', label: 'DjVu', extensions: ['djvu', 'djv'], mime: ['image/vnd.djvu'], tier: 'library', badge: 'DJVU' },
];

export const SUPPORTED_EXTENSIONS = new Set(FORMATS.flatMap((f) => f.extensions));

export function formatFromFilename(name: string): BookFormat | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.fb2.zip')) return 'fb2';
  const ext = lower.split('.').pop() ?? '';
  return FORMATS.find((f) => f.extensions.includes(ext))?.format ?? null;
}

export function formatInfo(f: BookFormat): FormatInfo {
  return FORMATS.find((x) => x.format === f) as FormatInfo;
}

/** Human title fallback from filename: "dune_frank-herbert.epub" → "Dune Frank Herbert" */
export function titleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_+]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return base.replace(/\b\w/g, (c) => c.toUpperCase()) || 'Untitled';
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}
