/** Cap height in studio units — constant per glyph; layout grows with more lines/words. */
export const FONT_EXTRUDE_TARGET_CAP_HEIGHT = 0.36;

/** @type {Record<'low' | 'medium' | 'high', { curveDivisions: number, sideSegments: number }>} */
export const FONT_EXTRUDE_DETAIL_PRESETS = {
  low: { curveDivisions: 4, sideSegments: 6 },
  medium: { curveDivisions: 9, sideSegments: 12 },
  high: { curveDivisions: 14, sideSegments: 18 },
};

/**
 * @param {'low' | 'medium' | 'high' | number | string} detail
 * @returns {'low' | 'medium' | 'high'}
 */
export function normalizeFontExtrudeDetail(detail) {
  if (detail === 'low' || detail === 'medium' || detail === 'high') return detail;
  const n = Number(detail);
  if (!Number.isFinite(n)) return 'medium';
  if (n < 34) return 'low';
  if (n < 67) return 'medium';
  return 'high';
}

/**
 * @param {'low' | 'medium' | 'high' | number | string} [detail]
 */
export function resolveFontExtrudeSampling(detail = 'medium') {
  const level = normalizeFontExtrudeDetail(detail);
  return { ...FONT_EXTRUDE_DETAIL_PRESETS[level] };
}
