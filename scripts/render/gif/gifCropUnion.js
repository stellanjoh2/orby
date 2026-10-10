/**
 * Fixed-canvas crop for animated GIF — union of per-frame alpha bounds so
 * motion never clips the mesh on any frame.
 */

import { computeTightAlphaBounds } from '../capture/TransparentCapture.js';

/** Match still/PNG tight crop padding, plus a little for motion soft edges. */
export const GIF_UNION_CROP_PADDING = 4;

/**
 * @typedef {{ minCol: number, minRow: number, maxCol: number, maxRow: number }} AlphaBounds
 */

/**
 * @param {AlphaBounds | null | undefined} a
 * @param {AlphaBounds | null | undefined} b
 * @returns {AlphaBounds | null}
 */
export function unionAlphaBounds(a, b) {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  return {
    minCol: Math.min(a.minCol, b.minCol),
    minRow: Math.min(a.minRow, b.minRow),
    maxCol: Math.max(a.maxCol, b.maxCol),
    maxRow: Math.max(a.maxRow, b.maxRow),
  };
}

/**
 * @param {ImageData[]} frames
 * @param {{ padding?: number, minAlpha?: number }} [opts]
 * @returns {AlphaBounds | null}
 */
export function computeUnionAlphaBounds(frames, opts = {}) {
  const padding = opts.padding ?? GIF_UNION_CROP_PADDING;
  const minAlpha = opts.minAlpha ?? 1;
  let union = null;
  for (const frame of frames) {
    if (!frame?.data || !(frame.width > 0) || !(frame.height > 0)) continue;
    const tight = computeTightAlphaBounds(frame.data, frame.width, frame.height, minAlpha);
    union = unionAlphaBounds(union, tight);
  }
  if (!union) return null;

  const width = frames[0].width;
  const height = frames[0].height;
  return {
    minCol: Math.max(0, union.minCol - padding),
    minRow: Math.max(0, union.minRow - padding),
    maxCol: Math.min(width - 1, union.maxCol + padding),
    maxRow: Math.min(height - 1, union.maxRow + padding),
  };
}

/**
 * Crop every frame to the same rect (fixed GIF canvas).
 * @param {{ data: Uint8ClampedArray | Uint8Array, width: number, height: number }} source
 * @param {AlphaBounds} bounds
 * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
 */
export function cropImageDataToBounds(source, bounds) {
  const outW = bounds.maxCol - bounds.minCol + 1;
  const outH = bounds.maxRow - bounds.minRow + 1;
  if (outW <= 0 || outH <= 0) {
    return {
      data: new Uint8ClampedArray(source.data),
      width: source.width,
      height: source.height,
    };
  }
  if (
    bounds.minCol === 0
    && bounds.minRow === 0
    && bounds.maxCol === source.width - 1
    && bounds.maxRow === source.height - 1
  ) {
    return {
      data: source.data instanceof Uint8ClampedArray
        ? source.data
        : new Uint8ClampedArray(source.data),
      width: source.width,
      height: source.height,
    };
  }

  const data = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y += 1) {
    const srcRow = bounds.minRow + y;
    for (let x = 0; x < outW; x += 1) {
      const srcCol = bounds.minCol + x;
      const srcIdx = (srcRow * source.width + srcCol) * 4;
      const dstIdx = (y * outW + x) * 4;
      data[dstIdx] = source.data[srcIdx];
      data[dstIdx + 1] = source.data[srcIdx + 1];
      data[dstIdx + 2] = source.data[srcIdx + 2];
      data[dstIdx + 3] = source.data[srcIdx + 3];
    }
  }
  return { data, width: outW, height: outH };
}

/**
 * Widen horizontal crop around content center. Never narrower than content
 * (manual width only adds side margin — never clips the mesh).
 *
 * @param {AlphaBounds} bounds
 * @param {number} frameWidth
 * @param {unknown} manualWidthPx
 * @returns {AlphaBounds}
 */
export function expandBoundsToManualWidth(bounds, frameWidth, manualWidthPx) {
  const frameW = Math.max(1, Math.round(Number(frameWidth) || 1));
  const unionW = bounds.maxCol - bounds.minCol + 1;
  const manual = Math.round(Number(manualWidthPx));
  if (!Number.isFinite(manual) || manual <= unionW) {
    return { ...bounds };
  }
  const targetW = Math.min(frameW, Math.max(unionW, manual));
  const center = (bounds.minCol + bounds.maxCol) / 2;
  let minCol = Math.round(center - (targetW - 1) / 2);
  let maxCol = minCol + targetW - 1;
  if (minCol < 0) {
    maxCol -= minCol;
    minCol = 0;
  }
  if (maxCol > frameW - 1) {
    minCol -= maxCol - (frameW - 1);
    maxCol = frameW - 1;
  }
  minCol = Math.max(0, minCol);
  maxCol = Math.min(frameW - 1, maxCol);
  return { ...bounds, minCol, maxCol };
}

/**
 * @param {unknown} value
 * @param {number} [frameWidth]
 * @returns {number | null}
 */
export function normalizeGifManualCropWidth(value, frameWidth = Infinity) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  const maxW = Math.max(1, Math.round(Number(frameWidth) || 1));
  return Math.min(maxW, Math.max(1, n));
}

/**
 * @param {Array<{ data: Uint8ClampedArray | Uint8Array, width: number, height: number }>} frames
 * @param {{ padding?: number, minAlpha?: number, manualWidthPx?: number | null }} [opts]
 * @returns {{
 *   frames: Array<{ data: Uint8ClampedArray, width: number, height: number }>,
 *   width: number,
 *   height: number,
 *   cropped: boolean,
 * }}
 */
export function applyGifUnionCrop(frames, opts = {}) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return { frames: [], width: 0, height: 0, cropped: false };
  }
  const bounds = computeUnionAlphaBounds(frames, opts);
  if (!bounds) {
    return {
      frames,
      width: frames[0].width,
      height: frames[0].height,
      cropped: false,
    };
  }
  const frameW = frames[0].width;
  const finalBounds = expandBoundsToManualWidth(bounds, frameW, opts.manualWidthPx);
  const croppedFrames = frames.map((frame) => cropImageDataToBounds(frame, finalBounds));
  return {
    frames: croppedFrames,
    width: finalBounds.maxCol - finalBounds.minCol + 1,
    height: finalBounds.maxRow - finalBounds.minRow + 1,
    cropped: true,
  };
}
