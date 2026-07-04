import { normalizeToneCurve } from './math/toneCurvePchip.js';
import { deepClone } from './utils/deepClone.js';
import { migrateLegacyGroundKeys } from './state/migrateLegacyGroundKeys.js';
import { createDefaultState } from './state/defaults/index.js';

export class StateStore {
  constructor() {
    this.defaults = createDefaultState();
    this.state = deepClone(this.defaults);
    this.subscribers = new Set();
    /** When > 0, `set` / `setTopLevelBundle` / `reset` defer `notify` until outermost batch ends. */
    this._batchDepth = 0;
    /** When > 0, slider/color scrubbing — state updates apply but UI sync waits until release. */
    this._deferNotifyDepth = 0;
  }

  getState() {
    return deepClone(this.state);
  }

  /**
   * Live state for hot paths (render loop). Read-only — do not mutate.
   * Avoids cloning embedded assets every frame.
   */
  peekState() {
    return this.state;
  }

  getDefaults() {
    return deepClone(this.defaults);
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify() {
    const snapshot = this.getState();
    for (const callback of this.subscribers) {
      try {
        callback(snapshot);
      } catch (error) {
        console.error('[StateStore] subscriber failed', error);
      }
    }
  }

  _notifyIfIdle() {
    if (this._batchDepth === 0 && this._deferNotifyDepth === 0) {
      this.notify();
    }
  }

  /** Coalesce notify while scrubbing a range slider or color chip (pointer held). */
  beginDeferredNotify() {
    this._deferNotifyDepth += 1;
  }

  endDeferredNotify() {
    if (this._deferNotifyDepth > 0) {
      this._deferNotifyDepth -= 1;
    }
    this._notifyIfIdle();
  }

  /** True while a range slider or color chip is held (notify coalesced). */
  isNotifyDeferred() {
    return this._deferNotifyDepth > 0;
  }

  /**
   * Recover when a deferred-notify scope is orphaned (tab switch mid-scrub, lost pointerup).
   * Resets depth to zero and runs one notify so applyBlockStates / syncControls catch up.
   */
  flushDeferredNotify() {
    if (this._deferNotifyDepth <= 0) return;
    this._deferNotifyDepth = 0;
    this._notifyIfIdle();
  }

  /**
   * @param {string} path - Dot path, same as `set`
   * @param {unknown} value
   */
  _writePath(path, value) {
    const segments = path.split('.');
    let target = this.state;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const key = segments[i];
      target[key] = target[key] ?? {};
      target = target[key];
    }
    target[segments.at(-1)] = value;
  }

  set(path, value) {
    const v = path === 'toneCurve' ? normalizeToneCurve(value) : value;
    this._writePath(path, v);
    this._notifyIfIdle();
  }

  /**
   * Run `fn` with batching: commits many `set`/`setTopLevelBundle`/`reset` mutations,
   * then a single `notify` when the outermost batch completes. Nested batches collapse
   * to one notification.
   * @param {() => void} fn
   */
  batch(fn) {
    this._batchDepth += 1;
    try {
      fn();
    } finally {
      this._batchDepth -= 1;
      if (this._batchDepth < 0) {
        this._batchDepth = 0;
      }
      this._notifyIfIdle();
    }
  }

  /**
   * Replace many top-level state keys in one go (single notify + one getState() clone
   * for subscribers). Use for look-filter apply and similar bulk updates — avoids
   * N× full UI sync, GC churn, and stacked rAF slider-fill passes.
   * @param {Record<string, unknown>} partial — top-level keys only, e.g. { camera, bloom, … }
   */
  setTopLevelBundle(partial) {
    if (!partial || typeof partial !== 'object') return;
    migrateLegacyGroundKeys(partial);
    const keys = Object.keys(partial);
    if (keys.length === 0) return;
    for (const key of keys) {
      const val = key === 'toneCurve' ? normalizeToneCurve(partial[key]) : partial[key];
      this.state[key] = val;
    }
    this._notifyIfIdle();
  }

  reset() {
    this.state = deepClone(this.defaults);
    this._notifyIfIdle();
    return this.getState();
  }

  /**
   * Replace the entire state tree in one notify (undo / settings restore).
   * @param {object} nextState
   */
  replaceState(nextState) {
    const cloned = deepClone(nextState);
    migrateLegacyGroundKeys(cloned);
    if (cloned.toneCurve !== undefined) {
      cloned.toneCurve = normalizeToneCurve(cloned.toneCurve);
    }
    this.state = cloned;
    this._notifyIfIdle();
  }

  /** Read a default value at a dot-path. Returns `undefined` if the path is absent. */
  _readDefault(path) {
    const segments = path.split('.');
    let src = this.defaults;
    for (const seg of segments) {
      if (src == null || typeof src !== 'object' || !(seg in src)) return undefined;
      src = src[seg];
    }
    return src;
  }

  /**
   * Restore the given dot-paths to their default values (deep-cloned) in a single batch.
   * Single source of truth for "what belongs to this section" — callers pass the same path
   * list used for dirty detection instead of hand-writing `set(path, defaults.x ?? fallback)`.
   * Paths missing from defaults are skipped. Event emission / UI sync stay with the caller.
   * @param {string[]} paths
   */
  resetSlice(paths) {
    if (!Array.isArray(paths) || paths.length === 0) return;
    this.batch(() => {
      for (const path of paths) {
        const value = this._readDefault(path);
        if (value === undefined) continue;
        this.set(path, deepClone(value));
      }
    });
  }
}
