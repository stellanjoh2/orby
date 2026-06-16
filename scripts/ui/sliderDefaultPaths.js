import { DEFAULT_EXTRUDE_DEPTH } from '../import/extrudeDefaults.js';

/**
 * Maps `UIManager.inputs` keys (and `data-output` keys) to StateStore dot paths.
 * Keys omitted here fall back to the same top-level key in `getDefaults()`.
 */
export const SLIDER_DEFAULT_PATHS = {
  materialBrightness: 'material.brightness',
  materialMetalness: 'material.metalness',
  materialRoughness: 'material.roughness',
  materialEmissive: 'material.emissive',
  stlSmoothingAngle: 'advanced.stlSmoothingAngle',
  uvCheckerScale: 'advanced.uvCheckerScale',
  glassOpacity: 'advanced.glassOpacity',
  glassReflection: 'advanced.glassReflection',
  glassBody: 'advanced.glassBody',
  subsurfaceTranslucency: 'subsurface.translucency',
  creativeLookShaderAnimationSpeed: 'creativeLook.shaderAnimationSpeed',
  creativeLookPatternScale: 'creativeLook.patternScale',
  creativeLookSketchStrokeWidth: 'creativeLook.presetParams.sketch.strokeWidth',
  creativeLookSketchRasterSize: 'creativeLook.presetParams.sketch.rasterSize',
  creativeLookInkStrokeColor: 'creativeLook.presetParams.ink.strokeColor',
  creativeLookMasterHue: 'creativeLook.masterHue',
  creativeLookIntensity: 'creativeLook.intensity',
  creativeLookLiftCrush: 'creativeLook.liftCrush',
  fresnelRadius: 'fresnel.radius',
  fresnelStrength: 'fresnel.strength',
  svgExtrudeDepth: 'svgExtrude.depth',
  svgExtrudeBevelAmount: 'svgExtrude.bevelAmount',
  svgExtrudeNormalAngle: 'svgExtrude.normalAngle',
  svgExtrudeSurfaceScale: 'svgExtrude.surfaceScale',
  svgExtrudeSurfaceStrength: 'svgExtrude.surfaceStrength',
  lensFlareRotation: 'lensFlare.rotation',
  lensFlareHeight: 'lensFlare.height',
  lensFlareHalo: 'lensFlare.haloIntensity',
  lensFlareStreakLength: 'lensFlare.streakLength',
  lensFlareSunDiscScale: 'lensFlare.sunDiscScale',
  lensFlareSunDiscBlur: 'lensFlare.sunDiscBlur',
  lensFlareDiscGlowIntensity: 'lensFlare.discGlowIntensity',
  lensFlareDiscGlowSize: 'lensFlare.discGlowSize',
  godRaysLightScale: 'godRays.lightScale',
  godRaysOpacity: 'godRays.opacity',
  godRaysDensity: 'godRays.density',
  godRaysDecay: 'godRays.decay',
  godRaysWeight: 'godRays.weight',
  godRaysExposure: 'godRays.exposure',
  godRaysClampMax: 'godRays.clampMax',
  keyLightStrength: 'lights.key.intensity',
  keyLightHeight: 'lights.key.height',
  keyLightRotate: 'lights.key.rotate',
  fillLightStrength: 'lights.fill.intensity',
  fillLightHeight: 'lights.fill.height',
  fillLightRotate: 'lights.fill.rotate',
  rimLightStrength: 'lights.rim.intensity',
  rimLightHeight: 'lights.rim.height',
  rimLightRotate: 'lights.rim.rotate',
  ambientLightStrength: 'lights.ambient.intensity',
  goboSoftness: 'gobo.softness',
  goboScale: 'gobo.scale',
  goboRotation: 'gobo.rotation',
  dofFocus: 'dof.focus',
  dofAperture: 'dof.aperture',
  bloomThreshold: 'bloom.threshold',
  bloomStrength: 'bloom.strength',
  bloomRadius: 'bloom.radius',
  anamorphicBloomStrength: 'lensFlare.anamorphicBloom.strength',
  anamorphicBloomSpread: 'lensFlare.anamorphicBloom.spread',
  anamorphicBloomStreakAngle: 'lensFlare.anamorphicBloom.streakAngle',
  anamorphicBloomThreshold: 'lensFlare.anamorphicBloom.threshold',
  anamorphicBloomSoften: 'lensFlare.anamorphicBloom.soften',
  lensDirtStrength: 'lensDirt.strength',
  grainIntensity: 'grain.intensity',
  aberrationAmount: 'aberration.amount',
  ambientOcclusionIntensity: 'ambientOcclusion.intensity',
  ambientOcclusionRadius: 'ambientOcclusion.radius',
  backgroundGradientAngle: 'backgroundGradient.angle',
  backgroundGradientCenterX: 'backgroundGradient.centerX',
  backgroundGradientCenterY: 'backgroundGradient.centerY',
  cameraFov: 'camera.fov',
  fisheyeHorizontalFOV: 'fisheye.horizontalFOVDeg',
  fisheyeStrength: 'fisheye.strength',
  fisheyeCylindricalRatio: 'fisheye.cylindricalRatio',
  cameraTilt: 'camera.tilt',
  cameraPosX: 'camera.worldPosition.x',
  cameraPosY: 'camera.worldPosition.y',
  cameraPosZ: 'camera.worldPosition.z',
  cameraDistance: 'camera.distance',
  cameraClipNear: 'camera.clipPlanes.near',
  cameraClipFar: 'camera.clipPlanes.far',
  cameraContrast: 'camera.contrast',
  cameraTemperature: 'camera.temperature',
  cameraTint: 'camera.tint',
  cameraHighlights: 'camera.highlights',
  cameraShadows: 'camera.shadows',
  cameraSaturation: 'camera.saturation',
  cameraClarity: 'camera.clarity',
  cameraFade: 'camera.fade',
  cameraSharpness: 'camera.sharpness',
  vignetteIntensity: 'camera.vignette',
  colorCheckerDistance: 'colorChecker.distance',
  colorCheckerRotate: 'colorChecker.rotate',
  colorCheckerHeight: 'colorChecker.height',
  colorCheckerScale: 'colorChecker.scale',
  animationJointScale: 'animation.jointScale',
  animationBoneStrokeWidth: 'animation.boneStrokeWidth',
  fontExtrudePreviewScale: 'fontExtrude.previewScale',
  fontExtrudeTracking: 'fontExtrude.tracking',
  fontExtrudeLineHeight: 'fontExtrude.lineHeight',
  fontExtrudeRevealDuration: 'fontExtrude.revealDurationSec',
  fontExtrudeRevealSlideDepth: 'fontExtrude.revealSlideDepth',
  fontExtrudeRevealSlideTime: 'fontExtrude.revealSlideTime',
  fontExtrudeRevealEmissiveStrength: 'fontExtrude.revealEmissiveStrength',
  fontExtrudeRevealEmissiveDecay: 'fontExtrude.revealEmissiveDecaySec',
};

