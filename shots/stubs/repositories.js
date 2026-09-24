/**
 * Fixture-backed @/db/repositories with stateful mutations (no sqlite in jsdom).
 * Copy-on-read: like sqlite, every read returns fresh row objects so React
 * state updates on re-fetch (no shared-mutable-ref bailouts).
 */
let FX = {
  books: [],
  quotes: [],
  bookmarks: [],
  collections: [],
  collectionBooks: {},
  authors: [],
  series: [],
  dictHistory: [],
  stats: null,
};

let seq = 1;
const nid = (p) => `${p}-t${Date.now().toString(36)}${seq++}`;
const copy = (r) => ({ ...r });

function hay(b) {
  return [b.title, b.author, b.series, b.format, b.folder_path].filter(Boolean).join(' ').toLowerCase();
}

const kv = new Map();

const api = {
  __setFixtures: (fx) => { FX = { ...FX, ...fx }; },
  __getStats: async () => FX.stats,
  __fx: () => FX,

  listBooks: async () => FX.books.map(copy),
  searchBooks: async (q) => {
    const s = (q || '').trim().toLowerCase();
    if (!s) return FX.books.map(copy);
    return FX.books.filter((b) => hay(b).includes(s)).map(copy);
  },
  getBook: async (id) => {
    const b = FX.books.find((x) => x.id === id);
    return b ? copy(b) : null;
  },
  upsertBook: async (b) => {
    const row = { id: nid('b'), ...b };
    FX.books.push(row);
    return copy(row);
  },
  updateProgress: async (id, progress, location) => {
    const b = FX.books.find((x) => x.id === id);
    if (b) {
      b.reading_progress = progress;
      if (location !== undefined) b.last_location = location;
      b.last_read_at = Date.now();
    }
  },
  toggleFavorite: async (id) => {
    const b = FX.books.find((x) => x.id === id);
    if (b) b.is_favorite = b.is_favorite ? 0 : 1;
  },
  renameBook: async (id, title, author) => {
    const b = FX.books.find((x) => x.id === id);
    if (b) {
      b.title = title;
      if (author !== undefined) b.author = author;
    }
  },
  deleteBook: async (id) => {
    FX.books = FX.books.filter((b) => b.id !== id);
    for (const k of Object.keys(FX.collectionBooks)) {
      FX.collectionBooks[k] = FX.collectionBooks[k].filter((b) => b.id !== id);
    }
  },
  findDuplicates: async () => [],
  distinctAuthors: async () => FX.authors.map(copy),
  distinctSeries: async () => FX.series.map(copy),

  listCollections: async () => FX.collections.map(copy),
  createCollection: async (name) => {
    const c = {
      id: nid('c'), name, color: null, icon: null,
      sort_order: FX.collections.length, created_at: Date.now(), count: 0,
    };
    FX.collections.push(c);
    FX.collectionBooks[c.id] = [];
    return copy(c);
  },
  addToCollection: async (cid, bookId) => {
    const arr = FX.collectionBooks[cid] || (FX.collectionBooks[cid] = []);
    const book = FX.books.find((b) => b.id === bookId);
    if (book && !arr.some((b) => b.id === bookId)) {
      arr.push(book);
      const c = FX.collections.find((x) => x.id === cid);
      if (c) c.count = arr.length;
    }
  },
  removeFromCollection: async (cid, bookId) => {
    const arr = FX.collectionBooks[cid] || [];
    FX.collectionBooks[cid] = arr.filter((b) => b.id !== bookId);
    const c = FX.collections.find((x) => x.id === cid);
    if (c) c.count = FX.collectionBooks[cid].length;
  },
  booksInCollection: async (id) => (FX.collectionBooks[id] || []).map(copy),
  deleteCollection: async (id) => {
    FX.collections = FX.collections.filter((c) => c.id !== id);
    delete FX.collectionBooks[id];
  },

  listBookmarks: async (bookId) => FX.bookmarks.filter((m) => !bookId || m.book_id === bookId).map(copy),
  addBookmark: async (bookId, location, label) => {
    const m = { id: nid('m'), book_id: bookId, location, label, created_at: Date.now() };
    FX.bookmarks.push(m);
    return copy(m);
  },
  deleteBookmark: async (id) => {
    FX.bookmarks = FX.bookmarks.filter((m) => m.id !== id);
  },

  listQuotes: async (bookId) => FX.quotes.filter((q) => !bookId || q.book_id === bookId).map(copy),
  upsertQuote: async (q) => {
    if (q.id) {
      const ex = FX.quotes.find((x) => x.id === q.id);
      if (ex) {
        Object.assign(ex, q, { updated_at: Date.now() });
        return copy(ex);
      }
    }
    const row = { id: nid('q'), created_at: Date.now(), updated_at: Date.now(), ...q };
    FX.quotes.push(row);
    return copy(row);
  },
  deleteQuote: async (id) => {
    FX.quotes = FX.quotes.filter((q) => q.id !== id);
  },

  getReadingSettings: async () => null,
  saveReadingSettings: async () => undefined,
  logSession: async () => undefined,
  totalReadingSeconds: async () => 0,
  addDictLookup: async (word) => {
    FX.dictHistory = [
      { word, looked_up_at: Date.now() },
      ...FX.dictHistory.filter((h) => h.word !== word),
    ].slice(0, 20);
  },
  recentDictLookups: async () => FX.dictHistory.map(copy),
  kvGet: async (k) => (kv.has(k) ? kv.get(k) : null),
  kvSet: async (k, v) => { kv.set(k, v); },
  uid: () => 'shot-uid',
  now: () => Date.now(),
};

module.exports = api;
