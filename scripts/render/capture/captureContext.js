/**
 * Shared capture context — dimensions and render options for offline raster capture.
 */
import { resolveExportTimeSec } from './captureExportFrameDrives.js';

/**
 * @typedef {object} CaptureSize
 * @property {number} width — backing-store pixels
 * @property {number} height
 * @property {number} [pixelRatio=1] — export uses 1; viewport preview density kept for PNG scale math
 * @property {number} cameraAspect — width / height
 * @property {number} [previewDensity] — viewport DPR before export resize (PNG scale)
 * @property {number} [scale] — PNG export UI scale (1 or 2)
 *
 * @typedef {object} CaptureFrameOptions
 * @property {boolean} [transparent=false]
 * @property {number} [frameIndex]
 * @property {number} [fps]
 * @property {number} [exportTimeSec]
 *
 * @typedef {object} CaptureRenderDeps
 * @property {import('three').WebGLRenderer} renderer
 * @property {import('../ImageExporter.js').ImageExporter} imageExporter
 * @property {{ renderComposerPassForExport?: (opts?: { transparent?: boolean }) => void }} [composerLifecycle]
 * @property {() => void} [renderComposerPassForExport]
 * @property {import('../BackgroundController.js').BackgroundController} [backgroundController]
 */

/**
 * @param {CaptureSize} size
 * @param {CaptureFrameOptions} [frameOpts]
 */
export function createCaptureContext(size, frameOpts = {}) {
  const width = Math.max(1, Math.round(size.width));
  const height = Math.max(1, Math.round(size.height));
  const frameIndex = Number.isFinite(frameOpts.frameIndex)
    ? frameOpts.frameIndex
    : undefined;
  const fps = Number.isFinite(frameOpts.fps) ? frameOpts.fps : undefined;
  const exportTimeSec = Number.isFinite(frameOpts.exportTimeSec)
    ? frameOpts.exportTimeSec
    : resolveExportTimeSec(frameIndex, fps);
  return {
    width,
    height,
    pixelRatio: size.pixelRatio ?? 1,
    cameraAspect: size.cameraAspect ?? width / Math.max(1e-6, height),
    previewDensity: size.previewDensity,
    scale: size.scale,
    transparent: frameOpts.transparent === true,
    frameIndex,
    fps,
    exportTimeSec: exportTimeSec ?? undefined,
  };
}
