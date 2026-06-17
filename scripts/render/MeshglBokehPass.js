import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/Pass.js';
import {
  BokehShader,
  BokehDepthShader,
  resolveDofBokeh2Quality,
} from './BokehShader2.js';

const {
  HalfFloatType,
  NearestFilter,
  ShaderMaterial,
  UniformsUtils,
  WebGLRenderTarget,
} = THREE;

/**
 * Martins Upitis BokehShader2 — same stack as three.js webgl_postprocessing_dof2.
 */
class MeshglBokehPass extends Pass {
  constructor(scene, camera, params = {}) {
    super();

    this.scene = scene;
    this.camera = camera;
    this.getDofDepthProxy =
      typeof params.getDofDepthProxy === 'function' ? params.getDofDepthProxy : null;
    /** @type {import('three').Object3D[]} */
    this._bokehDepthHideStack = [];
    /** BokehDepthShader output — not compatible with RGBADepthPacking god-rays reuse. */
    this.usesBokeh2Depth = true;

    this._rings = 3;
    this._samples = 4;
    this._lastSettings = null;
    this._lastSize = { w: 1, h: 1 };

    this.renderTargetDepth = new WebGLRenderTarget(1, 1, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      type: HalfFloatType,
    });
    this.renderTargetDepth.texture.name = 'MeshglBokehPass.depth';

    const depthSpec = BokehDepthShader;
    this.materialDepth = new ShaderMaterial({
      uniforms: UniformsUtils.clone(depthSpec.uniforms),
      vertexShader: depthSpec.vertexShader,
      fragmentShader: depthSpec.fragmentShader,
    });

    this._rebuildBokehMaterial();
    this.fsQuad = new FullScreenQuad(this.materialBokeh);
    this.uniforms = this.materialBokeh.uniforms;
    this._oldClearColor = new THREE.Color();

    this.setDofQualityTier('high');
  }

  _rebuildBokehMaterial() {
    this.materialBokeh?.dispose?.();
    const spec = BokehShader;
    this.materialBokeh = new ShaderMaterial({
      defines: {
        RINGS: this._rings,
        SAMPLES: this._samples,
      },
      uniforms: UniformsUtils.clone(spec.uniforms),
      vertexShader: spec.vertexShader,
      fragmentShader: spec.fragmentShader,
    });
    if (this.fsQuad) {
      this.fsQuad.material = this.materialBokeh;
    }
    this.uniforms = this.materialBokeh.uniforms;
    if (this._lastSettings) {
      this.applySettings(this._lastSettings);
    }
    if (this._lastSize.w > 0 && this._lastSize.h > 0) {
      this.setSize(this._lastSize.w, this._lastSize.h);
    }
  }

  /** @param {string | undefined} qualityId */
  setDofQualityTier(qualityId) {
    const { rings, samples } = resolveDofBokeh2Quality(qualityId);
    if (rings === this._rings && samples === this._samples) return;
    this._rings = rings;
    this._samples = samples;
    this._rebuildBokehMaterial();
  }

  setSize(width, height) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this._lastSize.w = w;
    this._lastSize.h = h;
    this.renderTargetDepth.setSize(w, h);
    if (this.uniforms) {
      this.uniforms.textureWidth.value = w;
      this.uniforms.textureHeight.value = h;
    }
    if (this.materialBokeh) {
      this.materialBokeh.uniforms.textureWidth.value = w;
      this.materialBokeh.uniforms.textureHeight.value = h;
    }
  }

  /**
   * @param {{
   *   focalDepth: number,
   *   focalLengthMm?: number,
   *   fstop: number,
   *   maxblur: number,
   *   foregroundBlur?: number,
   *   backgroundBlur?: number,
   *   focusMode?: string,
   * }} settings
   */
  applySettings(settings) {
    this._lastSettings = settings;
    const u = this.uniforms;
    const fg = Math.max(0.05, settings.foregroundBlur ?? 1);
    const bg = Math.max(0.05, settings.backgroundBlur ?? 1);
    const fgScale = 1.0 / Math.max(0.2, fg);
    const bgScale = 1.0 / Math.max(0.2, bg);

    u.focalDepth.value = settings.focalDepth;
    u.focalLength.value = settings.focalLengthMm ?? 35;
    u.fstop.value = settings.fstop;
    u.maxblur.value = settings.maxblur;
    u.manualdof.value = true;
    // CoC ramps in meters (view depth) — wide enough to avoid knife-edge transitions.
    u.ndofstart.value = 0.05 * bgScale;
    u.ndofdist.value = Math.max(0.55, 1.35 * bgScale);
    u.fdofstart.value = 0.05 * fgScale;
    u.fdofdist.value = Math.max(0.45, 1.1 * fgScale);
    u.shaderFocus.value = false;
    u.focusCoords.value.set(0.5, 0.5);
    u.noise.value = 1;
    u.dithering.value = 0.0001;
    u.threshold.value = 1.0;
    u.gain.value = 0.0;
    u.bias.value = 0.35;
    u.fringe.value = 0.12;
    u.depthblur.value = 1;
    u.pentagon.value = 0;
    u.vignetting.value = 0;
    u.showFocus.value = 0;
    u.znear.value = this.camera.near;
    u.zfar.value = this.camera.far;
    this.materialDepth.uniforms.mNear.value = this.camera.near;
    this.materialDepth.uniforms.mFar.value = this.camera.far;
  }

  _beginBokehDepthExclusions() {
    this._bokehDepthHideStack.length = 0;
    this.scene.traverse((obj) => {
      if (!obj.visible) return;
      if (obj.userData?.skipBokehDepth || obj.userData?.lensflare != null) {
        this._bokehDepthHideStack.push(obj);
        obj.visible = false;
      }
    });
  }

  _endBokehDepthExclusions() {
    for (let i = 0; i < this._bokehDepthHideStack.length; i++) {
      this._bokehDepthHideStack[i].visible = true;
    }
    this._bokehDepthHideStack.length = 0;
  }

  render(renderer, writeBuffer, readBuffer) {
    const depthProxy = this.getDofDepthProxy?.() ?? null;
    let restoreDepthProxy = false;
    if (depthProxy && depthProxy.visible === false) {
      depthProxy.visible = true;
      restoreDepthProxy = true;
    }

    this.scene.overrideMaterial = this.materialDepth;
    renderer.getClearColor(this._oldClearColor);
    const oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    // Far plane in BokehDepthShader packs to ~0 (black). Match uncleared sky pixels.
    renderer.setClearColor(0x000000);
    renderer.setClearAlpha(1.0);
    renderer.setRenderTarget(this.renderTargetDepth);
    renderer.clear();

    this._beginBokehDepthExclusions();
    try {
      renderer.render(this.scene, this.camera);
    } finally {
      this._endBokehDepthExclusions();
    }

    if (restoreDepthProxy) {
      depthProxy.visible = false;
    }
    this.scene.overrideMaterial = null;

    this.uniforms.tColor.value = readBuffer.texture;
    this.uniforms.tDepth.value = this.renderTargetDepth.texture;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      renderer.clear();
      this.fsQuad.render(renderer);
    }

    renderer.setClearColor(this._oldClearColor);
    renderer.setClearAlpha(oldClearAlpha);
    renderer.autoClear = oldAutoClear;
  }

  dispose() {
    this.renderTargetDepth.dispose();
    this.materialDepth.dispose();
    this.materialBokeh.dispose();
    this.fsQuad.dispose();
  }
}

export { MeshglBokehPass };
