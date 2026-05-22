import * as THREE from 'three';
import { Reflector } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/objects/Reflector.js';
import { LineSegments2 } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/lines/LineMaterial.js';
import {
  PODIUM_TOP_RADIUS_OFFSET,
  PODIUM_SEGMENTS,
  PODIUM_BEVEL_EDGE_SEGMENTS,
  PODIUM_REFLECTOR_Y_EPS,
  PODIUM_REFLECTOR_RES_SCALE,
  DEFAULT_BASE_GLASS_BLUR,
  DEFAULT_BASE_GLASS_AMOUNT,
  DEFAULT_BASE_GLASS_BRIGHTNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_MATERIAL_METALNESS,
} from '../constants.js';
import { BaseGlassSeparableBlur } from './BaseGlassSeparableBlur.js';
import { fullViewportLogicalSize } from './fullViewportLogicalSize.js';
import {
  createShadowTintUniformValues,
  DIRECTIONAL_SHADOW_TINT_SAMPLE_GLSL,
  DIRECTIONAL_SHADOW_TINT_UNIFORM_DECL,
  syncShadowTintUniforms,
} from './ShadowTint.js';

/** Vertex shader: Reflector UV projection + shadow map coords for 3-point lights. */
function buildBaseGlassReflectorVertexShader() {
  return /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vUv;

#include <common>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>

void main() {
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  #include <worldpos_vertex>

  vUv = textureMatrix * vec4( position, 1.0 );

  #include <logdepthbuf_vertex>
  #include <shadowmap_vertex>
}
`;
}

/** Glass reflection FS: single projected sample — blur is separable H/V on the RT (see BaseGlassSeparableBlur). */
function buildBaseGlassReflectorFragmentShader() {
  return /* glsl */ `
#include <common>
#include <shadowmap_pars_fragment>
${DIRECTIONAL_SHADOW_TINT_UNIFORM_DECL}
uniform sampler2D tDiffuse;
uniform float reflectionAmount;
uniform float surfaceBrightness;
varying vec4 vUv;

#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>

  vec4 uv = vUv;
  vec4 baseTex = texture2DProj( tDiffuse, uv );

  vec3 reflRgb = baseTex.rgb;
  vec3 mutedBase = vec3( surfaceBrightness );
  vec3 reflWeighted = mix( mutedBase, reflRgb, reflectionAmount );

  ${DIRECTIONAL_SHADOW_TINT_SAMPLE_GLSL}
  #ifdef USE_SHADOWMAP
    reflWeighted = mix( reflWeighted, uOrbyShadowColor, clamp( orbyShadowAmt, 0.0, 1.0 ) );
  #endif

  gl_FragColor = vec4( reflWeighted, 1.0 );

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
}

function applyBaseGlassReflectorShader(material, reflection01, surfaceBrightness01, shadowTint) {
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
  material.vertexShader = buildBaseGlassReflectorVertexShader();
  material.fragmentShader = buildBaseGlassReflectorFragmentShader();
  syncShadowTintUniforms(material, shadowTint);
  material.needsUpdate = true;
}

const clampScale = (value) => Math.min(3, Math.max(0.5, value));
const clampGridLineWidth = (value) => Math.min(2.5, Math.max(0.5, Number(value) || 1));
const GRID_DIVISIONS = 32;
const DEFAULT_GRID_LINE_WIDTH = 1;

/** Slider value maps to screen-space line width in pixels (LineMaterial). */
function gridLineWidthToPixels(width) {
  return clampGridLineWidth(width);
}

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
const clampBackdropTextureScale = (value) => Math.min(12, Math.max(0.25, Number(value) || 1));
const clampDegrees = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return ((n % 360) + 360) % 360;
};

function effectiveRoughnessWithHdriBlur(baseRoughness, hdriBlurriness) {
  const r = clamp01(baseRoughness);
  const b = clamp01(hdriBlurriness);
  if (b <= 0) return r;
  return Math.min(1, r + (1 - r) * b);
}

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

function createProceduralBackdropTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const base = 188 + Math.floor((Math.random() - 0.5) * 24);
      const fiberA = Math.sin((x * 0.1) + (y * 0.017)) * 8;
      const fiberB = Math.sin((x * 0.021) - (y * 0.13)) * 5;
      const speck = Math.random() > 0.985 ? -16 : 0;
      const v = Math.max(120, Math.min(236, Math.round(base + fiberA + fiberB + speck)));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function createProceduralBackdropNormalTexture(size = 512) {
  const noise = new Float32Array(size * size);
  for (let i = 0; i < noise.length; i += 1) {
    noise[i] = Math.random();
  }
  // Smooth once so normals read like paper fibers instead of harsh pixel noise.
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const i = y * size + x;
      noise[i] = (
        noise[i]
        + noise[i - 1]
        + noise[i + 1]
        + noise[i - size]
        + noise[i + size]
      ) / 5;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  const strength = 3.5;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const l = noise[y * size + ((x - 1 + size) % size)];
      const r = noise[y * size + ((x + 1) % size)];
      const u = noise[((y - 1 + size) % size) * size + x];
      const d = noise[((y + 1) % size) * size + x];
      const dx = (r - l) * strength;
      const dy = (d - u) * strength;
      const nx = -dx;
      const ny = -dy;
      const nz = 1;
      const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      const ri = i * 4;
      data[ri] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      data[ri + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      data[ri + 2] = Math.round((nz * invLen * 0.5 + 0.5) * 255);
      data[ri + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return new THREE.CanvasTexture(canvas);
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
    this.wireColor = options.wireColor ?? '#c4ff00';
    this.wireOpacity = options.wireOpacity ?? 1.0;
    this.groundY = options.groundY ?? 0;
    this.gridY = options.gridY ?? 0;
    this.podiumScale = clampScale(options.baseScale ?? options.podiumScale ?? 1);
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

    this._lastEnvTexture = null;
    this._lastHdriIntensity = 1;
    this._lastHdriBlurriness = 0;

    /** WebGLRenderer — required for planar mesh reflection on the base top. */
    this.renderer = options.renderer ?? null;
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
    this.podiumReflector = null;
    this._glassSepBlur = null;
    this._baseGlassShadowTint = createShadowTintUniformValues();
    this.backdropEnabled = !!options.backdropEnabled;
    this.backdropScale = clampScale(options.backdropScale ?? 1);
    this.backdropWidth = clampScale(options.backdropWidth ?? 2);
    this.backdropColor = options.backdropColor ?? '#808080';
    this.backdropRotation = clampDegrees(options.backdropRotation ?? 0);
    this.backdropY = options.backdropY ?? 0;
    this.backdropCurveRadius = 1.4;
    this.backdropSpawnZ = -(this.backdropCurveRadius + 1.6);
    this.backdropTextureEnabled = !!options.backdropTextureEnabled;
    this.backdropTextureScale = clampBackdropTextureScale(options.backdropTextureScale ?? 1.8);
    this.backdropTexture = null;
    this.backdropNormalTexture = null;
    this.debugWireframeEnabled = !!options.debugWireframeEnabled;
    this.backdrop = null;

    this.grid = null;
    this.gridMaterials = null;

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
    if (!this.podium) return;
    this.scene.remove(this.podium);
    disposeObjectGpuResources(this.podium);
    this.podium = null;
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
    this.scene.add(this.podium);

    this.applyBaseEnvironment(
      this._lastEnvTexture ?? this.scene.environment,
      this._lastHdriIntensity,
      this._lastHdriBlurriness,
    );

    this.setGroundY(this.groundY);
    this.rebuildBaseReflector();
  }

  buildDefaultBackdrop() {
    this.disposeBackdrop();
    const geometry = createSeamlessBackdropGeometry({
      curveRadius: this.backdropCurveRadius,
    });
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.backdropColor),
      metalness: 0.02,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    this.backdrop = new THREE.Mesh(geometry, material);
    this.backdrop.userData.orbyStudioBackdrop = true;
    this._syncBackdropShadowFlags();
    this.backdrop.visible = this.backdropEnabled;
    this.backdrop.position.z = this.backdropSpawnZ;
    this.scene.add(this.backdrop);
    this._applyBackdropTransform();
    this.setDebugWireframeEnabled(this.debugWireframeEnabled);
    this._applyBackdropTextureSettings();
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
    const geom = new THREE.CircleGeometry(topRadius * 0.992, segments);

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
    reflector.receiveShadow = true;
    reflector.userData.meshglBaseGlassReflector = true;

    this.podium.add(reflector);
    this.podiumReflector = reflector;

    this._glassSepBlur = new BaseGlassSeparableBlur(this.renderer, rw, rh);

    const scope = this;
    const originalBeforeRender = reflector.onBeforeRender;
    reflector.onBeforeRender = function podiumGlassOnBeforeRender(renderer, scene, camera) {
      originalBeforeRender.call(reflector, renderer, scene, camera);
      // Reflector restores the framebuffer via setRenderTarget but does not align Three's
      // logical viewport with the full canvas. Use GL drawing-buffer dims — cached getDrawingBufferSize
      // can drift during export resize (partial viewport → black bands).
      const v = fullViewportLogicalSize(renderer);
      renderer.setViewport(0, 0, v.x, v.y);
      if (typeof renderer.setScissorTest === 'function') {
        renderer.setScissorTest(false);
      }

      const sharpTex = reflector.getRenderTarget().texture;
      const b = scope.podiumGlassBlur;
      if (b < 0.015 || !scope._glassSepBlur) {
        reflector.material.uniforms.tDiffuse.value = sharpTex;
      } else {
        const blurredTex = scope._glassSepBlur.render(renderer, sharpTex, b);
        reflector.material.uniforms.tDiffuse.value = blurredTex;
      }
    };

    applyBaseGlassReflectorShader(
      reflector.material,
      this.podiumGlassAmount,
      this.podiumGlassBrightness,
      this._baseGlassShadowTint,
    );
  }

  /** Match 3-point shadow tint on the glass top (same as podium solid material). */
  setBaseGlassShadowTint({ color, strength, opacity } = {}) {
    const stash = this._baseGlassShadowTint;
    if (color !== undefined) stash.color.set(color);
    if (strength !== undefined) stash.strength = Math.min(1, Math.max(0, Number(strength) || 0));
    if (opacity !== undefined) {
      const o = Number(opacity);
      stash.opacity = Number.isFinite(o) ? Math.min(1, Math.max(0, o)) : stash.opacity;
    }
    const mat = this.podiumReflector?.material;
    if (mat) {
      syncShadowTintUniforms(mat, stash);
    }
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

    const mat = this.podium?.material;
    if (!mat || (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial)) return;

    const env = envTexture ?? this.scene.environment ?? null;
    mat.envMap = env;
    mat.envMapIntensity = intensity * this.podiumReflection;
    mat.metalness = this.podiumMetalness;
    mat.roughness = effectiveRoughnessWithHdriBlur(this.podiumRoughness, blur);
    if (mat.isMeshPhysicalMaterial) {
      mat.clearcoat = this.podiumClearcoat;
      mat.clearcoatRoughness = 0.22;
    }
    mat.needsUpdate = true;
  }

  setBaseMetalness(value) {
    this.podiumMetalness = clamp01(value);
    this.applyBaseEnvironment(this._lastEnvTexture, this._lastHdriIntensity, this._lastHdriBlurriness);
  }

  setBaseRoughness(value) {
    this.podiumRoughness = clamp01(value);
    this.applyBaseEnvironment(this._lastEnvTexture, this._lastHdriIntensity, this._lastHdriBlurriness);
  }

  setBaseReflection(value) {
    const v = Number(value);
    this.podiumReflection = Math.min(3, Math.max(0, Number.isFinite(v) ? v : 1));
    this.applyBaseEnvironment(this._lastEnvTexture, this._lastHdriIntensity, this._lastHdriBlurriness);
  }

  setBaseClearcoat(value) {
    this.podiumClearcoat = clamp01(value);
    this.applyBaseEnvironment(this._lastEnvTexture, this._lastHdriIntensity, this._lastHdriBlurriness);
  }

  _syncGridLineResolution(width, height) {
    if (!this.gridMaterials?.length) return;
    const logical = new THREE.Vector2();
    if (this.renderer?.getSize) {
      this.renderer.getSize(logical);
    }
    const w = width ?? (logical.x > 0 ? logical.x : window.innerWidth);
    const h = height ?? (logical.y > 0 ? logical.y : window.innerHeight);
    const dpr = Math.max(1e-6, this.renderer?.getPixelRatio?.() ?? window.devicePixelRatio ?? 1);
    const resX = Math.max(1, Math.floor(w * dpr));
    const resY = Math.max(1, Math.floor(h * dpr));
    this.gridMaterials.forEach((mat) => {
      if (mat?.resolution) mat.resolution.set(resX, resY);
    });
  }

  resizeGridLines(width, height) {
    this._syncGridLineResolution(width, height);
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
    const material = new LineMaterial({
      color: new THREE.Color(this.wireColor).getHex(),
      linewidth: gridLineWidthToPixels(this.gridLineWidth),
      transparent: !gridOpaque,
      opacity: this.wireOpacity,
      depthWrite: gridOpaque,
      toneMapped: true,
      worldUnits: false,
    });
    this.grid = new LineSegments2(geometry, material);
    this.grid.frustumCulled = false;
    this.gridMaterials = [material];
    this._syncGridMaterialDepthState();
    this._syncGridLineResolution();
    this.grid.visible = this.wireEnabled;
    this.scene.add(this.grid);
    this.setGridY(this.gridY);
  }

  setSolidEnabled(enabled) {
    this.solidEnabled = !!enabled;

    if (!this.podium) {
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
    if (this.podium) this.podium.position.y = this.groundY;
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
    this.podiumScale = clampScale(value ?? this.podiumScale);

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
    const pixels = gridLineWidthToPixels(this.gridLineWidth);
    if (this.gridMaterials) {
      this.gridMaterials.forEach((mat) => {
        if (mat) mat.linewidth = pixels;
      });
    }
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

  setBackdropTextureEnabled(enabled) {
    this.backdropTextureEnabled = !!enabled;
    this._applyBackdropTextureSettings();
  }

  setBackdropTextureScale(value) {
    this.backdropTextureScale = clampBackdropTextureScale(value);
    this._applyBackdropTextureSettings();
  }

  _syncBackdropShadowFlags() {
    if (!this.backdrop) return;
    this.backdrop.castShadow = false;
    this.backdrop.receiveShadow = true;
  }

  _applyBackdropTransform() {
    if (!this.backdrop) return;
    this._syncBackdropShadowFlags();
    this.backdrop.position.y = this.backdropY;
    this.backdrop.rotation.y = THREE.MathUtils.degToRad(this.backdropRotation);
    const sx = this.backdropWidth * this.backdropScale;
    const sy = this.backdropScale;
    const sz = this.backdropScale;
    this.backdrop.scale.set(sx, sy, sz);
    this.backdrop.userData.backdropBaseScale = { x: sx, y: sy, z: sz };
  }

  setBackdropAnimationState(animMul, visible) {
    if (!this.backdrop) return;
    const base = this.backdrop.userData?.backdropBaseScale;
    const bx = base?.x ?? (this.backdropWidth * this.backdropScale);
    const by = base?.y ?? this.backdropScale;
    const bz = base?.z ?? this.backdropScale;
    const m = Number.isFinite(animMul) ? Math.max(0, animMul) : 1;
    this.backdrop.visible = !!visible;
    this.backdrop.scale.set(bx * m, by * m, bz * m);
    // Anchor reveal/hide to the floor edge (bottom vertices), not the mesh center.
    // Keep the world-space floor contact at backdropY while scaling.
    this.backdrop.position.y = this.backdropY + (this.backdropCurveRadius * by * (m - 1));
  }

  _ensureBackdropTexture(onReady) {
    if (this.backdropTexture) {
      onReady(this.backdropTexture);
      return;
    }
    const texture = createProceduralBackdropTexture(512);
    if (!texture) return;
    this.backdropTexture = texture;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    const normalTexture = createProceduralBackdropNormalTexture(512);
    if (normalTexture) {
      this.backdropNormalTexture = normalTexture;
      normalTexture.wrapS = THREE.RepeatWrapping;
      normalTexture.wrapT = THREE.RepeatWrapping;
      normalTexture.colorSpace = THREE.NoColorSpace;
    }
    onReady(texture);
  }

  _applyBackdropTextureSettings() {
    const material = this.backdrop?.material;
    if (!material) return;
    const applyMap = (texture) => {
      if (!material) return;
      texture.repeat.set(this.backdropTextureScale, this.backdropTextureScale);
      if (this.backdropNormalTexture) {
        this.backdropNormalTexture.repeat.set(
          this.backdropTextureScale,
          this.backdropTextureScale,
        );
      }
      // Keep albedo purely from user color; texture only adds physical surface detail.
      material.map = null;
      material.roughnessMap = this.backdropTextureEnabled ? texture : null;
      material.bumpMap = null;
      material.bumpScale = 0;
      material.normalMap = this.backdropTextureEnabled ? this.backdropNormalTexture : null;
      material.normalScale.setScalar(this.backdropTextureEnabled ? 0.9 : 0);
      material.roughness = 0.9;
      material.needsUpdate = true;
    };
    if (!this.backdropTextureEnabled) {
      material.map = null;
      material.bumpMap = null;
      material.bumpScale = 0;
      material.normalMap = null;
      material.normalScale.setScalar(0);
      material.roughnessMap = null;
      material.roughness = 0.9;
      material.needsUpdate = true;
      return;
    }
    this._ensureBackdropTexture(applyMap);
  }

  setDebugWireframeEnabled(enabled) {
    this.debugWireframeEnabled = !!enabled;
    if (this.podium?.material) this.podium.material.wireframe = this.debugWireframeEnabled;
    if (this.backdrop?.material) this.backdrop.material.wireframe = this.debugWireframeEnabled;
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
