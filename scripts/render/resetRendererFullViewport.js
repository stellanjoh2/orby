import { fullViewportLogicalSize } from './fullViewportLogicalSize.js';

/** Full-canvas GL viewport + scissor off — shared by composer passes and extra scene renders. */
export function resetRendererFullViewport(renderer) {
  if (!renderer) return;
  const v = fullViewportLogicalSize(renderer);
  renderer.setViewport(0, 0, v.x, v.y);
  if (typeof renderer.setScissorTest === 'function') {
    renderer.setScissorTest(false);
  }
}
