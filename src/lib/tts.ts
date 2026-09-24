/**
 * TTS — foreground via expo-speech (free) + background playback
 * (Premium, native module `readnest-tts`: Android foreground service
 * with media notification, iOS AVSpeech with playback audio session).
 *
 * Sentence-chunked speaking with highlight callbacks and sleep timer.
 */
import * as Speech from 'expo-speech';
import { PermissionsAndroid, Platform } from 'react-native';
import { bgTtsEmitter, getBgTtsModule } from 'readnest-tts';

export interface VoiceOption { id: string; name: string; language: string; quality: string; }

export async function listVoices(): Promise<VoiceOption[]> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices.map((v) => ({ id: v.identifier, name: v.name, language: v.language, quality: v.quality }));
  } catch {
    return [];
  }
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    // Multilingual boundary: Latin + CJK (。！？) + Arabic (؟) + Indic (۔।॥)
    // + quotes. Splitting is intentionally greedy — abbreviations may
    // over-split, which is harmless for speech but dropping non-Latin
    // boundaries is not.
    .split(/(?<=[.!?…。！？…"”'’؟۔।॥])\s*/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .slice(0, 20000);
}

/**
 * C2 — Smart narration: strip running headers/footers/page numbers from
 * chapter HTML before building the sentence map (pure, unit tested).
 *
 * Removes header/footer/nav elements, nodes whose class/id looks like a
 * running head or page number, and script/style/comments. What remains is
 * body copy — the robotic "Chapter One… 42… Chapter One…" patter disappears.
 */
export function cleanChapterHtmlForTts(html: string): string {
  let out = html;
  // Comments + script/style first (parsers usually strip these already).
  out = out.replace(/<!--[\s\S]*?-->/g, ' ');
  out = out.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // Structural running matter.
  out = out.replace(/<(header|footer|nav)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // Classed/ided noise: page numbers, running heads, footnotes markers.
  // Matches a full element (non-greedy) to avoid eating siblings.
  out = out.replace(
    /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*(?:class|id)\s*=\s*["'][^"']*(?:page-?number|pagenum|running-?head|doc-?header|doc-?footer|footnote-?ref|calibre-\d+)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
    ' ',
  );
  return out;
}

/** Sentences that are just a page number / folio — never narrate these. */
export function isFolioNoise(sentence: string): boolean {
  const t = sentence.trim();
  return /^(\d{1,4}|[ivxlc]{1,7})[.)]?$/.test(t);
}

/**
 * Sentence map aligned with the reader WebView's `<p>` list so foreground
 * highlighting lands on the exact paragraph being spoken (no more i/3 guess
 * that wrapped around with modulo at end-of-book).
 */
export interface TtsMap {
  sentences: string[];
  paraIndex: number[];
  /** Sentence indexes that open a new chapter (narration pauses before them). */
  chapterBreaks: number[];
}

export function buildTtsMap(chapters: { html: string }[]): TtsMap {
  const sentences: string[] = [];
  const paraIndex: number[] = [];
  const chapterBreaks: number[] = [];
  let p = 0;
  const paraRe = /<(p|h1|h2|h3|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const c of chapters) {
    const html = cleanChapterHtmlForTts(c.html);
    if (sentences.length > 0) chapterBreaks.push(sentences.length);
    paraRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    let found = false;
    while ((m = paraRe.exec(html)) !== null) {
      found = true;
      const plain = m[2]!
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
      for (const s of splitSentences(plain).slice(0, 20000 - sentences.length)) {
        if (isFolioNoise(s)) continue;
        sentences.push(s);
        paraIndex.push(p);
      }
      p++;
      if (sentences.length >= 20000) break;
    }
    if (!found) {
      // No block tags (plain-text chapters): treat whole chapter as one block.
      const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      for (const s of splitSentences(plain).slice(0, 20000 - sentences.length)) {
        if (isFolioNoise(s)) continue;
        sentences.push(s);
        paraIndex.push(p);
      }
      p++;
    }
    if (sentences.length >= 20000) break;
  }
  return { sentences, paraIndex, chapterBreaks };
}

/**
 * C2 — time-left from a word-rate estimate (170 wpm at 1×, scaled by rate).
 * Heuristic, not a promise — labels are prefixed with ~.
 */
export function estimateTimeLeft(sentences: string[], fromIndex: number, rate: number): string {
  let words = 0;
  for (let i = Math.max(0, fromIndex); i < sentences.length; i++) {
    words += (sentences[i] ?? '').split(/\s+/).filter(Boolean).length;
  }
  const secs = Math.max(0, Math.round((words / (170 * Math.max(0.4, rate))) * 60));
  if (secs < 60) return `~${Math.max(1, secs)} sec left`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `~${mins} min left`;
  return `~${Math.floor(mins / 60)}h ${mins % 60}m left`;
}

interface SpeakOpts {
  sentences: string[];
  fromIndex?: number;
  rate?: number;
  voice?: string;
  language?: string;
  onSentence?: (index: number) => void;
  onDone?: () => void;
  onStopped?: () => void;
  /** stop after N minutes (sleep timer) */
  sleepMinutes?: number | null;
  /** C2 — sentence indexes opening a chapter: brief pause before them. */
  chapterBreaks?: number[];
}

let stopped = true;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Sleep timer fired mid-utterance — honored at the next sentence boundary. */
let sleepFired = false;

function clearTimer() {
  if (timer) { clearTimeout(timer); timer = null; }
  sleepFired = false;
}

export async function stopSpeaking(): Promise<void> {
  stopped = true;
  clearTimer();
  try {
    const speaking = await Speech.isSpeakingAsync();
    if (speaking) await Speech.stop();
  } catch { /* noop */ }
}

export async function speakSentences(opts: SpeakOpts): Promise<void> {
  await stopSpeaking();
  stopped = false;
  const { sentences, fromIndex = 0, rate = 1, voice, language = 'en', onSentence, onDone, onStopped } = opts;
  const breaks = new Set(opts.chapterBreaks ?? []);

  if (opts.sleepMinutes) {
    timer = setTimeout(() => { sleepFired = true; }, opts.sleepMinutes * 60 * 1000);
  }

  for (let i = fromIndex; i < sentences.length; i++) {
    // Stop (or sleep expiry) is honored between sentences so speech never
    // cuts off mid-word — the timer flag just fast-forwards the exit path.
    if (stopped || sleepFired) { stopped = true; clearTimer(); onStopped?.(); return; }
    // C2 — chapter pause: a beat of silence at chapter boundaries.
    if (i > fromIndex && breaks.has(i)) {
      await new Promise<void>((resolve) => setTimeout(resolve, 700));
      if (stopped || sleepFired) { stopped = true; clearTimer(); onStopped?.(); return; }
    }
    onSentence?.(i);
    await new Promise<void>((resolve) => {
      Speech.speak(sentences[i] as string, {
        rate: Math.min(2, Math.max(0.4, rate)),
        voice,
        language,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    });
  }
  if (!stopped) {
    stopped = true;
    clearTimer();
    onDone?.();
  }
}

/* ── Background TTS (native module) ────────────────────── */

/** True only when the native module is present (dev-client / store builds). */
export function isBackgroundTtsSupported(): boolean {
  if (Platform.OS === 'web') return false;
  return getBgTtsModule() != null;
}

export function isBackgroundPlaying(): boolean {
  try {
    return getBgTtsModule()?.isPlaying() ?? false;
  } catch {
    return false;
  }
}

let bgSubs: { remove: () => void }[] = [];

function clearBgSubs() {
  for (const s of bgSubs) {
    try { s.remove(); } catch { /* noop */ }
  }
  bgSubs = [];
}

export interface BgSpeakOpts {
  sentences: string[];
  fromIndex: number;
  rate: number;
  language: string;
  title: string;
  sleepMinutes?: number | null;
  onSentence?: (index: number) => void;
  onDone?: () => void;
  onStopped?: () => void;
}

/**
 * Start background narration. Returns false when unsupported.
 * On Android 13+ the POST_NOTIFICATIONS runtime grant is requested first —
 * the start proceeds regardless (playback works; only the media
 * notification hides until the user grants it).
 */
export async function startBackgroundTts(opts: BgSpeakOpts): Promise<boolean> {
  const mod = getBgTtsModule();
  if (!mod) return false;
  if (Platform.OS === 'android' && (Platform.Version as number) >= 33) {
    try {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS!);
    } catch { /* Expo Go / older constants */ }
  }
  clearBgSubs();
  clearTimer();
  const em = bgTtsEmitter();
  if (em) {
    bgSubs.push(em.addListener('onSentence', (e: { index: number }) => opts.onSentence?.(e.index)));
    bgSubs.push(em.addListener('onDone', () => { clearTimer(); opts.onDone?.(); }));
    bgSubs.push(em.addListener('onStopped', () => { clearTimer(); opts.onStopped?.(); }));
  }
  if (opts.sleepMinutes) {
    timer = setTimeout(() => { stopBackgroundTts(); opts.onStopped?.(); }, opts.sleepMinutes * 60 * 1000);
  }
  void stopSpeaking();
  return mod.start(opts.sentences, opts.fromIndex, opts.rate, opts.language, opts.title);
}

export function bgPause(): void {
  try { getBgTtsModule()?.pause(); } catch { /* noop */ }
}

export function bgResume(): void {
  try { getBgTtsModule()?.resume(); } catch { /* noop */ }
}

export function bgJump(deltaSentences: 3 | -3): void {
  try {
    if (deltaSentences > 0) getBgTtsModule()?.next();
    else getBgTtsModule()?.prev();
  } catch { /* noop */ }
}

export function stopBackgroundTts(): void {
  clearTimer();
  clearBgSubs();
  try { getBgTtsModule()?.stop(); } catch { /* noop */ }
}
