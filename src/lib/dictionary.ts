/**
 * Dictionary — offline seed lexicon + Free Dictionary API + Wiktionary fallback.
 * Lookups are recorded to dictionary_history for the hub's "Recent" section.
 */
import { addDictLookup } from '@/db/repositories';

export interface DictSense { partOfSpeech: string; definitions: string[]; example?: string; }
export interface DictEntry {
  word: string;
  phonetic?: string;
  senses: DictSense[];
  source: 'offline' | 'api' | 'wiktionary';
}

/** Small offline seed (common bookish words) so lookup works offline. */
const OFFLINE: Record<string, DictSense[]> = {
  nest: [{ partOfSpeech: 'noun', definitions: ['A structure built by birds or insects to hold eggs or young.', 'A place of comfort or belonging.'], example: 'She made a nest of blankets.' }],
  tome: [{ partOfSpeech: 'noun', definitions: ['A large, heavy book, especially a scholarly one.'] }],
  prologue: [{ partOfSpeech: 'noun', definitions: ['An introductory section of a book or play.'] }],
  epilogue: [{ partOfSpeech: 'noun', definitions: ['A concluding section that rounds out a story.'] }],
  anthology: [{ partOfSpeech: 'noun', definitions: ['A collection of writings by various authors.'] }],
  manuscript: [{ partOfSpeech: 'noun', definitions: ['A handwritten or typed document, especially a draft of a book.'] }],
  quintessential: [{ partOfSpeech: 'adjective', definitions: ['Representing the perfect example of something.'] }],
  ephemeral: [{ partOfSpeech: 'adjective', definitions: ['Lasting a very short time.'] }],
  serendipity: [{ partOfSpeech: 'noun', definitions: ['Finding something good without looking for it.'] }],
  luminous: [{ partOfSpeech: 'adjective', definitions: ['Full of or giving off light; bright.'] }],
  melancholy: [{ partOfSpeech: 'noun', definitions: ['A deep, thoughtful sadness.'] }],
  solace: [{ partOfSpeech: 'noun', definitions: ['Comfort in a time of distress.'] }],
  odyssey: [{ partOfSpeech: 'noun', definitions: ['A long, eventful journey.'] }],
  myriad: [{ partOfSpeech: 'adjective', definitions: ['Countless; innumerable.'] }],
  revere: [{ partOfSpeech: 'verb', definitions: ['To feel deep respect or admiration for.'] }],
};

export async function lookupWord(word: string, bookId?: string): Promise<DictEntry | null> {
  const w = word.trim().toLowerCase().replace(/^[^a-z']+|[^a-z']+$/gi, '');
  if (!w) return null;
  await addDictLookup(w, bookId).catch(() => {});

  if (OFFLINE[w]) return { word: w, senses: OFFLINE[w] as DictSense[], source: 'offline' };

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const json = (await res.json()) as {
        word: string; phonetic?: string;
        meanings?: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[];
      }[];
      const first = json[0];
      if (first?.meanings?.length) {
        return {
          word: first.word,
          phonetic: first.phonetic,
          source: 'api',
          senses: first.meanings.slice(0, 4).map((m) => ({
            partOfSpeech: m.partOfSpeech,
            definitions: m.definitions.slice(0, 3).map((d) => d.definition),
            example: m.definitions.find((d) => d.example)?.example,
          })),
        };
      }
    }
  } catch { /* offline → wiktionary link still useful */ }

  // Wiktionary fallback: return a pointer entry (hub renders "Open in browser")
  return { word: w, senses: [], source: 'wiktionary' };
}

export function wiktionaryUrl(word: string): string {
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`;
}
