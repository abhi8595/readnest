/**
 * E3 — Word-book review decks (SRS-lite over dictionary_history).
 *
 * Leitner boxes 1–5 with day intervals. Progress lives in sqlite kv
 * (`wordbook-v1`) as {word: {box, nextDue}}; the lookup history supplies
 * the deck (only words the user actually looked up are reviewed).
 * All scheduling logic is pure — unit tested.
 */
import { kvGet, kvSet } from '@/db/repositories';

const KEY = 'wordbook-v1';
const DAY = 86_400_000;

/** Days until next review per box (index = box). */
export const BOX_INTERVALS = [0, 1, 3, 7, 14, 30];

export interface WordProgress {
  box: number;
  nextDue: number;
}

export type WordbookState = Record<string, WordProgress>;

export function sanitizeState(raw: unknown): WordbookState {
  if (!raw || typeof raw !== 'object') return {};
  const out: WordbookState = {};
  for (const [w, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof w !== 'string' || !w) continue;
    const p = v as Partial<WordProgress>;
    const box = Math.min(5, Math.max(1, Math.floor(p.box ?? 1)));
    const nextDue = typeof p.nextDue === 'number' && Number.isFinite(p.nextDue) ? p.nextDue : 0;
    out[w.toLowerCase()] = { box, nextDue };
  }
  return out;
}

export async function loadWordbook(): Promise<WordbookState> {
  try {
    const raw = await kvGet(KEY);
    if (!raw) return {};
    return sanitizeState(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function saveWordbook(state: WordbookState): Promise<void> {
  try {
    await kvSet(KEY, JSON.stringify(state));
  } catch { /* progress save is best-effort */ }
}

export interface DeckCard {
  word: string;
  lookedUpAt: number;
  box: number;
  isNew: boolean;
}

/**
 * Build today's deck: looked-up words that are new or due, oldest first.
 * Caps at `limit` so sessions stay snackable.
 */
export function buildDeck(
  lookups: { word: string; looked_up_at: number }[],
  state: WordbookState,
  now = Date.now(),
  limit = 20,
): DeckCard[] {
  const seen = new Set<string>();
  const out: DeckCard[] = [];
  for (const l of lookups) {
    const w = l.word.toLowerCase();
    if (seen.has(w)) continue;
    seen.add(w);
    const p = state[w];
    if (!p || p.nextDue <= now) {
      out.push({ word: w, lookedUpAt: l.looked_up_at, box: p?.box ?? 1, isNew: !p });
    }
    if (out.length >= limit) break;
  }
  return out.sort((a, b) => Number(a.isNew) - Number(b.isNew) || a.lookedUpAt - b.lookedUpAt);
}

/** Grade a card: knew → box up, forgot → back to box 1. Pure. */
export function gradeWord(state: WordbookState, word: string, knew: boolean, now = Date.now()): WordbookState {
  const w = word.toLowerCase();
  const cur = state[w] ?? { box: 1, nextDue: 0 };
  const box = knew ? Math.min(5, cur.box + 1) : 1;
  return { ...state, [w]: { box, nextDue: now + BOX_INTERVALS[box]! * DAY } };
}

export function dueCount(lookups: { word: string; looked_up_at: number }[], state: WordbookState, now = Date.now()): number {
  return buildDeck(lookups, state, now, 10000).length;
}
