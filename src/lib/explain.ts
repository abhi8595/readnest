/**
 * F4 — "Explain this passage" via the user's own AI key (BYOK).
 *
 * OpenAI-compatible chat endpoint (default api.openai.com; works with any
 * compatible gateway by changing the base URL). No bundled key, no server
 * cost: the key lives in SecureStore, answers are cached per book+passage
 * in sqlite kv.
 */
import { kvGet, kvSet } from '@/db/repositories';
import { cacheHash } from './translate';

export const AI_KEYS_SECURE_KEY = 'readnest_ai_keys';
export const AI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
export const AI_DEFAULT_MODEL = 'gpt-4o-mini';

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class AiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

export function normalizeAiBaseUrl(input: string): string {
  const t = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/(localhost(\.\w+)?|.+\..+)(:\d+)?(\/.*)?$/.test(t)) {
    throw new AiError('Base URL must start with http(s):// and include a host.');
  }
  return t;
}

export function explainCacheKey(bookId: string, passage: string): string {
  return `ai:${bookId}:${cacheHash(passage)}`;
}

/** Parse an OpenAI-compatible chat completion (pure — unit tested). */
export function parseChatResponse(json: unknown): string {
  const c = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof c === 'string' && c.trim()) return c.trim();
  const err = (json as { error?: { message?: unknown } })?.error?.message;
  if (typeof err === 'string' && err) throw new AiError(`AI service: ${err.slice(0, 200)}`);
  throw new AiError('AI service returned no answer.');
}

function systemPrompt(bookTitle: string | null): string {
  return `You explain short book passages for a reader${bookTitle ? ` reading "${bookTitle}"` : ''}. ` +
    `Answer in 3 sentences or fewer: plain meaning first, then one line of context (themes, references, difficult words). ` +
    `No spoilers beyond the passage.`;
}

export async function explainPassage(passage: string, bookTitle: string | null, cfg: AiConfig, bookId: string): Promise<string> {
  const t = passage.trim();
  if (!t) throw new AiError('Nothing to explain.');
  if (t.length > 2000) throw new AiError('Selection is too long (2000 chars max).');
  if (!cfg.apiKey) throw new AiError('Add your AI key in Settings → AI explain first (BYOK — you pay your provider, we store nothing).');
  try {
    const cached = await kvGet(explainCacheKey(bookId, t));
    if (cached) return cached;
  } catch { /* cache is best-effort */ }
  const base = normalizeAiBaseUrl(cfg.baseUrl || AI_DEFAULT_BASE_URL);
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: (cfg.model || AI_DEFAULT_MODEL).trim(),
      messages: [
        { role: 'system', content: systemPrompt(bookTitle) },
        { role: 'user', content: `Explain this passage:\n\n"${t}"` },
      ],
      max_tokens: 300,
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new AiError('AI key rejected — check Settings → AI explain.', res.status);
    }
    if (res.status === 429) throw new AiError('AI quota used up — try again later.', res.status);
    throw new AiError(`AI request failed (${res.status}).`, res.status);
  }
  const out = parseChatResponse(await res.json());
  try {
    await kvSet(explainCacheKey(bookId, t), out);
  } catch { /* cache is best-effort */ }
  return out;
}
