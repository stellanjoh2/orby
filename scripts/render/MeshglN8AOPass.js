import * as THREE from 'three';
import { N8AOPass } from 'n8ao';
import { CopyShader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/shaders/CopyShader.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/ShaderPass.js';
import { renderSceneBeautyToTarget } from './renderSceneBeautyToTarget.js';
import { N8aoBackdropRestoreShader } from './n8aoBackdropRestoreShader.js';
import { N8AO_SKY_DEPTH_THRESHOLD } from './meshglN8aoBackdrop.js';
import { resetRendererFullViewport } from './resetRendererFullViewport.js';

/** Depth-only override — fills beauty depth for imports with depthWrite:false. */
function createBeautyDepthOverrideMaterial() {
  const mat = new THREE.MeshDepthMaterial();
  mat.skinning = true;
  mat.morphTargets = true;
  mat.colorWrite = false;
  return mat;
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
    this._meshglN8aoRender = N8AOPass.prototype.render;
    this._copyPass = new ShaderPass(CopyShader);
    this._copyPass.clear = false;
    this._restoreBackdropPass = new ShaderPass(N8aoBackdropRestoreShader);
    this._restoreBackdropPass.clear = false;
    this._backdropHoldRT = this._createPlateRenderTarget(width, height);
    this._beautyDepthMaterial = createBeautyDepthOverrideMaterial();
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
    const depthTex = beauty.depthTexture;
    if (depthTex?.image) {
      depthTex.image.width = width;
      depthTex.image.height = height;
      depthTex.needsUpdate = true;
    }
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

  /** Geometry-only beauty plate for N8AO (no HDRI depth/colour in sky pixels). */
  _seedBeautyForAo(renderer) {
    renderSceneBeautyToTarget(renderer, this.scene, this.camera, this.beautyRenderTarget, {
      resolveBackgroundGradientController: this.resolveBackgroundGradientController,
      resolveBackgroundController: this.resolveBackgroundController,
      clearAlpha: 1,
    });
    this._enforceBeautyDepth(renderer);
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
   */
  _compositeBackdropOverAo(renderer, readBuffer, writeBuffer, backdropHold) {
    const sceneDepth = this.beautyRenderTarget?.depthTexture;
    if (
      !readBuffer?.texture
      || !writeBuffer?.texture
      || !backdropHold?.texture
      || !sceneDepth
    ) {
      return;
    }

    const u = this._restoreBackdropPass.uniforms;
    u.tAO.value = writeBuffer.texture;
    u.tBackdrop.value = backdropHold.texture;
    u.tSceneDepth.value = sceneDepth;
    u.skyDepthThreshold.value = N8AO_SKY_DEPTH_THRESHOLD;
    this._restoreBackdropPass.render(renderer, readBuffer, writeBuffer);
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

    this._seedBeautyForAo(renderer);

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
      }
    } finally {
      this.configuration.autoRenderBeauty = prevAutoRenderBeauty;
      this.configuration.transparencyAware = prevTransparencyAware;
    }
  }
}
