require('./loader');
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractPdfPageTexts, searchPdfPages, autoTocFromPdfPages } = require('../src/lib/pdf');

function minimalPdf(pages) {
  // pages: array of content-stream bodies (already BT…ET)
  let src = '%PDF-1.4\n';
  const offsets = [];
  let n = 1;
  const kids = [];
  const pageObjs = [];
  for (const body of pages) {
    const contentN = n++;
    const pageN = n++;
    kids.push(`${pageN} 0 R`);
    pageObjs.push({ contentN, pageN, body });
  }
  const catalogN = n++;
  const pagesN = n++;
  const objs = [];
  for (const p of pageObjs) {
    objs.push([p.contentN, `<< /Length ${p.body.length} >>\nstream\n${p.body}\nendstream`]);
    objs.push([p.pageN, `<< /Type /Page /Parent ${pagesN} 0 R /Contents ${p.contentN} 0 R >>`]);
  }
  objs.push([pagesN, `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`]);
  objs.push([catalogN, `<< /Type /Catalog /Pages ${pagesN} 0 R >>`]);
  objs.sort((a, b) => a[0] - b[0]);
  for (const [num, body] of objs) {
    offsets[num] = src.length;
    src += `${num} 0 obj\n${body}\nendobj\n`;
  }
  return src;
}

test('pdf: extracts Tj text per page', () => {
  const raw = minimalPdf([
    'BT /F1 12 Tf 72 720 Td (Chapter One) Tj ET',
    'BT /F1 12 Tf 72 720 Td (Hello world) Tj ET',
  ]);
  const pages = extractPdfPageTexts(raw);
  assert.equal(pages.length, 2);
  assert.ok(pages[0].includes('Chapter One'));
  assert.ok(pages[1].includes('Hello world'));
});

test('pdf: extracts TJ arrays + hex strings', () => {
  const raw = minimalPdf(['BT [(Hello) 40 (World)] TJ ET BT <48656C6C6F> Tj ET']);
  const pages = extractPdfPageTexts(raw);
  assert.ok(pages[0].includes('Hello'));
  assert.ok(pages[0].includes('World'));
});

test('pdf: search returns page hits with snippets', () => {
  const hits = searchPdfPages(['Chapter One intro', 'nothing here', 'CHAPTER ONE returns'], 'chapter one');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].page, 1);
  assert.equal(hits[1].page, 3);
  assert.ok(hits[0].snippet.includes('Chapter One'));
});

test('pdf: auto-TOC finds chapter headings', () => {
  const toc = autoTocFromPdfPages(['Chapter 1: Beginnings lorem', 'plain body text about nothing at all', 'Section 2 Methods and more words here']);
  assert.ok(toc.length >= 2);
  assert.ok(toc[0].href.startsWith('pdf:'));
});

test('pdf: empty / scanned pdf yields no pages text', () => {
  assert.deepEqual(extractPdfPageTexts('%PDF-1.4 no pages here'), []);
  assert.deepEqual(searchPdfPages(['', '  '], 'hello'), []);
});
