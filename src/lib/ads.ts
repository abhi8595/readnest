/**
 * AdMob — banner in Library + capped interstitial on file-open.
 * Frequency caps: interstitial max 1 per 3 min, never twice in a row for the
 * same book, never during TTS playback, never for Premium users.
 */
import { admobUnitIds } from './config';

const UNITS = admobUnitIds();

export const AD_UNITS = {
  banner: __DEV__ ? 'ca-app-pub-3940256099942544/6300978111' : UNITS.banner,
  interstitial: __DEV__ ? 'ca-app-pub-3940256099942544/1033173712' : UNITS.interstitial,
};

const INTERSTITIAL_COOLDOWN_MS = 3 * 60 * 1000;
let lastShownAt = 0;
let lastBookId: string | null = null;

export function shouldShowInterstitial(bookId: string, isPremium: boolean, ttsActive: boolean): boolean {
  if (__DEV__) return false; // never annoy during development
  if (isPremium || ttsActive) return false;
  if (bookId === lastBookId) return false;
  if (Date.now() - lastShownAt < INTERSTITIAL_COOLDOWN_MS) return false;
  return true;
}

export function markInterstitialShown(bookId: string): void {
  lastShownAt = Date.now();
  lastBookId = bookId;
}
