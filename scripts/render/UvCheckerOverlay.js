import * as THREE from 'three';

/**
 * UV Checker overlay (Atlux map) — clones every mesh in the current model and assigns a
 * tileable checker `MeshBasicMaterial` so 3D artists can audit UV layout / seams without
 * losing original materials underneath.
 *
 * Mirrors the wireframe-overlay pattern in `MaterialController`: each overlay clone is
 * parented to the source mesh's parent (so local transforms stay correct) with a per-frame
 * pose sync via {@link UvCheckerOverlay#updateTransforms}. The shared 1K texture is
 * lazy-loaded once and cloned per material so each clone's `repeat` can be adjusted
 * independently if we ever add per-mesh tiling.
 *
 * Seamless style swaps: when the overlay is first enabled we kick off a background
 * preload of every entry in `TEXTURE_URLS` so the alternate styles are ready in cache
 * before the user toggles them. `rebuild()` also keeps the previously-visible overlay
 * meshes alive until the new texture is ready and the new clones are parented — only
 * then do we dispose the old set. A generation token guards against stale async
 * callbacks landing after `clear()` or a newer rebuild has superseded them.
 *
 * Lifecycle:
 *   - {@link setModel} attaches a model root (call with `null` on unload).
 *   - {@link applySettings} / {@link setEnabled} / {@link setScale} mutate state and rebuild
 *     overlay meshes as needed.
 *   - {@link rebuild} is also called by `MaterialController.setShading` so the overlay
 *     survives material rebuilds (geometry references stay valid, but we play it safe).
 *   - {@link updateTransforms} is driven by `SceneManager` once per frame.
 *   - {@link dispose} releases the shared texture (full teardown).
 */

/**
 * Available checker patterns. Add new entries by dropping a 1K (or matching) PNG into
 * `assets/images/` and listing it here; the dropdown in `index.html` picks up new styles
 * once it's wired in `MeshControls`.
 * @type {Record<string, string>}
 */
const TEXTURE_URLS = {
  orby: './assets/images/OrbyUVChecker_byValle_1K.png',
  classic: './assets/images/CustomUVChecker_byValle_1K.png',
  monochrome: './assets/images/CustomUVChecker_byValle_1K-bw.png',
};
const DEFAULT_STYLE = 'orby';
const SCALE_MIN = 0.05;
const SCALE_MAX = 10;
const DEFAULT_SCALE = 5;

function clampScale(value) {
  if (!Number.isFinite(value)) return DEFAULT_SCALE;
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, value));
}

function normalizeStyle(style) {
  const mapped = style === 'vibrant' ? 'classic' : style;
  return Object.prototype.hasOwnProperty.call(TEXTURE_URLS, mapped)
    ? mapped
    : DEFAULT_STYLE;
}

export class UvCheckerOverlay {
  constructor() {
    /** Current toggle state — `true` when the user has flipped UV Checker on under Advanced. */
    this.enabled = false;
    /** Tile multiplier; mirrored from `advanced.uvCheckerScale`. */
    this.scale = DEFAULT_SCALE;
    /** Active checker pattern; mirrored from `advanced.uvCheckerStyle`. */
    this.style = DEFAULT_STYLE;
    /** @type {THREE.Mesh[]|null} Live overlay clones, parented next to their source mesh. */
    this.overlayMeshes = null;
    /**
     * Texture cache keyed by style (`'classic'`, `'monochrome'`, …). Each entry holds the
     * loaded `THREE.Texture` and any rebuild callbacks queued while it was in-flight.
     * @type {Map<string, { texture: THREE.Texture|null, loading: boolean, pending: Array<(t: THREE.Texture) => void> }>}
     */
    this._textureCache = new Map();
    /** @type {THREE.Object3D|null} Attached model root (set via `setModel`). */
    this._model = null;
    /**
     * Monotonic generation counter. Bumped on every {@link rebuild} and {@link clear} so
     * in-flight async texture callbacks can detect when they've been superseded and bail
     * out instead of mutating overlay state owned by a newer build.
     */
    this._rebuildToken = 0;
  }

