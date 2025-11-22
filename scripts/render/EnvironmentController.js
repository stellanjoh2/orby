import * as THREE from 'three';
import { RGBELoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/RGBELoader.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/ShaderPass.js';
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
    fallbackColor = '#000000',
    onEnvironmentMapUpdated = null,
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

    this.textureLoader = new THREE.TextureLoader();
    this.hdriLoader = new RGBELoader();
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.pmremGenerator.compileEquirectangularShader();

    this.cache = new Map();
    this.currentPreset = initialPreset ?? null;
    this.currentEnvironmentTexture = null;
    this.environmentRenderTarget = null;
    this.rotationRenderTarget = null;
  }

  dispose() {
    if (this.environmentRenderTarget) {
      this.environmentRenderTarget.dispose();
      this.environmentRenderTarget = null;
    }
    if (this.rotationRenderTarget) {
      this.rotationRenderTarget.dispose();
      this.rotationRenderTarget = null;
    }
    this.pmremGenerator?.dispose();
  }

  setFallbackColor(color) {
    this.fallbackColor = color ?? this.fallbackColor;
    if (!this.backgroundEnabled || !this.enabled || !this.currentEnvironmentTexture) {
      this.renderer.setClearColor(new THREE.Color(this.fallbackColor), 1);
    }
  }

  async setPreset(preset) {
    if (!preset || !this.presets[preset]) return null;
    if (this.currentPreset === preset && this.cache.has(preset)) {
      this.currentEnvironmentTexture = this.cache.get(preset);
      this._applyEnvironment();
      return this.moods?.[preset] ?? null;
    }
    try {
      const texture = await this._loadHdriTexture(this.presets[preset]);
      if (!texture) throw new Error('HDRI texture failed to load');
      this.cache.set(preset, texture);
      this.currentPreset = preset;
      this.currentEnvironmentTexture = texture;
      this._applyEnvironment();
      return this.moods?.[preset] ?? null;
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

  _notifyEnvironmentMapUpdated(texture, intensity) {
    if (typeof this.onEnvironmentMapUpdated === 'function') {
      this.onEnvironmentMapUpdated(texture, intensity);
    }
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
            resolve(texture);
          },
          undefined,
          reject,
        );
      });
    }

    const texture = await this.hdriLoader.loadAsync(source);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
  }

  _applyEnvironment() {
    const hdriActive = this.enabled && this.currentEnvironmentTexture;

    if (!hdriActive) {
      this.scene.environment = null;
      this.scene.environmentIntensity = 0;
      this.scene.background = null;
      this.renderer.setClearColor(new THREE.Color(this.fallbackColor), 1);
      this._notifyEnvironmentMapUpdated(null, 0);
      return;
    }

    // Dispose previous targets
    if (this.environmentRenderTarget) {
      this.environmentRenderTarget.dispose();
      this.environmentRenderTarget = null;
    }

    let sourceTexture = this.currentEnvironmentTexture;
    if (this.rotation !== 0) {
      sourceTexture = this._createRotatedTexture(this.currentEnvironmentTexture, this.rotation);
    }

    let envTexture = null;
    if (this.pmremGenerator) {
      const renderTarget = this.pmremGenerator.fromEquirectangular(sourceTexture);
      this.environmentRenderTarget = renderTarget;
      envTexture = renderTarget.texture;
      envTexture.minFilter = THREE.LinearMipmapLinearFilter;
      envTexture.magFilter = THREE.LinearFilter;
    } else {
      envTexture = sourceTexture;
    }

    this.scene.environment = envTexture;
    this.scene.environmentIntensity = this.strength;
    this._notifyEnvironmentMapUpdated(envTexture, this.strength);

    if (this.backgroundEnabled && this.currentEnvironmentTexture) {
      let bgTexture = this.currentEnvironmentTexture;
      if (this.rotation !== 0) {
        bgTexture = this._createRotatedTexture(this.currentEnvironmentTexture, this.rotation);
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
      this.scene.background = null;
      if ('backgroundBlurriness' in this.scene) {
        this.scene.backgroundBlurriness = 0;
        this.scene.backgroundIntensity = 1;
      }
      this.renderer.setClearColor(new THREE.Color(this.fallbackColor), 1);
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

    return rotatedTexture;
  }
}

