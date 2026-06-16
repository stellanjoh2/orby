/** @typedef {'light' | 'medium' | 'soft' | 'success' | 'selection'} MobileHapticKind */

/** @type {Record<MobileHapticKind, number | number[]>} */
const PATTERNS = {
  light: 6,
  medium: 12,
  soft: 4,
  success: [10, 42, 14],
  selection: 8,
};

/** Web fallback — native wrap can bridge to UIImpactFeedbackGenerator later. */
/** @param {MobileHapticKind} [kind] */
export function mobileHaptic(kind = 'light') {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const pattern = PATTERNS[kind] ?? PATTERNS.light;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}
