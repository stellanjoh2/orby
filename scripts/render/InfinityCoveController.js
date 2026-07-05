import * as THREE from 'three';
import {
  DEFAULT_BACKDROP_METALNESS,
  DEFAULT_BACKDROP_ROUGHNESS,
} from '../constants.js';
import { STUDIO_BACKDROP_SHADOW_REACH_PADDING } from '../config/shadowQuality.js';
import { effectiveRoughnessWithHdriBlur } from './hdriBlur.js';
import {
  applySvgExtrudeSurfaceToMaterial,
  clampSurfaceStrength,
  computeExtrudeSurfaceMappingBounds,
  getSvgExtrudeSurfacePresetConfig,
  removeSvgExtrudeProceduralFromMaterial,
} from './SvgExtrudeSurfaceShader.js';
import {
  DEFAULT_SVG_EXTRUDE_SURFACE_PRESET,
  DEFAULT_SVG_EXTRUDE_SURFACE_SCALE,
  DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH,
} from '../import/extrudeDefaults.js';
import {
  createInfinityCoveGeometry,
  INFINITY_COVE_CURVE_RADIUS,
  INFINITY_COVE_DEFAULT_FLOOR_RADIUS,
} from './infinityCoveGeometry.js';

const _shadowCorner = new THREE.Vector3();
const _shadowBox = new THREE.Box3();
const _restPos = new THREE.Vector3();
const _restEuler = new THREE.Euler();
const _restQuat = new THREE.Quaternion();
const _restScale = new THREE.Vector3();
const _restMatrix = new THREE.Matrix4();

const clampScale = (value) => Math.min(3, Math.max(0.5, value));
const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));
const clampDegrees = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return ((n % 360) + 360) % 360;
};

function disposeObjectGpuResources(root) {
  if (!root) return;
  root.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => m?.dispose?.());
    }
  });
}

/**
 * 360° infinity cove backdrop — same material/transform controls as Studio cyclorama,
 * with lathe geometry (flat floor + bend + vertical wall).
 */
export class InfinityCoveController {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.enabled = !!options.infinityCoveEnabled;
    this.scale = clampScale(options.infinityCoveScale ?? 2);
    this.width = clampScale(options.infinityCoveWidth ?? 2);
    this.color = options.infinityCoveColor ?? '#808080';
    this.rotation = clampDegrees(options.infinityCoveRotation ?? 0);
    this.y = options.infinityCoveY ?? 0;
    this.metalness = clamp01(options.infinityCoveMetalness ?? DEFAULT_BACKDROP_METALNESS);
    this.roughness = clamp01(options.infinityCoveRoughness ?? DEFAULT_BACKDROP_ROUGHNESS);
    this.surfacePreset = options.infinityCoveSurfacePreset ?? DEFAULT_SVG_EXTRUDE_SURFACE_PRESET;
    this.surfaceScale = Number(options.infinityCoveSurfaceScale ?? DEFAULT_SVG_EXTRUDE_SURFACE_SCALE)
      || DEFAULT_SVG_EXTRUDE_SURFACE_SCALE;
    this.surfaceStrength = clampSurfaceStrength(
      options.infinityCoveSurfaceStrength ?? DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH,
    );
    this.onSurfacePresentationSync = options.onSurfacePresentationSync ?? null;
    this.debugWireframeEnabled = !!options.debugWireframeEnabled;

    this._lastEnvTexture = null;
    this._lastHdriIntensity = 1;
    this._lastHdriBlurriness = 0;
    this._animMul = this.enabled ? 1 : 0;
    this._animVisible = !!this.enabled;
    this.mesh = null;

