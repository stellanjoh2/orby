/**
 * GSAP-inspired per-glyph reveal presets for extruded font meshes.
 * Easing names mirror common GSAP defaults (power1/2/3, back, elastic).
 */

/**
 * @typedef {{
 *   group: import('three').Object3D,
 *   restPosition: import('three').Vector3,
 *   restRotationY: number,
 *   restRotationZ: number,
 *   slideDistance: number,
 *   meshMaterials: Array<{ mat: import('three').Material, opacity: number, transparent: boolean }>,
 * }} RevealGlyphState
 */

/** @typedef {'scale' | 'fade' | 'slideUp' | 'pop' | 'rotate' | 'elastic'} FontRevealTypeId */
/** @typedef {'back' | 'front'} FontRevealSlideDirection */

export const DEFAULT_FONT_REVEAL_TYPE = 'scale';
export const DEFAULT_FONT_REVEAL_SLIDE_DEPTH = 0.18;
export const DEFAULT_FONT_REVEAL_SLIDE_TIME = 0.45;
export const DEFAULT_FONT_REVEAL_SLIDE_DIRECTION = 'back';
export const MIN_FONT_REVEAL_SLIDE_DEPTH = 0;
export const MAX_FONT_REVEAL_SLIDE_DEPTH = 2.5;
export const MIN_FONT_REVEAL_SLIDE_TIME = 0.1;
export const MAX_FONT_REVEAL_SLIDE_TIME = 1;

/** @type {ReadonlyArray<{ id: FontRevealTypeId, label: string, ease: string, tooltip: string }>} */
export const FONT_REVEAL_TYPE_OPTIONS = [
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
    ease: 'expo.out (soft)',
    tooltip: 'Rise into place with a long soft landing — steep start, gentle settle',
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
    ease: 'power2.out',
    tooltip: 'Turn in on Y — uses true 3D depth as letters face the camera',
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

/** @param {unknown} value @returns {FontRevealTypeId} */
export function normalizeFontRevealType(value) {
  const id = typeof value === 'string' ? value : '';
  return VALID_IDS.has(id) ? /** @type {FontRevealTypeId} */ (id) : DEFAULT_FONT_REVEAL_TYPE;
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

/**
 * Depth slide / Slide Up outro — fast early travel, long soft landing (AE-style, gentler than full expo.out).
 * @param {number} t linear 0–1 through the slide window
 * @returns {number}
 */
export function easeSlideSoftOut(t) {
  const u = Math.max(0, Math.min(1, t));
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const expo = 1 - 2 ** (-7 * u);
  const power5 = 1 - (1 - u) ** 5;
  return expo * 0.55 + power5 * 0.45;
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

/** @param {FontRevealTypeId} type @param {number} t @returns {number} */
export function easeForRevealType(type, t) {
  const clamped = Math.max(0, Math.min(1, t));
  switch (type) {
    case 'fade':
      return easePower1Out(clamped);
    case 'pop':
      return easeBackOut(clamped, 1.7);
    case 'elastic':
      return easeElasticOut(clamped);
    case 'slideUp':
      return easeSlideSoftOut(clamped);
    case 'rotate':
    case 'scale':
    default:
      return easePower2Out(clamped);
  }
}

/**
 * Raw 0–1 progress for one glyph's slot (before easing).
 * @param {number} glyphIndex
 * @param {number} glyphCount
 * @param {number} elapsedSec
 * @param {number} totalDurationSec
 * @returns {number}
 */
export function computeGlyphSlotProgress(
  glyphIndex,
  glyphCount,
  elapsedSec,
  totalDurationSec,
) {
  if (totalDurationSec <= 0 || glyphCount <= 0) return 1;
  const slot = totalDurationSec / glyphCount;
  const t = (elapsedSec - glyphIndex * slot) / slot;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

/**
 * @param {FontRevealTypeId} type
 * @param {number} glyphIndex
 * @param {number} glyphCount
 * @param {number} elapsedSec
 * @param {number} totalDurationSec
 * @returns {number} eased 0–1 (may overshoot for pop/elastic)
 */
export function computeGlyphRevealEase(
  type,
  glyphIndex,
  glyphCount,
  elapsedSec,
  totalDurationSec,
) {
  const raw = computeGlyphSlotProgress(glyphIndex, glyphCount, elapsedSec, totalDurationSec);
  return easeForRevealType(type, raw);
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
 * @param {FontRevealTypeId} type
 * @param {number} eased — eased progress (may exceed 1 for pop/elastic)
 * @param {{
 *   group: import('three').Object3D,
 *   restPosition: import('three').Vector3,
 *   restRotationY: number,
 *   restRotationZ: number,
 *   slideDistance: number,
 *   meshMaterials: Array<{ mat: import('three').Material, opacity: number, transparent: boolean }>,
 * }} state
 * @param {{ rawProgress?: number, slideDepth?: number, slideTime?: number, slideDirection?: FontRevealSlideDirection }} [options]
 */
export function applyRevealPoseToGlyph(type, eased, state, options = {}) {
  const { group, restPosition, restRotationY, restRotationZ, slideDistance, meshMaterials } = state;
  const e = eased;
  const raw = Math.max(0, Math.min(1, Number(options.rawProgress) || 0));
  const slideDepth = clampFontRevealSlideDepth(options.slideDepth);
  const slideTime = clampFontRevealSlideTime(options.slideTime);
  const slideDirection = normalizeFontRevealSlideDirection(options.slideDirection);

  group.position.copy(restPosition);
  group.rotation.y = restRotationY;
  group.rotation.z = restRotationZ;
  group.scale.set(1, 1, 1);

  switch (type) {
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
      group.position.y = restPosition.y + slideDistance * (1 - Math.max(0, Math.min(1, e)));
      group.visible = e > 0.001;
      break;

    case 'pop':
    case 'elastic': {
      const s = Math.max(0, e);
      group.scale.set(s, s, s);
      group.visible = s > 0.001;
      break;
    }

    case 'rotate':
      group.rotation.y = restRotationY + _ROTATE_Y_START * (1 - Math.max(0, Math.min(1, e)));
      group.visible = e > 0.001;
      break;

    case 'scale':
    default: {
      const s = Math.max(0, Math.min(1, e));
      group.scale.set(s, s, s);
      group.visible = s > 0.001;
      break;
    }
  }

  if (slideDepth > 0) {
    const travelLinear = Math.max(0, Math.min(1, raw / Math.max(0.001, slideTime)));
    const travelEased = easeSlideSoftOut(travelLinear);
    const directionSign = slideDirection === 'front' ? 1 : -1;
    group.position.z = restPosition.z + directionSign * slideDepth * (1 - travelEased);
  }
}

/**
 * @param {{
 *   group: import('three').Object3D,
 *   restPosition: import('three').Vector3,
 *   restRotationY: number,
 *   restRotationZ: number,
 *   meshMaterials: Array<{ mat: import('three').Material, opacity: number, transparent: boolean }>,
 * }} state
 */
export function resetRevealGlyphPose(state) {
  const { group, restPosition, restRotationY, restRotationZ, meshMaterials } = state;
  group.position.copy(restPosition);
  group.rotation.y = restRotationY;
  group.rotation.z = restRotationZ;
  group.scale.set(1, 1, 1);
  group.visible = true;
  for (const { mat, opacity, transparent } of meshMaterials) {
    mat.opacity = opacity;
    mat.transparent = transparent;
    mat.needsUpdate = true;
  }
}
