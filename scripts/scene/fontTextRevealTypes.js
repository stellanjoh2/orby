/**
 * GSAP-inspired per-glyph reveal presets for extruded font meshes.
 * Easing names mirror common GSAP defaults (power1/2/3, back, elastic).
 */

import * as THREE from 'three';
import { restoreRevealGlyphEmissive } from './fontTextRevealEmissive.js';

/**
 * @typedef {{
 *   group: import('three').Object3D,
 *   restPosition: import('three').Vector3,
 *   restRotationX: number,
 *   restRotationY: number,
 *   restRotationZ: number,
 *   restScale: import('three').Vector3,
 *   slideDistance: number,
 *   meshMaterials: Array<{
 *     mat: import('three').Material,
 *     opacity: number,
 *     transparent: boolean,
 *     restEmissive: import('three').Color,
 *     restEmissiveIntensity: number,
 *   }>,
 * }} RevealGlyphState
 */

/** @typedef {'none' | 'scale' | 'fade' | 'slideUp' | 'slideDown' | 'drop' | 'pop' | 'rotate' | 'elastic'} FontRevealTypeId */
/** @typedef {'back' | 'front'} FontRevealSlideDirection */
/** @typedef {'character' | 'word'} FontRevealUnitId */

export const DEFAULT_FONT_REVEAL_TYPE = 'scale';
export const DEFAULT_FONT_REVEAL_UNIT = 'character';

/** @type {ReadonlyArray<{ id: FontRevealUnitId, label: string, tooltip: string }>} */
export const FONT_REVEAL_UNIT_OPTIONS = [
  {
    id: 'character',
    label: 'Character',
    tooltip: 'Stagger each letter — best for short headlines',
  },
  {
    id: 'word',
    label: 'Word',
    tooltip: 'Stagger whole words — faster for long paragraphs',
  },
];
export const DEFAULT_FONT_REVEAL_SLIDE_DEPTH = 0.18;
/** Per-glyph animation length as a multiple of stagger slot (>1 overlaps the next letter). */
export const DEFAULT_FONT_REVEAL_SLIDE_TIME = 1.3;
export const DEFAULT_FONT_REVEAL_SLIDE_DIRECTION = 'back';
export const MIN_FONT_REVEAL_SLIDE_DEPTH = 0;
export const MAX_FONT_REVEAL_SLIDE_DEPTH = 2.5;
export const MIN_FONT_REVEAL_SLIDE_TIME = 0.1;
/** Values above 1 let depth travel extend past the glyph slot so soft landings overlap later letters. */
export const MAX_FONT_REVEAL_SLIDE_TIME = 3;

/** @type {ReadonlyArray<{ id: FontRevealTypeId, label: string, ease: string, tooltip: string }>} */
export const FONT_REVEAL_TYPE_OPTIONS = [
  {
    id: 'none',
    label: 'None',
    ease: 'none',
    tooltip: 'No per-letter reveal — static text in viewport and export preview',
  },
  {
    id: 'scale',
    label: 'Scale',
    ease: 'power2.out',
    tooltip: 'Scale from 0 — like gsap.from({ scale: 0 }) with power2.out',
  },
  {
    id: 'fade',
    label: 'Fade',
    ease: 'power1.out',
    tooltip: 'Opacity 0 → 1 — like gsap.from({ opacity: 0 })',
  },
  {
    id: 'slideUp',
    label: 'Slide Up',
    ease: 'quart.out',
    tooltip: 'Rise into place from below — ease out quart',
  },
  {
    id: 'slideDown',
    label: 'Slide Down',
    ease: 'quart.out',
    tooltip: 'Drop into place from above — ease out quart',
  },
  {
    id: 'drop',
    label: 'Drop',
    ease: 'bounce.out',
    tooltip: 'Fall from above and bounce into place — pairs well with Emissive Slam',
  },
  {
    id: 'pop',
    label: 'Pop',
    ease: 'back.out(1.7)',
    tooltip: 'Overshooting scale — like gsap.from({ scale: 0, ease: "back.out(1.7)" })',
  },
  {
    id: 'rotate',
    label: 'Rotate',
    ease: 'quart.out',
    tooltip: 'Turn in on Y until the letter lands — syncs with depth slide when enabled',
  },
  {
    id: 'elastic',
    label: 'Elastic',
    ease: 'elastic.out(1, 0.3)',
    tooltip: 'Bouncy scale — like gsap.from({ scale: 0, ease: "elastic.out" })',
  },
];

