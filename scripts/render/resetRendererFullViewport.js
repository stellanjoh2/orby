import { fullViewportLogicalSize } from './fullViewportLogicalSize.js';

/** Full-canvas GL viewport + scissor off — shared by composer passes and extra scene renders. */
export function resetRendererFullViewport(renderer) {
  if (!renderer) return;
  const pr = Math.max(1e-6, renderer.getPixelRatio());
  const rt = renderer.getRenderTarget();
  if (rt && rt.width > 0 && rt.height > 0) {
    renderer.setViewport(0, 0, rt.width / pr, rt.height / pr);
  } else {
    const v = fullViewportLogicalSize(renderer);
    renderer.setViewport(0, 0, v.x, v.y);
  }
  if (typeof renderer.setScissorTest === 'function') {
    renderer.setScissorTest(false);
  }
}
