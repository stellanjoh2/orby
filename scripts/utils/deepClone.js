/**
 * Deep clone plain JSON-like data (objects, arrays, primitives).
 * Primitives (including large embedded base64 strings) are returned as-is so
 * getState() does not copy multi-megabyte scene assets every frame.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepClone(value) {
  return cloneValue(value, new WeakMap());
}

/** @param {unknown} value @param {WeakMap<object, unknown>} seen */
function cloneValue(value, seen) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return seen.get(value);
  }

  if (Array.isArray(value)) {
    const out = new Array(value.length);
    seen.set(value, out);
    for (let i = 0; i < value.length; i += 1) {
      out[i] = cloneValue(value[i], seen);
    }
    return out;
  }

  const out = {};
  seen.set(value, out);
  for (const key of Object.keys(value)) {
    out[key] = cloneValue(value[key], seen);
  }
  return out;
}
