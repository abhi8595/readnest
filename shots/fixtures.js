/** Demo library fixtures + a real generated EPUB for the reader shot. */
const os = require('os');
const path = require('path');
const fs = require('fs');
const JSZip = require('/home/user/readnest/node_modules/jszip');

const DAY = 86400000;
const T0 = Date.now();

function book(o) {
  return {
    id: 'b-x',
    file_uri: `file://${os.tmpdir()}/readnest-test/docs/placeholder.epub`,
    saf_uri: null,
    title: 'Untitled',
    author: null,
    series: null,
    series_index: null,
    format: 'epub',
    mime: null,
    file_size: 0,
    content_hash: null,
    cover_uri: null,
    description: null,
    publisher: null,
    published_year: null,
    language: 'en',
    page_count: null,
    date_added: T0 - 3 * DAY,
    date_modified: T0 - 3 * DAY,
    last_read_at: null,
    last_location: null,
    reading_progress: 0,
    is_favorite: 0,
    is_archived: 0,
    folder_path: 'Imported',
    ...o,
  };
}

const PROSE = [
  `It is a truth universally acknowledged that a reader in possession of a good library must be in want of a quiet evening. The lamp threw a warm circle over the desk, and beyond the window the rain kept up its patient argument with the glass.`,
  `She had arranged the evening with some care: the kettle just boiled, the blanket folded within reach, and the new novel waiting face-down at the exact page where the previous night had ended mid-sentence. Some interruptions, she thought, are almost a kindness — they give the story room to echo.`,
  `By the third chapter the rain had become only a rumor, and the house itself seemed to lean closer, unwilling to miss what happened next. This, more than anything, is the quiet contract between a book and its reader: one promises a elsewhere, and the other promises to follow.`,
];

async function writeEpubFixture() {
  const dir = path.join(os.tmpdir(), 'readnest-test', 'docs');
  fs.mkdirSync(dir, { recursive: true });
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0"?><package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Pride and Prejudice</dc:title><dc:creator>Jane Austen</dc:creator><dc:language>en</dc:language><dc:description>A classic novel of manners, courtship and misunderstanding in rural England.</dc:description></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/><item id="c3" href="ch3.xhtml" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/></spine></package>`,
  );
  zip.file(
    'OEBPS/toc.ncx',
    `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap><navPoint id="n1" playOrder="1"><navLabel><text>Chapter 1</text></navLabel><content src="ch1.xhtml"/></navPoint><navPoint id="n2" playOrder="2"><navLabel><text>Chapter 2</text></navLabel><content src="ch2.xhtml"/></navPoint><navPoint id="n3" playOrder="3"><navLabel><text>Chapter 3</text></navLabel><content src="ch3.xhtml"/></navPoint></navMap></ncx>`,
  );
  const titles = ['Chapter 1 — The Quiet Evening', 'Chapter 2 — An Interruption, Almost', 'Chapter 3 — The Contract'];
  titles.forEach((t, i) => {
    zip.file(
      `OEBPS/ch${i + 1}.xhtml`,
      `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${t}</title></head><body><h1>${t}</h1><p>${PROSE[i]}</p><p>${PROSE[(i + 1) % PROSE.length]}</p></body></html>`,
    );
  });
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const filePath = path.join(dir, 'shot-pride.epub');
  fs.writeFileSync(filePath, buf);
  return { filePath, fileUri: `file://${filePath}`, size: buf.length };
}

