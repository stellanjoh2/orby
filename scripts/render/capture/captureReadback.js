import * as THREE from 'three';
import { getComposerOutputRenderTarget } from '../composerOutputBuffer.js';
import { getDrawingBufferPixels } from '../drawingBufferSize.js';
import { fullViewportLogicalSize } from '../fullViewportLogicalSize.js';
import { LOG_CAPTURE_DEBUG } from '../../constants.js';
import { ensureExportCapturePixelRatio } from './forceExportCaptureFramebuffer.js';
import { pinRenderTargetPhysicalViewport } from '../resetRendererFullViewport.js';
import {
  captureByteTargetNeedsDepthBuffer,
  compositeAsciiGroundGridOnByteTarget,
  compositeWireframeOnByteTarget,
  shouldCompositeGroundGridForCapture,
  shouldCompositeWireframeForCapture,
} from './capturePostStackOverlays.js';

/**
 * Thrown when composer readback size ≠ requested capture size after one retry.
 */
export class CaptureSizeMismatchError extends Error {
  /**
   * @param {string} message
   * @param {CaptureDebugTuple} debug
   */
  constructor(message, debug) {
    super(message);
    this.name = 'CaptureSizeMismatchError';
    this.debug = debug;
  }
}

/**
 * @typedef {object} CaptureDebugTuple
 * @property {number} requestedW
 * @property {number} requestedH
 * @property {number} drawingBufferW
 * @property {number} drawingBufferH
 * @property {number | null} composerRTW
 * @property {number | null} composerRTH
 * @property {number} viewportLogicalW
 * @property {number} viewportLogicalH
 * @property {number | null} [readbackW]
 * @property {number | null} [readbackH]
 */

/**
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   composer?: import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer,
 * }} deps
 * @param {number} requestedW
 * @param {number} requestedH
 * @param {{ readbackW?: number, readbackH?: number }} [extra]
 * @returns {CaptureDebugTuple}
 */
export function buildCaptureDebugTuple(deps, requestedW, requestedH, extra = {}) {
  const { renderer, composer } = deps;
  const db = getDrawingBufferPixels(renderer);
  const logical = fullViewportLogicalSize(renderer);
  const outputRT = composer ? getComposerOutputRenderTarget(composer) : null;
  return {
    requestedW,
    requestedH,
    drawingBufferW: db.width,
    drawingBufferH: db.height,
    composerRTW: outputRT?.width ?? null,
    composerRTH: outputRT?.height ?? null,
    viewportLogicalW: logical.x,
    viewportLogicalH: logical.y,
    readbackW: extra.readbackW ?? null,
    readbackH: extra.readbackH ?? null,
  };
}

/**
 * Dev-only size tuple log — enable via `LOG_CAPTURE_DEBUG = true` in constants.
 *
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   composer?: import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer,
 * }} deps
 * @param {number} requestedW
 * @param {number} requestedH
 * @param {{ readbackW?: number, readbackH?: number, phase?: string }} [extra]
 */
export function logCaptureDebug(deps, requestedW, requestedH, extra = {}) {
  if (!LOG_CAPTURE_DEBUG) return;
  const tuple = buildCaptureDebugTuple(deps, requestedW, requestedH, extra);
  if (extra.phase) {
    console.debug(`[Orby capture] ${extra.phase}`, tuple);
    return;
  }
  console.debug('[Orby capture]', tuple);
}

/** Nearest-neighbor resize — legacy fallback only (`allowResample: true`). */
export function resampleRgba(src, srcW, srcH, dstW, dstH) {
  const dst = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y += 1) {
    const sy = Math.min(srcH - 1, Math.floor((y / dstH) * srcH));
    for (let x = 0; x < dstW; x += 1) {
      const sx = Math.min(srcW - 1, Math.floor((x / dstW) * srcW));
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
  return dst;
}

/**
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   composer: import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer,
 *   camera?: import('three').Camera,
 *   scene?: import('three').Scene | null,
 *   getGroundGrid?: () => import('three').Object3D | null | undefined,
 *   getWireframeOverlayMeshes?: () => import('three').Mesh[] | null | undefined,
 *   getWireframeThickness?: () => number,
 *   getCreativeLookAsciiActive?: () => boolean,
 *   getGridLineWidth?: () => number,
 *   exportScale?: number,
 *   ensureComposerMatchesDrawingBuffer?: (opts?: { strict?: boolean }) => void,
 * }} deps
 * @param {number} requestedW
 * @param {number} requestedH
 * @returns {{ pixels: Uint8Array, width: number, height: number }}
 */
function readComposerPixelsOnce(deps, requestedW, requestedH) {
  const { renderer, composer, ensureComposerMatchesDrawingBuffer } = deps;
  ensureComposerMatchesDrawingBuffer?.({ strict: true });

  const outputRT = getComposerOutputRenderTarget(composer);
  const readW = Math.max(1, outputRT?.width ?? requestedW);
  const readH = Math.max(1, outputRT?.height ?? requestedH);
  const compositeGrid =
    deps.camera
    && deps.scene
    && shouldCompositeGroundGridForCapture(deps);
  const compositeWireframe =
    deps.camera
    && deps.scene
    && shouldCompositeWireframeForCapture(deps);
  const needsDepthBuffer = captureByteTargetNeedsDepthBuffer(deps);

  const byteRT = new THREE.WebGLRenderTarget(readW, readH, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    // Depth needed so grid / visible-faces wireframe can depth-test against scene meshes.
    depthBuffer: needsDepthBuffer,
    stencilBuffer: false,
  });

  try {
    composer.copyPass.render(renderer, byteRT, outputRT, 0, false);
    if (compositeGrid) {
      compositeAsciiGroundGridOnByteTarget(deps, byteRT);
    }
    if (compositeWireframe) {
      compositeWireframeOnByteTarget(deps, byteRT);
    }
    const pixels = new Uint8Array(readW * readH * 4);
    renderer.readRenderTargetPixels(byteRT, 0, 0, readW, readH, pixels);
    return { pixels, width: readW, height: readH };
  } finally {
    byteRT.dispose();
  }
}

