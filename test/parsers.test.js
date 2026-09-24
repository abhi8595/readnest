/**
 * Parser test harness — every supported text format, generated fixtures.
 * Run: npm test   (node --test test/)
 *
 * Fixtures are built in-memory with jszip (a real dependency) and written
 * through the expo-file-system stub, so the parsers run exactly as in-app.
 */
require('./loader');
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const FSE = require('./stubs/expo-file-system');

const { FORMATS, SUPPORTED_EXTENSIONS, formatFromFilename, formatInfo, titleFromFilename, formatBytes } = require('../src/lib/formats');
const { extractEpubMetadata, parseEpub, epubToText } = require('../src/lib/epub');
const { extractTextChapters, extractTextMetadata } = require('../src/lib/textextract');
const { extractCbz, tryExtractCbr } = require('../src/lib/comic');
const { parseMobiHeader, extractMobiChapters } = require('../src/lib/mobi');
const { splitSentences } = require('../src/lib/tts');
const { contentKey, copyIntoLibrary, fileSize } = require('../src/lib/files');

const FIX = `${FSE.documentDirectory}fixtures/`;
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function writeZip(name, build) {
  const zip = new JSZip();
  build(zip);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const uri = `${FIX}${name}`;
  await FSE.writeAsStringAsync(uri, buf.toString('base64'), { encoding: FSE.EncodingType.Base64 });
  return uri;
}

async function writeText(name, text) {
  const uri = `${FIX}${name}`;
  await FSE.writeAsStringAsync(uri, text, { encoding: FSE.EncodingType.UTF8 });
  return uri;
}

/* ── formats ───────────────────────────────────────────── */

test('formats: registry covers 13 formats + aliases', () => {
  assert.equal(FORMATS.length, 13);
  assert.ok(SUPPORTED_EXTENSIONS.has('epub'));
  assert.ok(SUPPORTED_EXTENSIONS.has('fb2.zip'));
  assert.equal(formatInfo('pdf').tier, 'paged');
  assert.equal(formatInfo('epub').tier, 'full');
  assert.equal(formatInfo('docx').tier, 'text');
  assert.equal(formatInfo('djvu').tier, 'library');
});

test('formats: formatFromFilename is case-insensitive + alias-aware', () => {
  const cases = {
    'book.epub': 'epub', 'X.PDF': 'pdf', 'a.mobi': 'mobi', 'b.AZW3': 'azw3',
    'c.cbz': 'cbz', 'd.cbr': 'cbr', 'e.fb2': 'fb2', 'f.fb2.zip': 'fb2',
    'g.txt': 'txt', 'h.md': 'txt', 'i.markdown': 'txt', 'j.docx': 'docx',
    'k.odt': 'odt', 'l.prc': 'mobi', 'm.azw': 'azw3', 'n.doc': 'doc',
    'o.chm': 'chm', 'p.djvu': 'djvu', 'q.djv': 'djvu',
  };
  for (const [name, fmt] of Object.entries(cases)) assert.equal(formatFromFilename(name), fmt, name);
  assert.equal(formatFromFilename('setup.exe'), null);
  assert.equal(formatFromFilename('noext'), null);
});

