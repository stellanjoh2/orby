import * as THREE from 'three';
import { VertexNormalsHelper } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/helpers/VertexNormalsHelper.js';
import {
  NORMALS_HELPER_SIZE,
  NORMALS_HELPER_COLOR,
} from '../constants.js';

export class MeshDiagnosticsController {
  constructor({ scene, modelRoot, ui }) {
    this.scene = scene;
    this.modelRoot = modelRoot;
    this.ui = ui;

    this.normalsHelpers = [];
    this.boneHelpers = [];
    this.lastBoneToastTime = 0;
    this.currentModel = null;
    this.currentShading = null;
  }

  setModel(model, shading) {
    this.currentModel = model;
    this.currentShading = shading;
    this.clearAll();
  }

  clearAll() {
    this.clearNormals();
    this.clearBoneHelpers();
  }

  toggleNormals(enabled) {
    this.clearNormals();
    if (!enabled || !this.currentModel) return;

    this.currentModel.traverse((child) => {
      if (child.isMesh) {
        const helper = new VertexNormalsHelper(
          child,
          NORMALS_HELPER_SIZE,
          NORMALS_HELPER_COLOR,
        );
        this.modelRoot.add(helper);
        this.normalsHelpers.push(helper);
      }
    });
  }

  clearNormals() {
    this.normalsHelpers.forEach((helper) => this.modelRoot.remove(helper));
    this.normalsHelpers = [];
  }

  refreshBoneHelpers(shading) {
    this.clearBoneHelpers();
    if (!this.currentModel || shading !== 'wireframe') {
      return;
    }

    let found = false;
    this.currentModel.traverse((child) => {
      if (child.isSkinnedMesh && child.skeleton) {
        const helper = new THREE.SkeletonHelper(child);
        helper.material.depthTest = false;
        helper.material.color.set('#66ccff');
        this.scene.add(helper);
        this.boneHelpers.push(helper);
        found = true;
      }
    });

    if (!found) {
      const now = performance.now();
      if (now - this.lastBoneToastTime > 2000) {
        this.ui?.showToast?.('No bones/skeleton detected in this mesh');
        this.lastBoneToastTime = now;
      }
    }
  }

  clearBoneHelpers() {
    this.boneHelpers.forEach((helper) => {
      this.scene.remove(helper);
      helper.dispose?.();
    });
    this.boneHelpers = [];
  }

  update(delta) {
    this.boneHelpers.forEach((helper) => helper.update?.());
  }

  calculateStats(object, file, gltfMetadata, modelBounds) {
    const stats = {
      triangles: 0,
      vertices: 0,
      materials: new Set(),
      textures: new Set(),
    };

    object.traverse((child) => {
      if (child.isMesh) {
        const geometry = child.geometry;
        if (!geometry) return;

        const position = geometry.attributes.position;
        if (geometry.index) {
          stats.triangles += geometry.index.count / 3;
        } else if (position) {
          stats.triangles += position.count / 3;
        }

        if (position) {
          stats.vertices += position.count;
        }

        const material = child.material;
        if (Array.isArray(material)) {
          material.forEach((mat) => mat && stats.materials.add(mat.uuid));
        } else if (material) {
          stats.materials.add(material.uuid);
        }

        const registerTexture = (map) => map && stats.textures.add(map.uuid);
        if (material) {
          registerTexture(material.map);
          registerTexture(material.normalMap);
          registerTexture(material.roughnessMap);
          registerTexture(material.metalnessMap);
          registerTexture(material.emissiveMap);
          registerTexture(material.alphaMap);
        }
      }
    });

    const fileSize =
      file?.size != null ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : '—';

    let boundsText = '—';
    if (modelBounds?.size) {
      const { size } = modelBounds;
      boundsText = `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`;
    }

    return {
      triangles: Math.round(stats.triangles),
      vertices: Math.round(stats.vertices),
      materials: stats.materials.size,
      textures: stats.textures.size,
      fileSize,
      bounds: boundsText,
      assetName:
        gltfMetadata?.assetName ||
        file?.name?.replace(/\.[^/.]+$/, '') ||
        '—',
      generator: gltfMetadata?.generator || '—',
      version: gltfMetadata?.version || '—',
      copyright: gltfMetadata?.copyright || '—',
    };
  }
}

