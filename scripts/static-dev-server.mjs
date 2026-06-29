/**
 * Zero-dependency static server for local dev (replaces python -m http.server).
 * Usage: npm run dev   → http://127.0.0.1:8000/
 *
 * Mobile routes:
 *   /mobile        → minimal gate (apps/mobile/landing)
 *   /mobile/learn  → full marketing scroll (index.html)
 *   /mobile/app    → 3D viewer (apps/mobile)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectAllSubpageSiteNav } from './marketing/injectSubpageSiteNav.mjs';
import { processCreativeLookThumbnail } from './dev/processCreativeLookThumbnail.mjs';
import { stitchIndexHtml } from './stitchIndexHtml.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mobileGateRoot = path.join(root, 'apps', 'mobile', 'landing');
const mobileLearnRoot = path.join(root, 'apps', 'mobile', 'learn');
const mobileGateSymlink = path.join(root, 'mobile', 'index.html');
const mobileAppRoot = path.join(root, 'apps', 'mobile');
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
    if (fs.existsSync(mobileGateRoot)) {
      return path.join(mobileGateRoot, 'index.html');
    }
    if (fs.existsSync(mobileGateSymlink)) {
      return fs.realpathSync(mobileGateSymlink);
    }
    return null;
  }
  if (urlPath === '/mobile/learn' || urlPath === '/mobile/learn/') {
    if (fs.existsSync(path.join(mobileLearnRoot, 'index.html'))) {
      return path.join(mobileLearnRoot, 'index.html');
    }
    return path.join(root, 'index.html');
  }
  if (urlPath === '/scripts/mobileLearnBoot.js') {
    const distBoot = path.join(root, 'dist', 'scripts', 'mobileLearnBoot.js');
    if (fs.existsSync(distBoot)) return distBoot;
    return path.join(root, 'scripts', 'mobileLearnBoot.js');
  }
  if (urlPath.startsWith('/mobile/scripts/landing.js')) {
    return path.join(mobileGateRoot, 'main.js');
  }
  if (urlPath.startsWith('/mobile/styles/landing.css')) {
    return path.join(mobileGateRoot, 'landing.css');
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

const DEV_THUMB_PATH = '/__dev__/creative-look-thumbnail';
const DEV_THUMB_OUT_DIR = path.join(root, 'assets', 'images');

/** @param {import('node:http').IncomingMessage} req @param {number} [limitBytes] */
function readRequestBody(req, limitBytes = 24 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** @param {import('node:http').IncomingMessage} req */
function isLocalDevRequest(req) {
  const remote = req.socket?.remoteAddress ?? '';
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
}

/** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
async function handleCreativeLookThumbnailUpload(req, res) {
  if (!isLocalDevRequest(req)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Dev thumbnail endpoint is localhost-only.');
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const preset = url.searchParams.get('preset') ?? '';
  const size = Number(url.searchParams.get('size') || 128);

  try {
    const pngBuffer = await readRequestBody(req);
    if (!pngBuffer.length) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Empty PNG body.');
      return;
    }

    const saved = await processCreativeLookThumbnail({
      pngBuffer,
      preset,
      size,
      outDir: DEV_THUMB_OUT_DIR,
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        filename: saved.filename,
        bytes: saved.bytes,
        thumbSize: saved.thumbSize,
        relativePath: `assets/images/${saved.filename}`,
      }),
    );
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(err?.message || 'Thumbnail processing failed.');
  }
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url?.split('?')[0] ?? '/';

  if (urlPath === DEV_THUMB_PATH && req.method === 'POST') {
    await handleCreativeLookThumbnailUpload(req, res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD, POST' });
    res.end();
    return;
  }

  if (urlPath === '/mobile') {
    res.writeHead(301, { Location: '/mobile/' });
    res.end();
    return;
  }

  if (urlPath === '/mobile/learn') {
    res.writeHead(301, { Location: '/mobile/learn/' });
    res.end();
    return;
  }

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

    let body = await fs.promises.readFile(resolved);
    if (ext === '.html' && body.includes('@include')) {
      body = Buffer.from(stitchIndexHtml(body.toString('utf-8'), root), 'utf-8');
    }
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
  console.log(`Orby mobile gate    → http://127.0.0.1:${port}/mobile`);
  console.log(`Orby mobile learn   → http://127.0.0.1:${port}/mobile/learn`);
  console.log(`Orby mobile viewer   → http://127.0.0.1:${port}/mobile/app/  (Ctrl+C to stop)`);
  console.log(
    'Creative look thumbs → load a mesh, frame the shot, then in the browser console:\n' +
      '  await orby.dev.bakeCreativeLookThumbnails()',
  );
});
