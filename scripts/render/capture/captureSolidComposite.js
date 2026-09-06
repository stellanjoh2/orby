import { normalizeHex, hexToRgb } from '../../colorUtils.js';
import { APP_BACKGROUND } from '../../constants.js';
import { readGradientMergedFromComposerOutput } from './captureGradientComposite.js';

/**
 * Top-down opaque RGBA plate filled with Studio Color (exact 8-bit hex, no GL clear).
 * @param {string | null | undefined} hex
 * @param {number} width
 * @param {number} height
 * @returns {Uint8ClampedArray}
 */
export function fillSolidBackdropRgba(hex, width, height) {
  const { r, g, b } = hexToRgb(normalizeHex(hex, APP_BACKGROUND));
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Opaque solid export — Studio Color base plate; post RGB only where scene alpha > 0.
 * Avoids Orby-black / transition clear leaking into empty PNG pixels.
 *
 * @param {Parameters<typeof readGradientMergedFromComposerOutput>[0] & {
 *   solidHex: string,
 * }} deps
 * @returns {Uint8ClampedArray}
 */
export function readSolidMergedFromComposerOutput(deps) {
  const { solidHex, width, height, ...rest } = deps;
  return readGradientMergedFromComposerOutput({
    ...rest,
    width,
    height,
    getGradientRgba: () => fillSolidBackdropRgba(solidHex, width, height),
  });
}