/** Export panel sliders — stored on `UIManager.exportSettings`, not StateStore. */
const EXPORT_SLIDER_DEFAULTS = {
  exportZoomDistance: 1.5,
  exportTiltAngle: 15,
  exportFovOffset: 0,
};

export function getAtPath(obj, path) {
  if (!path) return obj;
  const segments = path.split('.');
  let current = obj;
  for (const seg of segments) {
    if (current == null) return undefined;
    current = current[seg];
  }
  return current;
}

export function resolveSliderInputKey(slider, inputs = {}) {
  if (!(slider instanceof HTMLInputElement)) return null;

  for (const [key, el] of Object.entries(inputs)) {
    if (el === slider) return key;
  }

  if (slider.id) {
    for (const [key, el] of Object.entries(inputs)) {
      if (el instanceof Element && el.id === slider.id) return key;
    }
  }

  return slider.closest('.slider-line')?.querySelector('[data-output]')?.dataset.output ?? null;
}

export function resolveSliderDefaultPath(inputKey) {
  if (!inputKey) return null;
  return SLIDER_DEFAULT_PATHS[inputKey] ?? inputKey;
}

/**
 * @param {HTMLInputElement} slider
 * @param {string|null} inputKey
 * @param {object} defaults — from `stateStore.getDefaults()`
 * @returns {number|undefined}
 */
export function resolveSliderDefaultValue(slider, inputKey, defaults) {
  if (!slider || slider.type !== 'range') return undefined;

  const color = slider.dataset.color;
  const kind = slider.dataset.kind;
  if (color && kind === 'offset') return 0;
  if (color && kind === 'depth') {
    const depth = defaults?.svgExtrude?.depth;
    return Number.isFinite(depth) ? depth : DEFAULT_EXTRUDE_DEPTH;
  }

  if (inputKey && Object.prototype.hasOwnProperty.call(EXPORT_SLIDER_DEFAULTS, inputKey)) {
    return EXPORT_SLIDER_DEFAULTS[inputKey];
  }

  const path = resolveSliderDefaultPath(inputKey);
  if (!path) return undefined;

  const value = getAtPath(defaults, path);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** True when `clientX` is over the slider thumb (not the track). */
export function isPointerOnSliderThumb(slider, clientX, tolerancePx = 10) {
  if (!(slider instanceof HTMLInputElement) || slider.type !== 'range') return false;

  const rect = slider.getBoundingClientRect();
  if (rect.width <= 0) return false;

  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) ? max : 100;
  const value = parseFloat(slider.value);
  const range = hi - lo;
  const ratio = range > 0 && Number.isFinite(value) ? (value - lo) / range : 0;

  const sliderLine = slider.closest('.slider-line');
  const isRtl =
    sliderLine?.classList.contains('slider-line--surface-detail') ||
    getComputedStyle(slider).direction === 'rtl';
  const thumbCenterX = isRtl ? rect.right - ratio * rect.width : rect.left + ratio * rect.width;

  return Math.abs(clientX - thumbCenterX) <= tolerancePx;
}