/**
 * Read the default framebuffer after `composer.renderToScreen === true` at export DPR 1.
 * Matches the live viewport path (fisheye renders to screen) — avoids ping-pong margin ghosts.
 *
 * @param {{ renderer: import('three').WebGLRenderer }} deps
 * @param {{ width: number, height: number, logDebug?: boolean }} opts
 * @returns {{ pixels: Uint8Array, width: number, height: number, topDown: true }}
 */
export function captureDrawingBufferReadback(deps, opts) {
  const requestedW = Math.max(1, Math.round(opts.width));
  const requestedH = Math.max(1, Math.round(opts.height));
  const { renderer } = deps;
  ensureExportCapturePixelRatio({ renderer, composer: null });
  renderer.setRenderTarget(null);
  pinRenderTargetPhysicalViewport(renderer, requestedW, requestedH);

  const gl = renderer.getContext();
  const pixels = new Uint8Array(requestedW * requestedH * 4);
  gl.readPixels(0, 0, requestedW, requestedH, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  if (opts.logDebug) {
    logCaptureDebug(
      { renderer, composer: null },
      requestedW,
      requestedH,
      { phase: 'drawingBufferReadback' },
    );
  }

  return {
    pixels,
    width: requestedW,
    height: requestedH,
  };
}

/**
 * Strict composer readback — exact `width × height`, retry once on mismatch, then throw.
 *
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   composer: import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer,
 *   camera?: import('three').Camera,
 *   scene?: import('three').Scene | null,
 *   getGroundGrid?: () => import('three').Object3D | null | undefined,
 *   getWireframeOverlayMeshes?: () => import('three').Mesh[] | null | undefined,
 *   getWireframeThickness?: () => number,
 *   getCreativeLookAsciiActive?: () => boolean,
 *   getGridLineWidth?: () => number,
 *   exportScale?: number,
 *   ensureComposerMatchesDrawingBuffer?: (opts?: { strict?: boolean }) => void,
 * }} deps
 * @param {{
 *   width: number,
 *   height: number,
 *   allowResample?: boolean,
 *   retryRender?: () => void,
 *   logDebug?: boolean,
 * }} opts
 * @returns {{ pixels: Uint8Array, width: number, height: number }}
 */
export function captureReadback(deps, opts) {
  const requestedW = Math.max(1, Math.round(opts.width));
  const requestedH = Math.max(1, Math.round(opts.height));
  const allowResample = opts.allowResample === true;

  let result = readComposerPixelsOnce(deps, requestedW, requestedH);

  if (result.width !== requestedW || result.height !== requestedH) {
    if (typeof opts.retryRender === 'function') {
      deps.ensureComposerMatchesDrawingBuffer?.({ strict: true });
      opts.retryRender();
      result = readComposerPixelsOnce(deps, requestedW, requestedH);
    }
  }

  if (result.width !== requestedW || result.height !== requestedH) {
    if (allowResample) {
      return {
        pixels: resampleRgba(
          result.pixels,
          result.width,
          result.height,
          requestedW,
          requestedH,
        ),
        width: requestedW,
        height: requestedH,
      };
    }

    const debug = buildCaptureDebugTuple(deps, requestedW, requestedH, {
      readbackW: result.width,
      readbackH: result.height,
    });
    console.error('[Orby capture] size mismatch', debug);
    throw new CaptureSizeMismatchError(
      `Capture buffer ${result.width}×${result.height} ≠ requested ${requestedW}×${requestedH}.`,
      debug,
    );
  }

  if (opts.logDebug) {
    logCaptureDebug(deps, requestedW, requestedH, {
      readbackW: result.width,
      readbackH: result.height,
      phase: 'readback',
    });
  }

  return result;
}
