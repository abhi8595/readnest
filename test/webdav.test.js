require('./loader');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeBaseUrl, normalizePath, webdavFileUrl, webdavParentUrls,
  WebdavError, isWebdavAuthError,
} = require('../src/lib/webdav');

const cfg = { baseUrl: 'https://cloud.example.com/remote.php/dav/files/user/', username: 'u', password: 'p', path: 'ReadNest' };

test('webdav: base url + path normalization', () => {
  assert.equal(normalizeBaseUrl('https://a.b/c/'), 'https://a.b/c');
  assert.equal(normalizePath('/ReadNest//x/'), 'ReadNest/x');
  assert.throws(() => normalizeBaseUrl('not a url'), WebdavError);
  assert.throws(() => normalizeBaseUrl('ftp://x'), WebdavError);
});

test('webdav: file url + parent chain', () => {
  assert.equal(webdavFileUrl(cfg), 'https://cloud.example.com/remote.php/dav/files/user/ReadNest/readnest-backup.json');
  assert.equal(webdavFileUrl({ ...cfg, path: '' }), 'https://cloud.example.com/remote.php/dav/files/user/readnest-backup.json');
  assert.deepEqual(webdavParentUrls(cfg), [
    'https://cloud.example.com/remote.php/dav/files/user/ReadNest/',
  ]);
  assert.deepEqual(webdavParentUrls({ ...cfg, path: 'a/b' }), [
    'https://cloud.example.com/remote.php/dav/files/user/a/',
    'https://cloud.example.com/remote.php/dav/files/user/a/b/',
  ]);
  assert.deepEqual(webdavParentUrls({ ...cfg, path: '' }), []);
});

test('webdav: auth error classification', () => {
  assert.equal(isWebdavAuthError(new WebdavError('x', 401)), true);
  assert.equal(isWebdavAuthError(new WebdavError('x', 500)), false);
  assert.equal(isWebdavAuthError(new Error('x')), false);
});

test('webdav: missing credentials fail before network', async () => {
  const { pushToWebdav, pullFromWebdav } = require('../src/lib/webdav');
  await assert.rejects(() => pushToWebdav({ ...cfg, password: '' }), WebdavError);
  await assert.rejects(() => pullFromWebdav({ ...cfg, username: '  ' }), WebdavError);
});

test('webdav: pull 404 means no remote backup', async () => {
  const { pullFromWebdav } = require('../src/lib/webdav');
  const orig = global.fetch;
  global.fetch = async () => ({ ok: false, status: 404 });
  try {
    assert.equal(await pullFromWebdav(cfg), null);
  } finally {
    global.fetch = orig;
  }
});

test('webdav: pull rejects version-mismatched snapshots', async () => {
  const { pullFromWebdav } = require('../src/lib/webdav');
  const orig = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ version: 99 }) });
  try {
    await assert.rejects(() => pullFromWebdav(cfg), WebdavError);
  } finally {
    global.fetch = orig;
  }
});
