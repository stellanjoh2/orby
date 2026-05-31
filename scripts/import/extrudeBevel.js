/** Shared ExtrudeGeometry bevel helpers (font + SVG extrude). */

import { DEFAULT_EXTRUDE_DEPTH } from './extrudeImporterShared.js';

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

/**
 * Build straight (single-segment) inset bevel fields for THREE.ExtrudeGeometry.
 *
 * @param {{ amount?: unknown, depth?: unknown, xyNormalizeScale?: number }} params
 */
export function resolveExtrudeBevelSettings({
  amount,
  depth,
  xyNormalizeScale = 1,
} = {}) {
  const studioBevel = clampExtrudeBevelAmount(amount, depth);
  if (studioBevel <= 1e-5) {
    return { bevelEnabled: false };
  }

  const scaleNumeric = Number(xyNormalizeScale);
  const safeXyScale =
    Number.isFinite(scaleNumeric) && scaleNumeric > 1e-8 ? scaleNumeric : 1;
  const fontBevelInset = studioBevel / safeXyScale;

  return {
    bevelEnabled: true,
    bevelSize: fontBevelInset,
    bevelThickness: studioBevel,
    bevelOffset: -fontBevelInset,
    bevelSegments: 1,
  };
}
