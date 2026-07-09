import { N8AOPass } from 'n8ao';
import { renderSceneBeautyToTarget } from './renderSceneBeautyToTarget.js';

/**
 * N8AOPass with Meshgl studio background handling on the internal beauty buffer.
 * When AO is on, this pass replaces MeshglRenderPass — without the beauty hook, clear alpha /
 * gradient blit never run and the backdrop goes black.
 */
export class MeshglN8AOPass extends N8AOPass {
  /**
   * @param {import('three').Scene} scene
   * @param {import('three').Camera} camera
   * @param {number} width
   * @param {number} height
   * @param {{ resolveBackgroundGradientController?: (() => unknown) | null }} [opts]
   */
  constructor(scene, camera, width, height, opts = {}) {
    super(scene, camera, width, height);
    this.resolveBackgroundGradientController =
      typeof opts.resolveBackgroundGradientController === 'function'
        ? opts.resolveBackgroundGradientController
        : null;
    this._meshglN8aoRender = N8AOPass.prototype.render;
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

    renderSceneBeautyToTarget(renderer, this.scene, this.camera, this.beautyRenderTarget, {
      resolveBackgroundGradientController: this.resolveBackgroundGradientController,
      clearAlpha: 1,
    });

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
