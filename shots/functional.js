/**
 * ReadNest functional suite — drives the REAL app (real components, stores,
 * parsers, tokens) through react-native-web in jsdom: taps buttons, types
 * into inputs, confirms alerts, and asserts navigation + store + repo state.
 *
 * Usage:  node shots/functional.js [nameFilter...]
 *
 * NOTE: RNW Modal/Sheet content portals to document.body (outside the
 * #shot-root container), so all DOM queries are document-scoped.
 */
const path = require('path');
const H = require('./harness');

const {
  ROOT, window, sleep, React,
  TabsLayout, S, routerStub, reposStub,
  useSettingsStore, useLibraryStore, useReaderStore, useTTSStore, usePremiumStore,
  wrap, settle, renderEl, unmount, typeIntoPlaceholder, loadFixtures,
} = H;
const doc = window.document;

/* ── deterministic offline dictionary API (no network in tests) ── */
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('dictionaryapi.dev')) return { ok: false, status: 404, json: async () => ({}) };
  return realFetch(url, opts);
};

/* ── Alert interception (record + auto-press destructive) ─── */
const alertCalls = [];
function patchAlert() {
  const RN = require(path.join('/tmp/shots/node_modules', 'react-native-web'));
  const impl = (title, message, buttons) => {
    alertCalls.push({ title, message, buttons: (buttons || []).map((b) => b.text) });
    const d = (buttons || []).find((b) => b.style === 'destructive');
    if (d && d.onPress) d.onPress();
  };
  try {
    RN.Alert.alert = impl;
  } catch {
    Object.defineProperty(RN.Alert, 'alert', { value: impl, configurable: true });
  }
}
const lastAlert = () => alertCalls[alertCalls.length - 1];

