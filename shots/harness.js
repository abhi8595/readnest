/**
 * ReadNest app harness — boots the REAL app (real components, stores,
 * parsers, tokens) through react-native-web in jsdom. Shared by the
 * screenshot renderer (render.js) and the functional suite (functional.js).
 */
process.env.NODE_ENV = 'test';

const path = require('path');
const SHOTS_MODS = '/tmp/shots/node_modules';
const ROOT = '/home/user/readnest';

/* ── 1. jsdom globals (before anything touches window) ───────── */
const { JSDOM } = require(path.join(SHOTS_MODS, 'jsdom'));
const dom = new JSDOM(
  '<!DOCTYPE html><html><head></head><body><div id="shot-root"></div></body></html>',
  { pretendToBeVisual: true, url: 'http://localhost/' },
);
const { window } = dom;
const SHOT_W = parseInt(process.env.SHOT_W || '412', 10);
Object.defineProperty(window, 'innerWidth', { value: SHOT_W, configurable: true });
Object.defineProperty(window, 'innerHeight', { value: 915, configurable: true });
Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
// RNW Dimensions reads visualViewport (else clientWidth, which is 0 in jsdom).
window.visualViewport = {
  width: SHOT_W, height: 915, scale: 1, offsetLeft: 0, offsetTop: 0,
  addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
};
window.matchMedia = (q) => ({
  matches: false, media: q,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {},
});
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
if (!window.requestAnimationFrame) window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
if (!window.cancelAnimationFrame) window.cancelAnimationFrame = (id) => clearTimeout(id);

for (const k of ['window', 'document', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame',
  'matchMedia', 'ResizeObserver', 'getComputedStyle', 'HTMLElement', 'SVGElement', 'Element',
  'Node', 'Event', 'KeyboardEvent', 'CustomEvent', 'MutationObserver', 'DOMParser', 'XMLSerializer',
  'DocumentFragment', 'Range', 'ShadowRoot', 'CSS', 'CSSStyleSheet', 'IntersectionObserver',
  'requestIdleCallback', 'cancelIdleCallback', 'location', 'history']) {
  if (window[k] !== undefined && global[k] === undefined) global[k] = window[k];
}
if (typeof global.ShadowRoot === 'undefined') global.ShadowRoot = class {};
if (typeof global.IntersectionObserver === 'undefined') {
  global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
}
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
global.__DEV__ = true;

/* ── 2. module hooks + app code ─────────────────────────────── */
const { loadTs, routerStub, reposStub } = require('./hooks');
const React = require(path.join(ROOT, 'node_modules', 'react'));
const ReactDOMClient = require(path.join(SHOTS_MODS, 'react-dom', 'client'));
const { SafeAreaProvider } = require('react-native-safe-area-context');
const { ThemeProvider } = loadTs(path.join(ROOT, 'src', 'theme', 'ThemeProvider.tsx'));
const { useSettingsStore } = loadTs(path.join(ROOT, 'src', 'stores', 'useSettingsStore.ts'));
const { useLibraryStore } = loadTs(path.join(ROOT, 'src', 'stores', 'useLibraryStore.ts'));
const { useReaderStore } = loadTs(path.join(ROOT, 'src', 'stores', 'useReaderStore.ts'));
const { useTTSStore } = loadTs(path.join(ROOT, 'src', 'stores', 'useTTSStore.ts'));
const { usePremiumStore } = loadTs(path.join(ROOT, 'src', 'stores', 'usePremiumStore.ts'));

const TabsLayout = loadTs(path.join(ROOT, 'app', '(tabs)', '_layout.tsx')).default;
const S = {
  onboarding: loadTs(path.join(ROOT, 'app', 'onboarding.tsx')).default,
  index: loadTs(path.join(ROOT, 'app', '(tabs)', 'index.tsx')).default,
  folders: loadTs(path.join(ROOT, 'app', '(tabs)', 'folders.tsx')).default,
  search: loadTs(path.join(ROOT, 'app', '(tabs)', 'search.tsx')).default,
  notes: loadTs(path.join(ROOT, 'app', '(tabs)', 'notes.tsx')).default,
  settings: loadTs(path.join(ROOT, 'app', '(tabs)', 'settings.tsx')).default,
  book: loadTs(path.join(ROOT, 'app', 'book', '[id].tsx')).default,
  collection: loadTs(path.join(ROOT, 'app', 'collection', '[id].tsx')).default,
  dictionary: loadTs(path.join(ROOT, 'app', 'dictionary.tsx')).default,
  paywall: loadTs(path.join(ROOT, 'app', 'paywall.tsx')).default,
  reader: loadTs(path.join(ROOT, 'app', 'reader', '[id].tsx')).default,
};

