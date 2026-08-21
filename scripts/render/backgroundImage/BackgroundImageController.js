import * as THREE from 'three';
import {
  getImageSourceSize,
  loadBackgroundImageElement,
  toTextureFriendlyImageSource,
} from './backgroundImageCanvas.js';
import {
  backgroundImageBlurRadiusPx,
  DEFAULT_BACKGROUND_IMAGE,
  getBackgroundImageFallbackColor,
  MAX_BACKGROUND_IMAGE_SOURCE_EDGE,
  normalizeBackgroundImage,
} from './backgroundImageDefaults.js';
import { syncBackgroundImageTextureFit } from './backgroundImageFit.js';

export { loadBackgroundImageElement };

const _clearColor = new THREE.Color();

/**
 * GPU texture background when the HDRI backdrop is hidden.
 * Fit is UV-only; blur is a one-shot canvas filter of the source (not per-frame).
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
    /** @type {HTMLCanvasElement | null} */
    this._blurCanvas = null;
    /** @type {CanvasRenderingContext2D | null} */
    this._blurCtx = null;
    this._fitCacheKey = '';
    this._blurCacheKey = '';
    this._lastClearHex = '';
  }

  _configureTexture(texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    // Canvas / HTMLImage honor UNPACK_FLIP_Y. ImageBitmap is converted first because
    // Three.js r167 ignores flipY for ImageBitmap (images would appear upside down).
    texture.flipY = true;
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
    if (prev.blur !== this.config.blur) {
      this._blurCacheKey = '';
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
    this._source = toTextureFriendlyImageSource(image);
    this._fitCacheKey = '';
    this._blurCacheKey = '';
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
    // Three r167 treats backgroundBlurriness as env-map PMREM — must stay 0 for 2D images.
    if ('backgroundBlurriness' in this.scene) {
      this.scene.backgroundBlurriness = 0;
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
    const display = this._getDisplaySource();
    if (!display) return null;
    if (!this._texture) {
      this._texture = new THREE.Texture(display);
      this._configureTexture(this._texture);
      this._texture.needsUpdate = true;
      return this._texture;
    }
    if (this._texture.image !== display) {
      this._texture.image = display;
      this._texture.needsUpdate = true;
    }
    return this._texture;
  }

  /** @returns {CanvasImageSource | null} */
  _getDisplaySource() {
    if (!this._source) return null;
    const blur = this.config.blur;
    const { width: iw, height: ih } = getImageSourceSize(this._source);
    const cacheKey = `${blur}:${iw}x${ih}`;
    if (blur <= 0) {
      this._blurCacheKey = cacheKey;
      return this._source;
    }
    if (cacheKey === this._blurCacheKey && this._blurCanvas) {
      return this._blurCanvas;
    }

    const radius = backgroundImageBlurRadiusPx(blur, iw, ih);
    if (!iw || !ih || radius <= 0) {
      this._blurCacheKey = cacheKey;
      return this._source;
    }

    if (!this._blurCanvas) {
      this._blurCanvas = document.createElement('canvas');
      this._blurCtx = this._blurCanvas.getContext('2d', { alpha: false });
    }
    if (this._blurCanvas.width !== iw || this._blurCanvas.height !== ih) {
      this._blurCanvas.width = iw;
      this._blurCanvas.height = ih;
    }
    const ctx = this._blurCtx;
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(this._source, 0, 0, iw, ih);
    ctx.filter = 'none';
    this._blurCacheKey = cacheKey;
    if (this._texture) {
      this._texture.needsUpdate = true;
    }
    return this._blurCanvas;
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
    this._blurCanvas = null;
    this._blurCtx = null;
  }
}

export { MAX_BACKGROUND_IMAGE_SOURCE_EDGE };
