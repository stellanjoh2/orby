import {
  creativeLookDefaultIntensity,
  creativeLookDefaultPatternScale,
  creativeLookFixedIntensity,
  creativeLookFixedPatternScale,
  creativeLookPatternScaleBounds,
  creativeLookPresetLocksIntensity,
  creativeLookPresetLocksMasterHue,
  creativeLookPresetLocksPatternScale,
  creativeLookPresetUsesShaderAnimation,
  normalizeCreativeLookPatternScale,
  normalizeCreativeLookPreset,
} from '../../../scripts/render/CreativeLookMaterials.js';
import {
  creativeLookPresetHidesPatternScale,
  normalizeCreativeLookPresetParams,
} from '../../../scripts/render/creativeLookPresetSliders.js';

/** @typedef {{ path: string, label: string, min: number, max: number, step: number, format: (v: number) => string, defaultValue?: number }} StyleSliderDef */

/** Shader Lab sliders — matches desktop creative-look section (index.html). */
export const MOBILE_STYLE_SLIDERS = /** @type {StyleSliderDef[]} */ ([
  {
    path: 'masterHue',
    label: 'Master Hue',
    min: -180,
    max: 180,
    step: 1,
    format: (v) => `${Math.round(v)}°`,
    defaultValue: 0,
  },
  {
    path: 'intensity',
    label: 'Intensity',
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => v.toFixed(2),
    defaultValue: 1,
  },
  {
    path: 'liftCrush',
    label: 'Lift/Crush',
    min: -1,
    max: 1,
    step: 0.05,
    format: (v) => (v >= 0 ? '+' : '') + v.toFixed(2),
    defaultValue: 0,
  },
  {
    path: 'shaderAnimationSpeed',
    label: 'Anim Speed',
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => v.toFixed(2),
    defaultValue: 0.4,
  },
  {
    path: 'patternScale',
    label: 'Scale',
    min: 0.02,
    max: 5,
    step: 0.02,
    format: (v) => `${v.toFixed(2)}×`,
    defaultValue: 1,
  },
]);

/**
 * @param {string | null | undefined} preset
 * @param {string} path
 */
export function isMobileStyleSliderDisabled(preset, path) {
  const id = normalizeCreativeLookPreset(preset ?? 'neon-edge');
  if (path === 'masterHue') return creativeLookPresetLocksMasterHue(id);
  if (path === 'intensity') return creativeLookPresetLocksIntensity(id);
  if (path === 'patternScale') {
    return (
      creativeLookPresetLocksPatternScale(id) ||
      creativeLookPresetHidesPatternScale(id)
    );
  }
  if (path === 'shaderAnimationSpeed') {
    return !creativeLookPresetUsesShaderAnimation(id);
  }
  return false;
}

/**
 * @param {string | null | undefined} preset
 * @param {string} path
 * @param {number | undefined} raw
 */
export function resolveMobileStyleSliderValue(preset, path, raw) {
  const id = normalizeCreativeLookPreset(preset ?? 'neon-edge');
  if (path === 'patternScale') {
    const fixed = creativeLookFixedPatternScale(id);
    if (fixed != null) return fixed;
    return normalizeCreativeLookPatternScale(id, raw);
  }
  if (path === 'intensity') {
    const fixed = creativeLookFixedIntensity(id);
    if (fixed != null) return fixed;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.min(2, Math.max(0, value)) : 1;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    const def = MOBILE_STYLE_SLIDERS.find((s) => s.path === path);
    return def?.defaultValue ?? def?.min ?? 0;
  }
  return value;
}

/**
 * @param {string | null | undefined} preset
 * @param {string} path
 */
export function mobileStyleSliderBounds(preset, path) {
  if (path !== 'patternScale') {
    const def = MOBILE_STYLE_SLIDERS.find((s) => s.path === path);
    return { min: def?.min ?? 0, max: def?.max ?? 1, step: def?.step ?? 0.01 };
  }
  const { min, max } = creativeLookPatternScaleBounds(normalizeCreativeLookPreset(preset ?? 'neon-edge'));
  return { min, max, step: 0.02 };
}

/**
 * @param {string | null | undefined} preset
 * @param {string} path
 */
export function isMobileStyleSliderHidden(preset, path) {
  const id = normalizeCreativeLookPreset(preset ?? 'neon-edge');
  if (path === 'patternScale') {
    return (
      creativeLookPresetHidesPatternScale(id)
      || creativeLookPresetLocksPatternScale(id)
    );
  }
  if (path === 'intensity') {
    return creativeLookPresetLocksIntensity(id);
  }
  if (path === 'shaderAnimationSpeed') {
    return !creativeLookPresetUsesShaderAnimation(id);
  }
  return false;
}

/** @param {string | null | undefined} presetId */
export function buildMobileCreativeLookResetPatch(presetId) {
  const preset = normalizeCreativeLookPreset(presetId ?? 'neon-edge');
  const fixedScale = creativeLookFixedPatternScale(preset);
  const defaultScale = creativeLookDefaultPatternScale(preset);
  const patternScale = fixedScale ?? defaultScale ?? 1;
  const fixedIntensity = creativeLookFixedIntensity(preset);

  return {
    shaderAnimationSpeed: 0.4,
    masterHue: 0,
    liftCrush: 0,
    pauseShaderAnimations: false,
    viewportBloom: false,
    intensity: fixedIntensity ?? creativeLookDefaultIntensity(preset),
    patternScale,
    presetParams: normalizeCreativeLookPresetParams(preset, {}, patternScale),
  };
}
