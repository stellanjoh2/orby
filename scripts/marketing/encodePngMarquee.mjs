/**
 * Resize + WebP encode for PNG marquee cutouts (display-sized delivery).
 * Run: npm run encode:png-marquee
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../../assets/marketing/png-loop');
const MAX_HEIGHT = 1600;
const WEBP_QUALITY = 82;

const FILES = [
  'new-balance-574.png',
  'skull-salazar.png',
  'loggerhead-turtle.png',
];

for (const name of FILES) {
  const input = path.join(ROOT, name);
  const base = name.replace(/\.png$/i, '');
  const output = path.join(ROOT, `${base}.webp`);
  const img = sharp(input);
  const meta = await img.metadata();
  const resize =
    meta.height && meta.height > MAX_HEIGHT
      ? { height: MAX_HEIGHT, withoutEnlargement: true }
      : {};
  await img.resize(resize).webp({ quality: WEBP_QUALITY }).toFile(output);
  const { size: inSize } = await fs.stat(input);
  const { size: outSize } = await fs.stat(output);
  console.log(`${base}: ${(inSize / 1024 / 1024).toFixed(2)}MB → ${(outSize / 1024).toFixed(0)}KB webp`);
}
