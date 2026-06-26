import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/EffectComposer.js';
import { MaskPass, ClearMaskPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/MaskPass.js';
import { resetRendererFullViewport } from './resetRendererFullViewport.js';

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

  /** Pin every pass viewport to export resolution (not studio canvas logical size). */
  setExportCaptureViewportPin(width, height) {
    this._exportCaptureViewportPin = {
      width: Math.max(1, Math.floor(width)),
      height: Math.max(1, Math.floor(height)),
    };
  }

  clearExportCaptureViewportPin() {
    this._exportCaptureViewportPin = null;
  }

  _resetPassViewport(renderer) {
    const pin = this._exportCaptureViewportPin;
    if (pin) {
      renderer.setViewport(0, 0, pin.width, pin.height);
      if (typeof renderer.setScissor === 'function') {
        renderer.setScissor(0, 0, pin.width, pin.height);
      }
      if (typeof renderer.setScissorTest === 'function') {
        renderer.setScissorTest(false);
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
      pass._keepExportCaptureViewport = !!this._exportCaptureViewportPin;
      pass.renderToScreen = this.renderToScreen && this.isLastEnabledPass(i);
      pass.render(this.renderer, this.writeBuffer, this.readBuffer, deltaTime, maskActive);
      pass._keepExportCaptureViewport = false;

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
