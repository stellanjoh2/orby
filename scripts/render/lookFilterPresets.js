/**
 * Look filter (Camera & FX) presets: Instagram-style one-tap grades + post stack.
 * Presets only override grading and post keys; FOV, tilt, and orbit are preserved from current state.
 */
import { normalizeToneCurve } from '../math/toneCurvePchip.js';
import { deepClone } from '../utils/deepClone.js';

const GRADING_KEYS = [
  'contrast',
  'temperature',
  'tint',
  'highlights',
  'shadows',
  'saturation',
  'clarity',
  'fade',
  'sharpness',
  'vignetteEnabled',
  'vignette',
  'vignetteColor',
];

/** UI metadata + 192px preview asset (center-cropped from orby-lookfilter-* sources). Grid order: natural → muted/film → color → stylized. */
export const LOOK_FILTER_CATALOG = [
  {
    id: 'none',
    label: 'None',
    thumb: './assets/images/look-filters/none.png',
  },
  {
    id: 'studio',
    label: 'Studio',
    thumb: './assets/images/look-filters/studio.png',
  },
  {
    id: 'noir',
    label: 'Noir',
    thumb: './assets/images/look-filters/noir.png',
  },
  {
    id: 'mood',
    label: 'Mood',
    thumb: './assets/images/look-filters/mood.png',
  },
  {
    id: 'vintage',
    label: 'Vintage',
    thumb: './assets/images/look-filters/vintage.png',
  },
  {
    id: 'cinema',
    label: 'Cinema',
    thumb: './assets/images/look-filters/cinema.png',
  },
  {
    id: 'frost',
    label: 'Frost',
    thumb: './assets/images/look-filters/frost.png',
  },
  {
    id: 'golden',
    label: 'Golden',
    thumb: './assets/images/look-filters/golden.png',
  },
  {
    id: 'dream',
    label: 'Dream',
    thumb: './assets/images/look-filters/dream.png',
  },
  {
    id: 'neon',
    label: 'Neon',
    thumb: './assets/images/look-filters/neon.png',
  },
];

/**
 * Per-preset overrides (merged on top of app defaults, except "none" which restores defaults for these keys).
 * Only include fields that differ from defaults; nested objects are shallow-merged with defaults for that key.
 *
 * Film grain: `grain.intensity` is the stored value (UI slider 0–5 maps ×0.15, so 0.75 = slider max).
 * Chromatic aberration: `aberration` merges with defaults; set `enabled: false` for none. When on, `amount` is the radial channel-separation magnitude (0..0.02 typical); `blur` adds radial streak smear (0..1); `falloff` controls edge ramp (0.5..3, default 1); `quality` sets blur sample count (low..ultra).
 */
