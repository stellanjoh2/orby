import * as THREE from 'three';
import {
  createNormalViewMaterial,
  DEFAULT_NORMAL_VIEW_MODE,
  normalizeNormalViewMode,
} from './normalViewMaterial.js';

/**
 * Normal / tangent diagnostic overlay — clones each mesh with a flat diagnostic material
 * so artists can audit shading normals or tangent-space normal maps without replacing
 * the underlying import materials.
 *
 * Mirrors {@link UvCheckerOverlay}: overlay clones parent next to their source mesh and
 * sync pose each frame via {@link NormalViewOverlay#updateTransforms}.
 */
export class NormalViewOverlay {
  constructor() {
    /** @type {boolean} */
    this.enabled = false;
    /** @type {import('./normalViewMaterial.js').NormalViewMode} */
    this.mode = DEFAULT_NORMAL_VIEW_MODE;
    /** @type {THREE.Mesh[]|null} */
    this.overlayMeshes = null;
    /** @type {THREE.Object3D|null} */
    this._model = null;
    this._rebuildToken = 0;
  }

  /** @param {THREE.Object3D|null} model */
  setModel(model) {
    if (this._model === model) return;
    this.clear();
    this._model = model ?? null;
    if (this.enabled && this._model) this.rebuild();
  }

  setEnabled(enabled, rebuild = true) {
    this.enabled = !!enabled;
    if (this.enabled) {
      if (rebuild) this.rebuild();
    } else {
      this.clear();
    }
  }

  /** @param {string} mode */
  setMode(mode, rebuild = true) {
    const next = normalizeNormalViewMode(mode);
    if (this.mode === next) return;
    this.mode = next;
    if (this.enabled && rebuild) this.rebuild();
  }

  /**
   * @param {{ enabled?: boolean, mode?: string }} [partial]
   * @param {{ rebuild?: boolean }} [options]
   */
  applySettings(partial = {}, options = {}) {
    const { enabled, mode } = partial;
    const shouldRebuild = options.rebuild !== false;
    if (typeof mode === 'string') {
      this.mode = normalizeNormalViewMode(mode);
    }
    if (typeof enabled === 'boolean') {
      this.setEnabled(enabled, shouldRebuild);
    } else if (this.enabled && shouldRebuild) {
      this.rebuild();
    }
  }

  rebuild() {
    void this.rebuildAsync();
  }

  /** @returns {Promise<void>} */
  async rebuildAsync() {
    if (!this._model || !this.enabled) {
      this.clear();
      return;
    }
    this._rebuildSync();
  }

  _rebuildSync() {
    if (!this._model || !this.enabled) {
      this.clear();
      return;
    }

    const myToken = ++this._rebuildToken;
    const modeAtRequest = this.mode;
    const previousMeshes = this.overlayMeshes;
    const newMeshes = [];

    this._model.traverse((child) => {
      if (
        !child.isMesh
        || !child.geometry
        || child.userData.isWireframeOverlay
        || child.userData.isUvCheckerOverlay
        || child.userData.isNormalViewOverlay
        || child.userData.isTopologyWarningsOverlay
      ) return;
      if (child.isInstancedMesh) return;

      const sourceMaterial = Array.isArray(child.material)
        ? child.material[0]
        : child.material;
      const material = createNormalViewMaterial(sourceMaterial, modeAtRequest, {
        isSkinned: child.isSkinnedMesh,
      });

      const overlay = child.isSkinnedMesh
        ? new THREE.SkinnedMesh(child.geometry, material)
        : new THREE.Mesh(child.geometry, material);
      overlay.userData.originalMesh = child;
      overlay.userData.isNormalViewOverlay = true;
      overlay.name = child.name ? `${child.name}_normalview` : 'normalview';
      overlay.renderOrder = 997;

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

    if (myToken !== this._rebuildToken) {
      this._disposeMeshes(newMeshes);
      return;
    }

    this.overlayMeshes = newMeshes;
    this._disposeMeshes(previousMeshes);
  }

  clear() {
    this._rebuildToken += 1;
    this._disposeMeshes(this.overlayMeshes);
    this.overlayMeshes = null;
  }

  /** @param {THREE.Mesh[]|null|undefined} meshes */
  _disposeMeshes(meshes) {
    if (!meshes?.length) return;
    for (const child of meshes) {
      if (!child.isMesh) continue;
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => mat?.dispose?.());
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
    this._model = null;
  }
}
