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
    tooltip: 'Gentle vertical bob — whole line moves together',
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
 * @param {import('./fontTextRevealTypes.js').RevealGlyphState} state
 * @param {number} glyphIndex
 * @param {number} glyphCount
 * @param {number} elapsedSec
 * @param {{
 *   type: FontConstantTypeId,
 *   intensity: number,
 *   speedSec: number,
 *   spread: number,
 * }} options
 */
export function applyConstantOffsetToGlyph(state, glyphIndex, glyphCount, elapsedSec, options) {
  const { group, slideDistance } = state;
  const type = normalizeFontConstantType(options.type);
  const intensity = clampFontConstantIntensityForType(type, options.intensity);
  const speedSec = clampFontConstantSpeedSec(options.speedSec);
  const spread = clampFontConstantSpread(options.spread);

  if (!isFontConstantAnimationActive(type) || intensity <= 0) return;

  const period = Math.max(0.25, speedSec);
  const phase = (elapsedSec / period) * Math.PI * 2;
  const spreadDenom = Math.max(1, glyphCount - 1);
  const wavePhase = phase + glyphIndex * spread * (Math.PI * 2) / spreadDenom;
  const verticalTravel =
    slideDistance * FONT_CONSTANT_VERTICAL_TRAVEL_SCALE * intensity;

  switch (type) {
    case 'float':
      group.position.y += verticalTravel * Math.sin(phase);
      break;

    case 'wave':
      group.position.y += verticalTravel * Math.sin(wavePhase);
      break;

    case 'breathe': {
      const scaleMul = 1 + 0.08 * intensity * Math.sin(phase);
      group.scale.x *= scaleMul;
      group.scale.y *= scaleMul;
      group.scale.z *= scaleMul;
      break;
    }

    case 'sway':
      group.rotation.z += 0.05 * intensity * Math.sin(wavePhase);
      break;

    default:
      break;
  }
}
