/**
 * Looping per-glyph motion layered on top of font text reveal poses.
 */

/** @typedef {'none' | 'float' | 'wave' | 'breathe' | 'sway'} FontConstantTypeId */

export const DEFAULT_FONT_CONSTANT_TYPE = 'none';
export const DEFAULT_FONT_CONSTANT_INTENSITY = 0.5;
export const DEFAULT_FONT_CONSTANT_SPEED_SEC = 2;
export const DEFAULT_FONT_CONSTANT_SPREAD = 1;

export const MIN_FONT_CONSTANT_INTENSITY = 0;
export const MAX_FONT_CONSTANT_INTENSITY = 1;
/** Float + wave share a higher intensity range and identical peak vertical travel. */
export const MIN_FONT_CONSTANT_VERTICAL_INTENSITY = 0;
export const MAX_FONT_CONSTANT_VERTICAL_INTENSITY = 3;
/** Peak ±Y offset at vertical intensity 1 (× glyph slideDistance; sin handles sign). */
export const FONT_CONSTANT_VERTICAL_TRAVEL_SCALE = 0.55;
/** Float lateral drift as a fraction of peak vertical travel (cos couples to vertical sin). */
export const FONT_CONSTANT_FLOAT_HORIZONTAL_TRAVEL_SCALE = 0.35;
/** Float whole-line Z tilt at vertical intensity 1 — softer than per-glyph Sway. */
export const FONT_CONSTANT_FLOAT_SWAY_ROTATION_SCALE = 0.04;
export const MIN_FONT_CONSTANT_SPEED_SEC = 0.4;
export const MAX_FONT_CONSTANT_SPEED_SEC = 5;
export const MIN_FONT_CONSTANT_SPREAD = 0;
export const MAX_FONT_CONSTANT_SPREAD = 1;

/** @type {ReadonlyArray<{ id: FontConstantTypeId, label: string, tooltip: string, usesSpread?: boolean }>} */
export const FONT_CONSTANT_TYPE_OPTIONS = [
  {
    id: 'none',
    label: 'None',
    tooltip: 'No looping motion — text stays still after reveal',
  },
  {
    id: 'float',
    label: 'Float',
    tooltip: 'Gentle bob with soft lateral drift and tilt — whole line moves together',
  },
  {
    id: 'wave',
    label: 'Wave',
    tooltip: 'Staggered vertical sine — letters ripple along the string',
    usesSpread: true,
  },
  {
    id: 'breathe',
    label: 'Breathe',
    tooltip: 'Subtle uniform scale pulse',
  },
  {
    id: 'sway',
    label: 'Sway',
    tooltip: 'Small rotation wobble per letter',
    usesSpread: true,
  },
];

const VALID_IDS = new Set(FONT_CONSTANT_TYPE_OPTIONS.map((o) => o.id));

/** @param {unknown} value @returns {FontConstantTypeId} */
export function normalizeFontConstantType(value) {
  const id = typeof value === 'string' ? value : DEFAULT_FONT_CONSTANT_TYPE;
  return VALID_IDS.has(id) ? /** @type {FontConstantTypeId} */ (id) : DEFAULT_FONT_CONSTANT_TYPE;
}

/** @param {unknown} value */
export function isFontConstantAnimationActive(value) {
  return normalizeFontConstantType(value) !== 'none';
}

/** @param {unknown} value */
export function clampFontConstantIntensity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_FONT_CONSTANT_INTENSITY;
  return Math.min(MAX_FONT_CONSTANT_INTENSITY, Math.max(MIN_FONT_CONSTANT_INTENSITY, n));
}

/** @param {unknown} value */
export function clampFontConstantVerticalIntensity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_FONT_CONSTANT_INTENSITY;
  return Math.min(
    MAX_FONT_CONSTANT_VERTICAL_INTENSITY,
    Math.max(MIN_FONT_CONSTANT_VERTICAL_INTENSITY, n),
  );
}

/** @param {FontConstantTypeId} type */
export function isFontConstantVerticalType(type) {
  const id = normalizeFontConstantType(type);
  return id === 'float' || id === 'wave';
}

/** @param {FontConstantTypeId} type @param {unknown} value */
export function clampFontConstantIntensityForType(type, value) {
  return isFontConstantVerticalType(type)
    ? clampFontConstantVerticalIntensity(value)
    : clampFontConstantIntensity(value);
}

/**
 * @param {FontConstantTypeId} type
 * @param {number} intensity
 */
export function formatFontConstantIntensityLabel(type, intensity) {
  if (isFontConstantVerticalType(type)) {
    const clamped = clampFontConstantVerticalIntensity(intensity);
    const pct = Math.round((clamped / MAX_FONT_CONSTANT_VERTICAL_INTENSITY) * 100);
    return `${pct}%`;
  }
  const clamped = clampFontConstantIntensity(intensity);
  return `${Math.round(clamped * 100)}%`;
}

/** @param {unknown} value */
export function clampFontConstantSpeedSec(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_FONT_CONSTANT_SPEED_SEC;
  return Math.min(MAX_FONT_CONSTANT_SPEED_SEC, Math.max(MIN_FONT_CONSTANT_SPEED_SEC, n));
}

