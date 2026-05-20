import * as THREE from 'three';
import { DEFAULT_SHADOW_OPACITY } from './ShadowTint.js';

/** Wide invisible catcher; radial depth feather avoids a hard square AO cutoff. */
const CATCHER_SIZE = 320;
const DEPTH_OFFSET = 0.012;
const SHADOW_Y_LIFT = 0.003;
const AO_RADIUS_PAD = 4;
const MIN_CATCHER_RADIUS = 6;

const FEATHER_DEPTH_VERT = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FEATHER_DEPTH_FRAG = /* glsl */ `
varying vec3 vWorldPos;
uniform vec2 uCenterXZ;
uniform float uRadius;
uniform float uFeather;
void main() {
  float dist = length(vWorldPos.xz - uCenterXZ);
  float fade = smoothstep(uRadius, uRadius - uFeather, dist);
  if (fade < 0.004) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
`;

function createFeatheredDepthMaterial() {
  return new THREE.ShaderMaterial({
    name: 'HdriShadowReceiverDepth',
    uniforms: {
      uCenterXZ: { value: new THREE.Vector2() },
      uRadius: { value: MIN_CATCHER_RADIUS },
      uFeather: { value: 3 },
    },
    vertexShader: FEATHER_DEPTH_VERT,
    fragmentShader: FEATHER_DEPTH_FRAG,
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    // Plane normal points up (+Y); only the top face exists so views from below the floor
    // do not write depth and cannot occlude the model.
    side: THREE.FrontSide,
  });
}

/**
 * Invisible HDRI floor catcher:
 * - Feathered depth disc → N8AO contact on the backdrop
 * - ShadowMaterial on a wide plane → directional shadows when 3-point lights cast
 */
export class HdriShadowReceiver {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.receiveShadowsAo = false;
    this.hdriBackgroundEnabled = false;
    this.hdriEnabled = false;
    this.groundSolid = false;
    this.groundY = options.groundY ?? 0;
    this._shadowOpacity =
      typeof options.shadowOpacity === 'number'
        ? options.shadowOpacity
        : DEFAULT_SHADOW_OPACITY;
    this._aoRadius = 1;
    this._center = { cx: 0, cz: 0 };
    this._modelRadius = 1;

    this.group = new THREE.Group();
    this.group.userData.meshglHdriShadowReceiver = true;

    const planeGeo = new THREE.PlaneGeometry(CATCHER_SIZE, CATCHER_SIZE);
    const floorY = this._floorY();

    this._depthMaterial = createFeatheredDepthMaterial();
    this.aoDepthMesh = new THREE.Mesh(planeGeo, this._depthMaterial);
    this.aoDepthMesh.rotation.x = -Math.PI / 2;
    this.aoDepthMesh.position.y = floorY;
    this.aoDepthMesh.receiveShadow = false;
    this.aoDepthMesh.castShadow = false;
    this.aoDepthMesh.frustumCulled = false;
    this.aoDepthMesh.renderOrder = -2;
    this.aoDepthMesh.userData.meshglHdriShadowReceiver = true;
    this.aoDepthMesh.userData.lensflare = 'no-occlusion';

    const shadowMat = new THREE.ShadowMaterial({
      color: 0x000000,
      opacity: this._shadowOpacity,
    });
    shadowMat.transparent = true;
    shadowMat.depthWrite = false;
    shadowMat.depthTest = true;
    shadowMat.side = THREE.FrontSide;
    shadowMat.polygonOffset = true;
    shadowMat.polygonOffsetFactor = -4;
    shadowMat.polygonOffsetUnits = -4;
    this.shadowMesh = new THREE.Mesh(planeGeo, shadowMat);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.y = floorY + SHADOW_Y_LIFT;
    this.shadowMesh.receiveShadow = true;
    this.shadowMesh.castShadow = false;
    this.shadowMesh.frustumCulled = false;
    this.shadowMesh.renderOrder = 2;
    this.shadowMesh.userData.meshglHdriShadowReceiver = true;
    this.shadowMesh.userData.lensflare = 'no-occlusion';

    this.group.add(this.aoDepthMesh, this.shadowMesh);
    this.group.visible = false;
    this.scene.add(this.group);

