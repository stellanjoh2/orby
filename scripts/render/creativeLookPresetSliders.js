import {
  resolveCreativeLookSketchParams,
} from './creativeLookSketchArt.js';
import {
  resolveCreativeLookInkParams,
} from './creativeLookInkArt.js';

/**
 * @typedef {{
 *   id: string,
 *   stateKey: string,
 *   label: string,
 *   tooltip: string,
 *   min: number,
 *   max: number,
 *   step: number,
 *   default: number,
 *   format?: 'multiplier' | 'decimal',
 * }} CreativeLookPresetSliderDef
 */

/** Shader Lab grid — Artistic section (matches index.html). */
export const CREATIVE_LOOK_ARTISTIC_PRESETS = /** @type {const} */ ([
  'watercolour',
  'sketch',
  'sketch-colour',
]);

/**
 * Preset-specific Shader Lab sliders (shown instead of global Scale when active).
 * Only presets listed here expose bespoke rows — Watercolour uses Scale; Sketch uses these two.
 */
export const CREATIVE_LOOK_PRESET_SLIDER_DEFS = {
  sketch: [
    {
      id: 'creativeLookSketchStrokeWidth',
      stateKey: 'strokeWidth',
      label: 'Stroke Width',
      tooltip:
        'Ink outline thickness, silhouette edge dilation, and mesh wobble. Independent of screentone raster.',
      min: 0.2,
      max: 2.8,
      step: 0.02,
      default: 1,
      format: 'multiplier',
    },
    {
      id: 'creativeLookSketchRasterSize',
      stateKey: 'rasterSize',
      label: 'Raster Size',
      tooltip:
        '0 = off. Manga screentone dot pitch and paper grain scale. Independent of stroke width.',
      min: 0,
      max: 2.8,
      step: 0.02,
      default: 1,
      format: 'multiplier',
    },
  ],
  'sketch-colour': [
    {
      id: 'creativeLookSketchStrokeWidth',
      stateKey: 'strokeWidth',
      label: 'Stroke Width',
      tooltip:
        'Ink outline thickness, silhouette edge dilation, and mesh wobble. Independent of screentone raster.',
      min: 0.2,
      max: 2.8,
      step: 0.02,
      default: 1,
      format: 'multiplier',
    },
    {
      id: 'creativeLookSketchRasterSize',
      stateKey: 'rasterSize',
      label: 'Raster Size',
      tooltip:
        '0 = off. Manga screentone dot pitch and paper grain scale. Independent of stroke width.',
      min: 0,
      max: 2.8,
      step: 0.02,
      default: 1,
      format: 'multiplier',
    },
  ],
};

/** @param {string | undefined} preset */
export function isArtisticCreativeLookPreset(preset) {
  const id = typeof preset === 'string' ? preset : '';
  return CREATIVE_LOOK_ARTISTIC_PRESETS.includes(id);
}

/** @param {string | undefined} preset */
export function creativeLookPresetHasBespokeSliders(preset) {
  return getCreativeLookPresetSliderDefs(preset).length > 0;
}

/** Global Scale slider hidden when a preset exposes bespoke controls that replace it. */
export function creativeLookPresetHidesPatternScale(preset) {
  return creativeLookPresetHasBespokeSliders(preset);
}

/** @param {string | undefined} preset @returns {CreativeLookPresetSliderDef[]} */
export function getCreativeLookPresetSliderDefs(preset) {
  const id = typeof preset === 'string' ? preset : '';
  if (!isArtisticCreativeLookPreset(id)) return [];
  return CREATIVE_LOOK_PRESET_SLIDER_DEFS[id] ?? [];
}

/** Every bespoke slider id — used to hide rows that are not active for the current preset. */
export const CREATIVE_LOOK_ALL_PRESET_SLIDER_IDS = Object.values(
  CREATIVE_LOOK_PRESET_SLIDER_DEFS,
).flatMap((defs) => defs.map((def) => def.id));

/**
 * @param {string | undefined} preset
 * @param {boolean} [shaderLabEnabled]
 */
export function creativeLookPresetSliderVisible(preset, shaderLabEnabled = true) {
  if (!shaderLabEnabled) return false;
  return getCreativeLookPresetSliderDefs(preset).length > 0;
}

/**
 * @param {string} preset
 * @param {object} [presetParams]
 * @param {number} [patternScaleFallback]
 */
export function normalizeCreativeLookPresetParams(
  preset,
  presetParams = {},
  patternScaleFallback = 1,
) {
  const next = { ...presetParams };
  if (preset === 'sketch' || preset === 'sketch-colour') {
    next.sketch = resolveCreativeLookSketchParams(next, patternScaleFallback);
  }
  if (preset === 'watercolour' || preset === 'sketch' || preset === 'sketch-colour') {
    const ink = resolveCreativeLookInkParams(next, preset);
    next.ink = {
      strokeColor: ink.strokeColor,
    };
  }
  return next;
}
