/** Shared extrusion tessellation presets (font + SVG). */

/** Cap height in studio units — constant per glyph; layout grows with more lines/words. */
export const FONT_EXTRUDE_TARGET_CAP_HEIGHT = 0.36;

/**
 * Font extrude curve sampling — mirrors Three.js TextGeometry `curveSegments` tiers.
 * Native Bézier shapes let ExtrudeGeometry sample curves; no custom cap math needed.
 *
 * @type {Record<'low' | 'medium' | 'high' | 'ultra', { curveSegments: number, curveDivisions: number }>}
 */
export const FONT_EXTRUDE_DETAIL_PRESETS = {
  low: { curveSegments: 4, curveDivisions: 4 },
  medium: { curveSegments: 8, curveDivisions: 8 },
  high: { curveSegments: 12, curveDivisions: 12 },
  ultra: { curveSegments: 18, curveDivisions: 18 },
};

/** SVG extrude tessellation — curveSegments for ExtrudeGeometry; ringSegments caps cap densify. */
/** @type {Record<'low' | 'medium' | 'high' | 'ultra', { ringSegments: number, curveSegments: number, extractDivisions: number, curveDivisions: number }>} */
export const EXTRUDE_DETAIL_PRESETS = {
  low: { ringSegments: 64, curveSegments: 8, extractDivisions: 24, curveDivisions: 6 },
  medium: { ringSegments: 128, curveSegments: 12, extractDivisions: 32, curveDivisions: 9 },
  high: { ringSegments: 256, curveSegments: 18, extractDivisions: 48, curveDivisions: 14 },
  ultra: { ringSegments: 512, curveSegments: 24, extractDivisions: 64, curveDivisions: 18 },
};

/** Font path sampling caps when bevel is on. */
const EXTRUDE_BEVEL_CURVE_DIVISION_CAPS = {
  low: 4,
  medium: 7,
  high: 10,
  ultra: 12,
};

/** Native-curve sanitize fallback when bevel + densify produces NaN positions. */
const EXTRUDE_BEVEL_SIDE_SEGMENT_CAPS = {
  low: 8,
  medium: 12,
  high: 18,
  ultra: 24,
};

/**
 * @param {'low' | 'medium' | 'high' | 'ultra' | number | string} detail
 * @returns {'low' | 'medium' | 'high' | 'ultra'}
 */
export function normalizeExtrudeDetail(detail) {
  if (detail === 'low' || detail === 'medium' || detail === 'high' || detail === 'ultra') {
    return detail;
  }
  const n = Number(detail);
  if (!Number.isFinite(n)) return 'high';
  if (n < 25) return 'low';
  if (n < 50) return 'medium';
  if (n < 75) return 'high';
  return 'ultra';
}

/** @deprecated Use normalizeExtrudeDetail */
export const normalizeFontExtrudeDetail = normalizeExtrudeDetail;

/**
 * Cap curve tessellation along the outline when bevel is on (avoids self-overlap on tight radii).
 *
 * @param {'low' | 'medium' | 'high' | 'ultra' | number | string} detail
 * @param {number} [curveSegments]
 * @returns {number}
 */
export function resolveBevelSideCurveSegments(detail, curveSegments) {
  const level = normalizeExtrudeDetail(detail);
  const preset = EXTRUDE_DETAIL_PRESETS[level];
  const requested = Math.max(
    1,
    Math.round(Number(curveSegments) || preset.curveSegments),
  );
  return Math.min(requested, EXTRUDE_BEVEL_SIDE_SEGMENT_CAPS[level]);
}

/**
 * Font extrude detail — stock ExtrudeGeometry path; curveSegments scales like TextGeometry.
 *
 * @param {'low' | 'medium' | 'high' | 'ultra' | number | string} [detail]
 */
export function resolveFontExtrudeDetailSettings(detail = 'high') {
  const level = normalizeExtrudeDetail(detail);
  return { level, ...FONT_EXTRUDE_DETAIL_PRESETS[level] };
}

/**
 * @param {'low' | 'medium' | 'high' | 'ultra' | number | string} [detail]
 * @param {{ bevelEnabled?: boolean }} [options]
 */
export function resolveExtrudeDetailSettings(detail = 'high', options = {}) {
  const level = normalizeExtrudeDetail(detail);
  const preset = EXTRUDE_DETAIL_PRESETS[level];
  const bevelEnabled = !!options.bevelEnabled;

  if (!bevelEnabled) {
    return { level, ...preset };
  }

  // Bevel uses the same densified outline as flat extrude — keep full cap sampling.
  return {
    level,
    ...preset,
    curveSegments: Math.min(preset.curveSegments, EXTRUDE_BEVEL_SIDE_SEGMENT_CAPS[level]),
    curveDivisions: Math.min(preset.curveDivisions, EXTRUDE_BEVEL_CURVE_DIVISION_CAPS[level]),
  };
}

/**
 * @param {'low' | 'medium' | 'high' | 'ultra' | number | string} [detail]
 * @deprecated Use resolveExtrudeDetailSettings
 */
export function resolveFontExtrudeSampling(detail = 'medium') {
  const settings = resolveFontExtrudeDetailSettings(detail);
  return {
    curveDivisions: settings.curveDivisions,
    sideSegments: settings.curveSegments,
  };
}
