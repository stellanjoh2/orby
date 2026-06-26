import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/RenderPass.js';
import { resetRendererFullViewport } from './resetRendererFullViewport.js';

/**
 * RenderPass with full-canvas viewport restore around the scene draw (including after
 * setRenderTarget). Transmission sizes its RT from the active viewport — a partial viewport
 * from bloom/reflector passes becomes a screen-fixed black band on the next frame.
 */
export class MeshglRenderPass extends RenderPass {
  _resolveBackgroundGradientController() {
    const resolver = this.resolveBackgroundGradientController;
    if (typeof resolver === 'function') {
      return resolver() ?? null;
    }
    const legacy = this.getBackgroundGradientController;
    if (typeof legacy === 'function') {
      return legacy() ?? null;
    }
    return legacy ?? null;
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    const camera = this.camera;
    const savedCameraViewport = camera?.viewport;
    if (camera && savedCameraViewport !== undefined) {
      camera.viewport = undefined;
    }

    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    let oldOverrideMaterial;

    if (this.overrideMaterial !== null) {
      oldOverrideMaterial = this.scene.overrideMaterial;
      this.scene.overrideMaterial = this.overrideMaterial;
    }

    // Apply pass clear alpha before clearColor — bloom passes can leave clearAlpha=0 on the
    // renderer; setClearColor(..., getClearAlpha()) would otherwise clear the scene RT wrong.
    if (this.clearAlpha !== null) {
      renderer.setClearAlpha(this.clearAlpha);
    }

    if (this.clearColor !== null) {
      renderer.getClearColor(this._oldClearColor);
      const clearAlpha =
        this.clearAlpha !== null ? this.clearAlpha : renderer.getClearAlpha();
      renderer.setClearColor(this.clearColor, clearAlpha);
    }

    if (this.clearDepth === true) {
      renderer.clearDepth();
    }

    try {
      const gradientCtrl = this._resolveBackgroundGradientController();
      const useCaptureBlit = gradientCtrl?.shouldBlitForCapture?.() === true;
      const keepExportViewport = this._keepExportCaptureViewport === true || useCaptureBlit;

      if (!keepExportViewport) {
        resetRendererFullViewport(renderer);
      }
      renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);

      if (useCaptureBlit) {
        gradientCtrl.pinCaptureViewport(renderer);
      } else if (!keepExportViewport) {
        resetRendererFullViewport(renderer);
      }

      if (useCaptureBlit) {
        // Gradient is composited in CPU after readback — transparent GL background only.
        if (this.clear === true) {
          renderer.clear(
            renderer.autoClearColor,
            renderer.autoClearDepth,
            renderer.autoClearStencil,
          );
        }
      } else if (this.clear === true) {
        renderer.clear(
          renderer.autoClearColor,
          renderer.autoClearDepth,
          renderer.autoClearStencil,
        );
      }

      if (useCaptureBlit) {
        gradientCtrl.pinCaptureViewport(renderer);
      } else if (!keepExportViewport) {
        resetRendererFullViewport(renderer);
      }
      renderer.render(this.scene, this.camera);
    } finally {
      if (this.clearColor !== null) {
        renderer.setClearColor(this._oldClearColor);
      }
      if (this.clearAlpha !== null) {
        // Do not restore bloom-pass clearAlpha=0 — studio canvas is alpha:true.
        renderer.setClearAlpha(this.clearAlpha);
      }
      if (this.overrideMaterial !== null) {
        this.scene.overrideMaterial = oldOverrideMaterial;
      }
      renderer.autoClear = oldAutoClear;
      if (camera && savedCameraViewport !== undefined) {
        camera.viewport = savedCameraViewport;
      }
      const keepExportViewport =
        this._keepExportCaptureViewport === true
        || this._resolveBackgroundGradientController()?.shouldBlitForCapture?.();
      if (!keepExportViewport) {
        resetRendererFullViewport(renderer);
      }
    }
  }
}
