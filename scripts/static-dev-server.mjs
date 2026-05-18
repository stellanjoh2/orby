/**
 * Zero-dependency static server for local dev (replaces python -m http.server).
 * Usage: npm run dev   → http://127.0.0.1:8000/
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function safeJoin(base, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const rel = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
  const abs = path.join(base, rel);
  if (!abs.startsWith(base)) return null;
  return abs;
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  let filePath = safeJoin(root, req.url === '/' ? '/index.html' : req.url);
  if (!filePath) {
    res.writeHead(403);
    res.end();
    return;
  }

  try {
    let st = await fs.promises.stat(filePath).catch(() => null);
    if (st?.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      st = await fs.promises.stat(filePath).catch(() => null);
    }
    if (!st?.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    const isTurntableAsset =
      filePath.includes(`${path.sep}assets${path.sep}marketing${path.sep}`) &&
      /\.(webp|jpe?g|png)$/i.test(ext);
    res.setHeader(
      'Cache-Control',
      isTurntableAsset
        ? 'public, max-age=31536000, immutable'
        : 'no-store',
    );

    if (req.method === 'HEAD') {
      res.writeHead(200);
      res.end();
      return;
    }

    const body = await fs.promises.readFile(filePath);
    res.writeHead(200);
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end();
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Orby dev server → http://127.0.0.1:${port}/  (Ctrl+C to stop)`);
});
