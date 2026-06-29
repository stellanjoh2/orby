import * as THREE from 'three';
import {
  ensureExportCapturePixelRatio,
  forceExportCaptureFramebuffer,
} from './forceExportCaptureFramebuffer.js';
import { pinRenderTargetPhysicalViewport } from '../resetRendererFullViewport.js';

/** @param {Uint8Array} pixels bottom-up GL order */
function pixelsBottomUpToTopDownClamped(pixels, width, height) {
  const out = new Uint8ClampedArray(width * height * 4);
  const row = width * 4;
  for (let y = 0; y < height; y += 1) {
    const srcRow = (height - 1 - y) * row;
    const dstRow = y * row;
    out.set(pixels.subarray(srcRow, srcRow + row), dstRow);
  }
  return out;
}

/** @param {number} w @param {number} h */
function createPlateRenderTarget(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

/**
 * Cam/FX display chain on a flat gradient — exposure + tone map (+ CA), no bloom.
 * Uses dedicated ping-pong RTs — never touches composer.readBuffer/writeBuffer.
 *
 * @param {{
 *   renderer: THREE.WebGLRenderer,
 *   composer: import('../MeshglEffectComposer.js').MeshglEffectComposer,
 *   postPipeline?: import('../PostProcessingPipeline.js').PostProcessingPipeline,
 * }} deps
 * @param {THREE.WebGLRenderTarget} sourceRT
 * @param {number} width
 * @param {number} height
 * @returns {Uint8ClampedArray}
 */
function runDisplayGradingOnGradientPlate(deps, sourceRT, width, height) {
  const { renderer, composer, postPipeline } = deps;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  const gradingPass =
    postPipeline?.gradingPass
    ?? postPipeline?.exposurePass
    ?? null;
  const lensPass = postPipeline?.lensDistortionPass ?? null;
  const startIdx = gradingPass ? composer.passes.indexOf(gradingPass) : -1;
  if (startIdx < 0) {
    const pixels = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(sourceRT, 0, 0, w, h, pixels);
    return pixelsBottomUpToTopDownClamped(pixels, w, h);
  }
  const endIdx =
    lensPass && composer.passes.indexOf(lensPass) >= 0
      ? composer.passes.indexOf(lensPass)
      : composer.passes.length;

  const rtA = createPlateRenderTarget(w, h);
  const rtB = createPlateRenderTarget(w, h);
  let readRT = rtA;
  let writeRT = rtB;

  const currentRenderTarget = renderer.getRenderTarget();
  try {
    composer.copyPass.render(renderer, readRT, sourceRT, 0, false);

    let maskActive = false;
    for (let i = startIdx; i < endIdx; i += 1) {
      const pass = composer.passes[i];
      if (pass.enabled === false) continue;
      ensureExportCapturePixelRatio({ renderer, composer: null });
      pinRenderTargetPhysicalViewport(renderer, w, h);
      pass.renderToScreen = false;
      pass.render(renderer, writeRT, readRT, 0, maskActive);
      if (pass.needsSwap) {
        const tmp = readRT;
        readRT = writeRT;
        writeRT = tmp;
      }
    }

    const byteRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    try {
      composer.copyPass.render(renderer, byteRT, readRT, 0, false);
      const pixels = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(byteRT, 0, 0, w, h, pixels);
      return pixelsBottomUpToTopDownClamped(pixels, w, h);
    } finally {
      byteRT.dispose();
    }
  } finally {
    renderer.setRenderTarget(currentRenderTarget);
    rtA.dispose();
    rtB.dispose();
  }
}

/**
 * Isolated full-frame canvas blit → display grading (exposure/tone/CA), no bloom.
 *
 * @param {{
 *   renderer: THREE.WebGLRenderer,
 *   composer: import('../MeshglEffectComposer.js').MeshglEffectComposer,
 *   postPipeline?: import('../PostProcessingPipeline.js').PostProcessingPipeline,
 *   imageExporter?: import('../ImageExporter.js').ImageExporter,
 *   backgroundController?: import('../BackgroundController.js').BackgroundController,
 * }} deps
 * @param {number} width
 * @param {number} height
 * @returns {Uint8ClampedArray | null}
 */
export function renderDisplayGradedGradientPlate(deps, width, height) {
  const { renderer, composer, imageExporter, backgroundController } = deps;
  const gradientCtrl = backgroundController?.gradientController;
  if (!gradientCtrl?.isActive?.() || !composer || !renderer) return null;

  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  forceExportCaptureFramebuffer(
    {
      renderer,
      composer,
      syncPostProcessingForLogicalSize:
        imageExporter?.syncPostProcessingForLogicalSize?.bind(imageExporter),
    },
    w,
    h,
  );
  ensureExportCapturePixelRatio({ renderer, composer });
  imageExporter?._ensureComposerMatchesDrawingBuffer?.({ strict: true });

  gradientCtrl.syncToDrawingBuffer(w, h, { forceRedraw: true });

  const rawRT = createPlateRenderTarget(w, h);
  try {
    renderer.setRenderTarget(rawRT);
    pinRenderTargetPhysicalViewport(renderer, w, h);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, false, false);
    gradientCtrl.blitToRenderTarget(renderer, w, h);
    renderer.setRenderTarget(null);
    return runDisplayGradingOnGradientPlate(deps, rawRT, w, h);
  } finally {
    rawRT.dispose();
  }
}
