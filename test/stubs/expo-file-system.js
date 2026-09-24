/** Node fs adapter for the expo-file-system surface the parsers use. */
const fs = require('fs/promises');
const fss = require('fs');
const path = require('path');
const os = require('os');

const ROOT_TMP = path.join(os.tmpdir(), 'readnest-test');
const documentDirectory = `${ROOT_TMP}/docs/`;
const cacheDirectory = `${ROOT_TMP}/cache/`;
for (const d of [documentDirectory, cacheDirectory]) fss.mkdirSync(d, { recursive: true });

const EncodingType = { UTF8: 'utf8', Base64: 'base64' };

/** v56 surface: Paths + File (Blob size). */
const Paths = {
  document: { uri: `file://${documentDirectory}` },
  cache: { uri: `file://${cacheDirectory}` },
};

class File {
  constructor(uri) {
    this.uri = typeof uri === 'string' ? uri : String(uri?.uri ?? uri);
  }
  get size() {
    try {
      return fss.statSync(p(this.uri)).size;
    } catch {
      return 0;
    }
  }
}

function p(uri) {
  return uri.startsWith('file://') ? uri.slice(7) : uri;
}

async function readAsStringAsync(uri, opts = {}) {
  const buf = await fs.readFile(p(uri));
  const position = opts.position ?? 0;
  const length = opts.length ?? buf.length;
  const slice = buf.subarray(position, position + length);
  return opts.encoding === EncodingType.Base64 ? slice.toString('base64') : slice.toString('utf8');
}

async function writeAsStringAsync(dest, contents, opts = {}) {
  await fs.mkdir(path.dirname(p(dest)), { recursive: true });
  const buf = opts.encoding === EncodingType.Base64
    ? Buffer.from(contents, 'base64')
    : Buffer.from(contents, 'utf8');
  await fs.writeFile(p(dest), buf);
}

async function copyAsync({ from, to }) {
  await fs.mkdir(path.dirname(p(to)), { recursive: true });
  await fs.copyFile(p(from), p(to));
}

async function deleteAsync(uri, { idempotent } = {}) {
  try {
    await fs.rm(p(uri), { recursive: true, force: true });
  } catch (e) {
    if (!idempotent) throw e;
  }
}

async function getInfoAsync(uri, { size } = {}) {
  try {
    const st = await fs.stat(p(uri));
    return { exists: true, uri, size: size ? st.size : st.size, isDirectory: st.isDirectory() };
  } catch {
    return { exists: false, uri, size: 0, isDirectory: false };
  }
}

async function makeDirectoryAsync(uri) {
  await fs.mkdir(p(uri), { recursive: true });
}

async function readDirectoryAsync(uri) {
  const entries = await fs.readdir(p(uri));
  return entries.map((e) => path.join(p(uri), e));
}

module.exports = {
  documentDirectory,
  cacheDirectory,
  EncodingType,
  Paths,
  File,
  readAsStringAsync,
  writeAsStringAsync,
  copyAsync,
  deleteAsync,
  getInfoAsync,
  makeDirectoryAsync,
  readDirectoryAsync,
};
