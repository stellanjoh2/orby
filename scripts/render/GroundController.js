import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import {
  PODIUM_TOP_RADIUS_OFFSET,
  PODIUM_SEGMENTS,
  PODIUM_BEVEL_EDGE_SEGMENTS,
  PODIUM_REFLECTOR_Y_EPS,
  PODIUM_REFLECTOR_RES_SCALE,
  DEFAULT_PODIUM_GLASS_BLUR,
  DEFAULT_PODIUM_GLASS_AMOUNT,
  DEFAULT_PODIUM_GLASS_BRIGHTNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_MATERIAL_METALNESS,
} from '../constants.js';
import { PodiumGlassSeparableBlur } from './PodiumGlassSeparableBlur.js';

/** Glass reflection FS: single projected sample — blur is separable H/V on the RT (see PodiumGlassSeparableBlur). */
function buildPodiumGlassReflectorFragmentShader() {
  return /* glsl */ `
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

  gl_FragColor = vec4( reflWeighted, 1.0 );

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
}

function applyPodiumGlassReflectorShader(material, reflection01, surfaceBrightness01) {
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
  material.fragmentShader = buildPodiumGlassReflectorFragmentShader();
  material.needsUpdate = true;
}

const clampScale = (value) => Math.min(3, Math.max(0.5, value));
const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

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

    this.podiumMetalness = clamp01(options.podiumMetalness ?? DEFAULT_MATERIAL_METALNESS);
    this.podiumRoughness = clamp01(options.podiumRoughness ?? DEFAULT_MATERIAL_ROUGHNESS);
    /** Multiplier on HDRI env intensity for the podium only (highlights HDRI reflections). */
    const pr = Number(options.podiumReflection);
    this.podiumReflection = Math.min(
      3,
      Math.max(0, Number.isFinite(pr) ? pr : 1),
    );
    this.podiumClearcoat = clamp01(options.podiumClearcoat ?? 0);

    this._lastEnvTexture = null;
    this._lastHdriIntensity = 1;
    this._lastHdriBlurriness = 0;

    /** WebGLRenderer — required for planar mesh reflection on the podium top. */
    this.renderer = options.renderer ?? null;
    /** Planar “glass surface” reflection (realtime scene mesh; optional toggle). */
    this.podiumGlassSurface =
      options.podiumGlassSurface !== undefined
        ? !!options.podiumGlassSurface
        : options.podiumReflectMesh !== false;
    /** 0–1 softness for glass reflection (multi-tap blur in shader). */
    this.podiumGlassBlur = clamp01(options.podiumGlassBlur ?? DEFAULT_PODIUM_GLASS_BLUR);
    /** 0–1 strength of reflection vs muted tinted base (lower = less “mirror”). */
    this.podiumGlassAmount = clamp01(options.podiumGlassAmount ?? DEFAULT_PODIUM_GLASS_AMOUNT);
    /** 0–1 base tone under reflection — black to white (mid gray default). */
    this.podiumGlassBrightness = clamp01(
      options.podiumGlassBrightness ?? DEFAULT_PODIUM_GLASS_BRIGHTNESS,
    );

    this.podium = null;
    this.podiumReflector = null;
    this._glassSepBlur = null;

    this.grid = null;
    this.gridMaterials = null;

    this.buildGrid();
    this.buildDefaultPodium();
    this.setSolidEnabled(this.solidEnabled);
    this.setWireEnabled(this.wireEnabled);
  }

  _disposeGlassSepBlur() {
    this._glassSepBlur?.dispose();
    this._glassSepBlur = null;
  }

  disposePodiumReflector() {
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

  disposePodium() {
    this.disposePodiumReflector();
    if (!this.podium) return;
    this.scene.remove(this.podium);
    disposeObjectGpuResources(this.podium);
    this.podium = null;
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
    this.podium.visible = this.solidEnabled;
    this.scene.add(this.podium);

    this.applyPodiumEnvironment(
      this._lastEnvTexture ?? this.scene.environment,
      this._lastHdriIntensity,
      this._lastHdriBlurriness,
    );

    this.setGroundY(this.groundY);
    this.rebuildPodiumReflector();
  }

  /**
   * Planar Reflector on the podium top — renders the scene (including the loaded mesh) each frame.
   * HDRI env reflections alone cannot show other objects.
   */
  rebuildPodiumReflector() {
    this.disposePodiumReflector();
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

    this.podium.add(reflector);
    this.podiumReflector = reflector;

    this._glassSepBlur = new PodiumGlassSeparableBlur(this.renderer, rw, rh);

    const scope = this;
    const originalBeforeRender = reflector.onBeforeRender;
    reflector.onBeforeRender = function podiumGlassOnBeforeRender(renderer, scene, camera) {
      originalBeforeRender.call(reflector, renderer, scene, camera);
      // Reflector restores the framebuffer via setRenderTarget but does not align Three's
      // logical viewport with the full canvas. Use drawing-buffer size so viewport matches
      // the backing store (getSize() can drift vs getDrawingBufferSize at DPR/export boundaries).
      const db = new THREE.Vector2();
      renderer.getDrawingBufferSize(db);
      const pr = Math.max(1e-6, renderer.getPixelRatio?.() ?? 1);
      renderer.setViewport(0, 0, db.x / pr, db.y / pr);
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

    applyPodiumGlassReflectorShader(
      reflector.material,
      this.podiumGlassAmount,
      this.podiumGlassBrightness,
    );
  }

  /** Call from SceneManager on resize so the reflector render target stays sharp enough without wasting pixels. */
  resizePodiumReflector(width, height) {
    if (!this.renderer) return;
    const logical = new THREE.Vector2();
    this.renderer.getSize(logical);
    const w = width ?? (logical.x > 0 ? logical.x : window.innerWidth);
    const h = height ?? (logical.y > 0 ? logical.y : window.innerHeight);
    const dpr = Math.max(1e-6, this.renderer.getPixelRatio?.() ?? 1);
    this._reflectorTexW = Math.max(256, Math.floor(w * dpr * PODIUM_REFLECTOR_RES_SCALE));
    this._reflectorTexH = Math.max(256, Math.floor(h * dpr * PODIUM_REFLECTOR_RES_SCALE));
    if (this.podium && this.podiumGlassSurface) this.rebuildPodiumReflector();
  }

  setPodiumGlassSurface(enabled) {
    this.podiumGlassSurface = !!enabled;
    if (this.podiumGlassSurface && !this.podiumReflector) {
      this.rebuildPodiumReflector();
    }
  }

  setPodiumGlassBlur(value) {
    this.podiumGlassBlur = clamp01(value);
  }

  setPodiumGlassAmount(value) {
    this.podiumGlassAmount = clamp01(value);
    const u = this.podiumReflector?.material?.uniforms?.reflectionAmount;
    if (u) u.value = this.podiumGlassAmount;
  }

  setPodiumGlassBrightness(value) {
    this.podiumGlassBrightness = clamp01(value);
    const u = this.podiumReflector?.material?.uniforms?.surfaceBrightness;
    if (u) u.value = this.podiumGlassBrightness;
  }

  /**
   * Keeps podium env/reflections in sync with the HDRI (same path as the loaded model).
   */
  applyPodiumEnvironment(envTexture, hdriIntensity, hdriBlurriness = 0) {
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

  setPodiumMetalness(value) {
    this.podiumMetalness = clamp01(value);
    this.applyPodiumEnvironment(this._lastEnvTexture, this._lastHdriIntensity, this._lastHdriBlurriness);
  }

  setPodiumRoughness(value) {
    this.podiumRoughness = clamp01(value);
    this.applyPodiumEnvironment(this._lastEnvTexture, this._lastHdriIntensity, this._lastHdriBlurriness);
  }

  setPodiumReflection(value) {
    const v = Number(value);
    this.podiumReflection = Math.min(3, Math.max(0, Number.isFinite(v) ? v : 1));
    this.applyPodiumEnvironment(this._lastEnvTexture, this._lastHdriIntensity, this._lastHdriBlurriness);
  }

  setPodiumClearcoat(value) {
    this.podiumClearcoat = clamp01(value);
    this.applyPodiumEnvironment(this._lastEnvTexture, this._lastHdriIntensity, this._lastHdriBlurriness);
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
      // Keep GridHelper color response consistent with mesh wireframe overlays.
      mat.toneMapped = true;
      if (mat.color) mat.color.set(this.wireColor);
    });
    this.grid.visible = this.wireEnabled;
    this.scene.add(this.grid);
    this.setGridY(this.gridY);
  }

  setSolidEnabled(enabled) {
    this.solidEnabled = !!enabled;

    if (!this.podium) {
      console.warn('[GroundController] Podium missing, rebuilding default…');
      this.buildDefaultPodium();
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
}
