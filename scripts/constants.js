// Application-wide constants

import { COLOR_CHECKER_MESH_WIDTH } from './scene/ColorCheckerMesh.js';

/** Default near-black — app surfaces, lime CTAs, scene background, letterbox mattes. */
export const ORBY_BLACK = '#080808';

/** Perspective camera clip when Manual Render Distance is off — generous, unchanged on mesh load. */
export const DEFAULT_CAMERA_NEAR = 0.1;
export const DEFAULT_CAMERA_FAR = 5000;

/** Target max axis after import normalization (see ModelLoader.normalizeImportScale). */
export const STUDIO_IMPORT_TARGET_MAX_DIMENSION = 2.0;

/** ColorChecker Classic card width (~356 mm) in normalized studio units. */
export const COLOR_CHECKER_PHYSICAL_WIDTH = 0.356;

/**
 * Default `colorChecker.scale` — real card size on ~2 m normalized imports.
 * (Mesh is ~{COLOR_CHECKER_MESH_WIDTH} units wide at 1×; old 0.17× preset predates import scale.)
 */
export const COLOR_CHECKER_DEFAULT_SCALE =
  COLOR_CHECKER_PHYSICAL_WIDTH / COLOR_CHECKER_MESH_WIDTH;

export const WIREFRAME_OFFSET = 0.002; // Units to push wireframe vertices along normals
export const WIREFRAME_POLYGON_OFFSET_FACTOR = 2;
export const WIREFRAME_POLYGON_OFFSET_UNITS = 2;
export const WIREFRAME_OPACITY_VISIBLE = 1.0;
export const WIREFRAME_OPACITY_OVERLAY = 0.8;

export const PODIUM_TOP_RADIUS_OFFSET = 0.08;
export const PODIUM_SEGMENTS = 96;
/** Samples along the podium’s rounded top outer edge (replaces a single flat chamfer). */
export const PODIUM_BEVEL_EDGE_SEGMENTS = 28;

/** Glass disc radius vs podium top — slightly inset from flush (0.992) + a few px (→ 0.996). */
export const PODIUM_REFLECTOR_RADIUS_SCALE = 0.996;
/** Planar mesh reflection disc sits slightly above the podium top cap (world units). */
export const PODIUM_REFLECTOR_Y_EPS = 0.003;
/** Render-target scale vs canvas for podium Reflector (performance vs sharpness). */
export const PODIUM_REFLECTOR_RES_SCALE = 0.45;
/** Default softness for planar base (solid platform) glass (0 = sharp, 1 = max blur taps). */
export const DEFAULT_BASE_GLASS_BLUR = 0.1;
/** How much of the realtime reflection shows through vs muted base (0 = subtle, 1 = full mirror). */
export const DEFAULT_BASE_GLASS_AMOUNT = 0.5;
/** Base tone under the planar reflection — 0 black … 1 white (mid gray is neutral). */
export const DEFAULT_BASE_GLASS_BRIGHTNESS = 0.1;

export const NORMALS_HELPER_SIZE = 0.08;
export const NORMALS_HELPER_COLOR = '#4db3ff';

/** Neutral PBR default on load (glTF often ~0.5; 0.8 read overly chalky under HDR). */
export const DEFAULT_MATERIAL_ROUGHNESS = 0.5;
export const DEFAULT_MATERIAL_METALNESS = 0.08;
/** Albedo multiplier default — slightly above 1 so imports read less underexposed vs HDRI backplates. */
export const DEFAULT_MATERIAL_BRIGHTNESS = 1.5;

/** Camera → Shadows UI — symmetric around 0 so the thumb sits centered at default; maps via {@link cameraShadowsUiToShader}. */
export const CAMERA_SHADOWS_UI_MIN = -50;
export const CAMERA_SHADOWS_UI_MAX = 50;
/** Added before dividing by scale — former neutral “0” maps like old UI value +10. */
export const CAMERA_SHADOWS_UI_OFFSET = 10;
export const CAMERA_SHADOWS_UI_SCALE = 50;

