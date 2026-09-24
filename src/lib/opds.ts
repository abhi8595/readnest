/**
 * OPDS catalog client — browse public ebook catalogs (Standard Ebooks,
 * Project Gutenberg) and self-hosted Calibre / Calibre-Web libraries
 * (their content server speaks OPDS at /opds), then download books
 * straight into the ReadNest library.
 *
 * Pure parsing (parseOpdsFeed) is unit-tested; network + download run on
 * device via fetch / expo-file-system.
 */
import { XMLParser } from 'fast-xml-parser';
import * as FileSystem from 'expo-file-system';
import { FORMATS } from './formats';

const atom = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export interface OpdsLink {
  rel: string;
  href: string;
  type: string;
}

export interface OpdsAcquisition {
  url: string;
  mime: string;
}

export interface OpdsEntry {
  id: string;
  title: string;
  authors: string[];
  summary: string | null;
  coverUrl: string | null;
  acquisitions: OpdsAcquisition[];
  /** Set for navigation entries (categories, shelves) — open as a feed. */
  navUrl: string | null;
}

export interface OpdsFeed {
  title: string;
  entries: OpdsEntry[];
  nextUrl: string | null;
  prevUrl: string | null;
}

export interface OpdsAuth {
  username: string;
  password: string;
}

const asArray = <T,>(v: T | T[] | undefined | null): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];

const str = (v: unknown): string | null =>
  typeof v === 'string' ? v : v != null && typeof v === 'object' && '#text' in (v as object)
    ? String((v as { '#text': unknown })['#text'])
    : null;

function linksOf(node: Record<string, unknown>): OpdsLink[] {
  return asArray(node.link as Record<string, unknown> | Record<string, unknown>[] | undefined).map((l) => ({
    rel: typeof l['@_rel'] === 'string' ? (l['@_rel'] as string) : 'alternate',
    href: typeof l['@_href'] === 'string' ? (l['@_href'] as string) : '',
    type: typeof l['@_type'] === 'string' ? (l['@_type'] as string) : '',
  })).filter((l) => l.href.length > 0);
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/** Best acquisition for ReadNest: EPUB first, then any supported mime. */
function pickAcquisitions(links: OpdsLink[], base: string): OpdsAcquisition[] {
  const acq = links.filter((l) => /opds-spec\.org\/acquisition/i.test(l.rel));
  const rank = (mime: string): number => {
    const m = mime.toLowerCase();
    if (m.includes('epub')) return 0;
    if (m.includes('pdf')) return 1;
    if (FORMATS.some((f) => f.mime.some((x) => m.includes(x.toLowerCase())))) return 2;
    if (m.includes('zip')) return 3;
    return 9;
  };
  return acq
    .map((l) => ({ url: resolveUrl(l.href, base), mime: l.type || 'application/octet-stream' }))
    .sort((a, b) => rank(a.mime) - rank(b.mime));
}

/** Parse an OPDS/Atom feed document. Throws on invalid feeds. */
export function parseOpdsFeed(xmlText: string, feedUrl: string): OpdsFeed {
  let doc: Record<string, unknown>;
  try {
    doc = atom.parse(xmlText) as Record<string, unknown>;
  } catch {
    throw new Error('This catalog did not return a valid feed (not Atom/OPDS).');
  }
  const feed = doc.feed as Record<string, unknown> | undefined;
  if (!feed || typeof feed !== 'object') throw new Error('Not an OPDS feed: <feed> root missing.');
  const title = str(feed.title) ?? 'Catalog';
  const links = linksOf(feed);
  const nav = (rel: string): string | null => {
    const l = links.find((x) => x.rel === rel || x.rel.endsWith(`/${rel}`));
    return l ? resolveUrl(l.href, feedUrl) : null;
  };
  const entries = asArray(feed.entry as Record<string, unknown> | Record<string, unknown>[] | undefined)
    .map((e): OpdsEntry | null => {
      const id = str(e.id) ?? '';
      const entryTitle = str(e.title) ?? 'Untitled';
      const authors = asArray(e.author as Record<string, unknown> | Record<string, unknown>[] | undefined)
        .map((a) => str(a.name))
        .filter((a): a is string => !!a);
      const elinks = linksOf(e);
      const cover = elinks.find((l) => /opds-spec\.org\/image/i.test(l.rel));
      const acq = pickAcquisitions(elinks, feedUrl);
      const nav = elinks.find((l) => l.rel === 'subsection' || l.rel.endsWith('/subsection'));
      return {
        id,
        title: entryTitle,
        authors,
        summary: str(e.summary) ?? str(e.content),
        coverUrl: cover ? resolveUrl(cover.href, feedUrl) : null,
        acquisitions: acq,
        navUrl: acq.length === 0 && nav ? resolveUrl(nav.href, feedUrl) : null,
      };
    })
    .filter((e): e is OpdsEntry => e !== null);
  return { title, entries, nextUrl: nav('next'), prevUrl: nav('previous') };
}

declare const Buffer:
  | { from(s: string, enc: string): { toString(enc: string): string } }
  | undefined;

function authHeader(auth?: OpdsAuth): Record<string, string> {
  if (!auth?.username) return {};
  const raw = `${auth.username}:${auth.password}`;
  let b64: string;
  if (typeof btoa === 'function') {
    // eslint-disable-next-line no-undef
    b64 = btoa(unescape(encodeURIComponent(raw)));
  } else if (typeof Buffer !== 'undefined') {
    b64 = Buffer.from(raw, 'utf8').toString('base64');
  } else {
    throw new Error('Basic auth is not supported on this runtime.');
  }
  return { Authorization: `Basic ${b64}` };
}

/** Fetch + parse a feed with a 20s timeout. Throws honest errors. */
export async function fetchOpdsFeed(feedUrl: string, auth?: OpdsAuth, timeoutMs = 20000): Promise<OpdsFeed> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(feedUrl, { headers: { Accept: 'application/atom+xml,application/xml,text/xml', ...authHeader(auth) }, signal: ctrl.signal });
    if (res.status === 401 || res.status === 403) {
      throw new Error('This catalog needs a username and password (401). Add credentials to the feed.');
    }
    if (!res.ok) throw new Error(`Catalog request failed (${res.status}). Check the URL.`);
    const text = await res.text();
    return parseOpdsFeed(text, feedUrl);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('Catalog timed out. Check your connection and try again.');
    throw e instanceof Error ? e : new Error('Could not load this catalog.');
  } finally {
    clearTimeout(t);
  }
}

