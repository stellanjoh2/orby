import { getDrawingBufferPixels } from '../drawingBufferSize.js';
import {
  pinRenderTargetPhysicalViewport,
  resetRendererFullViewport,
} from '../resetRendererFullViewport.js';

/**
 * Force renderer + composer ping-pong RTs to exact export backing-store pixels.
 * Required at 1080p when studio layout is already 1920×1080 logical @ 2× — setSize alone
 * can leave composer RTs at Ultra resolution while the drawing buffer shrinks to export size.
 *
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   composer?: import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer,
 *   syncPostProcessingForLogicalSize?: (w: number, h: number) => void,
 * }} deps
 * @param {number} pixelWidth
 * @param {number} pixelHeight
 * @returns {{ width: number, height: number }}
 */
export function forceExportCaptureFramebuffer(deps, pixelWidth, pixelHeight) {
  const { renderer, composer, syncPostProcessingForLogicalSize } = deps;
  const w = Math.max(1, Math.round(pixelWidth));
  const h = Math.max(1, Math.round(pixelHeight));

  // Must run before setDrawingBufferSize — same logical layout @ Ultra 2× → export 1× can
  // leave getPixelRatio() at 2 while the backing store is already 1920×1080 (cropped blit).
  renderer.setPixelRatio(1);

  if (typeof renderer.setDrawingBufferSize === 'function') {
    renderer.setDrawingBufferSize(w, h, 1);
  } else {
    renderer.setSize(w, h, false);
  }

  if (composer) {
    composer.setPixelRatio(1);
    composer.setSize(w, h);
    if (composer.renderTarget1) {
      composer.renderTarget1.setSize(w, h);
    }
    if (composer.renderTarget2) {
      composer.renderTarget2.setSize(w, h);
    }
  }

  syncPostProcessingForLogicalSize?.(w, h);

  renderer.setRenderTarget(null);
  resetRendererFullViewport(renderer);

  return getDrawingBufferPixels(renderer);
}

/** Pin export capture to DPR 1 and resync composer RTs when ratio was stale (Ultra → 1080p). */
export function ensureExportCapturePixelRatio(deps) {
  const { renderer, composer } = deps;
  if (!renderer) return;
  const wasStale = renderer.getPixelRatio() !== 1;
  if (wasStale) {
    renderer.setPixelRatio(1);
  }
  if (composer) {
    composer.setPixelRatio?.(1);
    if (wasStale && composer.renderTarget1) {
      const { width: w, height: h } = getDrawingBufferPixels(renderer);
      if (w > 0 && h > 0) {
        composer.setSize?.(w, h);
        composer.renderTarget1.setSize(w, h);
        composer.renderTarget2?.setSize(w, h);
      }
    }
  }
}

/**
 * @param {import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer} composer
 * @param {number} pixelWidth
 * @param {number} pixelHeight
 * @returns {boolean}
 */
export function composerRenderTargetsMatchPixels(composer, pixelWidth, pixelHeight) {
  const rt = composer?.renderTarget1;
  if (!rt) return true;
  const w = Math.max(1, Math.round(pixelWidth));
  const h = Math.max(1, Math.round(pixelHeight));
  return Math.abs(rt.width - w) <= 2 && Math.abs(rt.height - h) <= 2;
}

/**
 * Black-clear composer ping-pong RTs at full physical pixels — drops stale gradient plates
 * left in readBuffer after isolated display-grading prep (1080p partial-viewport trap).
 *
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer} composer
 */
export function clearComposerRenderTargets(renderer, composer) {
  if (!renderer || !composer?.readBuffer) return;
  ensureExportCapturePixelRatio({ renderer, composer });
  const prev = renderer.getRenderTarget();
  const targets = [composer.readBuffer, composer.writeBuffer].filter(Boolean);
  try {
    for (const rt of targets) {
      renderer.setRenderTarget(rt);
      pinRenderTargetPhysicalViewport(renderer, rt.width, rt.height);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, false, false);
    }
  } finally {
    renderer.setRenderTarget(prev);
  }
}
