import * as THREE from 'three';
import { getComposerOutputRenderTarget } from '../composerOutputBuffer.js';

/**
 * Hide HDRI backdrop + zero clear alpha for transparent raster capture.
 * Keeps `scene.environment` for mesh lighting (HDRI hook clears `scene.background` when ctx.transparent).
 *
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   scene: import('three').Scene,
 *   composer?: import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer,
 *   backgroundController?: import('../BackgroundController.js').BackgroundController,
 *   postPipeline?: { renderPass?: { clearAlpha?: number } },
 * }} deps
 */
export function applyTransparentCaptureSetup(deps) {
  const { renderer, scene, composer, backgroundController, postPipeline } = deps;

  // Snapshot RenderPass clearAlpha BEFORE zeroing composer passes — renderPass is usually
  // already in `composer.passes`, so reading it after the loop would capture 0 and restore
  // would leave clearAlpha stuck at 0 (solid studio bg looks default gray on alpha:true canvas).
  let renderPassClearAlpha = null;
  let hasRenderPassClearAlpha = false;
  if (postPipeline?.renderPass && 'clearAlpha' in postPipeline.renderPass) {
    renderPassClearAlpha = postPipeline.renderPass.clearAlpha;
    hasRenderPassClearAlpha = true;
  }

  const passClearAlphas = [];
  if (composer?.passes?.length) {
    for (const pass of composer.passes) {
      if (pass && Object.prototype.hasOwnProperty.call(pass, 'clearAlpha')) {
        passClearAlphas.push({ pass, clearAlpha: pass.clearAlpha });
        pass.clearAlpha = 0;
      }
    }
  }

  if (hasRenderPassClearAlpha) {
    postPipeline.renderPass.clearAlpha = 0;
  }

  const backgroundSphere = backgroundController?.getBackgroundSphere?.();
  const originalBackgroundSphereVisible = backgroundSphere?.visible ?? null;
  if (backgroundSphere) {
    backgroundSphere.visible = false;
  }

  const originalBackground = scene.background;
  scene.background = null;
  const originalClearColor = renderer.getClearColor(new THREE.Color()).clone();
  const originalClearAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);

  return {
    passClearAlphas,
    renderPassClearAlpha,
    hasRenderPassClearAlpha,
    originalBackgroundSphereVisible,
    originalBackground,
    originalClearColor,
    originalClearAlpha,
  };
}

/**
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   scene: import('three').Scene,
 *   composer?: import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer,
 *   backgroundController?: import('../BackgroundController.js').BackgroundController,
 *   postPipeline?: { renderPass?: { clearAlpha?: number } },
 * }} deps
 * @param {ReturnType<typeof applyTransparentCaptureSetup>} snapshot
 */
export function restoreTransparentCaptureSetup(deps, snapshot) {
  if (!snapshot) return;
  const { renderer, scene, backgroundController, postPipeline } = deps;

  for (const entry of snapshot.passClearAlphas || []) {
    if (entry?.pass) entry.pass.clearAlpha = entry.clearAlpha;
  }
  // Prefer the pre-mutation RenderPass snapshot (null is a valid Three.js default).
  if (postPipeline?.renderPass && snapshot.hasRenderPassClearAlpha) {
    postPipeline.renderPass.clearAlpha = snapshot.renderPassClearAlpha;
  }

  const backgroundSphere = backgroundController?.getBackgroundSphere?.();
  if (backgroundSphere && snapshot.originalBackgroundSphereVisible !== null) {
    backgroundSphere.visible = snapshot.originalBackgroundSphereVisible;
  }

  scene.background = snapshot.originalBackground;
  renderer.setClearColor(snapshot.originalClearColor, snapshot.originalClearAlpha);
  renderer.setClearAlpha(snapshot.originalClearAlpha);
  // Re-bind solid/gradient/image from controller — do not leave a stale transparent clear.
  backgroundController?.refreshAppearance?.();
}

/**
 * @param {Uint8ClampedArray | Uint8Array} pixels
 * @param {number} width
 * @param {number} height
 * @param {number} [minAlpha]
 * @returns {{ minCol: number, minRow: number, maxCol: number, maxRow: number } | null}
 */
