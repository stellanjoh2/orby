import * as THREE from 'three';
import { Reflector } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/objects/Reflector.js';
import { LineSegments2 } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/lines/LineMaterial.js';
import {
  PODIUM_TOP_RADIUS_OFFSET,
  PODIUM_SEGMENTS,
  PODIUM_BEVEL_EDGE_SEGMENTS,
  PODIUM_REFLECTOR_Y_EPS,
  PODIUM_REFLECTOR_RADIUS_SCALE,
  PODIUM_REFLECTOR_RES_SCALE,
  DEFAULT_BASE_GLASS_BLUR,
  DEFAULT_BASE_GLASS_AMOUNT,
  DEFAULT_BASE_GLASS_BRIGHTNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_MATERIAL_METALNESS,
  DEFAULT_BACKDROP_METALNESS,
  DEFAULT_BACKDROP_ROUGHNESS,
  ORBY_LIME,
  DEFAULT_GRID_LINE_WIDTH,
  DEFAULT_GROUND_WIRE_COLOR,
  DEFAULT_GROUND_WIRE_OPACITY,
  clampGridLineWidth,
  resolveViewportGridLineWidthPx,
} from '../constants.js';
import { BaseGlassSeparableBlur } from './BaseGlassSeparableBlur.js';
import { effectiveRoughnessWithHdriBlur } from './hdriBlur.js';
import { resetRendererFullViewport } from './resetRendererFullViewport.js';
import { STUDIO_BACKDROP_SHADOW_REACH_PADDING } from '../config/shadowQuality.js';
import {
  applySvgExtrudeSurfaceToMaterial,
  applyOrbySurfaceUniformState,
  clampSurfaceStrength,
  computeExtrudeSurfaceMappingBounds,
  createOrbySurfaceUniformRefs,
  getSvgExtrudeSurfacePresetConfig,
  ORBY_SURFACE_GLASS_FRAG_HELPERS,
  removeSvgExtrudeProceduralFromMaterial,
  resolveOrbySurfaceUniformState,
} from './SvgExtrudeSurfaceShader.js';
import {
  DEFAULT_SVG_EXTRUDE_SURFACE_PRESET,
  DEFAULT_SVG_EXTRUDE_SURFACE_SCALE,
  DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH,
} from '../import/extrudeDefaults.js';
import { InfinityCoveController } from './InfinityCoveController.js';

const _backdropShadowCorner = new THREE.Vector3();
const _backdropShadowBox = new THREE.Box3();

const _backdropRestPos = new THREE.Vector3();
const _backdropRestEuler = new THREE.Euler();
const _backdropRestQuat = new THREE.Quaternion();
const _backdropRestScale = new THREE.Vector3();
const _backdropRestMatrix = new THREE.Matrix4();

/** Vertex shader: Reflector UV projection + surface sampling coords. */
function buildBaseGlassReflectorVertexShader() {
  return /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vUv;
varying vec3 vOrbyLocalPos;
varying vec3 vOrbyLocalNormal;
varying vec3 vOrbyWorldPos;

#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  vOrbyLocalPos = position;
  vOrbyLocalNormal = vec3( 0.0, 0.0, 1.0 );
  vOrbyWorldPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
  vUv = textureMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  #include <logdepthbuf_vertex>
}
`;
}

/** Glass reflection FS — optional surface detail distorts the projected reflection UV. */
function buildBaseGlassReflectorFragmentShader() {
  return /* glsl */ `
#include <common>
${ORBY_SURFACE_GLASS_FRAG_HELPERS}
uniform sampler2D tDiffuse;
uniform float reflectionAmount;
uniform float surfaceBrightness;
varying vec4 vUv;

#include <logdepthbuf_pars_fragment>

vec2 orbyGlassReflectionUvOffset() {
  if ( uOrbySurfaceMode < 0.5 && uOrbyNormalStrength < 0.0001 ) return vec2( 0.0 );
  if ( uOrbyNormalStrength > 0.0001 && uOrbySurfaceMode < 0.5 ) {
    vec3 tn = orbyTriplanarNormalObject(
      vOrbyLocalPos,
      normalize( vOrbyLocalNormal ),
      uOrbyScale
    );
    return tn.xy * uOrbyNormalStrength * 0.036;
  }
  vec3 p = vOrbyWorldPos * uOrbyScale;
  float mode = uOrbySurfaceMode;
  vec2 off = vec2( 0.0 );
  if ( mode < 1.5 ) {
    off = vec2( orbyFbm3( p * 5.0 ), orbyFbm3( p * 5.0 + 2.3 ) ) - 0.5;
    off *= 0.035 * uOrbyNormalStrength;
  } else if ( mode < 2.5 ) {
    off.x = ( orbyFbm3( p * vec3( 0.3, 12.0, 12.0 ) ) - 0.5 ) * 0.04 * uOrbyNormalStrength;
  } else {
    off = vec2( orbyFbm3( p * 3.5 ), orbyFbm3( p * 9.0 + 1.1 ) ) - 0.5;
    off *= 0.028 * uOrbyNormalStrength;
  }
  return off;
}

void main() {
  #include <logdepthbuf_fragment>

  vec4 uv = vUv;
  vec2 uvOff = orbyGlassReflectionUvOffset();
  uv.xy += uvOff * uv.w;

  vec4 baseTex = texture2DProj( tDiffuse, uv );

  vec3 reflRgb = baseTex.rgb;
  vec3 mutedBase = vec3( surfaceBrightness );
  vec3 reflWeighted = mix( mutedBase, reflRgb, reflectionAmount );

  gl_FragColor = vec4( reflWeighted, 1.0 );

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
}

