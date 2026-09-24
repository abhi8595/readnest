require('./loader');
const test = require('node:test');
const assert = require('node:assert/strict');

const { resetDb, getDb } = require('../src/db/client');
const {
  upsertBook, getBook, listBooks, listBooksPaged, countBooks,
  updateProgress, setRating, toggleFavorite, renameBook, deleteBook,
  findDuplicates, distinctAuthors, distinctSeries, seriesProgress,
  createCollection, addToCollection, removeFromCollection, booksInCollection,
  listCollections, deleteCollection,
  addBookmark, listBookmarks, deleteBookmark,
  upsertQuote, listQuotes, deleteQuote,
  getReadingSettings, saveReadingSettings,
  logSession, totalReadingSeconds,
  addDictLookup, recentDictLookups,
  kvSet, kvGet,
} = require('../src/db/repositories');
const { buildSnapshot, mergeSnapshot } = require('../src/lib/drive');

test('db: schema migrations & resetDb initialize all tables', async () => {
  await resetDb();
  const db = await getDb();
  const tables = await db.getAllAsync(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  const names = new Set(tables.map((t) => t.name));
  assert.ok(names.has('books'), 'books table exists');
  assert.ok(names.has('collections'), 'collections table exists');
  assert.ok(names.has('bookmarks'), 'bookmarks table exists');
  assert.ok(names.has('quotes'), 'quotes table exists');
  assert.ok(names.has('reading_settings'), 'reading_settings table exists');
  assert.ok(names.has('reading_sessions'), 'reading_sessions table exists');
  assert.ok(names.has('dictionary_history'), 'dictionary_history table exists');
  assert.ok(names.has('kv'), 'kv table exists');
});

test('db: upsertBook inserts, updates, and dedupes by content_hash', async () => {
  await resetDb();
  const b1 = await upsertBook({
    file_uri: 'file:///library/moby_dick.epub',
    format: 'epub',
    title: 'Moby Dick',
    author: 'Herman Melville',
    content_hash: 'hash-moby-123',
    file_size: 500000,
  });

  assert.ok(b1.id);
  assert.equal(b1.title, 'Moby Dick');
  assert.equal(b1.author, 'Herman Melville');
  assert.equal(b1.format, 'epub');
  assert.equal(b1.rating, 0);
  assert.equal(b1.read_count, 0);

  // Retrieve book
  const fetched = await getBook(b1.id);
  assert.equal(fetched.id, b1.id);
  assert.equal(fetched.content_hash, 'hash-moby-123');

  // Updating same file_uri updates the existing book
  const updated = await upsertBook({
    file_uri: 'file:///library/moby_dick.epub',
    format: 'epub',
    title: 'Moby Dick (Annotated)',
  });
  assert.equal(updated.id, b1.id);
  assert.equal(updated.title, 'Moby Dick (Annotated)');

  // Same content hash under a different path returns the duplicate row
  const dupe = await upsertBook({
    file_uri: 'file:///library/renamed_copy.epub',
    format: 'epub',
    content_hash: 'hash-moby-123',
  });
  assert.equal(dupe.id, b1.id);
});

test('db: listBooks, listBooksPaged, and countBooks', async () => {
  await resetDb();
  await upsertBook({ file_uri: 'file:///b1.epub', format: 'epub', title: 'Book A', author: 'Author 1' });
  await upsertBook({ file_uri: 'file:///b2.epub', format: 'epub', title: 'Book B', author: 'Author 2' });
  await upsertBook({ file_uri: 'file:///b3.epub', format: 'epub', title: 'Book C', author: 'Author 1' });

  const total = await countBooks();
  assert.equal(total, 3);

  const all = await listBooks('title ASC');
  assert.equal(all.length, 3);
  assert.equal(all[0].title, 'Book A');
  assert.equal(all[2].title, 'Book C');

  const paged1 = await listBooksPaged('title ASC', 2, 0);
  assert.equal(paged1.length, 2);
  assert.equal(paged1[0].title, 'Book A');
  assert.equal(paged1[1].title, 'Book B');

  const paged2 = await listBooksPaged('title ASC', 2, 2);
  assert.equal(paged2.length, 1);
  assert.equal(paged2[0].title, 'Book C');
});

test('db: updateProgress tracks re-reads when reaching finish', async () => {
  await resetDb();
  const b = await upsertBook({ file_uri: 'file:///read.epub', format: 'epub', title: 'Reading Test' });
  assert.equal(b.reading_progress, 0);
  assert.equal(b.read_count, 0);

  // Progress to 50%
  await updateProgress(b.id, 0.5, 'p:50');
  let cur = await getBook(b.id);
  assert.equal(cur.reading_progress, 0.5);
  assert.equal(cur.last_location, 'p:50');
  assert.equal(cur.read_count, 0);

  // Finish book (progress >= 0.99)
  await updateProgress(b.id, 1.0, 'p:100');
  cur = await getBook(b.id);
  assert.equal(cur.reading_progress, 1.0);
  assert.equal(cur.read_count, 1);
  assert.ok(cur.last_finished_at != null);

  // Re-read: restart at 0%
  await updateProgress(b.id, 0.0, 'p:1');
  cur = await getBook(b.id);
  assert.equal(cur.reading_progress, 0.0);
  assert.equal(cur.read_count, 1);

  // Finish again: read_count increments to 2
  await updateProgress(b.id, 1.0, 'p:100');
  cur = await getBook(b.id);
  assert.equal(cur.read_count, 2);
});

test('db: ratings, favorites, rename, and seriesProgress', async () => {
  await resetDb();
  const b1 = await upsertBook({
    file_uri: 'file:///s1.epub', format: 'epub', title: 'Volume 1', series: 'Epic Saga',
  });
  const b2 = await upsertBook({
    file_uri: 'file:///s2.epub', format: 'epub', title: 'Volume 2', series: 'Epic Saga',
  });

  await setRating(b1.id, 5);
  await toggleFavorite(b1.id);
  await renameBook(b2.id, 'Volume 2 (Revised)', 'Famous Author');

  const cur1 = await getBook(b1.id);
  assert.equal(cur1.rating, 5);
  assert.equal(cur1.is_favorite, 1);

  const cur2 = await getBook(b2.id);
  assert.equal(cur2.title, 'Volume 2 (Revised)');
  assert.equal(cur2.author, 'Famous Author');

  const authors = await distinctAuthors();
  assert.ok(authors.some((a) => a.author === 'Famous Author'));

  const series = await distinctSeries();
  assert.equal(series[0].series, 'Epic Saga');
  assert.equal(series[0].count, 2);

  const prog = await seriesProgress();
  assert.equal(prog[0].series, 'Epic Saga');
  assert.equal(prog[0].total, 2);
  assert.equal(prog[0].finished, 0);

  // Finish Volume 1
  await updateProgress(b1.id, 1.0);
  const progAfter = await seriesProgress();
  assert.equal(progAfter[0].finished, 1);
});

test('db: collections membership and deletion', async () => {
  await resetDb();
  const b = await upsertBook({ file_uri: 'file:///col.epub', format: 'epub', title: 'Collection Book' });
  const col = await createCollection('Favorites', '#FF0000');

  assert.equal(col.name, 'Favorites');
  assert.equal(col.color, '#FF0000');

  await addToCollection(col.id, b.id);
  let inCol = await booksInCollection(col.id);
  assert.equal(inCol.length, 1);
  assert.equal(inCol[0].id, b.id);

  const list = await listCollections();
  assert.equal(list[0].id, col.id);
  assert.equal(list[0].count, 1);

  await removeFromCollection(col.id, b.id);
  inCol = await booksInCollection(col.id);
  assert.equal(inCol.length, 0);

  await deleteCollection(col.id);
  const emptyList = await listCollections();
  assert.equal(emptyList.length, 0);
});

test('db: bookmarks, quotes, reading settings, and kv', async () => {
  await resetDb();
  const b = await upsertBook({ file_uri: 'file:///bq.epub', format: 'epub', title: 'BQ Book' });

  // Bookmarks
  const bm = await addBookmark(b.id, 'p:15', 'Page 15 note');
  let marks = await listBookmarks(b.id);
  assert.equal(marks.length, 1);
  assert.equal(marks[0].label, 'Page 15 note');
  await deleteBookmark(bm.id);
  marks = await listBookmarks(b.id);
  assert.equal(marks.length, 0);

  // Quotes
  await upsertQuote({ book_id: b.id, text: 'Call me Ishmael.', note: 'Famous opening', chapter: 'Chapter 1' });
  let quotes = await listQuotes(b.id);
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].text, 'Call me Ishmael.');
  assert.equal(quotes[0].book_title, 'BQ Book');

  await upsertQuote({ id: quotes[0].id, book_id: b.id, text: 'Call me Ishmael.', note: 'Updated note' });
  quotes = await listQuotes(b.id);
  assert.equal(quotes[0].note, 'Updated note');
  await deleteQuote(quotes[0].id);
  quotes = await listQuotes(b.id);
  assert.equal(quotes.length, 0);

  // Reading settings
  await saveReadingSettings({
    book_id: b.id,
    theme: 'sepia',
    font_family: 'atkinson',
    custom_font_uri: null,
    font_size: 20,
    font_weight: 500,
    line_spacing: 1.8,
    margin: 'L',
    hyphenation: 1,
    brightness: 0.8,
    orientation: 'portrait',
    page_mode: 'paginated',
    tts_rate: 1.25,
    tts_voice: null,
    focus_mode: 'sentence',
    bionic: 1,
    irlen_tint: 'rose',
    tts_index: 10,
  });
  const st = await getReadingSettings(b.id);
  assert.equal(st.theme, 'sepia');
  assert.equal(st.font_size, 20);
  assert.equal(st.focus_mode, 'sentence');
  assert.equal(st.bionic, 1);
  assert.equal(st.irlen_tint, 'rose');
  assert.equal(st.tts_index, 10);

  // KV
  await kvSet('test-key', 'test-value');
  const val = await kvGet('test-key');
  assert.equal(val, 'test-value');
});

