/**
 * E1 — Tap-sentence translate, BYOK (zero server cost + privacy story).
 *
 * Providers: DeepL (free-tier key) or Google Cloud Translation (own key).
 * No bundled key — the UI prompts for the user's own key and stores it in
 * SecureStore. Translations are cached per book+sentence in sqlite kv so
 * repeat views and E2 pre-translation cost nothing extra.
 */
import { kvGet, kvSet } from '@/db/repositories';

export type TranslateProvider = 'deepl' | 'google';

export interface TranslateKeys {
  provider: TranslateProvider;
  deeplKey?: string;
  googleKey?: string;
}

/** SecureStore key for the BYOK translate keys (never in sqlite/kv). */
export const TRANSLATE_KEYS_SECURE_KEY = 'readnest_translate_keys';

export class TranslateError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

/** djb2 hex — dependency-free cache key for book+sentence pairs. */
export function cacheHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

export function translateCacheKey(bookId: string, targetLang: string, text: string): string {
  return `tr:${bookId}:${targetLang.toLowerCase()}:${cacheHash(text)}`;
}

export async function translateCacheGet(bookId: string, targetLang: string, text: string): Promise<string | null> {
  try {
    return await kvGet(translateCacheKey(bookId, targetLang, text));
  } catch {
    return null;
  }
}

export async function translateCacheSet(bookId: string, targetLang: string, text: string, translated: string): Promise<void> {
  try {
    await kvSet(translateCacheKey(bookId, targetLang, text), translated);
  } catch { /* cache is best-effort */ }
}

/** Parse a DeepL /translate response (pure — unit tested). */
export function parseDeepLResponse(json: unknown): string {
  const t = (json as { translations?: { text?: unknown }[] })?.translations?.[0]?.text;
  if (typeof t !== 'string' || !t) throw new TranslateError('DeepL returned no translation.');
  return t;
}

/** Parse a Google translate v2 response (pure — unit tested). */
export function parseGoogleResponse(json: unknown): string {
  const t = (json as { data?: { translations?: { translatedText?: unknown }[] } })?.data?.translations?.[0]?.translatedText;
  if (typeof t !== 'string' || !t) throw new TranslateError('Google returned no translation.');
  return t;
}

async function checked(res: Response, provider: string): Promise<Response> {
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new TranslateError(`Invalid ${provider} key — check Settings → Translate.`, res.status);
    }
    if (res.status === 456 || res.status === 429) {
      throw new TranslateError('Translation quota used up — try again later.', res.status);
    }
    throw new TranslateError(`${provider} request failed (${res.status}).`, res.status);
  }
  return res;
}

async function viaDeepL(text: string, targetLang: string, key: string): Promise<string> {
  const res = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: [text], target_lang: targetLang.toUpperCase() }),
  });
  await checked(res, 'DeepL');
  return parseDeepLResponse(await res.json());
}

async function viaGoogle(text: string, targetLang: string, key: string): Promise<string> {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, target: targetLang.toLowerCase(), format: 'text' }),
  });
  await checked(res, 'Google');
  return parseGoogleResponse(await res.json());
}

/**
 * E2 — paragraph extraction for bilingual pre-translation.
 * Returns plain-text paragraphs of the current chapter with GLOBAL indexes
 * matching the reader WebView's `.chap p/li/h1/h2/h3` list, capped so one
 * chapter costs a bounded number of cached API calls.
 */
export interface BilingualPara {
  index: number;
  text: string;
}

const PARA_RE = /<(p|h1|h2|h3|li)[^>]*>([\s\S]*?)<\/\1>/gi;

function plainPara(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractParagraphs(
  chapters: { id: string; html: string }[],
  currentId: string | null,
  maxParas = 30,
  maxChars = 6000,
): BilingualPara[] {
  if (chapters.length === 0) return [];
  let cur = chapters.findIndex((c) => c.id === currentId);
  if (cur < 0) cur = 0;
  // Global offset: paragraphs in earlier chapters.
  let offset = 0;
  for (let i = 0; i < cur; i++) {
    const html = chapters[i]?.html ?? '';
    PARA_RE.lastIndex = 0;
    while (PARA_RE.exec(html) !== null) offset++;
  }
  const out: BilingualPara[] = [];
  let chars = 0;
  const html = chapters[cur]?.html ?? '';
  PARA_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let idx = offset;
  while ((m = PARA_RE.exec(html)) !== null && out.length < maxParas && chars < maxChars) {
    const text = plainPara(m[2] ?? '');
    idx++;
    if (text.length < 2) continue;
    if (/^(\d{1,4}|[ivxlc]{1,7})[.)]?$/i.test(text)) continue; // folio noise
    out.push({ index: idx - 1, text: text.slice(0, 1000) });
    chars += text.length;
  }
  return out;
}

/**
 * Translate one chunk (sentence/paragraph/selection), using the kv cache
 * first. `bookId` scopes the cache (`'selection'` for one-off lookups).
 */
export async function translateText(
  text: string,
  targetLang: string,
  keys: TranslateKeys,
  bookId: string,
): Promise<string> {
  const t = text.trim();
  if (!t) throw new TranslateError('Nothing to translate.');
  if (t.length > 5000) throw new TranslateError('Selection is too long (5000 chars max).');
  const cached = await translateCacheGet(bookId, targetLang, t);
  if (cached) return cached;
  const key = keys.provider === 'deepl' ? keys.deeplKey : keys.googleKey;
  if (!key) {
    throw new TranslateError(
      `Add your ${keys.provider === 'deepl' ? 'DeepL' : 'Google'} key in Settings → Translate first (BYOK — free tiers work).`,
    );
  }
  const out = keys.provider === 'deepl' ? await viaDeepL(t, targetLang, key) : await viaGoogle(t, targetLang, key);
  await translateCacheSet(bookId, targetLang, t, out);
  return out;
}