  /**
   * Attach (or detach) the model root the overlay clones from. Pass `null` on unload to
   * tear down existing clones cleanly.
   */
  setModel(model) {
    if (this._model === model) return;
    this.clear();
    this._model = model ?? null;
    if (this.enabled && this._model) this.rebuild();
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (this.enabled) {
      this.rebuild();
    } else {
      this.clear();
    }
  }

  /**
   * Apply state in one call. Live mutates clone textures' `repeat` without rebuilding the
   * mesh clones — cheap enough for slider drags.
   */
  setScale(scale) {
    this.scale = clampScale(scale);
    if (!this.overlayMeshes?.length) return;
    for (const mesh of this.overlayMeshes) {
      const tex = mesh.material?.map;
      if (tex) {
        tex.repeat.set(this.scale, this.scale);
        tex.needsUpdate = true;
      }
    }
  }

  setStyle(style) {
    const next = normalizeStyle(style);
    if (this.style === next) return;
    this.style = next;
    if (this.enabled) this.rebuild();
  }

  /**
   * Bulk update used on scene load and reset paths.
   * @param {{ enabled?: boolean, scale?: number, style?: string }} [partial]
   */
  applySettings(partial = {}) {
    const { enabled, scale, style } = partial;
    if (Number.isFinite(scale)) {
      this.scale = clampScale(scale);
    }
    if (typeof style === 'string') {
      this.style = normalizeStyle(style);
    }
    if (typeof enabled === 'boolean') {
      this.setEnabled(enabled);
    } else if (this.enabled) {
      this.rebuild();
    }
  }

  rebuild() {
    if (!this._model || !this.enabled) {
      this.clear();
      return;
    }
    // Warm the cache for sibling styles so the next style toggle has no network wait.
    this._preloadAllStyles();

    const myToken = ++this._rebuildToken;
    const styleAtRequest = this.style;

    this._ensureTexture(styleAtRequest, (sourceTexture) => {
      // A newer rebuild (or clear) has superseded us — bail without touching state.
      if (myToken !== this._rebuildToken) return;
      // Defensive: state may have flipped between the bump above and the callback firing.
      if (!this.enabled || !this._model || this.style !== styleAtRequest) return;

      const previousMeshes = this.overlayMeshes;
      const repeat = clampScale(this.scale);
      const newMeshes = [];

      this._model.traverse((child) => {
        if (
          !child.isMesh
          || !child.geometry
          || child.userData.isWireframeOverlay
          || child.userData.isUvCheckerOverlay
        ) return;
        if (child.isInstancedMesh) return;

        const tex = sourceTexture.clone();
        tex.needsUpdate = true;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.repeat.set(repeat, repeat);

        const material = new THREE.MeshBasicMaterial({
          map: tex,
          side: THREE.DoubleSide,
          toneMapped: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
          depthWrite: false,
        });
        material.userData.uvCheckerOwnedTexture = true;

        const overlay = child.isSkinnedMesh
          ? new THREE.SkinnedMesh(child.geometry, material)
          : new THREE.Mesh(child.geometry, material);
        overlay.userData.originalMesh = child;
        overlay.userData.isUvCheckerOverlay = true;
        overlay.name = child.name ? `${child.name}_uvchecker` : 'uvchecker';
        overlay.renderOrder = 998;

        if (child.isSkinnedMesh) {
          overlay.bind(child.skeleton, child.bindMatrix);
          if (child.bindMatrixInverse) {
            overlay.bindMatrixInverse = child.bindMatrixInverse.clone();
          }
        }

        const hostParent = child.parent;
        if (hostParent) {
          hostParent.add(overlay);
        } else {
          this._model.add(overlay);
        }
        newMeshes.push(overlay);
      });

      // Atomic swap: the new clones are parented and ready to render before we tear down
      // the previous set, so style changes never expose a blank frame.
      this.overlayMeshes = newMeshes;
      this._disposeMeshes(previousMeshes);
    });
  }

