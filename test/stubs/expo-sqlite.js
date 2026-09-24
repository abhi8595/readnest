/**
 * Node SQLite adapter for expo-sqlite using node:sqlite (available in Node 22+).
 * Runs real SQL against a local database so tests can verify migrations,
 * repositories, queries, triggers, and sync snapshots accurately.
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const os = require('os');

const dbs = new Map();

function openDatabaseAsync(name) {
  const safeName = (name || 'readnest.db').replace(/[^\w.-]+/g, '_');
  const dbPath = path.join(os.tmpdir(), `readnest-test-${safeName}`);
  if (!dbs.has(dbPath)) {
    const raw = new DatabaseSync(dbPath);
    dbs.set(dbPath, {
      async execAsync(sql) {
        raw.exec(sql);
      },
      async runAsync(sql, params = []) {
        const stmt = raw.prepare(sql);
        const info = stmt.run(...params);
        return { changes: info.changes, lastInsertRowId: Number(info.lastInsertRowid) };
      },
      async getFirstAsync(sql, params = []) {
        const stmt = raw.prepare(sql);
        return stmt.get(...params) ?? null;
      },
      async getAllAsync(sql, params = []) {
        const stmt = raw.prepare(sql);
        return stmt.all(...params);
      },
      async closeAsync() {
        raw.close();
        dbs.delete(dbPath);
      },
    });
  }
  return Promise.resolve(dbs.get(dbPath));
}

module.exports = { openDatabaseAsync };
