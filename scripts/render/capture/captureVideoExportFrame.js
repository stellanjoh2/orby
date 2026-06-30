/**
 * Single-frame video export capture — same raster path as PNG sequence encode (frame 0 = still PNG).
 *
 * @typedef {object} VideoExportFrameTiming
 * @property {number} t — normalized 0…1 (matches encode loop: frameIndex / totalFrames)
 * @property {number} frameIndex — 0 … totalFrames - 1
 * @property {number} totalFrames
 * @property {number} fps
 * @property {number} durationSec
 */

/**
 * Map scrub progress or frame index to encode-loop timing.
 *
 * @param {number} totalFrames
 * @param {{ previewT?: number, previewFrameIndex?: number }} [opts]
 * @returns {VideoExportFrameTiming}
 */
export function resolveVideoExportFrameTiming(
  totalFrames,
  { previewT, previewFrameIndex } = {},
) {
  const frames = Math.max(2, Math.round(totalFrames));
  let frameIndex = 0;
  if (Number.isFinite(previewFrameIndex)) {
    frameIndex = Math.min(frames - 1, Math.max(0, Math.round(previewFrameIndex)));
  } else if (Number.isFinite(previewT)) {
    const t = Math.max(0, Math.min(1, previewT));
    frameIndex = Math.min(frames - 1, Math.round(t * (frames - 1)));
    return {
      t,
      frameIndex,
      totalFrames: frames,
      fps: 0,
      durationSec: 0,
    };
  }
  const t = frameIndex / frames;
  return {
    t,
    frameIndex,
    totalFrames: frames,
    fps: 0,
    durationSec: 0,
  };
}

/**
 * Apply export frame drives, sync framebuffer, and read back one PNG blob.
 * Caller owns session setup (size, feature hooks, export drives begin/end).
 *
 * @param {import('../VideoExporter.js').VideoExporter} exporter
 * @param {object} frameParams — `_applyVideoExportFrame` args
 * @param {{ transparent?: boolean, exportWidth?: number, exportHeight?: number, transparentFraming?: import('../imageExportFraming.js').TransparentFraming }} [captureOpts]
 * @returns {{ blob: Blob, width: number, height: number, cropped: boolean }}
 */
export function captureVideoExportFrameBlob(exporter, frameParams, captureOpts = {}) {
  exporter._applyVideoExportFrame(frameParams);
  exporter._syncExportCaptureFramebuffer();
  return exporter._captureCurrentFramePngBlob(captureOpts);
}
