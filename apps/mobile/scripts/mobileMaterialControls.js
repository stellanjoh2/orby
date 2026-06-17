import {
  DEFAULT_MATERIAL_BRIGHTNESS,
  MATERIAL_EMISSIVE_SLIDER_MAX,
} from '../../../scripts/constants.js';
import { MOBILE_MATERIAL_DEFAULTS } from './mobileParityDefaults.js';

/** @typedef {{ path: 'brightness' | 'metalness' | 'roughness' | 'emissive', label: string, min: number, max: number, step: number, format: (v: number) => string, defaultValue?: number }} MaterialSliderDef */

/** Object material sliders — first block in the mobile Adjust panel. */
export const MOBILE_MATERIAL_SLIDERS = /** @type {MaterialSliderDef[]} */ ([
  {
    path: 'brightness',
    label: 'Brightness',
    min: 0,
    max: 5,
    step: 0.01,
    format: (v) => v.toFixed(2),
    defaultValue: DEFAULT_MATERIAL_BRIGHTNESS,
  },
  {
    path: 'metalness',
    label: 'Metalness',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    defaultValue: MOBILE_MATERIAL_DEFAULTS.metalness,
  },
  {
    path: 'roughness',
    label: 'Roughness',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    defaultValue: MOBILE_MATERIAL_DEFAULTS.roughness,
  },
  {
    path: 'emissive',
    label: 'Emissive',
    min: 0,
    max: MATERIAL_EMISSIVE_SLIDER_MAX,
    step: 0.01,
    format: (v) => v.toFixed(2),
    defaultValue: MOBILE_MATERIAL_DEFAULTS.emissive,
  },
]);
