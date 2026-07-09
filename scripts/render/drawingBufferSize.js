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
 * Derived from the GL backing store ÷ pixel ratio — not renderer.getSize(), which can stay
 * stale after 1080p export restore when only DPR changes at the same logical layout.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Vector2} [target]
 */
export function getDrawingBufferLogicalSize(renderer, target = new THREE.Vector2()) {
  const pr = Math.max(1e-6, renderer.getPixelRatio());
  const { width: pw, height: ph } = getDrawingBufferPixels(renderer);
  return target.set(pw / pr, ph / pr);
}

/**
 * Backing-store pixels aligned with {@link getDrawingBufferLogicalSize} × pixel ratio.
 * Use for full-frame overlays (gradients) that must match composer viewport sizing.
 * @param {THREE.WebGLRenderer} renderer
 * @returns {{ width: number, height: number }}
 */
export function getViewportBackingStorePixels(renderer) {
  const { width, height } = getDrawingBufferPixels(renderer);
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

/**
 * Logical studio viewport pixels — live gradient canvas size.
 * Independent of Ultra DPR; the GPU blit stretches to the active render target.
 * @param {THREE.WebGLRenderer} renderer
 * @returns {{ width: number, height: number }}
 */
export function getViewportLogicalPixels(renderer) {
  const logical = getDrawingBufferLogicalSize(renderer);
  return {
    width: Math.max(1, Math.round(logical.x)),
    height: Math.max(1, Math.round(logical.y)),
  };
}

/**
 * Resize renderer logical units + pixel ratio and coerce the WebGL backing store to match.
 * Required after export capture (setDrawingBufferSize at DPR 1) before gradient/viewport sync.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {number} logicalWidth
 * @param {number} logicalHeight
 * @param {number} pixelRatio
 * @returns {{ width: number, height: number, pixelRatio: number }}
 */
export function coerceRendererLogicalSize(renderer, logicalWidth, logicalHeight, pixelRatio) {
  const width = Math.max(1, Math.round(logicalWidth));
  const height = Math.max(1, Math.round(logicalHeight));
  const pr = Math.max(1e-6, pixelRatio);
  const expectedW = Math.max(1, Math.round(width * pr));
  const expectedH = Math.max(1, Math.round(height * pr));

  // setDrawingBufferSize is authoritative — setSize alone can skip GL resize when logical
  // dimensions are unchanged (1080p export ↔ Ultra restore at the same 1920×1080 layout).
  if (typeof renderer.setDrawingBufferSize === 'function') {
    renderer.setDrawingBufferSize(width, height, pr);
  } else {
    renderer.setPixelRatio(pr);
    renderer.setSize(width, height, false);
  }

  let actual = getDrawingBufferPixels(renderer);
  if (
    Math.abs(actual.width - expectedW) > 2
    || Math.abs(actual.height - expectedH) > 2
  ) {
    renderer.setPixelRatio(pr);
    renderer.setSize(width, height, false);
    actual = getDrawingBufferPixels(renderer);
  }

  return { width, height, pixelRatio: pr };
}
