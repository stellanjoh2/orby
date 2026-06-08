import * as THREE from 'three';
import { ORBY_LIME } from '../constants.js';
import { normalizeGlyphFillHex } from '../import/FontExtrudeImporter.js';
import {
  clampFontRevealSlideDepth,
  clampFontRevealSlideTime,
  easeSlideSoftOut,
} from './fontTextRevealTypes.js';

/**
 * @param {number} totalDurationSec
 * @param {number} glyphCount
 * @param {{ slideDepth?: number, slideTime?: number }} timing
 */
function glyphRevealSlotSec(totalDurationSec, glyphCount, timing) {
  if (totalDurationSec <= 0 || glyphCount <= 0) return totalDurationSec;
  const slideDepth = clampFontRevealSlideDepth(timing.slideDepth);
  if (slideDepth <= 0) return totalDurationSec / glyphCount;
  const slideTime = clampFontRevealSlideTime(timing.slideTime);
  return totalDurationSec / ((glyphCount - 1) + slideTime);
}

/**
 * @param {number} glyphIndex
 * @param {number} glyphCount
 * @param {number} totalDurationSec
 * @param {{ slideDepth?: number, slideTime?: number }} timing
 */
function glyphRevealLandSec(glyphIndex, glyphCount, totalDurationSec, timing) {
  const slot = glyphRevealSlotSec(totalDurationSec, glyphCount, timing);
  const slideDepth = clampFontRevealSlideDepth(timing.slideDepth);
  if (slideDepth <= 0) return (glyphIndex + 1) * slot;
  const slideTime = clampFontRevealSlideTime(timing.slideTime);
  return glyphIndex * slot + slot * slideTime;
}

export const DEFAULT_FONT_REVEAL_EMISSIVE_SLAM = false;
export const DEFAULT_FONT_REVEAL_EMISSIVE_STRENGTH = 1;
export const DEFAULT_FONT_REVEAL_EMISSIVE_DECAY_SEC = 0.35;
export const DEFAULT_FONT_REVEAL_EMISSIVE_COLOR = ORBY_LIME;

export const MIN_FONT_REVEAL_EMISSIVE_STRENGTH = 0;
export const MAX_FONT_REVEAL_EMISSIVE_STRENGTH = 2;
export const MIN_FONT_REVEAL_EMISSIVE_DECAY_SEC = 0.05;
export const MAX_FONT_REVEAL_EMISSIVE_DECAY_SEC = 0.8;

const _slamColor = new THREE.Color();

/** @param {unknown} value */
export function normalizeFontRevealEmissiveSlamEnabled(value) {
  return value === true;
}

/** @param {unknown} value */
export function clampFontRevealEmissiveStrength(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_FONT_REVEAL_EMISSIVE_STRENGTH;
  return Math.max(
    MIN_FONT_REVEAL_EMISSIVE_STRENGTH,
    Math.min(MAX_FONT_REVEAL_EMISSIVE_STRENGTH, numeric),
  );
}

/** @param {unknown} value */
export function clampFontRevealEmissiveDecaySec(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_FONT_REVEAL_EMISSIVE_DECAY_SEC;
  return Math.max(
    MIN_FONT_REVEAL_EMISSIVE_DECAY_SEC,
    Math.min(MAX_FONT_REVEAL_EMISSIVE_DECAY_SEC, numeric),
  );
}

/** @param {unknown} value */
export function normalizeFontRevealEmissiveColor(value) {
  return normalizeGlyphFillHex(value ?? DEFAULT_FONT_REVEAL_EMISSIVE_COLOR);
}

/**
 * 0–1 emissive envelope: full while the glyph is revealing, then ease-out decay after land.
 * @param {number} glyphIndex
 * @param {number} glyphCount
 * @param {number} elapsedSec
 * @param {number} totalDurationSec
 * @param {number} decaySec
 * @param {{ slideDepth?: number, slideTime?: number }} [timing]
 */
export function computeGlyphEmissiveSlamFactor(
  glyphIndex,
  glyphCount,
  elapsedSec,
  totalDurationSec,
  decaySec,
  timing = {},
) {
  if (decaySec <= 0 || glyphCount <= 0 || totalDurationSec <= 0) return 0;
  const slot = glyphRevealSlotSec(totalDurationSec, glyphCount, timing);
  const slotStart = glyphIndex * slot;
  const landElapsed = glyphRevealLandSec(glyphIndex, glyphCount, totalDurationSec, timing);

  if (elapsedSec < slotStart) return 0;

  if (elapsedSec < landElapsed) return 1;

  const sinceLand = elapsedSec - landElapsed;
  if (sinceLand >= decaySec) return 0;
  const decayLinear = sinceLand / decaySec;
  return easeSlideSoftOut(1 - decayLinear);
}

