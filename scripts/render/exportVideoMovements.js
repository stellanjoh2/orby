export const EXPORT_FOV_OFFSET_MIN = -40;
export const EXPORT_FOV_OFFSET_MAX = 40;

export const EXPORT_PITCH_OFFSET_MIN = -90;
export const EXPORT_PITCH_OFFSET_MAX = 90;

/** @param {unknown} value — degrees relative to current FOV at export start (0 = no change) */
export function normalizeExportFovOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(EXPORT_FOV_OFFSET_MAX, Math.max(EXPORT_FOV_OFFSET_MIN, n));
}

/** @param {unknown} value — degrees pitched around orbit target at export start (0 = no change) */
export function normalizeExportPitchOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(EXPORT_PITCH_OFFSET_MAX, Math.max(EXPORT_PITCH_OFFSET_MIN, n));
}

/** @param {{ fovOffset?: unknown }} [movements] */
export function needsExportFovDrive(movements) {
  return Math.abs(normalizeExportFovOffset(movements?.fovOffset)) > 0;
}

/** @param {{ pitchOffset?: unknown }} [movements] */
export function needsExportPitchDrive(movements) {
  return Math.abs(normalizeExportPitchOffset(movements?.pitchOffset)) > 0;
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
  const pitchOffset = normalizeExportPitchOffset(settings.pitchOffset);

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
    pitchOffset,
    zoom: zoomIn ? 'in' : zoomOut ? 'out' : null,
    tilt: tiltLeft ? 'left' : tiltRight ? 'right' : null,
  };
}

/**
 * @typedef {{
 *   fullSpins: 0 | 1 | 2,
 *   subtleSpinDegrees: 0 | 22.5 | 45 | 90,
 *   spinDirection: 'forward' | 'reverse',
 *   sign: 1 | -1,
 *   rotationDegrees: number,
 *   signedRotationDegrees: number,
 * }} ExportSpinSettings
 */