/* ── DOM helpers (document-scoped: sheets portal to body) ─── */
const esc = (s) => (window.CSS && window.CSS.escape ? window.CSS.escape(s) : s.replace(/"/g, '\\"'));
const qa = (sel) => [...doc.querySelectorAll(sel)];
const byLabelAll = (label) => qa(`[aria-label="${esc(label)}"]`);
const byLabel = (label) => byLabelAll(label)[0] || null;
const text = () => doc.body.textContent.replace(/\s+/g, ' ').trim();
const cardCount = () => qa('[aria-label*=" by "]').length;

async function tap(target, index = 0) {
  const el = typeof target === 'string' ? byLabelAll(target)[index] : target;
  if (!el) throw new Error(`tap target missing: ${typeof target === 'string' ? target : 'element'}`);
  await React.act(async () => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(50);
  });
  await settle(6);
}

async function typeIntoLabel(label, value) {
  const inputs = qa('input,textarea');
  const input = inputs.find((i) => i.getAttribute('aria-label') === label)
    || inputs.find((i) => i.getAttribute('placeholder') === label);
  if (!input) throw new Error(`input missing: ${label}`);
  await React.act(async () => {
    const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await settle(8);
  return true;
}

async function longPress(label, index = 0) {
  const el = byLabelAll(label)[index];
  if (!el) throw new Error(`longpress target missing: ${label}`);
  await React.act(async () => {
    try {
      el.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
    } catch { /* older jsdom */ }
    el.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    await sleep(700);
  });
  await React.act(async () => {
    el.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
  });
  await settle(6);
}

/* ── render helpers ───────────────────────────────────────── */
async function showTab(screen, tab, iters = 10) {
  routerStub.__setScreen(screen);
  routerStub.__setActiveTab(tab);
  routerStub.__setParams({});
  await renderEl(wrap(React.createElement(TabsLayout)), iters);
  useTTSStore.getState().set({ rate: 1 });
}
async function showScreen(Component, params = {}, iters = 10) {
  routerStub.__setParams(params);
  await renderEl(wrap(React.createElement(Component)), iters);
  useTTSStore.getState().set({ rate: 1 });
}
const navCalls = () => routerStub.__calls;
const lastNav = () => navCalls()[navCalls().length - 1];

/* ── assertions ───────────────────────────────────────────── */
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function assertText(s) {
  assert(text().includes(s), `expected visible text: ${JSON.stringify(s)}`);
}
function assertNav(type, href) {
  const c = navCalls();
  const hit = href === undefined
    ? c.some((x) => x[0] === type)
    : c.some((x) => x[0] === type && x[1] === href);
  assert(hit, `expected nav ${type}${href ? ` ${href}` : ''}; got ${JSON.stringify(c)}`);
}
function assertAlert(title) {
  assert(alertCalls.some((a) => a.title === title),
    `expected alert ${JSON.stringify(title)}; got ${JSON.stringify(alertCalls.map((a) => a.title))}`);
}

/* ── runner ───────────────────────────────────────────────── */
const tests = [];
const t = (name, fn) => tests.push({ name, fn });
const failures = [];
const rejections = [];
process.on('unhandledRejection', (e) => rejections.push((e && e.message) || String(e)));

/* ══ 1. Onboarding ══════════════════════════════════════════ */
t('onboarding renders slides + Skip finishes', async () => {
  await showScreen(S.onboarding);
  assertText('Your whole library,');
  assertText('Skip');
  assert(byLabel('Continue'), 'Continue button missing');
  await tap('Skip onboarding');
  assert(useSettingsStore.getState().onboarded === true, 'onboarded not set');
  assertNav('replace', '/(tabs)');
});

t('onboarding Continue advances without crash', async () => {
  await showScreen(S.onboarding);
  await tap('Continue'); // scrollToIndex is a noop in jsdom; must not crash
  assertText('Your whole library,');
});

/* ══ 2. Library ═════════════════════════════════════════════ */
t('library shows 6 books + continue hero', async () => {
  await showTab(S.index, 'index');
  assertText('6 books');
  assert(cardCount() === 6, `expected 6 cards, got ${cardCount()}`);
  assert(byLabel('Continue reading Pride and Prejudice, 42 percent complete'), 'continue hero missing');
  assert(byLabel('Get Premium'), 'PRO pill missing');
});

t('library search filters + clears', async () => {
  await showTab(S.index, 'index');
  await typeIntoPlaceholder('Search title, author, series…', 'meditations');
  assert(cardCount() === 1, `expected 1 card after filter, got ${cardCount()}`);
  await tap('Clear search');
  assert(cardCount() === 6, `expected 6 cards after clear, got ${cardCount()}`);
});

t('library PRO pill → paywall', async () => {
  await showTab(S.index, 'index');
  await tap('Get Premium');
  assertNav('push', '/paywall');
});

t('library view toggle grid ⇄ list', async () => {
  await showTab(S.index, 'index');
  await tap('Switch to list view');
  assert(useSettingsStore.getState().viewMode === 'list', 'viewMode not list');
  assert(byLabel('Switch to grid view'), 'toggle label did not flip');
  assert(cardCount() === 6, 'list mode lost cards');
});

t('library sort sheet reorders by title', async () => {
  await showTab(S.index, 'index');
  await tap('Sort library');
  assert(byLabel('Sort by Title'), 'sort options missing');
  await tap('Sort by Title');
  assert(useSettingsStore.getState().sortKey === 'title', 'sortKey not title');
  const first = useLibraryStore.getState().books[0].title;
  assert(first === 'Meditations', `title sort wrong, first=${first}`);
  await settle(10);
  assert(!byLabel('Sort by Title'), 'sort sheet did not close');
});

t('library authors tab drills into filtered list', async () => {
  await showTab(S.index, 'index');
  await tap('Authors');
  assert(useSettingsStore.getState().libraryTab === 'authors', 'tab not switched');
  assertText('Jane Austen');
  await tap('Books by Jane Austen');
  assert(useSettingsStore.getState().libraryTab === 'all', 'drill did not return to all');
  assert(cardCount() === 1, 'author drill did not filter to 1');
});

t('library series / shelves / dupes tabs', async () => {
  await showTab(S.index, 'index');
  await tap('Series');
  assertText('Space Adventures');
  await tap('Shelves');
  assertText('Classics');
  await tap('Open shelf Classics');
  assertNav('push', '/collection/c2');
  await tap('New shelf');
  assertNav('push', '/collection/new');
  await tap('Dupes');
  assertText('No duplicates');
});

t('library book card + hero open reader', async () => {
  await showTab(S.index, 'index');
  await tap('Meditations by Marcus Aurelius');
  assertNav('push', '/reader/b-meditations');
  await showTab(S.index, 'index');
  await tap('Continue reading Pride and Prejudice, 42 percent complete');
  assertNav('push', '/reader/b-pride');
});

t('library FAB import (cancelled picker) is a safe noop', async () => {
  await showTab(S.index, 'index');
  alertCalls.length = 0;
  await tap('Add books to library');
  assert(useLibraryStore.getState().books.length === 6, 'books changed on cancelled import');
  assert(alertCalls.length === 0, `unexpected alerts: ${JSON.stringify(alertCalls)}`);
});

t('library long-press actions sheet toggles favorite', async () => {
  await showTab(S.index, 'index');
  await longPress('Meditations by Marcus Aurelius');
  assert(byLabel('Add to favorites'), 'actions sheet did not open on long-press');
  await tap('Add to favorites');
  await settle(6);
  assert(reposStub.__fx().books.find((b) => b.id === 'b-meditations').is_favorite === 1, 'favorite not set');
  // restore fixture state
  await reposStub.toggleFavorite('b-meditations');
  assert(reposStub.__fx().books.find((b) => b.id === 'b-meditations').is_favorite === 0, 'favorite not restored');
});

t('library tab bar switches tabs', async () => {
  await showTab(S.index, 'index');
  await tap('Notes');
  assertNav('tab', 'notes');
  await tap('Settings');
  assertNav('tab', 'settings');
});

/* ══ 3. Folders ═════════════════════════════════════════════ */
t('folders groups + counts + row nav', async () => {
  await showTab(S.folders, 'folders');
  assertText('Classics');
  assert(byLabel('Classics, 2 books'), 'Classics row with count 2 missing');
  await tap('Classics, 2 books');
  assertNav('push', '/(tabs)');
});

t('folders grant degrades honestly without SAF', async () => {
  await showTab(S.folders, 'folders');
  alertCalls.length = 0;
  await tap('Grant folder access');
  assertAlert('Manual import instead');
});

/* ══ 4. Search ══════════════════════════════════════════════ */
t('search finds sherlock + opens reader', async () => {
  await showTab(S.search, 'search');
  assertText('Search across your entire nest');
  await typeIntoPlaceholder('Title, author, series, format…', 'sherlock');
  assertText('1 result');
  assert(cardCount() === 1, 'search did not yield 1 card');
  await tap('The Adventures of Sherlock Holmes by Arthur Conan Doyle');
  assertNav('push', '/reader/b-sherlock');
});

t('search format chip filters + dictionary entry', async () => {
  await showTab(S.search, 'search');
  await tap('TXT');
  assertText('1 result');
  assertText('Meditations');
  await tap('Open dictionary');
  assertNav('push', '/dictionary');
});

/* ══ 5. Notes ═══════════════════════════════════════════════ */
t('notes list + search + copy + open book', async () => {
  await showTab(S.notes, 'notes');
  assert(byLabelAll('Delete quote').length === 4, 'expected 4 quote cards');
  await typeIntoPlaceholder('Search quotes and notes…', 'caroline');
  assert(byLabelAll('Delete quote').length === 1, 'note search did not filter to 1');
  await tap('Clear search');
  alertCalls.length = 0;
  await tap('Copy quote', 0);
  assertAlert('Copied');
  await tap('Open Pride and Prejudice', 0);
  assertNav('push', '/reader/b-pride');
});

t('notes edit saves + restores', async () => {
  await showTab(S.notes, 'notes');
  await tap('Edit note', 0);
  assertText('Edit note');
  await typeIntoLabel('Note text', 'Edited in functional test.');
  await tap('Save note');
  const q = reposStub.__fx().quotes.find((x) => x.id === 'q1');
  assert(q.note === 'Edited in functional test.', `note not saved: ${q.note}`);
  assertText('Edited in functional test.');
  await reposStub.upsertQuote({ id: 'q1', note: 'Caroline Bingley, of all people.' });
});

t('notes delete removes quote', async () => {
  await showTab(S.notes, 'notes');
  alertCalls.length = 0;
  await tap('Delete quote', 2); // q3 (Time Machine) — keeps b-pride counts intact
  assertAlert('Delete quote?');
  await settle(8);
  assert(byLabelAll('Delete quote').length === 3, 'quote not deleted from list');
  assert(reposStub.__fx().quotes.length === 3, 'quote not deleted from repo');
});

/* ══ 6. Settings ═══════════════════════════════════════════ */
t('settings stats + premium + dictionary nav', async () => {
  await showTab(S.settings, 'settings');
  assertText('6-DAY STREAK');
  assertText('30 min');
  assertText('3h 30m');
  assertText('Finished');
  await tap('Get Premium');
  assertNav('push', '/paywall');
  await tap('Dictionary');
  assertNav('push', '/dictionary');
});

t('settings appearance controls mutate store', async () => {
  await showTab(S.settings, 'settings');
  await tap('Dark');
  assert(useSettingsStore.getState().appTheme === 'dark', 'theme not dark');
  await tap('Light');
  assert(useSettingsStore.getState().appTheme === 'light', 'theme not light');
  await tap('Night theme');
  assert(useSettingsStore.getState().defaultTheme === 'night', 'defaultTheme not night');
  await tap('Scroll');
  assert(useSettingsStore.getState().pageMode === 'scroll', 'pageMode not scroll');
  const sw = doc.querySelector('[role="switch"]');
  assert(sw, 'keep-screen switch missing');
  await tap(sw);
  assert(useSettingsStore.getState().keepScreenOn === false, 'switch did not toggle');
});

t('settings drive gating + about + reset', async () => {
  await showTab(S.settings, 'settings');
  await tap('Google Drive sync');
  assertNav('push', '/paywall'); // free tier → paywall
  alertCalls.length = 0;
  await tap('About ReadNest');
  assertAlert('ReadNest 1.0.0');
  await tap('Privacy');
  assertAlert('Privacy');
  await tap('Reset library');
  assertAlert('Reset everything?');
  await settle(8);
  assert(useLibraryStore.getState().books.length === 6, 'reset broke library reload');
});

/* ══ 7. Dictionary ═════════════════════════════════════════ */
t('dictionary history + offline lookup + unknown word', async () => {
  await showScreen(S.dictionary);
  assert(byLabel('Look up ephemeral again'), 'history chips missing');
  await tap('Look up ephemeral again');
  assertText('ephemeral');
  assertText('OFFLINE');
  assertText('Lasting a very short time.');
  await typeIntoPlaceholder('Look up a word…', 'zzqxjk');
  assertText('No definition cached for this word.');
  assert(byLabel('Open zzqxjk on Wiktionary'), 'wiktionary link missing');
  await tap('Close dictionary');
  assertNav('back');
});

/* ══ 8. Paywall ════════════════════════════════════════════ */
t('paywall plans + honest stub purchase + restore', async () => {
  await showScreen(S.paywall);
  assertText('$24.99');
  assertText('$9.99');
  await tap('Yearly subscription');
  assertText('Start Yearly Plan');
  alertCalls.length = 0;
  await tap('Start Yearly Plan');
  assert(usePremiumStore.getState().isPremium === false, 'stub purchase must not grant premium');
  await tap('Restore purchases');
  assertAlert('Nothing to restore');
  await tap('Close paywall');
  assertNav('back');
});

/* ══ 9. Collections ════════════════════════════════════════ */
t('collection detail removes book', async () => {
  await showScreen(S.collection, { id: 'c2' });
  assertText('Classics');
  assertText('3 books');
  await tap('Remove Pride and Prejudice from shelf');
  await settle(8);
  assertText('2 books');
  assert(reposStub.__fx().collectionBooks.c2.length === 2, 'repo still has 3');
});

t('collection delete shelf', async () => {
  await showScreen(S.collection, { id: 'c1' });
  alertCalls.length = 0;
  await tap('Delete shelf');
  assertAlert('Delete shelf?');
  await settle(8);
  assertNav('back');
  assert(reposStub.__fx().collections.length === 1, 'shelf not deleted');
});

t('collection new shelf flow', async () => {
  await showScreen(S.collection, { id: 'new' });
  await typeIntoLabel('Shelf name', 'ZZZ Test Shelf');
  await tap('Create shelf');
  await settle(8);
  const c = navCalls().find((x) => x[0] === 'replace' && String(x[1]).startsWith('/collection/c-'));
  assert(c, `expected replace to new shelf; got ${JSON.stringify(navCalls())}`);
  assert(reposStub.__fx().collections.some((x) => x.name === 'ZZZ Test Shelf'), 'shelf not created');
});

/* ══ 10. Book ══════════════════════════════════════════════ */
t('book detail metadata + continue + back', async () => {
  await showScreen(S.book, { id: 'b-pride' });
  assertText('Pride and Prejudice');
  assertText('Jane Austen');
  assertText('1 bookmark · 2 quotes');
  assertText('shot-pride.epub');
  await tap('Continue reading');
  assertNav('push', '/reader/b-pride');
  await tap('Go back');
  assertNav('back');
});

t('book rename saves + restores', async () => {
  await showScreen(S.book, { id: 'b-pride' });
  await tap('Rename');
  await typeIntoLabel('Book title', 'Pride & Prejudice (renamed)');
  await tap('Save');
  await settle(8);
  assertText('Pride & Prejudice (renamed)');
  await reposStub.renameBook('b-pride', 'Pride and Prejudice', 'Jane Austen');
});

t('book favorite toggles + restores', async () => {
  await showScreen(S.book, { id: 'b-pride' });
  await tap('Unfavorite');
  await settle(8);
  assert(byLabel('Favorite'), 'chip did not flip to Favorite');
  await reposStub.toggleFavorite('b-pride');
});

t('book add-to-shelf dedupes + creates shelf', async () => {
  await showScreen(S.book, { id: 'b-pride' });
  alertCalls.length = 0;
  await tap('Add to shelf');
  await tap('Add to Classics');
  assertAlert('Added');
  // pride was removed from c2 earlier → re-added exactly once, no dupes
  await tap('Add to shelf');
  await tap('Add to Classics');
  const inC2 = reposStub.__fx().collectionBooks.c2.filter((b) => b.id === 'b-pride').length;
  assert(inC2 === 1, `expected exactly 1 copy in shelf, got ${inC2}`);
  await tap('Add to shelf');
  await typeIntoLabel('New shelf name', 'XYZ From Book');
  await tap('Create shelf');
  await settle(8);
  const made = reposStub.__fx().collections.find((x) => x.name === 'XYZ From Book');
  assert(made, 'shelf not created from book screen');
  assert(reposStub.__fx().collectionBooks[made.id].some((b) => b.id === 'b-pride'), 'book not added to new shelf');
});

t('book share is a safe noop', async () => {
  await showScreen(S.book, { id: 'b-pride' });
  await tap('Share file');
  await settle(6);
  assertText('Pride and Prejudice'); // still alive
});

/* ══ 11. Reader (reflow) ═══════════════════════════════════ */
t('reader loads real epub chapters + toc', async () => {
  await showScreen(S.reader, { id: 'b-pride' }, 30);
  assertText('Chapter 1 — The Quiet Evening');
  assertText('universally acknowledged');
  const st = useReaderStore.getState();
  assert(st.book && st.book.id === 'b-pride', 'reader store book missing');
  assert(st.toc.length === 3, `expected 3 toc items, got ${st.toc.length}`);
  assert(st.chromeVisible === false, 'chrome should start hidden');
  assert(!byLabel('Back to library'), 'chrome visible too early');
});

t('reader back persists position', async () => {
  const before = reposStub.__fx().books.find((b) => b.id === 'b-pride').last_read_at;
  await showScreen(S.reader, { id: 'b-pride' }, 30);
  await React.act(async () => { useReaderStore.getState().setChrome(true); });
  await settle(6);
  await tap('Back to library');
  await settle(10);
  assertNav('back');
  const after = reposStub.__fx().books.find((b) => b.id === 'b-pride').last_read_at;
  assert(after > before, 'position persist did not update last_read_at');
});

t('reader chrome toggle flips both ways', async () => {
  await showScreen(S.reader, { id: 'b-pride' }, 30);
  const g = () => useReaderStore.getState();
  await React.act(async () => { g().toggleChrome(); });
  assert(g().chromeVisible === true, 'toggle on failed');
  await React.act(async () => { g().toggleChrome(); });
  assert(g().chromeVisible === false, 'toggle off failed');
});

t('reader contents sheet jumps', async () => {
  await showScreen(S.reader, { id: 'b-pride' }, 30);
  await React.act(async () => { useReaderStore.getState().setChrome(true); });
  await settle(6);
  await tap('Contents');
  assert(byLabel('Chapter 2'), 'toc entries missing'); // NCX nav label (body h1 is longer)
  await tap('Chapter 2');
  await settle(10);
  assert(!byLabel('Chapter 2'), 'contents sheet did not close');
});

t('reader theme sheet switches theme', async () => {
  await showScreen(S.reader, { id: 'b-pride' }, 30);
  await React.act(async () => { useReaderStore.getState().setChrome(true); });
  await settle(6);
  await tap('Theme');
  await tap('Night theme');
  assert(useReaderStore.getState().theme === 'night', 'theme not night');
});

t('reader display sheet controls all work', async () => {
  await showScreen(S.reader, { id: 'b-pride' }, 30);
  await React.act(async () => { useReaderStore.getState().setChrome(true); });
  await settle(6);
  await tap('Display');
  const g = () => useReaderStore.getState();
  await tap('Increase text size');
  assert(g().fontSize === 19, `fontSize ${g().fontSize}`);
  await tap('Decrease text size');
  assert(g().fontSize === 18, `fontSize ${g().fontSize}`);
  await tap('Baskerville (Classic)');
  assert(g().font === 'baskerville', `font ${g().font}`);
  await tap('L');
  assert(g().margin === 'L', `margin ${g().margin}`);
  await tap('Hyphenate');
  assert(g().hyphenation === false, 'hyphenation not toggled');
  await tap('Portrait');
  assert(g().orientation === 'portrait', 'orientation not portrait');
  await tap('Scroll');
  assert(g().pageMode === 'scroll', 'pageMode not scroll');
  await tap('System brightness');
  assert(useSettingsStore.getState().brightnessOverride === 0.7, 'brightness not overridden');
  await tap('Back to system');
  assert(useSettingsStore.getState().brightnessOverride === null, 'brightness not restored');
  await tap('Custom upload, premium');
  assertNav('push', '/paywall');
  assert(usePremiumStore.getState().lastPaywallSource === 'custom-font', 'paywall source not set');
});

t('reader bookmarks add + list', async () => {
  await showScreen(S.reader, { id: 'b-pride' }, 30);
  await React.act(async () => { useReaderStore.getState().setChrome(true); });
  await settle(6);
  const before = reposStub.__fx().bookmarks.length;
  await tap('Add bookmark');
  assertText('Chapter 2 — An Interruption'); // existing mark listed
  await tap('Bookmark this position');
  await settle(8);
  assert(reposStub.__fx().bookmarks.length === before + 1, 'bookmark not added');
});

t('reader in-book search finds + jumps', async () => {
  await showScreen(S.reader, { id: 'b-pride' }, 30);
  await React.act(async () => { useReaderStore.getState().setChrome(true); });
  await settle(6);
  await tap('Search in book', 0); // chrome button (sheet input shares the label)
  await typeIntoLabel('Search in book', 'lamp threw');
  assert(byLabel('Jump to Chapter 1'), 'in-book search results missing');
  await tap('Jump to Chapter 1');
  await settle(10);
  assert(!byLabel('Jump to Chapter 1'), 'search sheet did not close');
});

t('reader TTS full cycle: play/pause/rate/sleep/stop', async () => {
  global.__speechCalls = [];
  await showScreen(S.reader, { id: 'b-pride' }, 30);
  await React.act(async () => { useReaderStore.getState().setChrome(true); });
  await settle(6);
  const g = () => useTTSStore.getState();
  await tap('Listen');
  await settle(8);
  assert(g().status === 'speaking', `status ${g().status}`);
  assert(byLabel('Read aloud controls'), 'TTS bar missing');
  assert(global.__speechCalls.length >= 1, 'speech engine never called');
  assert(String(global.__speechCalls[0].text).includes('universally acknowledged'),
    `first sentence wrong: ${global.__speechCalls[0].text}`);
  await tap('1.5×');
  assert(g().rate === 1.5, 'rate not set');
  await tap('Sleep timer');
  await tap('15 minutes');
  assert(g().sleepMinutes === 15, 'sleep timer not set');
  await tap('Pause');
  assert(g().status === 'paused', 'pause failed');
  await tap('Resume');
  await settle(6);
  assert(g().status === 'speaking', 'resume failed');
  await tap('Stop reading aloud');
  assert(g().status === 'idle', 'stop failed');
  assert(!byLabel('Read aloud controls'), 'TTS bar did not hide');
});

t('reader background TTS gated to premium', async () => {
  await showScreen(S.reader, { id: 'b-pride' }, 30);
  await React.act(async () => { useReaderStore.getState().setChrome(true); });
  await settle(6);
  await tap('Listen');
  await settle(6);
  await tap('Background playback, premium feature');
  assertNav('push', '/paywall');
  assert(usePremiumStore.getState().lastPaywallSource === 'bg-tts', 'bg-tts source not set');
});

t('reader thumb strip locked → paywall; unlocked jumps', async () => {
  await showScreen(S.reader, { id: 'b-pride' }, 30);
  await React.act(async () => { useReaderStore.getState().setChrome(true); });
  await settle(6);
  await tap('Page thumbnails, premium feature');
  assertNav('push', '/paywall');
  await React.act(async () => { usePremiumStore.getState().setPremium(true, 'lifetime'); });
  await settle(6);
  assert(byLabel('Jump to Chapter 1'), 'strip items missing for premium');
  await tap('Jump to Chapter 1');
  await settle(6);
});

/* ══ 12. Reader (other formats) ═════════════════════════════ */
t('reader pdf shows honest dev-build fallback', async () => {
  await showScreen(S.reader, { id: 'b-time' }, 30);
  assertText('PDF needs the dev build');
  await tap('Open externally');
  await settle(6);
  assertText('PDF needs the dev build');
});

t('reader missing files show error state, not crash', async () => {
  await showScreen(S.reader, { id: 'b-meditations' }, 30); // txt, no file on disk
  assertText("Couldn't open this book");
  await tap('Back to library');
  assertNav('back');
  await showScreen(S.reader, { id: 'b-space' }, 30); // cbz, no file on disk
  assertText("Couldn't open this book");
});

t('reader unsupported format offers external open', async () => {
  const tmp = await reposStub.upsertBook({
    title: 'Old Manual', author: 'Vendor', format: 'doc', file_uri: 'file:///tmp/x.doc',
    file_size: 10, folder_path: 'Imported',
  });
  await showScreen(S.reader, { id: tmp.id }, 30);
  assertText('Limited preview for this format');
  await tap('Open with another app');
  await settle(6);
  assertText('Limited preview for this format');
  await reposStub.deleteBook(tmp.id);
});

/* ══ 13. Book delete (mutates; runs late) ═══════════════════ */
t('book delete removes + navigates back', async () => {
  await showScreen(S.book, { id: 'b-pride' });
  alertCalls.length = 0;
  await tap('Delete book');
  assertAlert('Delete book?');
  await settle(10);
  assertNav('back');
  assert(!reposStub.__fx().books.some((b) => b.id === 'b-pride'), 'book still in repo');
  assert(useLibraryStore.getState().books.length === 5, 'store not refreshed to 5');
});

/* ══ 14. Pure library unit tests ═════════════════════════════ */
t('lib formats helpers', async () => {
  const { loadTs } = require('./hooks');
  const F = loadTs(path.join(ROOT, 'src', 'lib', 'formats.ts'));
  assert(F.formatFromFilename('x.EPUB') === 'epub', 'epub detect');
  assert(F.formatFromFilename('c.cbz') === 'cbz', 'cbz detect');
  assert(F.formatFromFilename('x.xyz') === null, 'unknown ext');
  assert(F.formatBytes(0) === '—', `bytes0=${F.formatBytes(0)}`);
  assert(F.formatBytes(2048) === '2.0 KB', `bytes2k=${F.formatBytes(2048)}`);
  assert(F.titleFromFilename('dune-frank-herbert.epub').length > 0, 'title fallback');
  assert(F.formatInfo('pdf').badge === 'PDF', 'badge');
});

t('lib tts sentence splitter', async () => {
  const { loadTs } = require('./hooks');
  const T = loadTs(path.join(ROOT, 'src', 'lib', 'tts.ts'));
  const s = T.splitSentences('Hello world. How are you? Fine!');
  assert(s.length === 3, `split gave ${s.length}`);
  assert(T.splitSentences('').length === 0, 'empty split');
});

t('lib dictionary offline + unknown', async () => {
  const { loadTs } = require('./hooks');
  const D = loadTs(path.join(ROOT, 'src', 'lib', 'dictionary.ts'));
  const e = await D.lookupWord('Serendipity');
  assert(e && e.source === 'offline' && e.senses[0].definitions[0].includes('good'), 'offline entry');
  const u = await D.lookupWord('zzqxjk');
  assert(u && u.source === 'wiktionary' && u.senses.length === 0, 'unknown fallback');
  assert(D.wiktionaryUrl('cat').includes('cat'), 'wiktionary url');
});

t('lib billing honest stub behavior', async () => {
  const { loadTs } = require('./hooks');
  const B = loadTs(path.join(ROOT, 'src', 'lib', 'billing.ts'));
  const o = await B.getOfferings();
  assert(o.lifetime && o.lifetime.price === '$24.99', 'lifetime price');
  assert(o.annual && o.annual.price === '$9.99', 'annual price');
  assert((await B.purchasePackage(o.lifetime)) === false, 'stub purchase must fail closed');
  assert((await B.restorePurchases()) === false, 'stub restore must fail closed');
  assert((await B.checkPremium()) === false, 'stub premium false');
});

t('lib ads frequency caps', async () => {
  const { loadTs } = require('./hooks');
  const A = loadTs(path.join(ROOT, 'src', 'lib', 'ads.ts'));
  assert(A.shouldShowInterstitial('b1', false, false) === false, '__DEV__ must suppress');
  assert(A.shouldShowInterstitial('b1', true, false) === false, 'premium suppresses');
  A.markInterstitialShown('b1');
});

t('lib stats formatters', async () => {
  const { loadTs } = require('./hooks');
  const ST = loadTs(path.join(ROOT, 'src', 'lib', 'stats.ts'));
  assert(ST.formatDuration(0) === '0s', `d0=${ST.formatDuration(0)}`);
  assert(ST.formatDuration(1800) === '30 min', `d1800=${ST.formatDuration(1800)}`);
  assert(ST.formatDuration(12600) === '3h 30m', `d12600=${ST.formatDuration(12600)}`);
});

t('lib epub parses the real fixture file', async () => {
  const { loadTs } = require('./hooks');
  const E = loadTs(path.join(ROOT, 'src', 'lib', 'epub.ts'));
  const pride = reposStub.__fx().books.find((b) => b.id === 'b-pride') || { file_uri: null };
  const fs = require('fs');
  const uri = pride.file_uri || `file://${require('os').tmpdir()}/readnest-test/docs/shot-pride.epub`;
  assert(fs.existsSync(uri.replace('file://', '')), 'fixture epub missing on disk');
  const parsed = await E.parseEpub(uri);
  assert(parsed.chapters.length === 3, `chapters=${parsed.chapters.length}`);
  assert(parsed.toc.length === 3, `toc=${parsed.toc.length}`);
  const txt = E.epubToText(parsed.chapters).text;
  assert(txt.includes('universally acknowledged'), 'epub text extraction');
});

t('lib scan degrades without SAF', async () => {
  const { loadTs } = require('./hooks');
  const SC = loadTs(path.join(ROOT, 'src', 'lib', 'scan.ts'));
  assert((await SC.requestFolderAccess()) === null, 'folder access must be null without SAF');
  assert(JSON.stringify(await SC.listGrantedFolders()) === '[]', 'granted folders must be empty');
  let threw = '';
  try { await SC.scanFolder('x', () => {}); } catch (e) { threw = e.message; }
  assert(threw.includes('dev-client'), `scanFolder threw: ${threw}`);
});

t('lib import real epub end-to-end', async () => {
  const { loadTs } = require('./hooks');
  const I = loadTs(path.join(ROOT, 'src', 'lib', 'import.ts'));
  const uri = `file://${require('os').tmpdir()}/readnest-test/docs/shot-pride.epub`;
  const row = await I.importFileFromUri(uri, 'shot-pride.epub');
  assert(row.format === 'epub', 'import format');
  assert(row.title === 'Pride and Prejudice', `import title=${row.title}`);
  assert(row.author === 'Jane Austen', `import author=${row.author}`);
  assert(row.content_hash && row.content_hash.length > 0, 'import hash');
  let threw = '';
  try { await I.importFileFromUri(uri, 'evil.xyz'); } catch (e) { threw = e.message; }
  assert(threw.startsWith('UNSUPPORTED:'), `unsupported guard: ${threw}`);
  const res = await I.pickAndImport();
  assert(res.imported === 0 && res.errors.length === 0, 'cancelled picker result');
  await reposStub.deleteBook(row.id);
});

/* ── main ─────────────────────────────────────────────────── */
async function main() {
  patchAlert();
  const FX = await loadFixtures();
  console.log('fixtures ready:', FX.books.length, 'books');

  const only = process.argv.slice(2);
  let pass = 0;
  for (const test of tests) {
    if (only.length && !only.some((o) => test.name.toLowerCase().includes(o.toLowerCase()))) continue;
    alertCalls.length = 0;
    routerStub.__calls.length = 0;
    try {
      await test.fn();
      pass++;
      console.log('PASS', '-', test.name);
    } catch (e) {
      failures.push(test.name);
      console.log('FAIL', '-', test.name, '::', (e && e.message) || e);
    } finally {
      try { await unmount(); } catch { /* noop */ }
    }
  }
  const ran = tests.filter((x) => !only.length || only.some((o) => x.name.toLowerCase().includes(o.toLowerCase()))).length;
  console.log(`\n${pass}/${ran} passed`);
  if (rejections.length) console.log('UNHANDLED REJECTIONS:', JSON.stringify([...new Set(rejections)]));
  process.exit(failures.length || rejections.length ? 1 : 0);
}

main().catch((e) => { console.log('FATAL:', e); process.exit(1); });
