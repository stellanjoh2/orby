/** @typedef {'metrics' | 'optical' | 'none'} FontKerningMode */

export const DEFAULT_FONT_KERNING_MODE = 'metrics';

const VALID_MODES = new Set(['metrics', 'optical', 'none']);

/** Target visual gap between glyph inks for optical kerning (fraction of em). */
const OPTICAL_TARGET_GAP_EM = 0.032;
/** Max tighten/loosen as fractions of the metric advance between the pair. */
const OPTICAL_MAX_TIGHTEN_STEP = 0.32;
const OPTICAL_MAX_LOOSEN_STEP = 0.45;
/** Minimum forward progress per glyph (fraction of em) — prevents stacked origins. */
const OPTICAL_MIN_ORIGIN_ADVANCE_EM = 0.025;
/** Bbox wider than this × advance is treated as unreliable (display / decorative faces). */
const OPTICAL_INK_WIDTH_STEP_RATIO = 2.75;

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

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
 * @param {number} [stepPx] — metric advance between the pair (px)
 */
export function getOpticalKerningPx(
  leftGlyph,
  rightGlyph,
  leftX,
  provisionalRightX,
  y,
  fontSize,
  stepPx = NaN,
) {
  const step = Number.isFinite(stepPx) && stepPx > 0 ? stepPx : provisionalRightX - leftX;
  if (!Number.isFinite(step) || step <= 0) return 0;

  const leftPath = leftGlyph?.getPath?.(leftX, y, fontSize);
  const rightPath = rightGlyph?.getPath?.(provisionalRightX, y, fontSize);
  const leftInk = pathInkBoundsX(leftPath);
  const rightInk = pathInkBoundsX(rightPath);
  if (!leftInk || !rightInk) return 0;

  const leftInkWidth = leftInk.maxX - leftInk.minX;
  const rightInkWidth = rightInk.maxX - rightInk.minX;
  if (leftInkWidth <= 0 || rightInkWidth <= 0) return 0;

  const gap = rightInk.minX - leftInk.maxX;
  const targetGap = fontSize * OPTICAL_TARGET_GAP_EM;
  let adjustment = targetGap - gap;

  const boundsLookUnreliable =
    leftInkWidth > step * OPTICAL_INK_WIDTH_STEP_RATIO ||
    rightInkWidth > step * OPTICAL_INK_WIDTH_STEP_RATIO ||
    leftInk.maxX < leftX - step * 0.25 ||
    rightInk.minX > provisionalRightX + step * 1.5;

  const maxTighten = Math.min(step * OPTICAL_MAX_TIGHTEN_STEP, fontSize * 0.2);
  const maxLoosen = Math.min(step * OPTICAL_MAX_LOOSEN_STEP, fontSize * 0.28);

  if (boundsLookUnreliable) {
    // Decorative faces often report bad path boxes — skip aggressive optical shifts.
    if (Math.abs(adjustment) > maxTighten * 0.4) return 0;
    adjustment = clamp(adjustment, -maxTighten * 0.35, maxLoosen * 0.35);
  } else {
    adjustment = clamp(adjustment, -maxTighten, maxLoosen);
  }

  const minOriginX = leftX + Math.max(fontSize * OPTICAL_MIN_ORIGIN_ADVANCE_EM, step * 0.04);
  const maxPullLeft = provisionalRightX - minOriginX;
  if (maxPullLeft > 0) {
    adjustment = Math.max(adjustment, -maxPullLeft);
  }

  return adjustment;
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
    const step = provisionalRightX - leftX;
    if (!Number.isFinite(step) || step <= 0) return 0;
    const adjustment = getOpticalKerningPx(
      leftGlyph,
      rightGlyph,
      leftX,
      provisionalRightX,
      y,
      fontSize,
      step,
    );
    const minX = leftX + Math.max(fontSize * OPTICAL_MIN_ORIGIN_ADVANCE_EM, step * 0.04);
    const finalX = Math.max(provisionalRightX + adjustment, minX);
    return finalX - provisionalRightX;
  }
  return getMetricsKerningPx(font, leftGlyph, rightGlyph, fontSize);
}