test('formats: titleFromFilename + formatBytes', () => {
  assert.equal(titleFromFilename('the_hobbit.epub'), 'The Hobbit');
  assert.equal(titleFromFilename('Dune.epub'), 'Dune');
  assert.equal(formatBytes(0), '—');
  assert.equal(formatBytes(500), '500 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1048576), '1.0 MB');
});

/* ── EPUB ──────────────────────────────────────────────── */

function epubFiles(zip, { withContainer = true } = {}) {
  if (withContainer) {
    zip.file('mimetype', 'application/epub+zip');
    zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  }
  zip.file('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Test Book</dc:title><dc:creator>Jane Doe</dc:creator><dc:language>en</dc:language><dc:description>A tiny test book.</dc:description></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="ncx"><itemref idref="ch1"/><itemref idref="ch2"/></spine></package>');
  zip.file('OEBPS/toc.ncx', '<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap><navPoint id="n1"><navLabel><text>First</text></navLabel><content src="ch1.xhtml"/></navPoint><navPoint id="n2"><navLabel><text>Second</text></navLabel><content src="ch2.xhtml"/></navPoint></navMap></ncx>');
  zip.file('OEBPS/ch1.xhtml', '<html><body><h1>First</h1><p>Hello brave world.</p><script>alert(1)</script></body></html>');
  zip.file('OEBPS/ch2.xhtml', '<html><body><h1>Second</h1><p>Goodbye cruel world.</p></body></html>');
}

test('epub: metadata extraction', async () => {
  const uri = await writeZip('t.epub', (z) => epubFiles(z));
  const meta = await extractEpubMetadata(uri);
  assert.equal(meta.title, 'Test Book');
  assert.equal(meta.creator, 'Jane Doe');
  assert.equal(meta.language, 'en');
  assert.equal(meta.description, 'A tiny test book.');
});

test('epub: chapters + toc + script stripping', async () => {
  const uri = await writeZip('t2.epub', (z) => epubFiles(z));
  const book = await parseEpub(uri);
  assert.equal(book.chapters.length, 2);
  assert.equal(book.chapters[0].id, 'c0');
  assert.equal(book.chapters[0].label, 'First');
  assert.equal(book.chapters[1].label, 'Second');
  assert.ok(book.chapters[0].html.includes('Hello brave world.'));
  assert.ok(!book.chapters[0].html.includes('<script'), 'scripts stripped');
  assert.equal(book.toc.length, 2);
  assert.equal(book.toc[1].label, 'Second');
});

test('epub: invalid file throws honestly', async () => {
  const uri = await writeZip('bad.epub', (z) => epubFiles(z, { withContainer: false }));
  await assert.rejects(() => parseEpub(uri), /container\.xml|Invalid EPUB/);
});

test('epub: epubToText concatenates with offsets', async () => {
  const uri = await writeZip('t3.epub', (z) => epubFiles(z));
  const book = await parseEpub(uri);
  const { text, offsets } = epubToText(book.chapters);
  assert.ok(text.includes('Hello brave world.'));
  assert.ok(text.includes('Goodbye cruel world.'));
  assert.equal(offsets.length, 2);
  assert.equal(offsets[0].chapterId, 'c0');
  assert.equal(offsets[0].start, 0);
  assert.equal(offsets[1].chapterId, 'c1');
});

/* ── TXT / FB2 / DOCX / ODT ────────────────────────────── */

test('txt: markdown headings become chapters', async () => {
  const uri = await writeText('t.md', '# Alpha\n\nFirst para.\n\n# Beta\n\nSecond para.\n');
  const ch = await extractTextChapters(uri, 'txt');
  assert.equal(ch.length, 2);
  assert.equal(ch[0].label, 'Alpha');
  assert.equal(ch[1].label, 'Beta');
  assert.ok(ch[0].html.includes('First para.'));
});

test('txt: markdown with preamble retains preface', async () => {
  const uri = await writeText('preface.md', 'An introductory note before chapters.\n\n# Chapter One\n\nBody here.\n');
  const ch = await extractTextChapters(uri, 'txt');
  assert.equal(ch.length, 2);
  assert.equal(ch[0].label, 'Preface');
  assert.ok(ch[0].html.includes('introductory note'));
  assert.equal(ch[1].label, 'Chapter One');
  assert.ok(ch[1].html.includes('Body here.'));
});

test('txt: plain text chunks + first-line title', async () => {
  const uri = await writeText('p.txt', 'My Title\n\nBody line one.\n\nBody line two.\n');
  const ch = await extractTextChapters(uri, 'txt');
  assert.equal(ch.length, 1);
  assert.ok(ch[0].html.includes('Body line one.'));
  const meta = await extractTextMetadata(uri, 'txt');
  assert.equal(meta.title, 'My Title');
});

test('fb2: metadata + sections', async () => {
  const fb2 = '<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><book-title>FB2 Title</book-title><author><first-name>Ada</first-name><last-name>Lovelace</last-name></author></title-info></description><body><section><title><p>One</p></title><p>Body one.</p></section><section><title><p>Two</p></title><p>Body two.</p></section></body></FictionBook>';
  const uri = await writeText('b.fb2', fb2);
  const meta = await extractTextMetadata(uri, 'fb2');
  assert.equal(meta.title, 'FB2 Title');
  assert.equal(meta.author, 'Ada Lovelace');
  const ch = await extractTextChapters(uri, 'fb2');
  assert.equal(ch.length, 2);
  assert.equal(ch[0].label, 'One');
  assert.ok(ch[1].html.includes('Body two.'));
});

test('docx: headings + metadata', async () => {
  const uri = await writeZip('d.docx', (zip) => {
    zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chap One</w:t></w:r></w:p><w:p><w:r><w:t>Docx body one.</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chap Two</w:t></w:r></w:p><w:p><w:r><w:t>Docx body two.</w:t></w:r></w:p></w:body></w:document>');
    zip.file('docProps/core.xml', '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Docx T</dc:title><dc:creator>Docx A</dc:creator></cp:coreProperties>');
  });
  const meta = await extractTextMetadata(uri, 'docx');
  assert.equal(meta.title, 'Docx T');
  assert.equal(meta.author, 'Docx A');
  const ch = await extractTextChapters(uri, 'docx');
  assert.equal(ch.length, 2);
  assert.equal(ch[0].label, 'Chap One');
  assert.ok(ch[1].html.includes('Docx body two.'));
});

test('odt: paragraphs merge into a document chapter', async () => {
  const uri = await writeZip('o.odt', (zip) => {
    zip.file('content.xml', '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:p>Odt one.</text:p><text:p>Odt two.</text:p></office:text></office:body></office:document-content>');
  });
  const ch = await extractTextChapters(uri, 'odt');
  assert.equal(ch.length, 1);
  assert.ok(ch[0].html.includes('Odt one.'));
  assert.ok(ch[0].html.includes('Odt two.'));
});

/* ── CBZ / CBR ─────────────────────────────────────────── */

test('cbz: natural sort, macosx filtered, pages on disk', async () => {
  const uri = await writeZip('c.cbz', (zip) => {
    zip.file('page2.png', PNG_1X1);
    zip.file('page10.png', PNG_1X1);
    zip.file('page1.png', PNG_1X1);
    zip.file('__MACOSX/._page1.png', PNG_1X1);
    zip.file('notes.txt', 'not an image');
  });
  const pages = await extractCbz(uri, 'testbook');
  assert.deepEqual(pages.map((pg) => pg.name), ['page1.png', 'page2.png', 'page10.png']);
  assert.equal(pages[0].index, 0);
  for (const pg of pages) {
    const info = await FSE.getInfoAsync(pg.uri);
    assert.ok(info.exists, `${pg.uri} written`);
  }
});

test('cbr: honestly unsupported without unrar module', async () => {
  assert.equal(await tryExtractCbr('x.cbr', 'b'), null);
});

/* ── MOBI ──────────────────────────────────────────────── */

function mobiFixture({ drm = false } = {}) {
  // Minimal PalmDB: 78-byte header + 2 record entries, record0, record1 text.
  const text = 'Hello Mobi. Plain record text.';
  const total = 640 + text.length;
  const buf = Buffer.alloc(total);
  buf.write('BOOKMOBI', 60, 'latin1');
  buf.writeUInt16BE(2, 76);
  buf.writeUInt32BE(128, 78);   // record0 offset
  buf.writeUInt32BE(640, 86);   // record1 offset
  buf.writeUInt16BE(1, 128);    // compression = none
  buf.writeUInt32BE(232, 148);  // MOBI header length
  buf.writeUInt32BE(244, 128 + 0x54); // title offset (rel record0)
  buf.writeUInt32BE(9, 128 + 0x58);   // title length
  buf.writeUInt32BE(drm ? 0x200 : 0xffffffff, 128 + 0x5c);
  buf.writeUInt32BE(drm ? 1 : 0, 128 + 0x60);
  buf.write('MobiTitle', 128 + 244, 'latin1');
  buf.write('EXTH', 128 + 264, 'latin1');
  buf.writeUInt32BE(12, 128 + 268);
  buf.writeUInt32BE(0, 128 + 272); // 0 EXTH records
  buf.write(text, 640, 'latin1');
  return buf;
}

test('mobi: header parse (title, no drm, uncompressed)', async () => {
  const uri = `${FIX}m.mobi`;
  await FSE.writeAsStringAsync(uri, mobiFixture().toString('base64'), { encoding: FSE.EncodingType.Base64 });
  const meta = await parseMobiHeader(uri);
  assert.equal(meta.title, 'MobiTitle');
  assert.equal(meta.hasDrm, false);
  assert.equal(meta.compression, 1);
});

test('mobi: text record extraction', async () => {
  const uri = `${FIX}m2.mobi`;
  await FSE.writeAsStringAsync(uri, mobiFixture().toString('base64'), { encoding: FSE.EncodingType.Base64 });
  const { chapters, drm } = await extractMobiChapters(uri);
  assert.equal(drm, false);
  assert.equal(chapters.length, 1);
  assert.ok(chapters[0].html.includes('Hello Mobi.'));
});

test('mobi: drm detected honestly, garbage rejected', async () => {
  const drmUri = `${FIX}d.mobi`;
  await FSE.writeAsStringAsync(drmUri, mobiFixture({ drm: true }).toString('base64'), { encoding: FSE.EncodingType.Base64 });
  const meta = await parseMobiHeader(drmUri);
  assert.equal(meta.hasDrm, true);
  const res = await extractMobiChapters(drmUri);
  assert.equal(res.drm, true);
  assert.equal(res.chapters[0].label, 'Protected book');

  const badUri = await writeText('bad.mobi', 'definitely not a PalmDB file');
  await assert.rejects(() => extractMobiChapters(badUri), /Unsupported MOBI compression/);
});

/* ── TTS splitting + files ─────────────────────────────── */

test('tts: splitSentences', () => {
  assert.deepEqual(splitSentences('Hello world. How are you? I am fine!'), ['Hello world.', 'How are you?', 'I am fine!']);
  assert.deepEqual(splitSentences(''), []);
  assert.equal(splitSentences('Single sentence').length, 1);
  // Multilingual boundaries must not collapse (Arabic + CJK).
  assert.equal(splitSentences('مرحبا بالعالم. كيف حالك؟ بخير.').length, 3);
  assert.equal(splitSentences('今日は良い天気です。散歩に行きましょう。').length, 2);
});

test('tts: buildTtsMap aligns sentences to paragraph indexes', () => {
  const { buildTtsMap } = require('../src/lib/tts');
  const { sentences, paraIndex } = buildTtsMap([
    { html: '<p>First para. Two sentences.</p><p>Second para here.</p>' },
  ]);
  assert.deepEqual(sentences, ['First para.', 'Two sentences.', 'Second para here.']);
  assert.deepEqual(paraIndex, [0, 0, 1]);
  const empty = buildTtsMap([{ html: '' }]);
  assert.deepEqual(empty.sentences, []);
});

test('files: contentKey deterministic, copyIntoLibrary persists', async () => {
  const a = await writeText('k1.txt', 'same content here');
  const b = await writeText('k2.txt', 'same content here');
  const size = await fileSize(a);
  assert.ok(size > 0);
  const k1 = await contentKey(a, size);
  const k2 = await contentKey(b, size);
  assert.ok(typeof k1 === 'string' && k1.length === 64, 'sha256 hex');
  assert.equal(k1, k2);
  const dest = await copyIntoLibrary(a, 'k1.txt');
  assert.ok(dest.includes('books/') || dest.includes('books\\'));
  assert.ok((await FSE.getInfoAsync(dest)).exists);
});
