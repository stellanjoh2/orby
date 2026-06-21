import * as THREE from 'three';
import { getImageSourceSize } from './backgroundImageCanvas.js';

/**
 * UV transform for scene.background — cover / contain / fill without canvas compositing.
 * @param {import('three').Texture} texture
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @param {'cover' | 'contain' | 'fill'} fit
 */
export function applyBackgroundImageFit(
  texture,
  imageWidth,
  imageHeight,
  viewportWidth,
  viewportHeight,
  fit,
) {
  const iw = Math.max(1, imageWidth);
  const ih = Math.max(1, imageHeight);
  const vw = Math.max(1, viewportWidth);
  const vh = Math.max(1, viewportHeight);
  const imageAspect = iw / ih;
  const viewAspect = vw / vh;

  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  if (fit === 'fill') {
    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);
  } else if (fit === 'cover') {
    if (imageAspect > viewAspect) {
      const rx = viewAspect / imageAspect;
      texture.repeat.set(rx, 1);
      texture.offset.set((1 - rx) * 0.5, 0);
    } else {
      const ry = imageAspect / viewAspect;
      texture.repeat.set(1, ry);
      texture.offset.set(0, (1 - ry) * 0.5);
    }
  } else if (imageAspect > viewAspect) {
    const ry = viewAspect / imageAspect;
    texture.repeat.set(1, ry);
    texture.offset.set(0, (1 - ry) * 0.5);
  } else {
    const rx = imageAspect / viewAspect;
    texture.repeat.set(rx, 1);
    texture.offset.set((1 - rx) * 0.5, 0);
  }

  texture.updateMatrix();
}

/**
 * @param {import('three').Texture} texture
 * @param {CanvasImageSource | null | undefined} source
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @param {'cover' | 'contain' | 'fill'} fit
 */
export function syncBackgroundImageTextureFit(texture, source, viewportWidth, viewportHeight, fit) {
  if (!texture || !source) return;
  const { width, height } = getImageSourceSize(source);
  applyBackgroundImageFit(texture, width, height, viewportWidth, viewportHeight, fit);
}
