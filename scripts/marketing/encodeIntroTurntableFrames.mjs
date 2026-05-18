/**
 * Encode intro turntable PNGs → WebP + JPEG for web delivery (Apple-style).
 *
 * Usage:
 *   npm run encode:turntable
 *   node scripts/marketing/encodeIntroTurntableFrames.mjs --quality 82
 *
 * Requires: npm install (sharp in devDependencies).
 * Output: assets/marketing/<sourceFolder>_web/ (+ poster next to marketing/)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const SOURCE_DIR =
  'assets/marketing/toyotagr_supra_gt300__www_vecarz_com_turntable_5s_60fps_1spin_1440p';
const NAME_PREFIX = 'toyotagr_supra_gt300__www_vecarz_com_turntable_5s_';
const FRAME_COUNT = 300;
const PAD = 4;
const POSTER_FRAME = 60;
const POSTER_BASENAME = 'intro-turntable-poster';

function parseArgs(argv) {
  let quality = 82;
  let concurrency = 6;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--quality' && argv[i + 1]) quality = Number(argv[++i]);
    else if (argv[i] === '--concurrency' && argv[i + 1]) {
      concurrency = Number(argv[++i]);
    }
  }
  return { quality, concurrency };
}

function frameBaseName(index) {
  return `${NAME_PREFIX}${String(index).padStart(PAD, '0')}`;
}

async function listSourceFrames(sourceAbs) {
  const names = await fs.readdir(sourceAbs);
  const indices = names
    .filter((n) => n.startsWith(NAME_PREFIX) && n.endsWith('.png'))
    .map((n) => {
      const num = Number(n.slice(NAME_PREFIX.length, -4));
      return Number.isFinite(num) ? num : 0;
    })
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  return indices.length ? indices : Array.from({ length: FRAME_COUNT }, (_, i) => i + 1);
}

async function encodeOne(sharpSrc, outWebp, outJpeg, quality) {
  await Promise.all([
    sharp(sharpSrc).webp({ quality, effort: 4 }).toFile(outWebp),
    sharp(sharpSrc).jpeg({ quality, mozjpeg: true }).toFile(outJpeg),
  ]);
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const { quality, concurrency } = parseArgs(process.argv);
  const sourceAbs = path.join(repoRoot, SOURCE_DIR);
  const outDirName = `${path.basename(SOURCE_DIR)}_web`;
  const outAbs = path.join(repoRoot, 'assets/marketing', outDirName);
  const marketingAbs = path.join(repoRoot, 'assets/marketing');

  await fs.mkdir(outAbs, { recursive: true });

  const indices = await listSourceFrames(sourceAbs);
  let totalWebp = 0;
  let totalJpeg = 0;

  console.log(`Encoding ${indices.length} frames → ${outDirName}/ (q${quality})`);

  await runPool(indices, concurrency, async (index) => {
    const base = frameBaseName(index);
    const src = path.join(sourceAbs, `${base}.png`);
    const outWebp = path.join(outAbs, `${base}.webp`);
    const outJpeg = path.join(outAbs, `${base}.jpg`);
    await encodeOne(src, outWebp, outJpeg, quality);
    const [wSt, jSt] = await Promise.all([fs.stat(outWebp), fs.stat(outJpeg)]);
    totalWebp += wSt.size;
    totalJpeg += jSt.size;
    if (index % 25 === 0 || index === indices[0] || index === indices.at(-1)) {
      console.log(`  ${base} → webp ${(wSt.size / 1024).toFixed(0)} KB, jpg ${(jSt.size / 1024).toFixed(0)} KB`);
    }
  });

  const posterSrc = path.join(sourceAbs, `${frameBaseName(POSTER_FRAME)}.png`);
  const posterWebp = path.join(marketingAbs, `${POSTER_BASENAME}.webp`);
  const posterJpg = path.join(marketingAbs, `${POSTER_BASENAME}.jpg`);
  await encodeOne(posterSrc, posterWebp, posterJpg, quality);

  const [pW, pJ] = await Promise.all([fs.stat(posterWebp), fs.stat(posterJpg)]);
  console.log('\nDone.');
  console.log(
    `  Sequence WebP: ${(totalWebp / 1024 / 1024).toFixed(1)} MB (${indices.length} frames, ~${(totalWebp / indices.length / 1024).toFixed(0)} KB/frame)`,
  );
  console.log(
    `  Sequence JPEG: ${(totalJpeg / 1024 / 1024).toFixed(1)} MB (~${(totalJpeg / indices.length / 1024).toFixed(0)} KB/frame)`,
  );
  console.log(
    `  Poster (frame ${POSTER_FRAME}): webp ${(pW.size / 1024).toFixed(0)} KB, jpg ${(pJ.size / 1024).toFixed(0)} KB`,
  );
  console.log(`  At runtime stride 2 → ~${Math.ceil(indices.length / 2)} frames loaded.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