const PRESET_SPECS = {
  studio: {
    aberration: { enabled: false },
    camera: {
      contrast: 1.12,
      saturation: 1.1,
      clarity: 18,
      temperature: 5800,
      highlights: 6,
      sharpness: 8,
    },
    grain: { enabled: true, intensity: 0.018, color: '#c8c8c8' },
  },
  noir: {
    exposure: 0.95,
    camera: {
      contrast: 1.16,
      saturation: 0.08,
      temperature: 4800,
      tint: -6,
      highlights: -28,
      shadows: 0,
      vignetteEnabled: true,
      vignette: 0.5,
      vignetteColor: '#080808',
    },
    bloom: { enabled: false },
    /* Slider max: UI 5.0 → stored intensity 0.75 (see grainIntensity × 0.15) */
    grain: { enabled: true, intensity: 0.15, color: '#a0a0a0' },
    toneCurve: {
      p1: { x: 0.24, y: 0.17 },
      p2: { x: 0.78, y: 0.74 },
    },
    /* Heavy CA — old lens, high-contrast B&W */
    aberration: { enabled: true, amount: 0.00128 },
  },
  golden: {
    camera: {
      temperature: 7800,
      tint: 10,
      saturation: 1.12,
      highlights: -16,
      shadows: 0,
      contrast: 1.02,
    },
    bloom: {
      enabled: true,
      strength: 0.38,
      threshold: 0.88,
      radius: 0.88,
      color: '#ffcc99',
    },
    grain: { enabled: true, intensity: 0.045, color: '#fff0d4' },
    /* Very light — warm haze, not a defect look */
    aberration: { enabled: true, amount: 0.000255 },
  },
  frost: {
    camera: {
      temperature: 4200,
      tint: -12,
      saturation: 0.9,
      clarity: 24,
      contrast: 1.06,
      highlights: 8,
    },
    bloom: {
      enabled: true,
      strength: 0.2,
      threshold: 0.95,
      color: '#b8d8ff',
    },
    grain: { enabled: true, intensity: 0.032, color: '#b8c8d8' },
    /* Barely there — clean digital cold look */
    aberration: { enabled: true, amount: 0.000144 },
  },
  vintage: {
    camera: {
      temperature: 7000,
      fade: 12,
      saturation: 0.7,
      contrast: 0.88,
      sharpness: -5,
    },
    bloom: { strength: 0.14, color: '#ffd6b0' },
    grain: { enabled: true, intensity: 0.075, color: '#d8b898' },
    toneCurve: {
      p1: { x: 0.26, y: 0.33 },
      p2: { x: 0.74, y: 0.78 },
    },
    /* Medium — aged optics / home film */
    aberration: { enabled: true, amount: 0.000891 },
  },
  cinema: {
    camera: {
      temperature: 5200,
      tint: -18,
      saturation: 0.86,
      contrast: 0.9,
      highlights: -12,
      shadows: -2,
      vignetteEnabled: true,
      vignette: 0.44,
      vignetteColor: '#0a0c12',
      clarity: 6,
    },
    bloom: {
      enabled: true,
      strength: 0.34,
      threshold: 0.82,
      radius: 0.82,
      color: '#ff7a4a',
    },
    grain: { enabled: true, intensity: 0.04, color: '#b0b8c0' },
    toneCurve: {
      p1: { x: 0.2, y: 0.14 },
      p2: { x: 0.8, y: 0.78 },
    },
    /* Subtle scope / anamorphic edge */
    aberration: { enabled: true, amount: 0.000399 },
  },
  mood: {
    exposure: 0.9,
    camera: {
      saturation: 0.55,
      contrast: 1.22,
      vignetteEnabled: true,
      vignette: 0.64,
      temperature: 5000,
      highlights: -36,
      shadows: -22,
    },
    bloom: { enabled: false, strength: 0.0 },
    grain: { enabled: true, intensity: 0.12, color: '#707070' },
    /* Off — keep edges crisp in the dark */
    aberration: { enabled: false },
  },
  dream: {
    exposure: 1.05,
    camera: {
      highlights: 20,
      contrast: 0.94,
      saturation: 0.92,
      sharpness: -6,
      clarity: -12,
    },
    bloom: {
      enabled: true,
      strength: 0.15,
      threshold: 0.78,
      radius: 0.15,
      color: '#ffffff',
    },
    toneCurve: {
      p1: { x: 0.25, y: 0.34 },
      p2: { x: 0.75, y: 0.84 },
    },
    grain: { enabled: true, intensity: 0.038, color: '#e0dce8' },
    /* Soft prism / veil */
    aberration: { enabled: true, amount: 0.000696 },
  },
  neon: {
    camera: {
      tint: 32,
      temperature: 5400,
      saturation: 1.38,
      contrast: 1.15,
    },
    bloom: {
      enabled: true,
      strength: 0.10,
      threshold: 0.68,
      color: '#ff66ee',
    },
    /* Strong — max stylized; pairs with CA UI near top of range */
    aberration: { enabled: true, amount: 0.002436 },
    grain: { enabled: true, intensity: 0.05, color: '#e0b0ff' },
  },
};

