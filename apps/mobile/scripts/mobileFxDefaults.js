import { CAMERA_TEMPERATURE_NEUTRAL_K } from '../../../scripts/constants.js';

/** Minimal defaults for mobile look-filter merge (matches desktop StateStore). */
export const MOBILE_FX_DEFAULTS = {
  lookFilterPreset: 'none',
  exposure: 1.0,
  autoExposure: false,
  toneMapping: 'aces-filmic',
  camera: {
    contrast: 1.0,
    temperature: CAMERA_TEMPERATURE_NEUTRAL_K,
    tint: 0,
    highlights: 0,
    shadows: 0,
    saturation: 1.0,
    clarity: 0,
    fade: 0,
    sharpness: 0,
    vignetteEnabled: false,
    vignette: 0,
    vignetteColor: '#080808',
  },
  bloom: {
    enabled: true,
    threshold: 1.0,
    strength: 0.2,
    radius: 0.2,
    color: '#ffe9cc',
  },
  grain: { enabled: false, intensity: 0, color: '#ffffff' },
  aberration: { enabled: false, amount: 0 },
  dof: { enabled: false },
  toneCurve: {
    blackY: 0,
    whiteY: 1,
    p1: { x: 1 / 3, y: 1 / 3 },
    p2: { x: 2 / 3, y: 2 / 3 },
  },
  lensDirt: {},
};
