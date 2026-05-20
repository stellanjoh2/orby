import * as THREE from 'three';
import { DEFAULT_SHADOW_OPACITY } from './ShadowTint.js';

/** Base plane size before {@link HdriShadowReceiver#_applyMeshScale}; scaled to fit the model. */
const CATCHER_SIZE = 320;
const DEPTH_OFFSET = 0.012;
const SHADOW_Y_LIFT = 0.003;
/** Sit the catcher just under the mesh bottom when geometry sinks below Ground Y. */
const MODEL_BOTTOM_PAD = 0.006;
const AO_RADIUS_PAD = 4;
const MIN_CATCHER_RADIUS = 6;
/** ≥ {@link LightsController} ortho padding so the catcher covers the shadow frustum. */
const SHADOW_ORTHO_PADDING = 2.8;
/** Extra ground reach for low lights / tall subjects (long shadow tails). */
const SHADOW_HEIGHT_STRETCH = 6;
/** ShadowMaterial plane extends past the AO disc so long tails are not square-clipped. */
const SHADOW_PLANE_MARGIN = 1.5;

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
    /** World Y for catcher meshes — may drop with model bottom when feet clip through groundY. */
    this._placementGroundY = this.groundY;
    this._shadowOpacity =
      typeof options.shadowOpacity === 'number'
        ? options.shadowOpacity
        : DEFAULT_SHADOW_OPACITY;
    this._aoRadius = 1;
    this._center = { cx: 0, cz: 0 };
    this._modelRadius = 1;
    this._boundsRadius = 1;
    this._modelHalfHeight = 0.5;

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
    this.shadowMesh.position.y = this._shadowY();
    this.shadowMesh.receiveShadow = true;
    this.shadowMesh.castShadow = false;
    this.shadowMesh.frustumCulled = false;
    // Below the mesh (0) so depth-tested feet occlude the plane — avoids a black outline when
    // geometry clips through the catcher (rendering the plane on top looked cartoony).
    this.shadowMesh.renderOrder = -1;
    this.shadowMesh.userData.meshglHdriShadowReceiver = true;
    this.shadowMesh.userData.lensflare = 'no-occlusion';

    this.group.add(this.aoDepthMesh, this.shadowMesh);
    this.group.visible = false;
    this.scene.add(this.group);

    this._applyPlacement();
    this._syncVisibility();
  }

  _floorY() {
    return this._placementGroundY - DEPTH_OFFSET;
  }

  _shadowY() {
    return this._placementGroundY - DEPTH_OFFSET + SHADOW_Y_LIFT;
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
    this._applyMeshScale();
    this._updateDepthUniforms();
  }

  setGroundY(value) {
    this.groundY = value ?? 0;
    this._placementGroundY = this.groundY;
    this._applyFloorHeights();
  }

  _applyFloorHeights() {
    const floorY = this._floorY();
    this.aoDepthMesh.position.y = floorY;
    this.shadowMesh.position.y = this._shadowY();
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
    const footprintPad = this._modelRadius * 2.1;
    const aoExtent = this._aoRadius * AO_RADIUS_PAD;
    const orthoExtent = this._boundsRadius * SHADOW_ORTHO_PADDING;
    const heightStretch = this._modelHalfHeight * SHADOW_HEIGHT_STRETCH;
    return Math.max(
      MIN_CATCHER_RADIUS,
      footprintPad + aoExtent,
      orthoExtent,
      this._modelRadius + heightStretch,
    );
  }

  /** Wider than {@link #_catcherRadius} — ShadowMaterial square, long diagonal tails. */
  _shadowCatcherRadius() {
    return this._catcherRadius() * SHADOW_PLANE_MARGIN;
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

  _applyMeshScale() {
    const aoScale = (this._catcherRadius() * 2) / CATCHER_SIZE;
    const shadowScale = (this._shadowCatcherRadius() * 2) / CATCHER_SIZE;
    this.aoDepthMesh.scale.set(aoScale, 1, aoScale);
    this.shadowMesh.scale.set(shadowScale, 1, shadowScale);
  }

  _applyPlacement() {
    const { cx, cz } = this._center;
    this.aoDepthMesh.position.x = cx;
    this.aoDepthMesh.position.z = cz;
    this.shadowMesh.position.x = cx;
    this.shadowMesh.position.z = cz;
    this._applyMeshScale();
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

    let boundsRadius = 1;
    let modelHalfHeight = 0.5;

    if (modelRoot) {
      const box = new THREE.Box3().setFromObject(modelRoot);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        cx = center.x;
        cz = center.z;
        modelRadius = Math.max(0.35, Math.max(size.x, size.z) * 0.5);
        boundsRadius = Math.max(0.35, size.length() * 0.5);
        modelHalfHeight = Math.max(0.1, size.y * 0.5);
        // Keep the catcher under the lowest geometry so it does not intersect the mesh.
        const modelBottomY = box.min.y;
        this._placementGroundY = Math.min(
          this.groundY,
          modelBottomY - MODEL_BOTTOM_PAD,
        );
      }
    } else {
      this._placementGroundY = this.groundY;
    }

    this._center = { cx, cz };
    this._modelRadius = modelRadius;
    this._boundsRadius = boundsRadius;
    this._modelHalfHeight = modelHalfHeight;
    this._applyFloorHeights();
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
