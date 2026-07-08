import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SHAPE_ID_RE = /^[a-z0-9-]+$/;

/**
 * Center-crop to square, resize, and write a compressed PNG thumbnail.
 * @param {{
 *   pngBuffer: Buffer,
 *   shapeId: string,
 *   size?: number,
 *   outDir?: string,
 * }} opts
 */
export async function processShapeLibraryThumbnail({
  pngBuffer,
  shapeId,
  size = 128,
  outDir,
}) {
  if (!SHAPE_ID_RE.test(shapeId)) {
    throw new Error(`Invalid shape id: ${shapeId}`);
  }
  const thumbSize = Math.max(32, Math.min(512, Math.round(Number(size) || 128)));
  const filename = `shape-library-${shapeId}.png`;
  const dest = path.join(outDir, filename);

  const meta = await sharp(pngBuffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1) {
    throw new Error(`Invalid capture dimensions for ${shapeId}: ${width}×${height}`);
  }

  const side = Math.min(width, height);
  const left = Math.floor((width - side) / 2);
  const top = Math.floor((height - side) / 2);

  const outBuffer = await sharp(pngBuffer)
    .extract({ left, top, width: side, height: side })
    .resize(thumbSize, thumbSize, { fit: 'fill' })
    .png({ compressionLevel: 9, palette: true, quality: 80, effort: 10 })
    .toBuffer();

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(dest, outBuffer);

  return {
    path: dest,
    filename,
    bytes: outBuffer.length,
    sourceSize: { width, height },
    thumbSize,
  };
}
