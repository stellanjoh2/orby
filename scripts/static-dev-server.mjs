/**
 * Zero-dependency static server for local dev (replaces python -m http.server).
 * Usage: npm run dev   → http://127.0.0.1:8000/
 *
 * Mobile routes (see repo `mobile/` — landing symlink + app symlink):
 *   /mobile      → marketing landing (mobile/index.html → index.html)
 *   /mobile/app  → 3D viewer (mobile/app → apps/mobile)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectAllSubpageSiteNav } from './marketing/injectSubpageSiteNav.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mobileLandingFile = path.join(root, 'mobile', 'index.html');
const mobileAppRoot = path.join(root, 'mobile', 'app');
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
  const rel = path
    .normalize(decoded)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^[/\\]+/, '');
  if (!rel) return null;
  const abs = path.join(base, rel);
  const normalizedBase = path.resolve(base);
  const normalizedAbs = path.resolve(abs);
  if (!normalizedAbs.startsWith(normalizedBase + path.sep) && normalizedAbs !== normalizedBase) {
    return null;
  }
  return normalizedAbs;
}

/** @param {string} urlPath */
function resolveFilePath(urlPath) {
  if (urlPath === '/mobile' || urlPath === '/mobile/') {
    return mobileLandingFile;
  }
  if (urlPath === '/mobile/app' || urlPath === '/mobile/app/') {
    return path.join(mobileAppRoot, 'index.html');
  }
  if (urlPath.startsWith('/mobile/app/')) {
    const rel = urlPath.slice('/mobile/app/'.length);
    return rel ? safeJoin(mobileAppRoot, rel) : path.join(mobileAppRoot, 'index.html');
  }
  if (urlPath === '/') {
    return path.join(root, 'index.html');
  }
  return safeJoin(root, urlPath.replace(/^\//, ''));
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  const urlPath = req.url.split('?')[0];

  if (urlPath === '/mobile/app') {
    res.writeHead(301, { Location: '/mobile/app/' });
    res.end();
    return;
  }

  const filePath = resolveFilePath(urlPath);
  if (!filePath) {
    res.writeHead(403);
    res.end();
    return;
  }

  try {
    let resolved = filePath;
    let st = await fs.promises.stat(resolved).catch(() => null);
    if (st?.isDirectory()) {
      resolved = path.join(resolved, 'index.html');
      st = await fs.promises.stat(resolved).catch(() => null);
    }
    if (!st?.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    const marketingRel = resolved.includes(`${path.sep}assets${path.sep}marketing${path.sep}`)
      ? resolved.split(`${path.sep}assets${path.sep}marketing${path.sep}`)[1]
      : '';
    const isLongCacheMarketingAsset =
      Boolean(marketingRel) &&
      /\.(webp|jpe?g|png)$/i.test(ext) &&
      (marketingRel.startsWith('toyotagr_') ||
        /^intro-turntable-poster\.(webp|jpe?g)$/i.test(marketingRel));
    res.setHeader(
      'Cache-Control',
      isLongCacheMarketingAsset ? 'public, max-age=31536000, immutable' : 'no-store',
    );

    if (req.method === 'HEAD') {
      res.writeHead(200);
      res.end();
      return;
    }

    const body = await fs.promises.readFile(resolved);
    res.writeHead(200);
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end();
  }
});

server.listen(port, '0.0.0.0', () => {
  try {
    const { updated } = injectAllSubpageSiteNav({ root });
    if (updated > 0) {
      console.log(`Injected subpage site nav into ${updated} HTML file(s)`);
    }
  } catch (err) {
    console.warn('[Orby] Subpage nav inject skipped:', err?.message || err);
  }
  console.log(`Orby dev server → http://127.0.0.1:${port}/`);
  console.log(`Orby mobile landing → http://127.0.0.1:${port}/mobile`);
  console.log(`Orby mobile viewer  → http://127.0.0.1:${port}/mobile/app/  (Ctrl+C to stop)`);
});
