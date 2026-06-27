import { SKETCH_PAPER_RGB } from '../creativeLookSketchArt.js';

const PAPER_RGB = SKETCH_PAPER_RGB.map((v) => Math.round(v * 255));
const HARD_TOLERANCE = 16;
const SOFT_TOLERANCE = 44;

/**
 * Gouache / watercolour / sketch transparent export — keys warm paper backdrop to alpha 0.
 *
 * @param {Uint8Array | Uint8ClampedArray} pixels — RGBA, top-left origin (post-readback layout)
 * @param {number} width
 * @param {number} height
 */
export function keyArtisticPaperBackdropToAlpha(pixels, width, height) {
  const [pr, pg, pb] = PAPER_RGB;

  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const dr = r - pr;
    const dg = g - pg;
    const db = b - pb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    let alpha = 255;
    if (dist <= HARD_TOLERANCE) {
      alpha = 0;
    } else if (dist < SOFT_TOLERANCE) {
      alpha = Math.round(((dist - HARD_TOLERANCE) / (SOFT_TOLERANCE - HARD_TOLERANCE)) * 255);
    }

    pixels[i + 3] = alpha;
    if (alpha === 0) {
      pixels[i] = 0;
      pixels[i + 1] = 0;
      pixels[i + 2] = 0;
    }
  }
}
