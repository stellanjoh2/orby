import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/RenderPass.js';
import { getDrawingBufferPixels } from './drawingBufferSize.js';
import { ensureExportCapturePixelRatio } from './capture/forceExportCaptureFramebuffer.js';
import {
  pinRenderTargetPhysicalViewport,
  resetRendererFullViewport,
} from './resetRendererFullViewport.js';

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

    let savedSceneBackground = null;
    const gradientCtrl = this._resolveBackgroundGradientController();
    const useGpuGradientBlit = gradientCtrl?.shouldGpuBlitGradient?.() === true;
    const captureBlit = gradientCtrl?.shouldBlitForCapture?.() === true;
    try {
      if (captureBlit) {
        ensureExportCapturePixelRatio({
          renderer,
          composer: null,
        });
      }
      const resetViewport = () => {
        if (captureBlit) {
          ensureExportCapturePixelRatio({ renderer, composer: null });
          const rt = renderer.getRenderTarget();
          if (rt?.width > 0 && rt?.height > 0) {
            pinRenderTargetPhysicalViewport(renderer, rt.width, rt.height);
          } else {
            const { width, height } = getDrawingBufferPixels(renderer);
            pinRenderTargetPhysicalViewport(renderer, width, height);
          }
        } else {
          resetRendererFullViewport(renderer);
        }
      };
      if (gradientCtrl?.isActive?.() === true) {
        savedSceneBackground = this.scene.background;
        this.scene.background = null;
      }

      resetViewport();
      renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
      resetViewport();

      const blitGradient = () => {
        if (!useGpuGradientBlit) return;
        gradientCtrl.syncToDrawingBuffer(undefined, undefined, { forceRedraw: true });
        gradientCtrl.blitFullViewport(renderer);
      };

      if (this.clear === true) {
        if (useGpuGradientBlit) {
          renderer.clear(
            false,
            renderer.autoClearDepth,
            renderer.autoClearStencil,
          );
          blitGradient();
        } else {
          renderer.clear(
            renderer.autoClearColor,
            renderer.autoClearDepth,
            renderer.autoClearStencil,
          );
        }
      } else if (useGpuGradientBlit) {
        blitGradient();
      }

      resetViewport();
      renderer.render(this.scene, this.camera);
    } finally {
      if (savedSceneBackground !== null) {
        this.scene.background = savedSceneBackground;
      }
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
      if (captureBlit) {
        const rt = renderer.getRenderTarget();
        if (rt?.width > 0 && rt?.height > 0) {
          pinRenderTargetPhysicalViewport(renderer, rt.width, rt.height);
        } else {
          const { width, height } = getDrawingBufferPixels(renderer);
          pinRenderTargetPhysicalViewport(renderer, width, height);
        }
      } else if (!this._keepExportCaptureViewport) {
        resetRendererFullViewport(renderer);
      }
    }
  }
}
