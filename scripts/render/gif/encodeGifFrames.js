/**
 * Offline GIF encode via vendored gifski-wasm worker.
 */

import { gifFrameDelayMs, gifskiQualityFromPreset } from './gifExportSettings.js';

/** Dev: this module URL; prod bundle: entry.js — both resolve under /scripts/vendor/gifski/. */
function resolveGifskiWorkerUrl() {
  if (/\/(?:entry|main)\.js(?:\?|$)/.test(import.meta.url)) {
    return new URL('./vendor/gifski/gifskiEncoder.worker.js', import.meta.url).href;
  }
  return new URL('../../vendor/gifski/gifskiEncoder.worker.js', import.meta.url).href;
}

/**
 * @param {ImageData[]} frames
 * @param {{ width: number, height: number, fps: number, qualityPreset?: string }} opts
 * @returns {Promise<Uint8Array>}
 */
export function encodeGifFrames(frames, opts) {
  const width = Math.max(1, Math.round(opts.width));
  const height = Math.max(1, Math.round(opts.height));
  const fps = Math.max(1, Number(opts.fps) || 30);
  const quality = gifskiQualityFromPreset(opts.qualityPreset);
  const delay = gifFrameDelayMs(fps);

  if (!Array.isArray(frames) || frames.length === 0) {
    return Promise.reject(new Error('GIF encode needs frames'));
  }

  // gifski requires ≥2 frames; clone a still so the worker can transfer both buffers.
  const encodeFrames =
    frames.length === 1
      ? [
          frames[0],
          {
            data: new Uint8ClampedArray(frames[0].data),
            width: frames[0].width,
            height: frames[0].height,
          },
        ]
      : frames;

  return new Promise((resolve, reject) => {
    const worker = new Worker(resolveGifskiWorkerUrl(), { type: 'module' });
    const buffers = encodeFrames.map((frame) => {
      const copy = new Uint8ClampedArray(frame.data);
      return copy.buffer;
    });

    worker.onmessage = (event) => {
      worker.terminate();
      if (event.data?.ok) {
        resolve(new Uint8Array(event.data.bytes));
        return;
      }
      reject(new Error(event.data?.message || 'GIF encode failed'));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error('GIF encode failed'));
    };

    worker.postMessage(
      { frames: buffers, width, height, delay, quality },
      buffers,
    );
  });
}

/**
 * Decode a PNG (or other image) blob to ImageData for gifski.
 * @param {Blob} blob
 * @returns {Promise<ImageData>}
 */
export async function imageBlobToImageData(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('GIF frame decode failed');
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close?.();
  }
}

/**
 * Downscale ImageData with high-quality canvas draw (Mozayk bake-then-downscale).
 * @param {ImageData} source
 * @param {number} width
 * @param {number} height
 * @returns {ImageData}
 */
export function downscaleImageData(source, width, height) {
  if (source.width === width && source.height === height) return source;
  const src = document.createElement('canvas');
  src.width = source.width;
  src.height = source.height;
  const srcCtx = src.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) throw new Error('GIF downscale failed');
  srcCtx.putImageData(source, 0, 0);

  const dest = document.createElement('canvas');
  dest.width = width;
  dest.height = height;
  const destCtx = dest.getContext('2d', { willReadFrequently: true });
  if (!destCtx) throw new Error('GIF downscale failed');
  destCtx.imageSmoothingEnabled = true;
  destCtx.imageSmoothingQuality = 'high';
  destCtx.drawImage(src, 0, 0, width, height);
  return destCtx.getImageData(0, 0, width, height);
}
