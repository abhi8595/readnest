# ReadNest — Reader Override (overrides MASTER.md + app.md for Reader)

Full-screen, gesture-driven, themeable reading surface. Content-first:
chrome auto-hides; every control reachable within 2 taps from hidden state.

## Layout

- **Hidden state (default while reading):** zero chrome, status bar translucent,
  content only + optional slim progress hairline (2dp, `primary`, 60% opacity).
- **Revealed (single tap center):** top bar (back · title/author · search-in-book ·
  overflow) + bottom bar (TOC · theme · TTS · bookmarks · settings) + scrubber.
- **Long-press word:** selection lens → Copy · Highlight (4 free + 8 premium colors) ·
  Note · Dictionary · Share. Never rely on gesture-only: all actions mirrored in menus.
- **Tablets:** centered column max 680dp; thumbnails strip (Premium) docks right
  in landscape, bottom in portrait.

## Modes

- **EPUB/TXT/FB2/DOCX/ODT/MOBI-text:** reflow paginated + scroll modes.
- **PDF:** page mode (pinch-zoom, double-tap zoom) + continuous scroll; night
  invert shader for Night/Console themes.
- **CBZ:** image sequence, LTR/RTL + webtoon scroll; **CBR:** same via native
  module, graceful fallback card when unavailable.

## Reading settings (per-book override + global default)

Theme (5) · font (5 + Premium custom upload) · size 12–32 · boldness 3 steps ·
line-height 1.2–2.0 · margins S/M/L/XL · hyphenation on/off · brightness override ·
orientation lock · page/scroll · volume-keys-turn (Android) · tap-zones (3 presets).

## TTS

- Free: foreground read-aloud (expo-speech), sentence highlighting, 0.5–2.0×.
- Premium: background with screen locked (foreground service + media notification),
  sleep timer, voice picker persisted per book.

## Performance (quick-ref §3)

- Virtualize book lists (50+), chapter-lazy EPUB rendering, PDF page window ±2,
  comic image cache ±3, `transform/opacity`-only animations, skeleton shimmer for
  >1s loads (scan, open, convert), never blocking spinners on cold open.

## Accessibility

- Dynamic Type honored in chrome (not forced into book text), TalkBack order =
  visual, selection actions announced, reduced-motion disables page-curl/stagger,
  minimum brightness warning ≥ accessible floor, focus trap in sheets.
