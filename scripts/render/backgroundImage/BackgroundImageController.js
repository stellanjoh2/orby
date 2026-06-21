import * as THREE from 'three';
import { loadBackgroundImageElement } from './backgroundImageCanvas.js';
import {
  DEFAULT_BACKGROUND_IMAGE,
  getBackgroundImageFallbackColor,
  MAX_BACKGROUND_IMAGE_SOURCE_EDGE,
  normalizeBackgroundImage,
} from './backgroundImageDefaults.js';
import { syncBackgroundImageTextureFit } from './backgroundImageFit.js';
import { getImageSourceSize } from './backgroundImageCanvas.js';

export { loadBackgroundImageElement };

const _clearColor = new THREE.Color();

/**
 * GPU texture background when the HDRI backdrop is hidden.
 * No canvas compositing — static image stays on the GPU after upload.
 */
export class BackgroundImageController {
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
    /** @type {import('./backgroundImageDefaults.js').BackgroundImageConfig} */
    this.config = normalizeBackgroundImage(DEFAULT_BACKGROUND_IMAGE);
    /** @type {CanvasImageSource | null} */
    this._source = null;
    /** @type {THREE.Texture | null} */
    this._texture = null;
    this._fitCacheKey = '';
    this._lastClearHex = '';
  }

  _configureTexture(texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
  }

  /** @param {Partial<import('./backgroundImageDefaults.js').BackgroundImageConfig>} patch @param {{ skipRefresh?: boolean }} [options] */
  setConfig(patch, { skipRefresh = false } = {}) {
    const prev = this.config;
    const merged = { ...this.config, ...patch };
    let next = normalizeBackgroundImage(merged);
    // GPU source can be ready before the downscaled asset is persisted to state.
    if (this._source && patch.enabled === true) {
      next = { ...next, enabled: true };
    }
    this.config = next;
    if (prev.fit !== this.config.fit || prev.enabled !== this.config.enabled) {
      this._fitCacheKey = '';
    }
    if (!skipRefresh) {
      this.backgroundController?.refreshAppearance?.();
    }
  }

  /** @returns {import('./backgroundImageDefaults.js').BackgroundImageConfig} */
  getConfig() {
    return normalizeBackgroundImage(this.config);
  }

  /** @param {CanvasImageSource | null} image @param {{ skipRefresh?: boolean }} [options] */
  setImage(image, { skipRefresh = false } = {}) {
    this._source = image;
    this._fitCacheKey = '';
    if (this._texture) {
      this._texture.dispose();
      this._texture = null;
    }
    if (!skipRefresh) {
      this.backgroundController?.refreshAppearance?.();
    }
  }

  hasImage() {
    return !!this._source;
  }

  isActive() {
    const bg = this.backgroundController;
    if (!this.config.enabled || !this._source || !bg) return false;
    return bg.usesFallbackBackdrop?.() === true;
  }

  getFallbackColor() {
    const flat = this.backgroundController?.getColor?.();
    if (flat) return flat;
    return getBackgroundImageFallbackColor(this.config);
  }

  /**
   * Called from BackgroundController when HDRI backdrop is off.
   * @returns {boolean} true when image owns the viewport background
   */
  applyIfActive() {
    if (!this.isActive()) return false;

    const texture = this._ensureTexture();
    if (!texture) return false;

    this._syncFit(texture);

    if (this.scene.background !== texture) {
      this.scene.background = texture;
    }

    const clearHex = this.getFallbackColor();
    if (this._lastClearHex !== clearHex) {
      _clearColor.set(clearHex);
      this.renderer.setClearColor(_clearColor, 1);
      this._lastClearHex = clearHex;
    }
    this.renderer.setClearAlpha(1);
    this.renderer.autoClear = true;
    if (this.backgroundController?.backgroundSphere) {
      this.backgroundController.backgroundSphere.visible = false;
    }
    return true;
  }

  /** @returns {THREE.Texture | null} */
  _ensureTexture() {
    if (!this._source) return null;
    if (!this._texture) {
      this._texture = new THREE.Texture(this._source);
      this._configureTexture(this._texture);
      this._texture.needsUpdate = true;
    }
    return this._texture;
  }

  _syncFit(texture) {
    const { width: vw, height: vh } = this._getViewportPixelSize();
    const fit = this.config.fit;
    const { width: iw, height: ih } = getImageSourceSize(this._source);
    const cacheKey = `${fit}:${vw}x${vh}:${iw}x${ih}`;
    if (cacheKey === this._fitCacheKey) return;
    this._fitCacheKey = cacheKey;
    syncBackgroundImageTextureFit(texture, this._source, vw, vh, fit);
  }

  _getViewportPixelSize() {
    const gl = this.renderer?.getContext?.();
    if (gl && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0) {
      return {
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight,
      };
    }
    const size = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(size);
    return {
      width: Math.max(1, Math.floor(size.x)),
      height: Math.max(1, Math.floor(size.y)),
    };
  }

  handleResize(width, height) {
    if (!this.isActive()) return;
    void width;
    void height;
    this._fitCacheKey = '';
    this.backgroundController?.refreshAppearance?.();
  }

  dispose() {
    this._texture?.dispose?.();
    this._texture = null;
    this._source = null;
  }
}

export { MAX_BACKGROUND_IMAGE_SOURCE_EDGE };
