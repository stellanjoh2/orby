import { fullViewportLogicalSize } from './fullViewportLogicalSize.js';
import { getDrawingBufferPixels } from './drawingBufferSize.js';

/**
 * Pin GL viewport to exact backing-store pixels on the active target (export capture @ DPR 1).
 * @param {import('three').WebGLRenderer} renderer
 * @param {number} pixelWidth
 * @param {number} pixelHeight
 */
export function pinRenderTargetPhysicalViewport(renderer, pixelWidth, pixelHeight) {
  if (!renderer) return;
  const w = Math.max(1, Math.floor(pixelWidth));
  const h = Math.max(1, Math.floor(pixelHeight));
  if (renderer.getPixelRatio() !== 1) {
    renderer.setPixelRatio(1);
  }
  renderer.setViewport(0, 0, w, h);
  if (typeof renderer.setScissorTest === 'function') {
    renderer.setScissorTest(false);
  }
}

/**
 * Full-canvas GL viewport + scissor off — shared by composer passes and extra scene renders.
 * Three.js multiplies setViewport(w,h) by renderer.getPixelRatio() for the GL viewport.
 * When pixelRatio is stale (Ultra 2× after 1080p export resize), rt.width/pr undershoots → cropped gradient.
 */
export function resetRendererFullViewport(renderer) {
  if (!renderer) return;
  const rt = renderer.getRenderTarget();
  if (rt && rt.width > 0 && rt.height > 0) {
    const pr = Math.max(1e-6, renderer.getPixelRatio());
    renderer.setViewport(0, 0, rt.width / pr, rt.height / pr);
  } else {
    const { width: dbW, height: dbH } = getDrawingBufferPixels(renderer);
    const pr = Math.max(1e-6, renderer.getPixelRatio());
    renderer.setViewport(0, 0, dbW / pr, dbH / pr);
  }
  if (typeof renderer.setScissorTest === 'function') {
    renderer.setScissorTest(false);
  }
}

/** Default-framebuffer viewport using logical studio size (live viewport). */
export function resetRendererViewportToCanvasLogical(renderer) {
  if (!renderer) return;
  const v = fullViewportLogicalSize(renderer);
  renderer.setViewport(0, 0, v.x, v.y);
  if (typeof renderer.setScissorTest === 'function') {
    renderer.setScissorTest(false);
  }
}

/** Pin GL viewport/scissor to logical width/height (Three multiplies by pixelRatio internally). */
export function pinRendererViewportLogical(renderer, logicalW, logicalH) {
  if (!renderer) return;
  const w = Math.max(1, Math.floor(logicalW));
  const h = Math.max(1, Math.floor(logicalH));
  renderer.setViewport(0, 0, w, h);
  if (typeof renderer.setScissor === 'function') {
    renderer.setScissor(0, 0, w, h);
  }
  if (typeof renderer.setScissorTest === 'function') {
    renderer.setScissorTest(false);
  }
}
