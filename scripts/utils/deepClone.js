/**
 * Deep clone plain JSON-like data (objects, arrays, primitives).
 * Uses structuredClone when available; otherwise JSON round-trip (no functions, Map, etc.).
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepClone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
