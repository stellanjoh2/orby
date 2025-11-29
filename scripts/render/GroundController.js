import * as THREE from 'three';
import {
  PODIUM_TOP_RADIUS_OFFSET,
  PODIUM_SEGMENTS,
  PODIUM_RADIUS_MULTIPLIER,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_MATERIAL_METALNESS,
} from '../constants.js';

const clampScale = (value) => Math.min(3, Math.max(0.5, value));

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

    this.podium = null;
    this.podiumShadow = null;
    this.grid = null;
    this.gridMaterials = null;

    this.buildGroundMeshes();
    this.setSolidEnabled(this.solidEnabled);
    this.setWireEnabled(this.wireEnabled);
  }

  disposeMeshes() {
    if (this.podium) {
      this.scene.remove(this.podium);
      this.podium.geometry.dispose();
      this.podium.material.dispose?.();
      this.podium = null;
    }
    if (this.podiumShadow) {
      this.scene.remove(this.podiumShadow);
      this.podiumShadow.geometry.dispose();
      this.podiumShadow.material.dispose?.();
      this.podiumShadow = null;
    }
    if (this.grid) {
      this.scene.remove(this.grid);
      if (Array.isArray(this.grid.material)) {
        this.grid.material.forEach((mat) => mat?.dispose?.());
      } else {
        this.grid.material?.dispose?.();
      }
      this.grid = null;
      this.gridMaterials = null;
    }
  }

  buildGroundMeshes() {
    this.disposeMeshes();
    const baseRadius = this.podiumBaseRadius * this.podiumScale;
    const height = this.groundHeight;
    const topRadius =
      (this.podiumBaseRadius - PODIUM_TOP_RADIUS_OFFSET) * this.podiumScale;
    const segments = PODIUM_SEGMENTS;

    // Validate dimensions before creating geometry
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
    // Set visibility based on solidEnabled state, not hardcoded false
    this.podium.visible = this.solidEnabled;
    this.scene.add(this.podium);

    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.4 });
    const shadowRadius = baseRadius * PODIUM_RADIUS_MULTIPLIER;
    if (shadowRadius > 0 && isFinite(shadowRadius)) {
      this.podiumShadow = new THREE.Mesh(
        new THREE.CircleGeometry(shadowRadius, segments),
        shadowMat,
      );
      this.podiumShadow.rotation.x = -Math.PI / 2;
      this.podiumShadow.receiveShadow = true;
      // Set visibility based on solidEnabled state, not hardcoded false
      this.podiumShadow.visible = this.solidEnabled;
      this.scene.add(this.podiumShadow);
    }

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
    this.grid.visible = false;
    this.scene.add(this.grid);

    this.setGroundY(this.groundY);
    this.setGridY(this.gridY);
  }

  setSolidEnabled(enabled) {
    this.solidEnabled = !!enabled;
    
    // Ensure podium exists - rebuild if it doesn't
    if (!this.podium) {
      console.warn('[GroundController] Podium mesh does not exist, rebuilding...');
      this.buildGroundMeshes();
    }
    
    // Set visibility
    if (this.podium) {
      this.podium.visible = this.solidEnabled;
    }
    if (this.podiumShadow) {
      this.podiumShadow.visible = this.solidEnabled;
    }
  }

  setWireEnabled(enabled) {
    this.wireEnabled = !!enabled;
    if (this.grid) this.grid.visible = this.wireEnabled;
  }

  setSolidColor(color) {
    if (!color) return;
    this.solidColor = color;
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
    if (this.podiumShadow) {
      this.podiumShadow.position.y = this.groundY - this.groundHeight;
    }
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
    // Use solidEnabled as source of truth, not podium.visible
    const wasVisible = this.solidEnabled;
    const currentColor = this.solidColor;
    const currentGroundY = this.groundY;
    const topFaceY = currentGroundY + this.groundHeight / 2;
    
    // Ensure valid geometry dimensions before rebuilding
    const baseRadius = this.podiumBaseRadius * this.podiumScale;
    const topRadius = (this.podiumBaseRadius - PODIUM_TOP_RADIUS_OFFSET) * this.podiumScale;
    
    // Validate geometry dimensions to prevent invalid meshes
    if (baseRadius <= 0 || topRadius <= 0 || this.groundHeight <= 0) {
      console.warn('Invalid podium dimensions, skipping rebuild');
      return this.groundY;
    }
    
    this.buildGroundMeshes();
    // Restore visibility state using the source of truth
    this.setSolidEnabled(wasVisible);
    this.setSolidColor(currentColor);
    // Restore ground Y position
    this.groundY = topFaceY - this.groundHeight / 2;
    this.setGroundY(this.groundY);
    return this.groundY;
  }

  setGridScale(value) {
    this.gridScale = clampScale(value ?? this.gridScale);
    const wasVisible = this.grid?.visible ?? false;
    this.buildGroundMeshes();
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
}

