import { normalizeCreativeLookSketchPatternScale } from './creativeLookSketchArt.js';

/**
 * Shader Lab Scale (0.1–5) → screen-space outline width multiplier.
 * 1.0 at default scale; lower = finer strokes, higher = bolder ink.
 * @param {number} patternScale
 * @param {{ preset?: string }} [options]
 */
export function creativeLookOutlineWidthScale(patternScale, options = {}) {
  const preset = options.preset;
  const ps = preset === 'sketch' || preset === 'sketch-colour'
    ? normalizeCreativeLookSketchPatternScale(patternScale)
    : Math.max(0.1, Math.min(5, Number(patternScale) || 1));
  return ps;
}