const VALID_IDS = new Set(FONT_REVEAL_TYPE_OPTIONS.map((o) => o.id));
const VALID_SLIDE_DIRECTIONS = new Set(['back', 'front']);
const VALID_REVEAL_UNITS = new Set(FONT_REVEAL_UNIT_OPTIONS.map((o) => o.id));

/** @param {unknown} value @returns {FontRevealTypeId} */
export function normalizeFontRevealType(value) {
  const id = typeof value === 'string' ? value : '';
  return VALID_IDS.has(id) ? /** @type {FontRevealTypeId} */ (id) : DEFAULT_FONT_REVEAL_TYPE;
}

/** @param {FontRevealTypeId | unknown} type */
export function isFontRevealAnimationActive(type) {
  return normalizeFontRevealType(type) !== 'none';
}

/** @param {unknown} value @returns {FontRevealUnitId} */
export function normalizeFontRevealUnit(value) {
  const unit = typeof value === 'string' ? value : '';
  return VALID_REVEAL_UNITS.has(unit)
    ? /** @type {FontRevealUnitId} */ (unit)
    : DEFAULT_FONT_REVEAL_UNIT;
}

/** @param {unknown} value @returns {FontRevealSlideDirection} */
export function normalizeFontRevealSlideDirection(value) {
  const direction = typeof value === 'string' ? value : '';
  return VALID_SLIDE_DIRECTIONS.has(direction)
    ? /** @type {FontRevealSlideDirection} */ (direction)
    : DEFAULT_FONT_REVEAL_SLIDE_DIRECTION;
}

/** @param {number} t @returns {number} */
export function easePower1Out(t) {
  return 1 - (1 - t);
}

/** @param {number} t @returns {number} */
export function easePower2Out(t) {
  return 1 - (1 - t) ** 2;
}

/** @param {number} t @returns {number} */
export function easePower3Out(t) {
  return 1 - (1 - t) ** 3;
}

/** @param {number} t @returns {number} GSAP / AE-style power4.out (ease out quart) */
export function easePower4Out(t) {
  const u = Math.max(0, Math.min(1, t));
  return 1 - (1 - u) ** 4;
}

/**
 * Depth slide / Slide Up outro — single-segment ease out quart (AE / GSAP power4.out).
 * @param {number} t linear 0–1 through the slide window
 * @returns {number}
 */
export function easeSlideSoftOut(t) {
  return easePower4Out(t);
}

/**
 * @param {number} t
 * @param {number} [overshoot=1.70158]
 * @returns {number}
 */
export function easeBackOut(t, overshoot = 1.70158) {
  const c1 = overshoot + 1;
  return 1 + c1 * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}

/**
 * Simplified elastic.out — GSAP-style decaying overshoot on scale.
 * @param {number} t
 * @returns {number}
 */
