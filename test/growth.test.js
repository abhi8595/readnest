require('./loader');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseOpdsFeed, opdsFilenameFor } = require('../src/lib/opds');
const { quotesToMarkdown } = require('../src/lib/export');

const FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Catalog</title>
  <link rel="next" href="/opds?page=2" type="application/atom+xml"/>
  <entry>
    <title>Pride and Prejudice</title>
    <id>urn:uuid:1</id>
    <author><name>Austen, Jane</name></author>
    <summary>A classic novel.</summary>
    <link rel="http://opds-spec.org/image" href="/covers/1.jpg" type="image/jpeg"/>
    <link rel="http://opds-spec.org/acquisition" href="/books/1.epub" type="application/epub+zip"/>
    <link rel="http://opds-spec.org/acquisition" href="/books/1.pdf" type="application/pdf"/>
  </entry>
  <entry>
    <title>Fiction shelf</title>
    <id>urn:uuid:2</id>
    <link rel="subsection" href="/opds/fiction" type="application/atom+xml"/>
  </entry>
</feed>`;

test('opds: parses entries, prefers EPUB acquisition', () => {
  const feed = parseOpdsFeed(FEED, 'https://example.org/opds');
  assert.equal(feed.title, 'Test Catalog');
  assert.equal(feed.entries.length, 2);
  const book = feed.entries[0];
  assert.equal(book.title, 'Pride and Prejudice');
  assert.deepEqual(book.authors, ['Austen, Jane']);
  assert.equal(book.coverUrl, 'https://example.org/covers/1.jpg');
  assert.equal(book.acquisitions[0].mime, 'application/epub+zip');
  assert.equal(book.acquisitions[0].url, 'https://example.org/books/1.epub');
  assert.equal(book.navUrl, null);
  const shelf = feed.entries[1];
  assert.equal(shelf.acquisitions.length, 0);
  assert.equal(shelf.navUrl, 'https://example.org/opds/fiction');
  assert.equal(feed.nextUrl, 'https://example.org/opds?page=2');
  assert.equal(feed.prevUrl, null);
});

test('opds: rejects non-feeds honestly', () => {
  assert.throws(() => parseOpdsFeed('<html>nope</html>', 'https://x/'), /Not an OPDS feed/);
  assert.throws(() => parseOpdsFeed('{{{', 'https://x/'), /valid feed|OPDS feed/);
});

test('opds: filename from mime with safe title', () => {
  const entry = { title: 'Dune: Part/One?', authors: [], summary: null, coverUrl: null, acquisitions: [], navUrl: null, id: '1' };
  assert.equal(opdsFilenameFor(entry, 'application/epub+zip'), 'Dune_ Part_One_.epub');
  assert.equal(opdsFilenameFor(entry, 'application/pdf'), 'Dune_ Part_One_.pdf');
});

test('export: markdown groups by book, escapes markup', () => {
  const md = quotesToMarkdown([
    { text: 'To be, or *not* to be', note: 'Hamlet ponders', color: '#fff', book_title: 'Hamlet', chapter: 'Act 3', created_at: 1700000000000 },
    { text: 'Brevity is the soul of wit', note: null, color: null, book_title: 'Hamlet', chapter: null, created_at: 1700000001000 },
    { text: 'Call me Ishmael.', note: null, color: null, book_title: 'Moby Dick', chapter: 'Ch 1', created_at: 1700000002000 },
  ]);
  assert.ok(md.startsWith('# ReadNest export'));
  assert.ok(md.includes('## Hamlet'));
  assert.ok(md.includes('## Moby Dick'));
  assert.ok(md.indexOf('## Hamlet') < md.indexOf('## Moby Dick'), 'books sorted');
  assert.ok(md.includes('> To be, or *not* to be'), 'quote body preserved');
  assert.ok(md.includes('**Note:** Hamlet ponders'));
  assert.ok(quotesToMarkdown([]).startsWith('# ReadNest export'));
  assert.ok(quotesToMarkdown([]).includes('0 highlights'));
});
