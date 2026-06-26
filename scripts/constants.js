// Application-wide constants

import { COLOR_CHECKER_MESH_WIDTH } from './scene/ColorCheckerMesh.js';
import { resolveCreativeLookSketchParams } from './render/creativeLookSketchArt.js';
import { isOpticsCreativeLookPreset } from './render/creativeLookOpticsArt.js';

/** Default near-black — app surfaces, lime CTAs, letterbox mattes, UI chrome. */
export const ORBY_BLACK = '#080808';

/** Scene / viewport clear color — pure black (Shader Lab, exports, default backdrop). */
export const APP_BACKGROUND = '#000000';

/** Orby Lime — logotype, CTAs, wireframe default, UI accents. Mirror: --orby-lime */
export const ORBY_LIME = '#c4ff00';

/** Orby Purple — inverted lime; UI accents, gradients. Mirror: --orby-purple */
export const ORBY_PURPLE = '#3b00ff';

/** Orby Purple Bright — lighter purple for UI accents and gradients. Mirror: --orby-purple-bright */
export const ORBY_PURPLE_BRIGHT = '#9d80ff';

/** Orby Blue — inline text links on dark UI. Mirror: --orby-blue / --text-link */
export const ORBY_BLUE = '#00c4ff';

/** Orby Pink — official red; warnings, blocker severity, critical alerts. Mirror: --orby-pink */
export const ORBY_PINK = '#ff00c4';

/** Softer Orby Pink — inline errors, destructive hints (50% mix with white). Mirror: --orby-pink-muted */
export const ORBY_PINK_MUTED = '#ff80e2';

/** Perspective camera clip when Manual Render Distance is off — generous, unchanged on mesh load. */
export const DEFAULT_CAMERA_NEAR = 0.1;
export const DEFAULT_CAMERA_FAR = 5000;

/** Target max axis after import normalization (see normalizeImportScale). */
export const STUDIO_IMPORT_TARGET_MAX_DIMENSION = 2.0;

/**
 * Skip import scaling when max axis is already within this fraction of
 * {@link STUDIO_IMPORT_TARGET_MAX_DIMENSION} (6% → ~1.88–2.12 units at target 2).
 */
export const STUDIO_IMPORT_SCALE_TOLERANCE = 0.06;

/** ColorChecker Classic card width (~356 mm) in normalized studio units. */
export const COLOR_CHECKER_PHYSICAL_WIDTH = 0.356;

/**
 * Default `colorChecker.scale` — real card size on ~2 m normalized imports.
 * (Mesh is ~{COLOR_CHECKER_MESH_WIDTH} units wide at 1×; old 0.17× preset predates import scale.)
 */
export const COLOR_CHECKER_DEFAULT_SCALE =
  COLOR_CHECKER_PHYSICAL_WIDTH / COLOR_CHECKER_MESH_WIDTH;

/** Timeline frame counter during GLB playback — default dropdown value. */
export const ANIMATION_DISPLAY_FPS = 60;

/** Allowed timeline FPS dropdown values. */
export const ANIMATION_DISPLAY_FPS_OPTIONS = [24, 30, 60];

export function normalizeAnimationDisplayFps(fps) {
  const n = Number(fps);
  return ANIMATION_DISPLAY_FPS_OPTIONS.includes(n) ? n : ANIMATION_DISPLAY_FPS;
}

/** Push wireframe overlay along normals (studio units: 1 unit = 1 m). */
export const WIREFRAME_OFFSET = 0.05;

/**
 * Surface push for wireframe source geometry. Caps at {@link WIREFRAME_OFFSET}; scales down for
 * small meshes (font/SVG extrude ~0.36 units) so lines stay on the surface instead of ballooning.
 * @param {number} maxDimension
 */
export function resolveWireframeSurfaceOffset(maxDimension) {
  const maxDim = Number(maxDimension);
  if (!Number.isFinite(maxDim) || maxDim <= 0) return WIREFRAME_OFFSET;
  const adaptive = maxDim * 0.0015;
  return Math.min(WIREFRAME_OFFSET, Math.max(1e-6, adaptive));
}
/** Negative values pull wireframe toward the camera in the depth buffer (matches UV/normal overlays). */
export const WIREFRAME_POLYGON_OFFSET_FACTOR = -4;
export const WIREFRAME_POLYGON_OFFSET_UNITS = -4;
/**
 * EdgesGeometry threshold (degrees). Coplanar cap triangulation is ~0° and stays hidden;
 * use a low value so high-segment SVG/font extrude side walls still draw ring edges.
 */
