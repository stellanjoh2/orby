import * as THREE from 'three';
import { ORBY_BLACK } from '../../../scripts/constants.js';
import { encodeCanvasToBlob } from '../../../scripts/render/encodeImageBlob.js';

/** Match desktop default opaque still export scale. */
const EXPORT_SCALE = 2;
const MAX_EXPORT_PX = 4096;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function fillCinematicLetterbox219Mattes(ctx, w, h) {
  if (w <= 0 || h <= 0) return;
  const r219 = 21 / 9;
  const ar = w / h;
  ctx.fillStyle = ORBY_BLACK;
  if (ar >= r219) {
    const innerW = h * r219;
    const gap = w - innerW;
    const left = Math.floor(gap / 2);
    const right = gap - left;
    ctx.fillRect(0, 0, left, h);
    ctx.fillRect(w - right, 0, right, h);
  } else {
    const innerH = (w * 9) / 21;
    const gap = h - innerH;
    const top = Math.floor(gap / 2);
    const bottom = gap - top;
    ctx.fillRect(0, 0, w, top);
    ctx.fillRect(0, h - bottom, w, bottom);
  }
}

/**
 * @param {Uint8Array} pixels
 * @param {number} width
 * @param {number} height
 * @param {boolean} cinematicLetterbox219
 */
function pixelsToCanvas(pixels, width, height, cinematicLetterbox219) {
  const flipped = new Uint8ClampedArray(width * height * 4);
  const rowStride = width * 4;
  for (let y = 0; y < height; y += 1) {
    const srcRow = (height - 1 - y) * rowStride;
    const dstRow = y * rowStride;
    flipped.set(pixels.subarray(srcRow, srcRow + rowStride), dstRow);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(flipped);
  ctx.putImageData(imageData, 0, 0);
  if (cinematicLetterbox219) {
    fillCinematicLetterbox219Mattes(ctx, width, height);
  }
  return canvas;
}

/**
 * @param {number} logicalW
 * @param {number} logicalH
 * @param {number} previewDensity
 */
function resolveExportSize(logicalW, logicalH, previewDensity) {
  let w = Math.max(1, Math.round(logicalW * previewDensity * EXPORT_SCALE));
  let h = Math.max(1, Math.round(logicalH * previewDensity * EXPORT_SCALE));
  if (w <= MAX_EXPORT_PX && h <= MAX_EXPORT_PX) return { width: w, height: h };
  const fit = Math.min(MAX_EXPORT_PX / w, MAX_EXPORT_PX / h);
  return {
    width: Math.max(1, Math.floor(w * fit)),
    height: Math.max(1, Math.floor(h * fit)),
  };
}

/**
 * @param {import('./MobileScene.js').MobileScene} mobileScene
 * @returns {Promise<'shared' | 'downloaded' | 'no-model' | 'failed'>}
 */
export async function exportMobileSceneJpeg(mobileScene) {
  if (!mobileScene?.currentModel) return 'no-model';
  if (mobileScene._exportInProgress) return 'failed';

  mobileScene._exportInProgress = true;
  const { renderer, camera, post, mount } = mobileScene;

  const logicalW = Math.max(1, mount.clientWidth);
  const logicalH = Math.max(1, mount.clientHeight);
  const origSize = new THREE.Vector2();
  renderer.getSize(origSize);
  const origPixelRatio = renderer.getPixelRatio();
  const origAspect = camera.aspect;
  const { width: exportW, height: exportH } = resolveExportSize(
    logicalW,
    logicalH,
    origPixelRatio,
  );
  const origGizmoVisible = mobileScene.transformControlsRotate?.visible ?? false;
  if (mobileScene.transformControlsRotate) {
    mobileScene.transformControlsRotate.visible = false;
  }

  try {
    camera.aspect = logicalW / logicalH;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(1);
    renderer.setSize(exportW, exportH, false);
    post.setSize(exportW, exportH);

    mobileScene.controls.update();
    mobileScene.creativeLooks.tick(0);
    post.tick(0);

    const composer = post.composer;
    const prevRenderToScreen = composer.renderToScreen;
    composer.renderToScreen = false;
    try {
      composer.render();
    } finally {
      composer.renderToScreen = prevRenderToScreen;
    }

    const gl = renderer.getContext();
    gl?.finish?.();

    const target = composer.readBuffer;
    const pixels = new Uint8Array(exportW * exportH * 4);
    renderer.readRenderTargetPixels(target, 0, 0, exportW, exportH, pixels);

    const canvas = pixelsToCanvas(
      pixels,
      exportW,
      exportH,
      mobileScene.getCinematicLetterbox(),
    );
    const blob = await encodeCanvasToBlob(canvas, 'jpeg');
    const baseName =
      mobileScene._currentFileName?.replace(/\.(glb|gltf)$/i, '') || 'orby';
    const filename = `${baseName}-orby.jpg`;

    return await saveImageBlob(blob, filename);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    console.error('[Orby Mobile] Export failed', err);
    return 'failed';
  } finally {
    if (mobileScene.transformControlsRotate) {
      mobileScene.transformControlsRotate.visible = origGizmoVisible;
    }
    renderer.setPixelRatio(origPixelRatio);
    renderer.setSize(origSize.x, origSize.y, false);
    camera.aspect = origAspect;
    camera.updateProjectionMatrix();
    post.setSize(origSize.x, origSize.y);
    mobileScene._exportInProgress = false;
  }
}

/**
 * iOS-style save: Web Share sheet (Save Image) when available, else download.
 * @param {Blob} blob
 * @param {string} filename
 * @returns {Promise<'shared' | 'downloaded'>}
 */
async function saveImageBlob(blob, filename) {
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });

  if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return 'downloaded';
}
