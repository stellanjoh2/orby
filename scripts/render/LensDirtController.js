import * as THREE from 'three';

/**
 * Manages the lens dirt post-processing effect, including texture loading
 * and uniform updates based on settings and scene luminance.
 */
export class LensDirtController {
  constructor({ lensDirtPass, textureLoader, stateStore, getAverageLuminance, getCurrentExposure }) {
    this.lensDirtPass = lensDirtPass;
    this.textureLoader = textureLoader;
    this.stateStore = stateStore;
    this.getAverageLuminance = getAverageLuminance; // Callback to get average luminance from auto-exposure
    this.getCurrentExposure = getCurrentExposure; // Callback to get current exposure value from auto-exposure

    this.lensDirtTexture = null;
    this.lensDirtTexturePath = './assets/images/lens-dirt.jpg';
    this.lensDirtSettings = null;
    this.baseExposure = 1.0; // Reference exposure value for normalization
  }

  /**
   * Initialize with initial state
   * @param {Object} initialState - Initial state from StateStore
   */
  init(initialState) {
    const defaults = this.stateStore.getDefaults().lensDirt;
    this.lensDirtSettings = {
      ...defaults,
      ...(initialState.lensDirt ?? {}),
    };
    this.loadTexture();
  }

  /**
   * Load the lens dirt texture
   */
  loadTexture() {
    if (!this.textureLoader || !this.lensDirtTexturePath) return;
    this.textureLoader.load(
      this.lensDirtTexturePath,
      (texture) => {
        if ('colorSpace' in texture && THREE.SRGBColorSpace) {
          texture.colorSpace = THREE.SRGBColorSpace;
        }
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        this.lensDirtTexture = texture;
        if (this.lensDirtPass) {
          this.lensDirtPass.uniforms.tDirt.value = texture;
          this.updateSettings();
        }
      },
      undefined,
      (error) => {
        console.warn('Failed to load lens dirt texture', error);
      },
    );
  }

  /**
   * Update lens dirt settings and uniforms
   * @param {Object} settings - Partial settings object to merge with current settings
   */
  updateSettings(settings = null) {
    if (!this.lensDirtPass) return;

    if (settings) {
      const defaults = this.stateStore.getDefaults().lensDirt;
      this.lensDirtSettings = {
        ...(this.lensDirtSettings ?? defaults),
        ...settings,
      };
    }

    const defaults = this.stateStore.getDefaults().lensDirt;
    const current = this.lensDirtSettings ?? defaults;
    const enabled = !!current.enabled && !!this.lensDirtTexture;

    this.lensDirtPass.enabled = enabled;
    this.lensDirtPass.uniforms.strength.value = current.strength ?? defaults.strength;
    this.lensDirtPass.uniforms.minLuminance.value =
      current.minLuminance ?? defaults.minLuminance;
    this.lensDirtPass.uniforms.maxLuminance.value =
      current.maxLuminance ?? defaults.maxLuminance;
    this.lensDirtPass.uniforms.sensitivity.value =
      current.sensitivity ?? defaults.sensitivity ?? 1.0;

    // Update exposure factor from auto-exposure luminance
    this.updateExposureFactor();
  }

  /**
   * Update the exposure factor uniform based on average scene luminance and current exposure
   * Combines both luminance and exposure value to make lens dirt follow auto-exposure adjustments
   * Should be called every frame or when luminance/exposure changes
   */
  updateExposureFactor() {
    if (!this.lensDirtPass) return;
    
    // Get average luminance from auto-exposure
    const luminance = THREE.MathUtils.clamp(
      this.getAverageLuminance?.() ?? 0,
      0,
      1,
    );
    
    // Get current exposure value from auto-exposure
    const currentExposure = this.getCurrentExposure?.() ?? this.baseExposure;
    
    // Calculate exposure multiplier: when exposure is low (underexposed bright scene),
    // multiplier is high (lens dirt more visible). When exposure is high (overexposed dark scene),
    // multiplier is low (lens dirt less visible).
    // Normalize by base exposure to get a multiplier
    const exposureMultiplier = THREE.MathUtils.clamp(
      this.baseExposure / Math.max(currentExposure, 0.1), // Prevent division by zero
      0.5, // Minimum multiplier
      3.0, // Maximum multiplier
    );
    
    // Combine luminance and exposure multiplier
    // Higher luminance + lower exposure = more lens dirt visibility
    const exposureFactor = THREE.MathUtils.clamp(
      luminance * exposureMultiplier,
      0,
      1,
    );
    
    this.lensDirtPass.uniforms.exposureFactor.value = exposureFactor;
  }

  /**
   * Apply a state snapshot (used when loading saved state)
   * @param {Object} state - Full state object
   */
  applyStateSnapshot(state) {
    this.updateSettings(state.lensDirt);
  }

  /**
   * Dispose of resources
   */
  dispose() {
    if (this.lensDirtTexture) {
      this.lensDirtTexture.dispose();
      this.lensDirtTexture = null;
    }
  }
}

