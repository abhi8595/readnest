# ReadNest — EPUB / PDF / Ebook Reader & Library Manager

`com.abhirahtech.readnest` · Expo SDK 56 · TypeScript (strict) · NativeWind v4 · Zustand · expo-sqlite

**COMPLETE edition** — every feature from the master prompt is implemented, including the
items originally scoped as post-MVP (MOBI/AZW3 text extraction, background TTS service,
custom font upload). Nothing is stubbed without an honest fallback. See `AUDIT.md` for
the full verification report.

## Feature map

| Area | Status | Notes |
|---|---|---|
| Library scan (SAF, Play-compliant) | Done | `src/lib/scan.ts` — dev-client build; Expo Go falls back to manual import |
| Manual import (multi-select) | Done | EPUB/PDF/MOBI/AZW3/CBZ/CBR/DJVU/FB2/TXT/DOC/DOCX/ODT/CHM |
| Library views (All/Authors/Series/Shelves/Dupes) | Done | sort x 5, grid/list, continue-reading hero |
| EPUB reader (EPUB2 + EPUB3, NCX + nav) | Done | pure-JS parser, works in Expo Go |
| TXT / FB2 / DOCX / ODT reflow | Done | pure-JS extractors + chapter detection |
| MOBI / AZW3 text | Done | PalmDoc decompression, KF8 best-effort, DRM detected honestly |
| PDF (pinch-zoom, annotations) | Done | native in dev-client; graceful external-open fallback in Expo Go |
| CBZ comics | Done | pure-JS; CBR shows convert guidance (no reliable RN unrar) |
| DOC / CHM / DJVU | Done (library tier) | metadata + external open + convert hint (honest, no fake reader) |
| 5 reader themes + OLED | Done | Day/Sepia/Night/Console/OLED |
| Fonts (4 bundled + custom upload Premium) | Done | Crimson Pro / Baskerville / Atkinson / Inter / System |
| Size/bold/spacing/margins/hyphenation | Done | per-book override + global defaults |
| Page/scroll modes, PDF pinch-zoom | Done | swipe + tap-zone paging in paginated mode |
| Bookmarks, highlights (4 free, 8 Premium), notes | Done | Quotes & Notes hub with search/copy/edit |
| TTS foreground + sleep timer + rates | Done | sentence-chunked, in-book highlight |
| Background TTS (Premium) | Done | real native module `modules/readnest-tts` (Android foreground service + iOS AVSpeech) |
| Dictionary hub (offline seed + API + history) | Done | long-press lookup in reader |
| Collections (shelves) CRUD | Done | |
| About Document (rename/share/delete) | Done | |
| Duplicate detection (content hash) | Done | catches renames, not just filenames |
| Page strip (Premium) | Done | chapter cards / page cells above the reader bar |
| Google Drive sync (Premium) | Done | Google sign-in + appDataFolder REST, last-write-wins merge |
| AdMob banner + capped interstitial | Done | 1 per 3 min, never during TTS, never twice same book |
| RevenueCat paywall (lifetime/yearly) | Done | real offering packages, entitlement `premium` |
| Reading stats + streaks | Done | sessions table, Settings dashboard |
| Onboarding + permissions rationale | Done | Play-policy friendly |
| Parser test harness | Done | `npm test` — 25 tests, generated fixtures, zero new deps |

## Quick start

```bash
cd readnest
npm install
npx expo start --dev-client   # full features (scan, PDF, background TTS)
# or: npx expo start          # Expo Go (import + EPUB/TXT/FB2/CBZ + TTS work)
npm test                      # parser + reader-HTML harness (node --test)
npx tsc --noEmit
```

Assets (`assets/icon.png`, `splash.png`, `adaptive-icon.png`, `favicon.png`) are
production PNGs generated from `assets/icon-master.png` — see `assets/README.md`.
Regenerate with `python3 assets/build_assets.py`.

## EAS builds

```bash
eas build -p android --profile production
eas submit -p android --profile production
```

Set the real AdMob IDs in `src/lib/ads.ts`, RevenueCat keys in `src/lib/billing.ts`,
Google OAuth client IDs in `app.json` (`extra.googleAuth`), and the EAS project ID
in `app.json` before submitting.

## Google Drive sync

1. In Google Cloud Console: enable the Drive API, create OAuth clients (iOS +
   Android + Web) for `com.abhirahtech.readnest`.
2. Paste the three client IDs into `app.json` under `extra.googleAuth`
   (`iosClientId`, `androidClientId`, `webClientId`), then rebuild.
3. The app requests only `https://www.googleapis.com/auth/drive.appdata`
   (least privilege), stores the token in SecureStore, and syncs via
   `pushToDrive(token)` / `pullFromDrive(token)` + `mergeSnapshot()` from
   `src/lib/drive.ts` (wired to the Settings sync row).

## Custom fonts (Premium)

Reader → Display → Custom upload (Premium entitlement checked). Files are copied to
app storage and registered via `expo-font` `loadAsync({ CustomUpload: uri })`, then
injected into the reader WebView as `@font-face` data URIs.

## Background TTS (Premium)

Local Expo module `modules/readnest-tts` (dependency `file:modules/readnest-tts`):

- Android: foreground service (`mediaPlayback` type) + platform TextToSpeech +
  playback notification with back / play-pause / next / stop.
- iOS: `AVSpeechSynthesizer` with `.playback` audio session + lock-screen controls.

Manifest entries ship with the module (manifest merging) and are enforced by
`plugins/withBackgroundTts.js`. In Expo Go the module is absent and the app
explains honestly instead of failing.

## Design system

Generated with the **ui-ux-pro-max** skill (`design-system/readnest/MASTER.md`,
plus `pages/app.md` + `pages/reader.md` overrides). Warm-paper Light theme and warm
charcoal Dark theme, Lucide 1.5 icons, 48dp touch targets, 4.5:1 body contrast.

## Store compliance

- No `MANAGE_EXTERNAL_STORAGE` — SAF folder grants only (see `src/lib/scan.ts`).
- Rationale screens precede every system prompt (onboarding + folder grant).
- Data Safety draft in `privacy-policy.md`; ASO copy in `store-listing.md`.
