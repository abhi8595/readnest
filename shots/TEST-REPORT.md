# ReadNest functional test report — 2026-09-16

How it runs: the REAL app code (screens, components, zustand stores, EPUB/MOBI/TXT
parsers, billing/ads/scan libs) executes in jsdom through react-native-web.
Only native-only modules are stubbed (sqlite → fixture-backed repo with stateful
mutations, expo-router → navigation recorder, RevenueCat/DFS/SAF → honest fallbacks).
Tests tap real buttons, type into real inputs, confirm real alerts, then assert on
navigation calls + store state + repo state. Screenshots are headless-Chromium
captures of the same renders at 412×915.

- Functional suite: **57/57 PASS** (`node shots/functional.js`), 0 unhandled rejections
- Screenshots: **13/13 OK** (`node shots/render.js`) in `shots/preview/*.png`

## Bugs found by testing (all fixed)

1. **Onboarding Continue could crash on device** — `scrollToIndex` without
   `getItemLayout` throws an Invariant Violation on native. Fixed in
   `app/onboarding.tsx` (added `getItemLayout` + `onScrollToIndexFailed`).
   ComicViewer already had the guard.
2. **`1 bookmarks` / `1 quotes`** — missing pluralization in `app/book/[id].tsx`.
   Now `1 bookmark · 2 quotes` (pixel-verified in `08-book.png`).
3. **`Format: EPUB (EPUB)`** — redundant label in `app/book/[id].tsx`.
   Now dedupes to `EPUB` when badge == label.

## Coverage (every screen + every feature)

- Onboarding: Skip finishes + persists; Continue safe.
- Library: 6 books, hero, search filter/clear, PRO→paywall, grid⇄list,
  sort sheet (title order verified), authors/series/shelves/dupes tabs,
  author+series drill-down, shelf open/new, card+hero→reader, FAB cancelled-picker
  noop, long-press actions sheet + favorite toggle, tab bar.
- Folders: grouping + counts, row nav, grant→honest Expo-Go alert.
- Search: query→1 result→reader, format chip filter, dictionary entry.
- Notes: 4 cards, search, copy alert, open-book link, edit-note save, delete.
- Settings: stats (streak/durations/finished/quotes), theme/dark, reader-theme
  default, page mode, keep-screen switch, Drive gating→paywall, About/Privacy
  alerts, reset→reload intact.
- Dictionary: history chips, offline entry + badge, unknown-word fallback,
  Wiktionary link, close.
- Paywall: live prices, plan switch, stub purchase fails closed (no grant),
  restore→"Nothing to restore", close.
- Collections: detail + remove, delete shelf, new-shelf create→replace.
- Book: metadata table, counts, continue/back, rename, favorite, shelf add
  (dedupe verified), new-shelf-from-book, share noop, delete→back + store→5.
- Reader/reflow: real EPUB parse (3 chapters + TOC), chrome toggle, back
  persists position, contents jump, theme switch, display sheet (size, font,
  margins, hyphenate, orientation, pages/scroll, brightness, premium-font
  gating), bookmarks add/list, in-book search + jump, TTS play/pause/resume/
  rate/sleep/stop with first-sentence assertion, background-TTS paywall gate,
  thumb strip locked→paywall / unlocked jump.
- Reader/other: PDF dev-build fallback + external open, missing-file error
  states (txt/cbz), unsupported-format external flow.
- Libs: formats, sentence splitter, dictionary, billing, ads caps, stats,
  real-EPUB parse, scan degradation, full import pipeline (metadata + hash +
  unsupported guard + cancelled picker).

## Known shot-only artifacts (NOT app bugs)

- RNW wraps words mid-word in very narrow covers and very rarely drops a
  rendered space glyph; native Text does neither.
- Sheet/modal content portals to `document.body`, so open sheets don't appear
  in screenshots (only in functional assertions).
- WebView JS bridge (tap-to-toggle chrome, text selection, page-position
  events) can't fire in jsdom — covered via store-level assertions instead.

## Still needs a real device / store build (native-only)

Background TTS module, SAF folder scan, real RevenueCat purchases, native PDF
render, AdMob interstitials, Google Drive OAuth sync.

## Addendum — 2026-09-16: polish + release readiness
- UI polish: ContinueReading shadow, Cover spine shading, elevated primary buttons; icon set regenerated (1024 master, adaptive, splash, favicon).
- Env-based config: `app.config.js` + `src/lib/config.ts` + `.env.example`; `eas.json` submit/secret guidance; `privacy-policy.md`.
- Fixed pre-existing crash: `plugins/withBackgroundTts.js` called nonexistent `withPermissions` (from `@expo/config-plugins`); permissions live in app config, plugin now only adds the TTS service.
- Verification: 57/57 functional, 13/13 screenshots, tsc clean, 25/25 unit, ESLint zero problems, `expo config --json` resolves with env overrides confirmed.
- Store assets in `store/`: feature graphic (1024x500), 4 screenshots, `listing.md`. Release runbook: `RELEASE.md`.
- Still user-side: real keys in `.env`, `eas init`, Play service account, on-device native checks (see RELEASE.md).
