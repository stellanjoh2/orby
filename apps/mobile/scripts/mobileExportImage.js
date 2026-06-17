import * as THREE from 'three';
import { getComposerOutputRenderTarget } from '../../../scripts/render/composerOutputBuffer.js';
import { fullViewportLogicalSize } from '../../../scripts/render/fullViewportLogicalSize.js';
import { resetMobileRendererViewport } from './mobileComposerFrame.js';
import { markMobileDebugLog } from './mobileDebugLog.js';

/**
 * Preview already runs at device pixel ratio (capped at 2×) — export matches that backing store.
 */
const EXPORT_SCALE = 1;
/** iOS-practical longest-edge cap — above this Safari often kills tabs during readback. */
const MOBILE_EXPORT_MAX_PX = 2048;
const MOBILE_JPEG_QUALITY = 0.82;
const MOBILE_EXPORT_TRACE_KEY = 'orby_mobile_last_export';

/** @param {string} phase @param {Record<string, unknown>} [data] */
function traceMobileExport(phase, data = {}) {
  markMobileDebugLog(`export:${phase}`, data);
  try {
    localStorage.setItem(
      MOBILE_EXPORT_TRACE_KEY,
      JSON.stringify({ t: Date.now(), phase, ...data }),
    );
  } catch {
    /* storage blocked */
  }
}

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
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  const imageData = ctx.createImageData(width, height);
  const dst = imageData.data;
  const rowStride = width * 4;
  for (let y = 0; y < height; y += 1) {
    const srcRow = (height - 1 - y) * rowStride;
    dst.set(pixels.subarray(srcRow, srcRow + rowStride), y * rowStride);
  }
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
  } catch (err) {
    const detail = `${width}x${height}`;
    throw new Error(`Pixel readback failed (${detail}): ${err?.message || err}`);
  } finally {
    byteRT.dispose();
  }
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @returns {{ width: number, height: number }}
 */
function getPreviewDrawingBufferSize(renderer) {
  const gl = renderer.getContext();
  if (gl && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0) {
    return { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };
  }
  const logical = new THREE.Vector2();
  renderer.getSize(logical);
  const pr = Math.max(1, renderer.getPixelRatio());
  return {
    width: Math.max(1, Math.round(logical.x * pr)),
    height: Math.max(1, Math.round(logical.y * pr)),
  };
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @returns {number}
 */
function getMaxExportPixelDimension(renderer) {
  const gl = renderer.getContext();
  if (!gl) return MOBILE_EXPORT_MAX_PX;
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || MOBILE_EXPORT_MAX_PX;
  const maxRb = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || maxTex;
  return Math.max(1, Math.min(maxTex, maxRb, MOBILE_EXPORT_MAX_PX));
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {number} width
 * @param {number} height
 * @returns {{ width: number, height: number }}
 */
function clampExportPixelSize(renderer, width, height) {
  const cap = getMaxExportPixelDimension(renderer);
  let w = Math.max(1, Math.round(width));
  let h = Math.max(1, Math.round(height));
  if (w <= cap && h <= cap) {
    return { width: w, height: h };
  }
  const fit = Math.min(cap / w, cap / h);
  return {
    width: Math.max(1, Math.floor(w * fit)),
    height: Math.max(1, Math.floor(h * fit)),
  };
}

/**
 * Export at the live preview backing-store size (1× WYSIWYG), only shrinking for GPU / iOS limits.
 * @param {THREE.WebGLRenderer} renderer
 */
function resolveExportSize(renderer) {
  const preview = getPreviewDrawingBufferSize(renderer);
  return clampExportPixelSize(
    renderer,
    preview.width * EXPORT_SCALE,
    preview.height * EXPORT_SCALE,
  );
}

/** @returns {Promise<void>} */
function waitFrames(count = 2) {
  let left = count;
  return new Promise((resolve) => {
    const step = () => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/**
 * @param {string} dataUrl
 * @returns {Blob | null}
 */
function dataUrlToJpegBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const meta = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const isBase64 = meta.includes(';base64');
  const bytes = isBase64 ? atob(body) : decodeURIComponent(body);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    out[i] = bytes.charCodeAt(i);
  }
  const mime = meta.match(/^data:([^;,]+)/)?.[1] || 'image/jpeg';
  return new Blob([out], { type: mime });
}

/**
 * iOS Safari sometimes never calls the toBlob callback under memory pressure — fall back to toDataURL.
 * @param {HTMLCanvasElement} canvas
 * @param {number} [quality]
 * @returns {Promise<Blob>}
 */
function encodeMobileJpeg(canvas, quality = MOBILE_JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (blob, err) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (blob) resolve(blob);
      else reject(err ?? new Error('JPEG encode failed'));
    };

    const timer = window.setTimeout(() => {
      try {
        finish(dataUrlToJpegBlob(canvas.toDataURL('image/jpeg', quality)));
      } catch (err) {
        finish(null, err instanceof Error ? err : new Error('JPEG encode timed out'));
      }
    }, 12_000);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          finish(blob);
          return;
        }
        try {
          finish(dataUrlToJpegBlob(canvas.toDataURL('image/jpeg', quality)));
        } catch (err) {
          finish(null, err instanceof Error ? err : new Error('JPEG encode failed'));
        }
      },
      'image/jpeg',
      quality,
    );
  });
}