function mergeObject(base, patch) {
  if (!patch) return base;
  return { ...base, ...patch };
}

function mergeCameraGradingFromDefaults(currentCamera, defaultsCamera) {
  const out = { ...currentCamera };
  for (const k of GRADING_KEYS) {
    out[k] = defaultsCamera[k];
  }
  return out;
}

/**
 * Named presets: reset all grading to defaults, then apply only keys present in
 * the preset spec. Prevents values like Fade from sticking when switching from Vintage.
 */
function mergeCameraForNamedPreset(currentCamera, defaultsCamera, specCamera) {
  const out = { ...currentCamera };
  for (const k of GRADING_KEYS) {
    out[k] = defaultsCamera[k];
  }
  if (specCamera) {
    for (const k of GRADING_KEYS) {
      if (specCamera[k] !== undefined) {
        out[k] = specCamera[k];
      }
    }
  }
  return out;
}

/**
 * @param {string} presetId
 * @param {object} defaults  from stateStore.getDefaults()
 * @param {object} current  from stateStore.getState()
 */
export function mergeLookFilterState(presetId, defaults, current) {
  if (presetId === 'none') {
    return {
      lookFilterPreset: 'none',
      camera: mergeCameraGradingFromDefaults(current.camera, defaults.camera),
      bloom: deepClone(defaults.bloom),
      grain: deepClone(defaults.grain),
      aberration: deepClone(defaults.aberration),
      dof: deepClone(defaults.dof),
      exposure: defaults.exposure,
      autoExposure: defaults.autoExposure ?? false,
      toneCurve: deepClone(defaults.toneCurve),
      toneMapping: defaults.toneMapping,
      lensDirt: deepClone(defaults.lensDirt),
    };
  }

  const spec = PRESET_SPECS[presetId];
  if (!spec) {
    return mergeLookFilterState('none', defaults, current);
  }

  const d = defaults;
  const cam = mergeCameraForNamedPreset(
    current.camera,
    d.camera,
    spec.camera,
  );
  return {
    lookFilterPreset: presetId,
    camera: cam,
    bloom: mergeObject(deepClone(d.bloom), spec.bloom),
    grain: mergeObject(deepClone(d.grain), spec.grain),
    aberration: mergeObject(deepClone(d.aberration), spec.aberration),
    dof: deepClone(d.dof),
    exposure: spec.exposure !== undefined ? spec.exposure : current.exposure,
    autoExposure:
      spec.autoExposure !== undefined ? spec.autoExposure : current.autoExposure,
    toneCurve: spec.toneCurve
      ? normalizeToneCurve((() => {
          const raw = {
            blackY: spec.toneCurve.blackY ?? d.toneCurve?.blackY,
            whiteY: spec.toneCurve.whiteY ?? d.toneCurve?.whiteY,
            p1: mergeObject(
              { ...(d.toneCurve?.p1 ?? { x: 1 / 3, y: 1 / 3 }) },
              spec.toneCurve.p1 ?? {},
            ),
            p2: mergeObject(
              { ...(d.toneCurve?.p2 ?? { x: 2 / 3, y: 2 / 3 }) },
              spec.toneCurve.p2 ?? {},
            ),
          };
          if (spec.toneCurve.p3) {
            raw.p3 = mergeObject(
              { ...(d.toneCurve?.p3 ?? { x: 0.5, y: 0.5 }) },
              spec.toneCurve.p3,
            );
          }
          if (spec.toneCurve.p4) {
            raw.p4 = mergeObject(
              { ...(d.toneCurve?.p4 ?? { x: 0.5, y: 0.5 }) },
              spec.toneCurve.p4,
            );
          }
          return raw;
        })())
      : deepClone(d.toneCurve),
    toneMapping: spec.toneMapping !== undefined ? spec.toneMapping : current.toneMapping,
    lensDirt: mergeObject(deepClone(d.lensDirt), spec.lensDirt),
  };
}
