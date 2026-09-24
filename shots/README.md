# ReadNest screenshot harness

Renders the **real app screens** (real components, stores, parsers, theme
tokens) through `react-native-web` in jsdom, then captures 412x915
mobile-viewport screenshots with headless Chromium.

- `render.js` — entry point: `node shots/render.js [filter...]`
- `hooks.js` — module mapping (`react-native` -> `react-native-web`,
  `.ts/.tsx` transpiled on the fly, native/expo modules stubbed)
- `stubs/` — expo-router (renders the real tab bar from the real
  `(tabs)/_layout.tsx`), expo modules, WebView (inlines the real reader
  HTML), RevenueCat demo offerings, fixture-backed repositories
- `fixtures.js` — demo library + a real generated EPUB parsed by the
  real `parseEpub`
- `out/` — generated `.png` screenshots (+ `.html` sources)

## What is real vs stubbed

Real: every screen component, zustand stores, theme tokens, EPUB/TXT/MOBI
parsers, `buildReaderHtml`, lucide icons, tab bar (options + icons + colors
from the real layout), RevenueCat/billing flow shape.
Stubbed: native I/O (sqlite -> fixtures, file access -> node fs),
auth/Drive/billing backends, ads (render null, as in Expo Go), device
APIs (brightness, TTS, haptics).

## Re-run prerequisites

```bash
npm install                         # project deps
mkdir -p /tmp/shots && cd /tmp/shots
npm init -y
npm i react-native-web react-dom jsdom playwright
npx playwright install --only-shell chromium
# fonts for faithful typography:
mkdir -p /tmp/shots/fonts && cd /tmp/shots/fonts
# ...download Inter + Crimson Pro woff2 (see render.js buildFontsCss naming)
cd /home/user/readnest && node shots/render.js
```

Set `SHOT_SVG=stub` to render icons through a DOM svg shim instead of
the real `react-native-svg`. Set `SHOT_DEBUG=1` for full error stacks.
