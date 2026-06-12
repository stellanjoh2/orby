/**
 * True when a Three.js texture has uploadable image data (loaded canvas/image/DataTexture).
 * FBX external maps that 404 still create Texture objects with no image — these stall WebGL uploads.
 * @param {import('three').Texture|null|undefined} texture
 * @returns {boolean}
 */
export function isTextureImageReady(texture) {
  if (!texture?.isTexture) return false;
  const img = texture.image;
  if (img == null) return false;

  if (typeof img === 'object' && img.data) return true;

  if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) {
    return img.width > 0 && img.height > 0;
  }
  if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) {
    return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
  }
  if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) {
    return img.width > 0 && img.height > 0;
  }
  if (typeof VideoFrame !== 'undefined' && img instanceof VideoFrame) {
    return img.displayWidth > 0 && img.displayHeight > 0;
  }

  const w = Number(img.width);
  const h = Number(img.height);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
}