export function computeTightAlphaBounds(pixels, width, height, minAlpha = 1) {
  let minCol = width;
  let minRow = height;
  let maxCol = -1;
  let maxRow = -1;
  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * width * 4;
    for (let col = 0; col < width; col += 1) {
      const idx = rowOffset + col * 4;
      if (pixels[idx + 3] > minAlpha) {
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
      }
    }
  }
  if (maxCol < minCol || maxRow < minRow) {
    return null;
  }
  return { minCol, minRow, maxCol, maxRow };
}

/**
 * Write top-down RGBA (canvas row order) to a canvas without cropping.
 *
 * @param {Uint8ClampedArray | Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement}
 */
export function topDownRgbaToCanvas(rgba, width, height) {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = width;
  exportCanvas.height = height;
  const ctx = exportCanvas.getContext('2d', { alpha: true });
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(rgba);
  ctx.putImageData(imageData, 0, 0);
  return exportCanvas;
}

/**
 * Tight crop top-down RGBA (canvas row order) to opaque pixel bounds.
 *
 * @param {Uint8ClampedArray | Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @param {{ padding?: number, minAlpha?: number }} [opts]
 * @returns {HTMLCanvasElement}
 */
export function cropTransparentTopDownRgbaToCanvas(rgba, width, height, opts = {}) {
  const padding = opts.padding ?? 3;
  const minAlpha = opts.minAlpha ?? 1;
  const tight = computeTightAlphaBounds(rgba, width, height, minAlpha);

  if (!tight) {
    return topDownRgbaToCanvas(rgba, width, height);
  }

  const exportCanvas = document.createElement('canvas');

  const minCol = Math.max(0, tight.minCol - padding);
  const minRow = Math.max(0, tight.minRow - padding);
  const maxCol = Math.min(width - 1, tight.maxCol + padding);
  const maxRow = Math.min(height - 1, tight.maxRow + padding);
  const outW = maxCol - minCol + 1;
  const outH = maxRow - minRow + 1;

  exportCanvas.width = outW;
  exportCanvas.height = outH;
  const exportContext = exportCanvas.getContext('2d', { alpha: true });
  exportContext.clearRect(0, 0, outW, outH);

  const cropped = new Uint8ClampedArray(outW * outH * 4);
  for (let cy = 0; cy < outH; cy += 1) {
    const srcRow = minRow + cy;
    for (let cx = 0; cx < outW; cx += 1) {
      const srcCol = minCol + cx;
      const srcIdx = (srcRow * width + srcCol) * 4;
      const dstIdx = (cy * outW + cx) * 4;
      cropped[dstIdx] = rgba[srcIdx];
      cropped[dstIdx + 1] = rgba[srcIdx + 1];
      cropped[dstIdx + 2] = rgba[srcIdx + 2];
      cropped[dstIdx + 3] = rgba[srcIdx + 3];
    }
  }

  const imageData = exportContext.createImageData(outW, outH);
  imageData.data.set(cropped);
  exportContext.putImageData(imageData, 0, 0);
  return exportCanvas;
}

/**
 * Coarse AABB crop (viewport mesh bounds) + tight alpha — still transparent export.
 *
 * @param {Uint8ClampedArray | Uint8Array} topDownRgba — full export frame, top-down
 * @param {number} fullW
 * @param {number} fullH
 * @param {object} cropInfo — from `ImageExporter._calculateCropRegion`
 * @returns {HTMLCanvasElement}
 */