/** @param {unknown} value */
export function clampFontConstantSpread(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_FONT_CONSTANT_SPREAD;
  return Math.min(MAX_FONT_CONSTANT_SPREAD, Math.max(MIN_FONT_CONSTANT_SPREAD, n));
}

/** @param {FontConstantTypeId} type */
export function fontConstantTypeUsesSpread(type) {
  return FONT_CONSTANT_TYPE_OPTIONS.find((o) => o.id === type)?.usesSpread === true;
}

/**
 * @param {import('three').Vector3} out
 * @param {import('three').Vector3} point
 * @param {import('three').Vector3} pivot
 * @param {number} scale
 */
function copyLinePivotScaledPosition(out, point, pivot, scale) {
  out.copy(point).sub(pivot).multiplyScalar(scale).add(pivot);
}

/**
 * @param {import('three').Vector3} out
 * @param {import('three').Vector3} point
 * @param {import('three').Vector3} pivot
 * @param {number} angleZ
 */
function copyLinePivotRotatedPositionZ(out, point, pivot, angleZ) {
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  const cos = Math.cos(angleZ);
  const sin = Math.sin(angleZ);
  out.set(
    pivot.x + dx * cos - dy * sin,
    pivot.y + dx * sin + dy * cos,
    point.z,
  );
}

/**
 * @param {import('./fontTextRevealTypes.js').RevealGlyphState} state
 * @param {number} glyphIndex
 * @param {number} glyphCount
 * @param {number} elapsedSec
 * @param {{
 *   type: FontConstantTypeId,
 *   intensity: number,
 *   speedSec: number,
 *   spread: number,
 *   lineGlyphIndex?: number,
 *   lineGlyphCount?: number,
 *   linePivot?: { center: import('three').Vector3, slideDistance: number },
 *   useLinePivotMotion?: boolean,
 * }} options
 */
export function applyConstantOffsetToGlyph(state, glyphIndex, glyphCount, elapsedSec, options) {
  const { group, slideDistance, restPosition, restScale } = state;
  const type = normalizeFontConstantType(options.type);
  const intensity = clampFontConstantIntensityForType(type, options.intensity);
  const speedSec = clampFontConstantSpeedSec(options.speedSec);
  const spread = clampFontConstantSpread(options.spread);
  const lineGlyphIndex = Number.isFinite(options.lineGlyphIndex)
    ? options.lineGlyphIndex
    : glyphIndex;
  const lineGlyphCount = Number.isFinite(options.lineGlyphCount) && options.lineGlyphCount > 0
    ? options.lineGlyphCount
    : glyphCount;
  const linePivot = options.linePivot?.center;
  const useLinePivotMotion = !!options.useLinePivotMotion && !!linePivot;

  if (!isFontConstantAnimationActive(type) || intensity <= 0) return;

  const period = Math.max(0.25, speedSec);
  const phase = (elapsedSec / period) * Math.PI * 2;
  const spreadDenom = Math.max(1, lineGlyphCount - 1);
  const wavePhase = phase + lineGlyphIndex * spread * (Math.PI * 2) / spreadDenom;
  const verticalTravel =
    slideDistance * FONT_CONSTANT_VERTICAL_TRAVEL_SCALE * intensity;

  switch (type) {
    case 'float': {
      const floatIntensity = intensity / MAX_FONT_CONSTANT_VERTICAL_INTENSITY;
      const horizontalTravel =
        verticalTravel * FONT_CONSTANT_FLOAT_HORIZONTAL_TRAVEL_SCALE;
      const bobY = verticalTravel * Math.sin(phase);
      const bobX = horizontalTravel * Math.cos(phase);
      const tiltAngle =
        FONT_CONSTANT_FLOAT_SWAY_ROTATION_SCALE
        * floatIntensity
        * Math.sin(phase + Math.PI * 0.35);
      if (useLinePivotMotion) {
        copyLinePivotRotatedPositionZ(group.position, restPosition, linePivot, tiltAngle);
        group.position.x += bobX;
        group.position.y += bobY;
      } else {
        group.position.y += bobY;
        group.position.x += bobX;
        group.rotation.z += tiltAngle;
      }
      break;
    }

    case 'wave':
      group.position.y += verticalTravel * Math.sin(wavePhase);
      break;

    case 'breathe': {
      const scaleMul = 1 + 0.08 * intensity * Math.sin(phase);
      if (useLinePivotMotion) {
        copyLinePivotScaledPosition(group.position, restPosition, linePivot, scaleMul);
        group.scale.set(
          restScale.x * scaleMul,
          restScale.y * scaleMul,
          restScale.z * scaleMul,
        );
      } else {
        group.scale.x *= scaleMul;
        group.scale.y *= scaleMul;
        group.scale.z *= scaleMul;
      }
      break;
    }

    case 'sway': {
      const swayAngle = 0.05 * intensity * Math.sin(wavePhase);
      if (useLinePivotMotion) {
        copyLinePivotRotatedPositionZ(group.position, restPosition, linePivot, swayAngle);
      } else {
        group.rotation.z += swayAngle;
      }
      break;
    }

    default:
      break;
  }
}