/** Clamp loaded or computed UI integers to the slider range (legacy saves may exceed ±50). */
export function clampCameraShadowsUi(ui) {
  const n = Number(ui);
  const raw = Number.isFinite(n) ? n : 0;
  return Math.min(CAMERA_SHADOWS_UI_MAX, Math.max(CAMERA_SHADOWS_UI_MIN, raw));
}

/**
 * Maps Camera tab Shadows slider (integer) to the ColorAdjust pass uniform (approx −1…1).
 */
export function cameraShadowsUiToShader(ui) {
  const v = clampCameraShadowsUi(ui);
  return (v + CAMERA_SHADOWS_UI_OFFSET) / CAMERA_SHADOWS_UI_SCALE;
}
/** Upper bound for Mesh → Material emissive slider (also `index.html` #materialEmissive max). */
export const MATERIAL_EMISSIVE_SLIDER_MAX = 4;

export const BLOOM_LUMINANCE_THRESHOLD_MIN = 0.6;
export const BLOOM_LUMINANCE_THRESHOLD_MAX = 1.2;
export const BLOOM_QUALITY_DEFAULT = /** @type {const} */ ('medium');
export const BLOOM_QUALITY = {
  low: { resolutionScale: 0.5 },
  medium: { resolutionScale: 0.75 },
  high: { resolutionScale: 1.0 },
  ultra: { resolutionScale: 1.25 },
};

/**
 * @param {string | undefined} id
 * @returns {typeof BLOOM_QUALITY['medium']}
 */
export function resolveBloomQualityTier(id) {
  if (id === 'low' || id === 'high' || id === 'ultra') {
    return BLOOM_QUALITY[id];
  }
  return BLOOM_QUALITY.medium;
}

/** Anamorphic streak quality after bloom (tap count ~ 2×sampleRadius+1). */
export const ANAMORPHIC_BLOOM_QUALITY_DEFAULT = /** @type {const} */ ('medium');
/** Spread slider / pipeline clamp — same at every quality tier (tier only changes sample count). */
export const ANAMORPHIC_BLOOM_SPREAD_MAX = 1.68;
export const ANAMORPHIC_BLOOM_QUALITY = {
  low: { sampleRadius: 16 },
  medium: { sampleRadius: 24 },
  high: { sampleRadius: 40 },
  ultra: { sampleRadius: 64 },
};

/**
 * @param {string | undefined} id
 */
export function normalizeAnamorphicBloomQualityId(id) {
  if (id === 'optimized') return 'low';
  if (id === 'maximum') return 'ultra';
  if (id === 'low' || id === 'medium' || id === 'high' || id === 'ultra') {
    return id;
  }
  return 'medium';
}

/**
 * @param {string | undefined} id
 * @returns {typeof ANAMORPHIC_BLOOM_QUALITY['medium']}
 */
export function resolveAnamorphicBloomQualityTier(id) {
  const k = normalizeAnamorphicBloomQualityId(id);
  return ANAMORPHIC_BLOOM_QUALITY[k] ?? ANAMORPHIC_BLOOM_QUALITY.medium;
}

/**
 * Lens flare — reduce sample counts / LOD radius, not which features exist.
 * Legacy: optimized → low, maximum → ultra.
 */
export const LENS_FLARE_QUALITY_DEFAULT = /** @type {const} */ ('high');
export const LENS_FLARE_QUALITY = {
  /** ~50% fewer samples + tighter LOD than prior low; all layers stay on (unlike legacy optimized). */
  low: {
    animated: false,
    secondaryGhosts: true,
    starBurst: true,
    aditionalStreaks: true,
    ghostLoopCount: 3,
    dirtGhostSamples: 2,
    lodDistance: 0.72,
  },
  medium: {
    animated: false,
    secondaryGhosts: true,
    starBurst: true,
    aditionalStreaks: true,
    ghostLoopCount: 7,
    dirtGhostSamples: 6,
    lodDistance: 1.3,
  },
  high: {
    animated: false,
    secondaryGhosts: true,
    starBurst: true,
    aditionalStreaks: true,
    ghostLoopCount: 9,
    dirtGhostSamples: 7,
    lodDistance: 1.45,
  },
  ultra: {
    animated: false,
    secondaryGhosts: true,
    starBurst: true,
    aditionalStreaks: true,
    ghostLoopCount: 10,
    dirtGhostSamples: 8,
    lodDistance: 1.5,
  },
};

