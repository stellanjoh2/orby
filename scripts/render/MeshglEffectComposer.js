import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/EffectComposer.js';
import { MaskPass, ClearMaskPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/MaskPass.js';
import { ensureExportCapturePixelRatio } from './capture/forceExportCaptureFramebuffer.js';
import {
  pinRenderTargetPhysicalViewport,
  resetRendererFullViewport,
} from './resetRendererFullViewport.js';
import { getDrawingBufferPixels } from './drawingBufferSize.js';

/**
 * EffectComposer that resets the GL viewport before every pass. Bloom / transmission / reflector
 * blur can leave a sub-viewport; the next fullscreen quad then only draws into that strip and
 * the rest of the canvas stays black (screen-fixed “2D frame”).
 */
export class MeshglEffectComposer extends EffectComposer {
  constructor(...args) {
    super(...args);
    /** @type {{ width: number, height: number } | null} */
    this._exportCaptureViewportPin = null;
  }

  /** @deprecated Export capture resizes the drawing buffer — full RT viewport is used instead. */
  setExportCaptureViewportPin(width, height) {
    this._exportCaptureViewportPin = {
      width: Math.max(1, Math.floor(width)),
      height: Math.max(1, Math.floor(height)),
    };
  }

  clearExportCaptureViewportPin() {
    this._exportCaptureViewportPin = null;
  }

  /** Pin every pass to full RT pixels @ DPR 1 (1080p export from Ultra studio). */
  setExportCapturePhysicalViewport(active) {
    this._exportCapturePhysicalViewport = active === true;
  }

  _resetPassViewport(renderer) {
    if (this._exportCapturePhysicalViewport) {
      ensureExportCapturePixelRatio({ renderer, composer: this });
      const rt = renderer.getRenderTarget();
      if (rt?.width > 0 && rt?.height > 0) {
        pinRenderTargetPhysicalViewport(renderer, rt.width, rt.height);
      } else {
        const { width, height } = getDrawingBufferPixels(renderer);
        pinRenderTargetPhysicalViewport(renderer, width, height);
      }
      return;
    }
    resetRendererFullViewport(renderer);
  }

  render(deltaTime) {
    if (deltaTime === undefined) {
      deltaTime = this.clock.getDelta();
    }

    const currentRenderTarget = this.renderer.getRenderTarget();
    let maskActive = false;

    for (let i = 0, il = this.passes.length; i < il; i++) {
      const pass = this.passes[i];
      if (pass.enabled === false) continue;

      this._resetPassViewport(this.renderer);
      pass._keepExportCaptureViewport = false;
      pass.renderToScreen = this.renderToScreen && this.isLastEnabledPass(i);
      pass.render(this.renderer, this.writeBuffer, this.readBuffer, deltaTime, maskActive);

      if (pass.needsSwap) {
        if (maskActive) {
          const context = this.renderer.getContext();
          const stencil = this.renderer.state.buffers.stencil;
          stencil.setFunc(context.NOTEQUAL, 1, 0xffffffff);
          this.copyPass.render(this.renderer, this.writeBuffer, this.readBuffer, deltaTime);
          stencil.setFunc(context.EQUAL, 1, 0xffffffff);
        }
        this.swapBuffers();
      }

      if (MaskPass !== undefined) {
        if (pass instanceof MaskPass) {
          maskActive = true;
        } else if (pass instanceof ClearMaskPass) {
          maskActive = false;
        }
      }
    }

    this.renderer.setRenderTarget(currentRenderTarget);
    this._resetPassViewport(this.renderer);
  }
}
