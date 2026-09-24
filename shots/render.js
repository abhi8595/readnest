/**
 * ReadNest screenshot harness — renders REAL app screens (real components,
 * stores, parsers, tokens) through react-native-web in jsdom, then captures
 * 412px mobile-viewport screenshots with headless Chromium.
 *
 * Usage:  node shots/render.js [shotName...]
 */
const path = require('path');
const fs = require('fs');
const H = require('./harness');

const {
  ROOT, SHOTS_MODS, React, TabsLayout, S, routerStub,
  useSettingsStore, useReaderStore,
  wrap, settle, renderEl, unmount, typeIntoPlaceholder, loadFixtures,
} = H;

/* ── fonts (real Inter + Crimson Pro, base64) ───────────────── */
let fontsCss = null;
function buildFontsCss() {
  if (fontsCss) return fontsCss;
  const dir = '/tmp/shots/fonts';
  const faces = [];
  for (const f of fs.readdirSync(dir)) {
    const m = /^(Inter|CrimsonPro)-(\d+)(-i)?\.woff2$/.exec(f);
    if (!m) continue;
    const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
    faces.push(
      `@font-face{font-family:'${m[1]}';font-weight:${m[2]};font-style:${m[3] ? 'italic' : 'normal'};` +
      `src:url(data:font/woff2;base64,${b64}) format('woff2');}`,
    );
  }
  fontsCss = faces.join('\n');
  return fontsCss;
}

/* ── serialize ──────────────────────────────────────────────── */
function serialize() {
  const W = parseInt(process.env.SHOT_W || '412', 10);
  // RNW writes rules via CSSOM insertRule (style tag text stays empty),
  // so serialize through the CSSOM instead of outerHTML.
  const chunks = [];
  for (const sheet of document.styleSheets) {
    try {
      const rules = [];
      for (const r of sheet.cssRules) rules.push(r.cssText);
      if (rules.length) chunks.push(`<style>${rules.join('\n')}</style>`);
    } catch { /* ignore unreadable sheets */ }
  }
  const styles = chunks.join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<style>${buildFontsCss()}</style>${styles}` +
    `<style>html,body{margin:0;padding:0;}body{width:100vw;font-family:Inter,system-ui,sans-serif;}` +
    `#shot-root{width:100vw;height:915px;display:flex;flex-direction:column;overflow:hidden;}` +
    `div{flex-shrink:0 !important;}</style>` +
    `</head><body><div id="shot-root">${H.container.innerHTML}</div></body></html>`;
}

/* ── shots ──────────────────────────────────────────────────── */
async function main() {
  const FX = await loadFixtures();
  console.log('fixtures ready:', FX.books.length, 'books');

  const outDir = path.join(ROOT, 'shots', 'preview');
  fs.mkdirSync(outDir, { recursive: true });

  const only = new Set(process.argv.slice(2));
  const shots = [
    { name: '01-onboarding', run: async () => { await renderEl(wrap(React.createElement(S.onboarding))); } },
    { name: '02-library', run: async () => {
      routerStub.__setScreen(S.index); routerStub.__setActiveTab('index');
      routerStub.__setParams({});
      await renderEl(wrap(React.createElement(TabsLayout)));
    } },
    { name: '03-library-dark', run: async () => {
      routerStub.__setScreen(S.index); routerStub.__setActiveTab('index');
      await renderEl(wrap(React.createElement(TabsLayout)));
      useSettingsStore.getState().set({ appTheme: 'dark' });
      await settle(8);
    } },
    { name: '04-folders', run: async () => {
      routerStub.__setScreen(S.folders); routerStub.__setActiveTab('folders');
      await renderEl(wrap(React.createElement(TabsLayout)));
    } },
    { name: '05-search', run: async () => {
      routerStub.__setScreen(S.search); routerStub.__setActiveTab('search');
      await renderEl(wrap(React.createElement(TabsLayout)));
      await typeIntoPlaceholder('Title, author, series, format…', 'sherlock');
    } },
    { name: '06-notes', run: async () => {
      routerStub.__setScreen(S.notes); routerStub.__setActiveTab('notes');
      await renderEl(wrap(React.createElement(TabsLayout)));
    } },
    { name: '07-settings', run: async () => {
      routerStub.__setScreen(S.settings); routerStub.__setActiveTab('settings');
      await renderEl(wrap(React.createElement(TabsLayout)));
    } },
    { name: '08-book', run: async () => {
      routerStub.__setParams({ id: 'b-pride' });
      await renderEl(wrap(React.createElement(S.book)));
    } },
    { name: '09-collection', run: async () => {
      routerStub.__setParams({ id: 'c2' });
      await renderEl(wrap(React.createElement(S.collection)));
    } },
    { name: '10-dictionary', run: async () => {
      routerStub.__setParams({});
      await renderEl(wrap(React.createElement(S.dictionary)));
      await typeIntoPlaceholder('Look up a word…', 'serendipity');
    } },
    { name: '11-paywall', run: async () => {
      routerStub.__setParams({});
      await renderEl(wrap(React.createElement(S.paywall)));
    } },
    { name: '12-reader', run: async () => {
      routerStub.__setParams({ id: 'b-pride' });
      await renderEl(wrap(React.createElement(S.reader)));
    } },
    { name: '13-reader-chrome', run: async () => {
      useReaderStore.getState().setChrome(true);
      await settle(8);
    } },
  ];

  const { chromium } = require(path.join(SHOTS_MODS, 'playwright'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: parseInt(process.env.SHOT_W || '412', 10), height: 915 }, deviceScaleFactor: 2 });

  for (const shot of shots) {
    if (only.size && ![...only].some((o) => shot.name.includes(o))) continue;
    try {
      if (shot.name !== '13-reader-chrome') {
        await unmount();
      }
      await shot.run();
      const html = serialize();
      const htmlPath = path.join(outDir, `${shot.name}.html`);
      fs.writeFileSync(htmlPath, html);
      await page.goto(`file://${htmlPath}`);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, `${shot.name}.png`) });
      console.log('OK  ', shot.name);
    } catch (e) {
      console.log('FAIL', shot.name, '-', (e && e.message) || e);
      if (process.env.SHOT_DEBUG) console.log((e && e.stack) || '');
    }
  }
  await unmount();
  await browser.close();
}

process.on('unhandledRejection', (e) => console.log('UNHANDLED:', (e && e.message) || e));
main().then(() => process.exit(0)).catch((e) => { console.log('FATAL:', e); process.exit(1); });
