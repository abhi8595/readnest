# ReadNest release runbook (Android-first)

## 0. One-time setup

```bash
npm install
eas login
eas init            # fills EXPO_PUBLIC_EAS_PROJECT_ID (put it in .env)
cp .env.example .env   # then fill in RevenueCat, AdMob, Google OAuth values
```

Keys needed (see `.env.example` for where each comes from):
- `EXPO_PUBLIC_RC_ANDROID` (+ `EXPO_PUBLIC_RC_IOS` for iOS)
- `EXPO_PUBLIC_ADMOB_*` (app IDs + banner/interstitial units)
- `EXPO_PUBLIC_GOOGLE_*` (Drive sync; Android ID must match the
  `com.abhirahtech.readnest` package + release SHA-1)
- `secrets/play-service-account.json` (Play Console → Users → service
  account with Releases rights) for `eas submit`

RevenueCat dashboard: create entitlement `premium`, offering `current`
with packages `$rc_lifetime` and `$rc_annual` mapped to Play products.

## 1. Preflight (must all pass)

```bash
npm run typecheck
npx eslint . --ext .ts,.tsx
npm test                                    # 25 unit
NODE_PATH=$PWD/node_modules SHOT_SVG=stub node shots/functional.js   # 57 functional
NODE_PATH=$PWD/node_modules SHOT_SVG=stub node shots/render.js       # 13 screenshots
npx expo config --json > /dev/null         # config resolves
```

## 2. Internal testing build

```bash
eas build -p android --profile preview
eas submit -p android --profile production   # uploads to internal track (draft)
```

On-device checklist (native-only, cannot be sandbox-tested):
- [ ] EPUB/PDF/CBZ open from library AND from "Open with ReadNest"
- [ ] Folder grant + SAF scan finds files
- [ ] Foreground TTS speaks; sleep timer stops it
- [ ] Background TTS plays with screen locked (Premium)
- [ ] Test purchase grants Premium; restore works; paywall copy correct
- [ ] Ads show on free tier (test units in dev, real units in preview)
- [ ] Drive sync backs up and restores on a second device
- [ ] Rotation lock, brightness override, keep-awake behave
- [ ] Cold start < 2s on a mid-range device; no ANRs

## 3. Production

```bash
npm run build:android        # eas build -p android --profile production (AAB, autoIncrement)
eas submit -p android --profile production
```

Play Console: internal track → promote to closed → staged rollout
(10% → 50% → 100%) watching crashes/ANRs, then full release.

Store assets: `store/` (feature graphic, 4 screenshots, `listing.md`).
Privacy policy: `privacy-policy.md` (host the URL in the listing).

## 4. Versioning

- `version` in `app.config.js` is the user-facing name; EAS
  `autoIncrement` bumps `versionCode` on every production build.
- Tag releases: `git tag v1.0.0 && git push --tags`.
