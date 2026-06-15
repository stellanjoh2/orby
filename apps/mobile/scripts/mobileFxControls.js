import {
  CAMERA_SHADOWS_UI_MIN,
  CAMERA_SHADOWS_UI_MAX,
  CAMERA_TEMPERATURE_MIN_K,
  CAMERA_TEMPERATURE_MAX_K,
  CAMERA_TEMPERATURE_NEUTRAL_K,
  isVignetteUiEnabled,
} from '../../../scripts/constants.js';
import { MOBILE_FX_DEFAULTS } from './mobileFxDefaults.js';

/** @typedef {{ path: string, label: string, min: number, max: number, step: number, format: (v: number) => string, defaultValue?: number }} FxSliderDef */
/** @typedef {{ id: string, label: string, sliders: FxSliderDef[] }} FxSliderSection */

/** @type {FxSliderSection[]} */
export const MOBILE_FX_SLIDER_SECTIONS = [
  {
    id: 'color',
    label: 'Color',
    sliders: [
      {
        path: 'exposure',
        label: 'Exposure',
        min: 0,
        max: 2,
        step: 0.01,
        format: (v) => v.toFixed(2),
        defaultValue: MOBILE_FX_DEFAULTS.exposure,
      },
      {
        path: 'camera.contrast',
        label: 'Contrast',
        min: 0,
        max: 2,
        step: 0.01,
        format: (v) => v.toFixed(2),
        defaultValue: MOBILE_FX_DEFAULTS.camera.contrast,
      },
      {
        path: 'camera.saturation',
        label: 'Saturation',
        min: 0,
        max: 2,
        step: 0.01,
        format: (v) => v.toFixed(2),
        defaultValue: MOBILE_FX_DEFAULTS.camera.saturation,
      },
      {
        path: 'camera.temperature',
        label: 'Temperature',
        min: CAMERA_TEMPERATURE_MIN_K,
        max: CAMERA_TEMPERATURE_MAX_K,
        step: 50,
        format: (v) => `${Math.round(v)}K`,
        defaultValue: CAMERA_TEMPERATURE_NEUTRAL_K,
      },
      {
        path: 'camera.tint',
        label: 'Tint',
        min: -100,
        max: 100,
        step: 1,
        format: (v) => String(Math.round(v)),
        defaultValue: 0,
      },
      {
        path: 'camera.highlights',
        label: 'Highlights',
        min: -100,
        max: 100,
        step: 1,
        format: (v) => String(Math.round(v)),
        defaultValue: 0,
      },
      {
        path: 'camera.shadows',
        label: 'Shadows',
        min: CAMERA_SHADOWS_UI_MIN,
        max: CAMERA_SHADOWS_UI_MAX,
        step: 1,
        format: (v) => String(Math.round(v)),
        defaultValue: 0,
      },
    ],
  },
  {
    id: 'detail',
    label: 'Detail',
    sliders: [
      {
        path: 'camera.clarity',
        label: 'Clarity',
        min: -100,
        max: 100,
        step: 1,
        format: (v) => String(Math.round(v)),
        defaultValue: 0,
      },
      {
        path: 'camera.fade',
        label: 'Fade',
        min: 0,
        max: 100,
        step: 1,
        format: (v) => String(Math.round(v)),
        defaultValue: 0,
      },
      {
        path: 'camera.sharpness',
        label: 'Sharpness',
        min: -100,
        max: 100,
        step: 1,
        format: (v) => String(Math.round(v)),
        defaultValue: 0,
      },
    ],
  },
];

/**
 * Lens sliders — 0 means off; dragging above 0 enables the effect.
 * @type {{ togglePath: string, sliderPath: string, label: string, min: number, max: number, step: number, format: (v: number) => string }[]}
 */
export const MOBILE_FX_LENS_ROWS = [
  {
    togglePath: 'camera.vignetteEnabled',
    sliderPath: 'camera.vignette',
    label: 'Vignette',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    togglePath: 'grain.enabled',
    sliderPath: 'grain.intensity',
    label: 'Grain',
    min: 0,
    max: 0.15,
    step: 0.001,
    format: (v) => v.toFixed(3),
  },
  {
    togglePath: 'aberration.enabled',
    sliderPath: 'aberration.amount',
    label: 'Chromatic aberration',
    min: 0,
    max: 0.0025,
    step: 0.00005,
    format: (v) => v.toFixed(4),
  },
];

/** Mobile Adjust — bloom intensity (0 = off) + radius as paired sliders. */
export const MOBILE_FX_BLOOM_SLIDERS = /** @type {FxSliderDef[]} */ ([
  {
    path: 'bloom.strength',
    label: 'Bloom intensity',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    defaultValue: 0,
  },
  {
    path: 'bloom.radius',
    label: 'Bloom radius',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    defaultValue: MOBILE_FX_DEFAULTS.bloom.radius,
  },
]);

/** @param {object | undefined} state */
export function getMobileBloomIntensityUiValue(state) {
  const bloom = state?.bloom ?? {};
  const strength = Number(bloom.strength ?? 0);
  if (!bloom.enabled || strength <= 0.0001) return 0;
  return strength;
}

/**
 * @param {{ setFxValue: (path: string, value: number | boolean) => void }} scene
 * @param {string} path
 * @param {number} value
 */
export function applyMobileBloomSliderValue(scene, path, value) {
  if (path === 'bloom.strength') {
    const amount = Math.max(0, value);
    const off = amount <= 0.0001;
    scene.setFxValue('bloom.enabled', !off);
    scene.setFxValue('bloom.strength', off ? 0 : amount);
    return;
  }
  scene.setFxValue(path, value);
}

/** @param {object | undefined} state @param {typeof MOBILE_FX_LENS_ROWS[number]} row */
export function isMobileLensEffectActive(state, row) {
  if (row.togglePath === 'camera.vignetteEnabled') {
    return isVignetteUiEnabled(state?.camera ?? {});
  }
  return Boolean(getNestedValue(state ?? {}, row.togglePath));
}

/** UI slider value — 0 when the effect is off. */
export function getMobileLensSliderUiValue(state, row) {
  if (!isMobileLensEffectActive(state, row)) return row.min;
  const value = getNestedValue(state ?? {}, row.sliderPath);
  return typeof value === 'number' ? value : row.min;
}

/**
 * @param {{ setFxValue: (path: string, value: number | boolean) => void }} scene
 * @param {typeof MOBILE_FX_LENS_ROWS[number]} row
 * @param {number} value
 */
export function applyMobileLensSliderValue(scene, row, value) {
  const amount = Math.max(row.min, value);
  const off = amount <= row.min + 1e-9;

  if (row.togglePath === 'camera.vignetteEnabled') {
    scene.setFxValue('camera.vignetteEnabled', !off);
    scene.setFxValue('camera.vignette', off ? 0 : amount);
    return;
  }

  scene.setFxValue(row.togglePath, !off);
  scene.setFxValue(row.sliderPath, off ? 0 : amount);
}

/** @type {FxSliderDef} */
export const MOBILE_CAMERA_FOV = {
  path: 'fov',
  label: 'Field of view',
  min: 28,
  max: 85,
  step: 1,
  format: (v) => `${Math.round(v)}°`,
  defaultValue: 45,
};

/** @param {object} obj @param {string} path @param {unknown} value */
export function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (cur[key] == null || typeof cur[key] !== 'object') {
      cur[key] = {};
    }
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

/** @param {object} obj @param {string} path */
export function getNestedValue(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const key of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[key];
  }
  return cur;
}
