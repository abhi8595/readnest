/**
 * Production preflight: fail `eas build --profile production` when placeholder
 * IDs/keys would ship (AdMob reject / dead purchases / broken Drive + EAS submit).
 * Run: `node scripts/check-prod-env.js` or `npm run preflight`.
 * Dev / preview builds intentionally skip this — everything degrades gracefully.
 */
const PLACEHOLDER = /x{4,}|y{4,}|z{4,}|0{8,}/i;

const checks = [
  ['EXPO_PUBLIC_EAS_PROJECT_ID', process.env.EXPO_PUBLIC_EAS_PROJECT_ID, 'eas init → .env'],
  ['EXPO_PUBLIC_ADMOB_ANDROID_APP_ID', process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID, 'AdMob console → app ID'],
  ['EXPO_PUBLIC_ADMOB_IOS_APP_ID', process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID, 'AdMob console → app ID'],
  ['EXPO_PUBLIC_ADMOB_BANNER', process.env.EXPO_PUBLIC_ADMOB_BANNER, 'AdMob console → banner unit'],
  ['EXPO_PUBLIC_ADMOB_INTERSTITIAL', process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL, 'AdMob console → interstitial unit'],
  ['EXPO_PUBLIC_RC_ANDROID', process.env.EXPO_PUBLIC_RC_ANDROID, 'RevenueCat → Android public key'],
  ['EXPO_PUBLIC_RC_IOS', process.env.EXPO_PUBLIC_RC_IOS, 'RevenueCat → iOS public key'],
];

let failed = false;
for (const [name, value, where] of checks) {
  if (!value || PLACEHOLDER.test(value)) {
    console.error(`[preflight] ${name} is missing or a placeholder (get it from: ${where}).`);
    failed = true;
  }
}

// Google OAuth is optional (Drive sync only) — warn, don't fail.
for (const name of ['EXPO_PUBLIC_GOOGLE_ANDROID_ID', 'EXPO_PUBLIC_GOOGLE_IOS_ID', 'EXPO_PUBLIC_GOOGLE_WEB_ID']) {
  if (!process.env[name]) console.warn(`[preflight] warn: ${name} unset — Drive sync will show setup guidance.`);
}

if (failed) {
  console.error('[preflight] FAIL: fill real values in .env (see .env.example) before a production build.');
  process.exit(1);
}
console.log('[preflight] OK: production IDs present.');