/**
 * @param {string | undefined} id
 */
export function normalizeLensFlareQualityId(id) {
  if (id === 'optimized') return 'low';
  if (id === 'maximum') return 'ultra';
  if (id === 'low' || id === 'medium' || id === 'high' || id === 'ultra') {
    return id;
  }
  return LENS_FLARE_QUALITY_DEFAULT;
}

/**
 * @param {string | undefined} id
 * @returns {typeof LENS_FLARE_QUALITY['high']}
 */
export function resolveLensFlareQualityTier(id) {
  const k = normalizeLensFlareQualityId(id);
  return LENS_FLARE_QUALITY[k] ?? LENS_FLARE_QUALITY.high;
}

/** pmndrs GodRays — samples + resolution scale per quality tier. */
export const GOD_RAYS_QUALITY_DEFAULT = /** @type {const} */ ('low');
export const GOD_RAYS_MAX_SAMPLES = 80;
export const GOD_RAYS_QUALITY = {
  low: { minSamples: 24, maxSamples: 40, resolutionScale: 0.4 },
  medium: { minSamples: 36, maxSamples: 56, resolutionScale: 0.5 },
  high: { minSamples: 48, maxSamples: 68, resolutionScale: 0.6 },
  ultra: { minSamples: 60, maxSamples: 80, resolutionScale: 0.65 },
};

/**
 * @param {string | undefined} id
 */
export function normalizeGodRaysQualityId(id) {
  if (id === 'optimized') return 'low';
  if (id === 'maximum') return 'ultra';
  if (id === 'low' || id === 'medium' || id === 'high' || id === 'ultra') {
    return id;
  }
  return GOD_RAYS_QUALITY_DEFAULT;
}

/**
 * @param {string | undefined} id
 * @returns {typeof GOD_RAYS_QUALITY['medium']}
 */
export function resolveGodRaysQualityTier(id) {
  const k = normalizeGodRaysQualityId(id);
  return GOD_RAYS_QUALITY[k] ?? GOD_RAYS_QUALITY.medium;
}

/**
 * @param {number} length - UI length 0–1
 * @param {string | undefined} qualityId
 */
export function resolveGodRaysSampleCount(length, qualityId) {
  const tier = resolveGodRaysQualityTier(qualityId);
  const t = Math.min(1, Math.max(0, typeof length === 'number' && !Number.isNaN(length) ? length : 0));
  const lengthWeight = Math.pow(t, 0.72);
  return Math.round(tier.minSamples + (tier.maxSamples - tier.minSamples) * lengthWeight);
}

/**
 * Streak axis in degrees for UI + shader: fold to [0, 180] (line has π symmetry; 180° stays 180°).
 * @param {number} raw
 */
export function foldAnamorphicStreakAngleDeg(raw) {
  let a = typeof raw === 'number' && !Number.isNaN(raw) ? raw : 0;
  a = ((a % 360) + 360) % 360;
  if (a > 180) a -= 180;
  return a;
}

/** Minimum focus distance (meters) for depth of field — matches camera near plane. */
export const DOF_FOCUS_MIN_M = 0.1;

/** DOF quality tier (UI); stock BokehPass uses it only to scale clamped `maxblur`. */
export const DOF_QUALITY_DEFAULT = /** @type {const} */ ('high');

/**
 * @param {string | undefined} id
 * @returns {'low' | 'medium' | 'high' | 'ultra'}
 */
export function normalizeDofQualityId(id) {
  const s = typeof id === 'string' ? id.trim().toLowerCase() : '';
  if (s === 'low' || s === 'medium' || s === 'high' || s === 'ultra') return s;
  if (s === 'max') return 'ultra';
  return 'high';
}

