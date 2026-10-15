// Tiny static server for public/ (directories → index.html). No worker routes: /api/* answers 404.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.css': 'text/css' };

export function serve(root) {
  const server = createServer(async (req, res) => {
    if (req.url.startsWith('/api/newsletter/status')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true,"enabled":false}'); }
    try {
      let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
      let f = join(root, p);
      if ((await stat(f).catch(() => null))?.isDirectory()) f = join(f, 'index.html');
      const body = await readFile(f);
      res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
      res.end(body);
    } catch (e) { res.writeHead(404); res.end('not found'); }
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}