test('db: sessions, stats, dictionary history, and deleteBook', async () => {
  await resetDb();
  const b = await upsertBook({ file_uri: 'file:///del.epub', format: 'epub', title: 'Delete Test' });

  await logSession(b.id, 120, 0, 0.2);
  const secs = await totalReadingSeconds();
  assert.equal(secs, 120);

  await addDictLookup('ephemeral', b.id);
  const lookups = await recentDictLookups();
  assert.equal(lookups[0].word, 'ephemeral');

  await deleteBook(b.id);
  const remaining = await getBook(b.id);
  assert.equal(remaining, null);
});

test('db: snapshot build and mergeSnapshot across devices', async () => {
  await resetDb();
  const b = await upsertBook({
    file_uri: 'file:///device1/book.epub',
    format: 'epub',
    title: 'Snapshot Book',
    author: 'Author One',
    content_hash: 'hash-snap-456',
  });
  await addBookmark(b.id, 'p:42', 'Important page');
  await upsertQuote({ book_id: b.id, text: 'Snapshot quote', note: 'Remote note' });
  await saveReadingSettings({
    book_id: b.id, theme: 'oled', font_family: 'inter', custom_font_uri: null,
    font_size: 22, font_weight: 400, line_spacing: 1.6, margin: 'M',
    hyphenation: 1, brightness: null, orientation: 'system', page_mode: 'paginated',
    tts_rate: 1.0, tts_voice: null, focus_mode: 'off', bionic: 0, irlen_tint: 'none', tts_index: 5,
  });

  const snap = await buildSnapshot();
  assert.equal(snap.books.length, 1);
  assert.equal(snap.bookmarks.length, 1);
  assert.equal(snap.quotes.length, 1);
  assert.equal(snap.settings.length, 1);

  // Switch to clean database (device 2)
  await resetDb();
  const res = await mergeSnapshot(snap);
  assert.equal(res.merged, 3, 'merged book + bookmark + quote');
  assert.equal(res.conflicts, 0);

  const importedBook = await getBook(b.id);
  assert.equal(importedBook.title, 'Snapshot Book');
  const marks = await listBookmarks(b.id);
  assert.equal(marks[0].label, 'Important page');
  const quotes = await listQuotes(b.id);
  assert.equal(quotes[0].text, 'Snapshot quote');
  const st = await getReadingSettings(b.id);
  assert.equal(st.theme, 'oled');
  assert.equal(st.font_size, 22);
});
