export const EXPORT_FOV_OFFSET_MIN = -40;
export const EXPORT_FOV_OFFSET_MAX = 40;

/** @param {unknown} value — degrees relative to current FOV at export start (0 = no change) */
export function normalizeExportFovOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(EXPORT_FOV_OFFSET_MAX, Math.max(EXPORT_FOV_OFFSET_MIN, n));
}

/** @param {{ fovOffset?: unknown }} [movements] */
export function needsExportFovDrive(movements) {
  return Math.abs(normalizeExportFovOffset(movements?.fovOffset)) > 0;
}

/**
 * Normalize video export movement toggles from UI / legacy `mode` settings.
 * @param {Record<string, unknown>} [settings]
 */
export function normalizeExportVideoMovements(settings = {}) {
  let turntable = !!settings.turntable;
  let orbit = !!settings.orbit;
  let zoomIn = !!settings.zoomIn;
  let zoomOut = !!settings.zoomOut;
  let tiltLeft = !!settings.tiltLeft;
  let tiltRight = !!settings.tiltRight;

  // Legacy single-mode export settings.
  if (settings.mode === 'orbit') {
    orbit = true;
    turntable = false;
  } else if (settings.mode === 'turntable') {
    turntable = true;
    orbit = false;
  }

  const zoomDistance = Number.isFinite(Number(settings.zoomDistance))
    ? Math.max(0.01, Number(settings.zoomDistance))
    : 1.5;
  const tiltAngle = Number.isFinite(Number(settings.tiltAngle))
    ? Math.min(180, Math.max(0, Number(settings.tiltAngle)))
    : 15;
  const fovOffset = normalizeExportFovOffset(settings.fovOffset);

  return {
    turntable,
    orbit,
    zoomIn,
    zoomOut,
    tiltLeft,
    tiltRight,
    zoomDistance,
    tiltAngle,
    fovOffset,
    zoom: zoomIn ? 'in' : zoomOut ? 'out' : null,
    tilt: tiltLeft ? 'left' : tiltRight ? 'right' : null,
  };
}

/** @param {ReturnType<typeof normalizeExportVideoMovements>} movements */
export function hasExportVideoMovement(movements) {
  return !!(
    movements?.turntable
    || movements?.orbit
    || movements?.zoomIn
    || movements?.zoomOut
    || movements?.tiltLeft
    || movements?.tiltRight
  );
}

/** @param {ReturnType<typeof normalizeExportVideoMovements>} movements */
export function exportVideoMovementLabel(movements) {
  const parts = [];
  if (movements.turntable) parts.push('turntable');
  if (movements.orbit) parts.push('orbit');
  if (movements.zoomIn) parts.push('zoomin');
  if (movements.zoomOut) parts.push('zoomout');
  if (movements.tiltLeft) parts.push('tiltleft');
  if (movements.tiltRight) parts.push('tiltright');
  return parts.length ? parts.join('_') : 'static';
}

/** @type {readonly [22.5, 45, 90]} */
export const EXPORT_SUBTLE_SPIN_DEGREES = [22.5, 45, 90];

/** @param {unknown} value @returns {0 | 22.5 | 45 | 90} */
export function normalizeExportSubtleSpinDegrees(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  for (const degrees of EXPORT_SUBTLE_SPIN_DEGREES) {
    if (Math.abs(n - degrees) < 1e-6) return degrees;
  }
  return 0;
}

/** @param {unknown} spins — 0 = no full 360° laps; 1 or 2 = full 360° laps */
export function normalizeExportSpins(spins) {
  const n = Number(spins);
  if (n === 0 || n === 2) return n;
  return 1;
}

/**
 * @param {Record<string, unknown>} [settings]
 * @returns {{
 *   fullSpins: 0 | 1 | 2,
 *   subtleSpinDegrees: 0 | 22.5 | 45 | 90,
 *   spinDirection: 'forward' | 'reverse',
 *   sign: 1 | -1,
 *   rotationDegrees: number,
 *   signedRotationDegrees: number,
 * }}
 */