/**
 * Three.js BokehPass uses a fixed tap count; quality scales the clamped `maxblur` uniform slightly.
 */
export const DOF_BOKEH_QUALITY_MAXBLUR_MUL = {
  low: 0.9,
  medium: 0.96,
  high: 1.0,
  ultra: 1.06,
};

/**
 * @param {string | undefined} tier
 * @returns {number}
 */
export function resolveDofBokehMaxBlurMul(tier) {
  const k = normalizeDofQualityId(tier);
  return DOF_BOKEH_QUALITY_MAXBLUR_MUL[k] ?? DOF_BOKEH_QUALITY_MAXBLUR_MUL.high;
}

/** N8AO intensity slider / pipeline floor (zero reads as “AO off” visually). */
export const AMBIENT_OCCLUSION_INTENSITY_MIN = 0.25;
export const AMBIENT_OCCLUSION_INTENSITY_MAX = 20;

/** Matches scene render-quality naming: low / medium / max (Ultra). */
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
      : 3;
  intensity = Math.min(
    AMBIENT_OCCLUSION_INTENSITY_MAX,
    Math.max(AMBIENT_OCCLUSION_INTENSITY_MIN, intensity),
  );
  const color =
    typeof ao.color === 'string' && ao.color.trim().length > 0
      ? ao.color.trim()
      : ORBY_BLACK;
  let quality =
    typeof ao.quality === 'string' ? ao.quality.trim().toLowerCase() : '';
  if (quality === 'ultra' || quality === 'high') quality = 'max';
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
  const focus = dof.focus >= DOF_FOCUS_MIN_M ? dof.focus : DOF_FOCUS_MIN_M;
  const quality = normalizeDofQualityId(dof.quality);
  if (focus === dof.focus && quality === dof.quality) {
    return dof;
  }
  return { ...dof, focus, quality };
}

/**
 * Single fullscreen pass for exposure → color adjust → tone map (+ vignette).
 * Set false to restore the legacy three-pass chain (rollback).
 */
export const USE_MERGED_GRADING_PASS = true;

/**
 * Bloom tint + anamorphic streak in one pass after UnrealBloomPass.
 * Set false to restore the legacy two-pass chain (rollback).
 */
export const USE_MERGED_BLOOM_COMPOSITE_PASS = true;

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
    forceFxaaOff: false,
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
 * True when selective bloom passes can produce output — matches SceneManager anamorphic gating.
 * @param {{ bloom?: { enabled?: boolean, strength?: number }, renderQuality?: string }} state
 */
export function isBloomPipelineActive(state) {
  const bloom = state.bloom && typeof state.bloom === 'object' ? state.bloom : {};
  const tier = resolveRenderQualityTier(state.renderQuality);
  return (
    bloom.enabled !== false &&
    Number(bloom.strength ?? 0) > 0.0001 &&
    !tier.forceBloomOff
  );
}

/**
 * Anti-aliasing select: low tier forces FXAA off in the GPU while keeping
 * `state.antiAliasing` for when the user returns to Medium/Ultra — use this for display + disabled.
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

/**
 * Intensity sent to the post shader: legacy snapshots omit `vignetteEnabled` and apply `vignette` directly.
 * @param {object | undefined} camera
 * @param {object | undefined} defaultsCamera `defaults.camera` from StateStore
 */
export function effectiveVignetteIntensity(camera, defaultsCamera) {
  const c = camera ?? {};
  const d = defaultsCamera ?? {};
  if (c.vignetteEnabled === false) return 0;
  if (c.vignetteEnabled === true) return c.vignette ?? d.vignette ?? 0.5;
  return c.vignette ?? 0;
}

/** Whether the vignette subsection toggle should read as “on” (includes legacy state). */
export function isVignetteUiEnabled(camera) {
  const c = camera ?? {};
  if (c.vignetteEnabled === true) return true;
  if (c.vignetteEnabled === false) return false;
  return (c.vignette ?? 0) > 0;
}
