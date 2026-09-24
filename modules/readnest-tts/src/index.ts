/**
 * readnest-tts — JS bridge to the native background narration module.
 * - Android: foreground service (mediaPlayback type) + platform TextToSpeech
 *   + playback notification with play/pause/next/stop actions.
 * - iOS: AVSpeechSynthesizer with .playback audio session (continues with
 *   the screen locked; UIBackgroundModes audio is declared in app.json).
 *
 * Absent in Expo Go / web → every export degrades to null/false so the
 * app can gate honestly (paywall / disabled state).
 */
import { requireNativeModule } from 'expo-modules-core';

export interface BgTtsNativeModule {
  start(sentences: string[], fromIndex: number, rate: number, language: string, title: string): boolean;
  pause(): void;
  resume(): void;
  next(): void;
  prev(): void;
  stop(): void;
  isPlaying(): boolean;
}

export type BgTtsEvent = 'onSentence' | 'onDone' | 'onStopped';

export type BgTtsEventMap = {
  onSentence: (e: { index: number }) => void;
  onDone: () => void;
  onStopped: () => void;
};

/**
 * Structural listener surface — the native module object itself carries
 * addListener since SDK 52, independent of expo-modules-core's
 * EventEmitter class shape (which changed across versions).
 */
export interface BgTtsEmitter {
  addListener(event: 'onSentence', listener: (e: { index: number }) => void): { remove: () => void };
  addListener(event: 'onDone' | 'onStopped', listener: () => void): { remove: () => void };
}

let cached: BgTtsNativeModule | null | undefined;

/** Native module or null when unavailable (Expo Go / web / old builds). */
export function getBgTtsModule(): BgTtsNativeModule | null {
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<BgTtsNativeModule>('ReadNestTts');
  } catch {
    cached = null;
  }
  return cached;
}

/** The module's listener surface, or null when unavailable. */
export function bgTtsEmitter(): BgTtsEmitter | null {
  const mod = getBgTtsModule();
  if (!mod) return null;
  return mod as unknown as BgTtsEmitter;
}
