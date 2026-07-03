/** @param {number} value */
export function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Mix slider roughness toward 1 as HDRI blurriness increases — softens IBL reflections
 * without a separate blurred env map (Three.js backgroundBlurriness is backdrop-only).
 * @param {number} baseRoughness — material roughness from sliders / authored PBR
 * @param {number} hdriBlurriness — 0–1 studio HDRI blur
 */
export function effectiveRoughnessWithHdriBlur(baseRoughness, hdriBlurriness) {
  const r = clamp01(baseRoughness);
  const b = clamp01(hdriBlurriness);
  if (b <= 0) return r;
  return Math.min(1, r + (1 - r) * b);
}
