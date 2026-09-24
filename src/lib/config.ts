/**
 * Central app configuration — every third-party ID/key in one place.
 *
 * Values resolve from EXPO_PUBLIC_* env vars first (inlined at bundle time),
 * then app.config.js `extra` (same env, baked into the native manifest).
 * Empty string = not configured; every consumer degrades gracefully:
 * paywall shows honest "not available" copy, Drive shows a setup alert,
 * ads fall back to Google test units in dev.
 *
 * Setup: copy .env.example → .env and fill in keys. Never commit .env.
 */
import Constants from 'expo-constants';

const env = process.env as Record<string, string | undefined>;

interface ExtraShape {
  googleAuth?: { iosClientId?: string; androidClientId?: string; webClientId?: string };
  revenueCat?: { ios?: string; android?: string };
  eas?: { projectId?: string };
}

function extra(): ExtraShape {
  return (Constants.expoConfig?.extra ?? {}) as ExtraShape;
}

/** RevenueCat public SDK keys (safe to ship in the client). */
export function rcKeys(): { ios: string; android: string } {
  const e = extra().revenueCat ?? {};
  return {
    ios: env.EXPO_PUBLIC_RC_IOS ?? e.ios ?? '',
    android: env.EXPO_PUBLIC_RC_ANDROID ?? e.android ?? '',
  };
}

/** Google OAuth client IDs for Drive sync (all three from one Cloud project). */
export function googleAuthIds(): {
  iosClientId: string;
  androidClientId: string;
  webClientId: string;
} {
  const g = extra().googleAuth ?? {};
  return {
    iosClientId: env.EXPO_PUBLIC_GOOGLE_IOS_ID ?? g.iosClientId ?? '',
    androidClientId: env.EXPO_PUBLIC_GOOGLE_ANDROID_ID ?? g.androidClientId ?? '',
    webClientId: env.EXPO_PUBLIC_GOOGLE_WEB_ID ?? g.webClientId ?? '',
  };
}

/** AdMob app IDs (native manifest values; also in app.config.js plugin). */
export function admobAppIds(): { android: string; ios: string } {
  return {
    android: env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID ?? 'ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy',
    ios: env.EXPO_PUBLIC_ADMOB_IOS_APP_ID ?? 'ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy',
  };
}

/** AdMob ad-unit IDs for production (dev builds always use Google test units). */
export function admobUnitIds(): { banner: string; interstitial: string } {
  return {
    banner: env.EXPO_PUBLIC_ADMOB_BANNER ?? 'ca-app-pub-xxxxxxxxxxxxxxxx/yyyyyyyyyy',
    interstitial:
      env.EXPO_PUBLIC_ADMOB_INTERSTITIAL ?? 'ca-app-pub-xxxxxxxxxxxxxxxx/zzzzzzzzzz',
  };
}