function applyBaseGlassReflectorShader(material, reflection01, surfaceBrightness01, surfaceUniformRefs) {
  if (!material?.uniforms) return;
  const ra = clamp01(reflection01);
  const sb = clamp01(surfaceBrightness01);
  if (!material.uniforms.reflectionAmount) {
    material.uniforms.reflectionAmount = { value: ra };
  } else {
    material.uniforms.reflectionAmount.value = ra;
  }
  if (!material.uniforms.surfaceBrightness) {
    material.uniforms.surfaceBrightness = { value: sb };
  } else {
    material.uniforms.surfaceBrightness.value = sb;
  }
  const surfRefs = surfaceUniformRefs ?? createOrbySurfaceUniformRefs();
  material.uniforms.uOrbySurfaceMode = surfRefs.uOrbySurfaceMode;
  material.uniforms.uOrbyScale = surfRefs.uOrbyScale;
  material.uniforms.uOrbyNormalStrength = surfRefs.uOrbyNormalStrength;
  material.uniforms.uOrbyNormalMap = surfRefs.uOrbyNormalMap;
  material.uniforms.uOrbyNormalOrigin = surfRefs.uOrbyNormalOrigin;
  material.uniforms.uOrbyNormalInvSize = surfRefs.uOrbyNormalInvSize;
  material.vertexShader = buildBaseGlassReflectorVertexShader();
  material.fragmentShader = buildBaseGlassReflectorFragmentShader();
  material.needsUpdate = true;
  return surfRefs;
}

const clampScale = (value) => Math.min(3, Math.max(0.5, value));
const clampBaseScale = (value) => Math.min(10, Math.max(0.5, value));
const GRID_DIVISIONS = 32;

function buildGridLinePositions(size, divisions) {
  const half = size / 2;
  const step = size / divisions;
  const vertices = [];
  for (let i = 0, k = -half; i <= divisions; i += 1, k += step) {
    vertices.push(-half, 0, k, half, 0, k);
    vertices.push(k, 0, -half, k, 0, half);
  }
  return vertices;
}
const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));
const clampDegrees = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return ((n % 360) + 360) % 360;
};

/**
 * Outer rim curve from (baseRadius, -height) to (topRadius, 0), bulging slightly past the
 * straight chamfer so normals interpolate smoothly (highlights roll instead of kinking).
 */
function buildPodiumOuterProfile(baseRadius, topRadius, height, edgeSegments) {
  const p0 = new THREE.Vector2(baseRadius, -height);
  const p1 = new THREE.Vector2(topRadius, 0);
  const chord = new THREE.Vector2().subVectors(p1, p0);
  const chordLen = chord.length();
  if (chordLen < 1e-8 || edgeSegments < 1) {
    return [p0.clone(), p1.clone()];
  }
  const n = new THREE.Vector2(chord.y, -chord.x);
  n.normalize();
  const bulge = Math.min(
    chordLen * 0.34,
    baseRadius * 0.2,
    Math.max(0, baseRadius - topRadius) * 2.2 + height * 0.55,
  );

  const pts = [];
  for (let i = 0; i <= edgeSegments; i++) {
    const t = i / edgeSegments;
    const lin = new THREE.Vector2().lerpVectors(p0, p1, t);
    lin.addScaledVector(n, bulge * Math.sin(Math.PI * t));
    pts.push(lin);
  }
  return pts;
}

function createPodiumLatheGeometry(baseRadius, topRadius, height, radialSegments, edgeSegments) {
  const outer = buildPodiumOuterProfile(baseRadius, topRadius, height, edgeSegments);
  const profile = [new THREE.Vector2(0, -height), ...outer, new THREE.Vector2(0, 0)];
  const geo = new THREE.LatheGeometry(profile, radialSegments);
  return geo;
}

