import * as THREE from 'three';

/**
 * Logical width/height for `renderer.setViewport(0, 0, w, h)` covering the full WebGL backing store.
 * Prefer `drawingBufferWidth` / `drawingBufferHeight` — Three's cached `getDrawingBufferSize()` can
 * disagree with the real framebuffer after canvas clamp or export resize; partial viewports then
 * produce horizontal black bands (often ~25% from the top after podium blur / reflector passes).
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Vector2} [target]
 */
export function fullViewportLogicalSize(renderer, target = new THREE.Vector2()) {
  const gl = renderer.getContext();
  const pr = Math.max(1e-6, renderer.getPixelRatio());
  if (gl && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0) {
    return target.set(gl.drawingBufferWidth / pr, gl.drawingBufferHeight / pr);
  }
  renderer.getDrawingBufferSize(target);
  return target.set(target.x / pr, target.y / pr);
}