export const WIREFRAME_EDGES_THRESHOLD_DEG = 0.05;
export const WIREFRAME_OPACITY_VISIBLE = 1.0;
export const WIREFRAME_OPACITY_OVERLAY = 0.8;
/** Default wireframe line thickness slider value (maps to screen-space pixels via LineMaterial). */
export const DEFAULT_WIREFRAME_LINE_WIDTH = 1;
/** Default wireframe line opacity slider value (0–1). */
export const DEFAULT_WIREFRAME_OPACITY = 1;

export function clampWireframeLineWidth(value) {
  return Math.min(2.5, Math.max(0.5, Number(value) || DEFAULT_WIREFRAME_LINE_WIDTH));
}

/** Slider value maps to screen-space line width in pixels (LineMaterial). */
export function wireframeLineWidthToPixels(width) {
  return clampWireframeLineWidth(width);
}

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
/** Studio cyclorama defaults — matte paper-like out of the box. */
export const DEFAULT_BACKDROP_METALNESS = 0.02;
export const DEFAULT_BACKDROP_ROUGHNESS = 0.9;
/** Albedo multiplier default — slightly above 1 so imports read less underexposed vs HDRI backplates. */
export const DEFAULT_MATERIAL_BRIGHTNESS = 1.75;
/**
 * Peak linear RGB after brightness scale on albedo-mapped imports — keeps map × tint in HDR headroom
 * for tonemap without hard clipping that reads as “burnt” texture (desktop + mobile share MaterialController).
 */
export const MATERIAL_TEXTURED_BRIGHTNESS_HDR_PEAK = 2.5;

/** Max HDRI env-map boost from Object → Material brightness in Lit / Clay (vs Textures albedo-only). */
export const MATERIAL_BRIGHTNESS_LIT_ENV_MAX_BOOST = 2.5;

/**
 * Lit-mode IBL scale tied to brightness — shaded imports stay closer to Textures perceived level.
 * @param {number} [brightness]
 */
export function materialBrightnessLitEnvMultiplier(brightness) {
  const b = Number(brightness);
  const scale = Number.isFinite(b) ? b : DEFAULT_MATERIAL_BRIGHTNESS;
  const ratio = scale / DEFAULT_MATERIAL_BRIGHTNESS;
  return Math.min(
    MATERIAL_BRIGHTNESS_LIT_ENV_MAX_BOOST,
    Math.max(0.5, ratio),
  );
}

/** Neutral multiplier on import — 1.0 preserves authored glTF metalness/roughness factors. */
export const IMPORT_MATERIAL_MR_MULTIPLIER = 1;

/** Object → Material slider tooltips (`index.html` defaults match the non-map variants). */
export const MATERIAL_METALNESS_TOOLTIP =
  'Control metallic appearance (0 = dielectric, 1 = metal)';
export const MATERIAL_METALNESS_MR_MAP_TOOLTIP =
  'Multiplies the metalness map — 1.0 matches the file; lower or higher scales the texture';
export const MATERIAL_METALNESS_AUTHORED_TOOLTIP =
  'Scales each material\'s authored metalness — 1.0 matches the file';
export const MATERIAL_ROUGHNESS_TOOLTIP =
  'Control surface smoothness (0 = mirror, 1 = rough)';
export const MATERIAL_ROUGHNESS_MR_MAP_TOOLTIP =
  'Multiplies the roughness map — 1.0 matches the file; lower or higher scales the texture';
export const MATERIAL_ROUGHNESS_AUTHORED_TOOLTIP =
  'Scales each material\'s authored roughness — 1.0 matches the file';

/** Material reset / UI fallbacks when a PBR import uses per-material authored factors. */
export function getMaterialMrResetDefaults(importUsesAuthoredPbr = false) {
  if (importUsesAuthoredPbr) {
    return {
      metalness: IMPORT_MATERIAL_MR_MULTIPLIER,
      roughness: IMPORT_MATERIAL_MR_MULTIPLIER,
      brightness: DEFAULT_MATERIAL_BRIGHTNESS,
    };
  }
  return {
    metalness: 0.0,
    roughness: DEFAULT_MATERIAL_ROUGHNESS,
    brightness: DEFAULT_MATERIAL_BRIGHTNESS,
  };
}

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

