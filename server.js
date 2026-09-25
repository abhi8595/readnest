const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const HOST = '0.0.0.0';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

const screens = [
  { id: '01-onboarding', name: 'Onboarding Welcome', file: '01-onboarding.html', img: '01-onboarding.png' },
  { id: '02-library', name: 'Main Library (Paper)', file: '02-library.html', img: '02-library.png' },
  { id: '03-library-dark', name: 'Main Library (Dark / Ember)', file: '03-library-dark.html', img: '03-library-dark.png' },
  { id: '04-folders', name: 'Folder Navigation', file: '04-folders.html', img: '04-folders.png' },
  { id: '05-search', name: 'Search Screen', file: '05-search.html', img: '05-search.png' },
  { id: '06-notes', name: 'Notes & Highlights', file: '06-notes.html', img: '06-notes.png' },
  { id: '07-settings', name: 'Settings & Cloud Sync', file: '07-settings.html', img: '07-settings.png' },
  { id: '08-book', name: 'Book Details Sheet', file: '08-book.html', img: '08-book.png' },
  { id: '09-collection', name: 'Shelf / Collection', file: '09-collection.html', img: '09-collection.png' },
  { id: '10-dictionary', name: 'Dictionary Lookup', file: '10-dictionary.html', img: '10-dictionary.png' },
  { id: '11-paywall', name: 'Premium Paywall', file: '11-paywall.html', img: '11-paywall.png' },
  { id: '12-reader', name: 'Editorial Reader', file: '12-reader.html', img: '12-reader.png' },
  { id: '13-reader-chrome', name: 'Reader with Chrome & TTS', file: '13-reader-chrome.html', img: '13-reader-chrome.png' },
];

function screensIndexHtml() {
  const cards = screens.map((s) => `
    <div style="background:#26221D;border:1px solid #3A342C;border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px">
      <div style="font-weight:700;font-size:16px;color:#F3EDE2">${s.name}</div>
      <a href="/shots/preview/${s.file}" target="_blank" style="text-decoration:none;display:block;border-radius:12px;overflow:hidden;border:1px solid #3A342C;background:#1C1A17">
        <img src="/shots/preview/${s.img}" alt="${s.name}" style="width:100%;display:block;object-fit:cover;max-height:420px" loading="lazy" />
      </a>
      <div style="display:flex;gap:10px;margin-top:auto">
        <a href="/shots/preview/${s.file}" style="flex:1;text-align:center;background:#E3C178;color:#1C1A17;padding:10px;border-radius:8px;font-weight:700;text-decoration:none;font-size:13px">Open Rendered HTML</a>
        <a href="/shots/preview/${s.img}" target="_blank" style="text-align:center;background:rgba(255,255,255,0.08);color:#F3EDE2;padding:10px 14px;border-radius:8px;text-decoration:none;font-size:13px">PNG</a>
      </div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>ReadNest — High Fidelity Screen Gallery</title>
  <style>
    body { margin:0; background:#141110; color:#F3EDE2; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
    .header { padding:24px 32px; border-bottom:1px solid #3A342C; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px }
    .nav-btn { display:inline-flex; align-items:center; gap:8px; padding:10px 18px; border-radius:10px; font-weight:700; text-decoration:none; font-size:14px; border:1px solid rgba(201,164,92,0.5); color:#F3EDE2; background:rgba(255,255,255,0.06); }
    .nav-btn.gold { background:linear-gradient(120deg,#E3C178,#C9A45C); color:#1C1A17; border:none; }
    .grid { max-width:1240px; margin:0 auto; padding:32px 24px; display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:24px; }
  </style>
</head>
<body>
  <header class="header">
    <div>
      <h1 style="margin:0 0 4px;font-size:24px;font-weight:700">ReadNest Screen Gallery</h1>
      <p style="margin:0;color:#9A9081;font-size:14px">Direct captures from React Native components rendered through react-native-web</p>
    </div>
    <div style="display:flex;gap:12px">
      <a href="/" class="nav-btn gold">← Interactive Simulator</a>
    </div>
  </header>
  <main class="grid">
    ${cards}
  </main>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  // CORS and iframe embedding headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let reqPath = req.url ? req.url.split('?')[0] : '/';

  if (reqPath === '/screens' || reqPath === '/gallery') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(screensIndexHtml());
    return;
  }

  if (reqPath === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', app: 'ReadNest', timestamp: Date.now() }));
    return;
  }

  let filePath = path.join(__dirname, reqPath === '/' ? 'preview.html' : reqPath);

  // Safety check to prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fall back to preview.html if route not found
      if (reqPath === '/preview' || reqPath === '/index.html') {
        filePath = path.join(__dirname, 'preview.html');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // If serving preview.html, inject a stylish top banner with link to Screen Gallery
    if (ext === '.html' && path.basename(filePath) === 'preview.html') {
      fs.readFile(filePath, 'utf8', (readErr, content) => {
        if (readErr) {
          res.writeHead(500);
          res.end('Error loading preview');
          return;
        }

        const banner = `
<div style="background:linear-gradient(90deg,#241D16,#171310);border-bottom:1px solid rgba(201,164,92,0.3);padding:10px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.4)">
  <div style="display:flex;align-items:center;gap:12px">
    <div style="width:10px;height:10px;border-radius:5px;background:#7C9070;box-shadow:0 0 8px #7C9070"></div>
    <span style="font-family:-apple-system,sans-serif;font-size:13px;font-weight:700;color:#F3EDE2">ReadNest Interactive Preview Live</span>
    <span style="font-family:-apple-system,sans-serif;font-size:11px;background:rgba(201,164,92,0.18);border:1px solid rgba(201,164,92,0.4);color:#E3C178;border-radius:999px;padding:3px 10px;font-weight:700">App Active</span>
  </div>
  <div style="display:flex;gap:10px">
    <a href="/screens" style="font-family:-apple-system,sans-serif;font-size:12px;font-weight:700;color:#1C1A17;background:linear-gradient(120deg,#E3C178,#C9A45C);padding:6px 14px;border-radius:8px;text-decoration:none;box-shadow:0 2px 8px rgba(201,164,92,0.3)">View All 13 Screens →</a>
  </div>
</div>
`;
        const modified = content.replace('<body class="ui">', '<body class="ui">\n' + banner);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(modified);
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`ReadNest Preview Server running on http://${HOST}:${PORT}`);
});
