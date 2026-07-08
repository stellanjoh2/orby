/**
 * Import Shape Library thumbnails from source PNGs (center-crop + resize).
 *
 * Drop screenshots into assets/images/shape-library-sources/ named by shape id:
 *   cube.png, cone.png, pipe.png
 *
 * Usage:
 *   node scripts/dev/importShapeLibraryThumbnails.mjs
 *   node scripts/dev/importShapeLibraryThumbnails.mjs /path/to/sources --size 128
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHAPE_LIBRARY_BAKEABLE_IDS } from '../shapeLibrary/shapeLibraryCatalog.js';
import { processShapeLibraryThumbnail } from './processShapeLibraryThumbnail.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const defaultSourcesDir = path.join(root, 'assets', 'images', 'shape-library-sources');
const outDir = path.join(root, 'assets', 'images');

function parseArgs(argv) {
  let sourcesDir = defaultSourcesDir;
  let size = 128;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--size') {
      size = Number(argv[i + 1] || 128);
      i += 1;
      continue;
    }
    if (!arg.startsWith('-')) {
      sourcesDir = path.resolve(arg);
    }
  }

  return { sourcesDir, size };
}

const { sourcesDir, size } = parseArgs(process.argv);

await fs.mkdir(sourcesDir, { recursive: true });

const results = [];
let missing = 0;

for (const shapeId of SHAPE_LIBRARY_BAKEABLE_IDS) {
  const candidates = [
    path.join(sourcesDir, `${shapeId}.png`),
    path.join(sourcesDir, `${shapeId}.PNG`),
  ];

  let sourcePath = null;
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      sourcePath = candidate;
      break;
    } catch {
      /* try next */
    }
  }

  if (!sourcePath) {
    missing += 1;
    results.push({ shapeId, ok: false, error: `Missing source: ${shapeId}.png` });
    continue;
  }

  const pngBuffer = await fs.readFile(sourcePath);
  const saved = await processShapeLibraryThumbnail({
    pngBuffer,
    shapeId,
    size,
    outDir,
  });

  results.push({
    shapeId,
    ok: true,
    source: path.relative(root, sourcePath),
    filename: saved.filename,
    bytes: saved.bytes,
    thumbSize: saved.thumbSize,
  });
  console.log(`[Orby] ${saved.filename} ← ${path.relative(root, sourcePath)} (${saved.bytes} B)`);
}

const savedCount = results.filter((r) => r.ok).length;
console.log(`[Orby] Imported ${savedCount}/${SHAPE_LIBRARY_BAKEABLE_IDS.length} shape thumbnails.`);

if (missing > 0) {
  console.log(
    `[Orby] Add missing sources to ${path.relative(root, sourcesDir)}/` +
      ` (${SHAPE_LIBRARY_BAKEABLE_IDS.join(', ')}.png)`,
  );
}

if (savedCount === 0) {
  process.exitCode = 1;
}
