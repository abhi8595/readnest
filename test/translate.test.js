require('./loader');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cacheHash, translateCacheKey, parseDeepLResponse, parseGoogleResponse, TranslateError,
  extractParagraphs,
} = require('../src/lib/translate');

test('translate E1: cache keys are book+lang+text scoped', () => {
  const a = translateCacheKey('b1', 'es', 'Hello');
  const b = translateCacheKey('b1', 'es', 'Hello');
  const c = translateCacheKey('b1', 'fr', 'Hello');
  const d = translateCacheKey('b2', 'es', 'Hello');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.ok(a.startsWith('tr:b1:es:'));
  assert.equal(cacheHash('x'), cacheHash('x'));
  assert.notEqual(cacheHash('x'), cacheHash('y'));
});

test('translate E1: DeepL response parsing', () => {
  assert.equal(parseDeepLResponse({ translations: [{ text: 'Hola' }] }), 'Hola');
  assert.throws(() => parseDeepLResponse({ translations: [] }), TranslateError);
  assert.throws(() => parseDeepLResponse({}), TranslateError);
});

test('translate E1: Google response parsing', () => {
  assert.equal(parseGoogleResponse({ data: { translations: [{ translatedText: 'Bonjour' }] } }), 'Bonjour');
  assert.throws(() => parseGoogleResponse({ data: {} }), TranslateError);
});

test('translate E1: empty/garbage rejected before network', async () => {
  const { translateText } = require('../src/lib/translate');
  await assert.rejects(() => translateText('   ', 'es', { provider: 'deepl' }, 'b1'), TranslateError);
  await assert.rejects(() => translateText('hi', 'es', { provider: 'deepl' }, 'b1'), /key/i);
});

test('translate E2: paragraphs extracted with global indexes', () => {
  const chapters = [
    { id: 'c0', html: '<h1>Title</h1><p>First para here.</p><p>42</p><p>Second para here.</p>' },
    { id: 'c1', html: '<p>Third chapter para.</p>' },
  ];
  const cur0 = extractParagraphs(chapters, 'c0');
  assert.equal(cur0.length, 3, 'heading + 2 paras, folio skipped');
  // Folio <p> still occupies a WebView slot, so indexes skip it too.
  assert.deepEqual(cur0.map((p) => p.index), [0, 1, 3]);
  assert.ok(cur0[0].text.includes('Title'));
  const cur1 = extractParagraphs(chapters, 'c1');
  assert.deepEqual(cur1.map((p) => p.index), [4], 'offset counts all raw blocks incl. folio');
  assert.equal(extractParagraphs(chapters, 'missing').length, 3, 'unknown chapter falls back to first');
  assert.deepEqual(extractParagraphs([], 'c0'), []);
});

test('translate E2: extraction is cost-capped', () => {
  const big = '<p>' + 'word '.repeat(500) + '</p>';
  const chapters = [{ id: 'c0', html: big.repeat(10) }];
  const items = extractParagraphs(chapters, 'c0', 3, 100000);
  assert.equal(items.length, 3);
});

test('translate E1: DeepL endpoint selects free vs pro by key suffix', async () => {
  const origFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, headers: opts.headers });
    return {
      ok: true,
      json: async () => ({ translations: [{ text: 'Hola' }] }),
    };
  };
  try {
    const { translateText } = require('../src/lib/translate');
    const freeRes = await translateText('Hello', 'es', { provider: 'deepl', deeplKey: 'my-key:fx' }, 'book-free');
    assert.equal(freeRes, 'Hola');
    assert.equal(calls[0].url, 'https://api-free.deepl.com/v2/translate');

    const proRes = await translateText('Hello', 'es', { provider: 'deepl', deeplKey: 'my-pro-key' }, 'book-pro');
    assert.equal(proRes, 'Hola');
    assert.equal(calls[1].url, 'https://api.deepl.com/v2/translate');
  } finally {
    global.fetch = origFetch;
  }
});
