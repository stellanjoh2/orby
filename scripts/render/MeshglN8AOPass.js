import * as THREE from 'three';
import { N8AOPass } from 'n8ao';
import { CopyShader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/shaders/CopyShader.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/ShaderPass.js';
import { USE_N8AO_VIEW_CACHE } from '../constants.js';
import { renderSceneBeautyToTarget } from './renderSceneBeautyToTarget.js';
import { N8aoBackdropRestoreShader } from './n8aoBackdropRestoreShader.js';
import {
  N8AO_SKY_DEPTH_THRESHOLD,
  getN8aoSceneLayerMaskWithoutOverlays,
  getN8aoScreenSpaceOverlayLayerMask,
  sceneHasN8aoDepthIgnoredMesh,
  sceneHasN8aoExcludedMesh,
  withCameraLayerMask,
  withN8aoExcludedMeshRenderHooksPaused,
  withOnlyN8aoExcludedMeshesVisible,
} from './meshglN8aoBackdrop.js';
import { needsN8aoViewRecompute, snapshotN8aoViewCache } from './meshglN8aoViewCache.js';
import { resetRendererFullViewport } from './resetRendererFullViewport.js';

/** Depth-only override — fills beauty depth for imports with depthWrite:false. */
function createBeautyDepthOverrideMaterial() {
  const mat = new THREE.MeshDepthMaterial();
  mat.skinning = true;
  mat.morphTargets = true;
  mat.colorWrite = false;
  return mat;
}

/** White fill for the base-glass screen mask (restores RenderPass colour in composite). */
function createGlassMaskOverrideMaterial() {
  return new THREE.MeshBasicMaterial({ color: 0xffffff });
}

/**
 * N8AO with Meshgl studio background handling.
 *
 * MeshglRenderPass stays enabled and paints the full backdrop plate (HDRI / solid / gradient).
 * N8AO samples geometry-only depth, tints meshes, then sky pixels are restored from RenderPass.
 */
export class MeshglN8AOPass extends N8AOPass {
  /**
   * @param {import('three').Scene} scene
   * @param {import('three').Camera} camera
   * @param {number} width
   * @param {number} height
   * @param {{
   *   resolveBackgroundGradientController?: (() => unknown) | null,
   *   resolveBackgroundController?: (() => unknown) | null,
   *   resolveRenderPassColorBuffer?: (() => import('three').WebGLRenderTarget | null) | null,
   *   resolveOrbitControls?: (() => import('three/examples/jsm/controls/OrbitControls.js').OrbitControls | null | undefined) | null,
   *   resolveModelRoot?: (() => import('three').Object3D | null | undefined) | null,
   *   resolveForceAoRecompute?: (() => boolean) | null,
   * }} [opts]
   */
  constructor(scene, camera, width, height, opts = {}) {
    super(scene, camera, width, height);
    this.resolveBackgroundGradientController =
      typeof opts.resolveBackgroundGradientController === 'function'
        ? opts.resolveBackgroundGradientController
        : null;
    this.resolveBackgroundController =
      typeof opts.resolveBackgroundController === 'function'
        ? opts.resolveBackgroundController
        : null;
    this.resolveRenderPassColorBuffer =
      typeof opts.resolveRenderPassColorBuffer === 'function'
        ? opts.resolveRenderPassColorBuffer
        : null;
    this.resolveOrbitControls =
      typeof opts.resolveOrbitControls === 'function' ? opts.resolveOrbitControls : null;
    this.resolveModelRoot =
      typeof opts.resolveModelRoot === 'function' ? opts.resolveModelRoot : null;
    this.resolveForceAoRecompute =
      typeof opts.resolveForceAoRecompute === 'function' ? opts.resolveForceAoRecompute : null;
    this._meshglN8aoRender = N8AOPass.prototype.render;
    this._copyPass = new ShaderPass(CopyShader);
    this._copyPass.clear = false;
    this._restoreBackdropPass = new ShaderPass(N8aoBackdropRestoreShader);
    this._restoreBackdropPass.clear = false;
    this._backdropHoldRT = this._createPlateRenderTarget(width, height);
    this._glassMaskRT = this._createPlateRenderTarget(width, height);
    this._aoResultRT = this._createPlateRenderTarget(width, height);
    this._beautyDepthMaterial = createBeautyDepthOverrideMaterial();
    this._glassMaskMaterial = createGlassMaskOverrideMaterial();
    this._viewCacheValid = false;
    this._cacheHadGlassMesh = false;
    this._cacheCameraPos = new THREE.Vector3();
    this._cacheCameraQuat = new THREE.Quaternion();
    this._cacheProjection = new THREE.Matrix4();
    this._cacheModelMatrix = new THREE.Matrix4();
    // Final plate lands in readBuffer — RenderPass wrote there; bloom reads it next.
    this.needsSwap = false;
    this.autoDetectTransparency = false;
  }

  /** @param {number} width @param {number} height */
  _createPlateRenderTarget(width, height) {
    return new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }

  setSize(width, height) {
    super.setSize(width, height);
    const beauty = this.beautyRenderTarget;
    if (!beauty) return;
    beauty.setSize(width, height);
    this._backdropHoldRT?.setSize(width, height);
    this._glassMaskRT?.setSize(width, height);
    this._aoResultRT?.setSize(width, height);
    this.invalidateViewCache();
    const depthTex = beauty.depthTexture;
    if (depthTex?.image) {
      depthTex.image.width = width;
      depthTex.image.height = height;
      depthTex.needsUpdate = true;
    }
  }

  /** Drop cached AO geometry plate — call on resize, model swap, or AO setting changes. */
  invalidateViewCache() {
    this._viewCacheValid = false;
  }

  /** @returns {boolean} */
  _needsRecomputeViewDependentAo() {
    if (!USE_N8AO_VIEW_CACHE) return true;
    return needsN8aoViewRecompute({
      viewCacheValid: this._viewCacheValid,
      resolveOrbitControls: this.resolveOrbitControls,
      resolveModelRoot: this.resolveModelRoot,
      resolveForceAoRecompute: this.resolveForceAoRecompute,
      camera: this.camera,
      scene: this.scene,
      cacheCameraPos: this._viewCacheValid ? this._cacheCameraPos : null,
      cacheCameraQuat: this._viewCacheValid ? this._cacheCameraQuat : null,
      cacheProjection: this._viewCacheValid ? this._cacheProjection : null,
      cacheModelMatrix: this._viewCacheValid ? this._cacheModelMatrix : null,
      cacheHadGlassMesh: this._cacheHadGlassMesh,
    });
  }

  _markViewCacheFromCurrentScene() {
    const snap = snapshotN8aoViewCache({
      camera: this.camera,
      scene: this.scene,
      resolveModelRoot: this.resolveModelRoot,
      cacheCameraPos: this._cacheCameraPos,
      cacheCameraQuat: this._cacheCameraQuat,
      cacheProjection: this._cacheProjection,
      cacheModelMatrix: this._cacheModelMatrix,
    });
    this._cacheHadGlassMesh = snap.cacheHadGlassMesh;
    this._viewCacheValid = true;
  }

  /**
   * @param {import('three').WebGLRenderTarget | null | undefined} writeBuffer
   * @param {import('three').WebGLRenderTarget | null | undefined} readBuffer
   */
  _resolveBackdropColorBuffer(writeBuffer, readBuffer) {
    const fromRenderPass = this.resolveRenderPassColorBuffer?.();
    if (fromRenderPass?.texture) return fromRenderPass;
    if (readBuffer?.texture) return readBuffer;
    if (writeBuffer?.texture) return writeBuffer;
    return null;
  }

  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').WebGLRenderTarget} dest
   * @param {import('three').WebGLRenderTarget} source
   */
  _copyRenderTarget(renderer, dest, source) {
    if (!dest?.texture || !source?.texture) return;
    this._copyPass.render(renderer, dest, source);
  }

  /** Geometry beauty plate for N8AO — glass stays visible so AO samples real contact depth. */
  _seedBeautyForAo(renderer) {
    const camera = this.camera;
    withCameraLayerMask(
      camera,
      getN8aoSceneLayerMaskWithoutOverlays(camera.layers.mask),
      () => {
        renderSceneBeautyToTarget(renderer, this.scene, camera, this.beautyRenderTarget, {
          resolveBackgroundGradientController: this.resolveBackgroundGradientController,
          resolveBackgroundController: this.resolveBackgroundController,
          clearAlpha: 1,
        });
        this._enforceBeautyDepth(renderer);
      },
    );
  }

  /** @param {number} value */
  setGlassAoFloor(value) {
    const u = this._restoreBackdropPass.uniforms.glassAoFloor;
    if (u) u.value = THREE.MathUtils.clamp(value, 0, 1);
  }

  /**
   * @param {import('three').WebGLRenderer} renderer
   */
  _clearGlassMask(renderer) {
    const maskRT = this._glassMaskRT;
    if (!maskRT) return;
    const oldTarget = renderer.getRenderTarget();
    const oldAutoClear = renderer.autoClear;
    const oldClearColor = renderer.getClearColor(new THREE.Color());
    const oldClearAlpha = renderer.getClearAlpha();
    try {
      renderer.setClearColor(0x000000, 1);
      renderer.autoClear = true;
      renderer.setRenderTarget(maskRT);
      resetRendererFullViewport(renderer);
      renderer.clear(true, false, false);
    } finally {
      renderer.setClearColor(oldClearColor, oldClearAlpha);
      renderer.autoClear = oldAutoClear;
      renderer.setRenderTarget(oldTarget);
      resetRendererFullViewport(renderer);
    }
  }

  /**
   * Screen mask for base glass — composite restores the RenderPass reflection plate there.
   *
   * @param {import('three').WebGLRenderer} renderer
   */
  _renderGlassMask(renderer) {
    const maskRT = this._glassMaskRT;
    if (!maskRT) return;
    if (!sceneHasN8aoExcludedMesh(this.scene)) {
      this._clearGlassMask(renderer);
      return;
    }

    withOnlyN8aoExcludedMeshesVisible(this.scene, () => {
      withN8aoExcludedMeshRenderHooksPaused(this.scene, () => {
        const camera = this.camera;
        const savedCameraViewport = camera?.viewport;
        if (camera && savedCameraViewport !== undefined) {
          camera.viewport = undefined;
        }

        const oldTarget = renderer.getRenderTarget();
        const oldAutoClear = renderer.autoClear;
        const oldOverride = this.scene.overrideMaterial;
        const oldClearColor = renderer.getClearColor(new THREE.Color());
        const oldClearAlpha = renderer.getClearAlpha();
        let savedSceneBackground = null;

        try {
          savedSceneBackground = this.scene.background;
          this.scene.background = null;
          this.scene.overrideMaterial = this._glassMaskMaterial;

          renderer.setClearColor(0x000000, 1);
          renderer.autoClear = true;
          renderer.setRenderTarget(maskRT);
          resetRendererFullViewport(renderer);
          renderer.clear(true, true, true);
          renderer.render(this.scene, camera);
        } finally {
          if (savedSceneBackground !== null) {
            this.scene.background = savedSceneBackground;
          }
          this.scene.overrideMaterial = oldOverride;
          renderer.setClearColor(oldClearColor, oldClearAlpha);
          renderer.autoClear = oldAutoClear;
          renderer.setRenderTarget(oldTarget);
          if (camera && savedCameraViewport !== undefined) {
            camera.viewport = savedCameraViewport;
          }
          resetRendererFullViewport(renderer);
        }
      });
    });
  }

  /**
   * Depth-only pass into the existing beauty colour buffer — ensures AO + sky mask see
   * mesh/base/podium even when import materials use depthWrite:false.
   *
   * @param {import('three').WebGLRenderer} renderer
   */
  _enforceBeautyDepth(renderer) {
    const beauty = this.beautyRenderTarget;
    if (!beauty?.depthTexture) return;

    const camera = this.camera;
    const savedCameraViewport = camera?.viewport;
    if (camera && savedCameraViewport !== undefined) {
      camera.viewport = undefined;
    }

    const oldTarget = renderer.getRenderTarget();
    const oldAutoClear = renderer.autoClear;
    const oldOverride = this.scene.overrideMaterial;
    let savedSceneBackground = null;

    try {
      savedSceneBackground = this.scene.background;
      this.scene.background = null;
      this.scene.overrideMaterial = this._beautyDepthMaterial;

      renderer.autoClear = false;
      renderer.setRenderTarget(beauty);
      resetRendererFullViewport(renderer);
      renderer.render(this.scene, camera);
    } finally {
      if (savedSceneBackground !== null) {
        this.scene.background = savedSceneBackground;
      }
      this.scene.overrideMaterial = oldOverride;
      renderer.autoClear = oldAutoClear;
      renderer.setRenderTarget(oldTarget);
      if (camera && savedCameraViewport !== undefined) {
        camera.viewport = savedCameraViewport;
      }
      resetRendererFullViewport(renderer);
    }
  }

  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').WebGLRenderTarget | null | undefined} backdropBuffer
   * @returns {import('three').WebGLRenderTarget | null}
   */
  _preserveBackdropPlate(renderer, backdropBuffer) {
    if (!backdropBuffer?.texture || !this._backdropHoldRT) return null;
    this._copyRenderTarget(renderer, this._backdropHoldRT, backdropBuffer);
    return this._backdropHoldRT;
  }

  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').WebGLRenderTarget} readBuffer
   * @param {import('three').WebGLRenderTarget} writeBuffer
   * @param {import('three').WebGLRenderTarget} backdropHold
   * @param {import('three').Texture | null | undefined} [aoTextureOverride]
   */
  _compositeBackdropOverAo(renderer, readBuffer, writeBuffer, backdropHold, aoTextureOverride) {
    const beauty = this.beautyRenderTarget;
    const sceneDepth = beauty?.depthTexture;
    const glassMask = this._glassMaskRT?.texture;
    const aoTexture = aoTextureOverride ?? writeBuffer?.texture;
    if (
      !readBuffer?.texture
      || !writeBuffer?.texture
      || !aoTexture
      || !backdropHold?.texture
      || !beauty?.texture
      || !sceneDepth
      || !glassMask
    ) {
      return;
    }

    const u = this._restoreBackdropPass.uniforms;
    u.tAO.value = aoTexture;
    u.tBackdrop.value = backdropHold.texture;
    u.tBeauty.value = beauty.texture;
    u.tSceneDepth.value = sceneDepth;
    u.tGlassMask.value = glassMask;
    u.skyDepthThreshold.value = N8AO_SKY_DEPTH_THRESHOLD;
    this._restoreBackdropPass.render(renderer, readBuffer, writeBuffer);
  }

  /**
   * Lens flare and other screen-space overlays are omitted from RenderPass while AO is on
   * so the glass composite stays reflection-only. Re-draw them additively after composite.
   *
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').WebGLRenderTarget} readBuffer
   */
  _restoreScreenSpaceOverlays(renderer, readBuffer) {
    if (!readBuffer || !sceneHasN8aoDepthIgnoredMesh(this.scene)) return;

    const camera = this.camera;
    const savedCameraViewport = camera?.viewport;
    if (camera && savedCameraViewport !== undefined) {
      camera.viewport = undefined;
    }

    const oldTarget = renderer.getRenderTarget();
    const oldAutoClear = renderer.autoClear;
    let savedSceneBackground = null;

    try {
      // Never redraw scene.background here — it replaces the AO composite (mesh vanishes).
      savedSceneBackground = this.scene.background;
      this.scene.background = null;
      renderer.autoClear = false;
      renderer.setRenderTarget(readBuffer);
      resetRendererFullViewport(renderer);
      withCameraLayerMask(camera, getN8aoScreenSpaceOverlayLayerMask(), () => {
        renderer.render(this.scene, camera);
      });
    } finally {
      if (savedSceneBackground !== null) {
        this.scene.background = savedSceneBackground;
      }
      renderer.autoClear = oldAutoClear;
      renderer.setRenderTarget(oldTarget);
      if (camera && savedCameraViewport !== undefined) {
        camera.viewport = savedCameraViewport;
      }
      resetRendererFullViewport(renderer);
    }
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    if (!this.enabled) {
      return this._meshglN8aoRender.call(
        this,
        renderer,
        writeBuffer,
        readBuffer,
        deltaTime,
        maskActive,
      );
    }

    const backdropBuffer = this._resolveBackdropColorBuffer(writeBuffer, readBuffer);
    const backdropHold = this._preserveBackdropPlate(renderer, backdropBuffer);
    const recomputeAo = this._needsRecomputeViewDependentAo();

    if (!recomputeAo && backdropHold && this._aoResultRT?.texture) {
      this._compositeBackdropOverAo(
        renderer,
        readBuffer,
        writeBuffer,
        backdropHold,
        this._aoResultRT.texture,
      );
      this._restoreScreenSpaceOverlays(renderer, readBuffer);
      return;
    }

    this._seedBeautyForAo(renderer);
    this._renderGlassMask(renderer);

    const prevAutoRenderBeauty = this.configuration.autoRenderBeauty;
    const prevTransparencyAware = this.configuration.transparencyAware;
    this.autoDetectTransparency = false;
    this.configuration.autoRenderBeauty = false;
    this.configuration.transparencyAware = false;
    try {
      this._meshglN8aoRender.call(
        this,
        renderer,
        writeBuffer,
        readBuffer,
        deltaTime,
        maskActive,
      );
      if (backdropHold) {
        this._compositeBackdropOverAo(renderer, readBuffer, writeBuffer, backdropHold);
        this._restoreScreenSpaceOverlays(renderer, readBuffer);
      }
      if (writeBuffer?.texture && this._aoResultRT) {
        this._copyRenderTarget(renderer, this._aoResultRT, writeBuffer);
        this._markViewCacheFromCurrentScene();
      }
    } finally {
      this.configuration.autoRenderBeauty = prevAutoRenderBeauty;
      this.configuration.transparencyAware = prevTransparencyAware;
    }
  }
}