    this._applyPlacement();
    this._syncVisibility();
  }

  _floorY() {
    return this.groundY - DEPTH_OFFSET;
  }

  isActive() {
    return (
      this.receiveShadowsAo
      && this.hdriBackgroundEnabled
      && this.hdriEnabled
      && !this.groundSolid
    );
  }

  shouldTrackModelEachFrame() {
    return this.isActive();
  }

  setReceiveShadowsAoEnabled(enabled) {
    this.receiveShadowsAo = !!enabled;
    this._syncVisibility();
  }

  setHdriBackgroundEnabled(enabled) {
    this.hdriBackgroundEnabled = !!enabled;
    this._syncVisibility();
  }

  setHdriEnabled(enabled) {
    this.hdriEnabled = !!enabled;
    this._syncVisibility();
  }

  setGroundSolid(enabled) {
    this.groundSolid = !!enabled;
    this._syncVisibility();
  }

  setAoRadius(radius) {
    const raw = Number(radius);
    this._aoRadius = Number.isFinite(raw) ? Math.max(0.1, raw) : 1;
    this._updateDepthUniforms();
  }

  setGroundY(value) {
    this.groundY = value ?? 0;
    const floorY = this._floorY();
    this.aoDepthMesh.position.y = floorY;
    this.shadowMesh.position.y = floorY + SHADOW_Y_LIFT;
  }

  setShadowOpacity(opacity) {
    const raw = Number(opacity);
    const next = Number.isFinite(raw)
      ? Math.min(1, Math.max(0, raw))
      : DEFAULT_SHADOW_OPACITY;
    this._shadowOpacity = next;
    if (this.shadowMesh?.material) {
      this.shadowMesh.material.opacity = next;
      this.shadowMesh.material.needsUpdate = true;
    }
  }

  _catcherRadius() {
    const modelPad = this._modelRadius * 1.85;
    const aoExtent = this._aoRadius * AO_RADIUS_PAD;
    return Math.max(MIN_CATCHER_RADIUS, modelPad + aoExtent);
  }

  _featherWidth() {
    return Math.max(2, this._aoRadius * 1.75 + this._modelRadius * 0.35);
  }

  _updateDepthUniforms() {
    const uniforms = this._depthMaterial?.uniforms;
    if (!uniforms) return;
    uniforms.uCenterXZ.value.set(this._center.cx, this._center.cz);
    uniforms.uRadius.value = this._catcherRadius();
    uniforms.uFeather.value = this._featherWidth();
  }

  _applyPlacement() {
    const { cx, cz } = this._center;
    this.aoDepthMesh.position.x = cx;
    this.aoDepthMesh.position.z = cz;
    this.shadowMesh.position.x = cx;
    this.shadowMesh.position.z = cz;
    this._updateDepthUniforms();
  }

  /**
   * @param {THREE.Object3D | null} modelRoot
   */
  updateFromModel(modelRoot) {
    if (!this.isActive()) return;

    let cx = 0;
    let cz = 0;
    let modelRadius = 1;

    if (modelRoot) {
      const box = new THREE.Box3().setFromObject(modelRoot);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        cx = center.x;
        cz = center.z;
        modelRadius = Math.max(0.35, Math.max(size.x, size.z) * 0.5);
      }
    }

    this._center = { cx, cz };
    this._modelRadius = modelRadius;
    this._applyPlacement();
  }

  _syncVisibility() {
    if (!this.group) return;
    const active = this.isActive();
    this.group.visible = active;
    if (this.shadowMesh) {
      this.shadowMesh.visible = active;
    }
    if (this.aoDepthMesh) {
      this.aoDepthMesh.visible = active;
    }
  }

  dispose() {
    if (!this.group) return;
    this.scene.remove(this.group);
    this.aoDepthMesh?.geometry?.dispose();
    this.shadowMesh?.geometry?.dispose();
    this._depthMaterial?.dispose();
    this.shadowMesh?.material?.dispose();
    this.group = null;
    this.aoDepthMesh = null;
    this.shadowMesh = null;
    this._depthMaterial = null;
  }
}
