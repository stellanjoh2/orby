/**
 * Control manifest — shared wiring for state ↔ event ↔ scene apply.
 *
 * Manifest entries describe one control channel:
 * - `event` — EventBus name emitted by UI / presets
 * - `statePath` — optional StateStore dot path (UI binding)
 * - `apply` — SceneManager method name, or `{ controller, method }`
 * - `mapArg` — optional `(payload) => applyArg` transform
 * - `defaultArg` — used when payload is null/undefined
 * - `noArg` — invoke apply with zero arguments
 * - `noOp` — legacy no-op listener
 * - `coerce: 'bool'` — coerce payload to boolean before apply
 * - `guard` — `(payload, scene) => boolean`; skip when false
 * - `afterApply` — `(scene, applyArg, payload) => void` side effects
 */

/** @param {object} scene @param {string | { controller?: string, method: string }} applySpec */
export function resolveSceneApplyTarget(scene, applySpec) {
  if (typeof applySpec === 'string') {
    return { target: scene, method: applySpec };
  }
  if (applySpec?.controller) {
    return { target: scene[applySpec.controller], method: applySpec.method };
  }
  return { target: scene, method: applySpec.method };
}

/** @param {object} scene @param {object} entry @param {*} payload */
export function invokeSceneManifestApply(scene, entry, payload) {
  if (entry.noOp) return;
  if (entry.guard && !entry.guard(payload, scene)) return;

  let value = payload;
  if (entry.coerce === 'bool') value = !!payload;

  if (entry.mapArg) {
    value = entry.mapArg(value, scene);
    if (value === undefined && entry.skipUndefined) return;
  } else if (value == null && entry.defaultArg !== undefined) {
    value = entry.defaultArg;
  }

  const { target, method } = resolveSceneApplyTarget(scene, entry.apply);
  const fn = target?.[method];
  if (typeof fn !== 'function') return;

  if (entry.noArg) {
    fn.call(target);
  } else if (entry.spreadArgs && Array.isArray(value)) {
    fn.call(target, ...value);
  } else {
    fn.call(target, value);
  }

  entry.afterApply?.(scene, value, payload);
}

/**
 * Register manifest entries on the event bus (scene-side handlers).
 * @param {import('../EventBus.js').EventBus} eventBus
 * @param {object} scene — SceneManager instance
 * @param {object[]} entries
 */
export function registerSceneManifestHandlers(eventBus, scene, entries) {
  for (const entry of entries) {
    if (!entry?.event) continue;
    eventBus.on(entry.event, (payload) => {
      invokeSceneManifestApply(scene, entry, payload);
    });
  }
}

/** Dual-write: persist to StateStore and emit scene apply event. */
export function writeStateAndEmit(stateStore, eventBus, statePath, event, value) {
  stateStore.set(statePath, value);
  eventBus.emit(event, value);
}

/**
 * Parse a range input value with optional clamp + fallback.
 * @param {string} raw
 * @param {{ min?: number, max?: number, fallback?: number }} [opts]
 */
export function parseManifestRangeValue(raw, opts = {}) {
  const parsed = parseFloat(raw);
  const fallback = opts.fallback ?? parsed;
  const base = Number.isFinite(parsed) ? parsed : fallback;
  if (opts.min == null && opts.max == null) return base;
  const lo = opts.min ?? -Infinity;
  const hi = opts.max ?? Infinity;
  return Math.max(lo, Math.min(hi, base));
}