    this.buildMesh();
    this.setEnabled(this.enabled);
  }

  get curveRadius() {
    return INFINITY_COVE_CURVE_RADIUS;
  }

  dispose() {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    disposeObjectGpuResources(this.mesh);
    this.mesh = null;
  }

  buildMesh() {
    this.dispose();
    const geometry = createInfinityCoveGeometry({
      floorRadius: INFINITY_COVE_DEFAULT_FLOOR_RADIUS,
    });
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.color),
      metalness: this.metalness,
      roughness: this.roughness,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.userData.orbyInfinityCove = true;
    this.mesh.userData.orbyInfinityCoveGeomRev = 2;
    this._syncShadowFlags();
    this.scene.add(this.mesh);
    this._applyTransform();
    this.setDebugWireframeEnabled(this.debugWireframeEnabled);
    this._applyMaterial();
  }

  syncEnvironment(envTexture, hdriIntensity, hdriBlurriness = 0) {
    this._lastEnvTexture = envTexture ?? null;
    this._lastHdriIntensity = Math.max(0, hdriIntensity ?? 1);
    this._lastHdriBlurriness = clamp01(hdriBlurriness);
    this._applyMaterial();
  }

  setEnabled(enabled) {
    const wasEnabled = this.enabled;
    this.enabled = !!enabled;
    // Rebuild when turning on so geometry/material fixes apply after toggling off → on.
    if (this.enabled && (!this.mesh || !wasEnabled)) {
      this.buildMesh();
    }
  }

  setY(value) {
    this.y = Number.isFinite(value) ? value : 0;
    this._applyTransform();
  }

  setColor(color) {
    if (!color) return;
    this.color = color;
    if (this.mesh?.material?.color) {
      this.mesh.material.color.set(color);
    }
  }

  setScale(value) {
    this.scale = clampScale(value ?? this.scale);
    this._applyTransform();
  }

  setWidth(value) {
    this.width = clampScale(value ?? this.width);
    this._applyTransform();
  }

  setRotation(value) {
    this.rotation = clampDegrees(value);
    this._applyTransform();
  }

  setMetalness(value) {
    this.metalness = clamp01(value);
    this._applyMaterial();
  }

  setRoughness(value) {
    this.roughness = clamp01(value);
    this._applyMaterial();
  }

  setSurface({ preset, scale, strength } = {}) {
    if (preset !== undefined) this.surfacePreset = preset || 'none';
    if (scale !== undefined) {
      this.surfaceScale = Number(scale) || DEFAULT_SVG_EXTRUDE_SURFACE_SCALE;
    }
    if (strength !== undefined) {
      this.surfaceStrength = clampSurfaceStrength(strength);
    }
    this.applySurface();
    this.onSurfacePresentationSync?.();
  }

  applySurface() {
    const mat = this.mesh?.material;
    if (!mat) return;
    const preset = this.surfacePreset ?? 'none';
    const config = getSvgExtrudeSurfacePresetConfig(preset);
    if (!config || config.kind === 'none') {
      removeSvgExtrudeProceduralFromMaterial(mat);
      return;
    }
    const mappingBounds =
      config.kind === 'normalMap' ? computeExtrudeSurfaceMappingBounds(this.mesh) : null;
    applySvgExtrudeSurfaceToMaterial(mat, {
      preset,
      scale: this.surfaceScale,
      strength: this.surfaceStrength,
      normalBounds: mappingBounds,
    });
  }

  snapToBounds(bounds) {
    if (!bounds || !isFinite(bounds.min.y)) return null;
    const bottomY = bounds.min.y;
    this.setY(bottomY);
    return bottomY;
  }

  setAnimationState(animMul, visible) {
    if (!this.mesh) return;
    this._animMul = Number.isFinite(animMul) ? Math.max(0, animMul) : 1;
    this._animVisible = !!visible;
    this._applyTransform();
  }

  setDebugWireframeEnabled(enabled) {
    this.debugWireframeEnabled = !!enabled;
    if (this.mesh?.material) {
      this.mesh.material.wireframe = this.debugWireframeEnabled;
    }
  }

  getShadowReceiveRadiusFromCenter(center) {
    if (!this.enabled || !this.mesh || !center) return 0;
    const box = this.getRestWorldBox(_shadowBox);
    if (box.isEmpty()) return 0;

    let maxReach = 0;
    const { min, max } = box;
    for (let xi = 0; xi < 2; xi += 1) {
      for (let yi = 0; yi < 2; yi += 1) {
        for (let zi = 0; zi < 2; zi += 1) {
          _shadowCorner.set(
            xi ? max.x : min.x,
            yi ? max.y : min.y,
            zi ? max.z : min.z,
          );
          maxReach = Math.max(maxReach, _shadowCorner.distanceTo(center));
        }
      }
    }
    return maxReach + STUDIO_BACKDROP_SHADOW_REACH_PADDING;
  }

  getRestWorldBox(target = new THREE.Box3()) {
    if (!this.mesh?.geometry) return target.makeEmpty();
    const geom = this.mesh.geometry;
    if (!geom.boundingBox) geom.computeBoundingBox();

    const base = this.mesh.userData?.coveBaseScale ?? this._baseScale();
    _restPos.set(this.mesh.position.x, this.y, this.mesh.position.z);
    _restEuler.set(0, THREE.MathUtils.degToRad(this.rotation), 0);
    _restQuat.setFromEuler(_restEuler);
    _restScale.set(base.x, base.y, base.z);
    _restMatrix.compose(_restPos, _restQuat, _restScale);
    return target.copy(geom.boundingBox).applyMatrix4(_restMatrix);
  }

  _baseScale() {
    const m = Number.isFinite(this._animMul) ? Math.max(0, this._animMul) : 1;
    const sx = this.width * this.scale * m;
    const sy = this.scale * m;
    const sz = this.width * this.scale * m;
    return { x: sx, y: sy, z: sz };
  }

  _syncShadowFlags() {
    if (!this.mesh) return;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
  }

  _applyTransform() {
    if (!this.mesh) return;
    this._syncShadowFlags();
    this.mesh.rotation.y = THREE.MathUtils.degToRad(this.rotation);
    const { x: sx, y: sy, z: sz } = this._baseScale();
    this.mesh.userData.coveBaseScale = { x: sx, y: sy, z: sz };
    this.mesh.scale.set(sx, sy, sz);
    // Floor top is at local y = 0 — anchor scale animation to the stage surface.
    this.mesh.position.y = this.y;
    this.mesh.visible = !!this._animVisible;
  }

  _applyMaterial() {
    const material = this.mesh?.material;
    if (!material) return;
    material.metalness = this.metalness;
    material.roughness = effectiveRoughnessWithHdriBlur(
      this.roughness,
      this._lastHdriBlurriness ?? 0,
    );
    const env = this._lastEnvTexture ?? this.scene.environment ?? null;
    material.envMap = env;
    material.envMapIntensity = Math.max(0, this._lastHdriIntensity ?? 1);
    this.applySurface();
    if (typeof this.onSurfacePresentationSync === 'function') {
      this.onSurfacePresentationSync();
    } else {
      material.needsUpdate = true;
    }
  }
}
