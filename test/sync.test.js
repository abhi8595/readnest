require('./loader');
const test = require('node:test');
const assert = require('node:assert/strict');
const { findLocalBookId, isConflict } = require('../src/lib/drive');
const { lastSyncBaseline } = require('../src/lib/syncHealth');

test('sync A3: book identity prefers id, falls back to hash', () => {
  const ids = new Set(['a', 'b']);
  const hashes = new Map([['h1', 'b']]);
  assert.deepEqual(findLocalBookId(ids, hashes, { id: 'a', content_hash: 'hx' }), { id: 'a', viaHash: false });
  assert.deepEqual(findLocalBookId(ids, hashes, { id: 'zzz', content_hash: 'h1' }), { id: 'b', viaHash: true });
  assert.equal(findLocalBookId(ids, hashes, { id: 'zzz', content_hash: 'nope' }), null);
  assert.equal(findLocalBookId(ids, hashes, { id: 'zzz' }), null);
});

test('sync A3: conflict means both sides changed and remote is newer', () => {
  const since = 1000;
  assert.equal(isConflict(1500, 2000, since), true);
  assert.equal(isConflict(500, 2000, since), false); // local predates last sync
  assert.equal(isConflict(1500, 1200, since), false); // remote older — plain LWW
  assert.equal(isConflict(1500, 2000, undefined), false); // never synced — no baseline
});

test('sync A2: baseline is the newest backend sync', () => {
  const h = (d, w) => ({
    drive: { lastSyncAt: d, lastMerged: 0, lastError: null, lastConflicts: 0 },
    webdav: { lastSyncAt: w, lastMerged: 0, lastError: null, lastConflicts: 0 },
    pendingOps: 0,
  });
  assert.equal(lastSyncBaseline(h(100, 200)), 200);
  assert.equal(lastSyncBaseline(h(null, null)), undefined);
});
