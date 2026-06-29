import * as THREE from 'three';
import { drawBackgroundGradient } from './backgroundGradientCanvas.js';
import { BackgroundGradientFullscreenBlit } from './backgroundGradientFullscreenBlit.js';
import {
  DEFAULT_BACKGROUND_GRADIENT,
  getBackgroundGradientFallbackColor,
  normalizeBackgroundGradient,
} from './backgroundGradientDefaults.js';
import { getViewportBackingStorePixels } from '../drawingBufferSize.js';
import { ensureExportCapturePixelRatio } from '../capture/forceExportCaptureFramebuffer.js';
import {
  pinRenderTargetPhysicalViewport,
  resetRendererFullViewport,
} from '../resetRendererFullViewport.js';

/**
 * Screen-space viewport gradient when the HDRI backdrop is hidden.
 * Keeps rendering isolated from BackgroundController's flat-color path.
 */
export class BackgroundGradientController {
  /**
   * @param {{
   *   renderer: import('three').WebGLRenderer,
   *   scene: import('three').Scene,
   *   backgroundController: import('../BackgroundController.js').BackgroundController,
   * }} opts
   */
  constructor({ renderer, scene, backgroundController } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.backgroundController = backgroundController;
    /** @type {import('./backgroundGradientDefaults.js').BackgroundGradientConfig} */
    this.config = normalizeBackgroundGradient(DEFAULT_BACKGROUND_GRADIENT);
    this._canvas = document.createElement('canvas');
    this._ctx = this._canvas.getContext('2d', { alpha: false });
    this._texture = new THREE.CanvasTexture(this._canvas);
    this._texture.colorSpace = THREE.SRGBColorSpace;
    this._texture.minFilter = THREE.LinearFilter;
    this._texture.magFilter = THREE.LinearFilter;
    this._texture.generateMipmaps = false;
    this._texture.wrapS = THREE.ClampToEdgeWrapping;
    this._texture.wrapT = THREE.ClampToEdgeWrapping;
    this._texture.matrixAutoUpdate = false;
    this._lastWidth = 0;
    this._lastHeight = 0;
    /** Offline capture — exact hex canvas composited on readback (no GPU blit / no post on gradient). */
    this._captureBlitActive = false;
    /** @type {Uint8ClampedArray | null} display-graded plate (exposure/tone, no bloom) */
    this._displayGradedCaptureRgba = null;
    /** @type {BackgroundGradientFullscreenBlit | null} */
    this._fullscreenBlit = null;
    this._captureWidth = 0;
    this._captureHeight = 0;
  }

  /** @param {Partial<import('./backgroundGradientDefaults.js').BackgroundGradientConfig>} patch */
  setConfig(patch) {
    this.config = normalizeBackgroundGradient({ ...this.config, ...patch });
    this.backgroundController?.refreshAppearance?.();
  }

  /** @returns {import('./backgroundGradientDefaults.js').BackgroundGradientConfig} */
  getConfig() {
    return normalizeBackgroundGradient(this.config);
  }

  isActive() {
    const bg = this.backgroundController;
    if (!this.config.enabled || !bg) return false;
    // Show gradient when Render Backdrop is off or Shader Lab owns the backdrop.
    return bg.usesFallbackBackdrop?.() === true;
  }

  getFallbackColor() {
    return getBackgroundGradientFallbackColor(this.config);
  }

  /**
   * Called from BackgroundController when HDRI backdrop is off.
   * @returns {boolean} true when gradient owns the viewport background
   */
  applyIfActive() {
    if (!this.isActive()) return false;
    this.syncToDrawingBuffer(undefined, undefined, { forceRedraw: true });
    // Gradient is drawn via MeshglRenderPass fullscreen blit — not scene.background
    // (Three background can render into a partial GL viewport on Ultra / bloom passes).
    this.scene.background = null;
    this.renderer.setClearAlpha(1);
    this.renderer.autoClear = true;
    this.renderer.setClearColor(new THREE.Color(this.getFallbackColor()), 1);
    if (this.backgroundController?.backgroundSphere) {
      this.backgroundController.backgroundSphere.visible = false;
    }
    return true;
  }

