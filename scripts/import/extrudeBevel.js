/** Shared ExtrudeGeometry bevel helpers (font + SVG extrude). */

import {
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

/** Convex profile steps — rounded bevel layers along the slope. */
export const FONT_EXTRUDE_BEVEL_SEGMENTS = 12;
/** Straight = same outset extrude as Convex, one segment → flat chamfer (not rounded). */
export const FONT_SIMPLE_EXTRUDE_BEVEL_SEGMENTS = 1;

/** @typedef {'convex' | 'straight'} FontExtrudeBevelType */

/** Rounded TextGeometry-style bevel — disabled in UI until shading is shippable. */
export const FONT_BEVEL_CONVEX_ENABLED = false;

/** Flat chamfer (default for text extrude). */
export const DEFAULT_FONT_BEVEL_TYPE = 'straight';

/** bevelSize / bevelThickness ratio in the Three.js text demo (1.5 / 2). */
const FONT_BEVEL_SIZE_RATIO = 0.75;

/**
 * @param {unknown} value
 * @returns {FontExtrudeBevelType}
 */
export function normalizeFontBevelType(value) {
  if (value === 'straight' || value === 'simple') return 'straight';
  if ((value === 'convex' || value === 'smooth') && FONT_BEVEL_CONVEX_ENABLED) return 'convex';
  return 'straight';
}

/**
 * @param {FontExtrudeBevelType} type
 * @param {{ amount?: unknown, depth?: unknown, xyNormalizeScale?: number, bevelSegments?: number }} params
 */
export function resolveFontExtrudeBevelSettingsForType(type, params = {}) {
  // Straight and Convex share the same TextGeometry-style outset extrude; Straight uses one
  // bevel segment (flat chamfer) instead of rounded layers.
  return resolveFontExtrudeBevelSettings({
    ...params,
    bevelSegments:
      normalizeFontBevelType(type) === 'straight'
        ? FONT_SIMPLE_EXTRUDE_BEVEL_SEGMENTS
        : FONT_EXTRUDE_BEVEL_SEGMENTS,
  });
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

/**
 * Path softening distance for uniform font bevel (shape-space bevelSize, plus any inset offset).
 *
 * @param {{ bevelEnabled?: boolean, bevelSize?: unknown, bevelOffset?: unknown }} [options]
 * @returns {number}
 */
export function resolveFontExtrudePathSofteningSize(options = {}) {
  if (!options?.bevelEnabled) return 0;
  const bevelSize = Number(options.bevelSize);
  const bevelOffset = Number(options.bevelOffset);
  if (!Number.isFinite(bevelSize) || bevelSize <= 0) return 0;
  return bevelSize + Math.max(0, Number.isFinite(bevelOffset) ? -bevelOffset : 0);
}
