require('./loader');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cleanChapterHtmlForTts, isFolioNoise, buildTtsMap, estimateTimeLeft,
} = require('../src/lib/tts');

test('tts C2: running headers/footers/page numbers stripped', () => {
  const html = '<header>Book Title · Author</header><p>Real body copy here.</p><footer><span class="pagenum">42</span></footer>';
  const clean = cleanChapterHtmlForTts(html);
  assert.ok(!clean.includes('Book Title'), 'header gone');
  assert.ok(!clean.includes('42'), 'page number gone');
  assert.ok(clean.includes('Real body copy'), 'body kept');
});

test('tts C2: nav + footnote refs stripped, body kept', () => {
  const html = '<nav><a>toc</a></nav><p>First.</p><p>See note<span class="footnote-ref">1</span> here.</p>';
  const clean = cleanChapterHtmlForTts(html);
  assert.ok(!clean.includes('toc'), 'nav gone');
  assert.ok(clean.includes('First'), 'body kept');
});

test('tts C2: folio-only sentences detected', () => {
  assert.equal(isFolioNoise('42'), true);
  assert.equal(isFolioNoise('xiv'), true);
  assert.equal(isFolioNoise('Chapter 1'), false);
  assert.equal(isFolioNoise('Hello world.'), false);
});

test('tts C2: map skips noise, marks chapter breaks', () => {
  const map = buildTtsMap([
    { html: '<header>H</header><p>First sentence here. Second one follows.</p><p>42</p>' },
    { html: '<p>Next chapter opens loudly.</p>' },
  ]);
  assert.ok(!map.sentences.join(' ').includes('42'), 'folio skipped');
  assert.ok(map.sentences.length >= 3, 'body sentences kept');
  assert.equal(map.chapterBreaks.length, 1, 'one chapter boundary');
  assert.equal(map.sentences.length, map.paraIndex.length, 'aligned');
});

test('tts C2: time-left estimate scales with rate', () => {
  const ss = Array(170).fill('word '.repeat(10).trim());
  assert.equal(estimateTimeLeft(ss, 0, 1), '~10 min left');
  assert.equal(estimateTimeLeft(ss, 0, 2), '~5 min left');
  assert.equal(estimateTimeLeft(['one two three'], 0, 1).includes('sec left'), true);
  assert.equal(estimateTimeLeft(ss, ss.length, 1).includes('sec left'), true);
});
