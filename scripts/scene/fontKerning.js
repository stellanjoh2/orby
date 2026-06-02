/** @typedef {'metrics' | 'optical' | 'none'} FontKerningMode */

export const DEFAULT_FONT_KERNING_MODE = 'metrics';

const VALID_MODES = new Set(['metrics', 'optical', 'none']);

/** Target visual gap between glyph inks for optical kerning (fraction of em). */
const OPTICAL_TARGET_GAP_EM = 0.032;

/** @param {unknown} value @returns {FontKerningMode} */
export function normalizeFontKerningMode(value) {
  const id = typeof value === 'string' ? value : '';
  if (id === 'auto') return 'metrics';
  return VALID_MODES.has(id) ? /** @type {FontKerningMode} */ (id) : DEFAULT_FONT_KERNING_MODE;
}

/**
 * @param {import('../vendor/opentype.module.js').Path | null | undefined} glyphPath
 * @returns {{ minX: number, maxX: number } | null}
 */
export function pathInkBoundsX(glyphPath) {
  const bb = glyphPath?.getBoundingBox?.();
  if (!bb || bb.isEmpty?.()) return null;
  const minX = Math.min(bb.x1, bb.x2);
  const maxX = Math.max(bb.x1, bb.x2);
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
  return { minX, maxX };
}

/**
 * Font kern / GPOS pair adjustment in px (Photoshop "Metrics" / Auto).
 * @param {import('../vendor/opentype.module.js').Font} font
 * @param {import('../vendor/opentype.module.js').Glyph} leftGlyph
 * @param {import('../vendor/opentype.module.js').Glyph} rightGlyph
 * @param {number} fontSize
 */
export function getMetricsKerningPx(font, leftGlyph, rightGlyph, fontSize) {
  if (!font || !leftGlyph || !rightGlyph) return 0;
  const kernUnits = font.getKerningValue?.(leftGlyph, rightGlyph) ?? 0;
  if (!Number.isFinite(kernUnits) || kernUnits === 0) return 0;
  return (kernUnits / font.unitsPerEm) * fontSize;
}

/**
 * Heuristic optical pair adjustment in px (approximates Photoshop Optical).
 * @param {import('../vendor/opentype.module.js').Glyph} leftGlyph
 * @param {import('../vendor/opentype.module.js').Glyph} rightGlyph
 * @param {number} leftX
 * @param {number} provisionalRightX
 * @param {number} y
 * @param {number} fontSize
 */
export function getOpticalKerningPx(leftGlyph, rightGlyph, leftX, provisionalRightX, y, fontSize) {
  const leftPath = leftGlyph?.getPath?.(leftX, y, fontSize);
  const rightPath = rightGlyph?.getPath?.(provisionalRightX, y, fontSize);
  const leftInk = pathInkBoundsX(leftPath);
  const rightInk = pathInkBoundsX(rightPath);
  if (!leftInk || !rightInk) return 0;

  const gap = rightInk.minX - leftInk.maxX;
  const targetGap = fontSize * OPTICAL_TARGET_GAP_EM;
  return targetGap - gap;
}

/**
 * Extra spacing to add after the previous glyph when placing the next one.
 * @param {FontKerningMode} mode
 * @param {import('../vendor/opentype.module.js').Font} font
 * @param {import('../vendor/opentype.module.js').Glyph | null} leftGlyph
 * @param {import('../vendor/opentype.module.js').Glyph} rightGlyph
 * @param {number} leftX
 * @param {number} provisionalRightX
 * @param {number} y
 * @param {number} fontSize
 */
export function getPairKerningPx(
  mode,
  font,
  leftGlyph,
  rightGlyph,
  leftX,
  provisionalRightX,
  y,
  fontSize,
) {
  const kerning = normalizeFontKerningMode(mode);
  if (kerning === 'none' || !leftGlyph) return 0;
  if (kerning === 'optical') {
    return getOpticalKerningPx(leftGlyph, rightGlyph, leftX, provisionalRightX, y, fontSize);
  }
  return getMetricsKerningPx(font, leftGlyph, rightGlyph, fontSize);
}
