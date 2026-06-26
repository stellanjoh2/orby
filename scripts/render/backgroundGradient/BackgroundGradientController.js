import * as THREE from 'three';
import { drawBackgroundGradient } from './backgroundGradientCanvas.js';
import {
  DEFAULT_BACKGROUND_GRADIENT,
  getBackgroundGradientFallbackColor,
  normalizeBackgroundGradient,
} from './backgroundGradientDefaults.js';
import { getDrawingBufferPixels } from '../drawingBufferSize.js';

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
    this.scene.background = this._texture;
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

  /**
   * Offline capture — full-frame gradient at export resolution after viewport is set.
   * @param {{ width?: number, height?: number, transparent?: boolean }} [ctx]
   */
  prepareForCapture(ctx = {}) {
    if (ctx.transparent || !this.isActive()) return;
    const w = ctx.width;
    const h = ctx.height;
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      this.syncToDrawingBuffer(w, h, { forceRedraw: true });
    } else {
      this.syncToDrawingBuffer(undefined, undefined, { forceRedraw: true });
    }
    this.applyIfActive();
  }

  /** Restore gradient canvas to interactive viewport size after export. */
  restoreAfterCapture() {
    if (!this.isActive()) return;
    this.syncToDrawingBuffer(undefined, undefined, { forceRedraw: true });
  }

  handleResize(width, height) {
    if (!this.isActive()) return;
    void width;
    void height;
    this.syncToDrawingBuffer();
  }

  _getDrawingBufferPixelSize() {
    return getDrawingBufferPixels(this.renderer);
  }

  dispose() {
    this._texture?.dispose?.();
    this._texture = null;
    this._ctx = null;
    this._canvas = null;
  }
}
