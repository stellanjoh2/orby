/** Shared ExtrudeGeometry bevel helpers (font + SVG extrude). */

import {
  clampExtrudeNormalAngleDeg,
  DEFAULT_EXTRUDE_DEPTH,
} from './extrudeImporterShared.js';

export const EXTRUDE_BEVEL_AMOUNT_MIN = 0;
/** Max bevel as a fraction of current extrusion depth. */
export const EXTRUDE_BEVEL_DEPTH_FRACTION = 0.1;
export const DEFAULT_EXTRUDE_BEVEL_AMOUNT = 0;

/**
 * @param {unknown} depth
 * @returns {number}
 */
export function maxExtrudeBevelAmount(depth) {
  const numeric = Number(depth);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_EXTRUDE_DEPTH * EXTRUDE_BEVEL_DEPTH_FRACTION;
  }
  return Math.max(0.001, numeric * EXTRUDE_BEVEL_DEPTH_FRACTION);
}

/**
 * @param {unknown} value
 * @param {unknown} [depth]
 * @returns {number}
 */
export function clampExtrudeBevelAmount(value, depth) {
  const numeric = Number(value);
  const max = maxExtrudeBevelAmount(depth);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(EXTRUDE_BEVEL_AMOUNT_MIN, Math.min(max, numeric));
}

/** Three.js TextGeometry default — rounded profile (webgl_geometry_text). */
export const FONT_EXTRUDE_BEVEL_SEGMENTS = 3;

/** @typedef {'smooth' | 'simple'} FontExtrudeBevelType */

/** Rounded TextGeometry-style bevel (default). */
export const DEFAULT_FONT_BEVEL_TYPE = 'smooth';

/** bevelSize / bevelThickness ratio in the Three.js text demo (1.5 / 2). */
const FONT_BEVEL_SIZE_RATIO = 0.75;

/**
 * @param {unknown} value
 * @returns {FontExtrudeBevelType}
 */
export function normalizeFontBevelType(value) {
  return value === 'simple' ? 'simple' : 'smooth';
}

/**
 * @param {FontExtrudeBevelType} type
 * @param {{ amount?: unknown, depth?: unknown, xyNormalizeScale?: number, bevelSegments?: number }} params
 */
export function resolveFontExtrudeBevelSettingsForType(type, params = {}) {
  // Simple = inset chamfer (flat caps + vertical sides); Smooth = TextGeometry rounded outset.
  return normalizeFontBevelType(type) === 'simple'
    ? resolveExtrudeBevelSettings(params)
    : resolveFontExtrudeBevelSettings(params);
}

/**
 * Simple bevel uses hard face groups (0° crease). Smooth respects the smoothing-angle slider.
 *
 * @param {FontExtrudeBevelType} bevelType
 * @param {unknown} normalAngleDeg
 * @returns {number}
 */
export function resolveFontExtrudeCreaseAngleDeg(bevelType, normalAngleDeg) {
  if (normalizeFontBevelType(bevelType) === 'simple') {
    return 0;
  }
  return clampExtrudeNormalAngleDeg(normalAngleDeg);
}

/**
 * TextGeometry-style bevel for font extrude (outset bevel, rounded layers).
 *
 * @param {{ amount?: unknown, depth?: unknown, xyNormalizeScale?: number, bevelSegments?: number }} params
 */
export function resolveFontExtrudeBevelSettings({
  amount,
  depth,
  xyNormalizeScale = 1,
  bevelSegments = FONT_EXTRUDE_BEVEL_SEGMENTS,
} = {}) {
  const studioBevel = clampExtrudeBevelAmount(amount, depth);
  if (studioBevel <= 1e-5) {
    return { bevelEnabled: false };
  }

  const scaleNumeric = Number(xyNormalizeScale);
  const safeXyScale =
    Number.isFinite(scaleNumeric) && scaleNumeric > 1e-8 ? scaleNumeric : 1;
  const fontBevelSize = (studioBevel / safeXyScale) * FONT_BEVEL_SIZE_RATIO;
  const segments = Math.max(1, Math.round(Number(bevelSegments) || FONT_EXTRUDE_BEVEL_SEGMENTS));

  return {
    bevelEnabled: true,
    bevelSize: fontBevelSize,
    bevelThickness: studioBevel,
    bevelOffset: 0,
    bevelSegments: segments,
  };
}

/**
 * Build ExtrudeGeometry bevel fields (SVG — single-segment inset chamfer).
 *
 * @param {{ amount?: unknown, depth?: unknown, xyNormalizeScale?: number, bevelSegments?: number }} params
 */
export function resolveExtrudeBevelSettings({
  amount,
  depth,
  xyNormalizeScale = 1,
  bevelSegments = 1,
} = {}) {
  const studioBevel = clampExtrudeBevelAmount(amount, depth);
  if (studioBevel <= 1e-5) {
    return { bevelEnabled: false };
  }

  const scaleNumeric = Number(xyNormalizeScale);
  const safeXyScale =
    Number.isFinite(scaleNumeric) && scaleNumeric > 1e-8 ? scaleNumeric : 1;
  const fontBevelInset = studioBevel / safeXyScale;
  const segments = Math.max(1, Math.round(Number(bevelSegments) || 1));

  return {
    bevelEnabled: true,
    bevelSize: fontBevelInset,
    bevelThickness: studioBevel,
    bevelOffset: -fontBevelInset,
    bevelSegments: segments,
  };
}
