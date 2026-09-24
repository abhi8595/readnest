/**
 * Annotation export — highlights + notes → Markdown for sharing
 * (Obsidian/Notion accept .md), with clipboard fallback.
 * The formatter is pure and unit-tested.
 */
import * as FileSystem from 'expo-file-system';

export interface ExportableQuote {
  text: string;
  note: string | null;
  color: string | null;
  book_title: string | null;
  chapter: string | null;
  created_at: number;
}

function mdEscape(s: string): string {
  return s.replace(/([\\`*_{}[\]()#+!|])/g, '\\$1');
}

function fmtDate(ts: number): string {
  try {
    return new Date(ts).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

/** Group by book, newest first — stable output for tests and readers. */
export function quotesToMarkdown(items: ExportableQuote[], opts?: { title?: string }): string {
  const title = opts?.title ?? 'ReadNest export';
  const lines = [`# ${title}`, '', `_Exported ${new Date().toISOString().slice(0, 10)} · ${items.length} highlight${items.length === 1 ? '' : 's'}_`, ''];
  const byBook = new Map<string, ExportableQuote[]>();
  for (const q of items) {
    const key = q.book_title ?? 'Unknown book';
    const g = byBook.get(key) ?? [];
    g.push(q);
    byBook.set(key, g);
  }
  for (const [book, qs] of [...byBook.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`## ${mdEscape(book)}`, '');
    for (const q of qs.sort((a, b) => b.created_at - a.created_at)) {
      const where = [q.chapter, fmtDate(q.created_at)].filter(Boolean).join(' · ');
      lines.push(`> ${q.text.split('\n').join('\n> ')}`);
      if (where) lines.push('', `— ${mdEscape(where)}`);
      if (q.note) lines.push('', `**Note:** ${q.note.split('\n').join('  \n')}`);
      lines.push('');
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}

/**
 * Share a Markdown file via the system sheet; falls back to copying the
 * text when sharing is unavailable (Expo Go web, restricted devices).
 */
export async function shareMarkdown(filename: string, markdown: string): Promise<'shared' | 'copied'> {
  try {
    const { default: Sharing } = await import('expo-sharing');
    const available = await Sharing.isAvailableAsync().catch(() => false);
    if (available) {
      const safe = filename.replace(/[^\w.\-]+/g, '_');
      const uri = `${FileSystem.Paths.cache.uri}${Date.now()}-${safe}`;
      await FileSystem.writeAsStringAsync(uri, markdown, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(uri, { mimeType: 'text/markdown' });
      return 'shared';
    }
  } catch { /* fall through to clipboard */ }
  const Clipboard = await import('expo-clipboard');
  await Clipboard.setStringAsync(markdown);
  return 'copied';
}
