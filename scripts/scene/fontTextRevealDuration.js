import { computeGlyphRevealEase } from './fontTextRevealTypes.js';

export const DEFAULT_FONT_REVEAL_DURATION_SEC = 2;
export const MIN_FONT_REVEAL_DURATION_SEC = 0;
export const MAX_FONT_REVEAL_DURATION_SEC = 5;

/**
 * @param {unknown} value
 * @returns {number}
 */
export function clampFontRevealDurationSec(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_FONT_REVEAL_DURATION_SEC;
  return Math.max(
    MIN_FONT_REVEAL_DURATION_SEC,
    Math.min(MAX_FONT_REVEAL_DURATION_SEC, numeric),
  );
}

/** @deprecated use computeGlyphRevealEase from fontTextRevealTypes.js */
export function computeFontGlyphRevealScale(
  glyphIndex,
  glyphCount,
  elapsedSec,
  totalDurationSec,
) {
  return computeGlyphRevealEase('scale', glyphIndex, glyphCount, elapsedSec, totalDurationSec);
}