/**
 * @param {import('three').Material} mat
 * @returns {{ restEmissive: THREE.Color, restEmissiveIntensity: number }}
 */
export function captureMaterialEmissiveRest(mat) {
  const restEmissive = new THREE.Color(0, 0, 0);
  let restEmissiveIntensity = 1;
  if (mat && 'emissive' in mat && mat.emissive?.isColor) {
    restEmissive.copy(mat.emissive);
  }
  const ei = Number(mat?.emissiveIntensity);
  if (Number.isFinite(ei)) restEmissiveIntensity = ei;
  return { restEmissive, restEmissiveIntensity };
}

/**
 * @param {{
 *   meshMaterials: Array<{
 *     mat: import('three').Material,
 *     opacity: number,
 *     transparent: boolean,
 *     restEmissive: THREE.Color,
 *     restEmissiveIntensity: number,
 *   }>,
 * }} state
 * @param {{
 *   enabled?: boolean,
 *   strength?: number,
 *   decaySec?: number,
 *   colorHex?: string,
 *   glyphIndex?: number,
 *   glyphCount?: number,
 *   elapsedSec?: number,
 *   totalDurationSec?: number,
 *   slideDepth?: number,
 *   slideTime?: number,
 * }} options
 */
/**
 * Reveal emissive slam overlays {@link captureMaterialEmissiveRest} baseline (Mesh → Emissive slider).
 * It never permanently replaces that baseline — restore always returns to restEmissive / restEmissiveIntensity.
 */
export function applyRevealEmissiveSlam(state, options = {}) {
  const {
    enabled = false,
    strength = 0,
    decaySec = DEFAULT_FONT_REVEAL_EMISSIVE_DECAY_SEC,
    colorHex = DEFAULT_FONT_REVEAL_EMISSIVE_COLOR,
    glyphIndex = 0,
    glyphCount = 1,
    elapsedSec = 0,
    totalDurationSec = 0,
    slideDepth,
    slideTime,
  } = options;

  const { meshMaterials } = state;
  if (!meshMaterials.length) return;

  if (!enabled || strength <= 0) {
    restoreRevealGlyphEmissive(state);
    return;
  }

  const factor = computeGlyphEmissiveSlamFactor(
    glyphIndex,
    glyphCount,
    elapsedSec,
    totalDurationSec,
    decaySec,
    { slideDepth, slideTime },
  );

  if (factor <= 0) {
    restoreRevealGlyphEmissive(state);
    return;
  }

  _slamColor.set(normalizeFontRevealEmissiveColor(colorHex));

  for (const { mat, restEmissive, restEmissiveIntensity } of meshMaterials) {
    if (!mat || !('emissive' in mat) || !mat.emissive?.isColor) continue;
    mat.emissive.copy(restEmissive).lerp(_slamColor, factor);
    mat.emissiveIntensity = restEmissiveIntensity + strength * factor;
    mat.needsUpdate = true;
  }
}

/**
 * @param {{
 *   meshMaterials: Array<{
 *     mat: import('three').Material,
 *     restEmissive: THREE.Color,
 *     restEmissiveIntensity: number,
 *   }>,
 * }} state
 */
export function restoreRevealGlyphEmissive(state) {
  for (const { mat, restEmissive, restEmissiveIntensity } of state.meshMaterials) {
    if (!mat || !('emissive' in mat) || !mat.emissive?.isColor) continue;
    mat.emissive.copy(restEmissive);
    mat.emissiveIntensity = restEmissiveIntensity;
    mat.needsUpdate = true;
  }
}

/**
 * True when no glyph still carries reveal slam emissive (including post-land decay).
 * @param {number} glyphCount
 * @param {number} elapsedSec
 * @param {number} totalDurationSec
 * @param {number} decaySec
 * @param {{ slideDepth?: number, slideTime?: number }} [timing]
 */
export function areAllGlyphEmissiveSlamSettled(
  glyphCount,
  elapsedSec,
  totalDurationSec,
  decaySec,
  timing = {},
) {
  if (decaySec <= 0 || glyphCount <= 0 || totalDurationSec <= 0) return true;
  for (let i = 0; i < glyphCount; i += 1) {
    const factor = computeGlyphEmissiveSlamFactor(
      i,
      glyphCount,
      elapsedSec,
      totalDurationSec,
      decaySec,
      timing,
    );
    if (factor > 1e-6) return false;
  }
  return true;
}
