import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js';
import {
  PODIUM_TOP_RADIUS_OFFSET,
  PODIUM_SEGMENTS,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_MATERIAL_METALNESS,
  PODIUM_PRESET_DEFAULT,
  PODIUM_PRESET_DESERT,
  DESERT_PODIUM_GLB_URL,
} from '../constants.js';

const clampScale = (value) => Math.min(3, Math.max(0.5, value));

function disposeObjectGpuResources(root) {
  if (!root) return;
  root.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        if (!m) return;
        m.dispose?.();
      });
    }
  });
}

export class GroundController {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.solidEnabled = options.solidEnabled ?? false;
    this.wireEnabled = options.wireEnabled ?? false;
    this.solidColor = options.solidColor ?? '#31363f';
    this.wireColor = options.wireColor ?? '#e1e1e1';
    this.wireOpacity = options.wireOpacity ?? 1.0;
    this.groundY = options.groundY ?? 0;
    this.gridY = options.gridY ?? 0;
    this.podiumScale = clampScale(options.podiumScale ?? 1);
    this.gridScale = clampScale(options.gridScale ?? 1);
    this.groundHeight = options.groundHeight ?? 0.1;
    this.podiumBaseRadius = 2;

    this.podiumPreset = PODIUM_PRESET_DEFAULT;
    this.podiumRotationY = THREE.MathUtils.degToRad(options.podiumRotation ?? 0);

    this.podium = null;
    /** Horizontal extent (max of X/Z size) after centering & top alignment, before uniform podium scale. */
    this.customFlatExtent = 0;

    this.grid = null;
    this.gridMaterials = null;

    this.gltfLoader = new GLTFLoader();
    this._podiumLoadToken = 0;

