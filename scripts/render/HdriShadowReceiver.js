import * as THREE from 'three';
import { SHADOW_CATCHER_ORTHO_PADDING } from '../config/shadowQuality.js';
import { DEFAULT_SHADOW_OPACITY } from './ShadowTint.js';

/** Base disc diameter before {@link HdriShadowReceiver#_applyMeshScale}; scaled to fit the model. */
const CATCHER_DIAMETER = 320;
const CATCHER_RADIUS = CATCHER_DIAMETER / 2;
const CATCHER_SEGMENTS = 64;
const DEPTH_OFFSET = 0.012;
const SHADOW_Y_LIFT = 0.003;
/** Sit the catcher just under the mesh bottom when geometry sinks below Ground Y. */
const MODEL_BOTTOM_PAD = 0.006;
const AO_RADIUS_PAD = 4;
const MIN_CATCHER_RADIUS = 6;
/** Extra ground reach for low lights / tall subjects (long shadow tails). */
const SHADOW_HEIGHT_STRETCH = 6;
/** Slightly wider than the AO disc so long shadow tails are not clipped at the disc edge. */
const SHADOW_DISC_MARGIN = 1.12;

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

function createFeatheredShadowMaterial(opacity, featherUniforms) {
  const mat = new THREE.ShadowMaterial({
    name: 'HdriShadowReceiverShadow',
    color: 0x000000,
    opacity,
  });
  mat.transparent = true;
  mat.depthWrite = false;
  mat.depthTest = true;
  mat.side = THREE.FrontSide;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -4;
  mat.polygonOffsetUnits = -4;

  const prevOnBeforeCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    if (typeof prevOnBeforeCompile === 'function') {
      prevOnBeforeCompile.call(mat, shader);
    }
    shader.uniforms.uCenterXZ = featherUniforms.uCenterXZ;
    shader.uniforms.uRadius = featherUniforms.uRadius;
    shader.uniforms.uFeather = featherUniforms.uFeather;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vOrbyShadowWorldPos;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
  vOrbyShadowWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <shadowmask_pars_fragment>',
      `#include <shadowmask_pars_fragment>
uniform vec2 uCenterXZ;
uniform float uRadius;
uniform float uFeather;
varying vec3 vOrbyShadowWorldPos;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
      `float orbyDist = length( vOrbyShadowWorldPos.xz - uCenterXZ );
  float orbyMask = smoothstep( uRadius, uRadius - uFeather, orbyDist );
  if ( orbyMask < 0.004 ) discard;
  gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) * orbyMask );`,
    );
  };

  return mat;
}

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
 * - Feathered circular ShadowMaterial disc → key/fill/rim shadows (no square plane)
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

    const discGeo = new THREE.CircleGeometry(CATCHER_RADIUS, CATCHER_SEGMENTS);
    const floorY = this._floorY();

    this._featherUniforms = {
      uCenterXZ: { value: new THREE.Vector2() },
      uRadius: { value: MIN_CATCHER_RADIUS },
      uFeather: { value: 3 },
    };

    this._depthMaterial = createFeatheredDepthMaterial();
    this.aoDepthMesh = new THREE.Mesh(discGeo, this._depthMaterial);
    this.aoDepthMesh.rotation.x = -Math.PI / 2;
    this.aoDepthMesh.position.y = floorY;
    this.aoDepthMesh.receiveShadow = false;
    this.aoDepthMesh.castShadow = false;
    this.aoDepthMesh.frustumCulled = false;
    this.aoDepthMesh.renderOrder = -2;
    this.aoDepthMesh.userData.meshglHdriShadowReceiver = true;
    this.aoDepthMesh.userData.lensflare = 'no-occlusion';

    this._shadowMaterial = createFeatheredShadowMaterial(
      this._shadowOpacity,
      this._featherUniforms,
    );
    this.shadowMesh = new THREE.Mesh(discGeo, this._shadowMaterial);
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
    this._updateFeatherUniforms();
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
    if (this._shadowMaterial) {
      this._shadowMaterial.opacity = next;
      this._shadowMaterial.needsUpdate = true;
    }
  }

  _catcherRadius() {
    const footprintPad = this._modelRadius * 2.1;
    const aoExtent = this._aoRadius * AO_RADIUS_PAD;
    const orthoExtent = this._boundsRadius * SHADOW_CATCHER_ORTHO_PADDING;
    const heightStretch = this._modelHalfHeight * SHADOW_HEIGHT_STRETCH;
    return Math.max(
      MIN_CATCHER_RADIUS,
      footprintPad + aoExtent,
      orthoExtent,
      this._modelRadius + heightStretch,
    );
  }

  _shadowCatcherRadius() {
    return this._catcherRadius() * SHADOW_DISC_MARGIN;
  }

  /** Horizontal radius used to size the directional shadow frustum when this catcher is active. */
  getShadowCatcherRadius() {
    return this._shadowCatcherRadius();
  }

  _featherWidth() {
    return Math.max(2, this._aoRadius * 1.75 + this._modelRadius * 0.35);
  }

  _updateFeatherUniforms() {
    const depthUniforms = this._depthMaterial?.uniforms;
    if (depthUniforms) {
      depthUniforms.uCenterXZ.value.set(this._center.cx, this._center.cz);
      depthUniforms.uRadius.value = this._catcherRadius();
      depthUniforms.uFeather.value = this._featherWidth();
    }
    if (this._featherUniforms) {
      this._featherUniforms.uCenterXZ.value.set(this._center.cx, this._center.cz);
      this._featherUniforms.uRadius.value = this._shadowCatcherRadius();
      this._featherUniforms.uFeather.value = this._featherWidth();
    }
  }

  _applyMeshScale() {
    const aoScale = (this._catcherRadius() * 2) / CATCHER_DIAMETER;
    const shadowScale = (this._shadowCatcherRadius() * 2) / CATCHER_DIAMETER;
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
    this._updateFeatherUniforms();
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
        const modelBottomY = box.min.y;
        // Never place the catcher above the studio ground / podium top — it used to follow a
        // sinking mesh and bleed a square ShadowMaterial slab through the base.
        const maxReceiverY = this.groundY - MODEL_BOTTOM_PAD;
        this._placementGroundY = Math.min(
          maxReceiverY,
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
      this.shadowMesh.receiveShadow = active;
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
    this._shadowMaterial?.dispose();
    this.group = null;
    this.aoDepthMesh = null;
    this.shadowMesh = null;
    this._depthMaterial = null;
  }
}
