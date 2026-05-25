import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/RenderPass.js';
import { resetRendererFullViewport } from './resetRendererFullViewport.js';

/**
 * RenderPass with full-canvas viewport restore around the scene draw (including after
 * setRenderTarget). Transmission sizes its RT from the active viewport — a partial viewport
 * from bloom/reflector passes becomes a screen-fixed black band on the next frame.
 */
export class MeshglRenderPass extends RenderPass {
  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    const camera = this.camera;
    const savedCameraViewport = camera?.viewport;
    if (camera && savedCameraViewport !== undefined) {
      camera.viewport = undefined;
    }

    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    let oldClearAlpha;
    let oldOverrideMaterial;

    if (this.overrideMaterial !== null) {
      oldOverrideMaterial = this.scene.overrideMaterial;
      this.scene.overrideMaterial = this.overrideMaterial;
    }

    if (this.clearColor !== null) {
      renderer.getClearColor(this._oldClearColor);
      renderer.setClearColor(this.clearColor, renderer.getClearAlpha());
    }

    if (this.clearAlpha !== null) {
      oldClearAlpha = renderer.getClearAlpha();
      renderer.setClearAlpha(this.clearAlpha);
    }

    if (this.clearDepth === true) {
      renderer.clearDepth();
    }

    try {
      resetRendererFullViewport(renderer);
      renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
      // setRenderTarget copies the RT viewport — re-assert full canvas before the scene draw.
      resetRendererFullViewport(renderer);

      if (this.clear === true) {
        renderer.clear(
          renderer.autoClearColor,
          renderer.autoClearDepth,
          renderer.autoClearStencil,
        );
      }

      resetRendererFullViewport(renderer);
      renderer.render(this.scene, this.camera);
    } finally {
      if (this.clearColor !== null) {
        renderer.setClearColor(this._oldClearColor);
      }
      if (this.clearAlpha !== null) {
        renderer.setClearAlpha(oldClearAlpha);
      }
      if (this.overrideMaterial !== null) {
        this.scene.overrideMaterial = oldOverrideMaterial;
      }
      renderer.autoClear = oldAutoClear;
      if (camera && savedCameraViewport !== undefined) {
        camera.viewport = savedCameraViewport;
      }
      resetRendererFullViewport(renderer);
    }
  }
}