/* ── 3. render + settle + interact ──────────────────────────── */
const container = document.getElementById('shot-root');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wrap(node) {
  return React.createElement(
    SafeAreaProvider,
    { initialMetrics: { insets: { top: 28, bottom: 24, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 412, height: 915 } } },
    React.createElement(ThemeProvider, null, node),
  );
}

function resetStores() {
  useSettingsStore.setState({
    onboarded: true, appTheme: 'light', sortKey: 'last_read', viewMode: 'grid',
    libraryTab: 'all', defaultTheme: 'day', defaultFont: 'crimson', defaultFontSize: 18,
    defaultLineSpacing: 1.6, defaultMargin: 'M', hyphenation: true, brightnessOverride: null,
    pageMode: 'paginated', keepScreenOn: true, showAdBanner: true, lastScanAt: null,
  });
  useLibraryStore.setState({
    books: [], collections: [], collectionBooks: {}, loading: false,
    scanning: false, scanProgress: { done: 0, total: 0, current: null }, lastError: null,
  });
  useReaderStore.setState({
    book: null, progress: 0, location: null, toc: [], chapterLabel: null,
    page: 1, pageCount: null, chromeVisible: false, theme: 'day', font: 'crimson',
    customFontUri: null, fontSize: 18, fontWeight: 400, lineSpacing: 1.6,
    margin: 'M', hyphenation: true, pageMode: 'paginated', orientation: 'system',
  });
  try { useTTSStore.getState().reset(); } catch { /* noop */ }
  usePremiumStore.setState({ isPremium: false, plan: 'free', syncedAt: null, lastPaywallSource: null });
}

function resetRouter() {
  routerStub.__calls.length = 0;
  routerStub.__setParams({});
}

async function settle(iters = 30) {
  for (let i = 0; i < iters; i++) {
    // eslint-disable-next-line no-await-in-loop
    await React.act(async () => { await sleep(60); });
  }
}

let root = null;
async function renderEl(el, iters = 30) {
  resetStores();
  container.innerHTML = '';
  root = ReactDOMClient.createRoot(container);
  await React.act(async () => { root.render(el); });
  await settle(iters);
}

async function unmount() {
  if (root) {
    const r = root;
    root = null;
    await React.act(async () => { r.unmount(); });
  }
}

async function typeIntoPlaceholder(placeholder, text) {
  const inputs = [...container.querySelectorAll('input,textarea')];
  const input = inputs.find((i) => i.getAttribute('placeholder') === placeholder) || inputs[0];
  if (!input) return false;
  await React.act(async () => {
    const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, text);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await React.act(async () => {
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    input.dispatchEvent(new window.KeyboardEvent('keypress', { key: 'Enter', charCode: 13, bubbles: true }));
  });
  await settle(12);
  return true;
}

let FX = null;
async function loadFixtures() {
  if (FX) { reposStub.__setFixtures(FX); return FX; }
  const { buildFixtures } = require('./fixtures');
  FX = await buildFixtures();
  reposStub.__setFixtures(FX);
  return FX;
}

module.exports = {
  SHOTS_MODS, ROOT, window, container, sleep,
  React, ReactDOMClient, SafeAreaProvider, ThemeProvider,
  useSettingsStore, useLibraryStore, useReaderStore, useTTSStore, usePremiumStore,
  TabsLayout, S, routerStub, reposStub,
  wrap, resetStores, resetRouter, settle, renderEl, unmount,
  typeIntoPlaceholder, loadFixtures,
};