export function extractCroppedTransparentCanvas(topDownRgba, fullW, fullH, cropInfo) {
  const plannedW = cropInfo.fullRenderWidth;
  const plannedH = cropInfo.fullRenderHeight;
  const actualW = cropInfo.actualFullRenderWidth ?? fullW;
  const actualH = cropInfo.actualFullRenderHeight ?? fullH;
  const scaleX = plannedW > 0 ? actualW / plannedW : 1;
  const scaleY = plannedH > 0 ? actualH / plannedH : 1;

  const cropX = Math.floor(cropInfo.pixelMinX * cropInfo.scale * scaleX);
  const cropY = Math.floor(cropInfo.pixelMinY * cropInfo.scale * scaleY);
  const cropW = Math.max(
    1,
    Math.min(actualW - cropX, Math.ceil(cropInfo.cropWidth * cropInfo.scale * scaleX)),
  );
  const cropH = Math.max(
    1,
    Math.min(actualH - cropY, Math.ceil(cropInfo.cropHeight * cropInfo.scale * scaleY)),
  );

  const regionPixels = new Uint8ClampedArray(cropW * cropH * 4);
  for (let y = 0; y < cropH; y += 1) {
    for (let x = 0; x < cropW; x += 1) {
      const srcIdx = ((cropY + y) * fullW + (cropX + x)) * 4;
      const dstIdx = (y * cropW + x) * 4;
      regionPixels[dstIdx] = topDownRgba[srcIdx];
      regionPixels[dstIdx + 1] = topDownRgba[srcIdx + 1];
      regionPixels[dstIdx + 2] = topDownRgba[srcIdx + 2];
      regionPixels[dstIdx + 3] = topDownRgba[srcIdx + 3];
    }
  }

  return cropTransparentTopDownRgbaToCanvas(regionPixels, cropW, cropH);
}

/**
 * Composer RGB + scene-alpha merge, returned top-down (canvas row order).
 *
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   scene: import('three').Scene,
 *   camera: import('three').Camera,
 *   composer?: import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer,
 *   width: number,
 *   height: number,
 *   renderFrame: () => void,
 *   finishGpu?: () => void,
 * }} deps
 * @returns {Uint8ClampedArray}
 */
export function readTransparentMergedTopDownRgba(deps) {
  const {
    renderer,
    scene,
    camera,
    composer,
    width,
    height,
    renderFrame,
    finishGpu,
  } = deps;

  if (!composer) {
    renderFrame();
    finishGpu?.();
    const canvas = renderer.domElement;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, width, height);
    return new Uint8ClampedArray(imageData.data);
  }

  const previousRenderToScreen = composer.renderToScreen;
  composer.renderToScreen = false;
  let postPixels = null;
  try {
    renderFrame();
    finishGpu?.();

    const byteRT = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    try {
      postPixels = new Uint8Array(width * height * 4);
      composer.copyPass.render(
        renderer,
        byteRT,
        getComposerOutputRenderTarget(composer),
        0,
        false,
      );
      renderer.readRenderTargetPixels(byteRT, 0, 0, width, height, postPixels);
    } finally {
      byteRT.dispose();
    }
  } finally {
    composer.renderToScreen = previousRenderToScreen;
  }

  const alphaRT = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    samples: renderer.capabilities?.isWebGL2 ? 4 : 0,
  });

  let alphaPixels = null;
  try {
    renderer.setRenderTarget(alphaRT);
    renderer.setClearColor(0x000000, 0);
    renderer.setClearAlpha(0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    alphaPixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(alphaRT, 0, 0, width, height, alphaPixels);
  } finally {
    alphaRT.dispose();
  }

  const merged = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < merged.length; i += 4) {
    const a = alphaPixels[i + 3];
    merged[i + 3] = a;
    if (a === 0) {
      merged[i] = 0;
      merged[i + 1] = 0;
      merged[i + 2] = 0;
    } else if (a < 255) {
      merged[i] = alphaPixels[i];
      merged[i + 1] = alphaPixels[i + 1];
      merged[i + 2] = alphaPixels[i + 2];
    } else {
      merged[i] = postPixels[i];
      merged[i + 1] = postPixels[i + 1];
      merged[i + 2] = postPixels[i + 2];
    }
  }

  const topDown = new Uint8ClampedArray(width * height * 4);
  const rowStride = width * 4;
  for (let y = 0; y < height; y += 1) {
    const srcRow = (height - 1 - y) * rowStride;
    const dstRow = y * rowStride;
    topDown.set(merged.subarray(srcRow, srcRow + rowStride), dstRow);
  }

  return topDown;
}
