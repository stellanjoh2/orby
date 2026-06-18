import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/Pass.js';
import {
  BokehShader,
  BokehDepthShader,
  resolveDofBokeh2Quality,
} from './BokehShader2.js';
import { resolveDofCocFalloffDistance } from './dofFocalDepth.js';

const {
  FloatType,
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
    this.getDofDepthProxies =
      typeof params.getDofDepthProxies === 'function'
        ? params.getDofDepthProxies
        : () => {
            const proxy = this.getDofDepthProxy?.();
            return proxy ? [proxy] : [];
          };
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
      type: FloatType,
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
   *   modelViewDepthSpan?: number | null,
   * }} settings
   */
  applySettings(settings) {
    this._lastSettings = settings;
    const u = this.uniforms;
    const nearMul = Math.max(0, settings.foregroundBlur ?? 1);
    const farMul = Math.max(0, settings.backgroundBlur ?? 1);
    const cocBand = resolveDofCocFalloffDistance(
      settings.focalDepth ?? 1.5,
      settings.modelViewDepthSpan,
    );

    u.focalDepth.value = settings.focalDepth;
    u.focalLength.value = settings.focalLengthMm ?? 35;
    u.fstop.value = settings.fstop;
    u.maxblur.value = settings.maxblur;
    u.nearBlurMul.value = nearMul;
    u.farBlurMul.value = farMul;
    u.manualdof.value = true;
    // Ramp width is subject-relative; near/far sliders only scale kernel strength in the shader.
    u.ndofstart.value = 0.0;
    u.ndofdist.value = cocBand;
    u.fdofstart.value = 0.0;
    u.fdofdist.value = cocBand;
    u.shaderFocus.value = false;
    u.focusCoords.value.set(0.5, 0.5);
    u.noise.value = 1;
    u.dithering.value = 0.0001;
    u.threshold.value = 1.0;
    u.gain.value = 0.0;
    u.bias.value = 0.35;
    u.fringe.value = 0.12;
    u.depthblur.value = 0;
    u.pentagon.value = 0;
    u.vignetting.value = 0;
    u.showFocus.value = 0;
    u.znear.value = this.camera.near;
    u.zfar.value = this.camera.far;
    u.groundPlaneY.value =
      typeof settings.groundPlaneY === 'number' && Number.isFinite(settings.groundPlaneY)
        ? settings.groundPlaneY
        : 0;
    u.groundPlaneEnabled.value = settings.groundPlaneEnabled ? 1 : 0;
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
    const depthProxies = this.getDofDepthProxies?.() ?? [];
    /** @type {import('three').Object3D[]} */
    const restoreDepthProxies = [];
    for (let i = 0; i < depthProxies.length; i++) {
      const proxy = depthProxies[i];
      if (proxy && proxy.visible === false) {
        proxy.visible = true;
        restoreDepthProxies.push(proxy);
      }
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

    for (let i = 0; i < restoreDepthProxies.length; i++) {
      restoreDepthProxies[i].visible = false;
    }
    this.scene.overrideMaterial = null;

    this.uniforms.tColor.value = readBuffer.texture;
    this.uniforms.tDepth.value = this.renderTargetDepth.texture;

    const cam = this.camera;
    if (cam) {
      cam.updateMatrixWorld?.();
      if (cam.projectionMatrixInverse) {
        this.uniforms.cameraProjectionMatrixInverse.value.copy(cam.projectionMatrixInverse);
      }
      if (cam.matrixWorld) {
        this.uniforms.cameraMatrixWorld.value.copy(cam.matrixWorld);
      }
      if (cam.matrixWorldInverse) {
        this.uniforms.cameraViewMatrix.value.copy(cam.matrixWorldInverse);
      }
      this.uniforms.dofCameraWorldPosition.value.setFromMatrixPosition(cam.matrixWorld);
    }

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
