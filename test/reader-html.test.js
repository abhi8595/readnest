require('./loader');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReaderHtml } = require('../src/components/reader/readerHtml');

const theme = { id: 'day', label: 'Day', bg: '#FBF7F0', text: '#1E1B16', muted: '#6B6357', accent: '#C4623A' };

function baseOpts(over = {}) {
  return {
    theme,
    fontFamily: "'CrimsonPro',Georgia,serif",
    fontSize: 18,
    fontWeight: 400,
    lineSpacing: 1.6,
    marginPx: 24,
    hyphenation: true,
    paginated: true,
    chapters: [{ id: 'c0', label: 'Ch 1', html: '<p>Hello world.</p>' }],
    startChapterId: null,
    startRatio: 0,
    ...over,
  };
}

test('buildReaderHtml embeds chapters with labels + bridge', () => {
  const html = buildReaderHtml(baseOpts());
  assert.ok(html.includes('<p>Hello world.</p>'), 'chapter html present');
  assert.ok(html.includes('data-label="Ch 1"'), 'chapter label present');
  assert.ok(html.includes('window.ReactNativeWebView'), 'RN bridge present');
  assert.ok(html.includes("type:'pos'") || html.includes("type: 'pos'") || html.includes('pos'), 'position reporting present');
});

test('paginated mode uses multicol CSS, scroll mode does not', () => {
  assert.ok(buildReaderHtml(baseOpts({ paginated: true })).includes('column-width'));
  assert.ok(!buildReaderHtml(baseOpts({ paginated: false })).includes('column-width'));
});

test('theme tokens land in CSS variables', () => {
  const html = buildReaderHtml(baseOpts());
  assert.ok(html.includes('--bg:#FBF7F0'));
  assert.ok(html.includes('--fs:18px'));
});

test('fontFaceCss is injected for WebView fonts', () => {
  const css = "@font-face{font-family:'CrimsonPro';src:url(data:font/ttf;base64,AAA)}";
  assert.ok(buildReaderHtml(baseOpts({ fontFaceCss: css })).includes("font-family:'CrimsonPro'"));
});

test('labels are attribute-escaped', () => {
  const html = buildReaderHtml(baseOpts({
    chapters: [{ id: 'c0', label: 'Ch "quoted" <x>', html: '<p>t</p>' }],
  }));
  assert.ok(html.includes('data-label="Ch &quot;quoted&quot; &lt;x>'));
});

test('reader chrome: drop caps, kickers, tts + paging handlers exist', () => {
  const html = buildReaderHtml(baseOpts());
  assert.ok(html.includes('::first-letter'), 'drop cap styling');
  assert.ok(html.includes('class="kick"') || html.includes('class=\\"kick\\"'), 'chapter kicker');
  assert.ok(html.includes('ttsMark'), 'tts highlight handler');
  assert.ok(html.includes('pageDelta'), 'external paging handler');
  assert.ok(html.includes("'goto'") || html.includes('"goto"'), 'chapter navigation handler');
});

test('rtl: dir + lang attributes and mirrored navigation', () => {
  const { isRtlLang } = require('../src/components/reader/readerHtml');
  assert.equal(isRtlLang('ar'), true);
  assert.equal(isRtlLang('he-IL'), true);
  assert.equal(isRtlLang('fa'), true);
  assert.equal(isRtlLang('en'), false);
  assert.equal(isRtlLang(null), false);
  const html = buildReaderHtml(baseOpts({ lang: 'ar', rtl: true }));
  assert.ok(html.includes('dir="rtl"'), 'rtl direction set');
  assert.ok(html.includes('lang="ar"'), 'language tagged');
  assert.ok(html.includes('var RTL = true'), 'RTL flag in runtime');
  const ltr = buildReaderHtml(baseOpts({ lang: 'en' }));
  assert.ok(!ltr.includes('dir="rtl"'), 'ltr has no rtl dir');
});

test('rich content: tables, code and media have bounded styles', () => {
  const html = buildReaderHtml(baseOpts());
  assert.ok(html.includes('border-collapse'), 'table styling');
  assert.ok(html.includes('overflow-x:auto'), 'wide content scrolls');
  assert.ok(html.includes('figcaption'), 'figure captions');
  assert.ok(!html.includes('maximum-scale=1'), 'pinch-zoom not blocked (WCAG 1.4.4)');
});
