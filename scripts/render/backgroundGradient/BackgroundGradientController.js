import * as THREE from 'three';
import { drawBackgroundGradient } from './backgroundGradientCanvas.js';
import {
  DEFAULT_BACKGROUND_GRADIENT,
  getBackgroundGradientFallbackColor,
  normalizeBackgroundGradient,
} from './backgroundGradientDefaults.js';

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
    // Show gradient when Render Backdrop is off — HDRI may still light the mesh.
    return !(bg.hdriEnabled && bg.hdriBackgroundEnabled);
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
    this._ensureTextureSize();
    drawBackgroundGradient(this._ctx, this._canvas.width, this._canvas.height, this.config);
    this._texture.needsUpdate = true;
    this.scene.background = this._texture;
    this.renderer.setClearAlpha(1);
    this.renderer.autoClear = true;
    this.renderer.setClearColor(new THREE.Color(this.getFallbackColor()), 1);
    if (this.backgroundController?.backgroundSphere) {
      this.backgroundController.backgroundSphere.visible = false;
    }
    return true;
  }

  handleResize(width, height) {
    if (!this.isActive()) return;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this._lastWidth && h === this._lastHeight) return;
    this._lastWidth = w;
    this._lastHeight = h;
    this._canvas.width = w;
    this._canvas.height = h;
    this.backgroundController?.refreshAppearance?.();
  }

  _ensureTextureSize() {
    const size = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(size);
    const w = Math.max(1, Math.floor(size.x));
    const h = Math.max(1, Math.floor(size.y));
    if (w !== this._canvas.width || h !== this._canvas.height) {
      this._canvas.width = w;
      this._canvas.height = h;
      this._lastWidth = w;
      this._lastHeight = h;
    }
  }

  dispose() {
    this._texture?.dispose?.();
    this._texture = null;
    this._ctx = null;
    this._canvas = null;
  }
}