/** @param {{ spins?: unknown, subtleDegrees?: unknown, spinDirection?: unknown }} [source] */
function buildExportSpinSettings(source = {}) {
  const fullSpins = normalizeExportSpins(source.spins);
  const subtleSpinDegrees = normalizeExportSubtleSpinDegrees(source.subtleDegrees);
  const spinDirection = source.spinDirection === 'reverse' ? 'reverse' : 'forward';
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

/** @returns {ExportSpinSettings} */
function emptyExportSpinSettings() {
  return buildExportSpinSettings({ spins: 0, subtleDegrees: 0, spinDirection: 'forward' });
}

/** @param {Record<string, unknown>} settings */
function legacySpinTriple(settings) {
  return {
    spins: settings.spins,
    subtleDegrees: settings.subtleSpinDegrees,
    spinDirection: settings.spinDirection,
  };
}

/** @param {Record<string, unknown>} settings @param {'object' | 'camera'} prefix */
function resolveExplicitSpinSource(settings, prefix) {
  const spinsKey = prefix === 'object' ? 'objectSpins' : 'cameraSpins';
  const arcKey = prefix === 'object' ? 'objectSubtleDegrees' : 'cameraSubtleDegrees';
  const dirKey = prefix === 'object' ? 'objectSpinDirection' : 'cameraSpinDirection';
  const hasExplicit =
    settings[spinsKey] !== undefined
    || settings[arcKey] !== undefined
    || settings[dirKey] !== undefined;
  if (!hasExplicit) return null;
  return {
    spins: settings[spinsKey] !== undefined ? settings[spinsKey] : 0,
    subtleDegrees: settings[arcKey],
    spinDirection: settings[dirKey],
  };
}

/** @param {Record<string, unknown>} settings */
function hasExplicitObjectSpinFields(settings) {
  return resolveExplicitSpinSource(settings, 'object') != null;
}

/** @param {Record<string, unknown>} settings */
function hasExplicitCameraSpinFields(settings) {
  return resolveExplicitSpinSource(settings, 'camera') != null;
}

/**
 * Mesh turntable rotation — independent from camera orbit arc.
 * @param {Record<string, unknown>} [settings]
 * @returns {ExportSpinSettings}
 */
export function normalizeExportObjectSpinSettings(settings = {}) {
  const explicit = resolveExplicitSpinSource(settings, 'object');
  if (explicit) {
    return buildExportSpinSettings(explicit);
  }

  const movements = normalizeExportVideoMovements(settings);
  if (!movements.turntable) return emptyExportSpinSettings();

  const legacy = legacySpinTriple(settings);
  if (movements.orbit && !hasExplicitCameraSpinFields(settings)) {
    const fullSpins = normalizeExportSpins(legacy.spins);
    const subtle = normalizeExportSubtleSpinDegrees(legacy.subtleDegrees);
    // Legacy shared partial arc with orbit on — treat as camera orbit, static mesh.
    if (fullSpins === 0 && subtle > 0) return emptyExportSpinSettings();
  }

  return buildExportSpinSettings(legacy);
}

/**
 * Camera orbit arc — independent from mesh turntable rotation.
 * @param {Record<string, unknown>} [settings]
 * @returns {ExportSpinSettings}
 */
export function normalizeExportCameraSpinSettings(settings = {}) {
  const explicit = resolveExplicitSpinSource(settings, 'camera');
  if (explicit) {
    return buildExportSpinSettings(explicit);
  }

  const movements = normalizeExportVideoMovements(settings);
  if (!movements.orbit) return emptyExportSpinSettings();

  const legacy = legacySpinTriple(settings);
  if (movements.turntable && !hasExplicitObjectSpinFields(settings)) {
    const fullSpins = normalizeExportSpins(legacy.spins);
    const subtle = normalizeExportSubtleSpinDegrees(legacy.subtleDegrees);
    if (fullSpins === 0 && subtle > 0) {
      return buildExportSpinSettings(legacy);
    }
    if (fullSpins > 0) {
      return buildExportSpinSettings(legacy);
    }
    return buildExportSpinSettings({
      spins: 1,
      subtleDegrees: 0,
      spinDirection: legacy.spinDirection,
    });
  }

  return buildExportSpinSettings(legacy);
}

/** @param {ReturnType<typeof normalizeExportVideoMovements>} movements @param {Record<string, unknown>} [settings] */
export function hasExportVideoMovement(movements, settings = {}) {
  const objectSpin = normalizeExportObjectSpinSettings(settings);
  const cameraSpin = normalizeExportCameraSpinSettings(settings);
  return !!(
    (movements?.turntable && objectSpin.rotationDegrees > 0)
    || (movements?.orbit && cameraSpin.rotationDegrees > 0)
    || movements?.zoomIn
    || movements?.zoomOut
    || movements?.tiltLeft
    || movements?.tiltRight
    || needsExportFovDrive(movements)
    || needsExportPitchDrive(movements)
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
  if (movements.pitchOffset) {
    const sign = movements.pitchOffset > 0 ? 'up' : 'down';
    parts.push(`pitch${sign}${Math.abs(movements.pitchOffset)}`);
  }
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

/** @deprecated Prefer normalizeExportObjectSpinSettings / normalizeExportCameraSpinSettings */
export function normalizeExportSpinSettings(settings = {}) {
  return normalizeExportObjectSpinSettings(settings);
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
  return `${spin.subtleSpinDegrees}° arc, ${dir}`;
}

/**
 * Export-only HDRI spin (22.5°/45°/90° over clip length) — temporarily disabled.
 * Studio HDRI rotation slider (`state.hdriRotation`) is unchanged.
 * @returns {0}
 */
export function normalizeExportHdriRotationDegrees(_value) {
  return 0;
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

/** Camera orbit, dolly zoom, roll tilt, and/or pitch nod — turntable only affects mesh rotation. */
export function needsExportCameraDrive(movements) {
  return !!(
    movements?.orbit
    || movements?.zoomIn
    || movements?.zoomOut
    || movements?.tiltLeft
    || movements?.tiltRight
    || needsExportPitchDrive(movements)
  );
}

/**
 * @param {Record<string, unknown>} [settings]
 * @param {number} [clipCount]
 */
export const EXPORT_PRESET_DURATIONS_SEC = [5, 10, 15];

/** @param {unknown} durationSec */
export function normalizeExportPresetDurationSec(durationSec) {
  const n = Number(durationSec);
  return EXPORT_PRESET_DURATIONS_SEC.includes(n) ? n : 5;
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
  const matchDurationToClip =
    include && settings.meshMatchDurationToClip === true;
  const syncCameraToDuration = settings.meshSyncCameraToDuration !== false;

  return {
    include,
    clipIndex,
    hasClips,
    clipCount: count,
    matchDurationToClip,
    syncCameraToDuration,
  };
}

/**
 * @param {number} frameIndex
 * @param {number} fps
 */
export function resolveExportTimeSecFromFrame(frameIndex, fps) {
  return Math.max(0, Number(frameIndex) || 0) / Math.max(1, Number(fps) || 1);
}

/**
 * Camera / turntable progress 0…1 from export timeline seconds.
 * @param {number} exportTimeSec
 * @param {number} cameraMovementDurationSec
 */
export function resolveExportCameraMovementLinearT(
  exportTimeSec,
  cameraMovementDurationSec,
) {
  const duration = Math.max(1e-6, Number(cameraMovementDurationSec) || 0);
  return Math.min(1, Math.max(0, Number(exportTimeSec) || 0) / duration);
}

/**
 * @param {Record<string, unknown>} [settings]
 * @param {number} [clipDurationSec]
 */
export function resolveExportDurationSec(settings = {}, clipDurationSec = 0) {
  const preset = normalizeExportPresetDurationSec(settings.durationSec);
  const include = settings.meshAnimationsInclude === true;
  const match = include && settings.meshMatchDurationToClip === true;
  const clipDuration = Number(clipDurationSec);
  if (match && Number.isFinite(clipDuration) && clipDuration > 0) {
    return clipDuration;
  }
  return preset;
}

/**
 * @param {Record<string, unknown>} [settings]
 * @param {number} exportDurationSec
 */
export function resolveExportCameraMovementDurationSec(
  settings = {},
  exportDurationSec,
) {
  const include = settings.meshAnimationsInclude === true;
  const match = include && settings.meshMatchDurationToClip === true;
  const sync = settings.meshSyncCameraToDuration !== false;
  if (match && !sync) {
    return normalizeExportPresetDurationSec(settings.durationSec);
  }
  return Math.max(1e-6, Number(exportDurationSec) || normalizeExportPresetDurationSec());
}

/**
 * Resolved export + camera timing for mesh animation options.
 * @param {Record<string, unknown>} [settings]
 * @param {number} [clipCount]
 * @param {number} [clipDurationSec]
 */
export function resolveExportMeshAnimationTiming(
  settings = {},
  clipCount = 0,
  clipDurationSec = 0,
) {
  const meshAnimation = normalizeExportMeshAnimationSettings(settings, clipCount);
  const resolvedClipDuration =
    meshAnimation.include && Number(clipDurationSec) > 0
      ? Number(clipDurationSec)
      : 0;
  const exportDurationSec = resolveExportDurationSec(settings, resolvedClipDuration);
  const cameraMovementDurationSec = resolveExportCameraMovementDurationSec(
    settings,
    exportDurationSec,
  );

  return {
    ...meshAnimation,
    clipDurationSec: resolvedClipDuration,
    exportDurationSec,
    cameraMovementDurationSec,
  };
}
