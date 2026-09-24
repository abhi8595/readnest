# ReadNest audit report — 2026-09-16

Full verification pass over the COMPLETE build: every claimed feature was
checked against its implementation, and every gap found was fixed in this
pass. Test afterward: `npm test` (25 green), `npx tsc --noEmit`.

Severity key: **P0** ship-blocker (crash / build break / dead purchase),
**P1** broken or fake feature, **P2** polish / correctness hardening.

## P0 — fixed

1. **Billing could never succeed** (`app/paywall.tsx`, `src/lib/billing.ts`)
   The paywall passed a hand-built `{identifier}` to RevenueCat's
   `purchasePackage()`, which requires a real native package object — every
   purchase threw. Fixed: `getOfferings()` resolves the current offering,
   the paywall passes the real `$rc_lifetime` / `$rc_annual` package, shows
   live store prices, and explains honestly when a product is unconfigured.
2. **Dependency pins mixed two SDK eras** (`package.json`)
   `expo ~56` was paired with SDK-53-era natives (`react-native 0.79`,
   reanimated 3, screens 4, safe-area 4, `expo-av`, old expo-* majors).
   Re-pinned everything to the SDK 56 manifest (RN 0.85.3, React 19.2.3,
   reanimated 4.3.1, `expo-* ~56.0.x`), added the missing `expo-keep-awake`
   and explicit `react-native-gesture-handler`, added the local
   `readnest-tts` module, removed 7 unused deps (`expo-av`,
   `@expo/vector-icons`, async-storage, device, task-manager,
   navigation-bar, localization). `expo-av` no longer ships in SDK 56.
3. **Palette type lie crashed typecheck** (`src/theme/tokens.ts`)
   `lightPalette` / `AppPalette` lacked `gold`, `goldDeep`, `onGold` while
   `darkPalette` and several components used them — `tsc --noEmit` failed.
   Fixed: the three tokens are now declared on both palettes.
4. **`ComicViewer` referenced an unimported `Pressable`** — runtime crash on
   opening any CBZ. Fixed (import added, plus a `scrollTo` handle for the
   Premium strip).
5. **Display sheet referenced missing store hooks** (`ReaderSheets.tsx`) —
   brightness/orientation rows used `useSettingsStore` without importing it
   (ReferenceError on open). Fixed: import + subscriptions + handlers.
6. **Config-plugin entries that break prebuild** (`app.json`)
   `react-native-pdf` ships no Expo config plugin (verified: no
   `app.plugin.js` upstream) yet was listed with options — removed
   (autolinking covers the native view). `expo-secure-store` was verified
   to ship a plugin, so it stays. Also removed the unused `READ_MEDIA_AUDIO`
   and `SCHEDULE_EXACT_ALARM` permissions and the misleading speech
   *recognition* purpose string (the app only does speech *synthesis*).

## P1 — fixed

7. **Background TTS was manifest fiction** — the plugin registered an
   `ReadNestTtsService` class that existed nowhere, and the JS support check
   hard-returned `true`. Now real: local Expo module `modules/readnest-tts`
   (Kotlin foreground service + `TextToSpeech` + playback notification with
   back/play-pause/next/stop; Swift `AVSpeechSynthesizer` + `.playback`
   session + lock-screen commands), honest capability detection, Premium
   gating, sleep-timer support, and reader wiring (bar controls route to the
   owning player; background narration survives leaving the reader).
8. **Drive sync was an alert box** (`settings.tsx`) — now a real Google
   sign-in (`expo-auth-session`, `drive.appdata` scope only), SecureStore
   token storage, pull-merge-push sync, disconnect, and an honest
   "client IDs missing" path (`app.json` `extra.googleAuth` + README steps).
9. **Settings "Default reader theme" opened the paywall.** Now an inline
   5-theme swatch picker bound to `defaultTheme`.
10. **Scanned books pointed at cache files** (`src/lib/scan.ts`) — the OS
    could evict them and break library entries. Scan now copies each match
    into app storage (`copyIntoLibrary`) and keeps the SAF URI for identity.
11. **Paginated WebView couldn't turn pages** — no swipe, no tap zones
    (`readerHtml.ts` / `ReaderWebView.tsx`). Now: horizontal swipe paging,
    edge tap zones, center-tap chrome toggle, link-tap guard, `nextPage` /
    `prevPage` / `pushTheme` handles.
12. **Reader fonts never reached the WebView** — `expo-font` families are
    invisible to WebViews, so the "System font" fallback always won. Now:
    `src/lib/readerFonts.ts` builds `@font-face` data URIs from the bundled
    OFL families (+ custom upload) and injects them into the reader HTML.
13. **Custom-font row did nothing for Premium users** — tapping it only
    re-set a family id. Now opens a real `.ttf/.otf` picker that installs
    the font to app storage, registers it, and applies it.
14. **Brightness override never restored** the system value on exit, and
    orientation / keep-awake settings were unwired. The reader now captures
    and restores brightness, honors the orientation lock, and applies
    keep-awake per settings.
15. **PDF view ignored `initialPage`-style jumps and swallowed taps** —
    now takes `initialPage` (strip jumps remount at the target page) and has
    edge tap strips for chrome toggling; comics toggle chrome on tap.
16. **Premium page strip didn't exist** — now `ThumbnailsStrip` (chapter
    cards for reflow, windowed page cells for PDF/comics) rendered above the
    reader bar, locked state for free users.
17. **TTS ignored book language** and the volume-keys toggle + `pdfInvert`
    theme flag were dead claims. Language is passed to the engines; the two
    dead settings/flags were removed (store, UI, tokens).

## P2 — fixed

18. Reader typography upgraded: chapter kickers, drop caps, justified text
    with hyphenation, `color-mix` with rgba fallbacks for older WebViews.
19. Paywall shows live prices with sane placeholders while offerings load;
    restore path hardened.
20. README rewritten: no emojis, stale asset pipeline + Drive + background
    TTS docs corrected, `npm test` documented.
21. Pro-rule sweep: raw hex removed from components (Button danger text,
    highlight default, PDF gutter now use palette tokens). The comic canvas
    keeps intentional true-black (`#000`) for artwork fidelity.
22. Repo-wide emoji scan: zero in `app/`, `src/`, `test/`, and docs.

## Verification

- `npm test` → **25/25 pass** (`test/parsers.test.js`: EPUB/TXT/MD/FB2/
  DOCX/ODT/CBZ/CBR/MOBI incl. DRM + garbage, formats registry, TTS
  splitting, content-hash dedupe; `test/reader-html.test.js`: bridge,
  paging CSS, escaping, theme vars, font injection). Fixtures are generated
  in-test via jszip — no binaries, no new dependencies.
- `tsc` syntax sweep → all 54 TS/TSX files parse clean.
- Native code (Kotlin/Swift) is compile-covered by `npx expo prebuild` /
  EAS builds, not by `npm test` — run a dev-client build before release.

## Pre-release checklist (owner actions)

- `npm install`, `npx expo prebuild`, run the dev-client on Android + iOS.
- RevenueCat: real API keys (`src/lib/billing.ts`), `$rc_lifetime` +
  `$rc_annual` in the current offering.
- AdMob: real app/unit IDs (`src/lib/ads.ts`, `app.json` plugin config).
- Google OAuth client IDs → `app.json` `extra.googleAuth`, then rebuild.
- EAS project ID in `app.json`; store assets in `store-listing.md`.
