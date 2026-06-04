import * as THREE from 'three';
import { ORBY_BLACK } from '../constants.js';
import { EXRLoader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/loaders/EXRLoader.js';
import { RGBELoader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/loaders/RGBELoader.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/ShaderPass.js';
import { RotateEquirectShader } from '../shaders/index.js';

export class EnvironmentController {
  constructor(scene, renderer, {
    presets = {},
    moods = {},
    initialPreset = null,
    enabled = true,
    backgroundEnabled = true,
    strength = 1.0,
    blurriness = 0.0,
    rotation = 0,
    fallbackColor = ORBY_BLACK,
    onEnvironmentMapUpdated = null,
    /** When HDRI is not drawing the backdrop, hand background back to BackgroundController. */
    onReleaseSceneBackground = null,
  } = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.presets = presets;
    this.moods = moods;
    this.onEnvironmentMapUpdated = onEnvironmentMapUpdated;

    this.enabled = enabled;
    this.backgroundEnabled = backgroundEnabled;
    this.strength = strength;
    this.blurriness = blurriness;
    this.rotation = rotation;
    this.fallbackColor = fallbackColor;
    this.onReleaseSceneBackground = onReleaseSceneBackground;

    this.textureLoader = new THREE.TextureLoader();
    this.hdriLoader = new RGBELoader();
    this.exrLoader = new EXRLoader();
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.pmremGenerator.compileEquirectangularShader();

    this.cache = new Map();
    this.pmremCache = new Map(); // preset -> PMREM render target (rotation 0)
    this.currentPreset = initialPreset ?? null;
    this.currentEnvironmentTexture = null;
    this.currentLowResTexture = null;
    this.environmentRenderTarget = null;
    this.lowResEnvironmentRenderTarget = null;
    this.rotationRenderTarget = null;
    this._lastNotifiedEnvTexture = null;
    this._lastNotifiedEnvIntensity = null;
    this._presetLoadId = 0;
    this._fadeFrameId = null;
  }

  dispose() {
    this._cancelFade();
    for (const target of this.pmremCache.values()) {
      target?.dispose?.();
    }
    this.pmremCache.clear();
    if (this.environmentRenderTarget && !this.pmremCache.has(this.currentPreset)) {
      this.environmentRenderTarget.dispose();
    }
    this.environmentRenderTarget = null;
    if (this.lowResEnvironmentRenderTarget) {
      this.lowResEnvironmentRenderTarget.dispose();
      this.lowResEnvironmentRenderTarget = null;
    }
    if (this.rotationRenderTarget) {
      this.rotationRenderTarget.dispose();
      this.rotationRenderTarget = null;
    }
    if (this.currentLowResTexture) {
      this.currentLowResTexture.dispose();
      this.currentLowResTexture = null;
    }
    this.pmremGenerator?.dispose();
  }

  setFallbackColor(color) {
    this.fallbackColor = color ?? this.fallbackColor;
    // Always refresh environment to apply the new fallback color
    // This ensures the background color is visible when HDRI background is off
    this._applyEnvironment();
  }

  registerPreset(preset, config) {
    if (!preset || !config?.url) return;
    this.presets[preset] = config;
  }

  disposePreset(preset) {
    if (!preset) return;
    const config = this.presets[preset];
    if (config?.revokeUrl && typeof config.url === 'string' && config.url.startsWith('blob:')) {
      URL.revokeObjectURL(config.url);
    }
    const cached = this.cache.get(preset);
    if (cached) {
      cached.dispose();
      this.cache.delete(preset);
    }
    const pmrem = this.pmremCache.get(preset);
    if (pmrem) {
      pmrem.dispose();
      this.pmremCache.delete(preset);
    }
    if (this.currentPreset === preset) {
      this.currentEnvironmentTexture = null;
      this.environmentRenderTarget = null;
    }
    delete this.presets[preset];
  }

  async setPreset(preset) {
    if (!preset || !this.presets[preset]) return null;

    const loadId = ++this._presetLoadId;
    this._cancelFade();

    // Cached texture + PMREM: swap in one apply (no fade, no main-thread PMREM rebuild).
    if (this.cache.has(preset)) {
      this.currentEnvironmentTexture = this.cache.get(preset);
      this.currentLowResTexture = null;
      this.currentPreset = preset;
      this.environmentRenderTarget =
        this.pmremCache.get(preset)
        ?? this._getOrCreatePmrem(preset, this.currentEnvironmentTexture);
      this._applyEnvironment(true);
      return this.moods?.[preset] ?? null;
    }

    // First load: optional low-res placeholder, then single cut to full-res PMREM.
    this.currentEnvironmentTexture = null;
    try {
      const lowResTexture = await this._loadHdriTextureLowRes(this.presets[preset]);
      if (loadId !== this._presetLoadId) return null;

      if (lowResTexture) {
        this._disposeLowResPreview();
        this.currentLowResTexture = lowResTexture;
        this.currentPreset = preset;
        if (this.pmremGenerator) {
          this.lowResEnvironmentRenderTarget?.dispose?.();
          this.lowResEnvironmentRenderTarget = this.pmremGenerator.fromEquirectangular(
            this.currentLowResTexture,
          );
        }
        this._applyEnvironment(true);
      }

      try {
        const texture = await this._loadHdriTexture(this.presets[preset]);
        if (loadId !== this._presetLoadId) return null;
        if (!texture) throw new Error('HDRI texture failed to load');

        this.cache.set(preset, texture);
        this.currentPreset = preset;
        this.currentEnvironmentTexture = texture;
        this.environmentRenderTarget = this._getOrCreatePmrem(preset, texture);
        this._disposeLowResPreview();
        this._applyEnvironment(true);
        return this.moods?.[preset] ?? null;
      } catch (fullResError) {
        console.error('Failed to load full-res HDRI texture', preset, fullResError);
        if (loadId !== this._presetLoadId) return null;
        if (this.currentLowResTexture) {
          this.currentEnvironmentTexture = this.currentLowResTexture;
          this._applyEnvironment(true);
        }
        return this.moods?.[preset] ?? null;
      }
    } catch (error) {
      console.error('Failed to load HDRI preset', preset, error);
      return null;
    }
  }

  getCurrentPreset() {
    return this.currentPreset;
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    this._applyEnvironment();
  }

  setBackgroundEnabled(enabled) {
    this.backgroundEnabled = !!enabled;
    this._applyEnvironment();
  }

  setStrength(value) {
    this.strength = Math.max(0, value ?? this.strength);
    this._applyEnvironment();
  }

  setBlurriness(value) {
    this.blurriness = Math.min(1, Math.max(0, value ?? this.blurriness));
    this._applyEnvironment();
  }

  setRotation(value) {
    const normalized = ((value ?? 0) % 360 + 360) % 360;
    if (this.rotation === normalized) return;
    this.rotation = normalized;
    this._applyEnvironment();
  }

  getMood(preset) {
    return this.moods?.[preset] ?? null;
  }

  _cancelFade() {
    if (this._fadeFrameId != null) {
      cancelAnimationFrame(this._fadeFrameId);
      this._fadeFrameId = null;
    }
  }

  _disposeLowResPreview() {
    if (this.currentLowResTexture) {
      this.currentLowResTexture.dispose();
      this.currentLowResTexture = null;
    }
    if (this.lowResEnvironmentRenderTarget) {
      this.lowResEnvironmentRenderTarget.dispose();
      this.lowResEnvironmentRenderTarget = null;
    }
  }

  _getOrCreatePmrem(preset, texture) {
    if (!this.pmremGenerator || !texture) return null;
    if (this.pmremCache.has(preset)) {
      return this.pmremCache.get(preset);
    }
    const target = this.pmremGenerator.fromEquirectangular(texture);
    this.pmremCache.set(preset, target);
    return target;
  }

  _notifyEnvironmentMapUpdated(texture, intensity) {
    const nextIntensity = intensity ?? 0;
    if (
      texture === this._lastNotifiedEnvTexture &&
      nextIntensity === this._lastNotifiedEnvIntensity
    ) {
      return;
    }
    this._lastNotifiedEnvTexture = texture;
    this._lastNotifiedEnvIntensity = nextIntensity;
    if (typeof this.onEnvironmentMapUpdated === 'function') {
      this.onEnvironmentMapUpdated(texture, nextIntensity);
    }
  }

  async _loadHdriTextureLowRes(config) {
    const source = typeof config === 'string' ? config : config?.url;
    const type = typeof config === 'object' ? config.type : 'hdr';
    if (!source) throw new Error('Missing HDRI source');

    if (type === 'ldr') {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          // Create a low-res canvas (1/4 resolution)
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const lowResWidth = Math.max(256, img.width / 4);
          const lowResHeight = Math.max(128, img.height / 4);
          canvas.width = lowResWidth;
          canvas.height = lowResHeight;
          
          // Draw with smoothing for a slightly blurred effect
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'low';
          ctx.drawImage(img, 0, 0, lowResWidth, lowResHeight);
          
          // Create texture from low-res canvas
          const texture = new THREE.CanvasTexture(canvas);
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.encoding = THREE.sRGBEncoding;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          // Set wrapping to prevent seams in equirectangular maps
          texture.wrapS = THREE.RepeatWrapping; // Horizontal wrap (seamless left/right)
          texture.wrapT = THREE.ClampToEdgeWrapping; // Vertical clamp (prevent pole seams)
          resolve(texture);
        };
        img.onerror = reject;
        img.src = source;
      });
    }

    // For HDR, we'll just load normally but at lower quality
    // The RGBELoader doesn't support progressive loading easily
    return null;
  }

  async _loadHdriTexture(config) {
    const source = typeof config === 'string' ? config : config?.url;
    const type = typeof config === 'object' ? config.type : 'hdr';
    if (!source) throw new Error('Missing HDRI source');

    if (type === 'ldr') {
      return new Promise((resolve, reject) => {
        this.textureLoader.load(
          source,
          (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.encoding = THREE.sRGBEncoding;
            // Set wrapping to prevent seams in equirectangular maps
            texture.wrapS = THREE.RepeatWrapping; // Horizontal wrap (seamless left/right)
            texture.wrapT = THREE.ClampToEdgeWrapping; // Vertical clamp (prevent pole seams)
            resolve(texture);
          },
          undefined,
          reject,
        );
      });
    }

    if (type === 'exr') {
      const texture = await this.exrLoader.loadAsync(source);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      return texture;
    }

    const texture = await this.hdriLoader.loadAsync(source);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    // Set wrapping to prevent seams in equirectangular maps
    texture.wrapS = THREE.RepeatWrapping; // Horizontal wrap (seamless left/right)
    texture.wrapT = THREE.ClampToEdgeWrapping; // Vertical clamp (prevent pole seams)
    return texture;
  }

  _releaseSceneBackground() {
    if (typeof this.onReleaseSceneBackground === 'function') {
      this.onReleaseSceneBackground();
      return;
    }
    this.scene.background = null;
  }

  _applyEnvironment(forceMaterialSync = false) {
    const usingLowResPreview =
      this.currentLowResTexture &&
      !this.currentEnvironmentTexture;
    const activeTexture =
      usingLowResPreview
        ? this.currentLowResTexture
        : (this.currentEnvironmentTexture || this.currentLowResTexture);
    const hdriActive = this.enabled && activeTexture;

    if (!hdriActive) {
      this.scene.environment = null;
      this.scene.environmentIntensity = 0;
      this._releaseSceneBackground();
      if (forceMaterialSync) {
        this._lastNotifiedEnvTexture = null;
        this._lastNotifiedEnvIntensity = null;
      }
      this._notifyEnvironmentMapUpdated(null, 0);
      return;
    }

    let envTexture = null;
    if (this.pmremGenerator) {
      if (usingLowResPreview && this.lowResEnvironmentRenderTarget) {
        envTexture = this.lowResEnvironmentRenderTarget.texture;
      } else if (this.rotation === 0 && this.environmentRenderTarget) {
        envTexture = this.environmentRenderTarget.texture;
      } else {
        let sourceTexture = activeTexture;
        if (this.rotation !== 0) {
          sourceTexture = this._createRotatedTexture(activeTexture, this.rotation);
        }
        const renderTarget = this.pmremGenerator.fromEquirectangular(sourceTexture);
        if (this.rotation === 0 && this.currentPreset) {
          const cached = this.pmremCache.get(this.currentPreset);
          if (cached && cached !== renderTarget) {
            cached.dispose();
          }
          this.pmremCache.set(this.currentPreset, renderTarget);
          this.environmentRenderTarget = renderTarget;
        }
        envTexture = renderTarget.texture;
      }
      if (envTexture) {
        envTexture.minFilter = THREE.LinearMipmapLinearFilter;
        envTexture.magFilter = THREE.LinearFilter;
      }
    } else {
      let sourceTexture = activeTexture;
      if (this.rotation !== 0) {
        sourceTexture = this._createRotatedTexture(activeTexture, this.rotation);
      }
      envTexture = sourceTexture;
    }

    const envIntensity = this.strength;
    this.scene.environment = envTexture;
    this.scene.environmentIntensity = envIntensity;
    if (forceMaterialSync) {
      this._lastNotifiedEnvTexture = null;
      this._lastNotifiedEnvIntensity = null;
    }
    this._notifyEnvironmentMapUpdated(envTexture, envIntensity);

    if (this.backgroundEnabled && activeTexture) {
      let bgTexture = activeTexture;
      if (this.rotation !== 0) {
        bgTexture = this._createRotatedTexture(activeTexture, this.rotation);
      }
      if (this.blurriness > 0 && envTexture) {
        bgTexture = envTexture;
      }

      this.scene.background = bgTexture;
      if ('backgroundBlurriness' in this.scene) {
        this.scene.backgroundBlurriness = this.blurriness;
        this.scene.backgroundIntensity = this.strength;
      }
    } else {
      this._releaseSceneBackground();
      if ('backgroundBlurriness' in this.scene) {
        this.scene.backgroundBlurriness = 0;
        this.scene.backgroundIntensity = 1;
      }
    }
  }

  _createRotatedTexture(sourceTexture, rotationDegrees) {
    if (!sourceTexture) return sourceTexture;

    const rotation = (rotationDegrees / 360) % 1.0;

    if (this.rotationRenderTarget) {
      this.rotationRenderTarget.dispose();
      this.rotationRenderTarget = null;
    }

    let width = sourceTexture.image?.width;
    let height = sourceTexture.image?.height;

    if (!width && sourceTexture.image?.data) {
      width = sourceTexture.image.data.width;
      height = sourceTexture.image.data.height;
    }

    if (!width && sourceTexture.source?.data) {
      width = sourceTexture.source.data.width;
      height = sourceTexture.source.data.height;
    }

    if (!width) {
      console.warn('Could not detect HDRI texture dimensions, skipping rotation');
      return sourceTexture;
    }

    const isHDR =
      sourceTexture.encoding === THREE.RGBEEncoding ||
      sourceTexture.type === THREE.HalfFloatType ||
      sourceTexture.type === THREE.FloatType;

    let format = sourceTexture.format || THREE.RGBAFormat;
    let type = sourceTexture.type || THREE.UnsignedByteType;
    let encoding = sourceTexture.encoding || THREE.sRGBEncoding;

    if (isHDR) {
      if (type === THREE.UnsignedByteType && encoding === THREE.RGBEEncoding) {
        type = THREE.UnsignedByteType;
        encoding = THREE.RGBEEncoding;
      } else if (type !== THREE.HalfFloatType && type !== THREE.FloatType) {
        type = THREE.HalfFloatType;
      }
    }

    this.rotationRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      format,
      type,
      encoding,
      generateMipmaps: false,
    });

    const material = new THREE.ShaderMaterial({
      uniforms: {
        tEquirect: { value: sourceTexture },
        rotation: { value: rotation },
      },
      vertexShader: RotateEquirectShader.vertexShader,
      fragmentShader: RotateEquirectShader.fragmentShader,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    const scene = new THREE.Scene();
    scene.add(quad);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const oldTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rotationRenderTarget);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(oldTarget);

    quad.geometry.dispose();
    material.dispose();
    scene.remove(quad);

    const rotatedTexture = this.rotationRenderTarget.texture;
    rotatedTexture.mapping = THREE.EquirectangularReflectionMapping;
    rotatedTexture.encoding = encoding;
    rotatedTexture.format = format;
    rotatedTexture.type = type;
    rotatedTexture.image = rotatedTexture.image || { width, height };
    // Set wrapping to prevent seams in equirectangular maps
    rotatedTexture.wrapS = THREE.RepeatWrapping; // Horizontal wrap (seamless left/right)
    rotatedTexture.wrapT = THREE.ClampToEdgeWrapping; // Vertical clamp (prevent pole seams)

    return rotatedTexture;
  }
}

