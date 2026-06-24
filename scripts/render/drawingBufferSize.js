import * as THREE from 'three';

/**
 * Actual WebGL backing-store pixels (authoritative over Three's cached getDrawingBufferSize).
 * @param {THREE.WebGLRenderer} renderer
 * @returns {{ width: number, height: number }}
 */
export function getDrawingBufferPixels(renderer) {
  const gl = renderer?.getContext?.();
  if (gl && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0) {
    return {
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
    };
  }
  const db = new THREE.Vector2();
  renderer.getDrawingBufferSize(db);
  return {
    width: Math.max(1, Math.floor(db.x)),
    height: Math.max(1, Math.floor(db.y)),
  };
}

/**
 * Logical width/height for `renderer.setViewport(0, 0, w, h)`.
 * Never undershoots the real backing store — partial viewports leave the radial gradient
 * in a corner while bloom/post still fill the frame (Ultra preview + 1080p export).
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Vector2} [target]
 */
export function getDrawingBufferLogicalSize(renderer, target = new THREE.Vector2()) {
  const pr = Math.max(1e-6, renderer.getPixelRatio());
  const { width: pw, height: ph } = getDrawingBufferPixels(renderer);
  const fromBuffer = target.set(pw / pr, ph / pr);

  const fromGetSize = new THREE.Vector2();
  renderer.getSize(fromGetSize);
  if (fromGetSize.x > 0 && fromGetSize.y > 0) {
    return target.set(
      Math.max(fromBuffer.x, fromGetSize.x),
      Math.max(fromBuffer.y, fromGetSize.y),
    );
  }
  return fromBuffer;
}
