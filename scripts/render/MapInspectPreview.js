import * as THREE from 'three';
import { createMapChannelPreviewMaterial } from './mapInspectChannelMaterial.js';
import {
  getOrmChannelForMaterialSlot,
  mapInspectPreviewProp,
} from './mapInspectTypes.js';

/**
 * Temporary per-channel material swap for Object → Maps click-pinned preview.
 * Restores whatever materials were active before preview (shaded clones, wireframe, etc.).
 */
export class MapInspectPreview {
  /**
   * @param {import('./MaterialController.js').MaterialController} materialController
   */
  constructor(materialController) {
    this.materialController = materialController;
    /** @type {string | null} */
    this.activeSlot = null;
    /** @type {WeakMap<import('three').Mesh, import('three').Material | import('three').Material[]>} */
    this._savedMaterials = new WeakMap();
    /** @type {import('three').Material[]} */
    this._createdMaterials = [];
  }

  /**
   * @param {string | null | undefined} slotId
   */
  preview(slotId) {
    const id = typeof slotId === 'string' ? slotId : null;
    if (!id || id === 'viewMaps') {
      this.clear();
      return;
    }

    if (this.activeSlot === id) return;

    this.clear();

    const mc = this.materialController;
    const model = mc?.currentModel;
    if (!model) return;

    const prop = mapInspectPreviewProp(id);
    if (!prop) return;

    model.traverse((child) => {
      if (!child.isMesh || mc.isWindowMesh(child)) return;

      const original = mc.originalMaterials.get(child);
      if (!original) return;

      this._savedMaterials.set(child, child.material);
      const deform = this._resolveMeshDeformFlags(child);

      const buildOne = (mat, idx) => {
        const previewMat = this._buildPreviewMaterial(mat, id, prop, deform);
        if (!previewMat) {
          const current = child.material;
          return Array.isArray(current) ? current[idx] : current;
        }
        this._createdMaterials.push(previewMat);
        return previewMat;
      };

      if (Array.isArray(original)) {
        child.material = original.map((mat, idx) => buildOne(mat, idx));
      } else {
        child.material = buildOne(original, 0);
      }
    });

    this.activeSlot = id;
  }

  clear() {
    const hadPreview = !!this.activeSlot;
    const mc = this.materialController;
    const model = mc?.currentModel;
    if (model) {
      model.traverse((child) => {
        if (!child.isMesh || !this._savedMaterials.has(child)) return;
        child.material = this._savedMaterials.get(child);
        this._savedMaterials.delete(child);
      });
    }

    this._createdMaterials.forEach((mat) => mat?.dispose?.());
    this._createdMaterials = [];
    this.activeSlot = null;

    // Sliders still update materialSettings while preview is pinned; apply to restored clones.
    if (hadPreview && mc) {
      mc.updateMaterials();
    }
  }

  /**
   * @param {import('three').Mesh} mesh
   * @returns {{ skinning: boolean, morphTargets: boolean }}
   */
  _resolveMeshDeformFlags(mesh) {
    const geom = mesh.geometry;
    return {
      skinning:
        mesh.isSkinnedMesh ||
        !!geom?.attributes?.skinIndex ||
        !!geom?.attributes?.skinWeight,
      morphTargets: !!mesh.morphTargetInfluences?.length,
    };
  }

  /**
   * @param {import('three').Material | null | undefined} originalMat
   * @param {string} slotId
   * @param {string} prop
   * @param {{ skinning?: boolean, morphTargets?: boolean }} deform
   * @returns {import('three').Material | null}
   */
  _buildPreviewMaterial(originalMat, slotId, prop, deform = {}) {
    if (!originalMat) return null;

    const tex = originalMat[prop];
    if (!tex?.isTexture) return null;

    const side = originalMat.side ?? THREE.FrontSide;
    const transparent = originalMat.transparent ?? false;
    const opacity = Number.isFinite(originalMat.opacity) ? originalMat.opacity : 1;
    const channel = getOrmChannelForMaterialSlot(originalMat, slotId);

    const deformOpts = {
      skinning: !!deform.skinning,
      morphTargets: !!deform.morphTargets,
    };

    if (channel) {
      return createMapChannelPreviewMaterial(tex, channel, {
        side,
        transparent,
        opacity,
        ...deformOpts,
      });
    }

    if (prop === 'map') {
      const color = originalMat.color?.isColor ? originalMat.color.clone() : new THREE.Color('#ffffff');
      return new THREE.MeshBasicMaterial({
        map: tex,
        color,
        side,
        transparent,
        opacity,
        ...deformOpts,
      });
    }

    return new THREE.MeshBasicMaterial({
      map: tex,
      color: 0xffffff,
      side,
      transparent,
      opacity,
      ...deformOpts,
    });
  }
}
