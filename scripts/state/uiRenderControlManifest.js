/**
 * UI-side control manifest — Render tab sliders/colors/checkboxes.
 * Toggles with disable-sync, multi-step handlers, and value transforms
 * (grain intensity, quality selects) stay inline in RenderControls.js.
 */
import {
  AMBIENT_OCCLUSION_INTENSITY_MIN,
  ANAMORPHIC_BLOOM_SPREAD_MAX,
  CAMERA_TEMPERATURE_NEUTRAL_K,
} from '../constants.js';

/** @typedef {'range' | 'color' | 'checkbox'} UiControlInputType */

/**
 * @typedef {object} RenderManifestEntry
 * @property {string} inputId
 * @property {string} statePath
 * @property {string} event
 * @property {UiControlInputType} [inputType='range']
 * @property {string} [labelKey]
 * @property {string} [labelType]
 * @property {number} [labelDecimals]
 * @property {number} [clampMin]
 * @property {number} [clampMax]
 * @property {number} [fallback]
 * @property {boolean} [rewriteClamp] rewrite input when clamped
 * @property {boolean} [lookFilterTouch] batch write + mark look filter custom
 * @property {string} [emitSlice] after write, emit event with state slice at this path
 * @property {boolean} [emitNoPayload] emit event with no argument
 * @property {'divide100' | 'shadowsShader'} [emitTransform] scalar emit transform
 * @property {string} [emitHook] key into `emitHooks` passed to binder
 * @property {{ min: number, max: number, center: number }} [snapCenter]
 */

