import * as THREE from 'three';
import { N8AOPass } from 'n8ao';
import { CopyShader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/shaders/CopyShader.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/ShaderPass.js';
import { resetRendererFullViewport } from './resetRendererFullViewport.js';

/**
 * N8AO with Meshgl backdrop handling.
 *
 * N8AOPass normally *replaces* RenderPass and re-renders the scene into an internal beauty
 * buffer — that second render skips Meshgl's clear-color / gradient backdrop and goes black.
 *
 * Keep MeshglRenderPass enabled; seed N8AO's beauty plate from the composer color buffer
 * (which already has the correct backdrop), then rebuild depth on the beauty target.
 */
export class MeshglN8AOPass extends N8AOPass {
  /**
   * @param {import('three').Scene} scene
   * @param {import('three').Camera} camera
   * @param {number} width
   * @param {number} height
   */
  constructor(scene, camera, width, height) {
    super(scene, camera, width, height);
    this._meshglN8aoRender = N8AOPass.prototype.render;
    this._beautyColorCopyPass = new ShaderPass(CopyShader);
    this._depthCaptureMaterial = new THREE.MeshDepthMaterial();
    this._depthCaptureMaterial.colorWrite = false;
  }

  /**
   * N8AO's stock `setSize` skips `beautyRenderTarget` — export resize leaves a smaller beauty
   * plate composited into full-size ping-pong RTs (cropped gradient / duplicated bg in capture).
   */
  setSize(width, height) {
    super.setSize(width, height);
    const beauty = this.beautyRenderTarget;
    if (!beauty) return;
    beauty.setSize(width, height);
    const depthTex = beauty.depthTexture;
    if (depthTex?.image) {
      depthTex.image.width = width;
      depthTex.image.height = height;
      depthTex.needsUpdate = true;
    }
  }

  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').WebGLRenderTarget | null | undefined} composerColorBuffer
   */
  _seedBeautyFromComposer(renderer, composerColorBuffer) {
    const beauty = this.beautyRenderTarget;
    if (!beauty || !composerColorBuffer?.texture) return;

    this._beautyColorCopyPass.uniforms.tDiffuse.value = composerColorBuffer.texture;
    this._beautyColorCopyPass.render(renderer, null, beauty);

    const oldTarget = renderer.getRenderTarget();
    const oldAutoClear = renderer.autoClear;
    const oldOverride = this.scene.overrideMaterial;
    const camera = this.camera;
    const savedCameraViewport = camera?.viewport;
    if (camera && savedCameraViewport !== undefined) {
      camera.viewport = undefined;
    }

    renderer.autoClear = false;
    this.scene.overrideMaterial = this._depthCaptureMaterial;
    try {
      renderer.setRenderTarget(beauty);
      resetRendererFullViewport(renderer);
      renderer.clear(false, true, false);
      renderer.render(this.scene, camera);
    } finally {
      this.scene.overrideMaterial = oldOverride;
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

    // readBuffer holds MeshglRenderPass output (correct #202020 / gradient / HDRI backdrop).
    this._seedBeautyFromComposer(renderer, readBuffer);

    const prevAutoRenderBeauty = this.configuration.autoRenderBeauty;
    this.configuration.autoRenderBeauty = false;
    try {
      return this._meshglN8aoRender.call(
        this,
        renderer,
        writeBuffer,
        readBuffer,
        deltaTime,
        maskActive,
      );
    } finally {
      this.configuration.autoRenderBeauty = prevAutoRenderBeauty;
    }
  }
}
