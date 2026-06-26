import * as THREE from 'three';
import { fullViewportLogicalSize } from '../fullViewportLogicalSize.js';
import { getExportVideoResolutionSize } from '../exportVideoResolution.js';

/**
 * @typedef {import('./captureContext.js').CaptureSize} CaptureSize
 */

/**
 * Largest square texture / renderbuffer the current GL context can allocate.
 * @param {import('three').WebGLRenderer} renderer
 */
export function getMaxCapturePixelDimension(renderer) {
  const gl = renderer?.getContext?.();
  if (!gl) return 8192;
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 8192;
  const maxRb = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || maxTex;
  return Math.max(1, Math.min(maxTex, maxRb, 16384));
}

/**
 * Scale down when total pixel count exceeds a browser canvas area budget.
 * @param {number} width
 * @param {number} height
 * @param {number | null | undefined} maxPixelArea
 * @returns {{ width: number, height: number }}
 */
export function clampCapturePixelArea(width, height, maxPixelArea) {
  let w = Math.max(1, Math.round(width));
  let h = Math.max(1, Math.round(height));
  if (!maxPixelArea || maxPixelArea <= 0 || w * h <= maxPixelArea) {
    return { width: w, height: h };
  }
  const fit = Math.sqrt(maxPixelArea / (w * h));
  return {
    width: Math.max(1, Math.floor(w * fit)),
    height: Math.max(1, Math.floor(h * fit)),
  };
}

/**
 * Scale down when dimensions exceed GPU / canvas limits.
 * @param {number} width
 * @param {number} height
 * @param {import('three').WebGLRenderer} renderer
 * @param {number | null | undefined} [maxPixelArea] — learned browser canvas pixel budget
 * @returns {{ width: number, height: number }}
 */
export function clampCapturePixelSize(width, height, renderer, maxPixelArea = null) {
  const cap = getMaxCapturePixelDimension(renderer);
  let w = Math.max(1, Math.round(width));
  let h = Math.max(1, Math.round(height));
  if (w > cap || h > cap) {
    const fit = Math.min(cap / w, cap / h);
    w = Math.max(1, Math.floor(w * fit));
    h = Math.max(1, Math.floor(h * fit));
  }
  return clampCapturePixelArea(w, h, maxPixelArea);
}

/**
 * @param {number} width
 * @param {number} height
 * @returns {CaptureSize}
 */
function captureSizeFromPixels(width, height, extra = {}) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return {
    width: w,
    height: h,
    pixelRatio: 1,
    cameraAspect: w / Math.max(1e-6, h),
    ...extra,
  };
}

/**
 * PNG 1×/2× — multiples of preview backing store (logical × preview DPR).
 * Render quality tier (Medium/Ultra/Low) is applied on resize via `syncPostProcessingForLogicalSize`.
 * @param {import('three').WebGLRenderer} renderer
 * @param {number} scale — 1 or 2 from export UI
 * @param {number | null | undefined} [maxPixelArea]
 * @returns {CaptureSize}
 */
export function resolvePngExportCaptureSize(renderer, scale, maxPixelArea = null) {
  const logical = fullViewportLogicalSize(renderer);
  const previewDensity = Math.max(1e-6, renderer.getPixelRatio());
  const s = Math.max(0.25, Number(scale) || 1);
  const { width, height } = clampCapturePixelSize(
    logical.x * previewDensity * s,
    logical.y * previewDensity * s,
    renderer,
    maxPixelArea,
  );
  return captureSizeFromPixels(width, height, {
    previewDensity,
    scale: s,
  });
}

/**
 * Video preset pixels (1080p / 1440p / 4K × aspect).
 * @param {unknown} resolution
 * @param {unknown} [aspectRatio]
 * @returns {CaptureSize}
 */
export function resolveVideoExportCaptureSize(resolution, aspectRatio) {
  const { width, height } = getExportVideoResolutionSize(resolution, aspectRatio);
  return captureSizeFromPixels(width, height);
}

/**
 * Current viewport backing store (dev thumbnail bake, capture preview).
 * @param {import('three').WebGLRenderer} renderer
 * @returns {CaptureSize}
 */
export function resolveViewportCaptureSize(renderer) {
  const db = new THREE.Vector2();
  renderer.getDrawingBufferSize(db);
  return captureSizeFromPixels(db.x, db.y);
}

/**
 * Single entry for tier / resolution / aspect knobs.
 *
 * @param {{
 *   mode: 'png' | 'video' | 'viewport' | 'pixels',
 *   renderer?: import('three').WebGLRenderer,
 *   scale?: number,
 *   resolution?: unknown,
 *   aspectRatio?: unknown,
 *   width?: number,
 *   height?: number,
 * }} spec
 * @returns {CaptureSize}
 */
export function resolveCaptureSize(spec) {
  switch (spec.mode) {
    case 'png':
      if (!spec.renderer) {
        throw new Error('resolveCaptureSize(png) requires renderer');
      }
      return resolvePngExportCaptureSize(spec.renderer, spec.scale ?? 1);
    case 'video':
      return resolveVideoExportCaptureSize(spec.resolution, spec.aspectRatio);
    case 'viewport':
      if (!spec.renderer) {
        throw new Error('resolveCaptureSize(viewport) requires renderer');
      }
      return resolveViewportCaptureSize(spec.renderer);
    case 'pixels':
      return captureSizeFromPixels(spec.width ?? 1, spec.height ?? 1);
    default:
      throw new Error(`Unknown capture size mode: ${spec.mode}`);
  }
}