    this.buildGrid();
    this.buildDefaultPodium();
    this.setSolidEnabled(this.solidEnabled);
    this.setWireEnabled(this.wireEnabled);
  }

  disposePodium() {
    if (!this.podium) {
      this.customFlatExtent = 0;
      return;
    }
    this.scene.remove(this.podium);
    disposeObjectGpuResources(this.podium);
    this.podium = null;
    this.customFlatExtent = 0;
  }

  disposeGrid() {
    if (!this.grid) return;
    this.scene.remove(this.grid);
    if (Array.isArray(this.grid.material)) {
      this.grid.material.forEach((mat) => mat?.dispose?.());
    } else {
      this.grid.material?.dispose?.();
    }
    this.grid = null;
    this.gridMaterials = null;
  }

  disposeMeshes() {
    this.disposePodium();
    this.disposeGrid();
  }

  buildDefaultPodium() {
    this.disposePodium();
    this.podiumPreset = PODIUM_PRESET_DEFAULT;
    this.customFlatExtent = 0;

    const baseRadius = this.podiumBaseRadius * this.podiumScale;
    const height = this.groundHeight;
    const topRadius =
      (this.podiumBaseRadius - PODIUM_TOP_RADIUS_OFFSET) * this.podiumScale;
    const segments = PODIUM_SEGMENTS;

    if (baseRadius <= 0 || topRadius <= 0 || height <= 0 || !isFinite(baseRadius) || !isFinite(topRadius) || !isFinite(height)) {
      console.error('Invalid podium geometry dimensions:', { baseRadius, topRadius, height, scale: this.podiumScale });
      return;
    }

    const podiumGeo = new THREE.CylinderGeometry(
      topRadius,
      baseRadius,
      height,
      segments,
      1,
      false,
    );
    podiumGeo.translate(0, -height / 2, 0);

    const solidMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.solidColor),
      roughness: DEFAULT_MATERIAL_ROUGHNESS,
      metalness: DEFAULT_MATERIAL_METALNESS,
    });

    this.podium = new THREE.Mesh(podiumGeo, solidMat);
    this.podium.receiveShadow = true;
    this.podium.rotation.y = this.podiumRotationY;
    this.podium.visible = this.solidEnabled;
    this.scene.add(this.podium);

    this.setGroundY(this.groundY);
  }

  buildGrid() {
    this.disposeGrid();
    const baseRadius = this.podiumBaseRadius * this.podiumScale;
    this.grid = new THREE.GridHelper(
      baseRadius * 2 * this.gridScale,
      32,
      this.wireColor,
      this.wireColor,
    );
    this.gridMaterials = Array.isArray(this.grid.material)
      ? this.grid.material
      : [this.grid.material];
    this.gridMaterials.forEach((mat) => {
      if (!mat) return;
      mat.transparent = true;
      mat.opacity = this.wireOpacity;
      mat.depthWrite = false;
      mat.toneMapped = false;
      if (mat.color) mat.color.set(this.wireColor);
    });
    this.grid.visible = this.wireEnabled;
    this.scene.add(this.grid);
    this.setGridY(this.gridY);
  }

  /**
   * @param {string} preset 'default' | 'desert'
   */
  async setPodiumPreset(preset) {
    const next = preset === PODIUM_PRESET_DESERT ? PODIUM_PRESET_DESERT : PODIUM_PRESET_DEFAULT;
    const isCylinderPodium = this.podium instanceof THREE.Mesh;
    if (next === PODIUM_PRESET_DEFAULT && this.podiumPreset === PODIUM_PRESET_DEFAULT && isCylinderPodium) {
      return false;
    }
    if (
      next === PODIUM_PRESET_DESERT &&
      this.podiumPreset === PODIUM_PRESET_DESERT &&
      !isCylinderPodium &&
      this.customFlatExtent > 0
    ) {
      return false;
    }

    const token = ++this._podiumLoadToken;

    if (next === PODIUM_PRESET_DEFAULT) {
      this.podiumPreset = next;
      const wasVisible = this.solidEnabled;
      const currentColor = this.solidColor;
      const currentGroundY = this.groundY;
      const wasCustom = this.customFlatExtent > 0;

      this.buildDefaultPodium();
      this.setSolidEnabled(wasVisible);
      this.setSolidColor(currentColor);
      if (wasCustom) {
        this.groundY = currentGroundY;
      } else {
        const topFaceY = currentGroundY + this.groundHeight / 2;
        this.groundY = topFaceY - this.groundHeight / 2;
      }
      this.setGroundY(this.groundY);
      return true;
    }

    this.podiumPreset = next;
    this.disposePodium();

    let gltf;
    try {
      gltf = await new Promise((resolve, reject) => {
        this.gltfLoader.load(DESERT_PODIUM_GLB_URL, resolve, undefined, reject);
      });
    } catch (err) {
      console.error('[GroundController] Desert podium load failed:', err);
      this.podiumPreset = PODIUM_PRESET_DEFAULT;
      this.buildDefaultPodium();
      this.setSolidEnabled(this.solidEnabled);
      throw err;
    }

    if (token !== this._podiumLoadToken) return false;

    const content = gltf.scene;
    const box = new THREE.Box3().setFromObject(content);
    if (box.isEmpty()) {
      console.error('[GroundController] Desert podium has empty bounds');
      this.podiumPreset = PODIUM_PRESET_DEFAULT;
      this.buildDefaultPodium();
      this.setSolidEnabled(this.solidEnabled);
      return true;
    }

    const center = box.getCenter(new THREE.Vector3());
    content.position.x -= center.x;
    content.position.z -= center.z;
    content.position.y -= box.max.y;

    const box2 = new THREE.Box3().setFromObject(content);
    const size = box2.getSize(new THREE.Vector3());
    const flatExtent = Math.max(size.x, size.z, 1e-6);

    const wrapper = new THREE.Group();
    wrapper.add(content);
    wrapper.rotation.y = this.podiumRotationY;

    const targetDiameter = 2 * this.podiumBaseRadius * this.podiumScale;
    wrapper.scale.setScalar(targetDiameter / flatExtent);
    this.customFlatExtent = flatExtent;

    content.traverse((child) => {
      if (child.isMesh) {
        child.receiveShadow = true;
      }
    });

    this.podium = wrapper;
    this.podium.visible = this.solidEnabled;
    this.scene.add(this.podium);
    this.setGroundY(this.groundY);
    this.rebuildGridKeepingWireState();
    return true;
  }

  /**
   * @param {number} degrees 0–360
   */
  setPodiumRotation(degrees) {
    const deg = ((Number(degrees) || 0) % 360 + 360) % 360;
    this.podiumRotationY = THREE.MathUtils.degToRad(deg);
    if (this.podium) this.podium.rotation.y = this.podiumRotationY;
  }

  setSolidEnabled(enabled) {
    this.solidEnabled = !!enabled;

    if (!this.podium) {
      console.warn('[GroundController] Podium missing, rebuilding default…');
      this.buildDefaultPodium();
    }

    if (this.podium) {
      this.podium.visible = this.solidEnabled;
    }
  }

  setWireEnabled(enabled) {
    this.wireEnabled = !!enabled;
    if (this.grid) this.grid.visible = this.wireEnabled;
  }

  setSolidColor(color) {
    if (!color) return;
    this.solidColor = color;
    if (this.podiumPreset !== PODIUM_PRESET_DEFAULT) return;
    if (this.podium?.material?.color) {
      this.podium.material.color.set(color);
    }
  }

  setWireColor(color) {
    if (!color) return;
    this.wireColor = color;
    if (this.gridMaterials) {
      this.gridMaterials.forEach((mat) => {
        if (mat?.color) mat.color.set(color);
      });
    }
  }

  setWireOpacity(value) {
    this.wireOpacity = value ?? this.wireOpacity;
    if (this.gridMaterials) {
      this.gridMaterials.forEach((mat) => {
        if (mat) mat.opacity = this.wireOpacity;
      });
    }
  }

  setGroundY(value) {
    this.groundY = value ?? 0;
    if (this.podium) this.podium.position.y = this.groundY;
  }

  setGridY(value) {
    this.gridY = value ?? 0;
    if (this.grid) this.grid.position.y = this.gridY;
  }

  snapPodiumToBounds(bounds) {
    if (!bounds || !isFinite(bounds.min.y)) return null;
    const bottomY = bounds.min.y;
    this.setGroundY(bottomY);
    return bottomY;
  }

  snapGridToBounds(bounds) {
    if (!bounds || !isFinite(bounds.min.y)) return null;
    const bottomY = bounds.min.y;
    this.setGridY(bottomY);
    return bottomY;
  }

  setPodiumScale(value) {
    this.podiumScale = clampScale(value ?? this.podiumScale);

    if (this.podiumPreset === PODIUM_PRESET_DESERT && this.podium && this.customFlatExtent > 0) {
      const targetDiameter = 2 * this.podiumBaseRadius * this.podiumScale;
      this.podium.scale.setScalar(targetDiameter / this.customFlatExtent);
      this.rebuildGridKeepingWireState();
      return this.groundY;
    }

    const wasVisible = this.solidEnabled;
    const currentColor = this.solidColor;
    const currentGroundY = this.groundY;
    const topFaceY = currentGroundY + this.groundHeight / 2;

    const baseRadius = this.podiumBaseRadius * this.podiumScale;
    const topRadius = (this.podiumBaseRadius - PODIUM_TOP_RADIUS_OFFSET) * this.podiumScale;

    if (baseRadius <= 0 || topRadius <= 0 || this.groundHeight <= 0) {
      console.warn('Invalid podium dimensions, skipping rebuild');
      return this.groundY;
    }

    this.buildDefaultPodium();
    this.setSolidEnabled(wasVisible);
    this.setSolidColor(currentColor);
    this.groundY = topFaceY - this.groundHeight / 2;
    this.setGroundY(this.groundY);

    this.rebuildGridKeepingWireState();
    return this.groundY;
  }

  rebuildGridKeepingWireState() {
    const wasVisible = this.wireEnabled;
    this.disposeGrid();
    this.buildGrid();
    this.setWireEnabled(wasVisible);
  }

  setGridScale(value) {
    this.gridScale = clampScale(value ?? this.gridScale);
    const wasVisible = this.wireEnabled;
    this.disposeGrid();
    this.buildGrid();
    this.setWireEnabled(wasVisible);
  }

  getSolidColor() {
    return this.solidColor;
  }

  getGroundY() {
    return this.groundY;
  }

  getGridY() {
    return this.gridY;
  }

  getPodiumScale() {
    return this.podiumScale;
  }

  getGridScale() {
    return this.gridScale;
  }

  getPodiumPreset() {
    return this.podiumPreset;
  }
}