async function buildFixtures() {
  const epub = await writeEpubFixture();
  const books = [
    book({
      id: 'b-pride', file_uri: epub.fileUri, title: 'Pride and Prejudice', author: 'Jane Austen',
      format: 'epub', file_size: epub.size, reading_progress: 0.42, last_read_at: T0 - 3600000 * 3,
      last_location: 'c1', is_favorite: 1, publisher: 'T. Egerton', published_year: 1813,
      page_count: 432, folder_path: 'Classics',
      description: 'Elizabeth Bennet spars with the proud Mr. Darcy in Austen\u2019s sparkling comedy of manners.',
      date_added: T0 - 30 * DAY,
    }),
    book({
      id: 'b-time', title: 'The Time Machine', author: 'H. G. Wells', format: 'pdf',
      file_size: 812345, date_added: T0 - 12 * DAY, folder_path: 'Downloads/Sci-fi',
      description: 'A Victorian inventor hurtles to the year 802,701.',
    }),
    book({
      id: 'b-meditations', title: 'Meditations', author: 'Marcus Aurelius', format: 'txt',
      file_size: 234567, reading_progress: 0.87, last_read_at: T0 - 2 * DAY,
      date_added: T0 - 60 * DAY, folder_path: 'Philosophy',
      description: 'The private notebooks of a Roman emperor — Stoicism\u2019s founding text.',
    }),
    book({
      id: 'b-space', title: 'Space Adventures #1', author: 'R. Star', format: 'cbz',
      file_size: 12400000, reading_progress: 0.1, series: 'Space Adventures', series_index: 1,
      date_added: T0 - 5 * DAY, folder_path: 'Comics',
    }),
    book({
      id: 'b-proposal', title: 'Project Proposal Q3', author: 'Office', format: 'docx',
      file_size: 45678, date_added: T0 - 1 * DAY, folder_path: 'Work',
    }),
    book({
      id: 'b-sherlock', title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle',
      format: 'mobi', file_size: 345678, reading_progress: 0.02, date_added: T0 - 20 * DAY,
      folder_path: 'Classics',
    }),
  ];

  const quotes = [
    { id: 'q1', book_id: 'b-pride', text: 'I declare after all there is no enjoyment like reading!', note: 'Caroline Bingley, of all people.', color: '#F5C542', location: 'c0', chapter: 'Chapter 1', created_at: T0 - 2 * DAY, updated_at: T0 - 2 * DAY, book_title: 'Pride and Prejudice' },
    { id: 'q2', book_id: 'b-meditations', text: 'The impediment to action advances action. What stands in the way becomes the way.', note: null, color: '#7FB685', location: 'c0', chapter: 'Book V', created_at: T0 - 3 * DAY, updated_at: T0 - 3 * DAY, book_title: 'Meditations' },
    { id: 'q3', book_id: 'b-time', text: 'We all have our time machines, don\u2019t we. Those that take us back are memories.', note: 'Opening line energy.', color: '#E88B8B', location: 'c0', chapter: null, created_at: T0 - 4 * DAY, updated_at: T0 - 4 * DAY, book_title: 'The Time Machine' },
    { id: 'q4', book_id: 'b-pride', text: 'There is a stubbornness about me that never can bear to be frightened at the will of others.', note: null, color: '#8FA8E8', location: 'c1', chapter: 'Chapter 2', created_at: T0 - 5 * DAY, updated_at: T0 - 5 * DAY, book_title: 'Pride and Prejudice' },
  ];

  const bookmarks = [
    { id: 'm1', book_id: 'b-pride', location: 'c1', label: 'Chapter 2 — An Interruption', created_at: T0 - 1 * DAY },
    { id: 'm2', book_id: 'b-meditations', location: 'c0', label: 'Book V', created_at: T0 - 2 * DAY },
  ];

  const collections = [
    { id: 'c1', name: 'Sci-fi to read', color: null, icon: null, sort_order: 0, created_at: T0 - 10 * DAY, count: 2 },
    { id: 'c2', name: 'Classics', color: null, icon: null, sort_order: 1, created_at: T0 - 9 * DAY, count: 3 },
  ];
  const collectionBooks = {
    c1: [books[1], books[3]],
    c2: [books[0], books[2], books[5]],
  };

  const authors = [
    { author: 'Arthur Conan Doyle', count: 1 },
    { author: 'H. G. Wells', count: 1 },
    { author: 'Jane Austen', count: 1 },
    { author: 'Marcus Aurelius', count: 1 },
    { author: 'Office', count: 1 },
    { author: 'R. Star', count: 1 },
  ];
  const series = [{ series: 'Space Adventures', count: 1 }];
  const dictHistory = [
    { word: 'serendipity', looked_up_at: T0 - 1000 },
    { word: 'ephemeral', looked_up_at: T0 - 2000 },
    { word: 'quintessential', looked_up_at: T0 - 3000 },
  ];
  const stats = {
    totalSeconds: 45230, todaySeconds: 1800, weekSeconds: 12600,
    booksStarted: 4, booksFinished: 1, streakDays: 6, quotes: 4, bookmarks: 2,
  };

  return { books, quotes, bookmarks, collections, collectionBooks, authors, series, dictHistory, stats };
}

module.exports = { buildFixtures };