/**
 * @param {import('./MobileScene.js').MobileScene} mobileScene
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Vector2} origSize
 * @param {number} origPixelRatio
 * @param {number} origAspect
 * @param {import('./MobilePost.js').MobilePost} post
 */
async function restoreMobilePreviewFrame(mobileScene, renderer, origSize, origPixelRatio, origAspect, post) {
  renderer.setPixelRatio(origPixelRatio);
  renderer.setSize(origSize.x, origSize.y, false);
  syncRendererInternalSizeToCanvasBackingStore(renderer);
  mobileScene.camera.aspect = origAspect;
  mobileScene.camera.updateProjectionMatrix();
  post.setSize(origSize.x, origSize.y);
  post.composerLifecycle?.ensureComposerBuffersMatchRenderer?.();
  resetMobileRendererViewport(renderer);
  await waitFrames(1);
  mobileScene.controls.update();
  mobileScene.creativeLooks.tick(0);
  post.tick(0);
  const animTime =
    mobileScene.creativeLooks.materialController.getCreativeLookAnimationTime?.() ?? 0;
  post.render(animTime);
}

/**
 * @param {import('./MobileScene.js').MobileScene} mobileScene
 * @returns {Promise<'shared' | 'downloaded' | 'no-model' | 'busy' | 'failed'>}
 */
export async function exportMobileSceneJpeg(mobileScene) {
  if (!mobileScene?.currentModel) {
    traceMobileExport('skipped', { reason: 'no-model' });
    return 'no-model';
  }
  if (mobileScene._exportInProgress) {
    traceMobileExport('skipped', { reason: 'in-progress' });
    return 'busy';
  }

  mobileScene._exportInProgress = true;
  const { renderer, camera, post, mount } = mobileScene;

  const logicalW = Math.max(1, mount.clientWidth);
  const logicalH = Math.max(1, mount.clientHeight);
  const origSize = new THREE.Vector2();
  renderer.getSize(origSize);
  const origPixelRatio = renderer.getPixelRatio();
  const origAspect = camera.aspect;
  const previewBuffer = getPreviewDrawingBufferSize(renderer);
  const { width: exportW, height: exportH } = resolveExportSize(renderer);
  traceMobileExport('start', {
    logicalW,
    logicalH,
    previewBufferW: previewBuffer.width,
    previewBufferH: previewBuffer.height,
    exportW,
    exportH,
    pixelRatio: origPixelRatio,
  });

  await waitFrames(2);

  try {
    post.creativeLooks?.pinExportPixelReferences?.(
      origSize.x,
      origSize.y,
      previewBuffer.width,
      previewBuffer.height,
    );

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

    traceMobileExport('readback-done', { pixelW, pixelH });
    const canvas = pixelsToCanvas(pixels, pixelW, pixelH);
    pixels = null;
    let blob = await encodeMobileJpeg(canvas);
    if (!blob?.size) {
      throw new Error('JPEG encode produced empty blob');
    }
    if (blob.size > 8 * 1024 * 1024) {
      blob = await encodeMobileJpeg(canvas, 0.68);
    }
    traceMobileExport('encoded', { bytes: blob.size });
    const baseName =
      mobileScene._currentFileName?.replace(/\.(glb|gltf)$/i, '') || 'orby';
    const filename = `${baseName}-orby.jpg`;

    const result = await saveImageBlob(blob, filename);
    traceMobileExport('saved', { result });
    return result;
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    console.error('[Orby Mobile] Export failed', err);
    traceMobileExport('failed', { message: String(err?.message || err) });
    return 'failed';
  } finally {
    try {
      post.creativeLooks?.unpinExportPixelReferences?.();
      await restoreMobilePreviewFrame(
        mobileScene,
        renderer,
        origSize,
        origPixelRatio,
        origAspect,
        post,
      );
    } catch (restoreErr) {
      console.error('[Orby Mobile] Export restore failed', restoreErr);
      traceMobileExport('restore-failed', { message: String(restoreErr?.message || restoreErr) });
    }
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