export function normalizeExportSpinSettings(settings = {}) {
  const fullSpins = normalizeExportSpins(settings.spins);
  const subtleSpinDegrees = normalizeExportSubtleSpinDegrees(settings.subtleSpinDegrees);
  const spinDirection = settings.spinDirection === 'reverse' ? 'reverse' : 'forward';
  const sign = spinDirection === 'reverse' ? -1 : 1;
  const rotationDegrees = fullSpins > 0 ? fullSpins * 360 : subtleSpinDegrees;
  return {
    fullSpins,
    subtleSpinDegrees,
    spinDirection,
    sign,
    rotationDegrees,
    signedRotationDegrees: sign * rotationDegrees,
  };
}

/** @param {ReturnType<typeof normalizeExportSpinSettings>} spin */
export function exportSpinSequenceLabel(spin) {
  if (!spin?.rotationDegrees) return 'nospin';
  const dir = spin.spinDirection === 'reverse' ? 'rev' : 'fwd';
  if (spin.fullSpins > 0) return `${spin.fullSpins}x360_${dir}`;
  return `${spin.subtleSpinDegrees}deg_${dir}`;
}

/** @param {ReturnType<typeof normalizeExportSpinSettings>} spin */
export function exportSpinToastLabel(spin) {
  if (!spin?.rotationDegrees) return 'no spin';
  const dir = spin.spinDirection === 'reverse' ? 'reverse' : 'forward';
  if (spin.fullSpins > 0) {
    return `${spin.fullSpins} full spin${spin.fullSpins > 1 ? 's' : ''}, ${dir}`;
  }
  return `${spin.subtleSpinDegrees}° subtle spin, ${dir}`;
}

/** @param {unknown} value @returns {0 | 22.5 | 45 | 90} */
export function normalizeExportHdriRotationDegrees(value) {
  return normalizeExportSubtleSpinDegrees(value);
}

/**
 * @param {Record<string, unknown>} [settings]
 * @returns {{
 *   degrees: 0 | 22.5 | 45 | 90,
 *   spinDirection: 'forward' | 'reverse',
 *   sign: 1 | -1,
 *   signedDegrees: number,
 * }}
 */
export function normalizeExportHdriRotationSettings(settings = {}) {
  const degrees = normalizeExportHdriRotationDegrees(settings.hdriRotationDegrees);
  const spinDirection = settings.spinDirection === 'reverse' ? 'reverse' : 'forward';
  const sign = spinDirection === 'reverse' ? -1 : 1;
  return {
    degrees,
    spinDirection,
    sign,
    signedDegrees: sign * degrees,
  };
}

/** @param {ReturnType<typeof normalizeExportHdriRotationSettings>} hdri */
export function exportHdriRotationToastLabel(hdri) {
  if (!hdri?.degrees) return '';
  const dir = hdri.spinDirection === 'reverse' ? 'reverse' : 'forward';
  return `${hdri.degrees}° HDRI, ${dir}`;
}

/** Camera orbit, dolly zoom, and/or roll tilt — turntable only affects mesh rotation. */
export function needsExportCameraDrive(movements) {
  return !!(
    movements?.orbit
    || movements?.zoomIn
    || movements?.zoomOut
    || movements?.tiltLeft
    || movements?.tiltRight
  );
}

/**
 * @param {Record<string, unknown>} [settings]
 * @param {number} [clipCount]
 */
export function normalizeExportMeshAnimationSettings(settings = {}, clipCount = 0) {
  const count = Math.max(0, Number(clipCount) || 0);
  const hasClips = count > 0;
  const include = hasClips && settings.meshAnimationsInclude === true;
  const rawIndex = Number(settings.meshAnimationClipIndex);
  const clipIndex = include
    ? Math.min(count - 1, Math.max(0, Number.isFinite(rawIndex) ? rawIndex : 0))
    : 0;

  return { include, clipIndex, hasClips, clipCount: count };
}
