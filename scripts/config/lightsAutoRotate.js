/** Wall-clock seconds for one full 360° lights rig rotation (live + export). */
export const LIGHTS_AUTO_ROTATE_CYCLE_SEC = 10;

/** Degrees per second — matches {@link LIGHTS_AUTO_ROTATE_CYCLE_SEC}. */
export function lightsAutoRotateDegreesPerSecond() {
  return 360 / LIGHTS_AUTO_ROTATE_CYCLE_SEC;
}

/**
 * Lights rotation (degrees) at normalized export progress `t` ∈ [0, 1].
 * @param {number} startDegrees
 * @param {number} durationSec — export clip length (5, 10, or 15)
 * @param {number} t
 */
export function lightsRotationForExportFrame(startDegrees, durationSec, t) {
  const deg = startDegrees + lightsAutoRotateDegreesPerSecond() * durationSec * t;
  return ((deg % 360) + 360) % 360;
}