/** Near / far blur multiplier slider range. */
export const DOF_BLUR_MUL_MIN = 0;
export const DOF_BLUR_MUL_MAX = 2;
export const DOF_BLUR_MUL_DEFAULT = 1;

/** @typedef {'manual' | 'auto'} DofFocusMode */

/** @type {readonly DofFocusMode[]} */
export const DOF_FOCUS_MODES = Object.freeze(['manual', 'auto']);

/** App default focus behaviour when DOF is enabled. */
export const DOF_FOCUS_MODE_DEFAULT = /** @type {const} */ ('auto');

/** Standard f-stops shown for the aperture slider (display only). */
export const DOF_FSTOPS = Object.freeze([1.4, 2, 2.8, 4, 5.6, 8, 11, 16]);

/** Maps shader aperture uniform → photographic f-stop (matches PostProcessingPipeline). */
export function dofApertureToFStop(aperture) {
  const a = typeof aperture === 'number' && !Number.isNaN(aperture) ? aperture : 0.003;
  return Math.max(0.1, 0.014 / Math.max(a, 1e-6));
}

/** Nearest standard f-stop label for UI, e.g. `f/2.8`. */
export function formatDofFStopLabel(aperture) {
  const f = dofApertureToFStop(aperture);
  let nearest = DOF_FSTOPS[0];
  for (let i = 1; i < DOF_FSTOPS.length; i++) {
    const stop = DOF_FSTOPS[i];
    if (Math.abs(stop - f) < Math.abs(nearest - f)) {
      nearest = stop;
    }
  }
  const text = Number.isInteger(nearest) ? String(nearest) : String(nearest);
  return `f/${text}`;
}

export const defaultDof = Object.freeze({
  enabled: false,
  focus: 1.5,
  focusMode: DOF_FOCUS_MODE_DEFAULT,
  aperture: 0.003,
  foregroundBlur: DOF_BLUR_MUL_DEFAULT,
  backgroundBlur: DOF_BLUR_MUL_DEFAULT,
  zoomAttenuation: true,
  quality: 'high',
  showFocusPlane: false,
});

/** Render panel control ids disabled when DOF is off. */
export const DOF_UI_CONTROL_IDS = Object.freeze([
  'dofFocusMode',
  'dofFocus',
  'dofForegroundBlur',
  'dofBackgroundBlur',
  'dofAperture',
  'dofQuality',
  'toggleDofZoomAttenuation',
]);

/** DOF quality tier (UI); scales clamped `maxblur` cap and strength multiplier. */
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
 * Three.js BokehPass uses a fixed tap count; quality scales aperture→maxblur mapping slightly.
 */
export const DOF_BOKEH_QUALITY_MAXBLUR_MUL = {
  low: 0.9,
  medium: 0.96,
  high: 1.0,
  ultra: 1.06,
};

/** Tier caps on BokehPass `maxblur` (higher = stronger cinematic defocus on Ultra). */
export const DOF_BOKEH_QUALITY_MAXBLUR_CAP = {
  low: 0.04,
  medium: 0.06,
  high: 0.1,
  ultra: 0.16,
};

/**
 * @param {string | undefined} tier
 * @returns {number}
 */
export function resolveDofBokehMaxBlurMul(tier) {
  const k = normalizeDofQualityId(tier);
  return DOF_BOKEH_QUALITY_MAXBLUR_MUL[k] ?? DOF_BOKEH_QUALITY_MAXBLUR_MUL.high;
}

/**
 * @param {string | undefined} tier
 * @returns {number}
 */
export function resolveDofMaxBlurCap(tier) {
  const k = normalizeDofQualityId(tier);
  return DOF_BOKEH_QUALITY_MAXBLUR_CAP[k] ?? DOF_BOKEH_QUALITY_MAXBLUR_CAP.high;
}

/**
 * @param {string | undefined} mode
 * @returns {DofFocusMode}
 */
export function normalizeDofFocusMode(mode) {
  const s = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
  if (s === 'manual' || s === 'click') return 'manual';
  if (s === 'auto' || s === 'center' || s === 'target') return 'auto';
  return DOF_FOCUS_MODE_DEFAULT;
}

/**
 * @param {number | undefined} value
 * @returns {number}
 */
export function clampDofBlurMul(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return DOF_BLUR_MUL_DEFAULT;
  return Math.min(DOF_BLUR_MUL_MAX, Math.max(DOF_BLUR_MUL_MIN, value));
}