function createSeamlessBackdropGeometry({
  width = 6,
  wallHeight = 4,
  curveRadius = 1.4,
  floorDepth = 4,
  widthSegments = 24,
  profileSegments = 56,
} = {}) {
  const clampedWidthSegments = Math.max(2, Math.floor(widthSegments));
  const clampedProfileSegments = Math.max(16, Math.floor(profileSegments));
  const curveLen = Math.PI * 0.5 * curveRadius;
  const totalLen = wallHeight + curveLen + floorDepth;
  // Target ~2x profile density, but concentrate it into the bend.
  const targetProfileSegments = Math.max(24, clampedProfileSegments * 2);
  const curveBias = 3.5;
  const weightedTotal = wallHeight + floorDepth + (curveLen * curveBias);
  let wallProfileSegments = Math.max(
    4,
    Math.round((targetProfileSegments * wallHeight) / weightedTotal),
  );
  let floorProfileSegments = Math.max(
    4,
    Math.round((targetProfileSegments * floorDepth) / weightedTotal),
  );
  let curveProfileSegments = targetProfileSegments - wallProfileSegments - floorProfileSegments;
  // Further reduce flat-area density: another ~50% cut vs current flat sections.
  const flatReductionRatio = 0.25;
  wallProfileSegments = Math.max(2, Math.round(wallProfileSegments * flatReductionRatio));
  floorProfileSegments = Math.max(2, Math.round(floorProfileSegments * flatReductionRatio));
  curveProfileSegments = targetProfileSegments - wallProfileSegments - floorProfileSegments;
  if (curveProfileSegments < 16) {
    const deficit = 16 - curveProfileSegments;
    curveProfileSegments = 16;
    const wallGive = Math.min(wallProfileSegments - 2, Math.ceil(deficit * 0.5));
    wallProfileSegments -= Math.max(0, wallGive);
    floorProfileSegments -= Math.max(0, deficit - Math.max(0, wallGive));
    floorProfileSegments = Math.max(2, floorProfileSegments);
  }
  const assignedTotal =
    wallProfileSegments + curveProfileSegments + floorProfileSegments;
  if (assignedTotal !== targetProfileSegments) {
    curveProfileSegments += targetProfileSegments - assignedTotal;
  }

  const profileDistances = [];
  const pushSection = (startS, endS, segments, includeStart) => {
    const segs = Math.max(1, Math.floor(segments));
    for (let i = includeStart ? 0 : 1; i <= segs; i += 1) {
      const t = i / segs;
      profileDistances.push(startS + ((endS - startS) * t));
    }
  };
  pushSection(0, wallHeight, wallProfileSegments, true);
  pushSection(wallHeight, wallHeight + curveLen, curveProfileSegments, false);
  pushSection(wallHeight + curveLen, totalLen, floorProfileSegments, false);

  const vertsPerRow = clampedWidthSegments + 1;
  const profileRows = profileDistances.length;
  const vertices = new Float32Array(profileRows * vertsPerRow * 3);
  const indices = [];

  let vi = 0;
  for (let i = 0; i < profileRows; i += 1) {
    const s = profileDistances[i];
    let y = 0;
    let z = 0;

    if (s <= wallHeight) {
      y = wallHeight - s;
      z = 0;
    } else if (s <= wallHeight + curveLen) {
      const arcLen = s - wallHeight;
      const a = arcLen / curveRadius;
      y = -curveRadius * Math.sin(a);
      z = curveRadius * (1 - Math.cos(a));
    } else {
      const floorLen = s - wallHeight - curveLen;
      y = -curveRadius;
      z = curveRadius + floorLen;
    }

    for (let j = 0; j <= clampedWidthSegments; j += 1) {
      const u = j / clampedWidthSegments;
      const x = (u - 0.5) * width;
      vertices[vi] = x;
      vertices[vi + 1] = y;
      vertices[vi + 2] = z;
      vi += 3;
    }
  }

  for (let i = 0; i < profileRows - 1; i += 1) {
    for (let j = 0; j < clampedWidthSegments; j += 1) {
      const a = i * vertsPerRow + j;
      const b = a + vertsPerRow;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

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
    this.wireColor = options.wireColor ?? DEFAULT_GROUND_WIRE_COLOR;
    this.wireOpacity = options.wireOpacity ?? DEFAULT_GROUND_WIRE_OPACITY;
    this.groundY = options.groundY ?? 0;
    this.gridY = options.gridY ?? 0;
    this.podiumScale = clampBaseScale(options.baseScale ?? options.podiumScale ?? 1);
    this.gridScale = clampScale(options.gridScale ?? 1);
    this.gridLineWidth = clampGridLineWidth(options.gridLineWidth ?? DEFAULT_GRID_LINE_WIDTH);
    this.groundHeight = options.groundHeight ?? 0.1;
    this.podiumBaseRadius = 2;

    this.podiumMetalness = clamp01(options.baseMetalness ?? options.podiumMetalness ?? DEFAULT_MATERIAL_METALNESS);
    this.podiumRoughness = clamp01(options.baseRoughness ?? options.podiumRoughness ?? DEFAULT_MATERIAL_ROUGHNESS);
    /** Multiplier on HDRI env intensity for the solid base only (highlights HDRI reflections). */
    const pr = Number(options.baseReflection ?? options.podiumReflection);
    this.podiumReflection = Math.min(
      3,
      Math.max(0, Number.isFinite(pr) ? pr : 1),
    );
    this.podiumClearcoat = clamp01(options.baseClearcoat ?? options.podiumClearcoat ?? 0);
    this.baseSurfacePreset = options.baseSurfacePreset ?? DEFAULT_SVG_EXTRUDE_SURFACE_PRESET;
    this.baseSurfaceScale = Number(options.baseSurfaceScale ?? DEFAULT_SVG_EXTRUDE_SURFACE_SCALE) || DEFAULT_SVG_EXTRUDE_SURFACE_SCALE;
    this.baseSurfaceStrength = clampSurfaceStrength(
      options.baseSurfaceStrength ?? DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH,
    );
    this._glassSurfaceUniformRefs = null;

    this._lastEnvTexture = null;
    this._lastHdriIntensity = 1;
    this._lastHdriBlurriness = 0;

    /** WebGLRenderer — required for planar mesh reflection on the base top. */
    this.renderer = options.renderer ?? null;
    this.getStudioPixelRatio = options.getStudioPixelRatio ?? null;
    /** Planar “glass surface” reflection (realtime scene mesh; optional toggle). */
    const glassFromState =
      options.baseGlassSurface !== undefined
        ? !!options.baseGlassSurface
        : options.podiumGlassSurface !== undefined
          ? !!options.podiumGlassSurface
          : options.podiumReflectMesh !== false;
    this.podiumGlassSurface = glassFromState;
    /** 0–1 softness for glass reflection (multi-tap blur in shader). */
    this.podiumGlassBlur = clamp01(
      options.baseGlassBlur ?? options.podiumGlassBlur ?? DEFAULT_BASE_GLASS_BLUR,
    );
    /** 0–1 strength of reflection vs muted tinted base (lower = less “mirror”). */
    this.podiumGlassAmount = clamp01(
      options.baseGlassAmount ?? options.podiumGlassAmount ?? DEFAULT_BASE_GLASS_AMOUNT,
    );
    /** 0–1 base tone under reflection — black to white (mid gray default). */
    this.podiumGlassBrightness = clamp01(
      options.baseGlassBrightness ??
        options.podiumGlassBrightness ??
        DEFAULT_BASE_GLASS_BRIGHTNESS,
    );

    this.podium = null;
    this.podiumRoot = null;
    this.podiumReflector = null;
    this._glassSepBlur = null;
    this.backdropEnabled = !!options.backdropEnabled;
    this.backdropScale = clampScale(options.backdropScale ?? 1);
    this.backdropWidth = clampScale(options.backdropWidth ?? 2);
    this.backdropColor = options.backdropColor ?? '#808080';
    this.backdropRotation = clampDegrees(options.backdropRotation ?? 0);
    this.backdropY = options.backdropY ?? 0;
    this.backdropCurveRadius = 1.4;
    this.backdropSpawnZ = -(this.backdropCurveRadius + 1.6);
    this.backdropMetalness = clamp01(
      options.backdropMetalness ?? DEFAULT_BACKDROP_METALNESS,
    );
    this.backdropRoughness = clamp01(
      options.backdropRoughness ?? DEFAULT_BACKDROP_ROUGHNESS,
    );
    this.backdropSurfacePreset = options.backdropSurfacePreset ?? DEFAULT_SVG_EXTRUDE_SURFACE_PRESET;
    this.backdropSurfaceScale = Number(options.backdropSurfaceScale ?? DEFAULT_SVG_EXTRUDE_SURFACE_SCALE) || DEFAULT_SVG_EXTRUDE_SURFACE_SCALE;
    this.backdropSurfaceStrength = clampSurfaceStrength(
      options.backdropSurfaceStrength ?? DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH,
    );
    this.debugWireframeEnabled = !!options.debugWireframeEnabled;
    this.backdrop = null;
    /** Scale-in/out multiplier from {@link setBackdropAnimationState}. */
    this._backdropAnimMul = options.backdropEnabled ? 1 : 0;
    this._backdropAnimVisible = !!options.backdropEnabled;

    this.grid = null;
    this.gridMaterials = null;
    /** SceneManager wires this to {@link SceneManager#_syncStudioGroundSurfaces}. */
    this.onSurfacePresentationSync = null;

    this.infinityCove = new InfinityCoveController(this.scene, {
      infinityCoveEnabled: !!options.infinityCoveEnabled,
      infinityCoveScale: options.infinityCoveScale,
      infinityCoveWidth: options.infinityCoveWidth,
      infinityCoveColor: options.infinityCoveColor,
      infinityCoveRotation: options.infinityCoveRotation,
      infinityCoveY: options.infinityCoveY,
      infinityCoveMetalness: options.infinityCoveMetalness,
      infinityCoveRoughness: options.infinityCoveRoughness,
      infinityCoveSurfacePreset: options.infinityCoveSurfacePreset,
      infinityCoveSurfaceScale: options.infinityCoveSurfaceScale,
      infinityCoveSurfaceStrength: options.infinityCoveSurfaceStrength,
      debugWireframeEnabled: this.debugWireframeEnabled,
      onSurfacePresentationSync: () => this._requestSurfacePresentationSync(),
    });

    this.buildGrid();
    this.buildDefaultBase();
    this.buildDefaultBackdrop();
    this.setSolidEnabled(this.solidEnabled);
    this.setBackdropEnabled(this.backdropEnabled);
    this.setWireEnabled(this.wireEnabled);
  }

  _disposeGlassSepBlur() {
    this._glassSepBlur?.dispose();
    this._glassSepBlur = null;
  }

  disposeBaseReflector() {
    this._disposeGlassSepBlur();
    if (!this.podiumReflector) return;
    if (this.podiumReflector.parent) {
      this.podiumReflector.parent.remove(this.podiumReflector);
    }
    if (typeof this.podiumReflector.dispose === 'function') {
      this.podiumReflector.dispose();
    }
    this.podiumReflector.geometry?.dispose();
    this.podiumReflector = null;
  }

  disposeBase() {
    this.disposeBaseReflector();
    if (!this.podiumRoot) return;
    this.scene.remove(this.podiumRoot);
    if (this.podium) disposeObjectGpuResources(this.podium);
    this.podium = null;
    this.podiumRoot = null;
  }

  disposeGrid() {
    if (!this.grid) return;
    this.scene.remove(this.grid);
    this.grid.geometry?.dispose?.();
    if (Array.isArray(this.grid.material)) {
      this.grid.material.forEach((mat) => mat?.dispose?.());
    } else {
      this.grid.material?.dispose?.();
    }
    this.grid = null;
    this.gridMaterials = null;
  }

  disposeBackdrop() {
    if (!this.backdrop) return;
    this.scene.remove(this.backdrop);
    disposeObjectGpuResources(this.backdrop);
    this.backdrop = null;
  }

  disposeMeshes() {
    this.disposeBase();
    this.disposeBackdrop();
    this.infinityCove?.dispose();
    this.infinityCove = null;
    this.disposeGrid();
  }

  buildDefaultBase() {
    this.disposeBase();

    const baseRadius = this.podiumBaseRadius * this.podiumScale;
    const height = this.groundHeight;
    const topRadius =
      (this.podiumBaseRadius - PODIUM_TOP_RADIUS_OFFSET) * this.podiumScale;
    const segments = PODIUM_SEGMENTS;

    if (baseRadius <= 0 || topRadius <= 0 || height <= 0 || !isFinite(baseRadius) || !isFinite(topRadius) || !isFinite(height)) {
      console.error('Invalid podium geometry dimensions:', { baseRadius, topRadius, height, scale: this.podiumScale });
      return;
    }

    const podiumGeo = createPodiumLatheGeometry(
      baseRadius,
      topRadius,
      height,
      segments,
      PODIUM_BEVEL_EDGE_SEGMENTS,
    );
    // Profile is already y ∈ [-height, 0] (same footprint as the old translated cylinder).

    const solidMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(this.solidColor),
      metalness: this.podiumMetalness,
      roughness: effectiveRoughnessWithHdriBlur(this.podiumRoughness, this._lastHdriBlurriness),
      envMapIntensity: 1,
      clearcoat: this.podiumClearcoat,
      clearcoatRoughness: 0.22,
    });

    this.podium = new THREE.Mesh(podiumGeo, solidMat);
    this.podium.receiveShadow = true;
    this.podium.material.wireframe = this.debugWireframeEnabled;
    this.podium.visible = this.solidEnabled;

    this.podiumRoot = new THREE.Group();
    this.podiumRoot.add(this.podium);
    this.scene.add(this.podiumRoot);

    this.applyBaseEnvironment(
      this._lastEnvTexture ?? this.scene.environment,
      this._lastHdriIntensity,
      this._lastHdriBlurriness,
    );
    this.applyBaseSurface();

    this.setGroundY(this.groundY);
    this.rebuildBaseReflector();
    this._requestSurfacePresentationSync();
  }

  buildDefaultBackdrop() {
    this.disposeBackdrop();
    const geometry = createSeamlessBackdropGeometry({
      curveRadius: this.backdropCurveRadius,
    });
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.backdropColor),
      metalness: this.backdropMetalness,
      roughness: this.backdropRoughness,
      side: THREE.DoubleSide,
    });
    this.backdrop = new THREE.Mesh(geometry, material);
    this.backdrop.userData.orbyStudioBackdrop = true;
    this._syncBackdropShadowFlags();
    this.backdrop.position.z = this.backdropSpawnZ;
    this.scene.add(this.backdrop);
    this._applyBackdropTransform();
    this.setDebugWireframeEnabled(this.debugWireframeEnabled);
    this._applyBackdropMaterial();
    this.applyBackdropSurface();
  }

  /**
   * Planar Reflector on the podium top — renders the scene (including the loaded mesh) each frame.
   * HDRI env reflections alone cannot show other objects.
   */
  rebuildBaseReflector() {
    this.disposeBaseReflector();
    if (!this.podium || !this.renderer || !this.podiumGlassSurface) return;

    const topRadius =
      (this.podiumBaseRadius - PODIUM_TOP_RADIUS_OFFSET) * this.podiumScale;
    if (topRadius <= 0) return;

    const dpr = Math.max(1e-6, this.renderer.getPixelRatio?.() ?? 1);
    const logical = new THREE.Vector2();
    this.renderer.getSize(logical);
    let lw = logical.x > 0 ? logical.x : window.innerWidth;
    let lh = logical.y > 0 ? logical.y : window.innerHeight;
    const rw = this._reflectorTexW
      ?? Math.max(256, Math.floor(lw * dpr * PODIUM_REFLECTOR_RES_SCALE));
    const rh = this._reflectorTexH
      ?? Math.max(256, Math.floor(lh * dpr * PODIUM_REFLECTOR_RES_SCALE));

    const segments = Math.min(96, Math.max(48, PODIUM_SEGMENTS));
    const geom = new THREE.CircleGeometry(
      topRadius * PODIUM_REFLECTOR_RADIUS_SCALE,
      segments,
    );

    const ms = this.renderer.capabilities?.isWebGL2 === true ? 4 : 0;

    const reflector = new Reflector(geom, {
      clipBias: 0.003,
      textureWidth: rw,
      textureHeight: rh,
      multisample: ms,
    });

    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = PODIUM_REFLECTOR_Y_EPS;
    reflector.renderOrder = 2;
    reflector.frustumCulled = false;
    reflector.receiveShadow = false;
    reflector.userData.meshglBaseGlassReflector = true;

    this.podiumRoot.add(reflector);
    this.podiumReflector = reflector;

    this._glassSepBlur = new BaseGlassSeparableBlur(this.renderer, rw, rh);

    const scope = this;
    const originalBeforeRender = reflector.onBeforeRender;
    reflector.onBeforeRender = function podiumGlassOnBeforeRender(renderer, scene, camera) {
      originalBeforeRender.call(reflector, renderer, scene, camera);
      // Reflector restores the framebuffer via setRenderTarget but can leave a preview-sized
      // logical viewport on export buffers — use the bound RT's full pixel dimensions.
      resetRendererFullViewport(renderer);

      const sharpTex = reflector.getRenderTarget().texture;
      const b = scope.podiumGlassBlur;
      if (b < 0.015 || !scope._glassSepBlur) {
        reflector.material.uniforms.tDiffuse.value = sharpTex;
      } else {
        const blurredTex = scope._glassSepBlur.render(renderer, sharpTex, b);
        reflector.material.uniforms.tDiffuse.value = blurredTex;
      }
    };

    if (!this._glassSurfaceUniformRefs) {
      this._glassSurfaceUniformRefs = createOrbySurfaceUniformRefs();
    }
    applyOrbySurfaceUniformState(
      this._glassSurfaceUniformRefs,
      this._resolveBaseGlassSurfaceUniformState(),
    );
    applyBaseGlassReflectorShader(
      reflector.material,
      this.podiumGlassAmount,
      this.podiumGlassBrightness,
      this._glassSurfaceUniformRefs,
    );
  }

  /** Call from SceneManager on resize so the reflector render target stays sharp enough without wasting pixels. */
  resizeBaseReflector(width, height) {
    if (!this.renderer) return;
    const logical = new THREE.Vector2();
    this.renderer.getSize(logical);
    const w = width ?? (logical.x > 0 ? logical.x : window.innerWidth);
    const h = height ?? (logical.y > 0 ? logical.y : window.innerHeight);
    const dpr = Math.max(1e-6, this.renderer.getPixelRatio?.() ?? 1);
    this._reflectorTexW = Math.max(256, Math.floor(w * dpr * PODIUM_REFLECTOR_RES_SCALE));
    this._reflectorTexH = Math.max(256, Math.floor(h * dpr * PODIUM_REFLECTOR_RES_SCALE));
    if (this.podium && this.podiumGlassSurface) this.rebuildBaseReflector();
  }

  setBaseGlassSurface(enabled) {
    this.podiumGlassSurface = !!enabled;
    if (this.podiumGlassSurface && !this.podiumReflector) {
      this.rebuildBaseReflector();
    }
  }

  setBaseGlassBlur(value) {
    this.podiumGlassBlur = clamp01(value);
  }

  setBaseGlassAmount(value) {
    this.podiumGlassAmount = clamp01(value);
    const u = this.podiumReflector?.material?.uniforms?.reflectionAmount;
    if (u) u.value = this.podiumGlassAmount;
  }

  setBaseGlassBrightness(value) {
    this.podiumGlassBrightness = clamp01(value);
    const u = this.podiumReflector?.material?.uniforms?.surfaceBrightness;
    if (u) u.value = this.podiumGlassBrightness;
  }

  /**
   * Keeps podium env/reflections in sync with the HDRI (same path as the loaded model).
   */
  applyBaseEnvironment(envTexture, hdriIntensity, hdriBlurriness = 0) {
    const intensity = Math.max(0, hdriIntensity ?? 1);
    const blur = clamp01(hdriBlurriness);
    this._lastEnvTexture = envTexture ?? null;
    this._lastHdriIntensity = intensity;
    this._lastHdriBlurriness = blur;

    const env = envTexture ?? this.scene.environment ?? null;
    const mat = this.podium?.material;
    if (mat && (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) {
      mat.envMap = env;
      mat.envMapIntensity = intensity * this.podiumReflection;
      mat.metalness = this.podiumMetalness;
      mat.roughness = effectiveRoughnessWithHdriBlur(this.podiumRoughness, blur);
      if (mat.isMeshPhysicalMaterial) {
        mat.clearcoat = this.podiumClearcoat;
        mat.clearcoatRoughness = 0.22;
      }
      if (typeof this.onSurfacePresentationSync !== 'function') {
        mat.needsUpdate = true;
      }
    }

    this._applyBackdropMaterial();
    this.applyBaseSurface();
    this.infinityCove?.syncEnvironment(env, intensity, blur);
    this._requestSurfacePresentationSync();
  }

  /** Re-apply surface shaders + shadow/gobo relink after PBR env edits (same path as object surfaces). */
  _requestSurfacePresentationSync() {
    if (typeof this.onSurfacePresentationSync === 'function') {
      this.onSurfacePresentationSync();
    }
  }

  /**
   * Live PBR scrub — update podium material params only.
   * Avoids re-applying surface shaders + full scene compile on every sample.
   */
  _applyBasePbrParams() {
    const mat = this.podium?.material;
    if (!mat || !(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) return;
    const intensity = Math.max(0, this._lastHdriIntensity ?? 1);
    const blur = clamp01(this._lastHdriBlurriness ?? 0);
    mat.metalness = this.podiumMetalness;
    mat.roughness = effectiveRoughnessWithHdriBlur(this.podiumRoughness, blur);
    mat.envMapIntensity = intensity * this.podiumReflection;
    if (mat.isMeshPhysicalMaterial) {
      mat.clearcoat = this.podiumClearcoat;
      mat.clearcoatRoughness = 0.22;
    }
  }

  setBaseMetalness(value) {
    this.podiumMetalness = clamp01(value);
    this._applyBasePbrParams();
  }

  setBaseRoughness(value) {
    this.podiumRoughness = clamp01(value);
    this._applyBasePbrParams();
  }

  setBaseReflection(value) {
    const v = Number(value);
    this.podiumReflection = Math.min(3, Math.max(0, Number.isFinite(v) ? v : 1));
    this._applyBasePbrParams();
  }

  setBaseClearcoat(value) {
    this.podiumClearcoat = clamp01(value);
    this._applyBasePbrParams();
  }

  setBaseSurface({ preset, scale, strength } = {}) {
    const prevPreset = this.baseSurfacePreset ?? 'none';
    if (preset !== undefined) this.baseSurfacePreset = preset || 'none';
    if (scale !== undefined) {
      this.baseSurfaceScale = Number(scale) || DEFAULT_SVG_EXTRUDE_SURFACE_SCALE;
    }
    if (strength !== undefined) {
      this.baseSurfaceStrength = clampSurfaceStrength(strength);
    }
    this.applyBaseSurface();
    // Scale/strength are shader uniforms — skip full surface relink + compile while scrubbing.
    const presetChanged =
      preset !== undefined && (this.baseSurfacePreset ?? 'none') !== prevPreset;
    if (presetChanged) {
      this._requestSurfacePresentationSync();
    }
  }

  applyBaseSurface() {
    const mat = this.podium?.material;
    if (!mat) {
      this.applyBaseGlassSurface();
      return;
    }
    const preset = this.baseSurfacePreset ?? 'none';
    const config = getSvgExtrudeSurfacePresetConfig(preset);
    if (!config || config.kind === 'none') {
      removeSvgExtrudeProceduralFromMaterial(mat);
      this.applyBaseGlassSurface();
      return;
    }
    const mappingBounds =
      config.kind === 'normalMap' ? computeExtrudeSurfaceMappingBounds(this.podium) : null;
    applySvgExtrudeSurfaceToMaterial(mat, {
      preset,
      scale: this.baseSurfaceScale,
      strength: this.baseSurfaceStrength,
      normalBounds: mappingBounds,
    });
    this.applyBaseGlassSurface();
  }

  _resolveBaseGlassSurfaceUniformState() {
    const preset = this.baseSurfacePreset ?? 'none';
    const config = getSvgExtrudeSurfacePresetConfig(preset);
    if (!config || config.kind === 'none') return null;
    const normalBounds =
      config.kind === 'normalMap' && this.podiumReflector
        ? computeExtrudeSurfaceMappingBounds(this.podiumReflector)
        : null;
    return resolveOrbySurfaceUniformState(
      preset,
      this.baseSurfaceScale,
      this.baseSurfaceStrength,
      normalBounds,
    );
  }

  applyBaseGlassSurface() {
    if (!this.podiumReflector?.material) return;
    if (!this._glassSurfaceUniformRefs) {
      this._glassSurfaceUniformRefs = createOrbySurfaceUniformRefs();
    }
    applyOrbySurfaceUniformState(
      this._glassSurfaceUniformRefs,
      this._resolveBaseGlassSurfaceUniformState(),
    );
    applyBaseGlassReflectorShader(
      this.podiumReflector.material,
      this.podiumGlassAmount,
      this.podiumGlassBrightness,
      this._glassSurfaceUniformRefs,
    );
  }

  _syncGridLineMaterial(width, height) {
    if (!this.gridMaterials?.length) return;
    const logical = new THREE.Vector2();
    if (this.renderer?.getSize) {
      this.renderer.getSize(logical);
    }
    const w = width ?? (logical.x > 0 ? logical.x : window.innerWidth);
    const h = height ?? (logical.y > 0 ? logical.y : window.innerHeight);
    const rDpr = Math.max(1e-6, this.renderer?.getPixelRatio?.() ?? 1);
    const dDpr = Math.max(rDpr, window.devicePixelRatio ?? rDpr);
    const studioDpr = Math.max(rDpr, this.getStudioPixelRatio?.() ?? rDpr);
    const resX = Math.max(1, Math.floor(w * rDpr));
    const resY = Math.max(1, Math.floor(h * rDpr));
    const linePx = resolveViewportGridLineWidthPx(
      this.gridLineWidth,
      rDpr,
      dDpr,
      studioDpr,
    );
    this.gridMaterials.forEach((mat) => {
      if (!mat) return;
      if (mat.resolution) mat.resolution.set(resX, resY);
      mat.linewidth = linePx;
    });
  }

  resizeGridLines(width, height) {
    this._syncGridLineMaterial(width, height);
  }

  /** Full-opacity grid lines write depth so wide Line2 quads do not draw through solid meshes (esp. on ANGLE/WebGL). */
  _syncGridMaterialDepthState() {
    if (!this.gridMaterials?.length) return;
    const opaque = this.wireOpacity >= 1;
    this.gridMaterials.forEach((mat) => {
      if (!mat) return;
      mat.transparent = !opaque;
      mat.opacity = this.wireOpacity;
      mat.depthWrite = opaque;
      mat.needsUpdate = true;
    });
    if (this.grid) this.grid.renderOrder = opaque ? -10 : 0;
  }

  buildGrid() {
    this.disposeGrid();
    const baseRadius = this.podiumBaseRadius * this.podiumScale;
    const size = baseRadius * 2 * this.gridScale;
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(buildGridLinePositions(size, GRID_DIVISIONS));
    const gridOpaque = this.wireOpacity >= 1;
    const rDpr = Math.max(1e-6, this.renderer?.getPixelRatio?.() ?? 1);
    const dDpr = Math.max(rDpr, window.devicePixelRatio ?? rDpr);
    const studioDpr = Math.max(rDpr, this.getStudioPixelRatio?.() ?? rDpr);
    const material = new LineMaterial({
      color: new THREE.Color(this.wireColor).getHex(),
      linewidth: resolveViewportGridLineWidthPx(
        this.gridLineWidth,
        rDpr,
        dDpr,
        studioDpr,
      ),
      transparent: !gridOpaque,
      opacity: this.wireOpacity,
      depthWrite: gridOpaque,
      toneMapped: true,
      worldUnits: false,
    });
    this.grid = new LineSegments2(geometry, material);
    this.grid.frustumCulled = false;
    this.grid.userData.skipBokehDepth = true;
    // Match STUDIO_GROUND_GRID_USERDATA_KEY — exporters hide this helper without toggling the UI.
    this.grid.userData.orbyStudioGroundGrid = true;
    this.gridMaterials = [material];
    this._syncGridMaterialDepthState();
    this._syncGridLineMaterial();
    this.grid.visible = this.wireEnabled;
    this.scene.add(this.grid);
    this.setGridY(this.gridY);
  }

  setSolidEnabled(enabled) {
    this.solidEnabled = !!enabled;

    if (!this.podiumRoot) {
      console.warn('[GroundController] Podium missing, rebuilding default…');
      this.buildDefaultBase();
    }

    // Podium visibility + animated scale are driven each frame from SceneManager (`toggleScaleAnimation`).
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
    this._syncGridMaterialDepthState();
  }

  setGroundY(value) {
    this.groundY = value ?? 0;
    if (this.podiumRoot) this.podiumRoot.position.y = this.groundY;
  }

  setGridY(value) {
    this.gridY = value ?? 0;
    if (this.grid) this.grid.position.y = this.gridY;
  }

  snapBaseToBounds(bounds) {
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

  snapBackdropToBounds(bounds) {
    if (!bounds || !isFinite(bounds.min.y)) return null;
    const bottomY = bounds.min.y;
    const localFloorY = -this.backdropCurveRadius * this.backdropScale;
    const nextBackdropY = bottomY - localFloorY;
    this.setBackdropY(nextBackdropY);
    return nextBackdropY;
  }

  setBaseScale(value) {
    this.podiumScale = clampBaseScale(value ?? this.podiumScale);

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

    this.buildDefaultBase();
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

  setGridLineWidth(value) {
    this.gridLineWidth = clampGridLineWidth(value ?? this.gridLineWidth);
    this._syncGridLineMaterial();
  }

  setBackdropEnabled(enabled) {
    this.backdropEnabled = !!enabled;
    if (!this.backdrop) this.buildDefaultBackdrop();
  }

  setBackdropY(value) {
    this.backdropY = Number.isFinite(value) ? value : 0;
    this._applyBackdropTransform();
  }

  setBackdropColor(color) {
    if (!color) return;
    this.backdropColor = color;
    if (this.backdrop?.material?.color) {
      this.backdrop.material.color.set(color);
    }
  }

  setBackdropScale(value) {
    this.backdropScale = clampScale(value ?? this.backdropScale);
    this._applyBackdropTransform();
  }

  setBackdropWidth(value) {
    this.backdropWidth = clampScale(value ?? this.backdropWidth);
    this._applyBackdropTransform();
  }

  setBackdropRotation(value) {
    this.backdropRotation = clampDegrees(value);
    this._applyBackdropTransform();
  }

  setBackdropMetalness(value) {
    this.backdropMetalness = clamp01(value);
    this._applyBackdropMaterial();
    this._requestSurfacePresentationSync();
  }

  setBackdropRoughness(value) {
    this.backdropRoughness = clamp01(value);
    this._applyBackdropMaterial();
    this._requestSurfacePresentationSync();
  }

  setInfinityCoveColor(color) {
    this.infinityCove?.setColor(color);
  }

  setInfinityCoveMetalness(value) {
    this.infinityCove?.setMetalness(value);
  }

  setInfinityCoveRoughness(value) {
    this.infinityCove?.setRoughness(value);
  }

  setBackdropSurface({ preset, scale, strength } = {}) {
    if (preset !== undefined) this.backdropSurfacePreset = preset || 'none';
    if (scale !== undefined) {
      this.backdropSurfaceScale = Number(scale) || DEFAULT_SVG_EXTRUDE_SURFACE_SCALE;
    }
    if (strength !== undefined) {
      this.backdropSurfaceStrength = clampSurfaceStrength(strength);
    }
    this.applyBackdropSurface();
    this._requestSurfacePresentationSync();
  }

  applyBackdropSurface() {
    const mat = this.backdrop?.material;
    if (!mat) return;
    const preset = this.backdropSurfacePreset ?? 'none';
    const config = getSvgExtrudeSurfacePresetConfig(preset);
    if (!config || config.kind === 'none') {
      removeSvgExtrudeProceduralFromMaterial(mat);
      return;
    }
    const mappingBounds =
      config.kind === 'normalMap' ? computeExtrudeSurfaceMappingBounds(this.backdrop) : null;
    applySvgExtrudeSurfaceToMaterial(mat, {
      preset,
      scale: this.backdropSurfaceScale,
      strength: this.backdropSurfaceStrength,
      normalBounds: mappingBounds,
    });
  }

  _syncBackdropShadowFlags() {
    if (!this.backdrop) return;
    this.backdrop.castShadow = false;
    this.backdrop.receiveShadow = true;
  }

  _applyBackdropTransform() {
    if (!this.backdrop) return;
    this._syncBackdropShadowFlags();
    this.backdrop.rotation.y = THREE.MathUtils.degToRad(this.backdropRotation);
    const sx = this.backdropWidth * this.backdropScale;
    const sy = this.backdropScale;
    const sz = this.backdropScale;
    this.backdrop.userData.backdropBaseScale = { x: sx, y: sy, z: sz };

    const m = Number.isFinite(this._backdropAnimMul) ? Math.max(0, this._backdropAnimMul) : 1;
    this.backdrop.scale.set(sx * m, sy * m, sz * m);
    // Anchor reveal/hide to the floor edge (bottom vertices), not the mesh center.
    // Keep the world-space floor contact at backdropY while scaling.
    this.backdrop.position.y = this.backdropY + (this.backdropCurveRadius * sy * (m - 1));
    this.backdrop.visible = !!this._backdropAnimVisible;
  }

  setBackdropAnimationState(animMul, visible) {
    if (!this.backdrop) return;
    this._backdropAnimMul = Number.isFinite(animMul) ? Math.max(0, animMul) : 1;
    this._backdropAnimVisible = !!visible;
    this._applyBackdropTransform();
  }

  /**
   * World bounds at full resting scale — used for auto clip planes so near/far
   * does not chase the scale-in/out tween (which warps the whole view).
   */
  /**
   * Max distance from a world center (usually the loaded mesh) to any backdrop corner.
   * Used to expand directional shadow ortho frusta so cyclorama shadows are not clipped.
   */
  getShadowReceiveRadiusFromCenter(center) {
    if (!center) return 0;
    let maxReach = 0;
    if (this.backdropEnabled && this.backdrop) {
      const box = this.getBackdropRestWorldBox(_backdropShadowBox);
      if (!box.isEmpty()) {
        const { min, max } = box;
        for (let xi = 0; xi < 2; xi += 1) {
          for (let yi = 0; yi < 2; yi += 1) {
            for (let zi = 0; zi < 2; zi += 1) {
              _backdropShadowCorner.set(
                xi ? max.x : min.x,
                yi ? max.y : min.y,
                zi ? max.z : min.z,
              );
              maxReach = Math.max(
                maxReach,
                _backdropShadowCorner.distanceTo(center),
              );
            }
          }
        }
        maxReach += STUDIO_BACKDROP_SHADOW_REACH_PADDING;
      }
    }
    if (this.infinityCove?.enabled && this.infinityCove.mesh) {
      maxReach = Math.max(
        maxReach,
        this.infinityCove.getShadowReceiveRadiusFromCenter(center) ?? 0,
      );
    }
    return maxReach;
  }

  getBackdropRestWorldBox(target = new THREE.Box3()) {
    if (!this.backdrop?.geometry) return target.makeEmpty();
    const geom = this.backdrop.geometry;
    if (!geom.boundingBox) geom.computeBoundingBox();

    const base = this.backdrop.userData?.backdropBaseScale ?? {
      x: this.backdropWidth * this.backdropScale,
      y: this.backdropScale,
      z: this.backdropScale,
    };

    _backdropRestPos.set(
      this.backdrop.position.x,
      this.backdropY,
      this.backdrop.position.z,
    );
    _backdropRestEuler.set(0, THREE.MathUtils.degToRad(this.backdropRotation), 0);
    _backdropRestQuat.setFromEuler(_backdropRestEuler);
    _backdropRestScale.set(base.x, base.y, base.z);
    _backdropRestMatrix.compose(
      _backdropRestPos,
      _backdropRestQuat,
      _backdropRestScale,
    );

    return target.copy(geom.boundingBox).applyMatrix4(_backdropRestMatrix);
  }

  _applyBackdropMaterial() {
    const material = this.backdrop?.material;
    if (!material) return;
    material.metalness = this.backdropMetalness;
    material.roughness = effectiveRoughnessWithHdriBlur(
      this.backdropRoughness,
      this._lastHdriBlurriness ?? 0,
    );
    const env = this._lastEnvTexture ?? this.scene.environment ?? null;
    material.envMap = env;
    material.envMapIntensity = Math.max(0, this._lastHdriIntensity ?? 1);
    if (typeof this.onSurfacePresentationSync !== 'function') {
      material.needsUpdate = true;
    }
    this.applyBackdropSurface();
  }

  setDebugWireframeEnabled(enabled) {
    this.debugWireframeEnabled = !!enabled;
    if (this.podium?.material) this.podium.material.wireframe = this.debugWireframeEnabled;
    if (this.backdrop?.material) this.backdrop.material.wireframe = this.debugWireframeEnabled;
    this.infinityCove?.setDebugWireframeEnabled(this.debugWireframeEnabled);
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

  getBaseScale() {
    return this.podiumScale;
  }

  getGridScale() {
    return this.gridScale;
  }
}