/** Filename for a download: title + extension from mime (epub default). */
export function opdsFilenameFor(entry: OpdsEntry, mime: string): string {
  const fmt = FORMATS.find((f) => f.mime.some((m) => mime.toLowerCase().includes(m.toLowerCase())));
  const ext = fmt?.extensions[0] ?? (mime.includes('pdf') ? 'pdf' : 'epub');
  const safe = entry.title.replace(/[^\w.\-() ]+/g, '_').slice(0, 80) || 'book';
  return `${safe}.${ext}`;
}

/** Download an acquisition to cache; caller passes it to importFileFromUri. */
export async function downloadOpdsEntry(entry: OpdsEntry, auth?: OpdsAuth): Promise<{ localUri: string; filename: string }> {
  const best = entry.acquisitions[0];
  if (!best) throw new Error('This entry has no downloadable file (metadata only).');
  const filename = opdsFilenameFor(entry, best.mime);
  const dest = `${FileSystem.Paths.cache.uri}opds-${Date.now()}-${filename.replace(/[^\w.\-]+/g, '_')}`;
  const dl = await FileSystem.downloadAsync(best.url, dest, { headers: authHeader(auth) });
  if (dl.status !== 200) throw new Error(`Download failed (${dl.status}).`);
  return { localUri: dl.uri, filename };
}

/* ── Saved feeds (kv-backed) ─────────────────────────────── */

export interface SavedOpdsFeed {
  id: string;
  label: string;
  url: string;
  username?: string;
  hasPassword?: boolean;
}

const FEEDS_KEY = 'opds-feeds-v1';

export const BUILTIN_FEEDS: SavedOpdsFeed[] = [
  { id: 'builtin-standardebooks', label: 'Standard Ebooks', url: 'https://standardebooks.org/opds' },
];

export async function listOpdsFeeds(): Promise<SavedOpdsFeed[]> {
  try {
    const { kvGet } = await import('@/db/repositories');
    const raw = await kvGet(FEEDS_KEY);
    const custom = raw ? (JSON.parse(raw) as SavedOpdsFeed[]) : [];
    return [...BUILTIN_FEEDS, ...custom.filter((f) => f && f.url && !BUILTIN_FEEDS.some((b) => b.url === f.url))];
  } catch {
    return BUILTIN_FEEDS;
  }
}

export async function saveOpdsFeed(feed: SavedOpdsFeed): Promise<void> {
  const { kvGet, kvSet } = await import('@/db/repositories');
  const raw = await kvGet(FEEDS_KEY);
  const custom = raw ? (JSON.parse(raw) as SavedOpdsFeed[]) : [];
  const next = [...custom.filter((f) => f.id !== feed.id), feed];
  await kvSet(FEEDS_KEY, JSON.stringify(next));
}

export async function removeOpdsFeed(id: string): Promise<void> {
  const { kvGet, kvSet } = await import('@/db/repositories');
  const raw = await kvGet(FEEDS_KEY);
  const custom = raw ? (JSON.parse(raw) as SavedOpdsFeed[]) : [];
  await kvSet(FEEDS_KEY, JSON.stringify(custom.filter((f) => f.id !== id)));
}

/** Credentials live in SecureStore (never in the kv feed list). */
export async function getOpdsPassword(feedId: string): Promise<string | null> {
  try {
    const SecureStore = await import('expo-secure-store');
    return await SecureStore.getItemAsync(`opds-pass:${feedId}`);
  } catch {
    return null;
  }
}

export async function setOpdsPassword(feedId: string, password: string): Promise<void> {
  const SecureStore = await import('expo-secure-store');
  if (password) await SecureStore.setItemAsync(`opds-pass:${feedId}`, password);
  else await SecureStore.deleteItemAsync(`opds-pass:${feedId}`);
}
