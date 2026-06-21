import { APP_BACKGROUND } from '../../constants.js';
import {
  MAX_BACKGROUND_IMAGE_COMPOSITE_EDGE,
  MAX_BACKGROUND_IMAGE_SOURCE_EDGE,
} from './backgroundImageDefaults.js';

/**
 * @param {CanvasImageSource} image
 * @returns {{ width: number, height: number }}
 */
export function getImageSourceSize(image) {
  const width =
    'naturalWidth' in image && image.naturalWidth > 0
      ? image.naturalWidth
      : 'width' in image
        ? image.width
        : 0;
  const height =
    'naturalHeight' in image && image.naturalHeight > 0
      ? image.naturalHeight
      : 'height' in image
        ? image.height
        : 0;
  return { width, height };
}

/**
 * @param {number} width
 * @param {number} height
 * @param {number} maxEdge
 */
export function capDimensions(width, height, maxEdge) {
  const maxDim = Math.max(width, height);
  if (!maxDim || maxDim <= maxEdge) {
    return {
      width: Math.max(1, Math.floor(width)),
      height: Math.max(1, Math.floor(height)),
    };
  }
  const scale = maxEdge / maxDim;
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

/**
 * Downscale large uploads once on the CPU — avoids 5K→viewport drawImage every composite.
 * @param {CanvasImageSource} image
 * @param {number} [maxEdge]
 * @returns {CanvasImageSource}
 */
export function downscaleImageSource(image, maxEdge = MAX_BACKGROUND_IMAGE_SOURCE_EDGE) {
  const { width: iw, height: ih } = getImageSourceSize(image);
  if (!iw || !ih) return image;
  const { width: tw, height: th } = capDimensions(iw, ih, maxEdge);
  if (tw === iw && th === ih) return image;

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(image, 0, 0, tw, th);
  return canvas;
}

/**
 * Draw a user image into a viewport-sized canvas (object-fit semantics).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {CanvasImageSource | null | undefined} image
 * @param {{ fit?: 'cover' | 'contain' | 'fill', letterboxColor?: string }} [options]
 */
export function drawBackgroundImage(ctx, width, height, image, options = {}) {
  const fit = options.fit === 'contain' || options.fit === 'fill' ? options.fit : 'cover';
  const letterboxColor = options.letterboxColor ?? APP_BACKGROUND;

  ctx.fillStyle = letterboxColor;
  ctx.fillRect(0, 0, width, height);

  if (!image) return;

  const { width: iw, height: ih } = getImageSourceSize(image);
  if (!iw || !ih) return;

  let dw;
  let dh;
  let dx;
  let dy;

  if (fit === 'fill') {
    dw = width;
    dh = height;
    dx = 0;
    dy = 0;
  } else if (fit === 'contain') {
    const scale = Math.min(width / iw, height / ih);
    dw = iw * scale;
    dh = ih * scale;
    dx = (width - dw) * 0.5;
    dy = (height - dh) * 0.5;
  } else {
    const scale = Math.max(width / iw, height / ih);
    dw = iw * scale;
    dh = ih * scale;
    dx = (width - dw) * 0.5;
    dy = (height - dh) * 0.5;
  }

  ctx.drawImage(image, dx, dy, dw, dh);
}

/**
 * Target composite buffer size — matches viewport aspect but caps GPU upload cost.
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @param {number} [maxEdge]
 */
export function getCompositeBufferSize(
  viewportWidth,
  viewportHeight,
  maxEdge = MAX_BACKGROUND_IMAGE_COMPOSITE_EDGE,
) {
  return capDimensions(viewportWidth, viewportHeight, maxEdge);
}

/**
 * Load a raster file at a capped resolution (avoids decoding full 5K into memory).
 * @param {Blob | File} file
 * @param {number} [maxEdge]
 * @returns {Promise<CanvasImageSource>}
 */
export async function loadBackgroundImageElement(
  file,
  maxEdge = MAX_BACKGROUND_IMAGE_SOURCE_EDGE,
) {
  if (typeof createImageBitmap === 'function') {
    try {
      let bitmap = await createImageBitmap(file, {
        resizeWidth: maxEdge,
        resizeQuality: 'high',
      });
      const { width: tw, height: th } = capDimensions(bitmap.width, bitmap.height, maxEdge);
      if (tw !== bitmap.width || th !== bitmap.height) {
        const resized = await createImageBitmap(bitmap, {
          resizeWidth: tw,
          resizeHeight: th,
          resizeQuality: 'high',
        });
        bitmap.close?.();
        bitmap = resized;
      }
      return bitmap;
    } catch {
      // Fall through to HTMLImageElement path.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const cleanup = () => URL.revokeObjectURL(url);
    img.onload = () => {
      cleanup();
      resolve(downscaleImageSource(img, maxEdge));
    };
    img.onerror = () => {
      cleanup();
      reject(new Error('Failed to decode background image'));
    };
    img.src = url;
  });
}
