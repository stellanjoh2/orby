// Application-wide constants

export const WIREFRAME_OFFSET = 0.002; // Units to push wireframe vertices along normals
export const WIREFRAME_POLYGON_OFFSET_FACTOR = 2;
export const WIREFRAME_POLYGON_OFFSET_UNITS = 2;
export const WIREFRAME_OPACITY_VISIBLE = 1.0;
export const WIREFRAME_OPACITY_OVERLAY = 0.8;

export const PODIUM_TOP_RADIUS_OFFSET = 0.08;
export const PODIUM_SEGMENTS = 96;
export const PODIUM_RADIUS_MULTIPLIER = 1.05;

export const NORMALS_HELPER_SIZE = 0.08;
export const NORMALS_HELPER_COLOR = '#4db3ff';

export const DEFAULT_MATERIAL_ROUGHNESS = 0.8;
export const DEFAULT_MATERIAL_METALNESS = 0.08;

export const BLOOM_LUMINANCE_THRESHOLD_MIN = 0.6;
export const BLOOM_LUMINANCE_THRESHOLD_MAX = 1.2;

/** @typedef {'max' | 'medium' | 'low'} RenderQualityTierId */

export const RENDER_QUALITY_DEFAULT = /** @type {const} */ ('max');

/**
 * Viewport / post tradeoffs. max = full quality; medium/low reduce GPU load.
 * bloomResolutionScale: UnrealBloomPass internal size = viewport × this per axis.
 */
export const RENDER_QUALITY = {
  max: {
    maxPixelRatio: 2,
    shadowMapSize: 2048,
    softShadowMap: true,
    bloomResolutionScale: 1,
    forceDepthOfFieldOff: false,
    forceBloomOff: false,
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
 * `state.antiAliasing` for when the user returns to Max — use this for display + disabled.
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

