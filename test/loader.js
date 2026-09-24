/**
 * Test loader — runs the app's pure-TS libraries (parsers, reader HTML,
 * TTS splitting) under plain node:test with zero new dependencies.
 *
 * - Transpiles src TS files on require via the TypeScript compiler API
 *   (typescript is already a devDependency).
 * - Maps '@/*' to src/*.
 * - Maps Expo native modules to node-compatible stubs in test/stubs/.
 *
 * Real node_modules used: jszip, fast-xml-parser, typescript.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const STUBS = {
  'expo-file-system': path.join(__dirname, 'stubs', 'expo-file-system.js'),
  'expo-crypto': path.join(__dirname, 'stubs', 'expo-crypto.js'),
  'expo-speech': path.join(__dirname, 'stubs', 'expo-speech.js'),
  'expo-sqlite': path.join(__dirname, 'stubs', 'expo-sqlite.js'),
  'react-native': path.join(__dirname, 'stubs', 'react-native.js'),
  'readnest-tts': path.join(__dirname, 'stubs', 'readnest-tts.js'),
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (STUBS[request]) return STUBS[request];
  if (request.startsWith('@/')) {
    const rel = request.slice(2);
    const candidates = [
      path.join(SRC, `${rel}.ts`),
      path.join(SRC, `${rel}.tsx`),
      path.join(SRC, rel, 'index.ts'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  try {
    return origResolve.call(this, request, parent, ...rest);
  } catch (e) {
    if (parent && request.startsWith('.')) {
      const dir = path.dirname(parent.filename);
      for (const ext of ['.ts', '.tsx']) {
        const c = path.join(dir, `${request}${ext}`);
        if (fs.existsSync(c)) return c;
      }
    }
    throw e;
  }
};

function compileTs(m, filename) {
  const src = fs.readFileSync(filename, 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
    fileName: filename,
  });
  const errors = (diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    const msg = errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ');
    throw new Error(`TS transpile failed for ${filename}: ${msg}`);
  }
  m._compile(outputText, filename);
}

require.extensions['.ts'] = compileTs;
require.extensions['.tsx'] = compileTs;
