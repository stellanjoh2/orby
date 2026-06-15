import * as THREE from 'three';
import { getComposerOutputRenderTarget } from '../../../scripts/render/composerOutputBuffer.js';
import { encodeCanvasToBlob } from '../../../scripts/render/encodeImageBlob.js';
import { fullViewportLogicalSize } from '../../../scripts/render/fullViewportLogicalSize.js';
import { resetMobileRendererViewport } from './mobileComposerFrame.js';

/** Match desktop default opaque still export scale. */
const EXPORT_SCALE = 2;
const MAX_EXPORT_PX = 4096;

/**
 * @param {THREE.WebGLRenderer} renderer
 * @returns {{ width: number, height: number }}
 */
function syncRendererInternalSizeToCanvasBackingStore(renderer) {
  const canvas = renderer.domElement;
  const cw = Math.max(1, canvas.width | 0);
  const ch = Math.max(1, canvas.height | 0);
  const logical = new THREE.Vector2();
  renderer.getSize(logical);
  const pr = Math.max(1e-6, renderer.getPixelRatio());
  const lx = Math.round(logical.x);
  const ly = Math.round(logical.y);
  if (lx !== cw || ly !== ch) {
    if (typeof renderer.setDrawingBufferSize === 'function') {
      renderer.setDrawingBufferSize(cw, ch, pr);
    } else {
      renderer.setSize(cw, ch, false);
    }
  }
  return { width: cw, height: ch };
}

/**
 * EffectComposer RTs must match the real drawing buffer (mobile GPUs often clamp canvas size).
 * @param {THREE.WebGLRenderer} renderer
 * @param {import('./MobilePost.js').MobilePost} post
 */
function ensureComposerMatchesDrawingBuffer(renderer, post) {
  const composer = post.composer;
  if (!composer?.renderTarget1) return;
  const gl = renderer.getContext();
  let bw;
  let bh;
  if (gl && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0) {
    bw = gl.drawingBufferWidth;
    bh = gl.drawingBufferHeight;
  } else {
    const db = new THREE.Vector2();
    renderer.getDrawingBufferSize(db);
    bw = db.x;
    bh = db.y;
  }
  const rt = composer.renderTarget1;
  if (rt.width === bw && rt.height === bh) return;
  const logical = fullViewportLogicalSize(renderer);
  post.setSize(logical.x, logical.y);
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Camera} camera
 * @param {import('./MobilePost.js').MobilePost} post
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @returns {{ width: number, height: number }}
 */
function setExportFramebufferSize(renderer, camera, post, targetWidth, targetHeight) {
  renderer.setPixelRatio(1);
  renderer.setSize(targetWidth, targetHeight, false);
  const synced = syncRendererInternalSizeToCanvasBackingStore(renderer);
  camera.aspect = synced.width / Math.max(1e-6, synced.height);
  camera.updateProjectionMatrix();
  post.setSize(synced.width, synced.height);
  ensureComposerMatchesDrawingBuffer(renderer, post);
  return synced;
}

/** @param {THREE.WebGLRenderer} renderer @param {number} width @param {number} height */
function setExportViewport(renderer, width, height) {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  renderer.setRenderTarget(null);
  renderer.setViewport(0, 0, w, h);
  if (typeof renderer.setScissor === 'function') {
    renderer.setScissor(0, 0, w, h);
  }
  if (typeof renderer.setScissorTest === 'function') {
    renderer.setScissorTest(false);
  }
}

/**
 * @param {Uint8Array} src
 * @param {number} srcW
 * @param {number} srcH
 * @param {number} dstW
 * @param {number} dstH
 */
function resampleRgba(src, srcW, srcH, dstW, dstH) {
  const dst = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y += 1) {
    const sy = Math.min(srcH - 1, Math.floor((y / dstH) * srcH));
    for (let x = 0; x < dstW; x += 1) {
      const sx = Math.min(srcW - 1, Math.floor((x / dstW) * srcW));
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
  return dst;
}

/**
 * @param {Uint8Array} pixels
 * @param {number} width
 * @param {number} height
 */
function pixelsToCanvas(pixels, width, height) {
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
  return canvas;
}

/**
 * Half-float composer buffers are not readable on many mobile GPUs — copy to RGBA8 first
 * (same path as desktop ImageExporter).
 * @param {THREE.WebGLRenderer} renderer
 * @param {import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer} composer
 * @param {number} fallbackWidth
 * @param {number} fallbackHeight
 */
function readComposerOutputPixels(renderer, composer, fallbackWidth, fallbackHeight) {
  const outputRT = getComposerOutputRenderTarget(composer);
  const width = Math.max(1, outputRT?.width ?? fallbackWidth ?? 1);
  const height = Math.max(1, outputRT?.height ?? fallbackHeight ?? 1);
  const byteRT = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });

  try {
    composer.copyPass.render(renderer, byteRT, outputRT, 0, false);
    const pixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(byteRT, 0, 0, width, height, pixels);
    return { pixels, width, height };
  } finally {
    byteRT.dispose();
  }
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
    const { width: captureW, height: captureH } = setExportFramebufferSize(
      renderer,
      camera,
      post,
      exportW,
      exportH,
    );

    mobileScene.controls.update();
    mobileScene.creativeLooks.tick(0);
    post.tick(0);

    const composer = post.composer;
    const prevRenderToScreen = composer.renderToScreen;
    composer.renderToScreen = false;
    const animTime =
      mobileScene.creativeLooks.materialController.getCreativeLookAnimationTime?.() ?? 0;
    try {
      setExportViewport(renderer, captureW, captureH);
      ensureComposerMatchesDrawingBuffer(renderer, post);
      post.creativeLooks?.prepareRender(post, animTime);
      post.composerLifecycle.renderComposerPassForExport();
    } finally {
      composer.renderToScreen = prevRenderToScreen;
    }

    const gl = renderer.getContext();
    gl?.finish?.();

    ensureComposerMatchesDrawingBuffer(renderer, post);
    let { pixels, width: pixelW, height: pixelH } = readComposerOutputPixels(
      renderer,
      composer,
      captureW,
      captureH,
    );
    if (pixelW !== captureW || pixelH !== captureH) {
      pixels = resampleRgba(pixels, pixelW, pixelH, captureW, captureH);
      pixelW = captureW;
      pixelH = captureH;
    }

    const canvas = pixelsToCanvas(pixels, pixelW, pixelH);
    const blob = await encodeCanvasToBlob(canvas, 'jpeg');
    if (!blob?.size) {
      throw new Error('JPEG encode produced empty blob');
    }
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
    syncRendererInternalSizeToCanvasBackingStore(renderer);
    camera.aspect = origAspect;
    camera.updateProjectionMatrix();
    post.setSize(origSize.x, origSize.y);
    post.composerLifecycle?.ensureComposerBuffersMatchRenderer?.();
    resetMobileRendererViewport(renderer);
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
  const mime = blob.type || 'image/jpeg';
  const file = new File([blob], filename, { type: mime });

  if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      console.warn('[Orby Mobile] Web Share failed, falling back to download', err);
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
    // Revoke after the browser has started the download (immediate revoke breaks mobile Safari).
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  return 'downloaded';
}
