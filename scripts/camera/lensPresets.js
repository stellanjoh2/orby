/**
 * Product-photography lens presets: focal lengths, sensor formats, and vertical FOV math.
 * Three.js perspective cameras use vertical FOV (degrees).
 */

export const LENS_FOCAL_PRESETS = [
  { focalMm: 14, label: 'Ultra wide' },
  { focalMm: 24, label: 'Wide' },
  { focalMm: 35, label: 'Wide' },
  { focalMm: 50, label: 'Standard' },
  { focalMm: 85, label: 'Portrait' },
  { focalMm: 100, label: 'Macro' },
  { focalMm: 135, label: 'Tele' },
  { focalMm: 200, label: 'Tele' },
];

/** Sensor height (mm) used for vertical FOV; width is informational for labels. */
export const LENS_SENSORS = {
  'full-frame': { label: 'Full frame (36mm)', heightMm: 24, widthMm: 36 },
  'aps-c': { label: 'APS-C (23.5mm)', heightMm: 15.6, widthMm: 23.5 },
  'm43': { label: 'Micro Four Thirds (17.3mm)', heightMm: 13, widthMm: 17.3 },
  'super-35': { label: 'Super 35 (24.9mm)', heightMm: 18.66, widthMm: 24.89 },
};

export const DEFAULT_LENS_SENSOR_ID = 'aps-c';

/** Manual slider + preset clamp (200mm tele on APS-C ≈ 4.5° — must stay below 10). */
export const FOV_MIN = 2;
export const FOV_MAX = 120;

const FOV_MATCH_TOLERANCE_DEG = 0.35;

/**
 * @param {number} focalMm
 * @param {string} sensorId
 * @returns {number} vertical FOV in degrees
 */
export function focalLengthToVerticalFovDeg(focalMm, sensorId) {
  const sensor = LENS_SENSORS[sensorId] ?? LENS_SENSORS[DEFAULT_LENS_SENSOR_ID];
  const f = Math.max(1, Number(focalMm) || 50);
  const h = sensor.heightMm;
  return (2 * Math.atan(h / (2 * f)) * 180) / Math.PI;
}

/**
 * @param {number} fovDeg vertical FOV
 * @param {number} min
 * @param {number} max
 */
export function clampFovDeg(fovDeg, min = FOV_MIN, max = FOV_MAX) {
  return Math.min(max, Math.max(min, fovDeg));
}

/**
 * When the render aspect changes (viewport → 16∶9 export) but framing should match the
 * viewport, adjust vertical FOV so horizontal FOV stays constant (Three.js uses vertical FOV).
 *
 * @param {number} verticalFovDeg
 * @param {number} fromAspect — width / height before resize
 * @param {number} toAspect — width / height after resize
 * @returns {number}
 */
export function verticalFovForAspectPreservingHorizontalFov(
  verticalFovDeg,
  fromAspect,
  toAspect,
) {
  const vfov = Number(verticalFovDeg);
  const fromAr = Number(fromAspect);
  const toAr = Number(toAspect);
  if (
    !Number.isFinite(vfov)
    || !Number.isFinite(fromAr)
    || !Number.isFinite(toAr)
    || fromAr <= 0
    || toAr <= 0
  ) {
    return vfov;
  }
  if (Math.abs(fromAr - toAr) < 1e-5) {
    return clampFovDeg(vfov);
  }
  const vfovRad = (vfov * Math.PI) / 180;
  const hfovRad = 2 * Math.atan(Math.tan(vfovRad * 0.5) * fromAr);
  const newVfovRad = 2 * Math.atan(Math.tan(hfovRad * 0.5) / toAr);
  return clampFovDeg((newVfovRad * 180) / Math.PI);
}

/**
 * Whether stored FOV still matches the preset + sensor combo (slider was not tweaked away).
 */
export function fovMatchesLensPreset(fovDeg, focalMm, sensorId) {
  if (focalMm == null || !Number.isFinite(focalMm)) return false;
  const expected = focalLengthToVerticalFovDeg(focalMm, sensorId);
  return Math.abs((fovDeg ?? 0) - expected) <= FOV_MATCH_TOLERANCE_DEG;
}

/**
 * @param {number} fovDeg
 * @param {string} sensorId
 * @returns {number | null} matching preset focal length, if any
 */
export function inferPresetFocalFromFov(fovDeg, sensorId) {
  for (const { focalMm } of LENS_FOCAL_PRESETS) {
    if (fovMatchesLensPreset(fovDeg, focalMm, sensorId)) return focalMm;
  }
  return null;
}
