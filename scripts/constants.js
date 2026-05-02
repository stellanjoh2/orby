// Application-wide constants

export const WIREFRAME_OFFSET = 0.002; // Units to push wireframe vertices along normals
export const WIREFRAME_POLYGON_OFFSET_FACTOR = 2;
export const WIREFRAME_POLYGON_OFFSET_UNITS = 2;
export const WIREFRAME_OPACITY_VISIBLE = 1.0;
export const WIREFRAME_OPACITY_OVERLAY = 0.8;

export const PODIUM_TOP_RADIUS_OFFSET = 0.08;
export const PODIUM_SEGMENTS = 96;

export const NORMALS_HELPER_SIZE = 0.08;
export const NORMALS_HELPER_COLOR = '#4db3ff';

/** Neutral PBR default on load (glTF often ~0.5; 0.8 read overly chalky under HDR). */
export const DEFAULT_MATERIAL_ROUGHNESS = 0.5;
export const DEFAULT_MATERIAL_METALNESS = 0.08;

export const BLOOM_LUMINANCE_THRESHOLD_MIN = 0.6;
export const BLOOM_LUMINANCE_THRESHOLD_MAX = 1.2;

/** Minimum focus distance (meters) for depth of field — matches camera near plane. */
export const DOF_FOCUS_MIN_M = 0.1;

/** N8AO intensity slider / pipeline floor (zero reads as “AO off” visually). */
export const AMBIENT_OCCLUSION_INTENSITY_MIN = 0.25;
export const AMBIENT_OCCLUSION_INTENSITY_MAX = 20;

/** Matches scene render-quality naming: low / medium / max (Epic). */
export const AMBIENT_OCCLUSION_QUALITY_DEFAULT = /** @type {const} */ ('medium');

/**
 * Maps UI tier → half-resolution AO buffer + N8AO `setQualityMode` preset (see n8ao readme).
 */
export const AMBIENT_OCCLUSION_QUALITY = {
  low: { halfRes: true, n8aoMode: 'Low' },
  medium: { halfRes: true, n8aoMode: 'Medium' },
  max: { halfRes: false, n8aoMode: 'Ultra' },
};

/**
 * @param {string | undefined} id
 * @returns {typeof AMBIENT_OCCLUSION_QUALITY['max']}
 */
export function resolveAmbientOcclusionQualityTier(id) {
  if (id === 'low') return AMBIENT_OCCLUSION_QUALITY.low;
  if (id === 'medium') return AMBIENT_OCCLUSION_QUALITY.medium;
  if (id === 'max') return AMBIENT_OCCLUSION_QUALITY.max;
  return AMBIENT_OCCLUSION_QUALITY.medium;
}

/**
 * @param {object | undefined} ao
 * @returns {object | undefined}
 */
export function sanitizeAmbientOcclusion(ao) {
  if (!ao || typeof ao !== 'object') return ao;
  let intensity =
    typeof ao.intensity === 'number' && !Number.isNaN(ao.intensity)
      ? ao.intensity
      : 5;
  intensity = Math.min(
    AMBIENT_OCCLUSION_INTENSITY_MAX,
    Math.max(AMBIENT_OCCLUSION_INTENSITY_MIN, intensity),
  );
  const color =
    typeof ao.color === 'string' && ao.color.trim().length > 0
      ? ao.color.trim()
      : '#000000';
  let quality =
    typeof ao.quality === 'string' ? ao.quality.trim().toLowerCase() : '';
  if (quality === 'epic' || quality === 'high') quality = 'max';
  if (quality !== 'low' && quality !== 'medium' && quality !== 'max') {
    if (typeof ao.halfRes === 'boolean') {
      quality = ao.halfRes ? 'medium' : 'max';
    } else {
      quality = AMBIENT_OCCLUSION_QUALITY_DEFAULT;
    }
  }
  const { halfRes: _legacyHalfRes, ...rest } = ao;
  return { ...rest, intensity, color, quality };
}