  clear() {
    // Bump the token so any in-flight rebuild callback no-ops instead of resurrecting
    // overlay meshes we're about to dispose.
    this._rebuildToken += 1;
    this._disposeMeshes(this.overlayMeshes);
    this.overlayMeshes = null;
  }

  /**
   * Dispose a set of overlay clones (materials, owned textures, parent detach). Safe to
   * call with `null`/empty. Kept separate from {@link clear} so {@link rebuild} can hand
   * off the old set after an atomic swap without invalidating the rebuild token.
   * @param {THREE.Mesh[]|null|undefined} meshes
   */
  _disposeMeshes(meshes) {
    if (!meshes?.length) return;
    for (const child of meshes) {
      if (!child.isMesh) continue;
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if (mat?.map && mat.userData?.uvCheckerOwnedTexture) {
            mat.map.dispose();
          }
          mat?.dispose?.();
        });
      }
      child.parent?.remove(child);
    }
  }

  updateTransforms() {
    if (!this.overlayMeshes?.length) return;
    for (const overlay of this.overlayMeshes) {
      if (!overlay.isMesh || !overlay.userData.originalMesh) continue;
      const original = overlay.userData.originalMesh;
      overlay.position.copy(original.position);
      overlay.rotation.copy(original.rotation);
      overlay.scale.copy(original.scale);
      const shouldDisableAutoUpdate = !overlay.isSkinnedMesh;
      overlay.matrixAutoUpdate = true;
      overlay.updateMatrix();
      if (shouldDisableAutoUpdate) {
        overlay.matrixAutoUpdate = false;
      }
    }
  }

  dispose() {
    this.clear();
    for (const entry of this._textureCache.values()) {
      entry.texture?.dispose();
      entry.pending = [];
    }
    this._textureCache.clear();
    this._model = null;
  }

  /**
   * Kick off background fetches for every style we haven't loaded yet. Idempotent — cached
   * and in-flight entries are skipped, so this is safe to call from `rebuild()` on every
   * toggle. The result is that once the user enables UV Checker, every alternate style
   * starts downloading immediately and subsequent style toggles hit the cache fast-path.
   */
  _preloadAllStyles() {
    for (const style of Object.keys(TEXTURE_URLS)) {
      const entry = this._textureCache.get(style);
      if (entry?.texture || entry?.loading) continue;
      // Empty callback — we only care about populating `entry.texture` here.
      this._ensureTexture(style, () => {});
    }
  }

  /**
   * Lazy-load the Atlux checker texture for the given style. While loading, queued
   * callbacks fire in order once the texture is ready. Each style has its own cache entry
   * so switching back and forth never re-downloads.
   */
  _ensureTexture(style, onReady) {
    const url = TEXTURE_URLS[style];
    if (!url) {
      console.error('[UVChecker] Unknown style requested:', style);
      return;
    }
    let entry = this._textureCache.get(style);
    if (!entry) {
      entry = { texture: null, loading: false, pending: [] };
      this._textureCache.set(style, entry);
    }
    if (entry.texture) {
      onReady(entry.texture);
      return;
    }
    entry.pending.push(onReady);
    if (entry.loading) return;
    entry.loading = true;

    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (texture) => {
        entry.loading = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = 8;
        entry.texture = texture;
        const callbacks = entry.pending;
        entry.pending = [];
        for (const cb of callbacks) {
          if (this.enabled) cb(texture);
        }
      },
      undefined,
      (err) => {
        entry.loading = false;
        entry.pending = [];
        console.error(`[UVChecker] Failed to load "${style}" texture (${url})`, err);
      },
    );
  }
}
