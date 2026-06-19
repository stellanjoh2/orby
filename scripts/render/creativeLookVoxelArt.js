import * as THREE from 'three';

/** Shader Lab voxel looks — extensible for low-res and sphere primitives later. */
export const VOXEL_LOOK_PRESETS = /** @type {const} */ ([
  'voxel-hd',
]);

/** Locked Shader Lab Scale for Voxel HD (0.50× → 128 cells / axis; voxelization runs once at apply). */
export const VOXEL_HD_LOCKED_SCALE = 0.5;

/** Axis cap at 0.50× — higher values exceed the voxel budget on filled meshes (skull → white fallback). */
export const VOXEL_HD_MAX_AXIS = 128;

/** Reference axis for scaling the occupied-voxel budget when max axis changes. */
export const VOXEL_HD_REFERENCE_AXIS = 128;

/**
 * @typedef {'cube' | 'sphere'} VoxelLookPrimitive
 * @typedef {{
 *   primitive: VoxelLookPrimitive,
 *   maxAxis: number,
 *   fillInterior: boolean,
 *   fixedScale: number,
 *   maxVoxels: number,
 *   cullComponentMinVoxels: number,
 *   smallMeshSurfaceRatio: number,
 *   smallMeshBboxRatio: number,
 *   spikeErodePasses: number,
 *   spikeMaxNeighbors: number,
 *   satelliteMinGridGapVoxels: number,
 *   needleMaxAspectRatio: number,
 *   needleMaxVoxels: number,
 *   parityMinInsideVotes: number,
 *   surfaceShellErodePasses: number,
 *   surfaceShellMaxNeighbors: number,
 *   oneWideRodMinLength: number,
 *   oneWideRodThinMaxNeighbors: number,
 *   danglingSurfaceErodePasses: number,
 *   danglingSurfaceMaxOccupiedNeighbors: number,
 *   danglingSurfaceMaxSurfaceNeighbors: number,
 * }} VoxelLookConfig
 */

/** @type {Record<string, VoxelLookConfig>} */
export const VOXEL_LOOK_CONFIG = {
  'voxel-hd': {
    primitive: 'cube',
    maxAxis: 72,
    fillInterior: true,
    fixedScale: VOXEL_HD_LOCKED_SCALE,
    maxVoxels: 80000,
    cullComponentMinVoxels: 10,
    smallMeshSurfaceRatio: 0.15,
    smallMeshBboxRatio: 0.35,
    spikeErodePasses: 5,
    spikeMaxNeighbors: 2,
    satelliteMinGridGapVoxels: 2,
    needleMaxAspectRatio: 4,
    needleMaxVoxels: 64,
    parityMinInsideVotes: 2,
    surfaceShellErodePasses: 2,
    surfaceShellMaxNeighbors: 3,
    oneWideRodMinLength: 3,
    oneWideRodThinMaxNeighbors: 3,
    danglingSurfaceErodePasses: 2,
    danglingSurfaceMaxOccupiedNeighbors: 4,
    danglingSurfaceMaxSurfaceNeighbors: 2,
  },
};

/** @param {string | undefined} preset */
export function isVoxelCreativeLookPreset(preset) {
  const id = typeof preset === 'string' ? preset : '';
  return VOXEL_LOOK_PRESETS.includes(id);
}

/** Voxel HD uses the default Shader Lab stack — N8AO stays available (including with viewport bloom). */
export function creativeLookPresetAllowsAmbientOcclusion(preset) {
  return isVoxelCreativeLookPreset(preset);
}

/** @param {string | undefined} preset */
export function creativeLookUsesVoxelGeometry(preset) {
  return isVoxelCreativeLookPreset(preset);
}

/**
 * Resolve voxel preset config (falls back to voxel-hd).
 * @param {string | undefined} preset
 * @returns {VoxelLookConfig}
 */
export function resolveVoxelLookConfig(preset) {
  const id = typeof preset === 'string' ? preset : '';
  return VOXEL_LOOK_CONFIG[id] ?? VOXEL_LOOK_CONFIG['voxel-hd'];
}

/** Fixed Shader Lab Scale for voxel presets (live scale disabled). */
export function creativeLookVoxelFixedScale(preset) {
  if (!isVoxelCreativeLookPreset(preset)) return null;
  return VOXEL_HD_LOCKED_SCALE;
}

/**
 * Voxel lighting — lower ambient than PS2/toon so baked albedo + blacks stay faithful.
 * @param {number | undefined} hdriStrength
 * @param {boolean} [hdriEnabled]
 * @returns {{ lightScale: number, ambientFloor: number }}
 */
export function creativeLookVoxelLightScalars(hdriStrength, hdriEnabled = true) {
  const s = Number(hdriStrength);
  const strength = Number.isFinite(s) ? Math.max(0, s) : 1;
  if (!hdriEnabled) {
    return { lightScale: 0.96, ambientFloor: 0.14 };
  }
  return {
    lightScale: Math.min(1.18 + 0.08 * strength, 1.45),
    ambientFloor: Math.min(0.1 + 0.04 * strength, 0.22),
  };
}

/**
 * Effective grid resolution per axis from locked Voxel HD scale.
 * @param {string | undefined} preset
 * @param {number} [patternScale]
 */
export function creativeVoxelMaxAxis(preset, patternScale = VOXEL_HD_LOCKED_SCALE) {
  const cfg = resolveVoxelLookConfig(preset);
  const locked = creativeLookVoxelFixedScale(preset);
  const ps = locked ?? patternScale;
  const scale = Number.isFinite(Number(ps)) && Number(ps) > 0 ? Number(ps) : VOXEL_HD_LOCKED_SCALE;
  const minAxis = 12;
  const axis = Math.round(cfg.maxAxis / scale);
  return THREE.MathUtils.clamp(axis, minAxis, VOXEL_HD_MAX_AXIS);
}

/**
 * Occupied-voxel budget — scales up slightly if axis cap is raised later.
 * @param {string | undefined} preset
 * @param {number} [maxAxis]
 */
export function creativeVoxelMaxVoxels(preset, maxAxis = VOXEL_HD_MAX_AXIS) {
  const cfg = resolveVoxelLookConfig(preset);
  const axis = Math.max(1, Number(maxAxis) || VOXEL_HD_MAX_AXIS);
  const ratio = axis / VOXEL_HD_REFERENCE_AXIS;
  const scaled = Math.round(cfg.maxVoxels * ratio ** 1.5);
  return THREE.MathUtils.clamp(scaled, cfg.maxVoxels, 200000);
}