/**
 * @param {object | undefined} dof
 * @returns {object | undefined}
 */
export function sanitizeDof(dof) {
  if (!dof || typeof dof.focus !== 'number' || Number.isNaN(dof.focus)) {
    return dof;
  }
  if (dof.focus >= DOF_FOCUS_MIN_M) {
    return dof;
  }
  return { ...dof, focus: DOF_FOCUS_MIN_M };
}

/** @typedef {'max' | 'medium' | 'low'} RenderQualityTierId */

export const RENDER_QUALITY_DEFAULT = /** @type {const} */ ('medium');

/**
 * Viewport / post tradeoffs. max = full quality; medium/low reduce GPU load.
 * bloomResolutionScale: UnrealBloomPass internal size = viewport × this per axis.
 */
export const RENDER_QUALITY = {
  max: {
    maxPixelRatio: 2,
    shadowMapSize: 1024,
    softShadowMap: true,
    bloomResolutionScale: 1,
    forceDepthOfFieldOff: false,
    forceBloomOff: false,
    forceAmbientOcclusionOff: false,
    forceFxaaOff: false,
  },
  medium: {
    maxPixelRatio: 1,
    shadowMapSize: 1024,
    softShadowMap: false,
    bloomResolutionScale: 0.5,
    /** Depth of field still runs if enabled (unlike Low). */
    forceDepthOfFieldOff: false,
    forceBloomOff: false,
    forceAmbientOcclusionOff: false,
    forceFxaaOff: true,
  },
  low: {
    maxPixelRatio: 1,
    shadowMapSize: 1024,
    softShadowMap: false,
    /** Unused when bloom is off; kept for typing consistency. */
    bloomResolutionScale: 0.25,
    /** Cheapest tier: DOF and bloom passes off in the compositor (settings preserved). */
    forceDepthOfFieldOff: true,
    forceBloomOff: true,
    forceAmbientOcclusionOff: true,
    forceFxaaOff: true,
  },
};

/**
 * @param {string | undefined} id
 * @returns {typeof RENDER_QUALITY['max']}
 */
export function resolveRenderQualityTier(id) {
  if (id === 'medium' || id === 'low') {
    return RENDER_QUALITY[id];
  }
  return RENDER_QUALITY.max;
}

/**
 * Anti-aliasing select: medium/low tiers force FXAA off in the GPU while keeping
 * `state.antiAliasing` for when the user returns to Epic — use this for display + disabled.
 * @param {string | undefined} renderQuality
 * @param {string | undefined} storedAntiAliasing
 */
export function getAntiAliasingUiState(renderQuality, storedAntiAliasing) {
  const tier = resolveRenderQualityTier(renderQuality);
  if (tier.forceFxaaOff) {
    return { value: 'none', disabled: true };
  }
  return { value: storedAntiAliasing ?? 'none', disabled: false };
}

export const GRAIN_UV_SCALE = 800.0;
export const GRAIN_TIME_SCALE = 0.05;
export const GRAIN_AMOUNT_MULTIPLIER = 0.5;
export const GRAIN_LUMINANCE_MIN = 0.3;
export const GRAIN_LUMINANCE_MAX = 1.0;
export const GRAIN_LUMINANCE_THRESHOLD = 0.5;
export const GRAIN_INTENSITY_THRESHOLD = 0.0001;

export const ACES_FILMIC_MULTIPLIER = 0.6;
export const ACES_FILMIC_A = 2.51;
export const ACES_FILMIC_B = 0.03;
export const ACES_FILMIC_C = 2.43;
export const ACES_FILMIC_D = 0.59;
export const ACES_FILMIC_E = 0.14;

export const BLUR_SAMPLE_OFFSET = 0.02;

export const CAMERA_TEMPERATURE_MIN_K = 2000;
export const CAMERA_TEMPERATURE_MAX_K = 10000;
export const CAMERA_TEMPERATURE_NEUTRAL_K = 6000;

