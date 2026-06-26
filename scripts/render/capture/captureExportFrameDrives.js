/**
 * Shared export clock for mesh clips, creative look uTime, grain, and font typography.
 * Movement drives (turntable, camera, HDRI spin) stay in VideoExporter — timed scene state only here.
 */

/**
 * @param {number} frameIndex
 * @param {number} fps
 * @returns {number | null}
 */
export function resolveExportTimeSec(frameIndex, fps) {
  if (!Number.isFinite(frameIndex) || !Number.isFinite(fps) || fps <= 0) {
    return null;
  }
  return Math.max(0, frameIndex) / Math.max(1, fps);
}

/**
 * @typedef {object} TimedExportFrameDriveDeps
 * @property {(frameIndex: number, fps: number) => void} [applyExportAnimationDriveFrame]
 * @property {(frameIndex: number, fps: number) => void} [applyCreativeLookExportFrame]
 * @property {(frameIndex: number, fps: number) => void} [applyGrainExportFrame]
 * @property {(frameIndex: number, fps: number) => void} [applyFontTextRevealExportFrame]
 */

/**
 * Apply mesh / look / grain / typography export time for one encode frame.
 *
 * @param {{
 *   frameIndex?: number,
 *   fps?: number,
 *   meshAnimation?: { include?: boolean },
 * }} timing
 * @param {TimedExportFrameDriveDeps} deps
 */
export function applyTimedExportFrameDrives(timing, deps) {
  const { frameIndex, fps, meshAnimation } = timing;
  if (
    meshAnimation?.include
    && typeof frameIndex === 'number'
    && typeof fps === 'number'
  ) {
    deps.applyExportAnimationDriveFrame?.(frameIndex, fps);
  }
  if (typeof frameIndex === 'number' && typeof fps === 'number' && fps > 0) {
    deps.applyCreativeLookExportFrame?.(frameIndex, fps);
    deps.applyGrainExportFrame?.(frameIndex, fps);
    deps.applyFontTextRevealExportFrame?.(frameIndex, fps);
  }
}