export function easeElasticOut(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

/** GSAP / CSS-style bounce.out — gravity settle with diminishing bounces. */
export function easeBounceOut(t) {
  const u = Math.max(0, Math.min(1, t));
  const n1 = 7.5625;
  const d1 = 2.75;
  if (u < 1 / d1) {
    return n1 * u * u;
  }
  if (u < 2 / d1) {
    const v = u - 1.5 / d1;
    return n1 * v * v + 0.75;
  }
  if (u < 2.5 / d1) {
    const v = u - 2.25 / d1;
    return n1 * v * v + 0.9375;
  }
  const v = u - 2.625 / d1;
  return n1 * v * v + 0.984375;
}

/**
 * Brief Y squash while a drop bounce settles — keyed to linear slot progress.
 * @param {number} landLinear
 * @returns {number} scale.y multiplier
 */
function computeDropImpactSquashY(landLinear) {
  const t = Math.max(0, Math.min(1, landLinear));
  if (t <= 0 || t >= 1) return 1;
  const first = Math.exp(-((t - 0.52) ** 2) / 0.0035) * 0.14;
  const second = Math.exp(-((t - 0.78) ** 2) / 0.0025) * 0.07;
  return Math.max(0.82, 1 - first - second);
}

/** @param {FontRevealTypeId} type @param {number} t @returns {number} */
export function easeForRevealType(type, t) {
  if (type === 'none') return 1;
  const clamped = Math.max(0, Math.min(1, t));
  switch (type) {
    case 'fade':
      return easePower1Out(clamped);
    case 'pop':
      return easeBackOut(clamped, 1.7);
    case 'elastic':
      return easeElasticOut(clamped);
    case 'drop':
      return easeBounceOut(clamped);
    case 'slideUp':
    case 'slideDown':
      return easeSlideSoftOut(clamped);
    case 'rotate':
      return easeSlideSoftOut(clamped);
    case 'scale':
    default:
      return easePower2Out(clamped);
  }
}

/**
 * @typedef {{ slideDepth?: number, slideTime?: number }} FontRevealTimingOptions
 */

/**
 * Per-glyph animation length vs stagger slot. Also drives Z depth travel when slide depth > 0.
 * Values above 1 let each letter keep settling while the next one starts.
 * @param {FontRevealTimingOptions} [timing]
 * @returns {number}
 */
export function resolveGlyphRevealTime(timing = {}) {
  return clampFontRevealSlideTime(timing.slideTime);
}

/**
 * Wall-clock seconds between each letter's reveal start. Last glyph still finishes at
 * totalDurationSec because its window is glyphTime × slot.
 * @param {number} totalDurationSec
 * @param {number} glyphCount
 * @param {FontRevealTimingOptions} [timing]
 * @returns {number}
 */
export function computeGlyphRevealSlotSec(totalDurationSec, glyphCount, timing = {}) {
  if (totalDurationSec <= 0 || glyphCount <= 0) return totalDurationSec;
  const glyphTime = resolveGlyphRevealTime(timing);
  return totalDurationSec / ((glyphCount - 1) + glyphTime);
}

/**
 * Wall-clock time when one glyph's reveal (and depth slide, if any) completes.
 * @param {number} glyphIndex
 * @param {number} glyphCount
 * @param {number} totalDurationSec
 * @param {FontRevealTimingOptions} [timing]
 * @returns {number}
 */
export function computeGlyphRevealLandSec(
  glyphIndex,
  glyphCount,
  totalDurationSec,
  timing = {},
) {
  const slot = computeGlyphRevealSlotSec(totalDurationSec, glyphCount, timing);
  const glyphTime = resolveGlyphRevealTime(timing);
  return glyphIndex * slot + slot * glyphTime;
}

/**
 * Seconds for one glyph's reveal animation (all presets) and Z travel when slide depth > 0.
 * @param {number} slot
 * @param {FontRevealTimingOptions} [timing]
 * @returns {number}
 */
export function computeGlyphRevealWindowSec(slot, timing = {}) {
  return slot * resolveGlyphRevealTime(timing);
}

/**
 * Raw 0–1 progress for one glyph's reveal window (before easing).
 * @param {number} glyphIndex
 * @param {number} glyphCount
 * @param {number} elapsedSec
 * @param {number} totalDurationSec
 * @param {FontRevealTimingOptions} [timing]
 * @returns {number}
 */
export function computeGlyphSlotProgress(
  glyphIndex,
  glyphCount,
  elapsedSec,
  totalDurationSec,
  timing = {},
) {
  if (totalDurationSec <= 0 || glyphCount <= 0) return 1;
  const slot = computeGlyphRevealSlotSec(totalDurationSec, glyphCount, timing);
  const elapsedInGlyph = elapsedSec - glyphIndex * slot;
  if (elapsedInGlyph <= 0) return 0;
  const revealWindowSec = computeGlyphRevealWindowSec(slot, timing);
  const t = elapsedInGlyph / Math.max(0.001, revealWindowSec);
  if (t >= 1) return 1;
  return t;
}

/**
 * @param {FontRevealTypeId} type
 * @param {number} glyphIndex
 * @param {number} glyphCount
 * @param {number} elapsedSec
 * @param {number} totalDurationSec
 * @param {FontRevealTimingOptions} [timing]
 * @returns {number} eased 0–1 (may overshoot for pop/elastic)
 */
export function computeGlyphRevealEase(
  type,
  glyphIndex,
  glyphCount,
  elapsedSec,
  totalDurationSec,
  timing = {},
) {
  const raw = computeGlyphSlotProgress(
    glyphIndex,
    glyphCount,
    elapsedSec,
    totalDurationSec,
    timing,
  );
  return easeForRevealType(type, raw);
}

/**
 * Linear 0–1 depth-travel progress from wall-clock time since this glyph's slot started.
 * Slide times above 100% overlap later letters; slot sizing keeps the last glyph landing
 * at totalDurationSec.
 * @param {number} glyphIndex
 * @param {number} glyphCount
 * @param {number} elapsedSec
 * @param {number} totalDurationSec
 * @param {FontRevealTimingOptions} [timing]
 * @returns {number}
 */
export function computeGlyphSlideProgress(
  glyphIndex,
  glyphCount,
  elapsedSec,
  totalDurationSec,
  timing = {},
) {
  if (totalDurationSec <= 0 || glyphCount <= 0) return 1;
  const slot = computeGlyphRevealSlotSec(totalDurationSec, glyphCount, timing);
  const elapsedInGlyph = elapsedSec - glyphIndex * slot;
  if (elapsedInGlyph <= 0) return 0;
  const slideDurationSec = computeGlyphRevealWindowSec(slot, timing);
  return Math.min(1, elapsedInGlyph / Math.max(0.001, slideDurationSec));
}

/** @param {unknown} value */
export function clampFontRevealSlideDepth(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_FONT_REVEAL_SLIDE_DEPTH;
  return Math.max(MIN_FONT_REVEAL_SLIDE_DEPTH, Math.min(MAX_FONT_REVEAL_SLIDE_DEPTH, numeric));
}

/** @param {unknown} value */
export function clampFontRevealSlideTime(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_FONT_REVEAL_SLIDE_TIME;
  return Math.max(MIN_FONT_REVEAL_SLIDE_TIME, Math.min(MAX_FONT_REVEAL_SLIDE_TIME, numeric));
}

const _ROTATE_Y_START = -Math.PI / 2;

/**
 * @typedef {{ center: import('three').Vector3, slideDistance: number }} FontRevealWordPivot
 */

/**
 * @param {import('three').Vector3} out
 * @param {import('three').Vector3} point
 * @param {import('three').Vector3} pivot
 * @param {number} scale
 */
function copyWordScaledPosition(out, point, pivot, scale) {
  out.copy(point).sub(pivot).multiplyScalar(scale).add(pivot);
}

/**
 * @param {import('three').Vector3} out
 * @param {import('three').Vector3} point
 * @param {import('three').Vector3} pivot
 * @param {number} angleY
 */
function copyWordRotatedPosition(out, point, pivot, angleY) {
  const dx = point.x - pivot.x;
  const dz = point.z - pivot.z;
  const cos = Math.cos(angleY);
  const sin = Math.sin(angleY);
  out.set(
    pivot.x + dx * cos + dz * sin,
    point.y,
    pivot.z - dx * sin + dz * cos,
  );
}

/**
 * @param {import('three').Object3D} group
 * @param {import('three').Vector3} restScale
 * @param {number} multiplier
 */
function applyRevealScale(group, restScale, multiplier) {
  const s = Math.max(0, multiplier);
  group.scale.set(restScale.x * s, restScale.y * s, restScale.z * s);
}

/**
 * @param {FontRevealTypeId} type
 * @param {number} eased — eased progress (may exceed 1 for pop/elastic)
 * @param {{
 *   group: import('three').Object3D,
 *   restPosition: import('three').Vector3,
 *   restRotationX: number,
 *   restRotationY: number,
 *   restRotationZ: number,
 *   slideDistance: number,
 *   meshMaterials: Array<{
 *     mat: import('three').Material,
 *     opacity: number,
 *     transparent: boolean,
 *     restEmissive: import('three').Color,
 *     restEmissiveIntensity: number,
 *   }>,
 * }} state
 * @param {{
 *   slideProgress?: number,
 *   landLinear?: number,
 *   slideDepth?: number,
 *   slideDirection?: FontRevealSlideDirection,
 *   wordPivot?: FontRevealWordPivot,
 * }} [options]
 */
export function applyRevealPoseToGlyph(type, eased, state, options = {}) {
  const {
    group,
    restPosition,
    restRotationX,
    restRotationY,
    restRotationZ,
    restScale,
    slideDistance,
    meshMaterials,
  } = state;
  const e = eased;
  const slideProgress = Math.max(0, Math.min(1, Number(options.slideProgress) || 0));
  const landLinear = Math.max(0, Math.min(1, Number(options.landLinear) || 0));
  const slideDepth = clampFontRevealSlideDepth(options.slideDepth);
  const slideDirection = normalizeFontRevealSlideDirection(options.slideDirection);
  const wordPivot = options.wordPivot;
  const useWordGroup = !!wordPivot?.center;
  const wordCenter = wordPivot?.center;
  const activeSlideDistance = useWordGroup ? wordPivot.slideDistance : slideDistance;

  group.position.copy(restPosition);
  group.rotation.x = restRotationX;
  group.rotation.y = restRotationY;
  group.rotation.z = restRotationZ;
  group.scale.copy(restScale);

  switch (type) {
    case 'none':
      break;

    case 'fade':
      for (const { mat } of meshMaterials) {
        const opacity = Math.max(0, Math.min(1, e));
        mat.opacity = opacity;
        mat.transparent = opacity < 1;
        mat.needsUpdate = true;
      }
      group.visible = e > 0.001;
      break;

    case 'slideUp':
    case 'slideDown': {
      const slideEased = Math.max(0, Math.min(1, e));
      const yOffset = activeSlideDistance * (1 - slideEased);
      group.position.y =
        type === 'slideUp'
          ? restPosition.y - yOffset
          : restPosition.y + yOffset;
      group.visible = slideEased > 0.001;
      break;
    }

    case 'drop': {
      const dropEased = Math.max(0, Math.min(1, e));
      const yOffset = activeSlideDistance * (1 - dropEased);
      group.position.y = restPosition.y + yOffset;
      if (useWordGroup) {
        group.scale.copy(restScale);
      } else {
        const squashY = computeDropImpactSquashY(landLinear);
        group.scale.set(restScale.x, restScale.y * squashY, restScale.z);
      }
      group.visible = dropEased > 0.001;
      break;
    }

    case 'pop':
    case 'elastic': {
      const s = Math.max(0, e);
      if (useWordGroup && wordCenter) {
        copyWordScaledPosition(group.position, restPosition, wordCenter, s);
        applyRevealScale(group, restScale, s);
      } else {
        applyRevealScale(group, restScale, s);
      }
      group.visible = s > 0.001;
      break;
    }

    case 'rotate': {
      const rotateLinear = slideDepth > 0 ? slideProgress : landLinear;
      const rotateEased = easeSlideSoftOut(rotateLinear);
      const angleDelta = _ROTATE_Y_START * (1 - rotateEased);
      if (useWordGroup && wordCenter) {
        copyWordRotatedPosition(group.position, restPosition, wordCenter, angleDelta);
      }
      group.rotation.y = restRotationY + angleDelta;
      group.visible = rotateEased > 0.001;
      break;
    }

    case 'scale':
    default: {
      const s = Math.max(0, Math.min(1, e));
      if (useWordGroup && wordCenter) {
        copyWordScaledPosition(group.position, restPosition, wordCenter, s);
        applyRevealScale(group, restScale, s);
      } else {
        applyRevealScale(group, restScale, s);
      }
      group.visible = s > 0.001;
      break;
    }
  }

  if (slideDepth > 0) {
    const travelEased = easeSlideSoftOut(slideProgress);
    const directionSign = slideDirection === 'front' ? 1 : -1;
    const offset = directionSign * slideDepth * (1 - travelEased);
    const slideAxis = new THREE.Vector3(0, 0, 1);
    slideAxis.applyAxisAngle(new THREE.Vector3(0, 1, 0), group.rotation.y);
    group.position.addScaledVector(slideAxis, offset);
  }
}

/**
 * @param {{
 *   group: import('three').Object3D,
 *   restPosition: import('three').Vector3,
 *   restRotationX: number,
 *   restRotationY: number,
 *   restRotationZ: number,
 *   restScale: import('three').Vector3,
 *   meshMaterials: Array<{
 *     mat: import('three').Material,
 *     opacity: number,
 *     transparent: boolean,
 *     restEmissive: import('three').Color,
 *     restEmissiveIntensity: number,
 *   }>,
 * }} state
 */
export function resetRevealGlyphPose(state) {
  const { group, restPosition, restRotationX, restRotationY, restRotationZ, restScale, meshMaterials } = state;
  group.position.copy(restPosition);
  group.rotation.x = restRotationX;
  group.rotation.y = restRotationY;
  group.rotation.z = restRotationZ;
  group.scale.copy(restScale);
  group.visible = true;
  for (const { mat, opacity, transparent } of meshMaterials) {
    mat.opacity = opacity;
    mat.transparent = transparent;
    mat.needsUpdate = true;
  }
  restoreRevealGlyphEmissive(state);
}
