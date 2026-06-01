/**
 * GSAP-inspired per-glyph reveal presets for extruded font meshes.
 * Easing names mirror common GSAP defaults (power1/2/3, back, elastic).
 */

/**
 * @typedef {{
 *   group: import('three').Object3D,
 *   restPosition: import('three').Vector3,
 *   restRotationZ: number,
 *   slideDistance: number,
 *   meshMaterials: Array<{ mat: import('three').Material, opacity: number, transparent: boolean }>,
 * }} RevealGlyphState
 */

/** @typedef {'scale' | 'fade' | 'slideUp' | 'pop' | 'rotate' | 'elastic'} FontRevealTypeId */

export const DEFAULT_FONT_REVEAL_TYPE = 'scale';

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
    ease: 'power2.out',
    tooltip: 'Rise into place — like gsap.from({ y: "40%" })',
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
    tooltip: 'Flip in on Z — like gsap.from({ rotation: -90 })',
  },
  {
    id: 'elastic',
    label: 'Elastic',
    ease: 'elastic.out(1, 0.3)',
    tooltip: 'Bouncy scale — like gsap.from({ scale: 0, ease: "elastic.out" })',
  },
];

const VALID_IDS = new Set(FONT_REVEAL_TYPE_OPTIONS.map((o) => o.id));

/** @param {unknown} value @returns {FontRevealTypeId} */
export function normalizeFontRevealType(value) {
  const id = typeof value === 'string' ? value : '';
  return VALID_IDS.has(id) ? /** @type {FontRevealTypeId} */ (id) : DEFAULT_FONT_REVEAL_TYPE;
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
    case 'rotate':
    case 'slideUp':
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

const _ROTATE_START = -Math.PI / 2;

/**
 * @param {FontRevealTypeId} type
 * @param {number} eased — eased progress (may exceed 1 for pop/elastic)
 * @param {{
 *   group: import('three').Object3D,
 *   restPosition: import('three').Vector3,
 *   restRotationZ: number,
 *   slideDistance: number,
 *   meshMaterials: Array<{ mat: import('three').Material, opacity: number, transparent: boolean }>,
 * }} state
 */
export function applyRevealPoseToGlyph(type, eased, state) {
  const { group, restPosition, restRotationZ, slideDistance, meshMaterials } = state;
  const e = eased;

  group.position.copy(restPosition);
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
      group.rotation.z = restRotationZ + _ROTATE_START * (1 - Math.max(0, Math.min(1, e)));
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
}

/**
 * @param {{
 *   group: import('three').Object3D,
 *   restPosition: import('three').Vector3,
 *   restRotationZ: number,
 *   meshMaterials: Array<{ mat: import('three').Material, opacity: number, transparent: boolean }>,
 * }} state
 */
export function resetRevealGlyphPose(state) {
  const { group, restPosition, restRotationZ, meshMaterials } = state;
  group.position.copy(restPosition);
  group.rotation.z = restRotationZ;
  group.scale.set(1, 1, 1);
  group.visible = true;
  for (const { mat, opacity, transparent } of meshMaterials) {
    mat.opacity = opacity;
    mat.transparent = transparent;
    mat.needsUpdate = true;
  }
}
