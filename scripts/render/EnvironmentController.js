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
    this.lowResCache = new Map();
    this.currentPreset = initialPreset ?? null;
    this.currentEnvironmentTexture = null;
    this.currentLowResTexture = null;
    this.environmentRenderTarget = null;
    this.lowResEnvironmentRenderTarget = null; // Keep low-res PMREM during transition
    this.rotationRenderTarget = null;
    this.fadeProgress = 1.0; // 0 = low-res visible, 1 = full-res visible
    this.isFading = false;
    this.fullResPmremReady = false; // Track when full-res PMREM is ready
  }

  dispose() {
    if (this.environmentRenderTarget) {
      this.environmentRenderTarget.dispose();
      this.environmentRenderTarget = null;
    }
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

  async setPreset(preset) {
    if (!preset || !this.presets[preset]) return null;
    
    // If texture is already cached, use it immediately (no lazy loading)
    if (this.cache.has(preset)) {
      this.currentEnvironmentTexture = this.cache.get(preset);
      this.currentLowResTexture = null;
      this.fadeProgress = 1.0;
      this.currentPreset = preset;
      this._applyEnvironment();
      return this.moods?.[preset] ?? null;
    }
    
    // First time loading - use lazy loading with low-res preview
    try {
      // Load low-res version first
      const lowResTexture = await this._loadHdriTextureLowRes(this.presets[preset]);
      if (lowResTexture) {
        this.currentLowResTexture = lowResTexture;
        this.fadeProgress = 0.0;
        this.currentPreset = preset;
        
        // Pre-generate low-res PMREM immediately so it's ready
        // NOTE: Don't apply rotation during fade - rotation will be applied after fade completes
        // This prevents PMREM regeneration during transition
        if (this.pmremGenerator && this.currentLowResTexture) {
          this.lowResEnvironmentRenderTarget = this.pmremGenerator.fromEquirectangular(this.currentLowResTexture);
        }
        
        this._applyEnvironment(); // Show low-res immediately
      }

      // Then load full resolution
      try {
        const texture = await this._loadHdriTexture(this.presets[preset]);
        if (!texture) throw new Error('HDRI texture failed to load');
        this.cache.set(preset, texture);
        this.currentPreset = preset;
        this.currentEnvironmentTexture = texture;
        this.fullResPmremReady = false;
        
        // Pre-generate PMREM for full-res texture BEFORE starting fade
        // This is critical to prevent pop - both PMREM targets must be ready
        // NOTE: Don't apply rotation during fade - rotation will be applied after fade completes
        // This prevents PMREM regeneration during transition
        if (this.pmremGenerator && this.currentEnvironmentTexture) {
          // Generate and store the full-res PMREM target (without rotation)
          const fullResTarget = this.pmremGenerator.fromEquirectangular(this.currentEnvironmentTexture);
          this.environmentRenderTarget = fullResTarget;
          this.fullResPmremReady = true;
        } else {
          this.fullResPmremReady = true;
        }
        
        // Fade in the full resolution
        this._fadeInFullRes();
        return this.moods?.[preset] ?? null;
      } catch (fullResError) {
        console.error('Failed to load full-res HDRI texture', preset, fullResError);
        // Keep low-res visible if full-res fails
        if (this.currentLowResTexture) {
          this.currentEnvironmentTexture = this.currentLowResTexture;
          this.fadeProgress = 1.0;
          this._applyEnvironment();
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

  _notifyEnvironmentMapUpdated(texture, intensity) {
    if (typeof this.onEnvironmentMapUpdated === 'function') {
      this.onEnvironmentMapUpdated(texture, intensity);
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

  _fadeInFullRes() {
    if (this.isFading) return;
    this.isFading = true;
    
    // Wait for PMREM to be ready, then start smooth fade
    const checkAndFade = () => {
      if (!this.fullResPmremReady) {
        requestAnimationFrame(checkAndFade);
        return;
      }
      
      const duration = 2000; // 2s fade for ultra-smooth transition
      const startTime = performance.now();
      const startProgress = this.fadeProgress;

      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1, elapsed / duration);
        // Use very smooth ease-out curve to prevent any pop
        const easedProgress = 1 - Math.pow(1 - progress, 4); // Higher power = smoother
        this.fadeProgress = startProgress + (1 - startProgress) * easedProgress;
        this._applyEnvironment();

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          this.isFading = false;
          // Switch to full-res texture
          this.fadeProgress = 1.0;
          // Dispose low-res texture and its PMREM after transition completes
          setTimeout(() => {
            if (this.currentLowResTexture) {
              this.currentLowResTexture.dispose();
              this.currentLowResTexture = null;
            }
            if (this.lowResEnvironmentRenderTarget) {
              this.lowResEnvironmentRenderTarget.dispose();
              this.lowResEnvironmentRenderTarget = null;
            }
          }, 300);
          this._applyEnvironment(); // Final update with full-res
        }
      };
      animate();
    };
    
    // Small delay to ensure texture is ready, then check PMREM
    setTimeout(() => {
      checkAndFade();
    }, 100);
  }

  _applyEnvironment() {
    // During fade, gradually transition from low-res to full-res
    // Keep low-res visible almost until the end to prevent pop
    const isFading = this.currentLowResTexture && this.fadeProgress < 1.0;
    const useLowRes = isFading && this.fadeProgress < 0.98; // Switch at 98% for ultra-smooth
    const activeTexture = useLowRes ? this.currentLowResTexture : (this.currentEnvironmentTexture || this.currentLowResTexture);
    const hdriActive = this.enabled && activeTexture;

    if (!hdriActive) {
      this.scene.environment = null;
      this.scene.environmentIntensity = 0;
      this.scene.background = null;
      // BackgroundController will handle clear color - don't set it here
      this._notifyEnvironmentMapUpdated(null, 0);
      return;
    }

    let envTexture = null;
    if (this.pmremGenerator) {
      // During fade, ALWAYS use pre-generated PMREM targets to prevent regeneration pop
      // DO NOT create rotated textures during fade - use the pre-generated PMREM directly
      if (isFading) {
        // During fade, use pre-generated PMREM based on fade progress
        if (useLowRes && this.lowResEnvironmentRenderTarget) {
          // Use pre-generated low-res PMREM
          envTexture = this.lowResEnvironmentRenderTarget.texture;
        } else if (this.environmentRenderTarget && this.fullResPmremReady) {
          // Use pre-generated full-res PMREM
          envTexture = this.environmentRenderTarget.texture;
        } else {
          // Fallback during fade - should not happen if pre-generation worked
          const sourceTexture = useLowRes ? this.currentLowResTexture : this.currentEnvironmentTexture;
          const renderTarget = this.pmremGenerator.fromEquirectangular(sourceTexture);
          if (useLowRes) {
            this.lowResEnvironmentRenderTarget = renderTarget;
          } else {
            this.environmentRenderTarget = renderTarget;
          }
          envTexture = renderTarget.texture;
        }
        envTexture.minFilter = THREE.LinearMipmapLinearFilter;
        envTexture.magFilter = THREE.LinearFilter;
      } else {
        // Not fading - normal path with rotation support
        let sourceTexture = activeTexture;
        if (this.rotation !== 0) {
          sourceTexture = this._createRotatedTexture(activeTexture, this.rotation);
        }
        const renderTarget = this.pmremGenerator.fromEquirectangular(sourceTexture);
        this.environmentRenderTarget = renderTarget;
        envTexture = renderTarget.texture;
        envTexture.minFilter = THREE.LinearMipmapLinearFilter;
        envTexture.magFilter = THREE.LinearFilter;
      }
    } else {
      // No PMREM generator - use texture directly
      let sourceTexture = activeTexture;
      if (this.rotation !== 0 && !isFading) {
        sourceTexture = this._createRotatedTexture(activeTexture, this.rotation);
      }
      envTexture = sourceTexture;
    }

    // Keep intensity at full strength throughout to avoid black frames
    // The quality improvement from low-res to full-res provides the visual transition
    const envIntensity = this.strength;
    this.scene.environment = envTexture;
    this.scene.environmentIntensity = envIntensity;
    this._notifyEnvironmentMapUpdated(envTexture, envIntensity);

    if (this.backgroundEnabled && activeTexture) {
      let bgTexture = activeTexture;
      // During fade, don't apply rotation to background to prevent pop
      // Use the same texture that's being used for environment
      if (isFading) {
        // During fade, use the same texture as environment (no rotation)
        bgTexture = activeTexture;
      } else if (this.rotation !== 0) {
        bgTexture = this._createRotatedTexture(activeTexture, this.rotation);
      }
      if (this.blurriness > 0 && envTexture) {
        bgTexture = envTexture;
      }
      this.scene.background = bgTexture;
      if ('backgroundBlurriness' in this.scene) {
        this.scene.backgroundBlurriness = this.blurriness;
        // Keep background intensity at full strength throughout
        this.scene.backgroundIntensity = this.strength;
      }
    } else {
      // HDRI background is disabled - BackgroundController will handle clear color
      // CRITICAL: scene.background MUST be null for clear color to show
      this.scene.background = null;
      if ('backgroundBlurriness' in this.scene) {
        this.scene.backgroundBlurriness = 0;
        this.scene.backgroundIntensity = 1;
      }
      // BackgroundController will set the clear color - don't set it here
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

