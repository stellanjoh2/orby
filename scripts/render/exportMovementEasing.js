/** @typedef {'linear' | `${string}.${'in' | 'out' | 'inOut'}`} ExportMovementEasingId */
/** @typedef {'linear' | 'sine' | 'quad' | 'cubic' | 'quart' | 'quint' | 'expo' | 'circ'} ExportMovementEasingFamily */
/** @typedef {'in' | 'out' | 'inOut'} ExportMovementEasingType */

export const DEFAULT_EXPORT_MOVEMENT_EASING = 'linear';
export const DEFAULT_EXPORT_MOVEMENT_EASING_FAMILY = 'linear';
export const DEFAULT_EXPORT_MOVEMENT_EASING_TYPE = 'out';

/** @type {readonly { id: ExportMovementEasingFamily, label: string }[]} */
export const EXPORT_MOVEMENT_EASING_FAMILIES = [
  { id: 'linear', label: 'Linear' },
  { id: 'sine', label: 'Sine' },
  { id: 'quad', label: 'Quad' },
  { id: 'cubic', label: 'Cubic' },
  { id: 'quart', label: 'Quart' },
  { id: 'quint', label: 'Quint' },
  { id: 'expo', label: 'Expo' },
  { id: 'circ', label: 'Circ' },
];

/** @type {readonly { id: ExportMovementEasingType, label: string }[]} */
export const EXPORT_MOVEMENT_EASING_TYPES = [
  { id: 'in', label: 'In' },
  { id: 'out', label: 'Out' },
  { id: 'inOut', label: 'In-out' },
];

/** @param {number} t */
function clamp01(t) {
  if (!Number.isFinite(t)) return 0;
  return Math.min(1, Math.max(0, t));
}

/** @type {Record<ExportMovementEasingId, (t: number) => number>} */
const EASING_FNS = {
  linear: (t) => t,
  'sine.in': (t) => 1 - Math.cos((t * Math.PI) / 2),
  'sine.out': (t) => Math.sin((t * Math.PI) / 2),
  'sine.inOut': (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  'quad.in': (t) => t * t,
  'quad.out': (t) => 1 - (1 - t) ** 2,
  'quad.inOut': (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  'cubic.in': (t) => t ** 3,
  'cubic.out': (t) => 1 - (1 - t) ** 3,
  'cubic.inOut': (t) =>
    t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,
  'quart.in': (t) => t ** 4,
  'quart.out': (t) => 1 - (1 - t) ** 4,
  'quart.inOut': (t) =>
    t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2,
  'quint.in': (t) => t ** 5,
  'quint.out': (t) => 1 - (1 - t) ** 5,
  'quint.inOut': (t) =>
    t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2,
  'expo.in': (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  'expo.out': (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  'expo.inOut': (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5
      ? 2 ** (20 * t - 10) / 2
      : (2 - 2 ** (-20 * t + 10)) / 2;
  },
  'circ.in': (t) => 1 - Math.sqrt(1 - t ** 2),
  'circ.out': (t) => Math.sqrt(1 - (t - 1) ** 2),
  'circ.inOut': (t) =>
    t < 0.5
      ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2
      : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2,
};

const VALID_EASING_IDS = new Set(Object.keys(EASING_FNS));
const VALID_EASING_FAMILIES = new Set(
  EXPORT_MOVEMENT_EASING_FAMILIES.map((option) => option.id),
);
const VALID_EASING_TYPES = new Set(
  EXPORT_MOVEMENT_EASING_TYPES.map((option) => option.id),
);

/** @param {unknown} value */
export function normalizeExportMovementEasingFamily(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (VALID_EASING_FAMILIES.has(id)) return id;
  return DEFAULT_EXPORT_MOVEMENT_EASING_FAMILY;
}

/** @param {unknown} value */
export function normalizeExportMovementEasingType(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (VALID_EASING_TYPES.has(id)) return id;
  return DEFAULT_EXPORT_MOVEMENT_EASING_TYPE;
}

/**
 * @param {unknown} family
 * @param {unknown} type
 * @returns {ExportMovementEasingId}
 */
export function composeExportMovementEasing(family, type) {
  const normalizedFamily = normalizeExportMovementEasingFamily(family);
  if (normalizedFamily === 'linear') return DEFAULT_EXPORT_MOVEMENT_EASING;
  const normalizedType = normalizeExportMovementEasingType(type);
  const id = `${normalizedFamily}.${normalizedType}`;
  return VALID_EASING_IDS.has(id) ? id : DEFAULT_EXPORT_MOVEMENT_EASING;
}

/**
 * @param {unknown} easingId
 * @returns {{ family: ExportMovementEasingFamily, type: ExportMovementEasingType }}
 */
export function parseExportMovementEasing(easingId) {
  const id = normalizeExportMovementEasing(easingId);
  if (id === DEFAULT_EXPORT_MOVEMENT_EASING) {
    return {
      family: DEFAULT_EXPORT_MOVEMENT_EASING_FAMILY,
      type: DEFAULT_EXPORT_MOVEMENT_EASING_TYPE,
    };
  }
  const dot = id.indexOf('.');
  if (dot <= 0) {
    return {
      family: DEFAULT_EXPORT_MOVEMENT_EASING_FAMILY,
      type: DEFAULT_EXPORT_MOVEMENT_EASING_TYPE,
    };
  }
  return {
    family: normalizeExportMovementEasingFamily(id.slice(0, dot)),
    type: normalizeExportMovementEasingType(id.slice(dot + 1)),
  };
}

/** @param {unknown} value */
export function normalizeExportMovementEasing(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (VALID_EASING_IDS.has(id)) return id;
  return DEFAULT_EXPORT_MOVEMENT_EASING;
}

/**
 * Map linear export progress `t` ∈ [0, 1] to eased movement progress.
 * @param {number} linearT
 * @param {unknown} [easingId]
 */
export function easeExportMovementProgress(linearT, easingId) {
  const t = clamp01(linearT);
  const id = normalizeExportMovementEasing(easingId);
  const fn = EASING_FNS[id] ?? EASING_FNS.linear;
  return clamp01(fn(t));
}

/** @param {unknown} easingId */
export function exportMovementEasingLabel(easingId) {
  const { family, type } = parseExportMovementEasing(easingId);
  if (family === 'linear') return 'Linear';
  const familyLabel =
    EXPORT_MOVEMENT_EASING_FAMILIES.find((option) => option.id === family)?.label
    ?? family;
  const typeLabel =
    EXPORT_MOVEMENT_EASING_TYPES.find((option) => option.id === type)?.label
    ?? type;
  return `${familyLabel} · ${typeLabel}`;
}