  /**
   * Resize and redraw the gradient canvas to match the viewport backing store.
   * Uses Three's logical size × pixel ratio (same basis as `setViewport`) — not raw
   * `gl.drawingBufferWidth`, which can lag after Ultra / render-quality toggles.
   * @param {number} [width]
   * @param {number} [height]
   * @param {{ forceRedraw?: boolean }} [options]
   */
  syncToDrawingBuffer(width, height, { forceRedraw = false } = {}) {
    if (!this.isActive()) return;
    let w;
    let h;
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      w = Math.max(1, Math.floor(width));
      h = Math.max(1, Math.floor(height));
    } else {
      ({ width: w, height: h } = this._getDrawingBufferPixelSize());
    }
    const resized = w !== this._canvas.width || h !== this._canvas.height;
    if (resized) {
      this._canvas.width = w;
      this._canvas.height = h;
    }
    this._lastWidth = w;
    this._lastHeight = h;
    if (!resized && !forceRedraw) return;
    drawBackgroundGradient(this._ctx, w, h, this.config);
    this._texture.repeat.set(1, 1);
    this._texture.offset.set(0, 0);
    this._texture.updateMatrix();
    this._texture.needsUpdate = true;
  }

  /** Backing-store pixels for the active capture frame (canvas texture / readback). */
  _getCaptureBackingStoreSize() {
    if (this._captureWidth <= 0 || this._captureHeight <= 0) {
      return { width: 0, height: 0 };
    }
    // Export capture stores backing-store pixels (DPR 1) — do not multiply by studio Ultra DPR.
    if (this._captureBlitActive) {
      return {
        width: Math.max(1, this._captureWidth),
        height: Math.max(1, this._captureHeight),
      };
    }
    const pr = Math.max(1e-6, this.renderer?.getPixelRatio?.() ?? 1);
    return {
      width: Math.max(1, Math.round(this._captureWidth * pr)),
      height: Math.max(1, Math.round(this._captureHeight * pr)),
    };
  }

  /** @returns {{ width: number, height: number }} backing-store pixels for capture sync */
  getCapturePixelSize() {
    return this._getCaptureBackingStoreSize();
  }

  /**
   * Pin GL viewport to the active render target / drawing buffer (not cached export logical size).
   * @param {THREE.WebGLRenderer} renderer
   */
  pinCaptureViewport(renderer) {
    if (!renderer) return;
    resetRendererFullViewport(renderer);
  }

  /** @returns {Uint8ClampedArray | null} top-down RGBA for capture composite */
  getCaptureGradientRgba() {
    if (this._displayGradedCaptureRgba) {
      return this._displayGradedCaptureRgba;
    }
    return this.getRawCaptureGradientRgba();
  }

  /** @param {Uint8ClampedArray | null} rgba */
  setDisplayGradedCapturePlate(rgba) {
    this._displayGradedCaptureRgba = rgba;
  }

  /** Raw 2D canvas RGBA at capture/export size (ungraded). */
  getRawCaptureGradientRgba(width, height) {
    const w = Math.max(
      1,
      Math.floor(width ?? this._captureWidth ?? this._canvas.width),
    );
    const h = Math.max(
      1,
      Math.floor(height ?? this._captureHeight ?? this._canvas.height),
    );
    if (!this.isActive() || w <= 0 || h <= 0) {
      return null;
    }
    if (this._canvas.width !== w || this._canvas.height !== h) {
      this.syncToDrawingBuffer(w, h, { forceRedraw: true });
    }
    return new Uint8ClampedArray(this._ctx.getImageData(0, 0, w, h).data);
  }

  /** True while offline capture should composite the 2D canvas (not GL scene.background). */
  shouldBlitForCapture() {
    return this._captureBlitActive && this.isActive();
  }

  /** GPU blit in MeshglRenderPass — live viewport only; capture uses CPU composite. */
  shouldGpuBlitGradient() {
    return this.isActive() && !this._captureBlitActive;
  }

  /** @deprecated alias — use {@link shouldGpuBlitGradient} */
  shouldGpuBlitForCapture() {
    return this.shouldGpuBlitGradient();
  }

  /** Opaque export — merge display-graded canvas under post-graded scene (no bloom on bg). */
  shouldCompositeGradientOnReadback() {
    return this._captureBlitActive && this.isActive();
  }

  /**
   * Blit gradient texture into the active render target at exact pixel size.
   * @param {THREE.WebGLRenderer} renderer
   * @param {number} pixelWidth
   * @param {number} pixelHeight
   */
  blitToRenderTarget(renderer, pixelWidth, pixelHeight) {
    if (!this._texture || !renderer) return;
    ensureExportCapturePixelRatio({ renderer, composer: null });
    pinRenderTargetPhysicalViewport(
      renderer,
      Math.max(1, Math.floor(pixelWidth)),
      Math.max(1, Math.floor(pixelHeight)),
    );
    this._getFullscreenBlit().render(renderer, this._texture);
  }

  /** @param {THREE.WebGLRenderer} renderer */
  blitFullViewport(renderer) {
    if (!this._texture || !renderer) return;
    if (this._captureBlitActive) {
      ensureExportCapturePixelRatio({ renderer, composer: null });
      const rt = renderer.getRenderTarget();
      if (rt?.width > 0 && rt?.height > 0) {
        pinRenderTargetPhysicalViewport(renderer, rt.width, rt.height);
      } else {
        const { width, height } = getViewportBackingStorePixels(renderer);
        pinRenderTargetPhysicalViewport(renderer, width, height);
      }
    } else {
      resetRendererFullViewport(renderer);
    }
    this._getFullscreenBlit().render(renderer, this._texture);
  }

  _getFullscreenBlit() {
    if (!this._fullscreenBlit) {
      this._fullscreenBlit = new BackgroundGradientFullscreenBlit();
    }
    return this._fullscreenBlit;
  }

  /**
   * Offline capture — sync exact export-sized canvas for CPU composite on readback.
   * @param {{ width?: number, height?: number, transparent?: boolean }} [ctx]
   */
  prepareForCapture(ctx = {}) {
    if (ctx.transparent || !this.isActive()) return;
    let w;
    let h;
    if (
      Number.isFinite(ctx.width)
      && Number.isFinite(ctx.height)
      && ctx.width > 0
      && ctx.height > 0
    ) {
      w = Math.max(1, Math.floor(ctx.width));
      h = Math.max(1, Math.floor(ctx.height));
    } else {
      ({ width: w, height: h } = getViewportBackingStorePixels(this.renderer));
    }
    this._captureWidth = w;
    this._captureHeight = h;
    this.syncToDrawingBuffer(w, h, { forceRedraw: true });
    this._captureBlitActive = true;
    // Scene renders without gradient; readback composites this canvas at exact hex colors.
  }

  /** Drop export-sized viewport pins without resyncing the gradient canvas. */
  clearCaptureMode() {
    this._captureBlitActive = false;
    this._captureWidth = 0;
    this._captureHeight = 0;
    this._displayGradedCaptureRgba = null;
  }

  /** Restore gradient canvas to interactive viewport size after export. */
  restoreAfterCapture() {
    this.clearCaptureMode();
    if (!this.isActive()) return;
    this.syncToDrawingBuffer(undefined, undefined, { forceRedraw: true });
    this.applyIfActive();
  }

  handleResize(width, height) {
    if (!this.isActive()) return;
    void width;
    void height;
    this.syncToDrawingBuffer();
  }

  _getDrawingBufferPixelSize() {
    return getViewportBackingStorePixels(this.renderer);
  }

  dispose() {
    this._fullscreenBlit?.dispose?.();
    this._fullscreenBlit = null;
    this._texture?.dispose?.();
    this._texture = null;
    this._ctx = null;
    this._canvas = null;
  }
}