/**
 * @param {object | undefined} dof
 * @returns {boolean}
 */
export function dofNeedsLiveUpdate(dof) {
  return !!dof?.enabled && (dof.aperture ?? 0) > 0.0001;
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
  if (!dof || typeof dof !== 'object') {
    return { ...defaultDof };
  }

  const focus =
    typeof dof.focus === 'number' && !Number.isNaN(dof.focus)
      ? Math.max(DOF_FOCUS_MIN_M, dof.focus)
      : defaultDof.focus;
  const quality = normalizeDofQualityId(dof.quality);
  const focusMode =
    dof.focusMode !== undefined
      ? normalizeDofFocusMode(dof.focusMode)
      : 'manual';
  const foregroundBlur = clampDofBlurMul(dof.foregroundBlur);
  const backgroundBlur = clampDofBlurMul(dof.backgroundBlur);
  const zoomAttenuation =
    dof.zoomAttenuation === undefined ? defaultDof.zoomAttenuation : !!dof.zoomAttenuation;
  const aperture =
    typeof dof.aperture === 'number' && !Number.isNaN(dof.aperture)
      ? dof.aperture
      : defaultDof.aperture;
  const enabled = dof.enabled === undefined ? defaultDof.enabled : !!dof.enabled;
  const showFocusPlane =
    dof.showFocusPlane === undefined ? defaultDof.showFocusPlane : !!dof.showFocusPlane;

  return {
    enabled,
    focus,
    focusMode,
    aperture,
    foregroundBlur,
    backgroundBlur,
    zoomAttenuation,
    quality,
    showFocusPlane,
  };
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

/**
 * Route opaque PNG export through `OfflineCaptureSession` + `renderFrameForCapture`.
 * Set false to restore the legacy inline resize/restore path (rollback).
 */
export const USE_CAPTURE_SESSION = true;

/**
 * Allow nearest-neighbor stretch when composer RT ≠ export size (legacy rollback).
 * Strict mode (false) throws `CaptureSizeMismatchError` after one re-render retry.
 */
export const ALLOW_CAPTURE_RESAMPLE = false;

/** Log capture debug tuple on every successful readback (dev diagnostics). */
export const LOG_CAPTURE_DEBUG = false;

/**
 * After export preview scrub, render one offline capture tile (same path as encode).
 * Heavy — off by default; use Capture preview frame button for manual verification.
 */
export const USE_CAPTURE_PREVIEW_ON_SCRUB = false;

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
 * Low/Medium viewport quality: only the key light may cast shadow maps (fill/rim stay off).
 * @param {string | undefined} renderQuality
 */
export function isKeyLightOnlyShadowCastingRenderQuality(renderQuality) {
  return renderQuality === 'low' || renderQuality === 'medium';
}

/**
 * Per-light cast-shadow flags when the global shadows toggle is turned on.
 * @param {string | undefined} renderQuality
 * @returns {Array<'key' | 'fill' | 'rim'>}
 */
export function castShadowLightIdsForGlobalToggle(renderQuality) {
  return isKeyLightOnlyShadowCastingRenderQuality(renderQuality)
    ? ['key']
    : ['key', 'fill', 'rim'];
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
 * Shader Lab viewport bloom — separate from Camera & FX `bloom.enabled` (off by default here).
 * @param {{ creativeLook?: { enabled?: boolean, viewportBloom?: boolean }, renderQuality?: string }} state
 */
export function isCreativeLookViewportPostActive(state) {
  const cl = state.creativeLook && typeof state.creativeLook === 'object' ? state.creativeLook : {};
  const tier = resolveRenderQualityTier(state.renderQuality);
  return !!cl.enabled && !!cl.viewportBloom && !tier.forceBloomOff;
}

/**
 * Shader Lab Vectrex — phosphor persistence post; Cam/FX bloom when viewportBloom is on.
 * @param {{ creativeLook?: { enabled?: boolean, preset?: string }, renderQuality?: string }} state
 */
export function isCreativeLookVectrexPostActive(state) {
  const cl = state.creativeLook && typeof state.creativeLook === 'object' ? state.creativeLook : {};
  if (!cl.enabled) return false;
  const preset = typeof cl.preset === 'string' ? cl.preset : '';
  return preset === 'vectrex';
}

/**
 * Shader Lab Watercolour — Kuwahara painterly post; auto-on with preset.
 * @param {{ creativeLook?: { enabled?: boolean, preset?: string } }} state
 */
export function isCreativeLookWatercolourPostActive(state) {
  const cl = state.creativeLook && typeof state.creativeLook === 'object' ? state.creativeLook : {};
  if (!cl.enabled) return false;
  const preset = typeof cl.preset === 'string' ? cl.preset : '';
  return preset === 'watercolour';
}

/**
 * Shader Lab Gouache — flat poster paint post; auto-on with preset.
 * @param {{ creativeLook?: { enabled?: boolean, preset?: string } }} state
 */
export function isCreativeLookGouachePostActive(state) {
  const cl = state.creativeLook && typeof state.creativeLook === 'object' ? state.creativeLook : {};
  if (!cl.enabled) return false;
  const preset = typeof cl.preset === 'string' ? cl.preset : '';
  return preset === 'gouache';
}

/**
 * Shader Lab optics — thermal full-viewport grade; auto-on with preset.
 * @param {{ creativeLook?: { enabled?: boolean, preset?: string } }} state
 */
export function isCreativeLookOpticsPostActive(state) {
  const cl = state.creativeLook && typeof state.creativeLook === 'object' ? state.creativeLook : {};
  if (!cl.enabled) return false;
  const preset = typeof cl.preset === 'string' ? cl.preset : '';
  return isOpticsCreativeLookPreset(preset);
}

/**
 * Shader Lab Sketch — stipple grain + ink outline post; auto-on with preset.
 * @param {{ creativeLook?: { enabled?: boolean, preset?: string } }} state
 */
export function isCreativeLookSketchPostActive(state) {
  const cl = state.creativeLook && typeof state.creativeLook === 'object' ? state.creativeLook : {};
  if (!cl.enabled) return false;
  const preset = typeof cl.preset === 'string' ? cl.preset : '';
  if (preset !== 'sketch' && preset !== 'sketch-colour') return false;
  const params = resolveCreativeLookSketchParams(cl.presetParams, cl.patternScale);
  return params.rasterSize > 0;
}

/** @param {{ creativeLook?: { enabled?: boolean, preset?: string } }} state */
export function isCreativeLookSketchColourPostActive(state) {
  const cl = state.creativeLook && typeof state.creativeLook === 'object' ? state.creativeLook : {};
  if (!cl.enabled) return false;
  const preset = typeof cl.preset === 'string' ? cl.preset : '';
  return preset === 'sketch-colour';
}

/** @param {{ creativeLook?: { enabled?: boolean, preset?: string } }} state */
export function isCreativeLookAscii4PostActive(state) {
  const cl = state.creativeLook && typeof state.creativeLook === 'object' ? state.creativeLook : {};
  if (!cl.enabled) return false;
  const preset = typeof cl.preset === 'string' ? cl.preset : '';
  return preset === 'ascii-art-4';
}

/** Flat-post Shader Lab presets that can run Cam/FX bloom in the ascii terminal stack. */
const SHADER_LAB_FLAT_POST_PRESETS = new Set([
  'ascii-art',
  'ascii-art-2',
  'ascii-art-3',
  'ascii-art-4',
  'ega-pixel',
  'c64-pixel',
  'gameboy-pixel',
  'gba-pixel',
  'nes-pixel',
  'megadrive-pixel',
  'intellivision-pixel',
  'apple2-pixel',
  'dither-neutral',
  'dither-tritone',
  'dither-crosshatch',
  'dither-raster',
]);

/** Cam/FX bloom sliders — Shader Lab viewport bloom, or flat-post Cam/FX bloom stack. */
export function isBloomTuningActive(state) {
  const cl = state?.creativeLook ?? {};
  if (cl.enabled !== true) {
    return !!state?.bloom?.enabled;
  }
  if (cl.viewportBloom) {
    return true;
  }
  const preset = typeof cl.preset === 'string' ? cl.preset : '';
  if (SHADER_LAB_FLAT_POST_PRESETS.has(preset)) {
    return isBloomPipelineActive(state);
  }
  return false;
}

/** Anamorphic streak runs when bloom output exists (Cam/FX bloom or Shader Lab viewport bloom). */
export function isAnamorphicBloomPipelineActive(state) {
  return isBloomPipelineActive(state) || isCreativeLookViewportPostActive(state);
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