/** Look-filter controls — commit wrapper + slice/scalar emit. */
export const RENDER_LOOK_FILTER_MANIFEST = [
  // DOF (toggle/focus/mode/quality stay inline)
  {
    inputId: 'dofForegroundBlur',
    statePath: 'dof.foregroundBlur',
    event: 'render:dof',
    emitSlice: 'dof',
    lookFilterTouch: true,
    labelKey: 'dofForegroundBlur',
    labelType: 'decimal',
    labelDecimals: 2,
  },
  {
    inputId: 'dofBackgroundBlur',
    statePath: 'dof.backgroundBlur',
    event: 'render:dof',
    emitSlice: 'dof',
    lookFilterTouch: true,
    labelKey: 'dofBackgroundBlur',
    labelType: 'decimal',
    labelDecimals: 2,
  },
  {
    inputId: 'dofAperture',
    statePath: 'dof.aperture',
    event: 'render:dof',
    emitSlice: 'dof',
    lookFilterTouch: true,
    labelKey: 'dofAperture',
    labelType: 'fstop',
  },
  {
    inputId: 'toggleDofZoomAttenuation',
    statePath: 'dof.zoomAttenuation',
    event: 'render:dof',
    emitSlice: 'dof',
    lookFilterTouch: true,
    inputType: 'checkbox',
  },
  // Bloom (toggle + quality stay inline)
  {
    inputId: 'bloomThreshold',
    statePath: 'bloom.threshold',
    event: 'render:bloom',
    emitSlice: 'bloom',
    lookFilterTouch: true,
    labelKey: 'bloomThreshold',
    labelType: 'decimal',
  },
  {
    inputId: 'bloomStrength',
    statePath: 'bloom.strength',
    event: 'render:bloom',
    emitSlice: 'bloom',
    lookFilterTouch: true,
    labelKey: 'bloomStrength',
    labelType: 'decimal',
  },
  {
    inputId: 'bloomRadius',
    statePath: 'bloom.radius',
    event: 'render:bloom',
    emitSlice: 'bloom',
    lookFilterTouch: true,
    labelKey: 'bloomRadius',
    labelType: 'decimal',
  },
  {
    inputId: 'bloomColor',
    statePath: 'bloom.color',
    event: 'render:bloom',
    emitSlice: 'bloom',
    lookFilterTouch: true,
    inputType: 'color',
  },
  // Anamorphic bloom (toggle + quality stay inline)
  {
    inputId: 'anamorphicBloomStrength',
    statePath: 'lensFlare.anamorphicBloom.strength',
    event: 'studio:lens-flare-anamorphic-bloom',
    emitNoPayload: true,
    lookFilterTouch: true,
    labelKey: 'anamorphicBloomStrength',
    labelType: 'decimal',
  },
  {
    inputId: 'anamorphicBloomSpread',
    statePath: 'lensFlare.anamorphicBloom.spread',
    event: 'studio:lens-flare-anamorphic-bloom',
    emitNoPayload: true,
    lookFilterTouch: true,
    labelKey: 'anamorphicBloomSpread',
    labelType: 'decimal',
    clampMin: 0,
    clampMax: ANAMORPHIC_BLOOM_SPREAD_MAX,
    rewriteClamp: true,
  },
  {
    inputId: 'anamorphicBloomStreakAngle',
    statePath: 'lensFlare.anamorphicBloom.streakAngle',
    event: 'studio:lens-flare-anamorphic-bloom',
    emitNoPayload: true,
    lookFilterTouch: true,
    labelKey: 'anamorphicBloomStreakAngle',
    labelType: 'angle',
    clampMin: 0,
    clampMax: 180,
  },
  {
    inputId: 'anamorphicBloomThreshold',
    statePath: 'lensFlare.anamorphicBloom.threshold',
    event: 'studio:lens-flare-anamorphic-bloom',
    emitNoPayload: true,
    lookFilterTouch: true,
    labelKey: 'anamorphicBloomThreshold',
    labelType: 'decimal',
  },
  {
    inputId: 'anamorphicBloomSoften',
    statePath: 'lensFlare.anamorphicBloom.soften',
    event: 'studio:lens-flare-anamorphic-bloom',
    emitNoPayload: true,
    lookFilterTouch: true,
    labelKey: 'anamorphicBloomSoften',
    labelType: 'decimal',
  },
  {
    inputId: 'anamorphicBloomStreakTint',
    statePath: 'lensFlare.anamorphicBloom.streakTint',
    event: 'studio:lens-flare-anamorphic-bloom',
    emitNoPayload: true,
    lookFilterTouch: true,
    inputType: 'color',
  },
  // Lens dirt (toggle stays inline)
  {
    inputId: 'lensDirtStrength',
    statePath: 'lensDirt.strength',
    event: 'render:lens-dirt',
    emitSlice: 'lensDirt',
    lookFilterTouch: true,
    labelKey: 'lensDirtStrength',
    labelType: 'decimal',
  },
  {
    inputId: 'lensDirtTintColor',
    statePath: 'lensDirt.tintColor',
    event: 'render:lens-dirt',
    emitSlice: 'lensDirt',
    lookFilterTouch: true,
    inputType: 'color',
  },
  // Aberration (toggle stays inline)
  {
    inputId: 'aberrationAmount',
    statePath: 'aberration.amount',
    event: 'render:aberration',
    emitSlice: 'aberration',
    lookFilterTouch: true,
    labelKey: 'aberrationAmount',
    labelType: 'decimal',
    labelDecimals: 4,
  },
  {
    inputId: 'aberrationBlur',
    statePath: 'aberration.blur',
    event: 'render:aberration',
    emitSlice: 'aberration',
    lookFilterTouch: true,
    labelKey: 'aberrationBlur',
    labelType: 'decimal',
    labelDecimals: 2,
  },
  {
    inputId: 'aberrationFalloff',
    statePath: 'aberration.falloff',
    event: 'render:aberration',
    emitSlice: 'aberration',
    lookFilterTouch: true,
    labelKey: 'aberrationFalloff',
    labelType: 'decimal',
    labelDecimals: 2,
  },
  // Ambient occlusion (toggle + quality stay inline)
  {
    inputId: 'ambientOcclusionIntensity',
    statePath: 'ambientOcclusion.intensity',
    event: 'render:ambient-occlusion',
    emitSlice: 'ambientOcclusion',
    lookFilterTouch: true,
    labelKey: 'ambientOcclusionIntensity',
    labelType: 'decimal',
    clampMin: AMBIENT_OCCLUSION_INTENSITY_MIN,
    rewriteClamp: true,
  },
  {
    inputId: 'ambientOcclusionRadius',
    statePath: 'ambientOcclusion.radius',
    event: 'render:ambient-occlusion',
    emitSlice: 'ambientOcclusion',
    lookFilterTouch: true,
    labelKey: 'ambientOcclusionRadius',
    labelType: 'decimal',
  },
  {
    inputId: 'ambientOcclusionColor',
    statePath: 'ambientOcclusion.color',
    event: 'render:ambient-occlusion',
    emitSlice: 'ambientOcclusion',
    lookFilterTouch: true,
    inputType: 'color',
  },
  // Color & tone
  {
    inputId: 'cameraContrast',
    statePath: 'camera.contrast',
    event: 'render:contrast',
    lookFilterTouch: true,
    labelKey: 'cameraContrast',
    labelType: 'decimal',
    snapCenter: { min: 0, max: 2, center: 1.0 },
  },
  {
    inputId: 'cameraTemperature',
    statePath: 'camera.temperature',
    event: 'render:temperature',
    lookFilterTouch: true,
    labelKey: 'cameraTemperature',
    labelType: 'kelvin',
    snapCenter: { min: 2000, max: 10000, center: 6000 },
    fallback: CAMERA_TEMPERATURE_NEUTRAL_K,
  },
  {
    inputId: 'cameraTint',
    statePath: 'camera.tint',
    event: 'render:tint',
    emitTransform: 'divide100',
    lookFilterTouch: true,
    labelKey: 'cameraTint',
    labelType: 'integer',
    snapCenter: { min: -100, max: 100, center: 0 },
  },
  {
    inputId: 'cameraHighlights',
    statePath: 'camera.highlights',
    event: 'render:highlights',
    emitTransform: 'divide100',
    lookFilterTouch: true,
    labelKey: 'cameraHighlights',
    labelType: 'integer',
    snapCenter: { min: -100, max: 100, center: 0 },
  },
  {
    inputId: 'cameraShadows',
    statePath: 'camera.shadows',
    event: 'render:shadows',
    emitTransform: 'shadowsShader',
    lookFilterTouch: true,
    labelKey: 'cameraShadows',
    labelType: 'integer',
    snapCenter: { min: -50, max: 50, center: 0 },
  },
  {
    inputId: 'cameraSaturation',
    statePath: 'camera.saturation',
    event: 'render:saturation',
    lookFilterTouch: true,
    labelKey: 'cameraSaturation',
    labelType: 'decimal',
    snapCenter: { min: 0, max: 2, center: 1.0 },
  },
  {
    inputId: 'cameraClarity',
    statePath: 'camera.clarity',
    event: 'render:clarity',
    lookFilterTouch: true,
    labelKey: 'cameraClarity',
    labelType: 'integer',
    snapCenter: { min: -100, max: 100, center: 0 },
  },
  {
    inputId: 'cameraFade',
    statePath: 'camera.fade',
    event: 'render:fade',
    lookFilterTouch: true,
    labelKey: 'cameraFade',
    labelType: 'integer',
  },
  {
    inputId: 'cameraSharpness',
    statePath: 'camera.sharpness',
    event: 'render:sharpness',
    lookFilterTouch: true,
    labelKey: 'cameraSharpness',
    labelType: 'integer',
  },
  // Exposure
  {
    inputId: 'exposure',
    statePath: 'exposure',
    event: 'scene:exposure',
    lookFilterTouch: true,
    labelKey: 'exposure',
    labelType: 'decimal',
    snapCenter: { min: 0, max: 2, center: 1.0 },
  },
  // Vignette (toggle stays inline)
  {
    inputId: 'vignetteIntensity',
    statePath: 'camera.vignette',
    event: 'render:vignette',
    emitHook: 'vignetteEffective',
    lookFilterTouch: true,
    labelKey: 'vignetteIntensity',
    labelType: 'decimal',
    snapCenter: { min: 0, max: 1, center: 0 },
  },
  {
    inputId: 'vignetteColor',
    statePath: 'camera.vignetteColor',
    event: 'render:vignette-color',
    lookFilterTouch: true,
    inputType: 'color',
  },
];

/** Render controls without look-filter touch (camera / fisheye). */
export const RENDER_PLAIN_MANIFEST = [
  {
    inputId: 'cameraTilt',
    statePath: 'camera.tilt',
    event: 'camera:tilt',
    labelKey: 'cameraTilt',
    labelType: 'angle',
  },
  {
    inputId: 'fisheyeHorizontalFOV',
    statePath: 'fisheye.horizontalFOVDeg',
    event: 'camera:fisheye',
    emitNoPayload: true,
    labelKey: 'fisheyeHorizontalFOV',
    labelType: 'angle',
  },
  {
    inputId: 'fisheyeStrength',
    statePath: 'fisheye.strength',
    event: 'camera:fisheye',
    emitNoPayload: true,
    labelKey: 'fisheyeStrength',
    labelType: 'decimal',
  },
  {
    inputId: 'fisheyeCylindricalRatio',
    statePath: 'fisheye.cylindricalRatio',
    event: 'camera:fisheye',
    emitNoPayload: true,
    labelKey: 'fisheyeCylindricalRatio',
    labelType: 'decimal',
  },
];
