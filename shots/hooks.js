/**
 * Module hooks for the screenshot harness:
 * - react-native → react-native-web (real layout engine)
 * - @/ + relative .ts/.tsx → transpile on the fly (real app code)
 * - expo-* / native modules → stubs (see shots/stubs/)
 * - repositories / db client → fixture stubs
 *
 * Set SHOT_SVG=stub to render lucide icons through a DOM svg shim
 * instead of the real react-native-svg (identical vector paths).
 */
const Module = require('module');
const path = require('path');
const fs = require('fs');

const ROOT = '/home/user/readnest';
const SHOTS_MODS = '/tmp/shots/node_modules';
const ts = require(path.join(ROOT, 'node_modules', 'typescript'));

const expoStubs = require('./stubs/expo');
const nativeStubs = require('./stubs/native');
const routerStub = require('./stubs/router');
const reposStub = require('./stubs/repositories');
const svgStub = require('./stubs/svg');
const safeAreaStub = require('./stubs/safearea');

const origLoad = Module._load;

function loadTs(filename, parent) {
  if (require.cache[filename]) return require.cache[filename].exports;
  const src = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
    fileName: filename,
  });
  const m = new Module(filename, parent);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  require.cache[filename] = m;
  m._compile(outputText, filename);
  return m.exports;
}

function resolveAppTs(request, parentDir) {
  let rel;
  if (request.startsWith('@/')) rel = `src/${request.slice(2)}`;
  else if (request.startsWith('.')) rel = path.relative(ROOT, path.resolve(parentDir, request));
  else return null;
  const base = path.join(ROOT, rel);
  for (const cand of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(cand)) return cand;
  }
  return null;
}

const fakeDb = {
  getAllAsync: async () => [],
  getFirstAsync: async () => null,
  runAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
  execAsync: async () => undefined,
  withTransactionAsync: async (fn) => fn(),
};
const dbClientStub = {
  getDb: async () => fakeDb,
  resetDb: async () => undefined,
};

Module._load = function hookedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return origLoad.call(this, path.join(SHOTS_MODS, 'react-native-web'), parent, isMain);
  }
  if (request === 'expo-router') return routerStub;
  if (request === '@/db/repositories') return reposStub;
  if (request === '@/db/client') return dbClientStub;
  if (request === '@/lib/stats') {
    const real = loadTs(path.join(ROOT, 'src', 'lib', 'stats.ts'), parent);
    return { ...real, getReadingStats: reposStub.__getStats };
  }
  if (request === 'react-native-safe-area-context') return safeAreaStub;
  if (request === 'readnest-tts') {
    return loadTs(path.join(ROOT, 'modules', 'readnest-tts', 'src', 'index.ts'), parent);
  }
  if (request === 'expo-file-system') {
    return origLoad.call(this, path.join(ROOT, 'test', 'stubs', 'expo-file-system.js'), parent, isMain);
  }
  if (request === 'react-native-svg' && process.env.SHOT_SVG === 'stub') return svgStub;
  if (request.startsWith('@expo-google-fonts/')) {
    return new Proxy({}, { get: () => 0 });
  }
  if (Object.prototype.hasOwnProperty.call(expoStubs, request)) return expoStubs[request];
  if (Object.prototype.hasOwnProperty.call(nativeStubs, request)) {
    const s = nativeStubs[request];
    if (s === 'THROW') throw new Error(`shots: native module unavailable (${request})`);
    return typeof s === 'function' ? s() : s;
  }
  if (request === 'react-native' || request.startsWith('react-native/')) {
    console.log('DEEP-RN:', request, 'from', parent && parent.filename);
  }
  if (/\.(png|jpe?g|webp|gif)$/i.test(request.split('?')[0])) {
    const assetDir = parent && parent.filename ? path.dirname(parent.filename) : ROOT;
    const abs = request.startsWith('@/') ? path.join(ROOT, request.slice(2)) : path.resolve(assetDir, request);
    if (!fs.existsSync(abs)) throw new Error(`shots: image asset not found (${request})`);
    const ext = path.extname(abs).slice(1).toLowerCase().replace('jpg', 'jpeg');
    return { uri: `data:image/${ext};base64,${fs.readFileSync(abs).toString('base64')}` };
  }
  if (request.startsWith('@/') || request.startsWith('.')) {
    const parentDir = parent && parent.filename ? path.dirname(parent.filename) : ROOT;
    const tsFile = resolveAppTs(request, parentDir);
    if (tsFile) return loadTs(tsFile, parent);
  }
  return origLoad.call(this, request, parent, isMain);
};

module.exports = { loadTs, routerStub, reposStub, ROOT, SHOTS_MODS };
