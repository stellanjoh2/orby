import * as THREE from 'three';

/**
 * Manages auto-exposure system that dynamically adjusts scene exposure
 * based on average screen luminance. Samples the scene, calculates target
 * exposure, and smoothly interpolates to the target value.
 */
export class AutoExposureController {
  constructor({ renderer, scene, camera, exposurePass, stateStore, onExposureChange }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.exposurePass = exposurePass;
    this.stateStore = stateStore;
    this.onExposureChange = onExposureChange; // Callback to update UI when exposure changes

    // Auto-exposure state
    this.enabled = false;
    this.manualExposure = 1.0;
    this.currentExposure = 1.0;
    this.autoExposureValue = 1.0;

    // Auto-exposure parameters
    this.target = 0.45; // Target luminance (0-1)
    this.min = 0.50; // Minimum exposure value (when looking at brightest sky)
    this.max = 2.5; // Maximum exposure value
    this.smooth = 0.12; // Smoothing factor for lerp
    this.brightThreshold = 0.65; // Luminance threshold for aggressive response (lowered to kick in earlier)

    // Luminance sampling setup
    this.sampleSize = 8;
    this.luminanceRenderTarget = new THREE.WebGLRenderTarget(
      this.sampleSize,
      this.sampleSize,
      {
        depthBuffer: false,
        stencilBuffer: false,
      },
    );
    this.luminanceBuffer = new Uint8Array(
      this.sampleSize * this.sampleSize * 4,
    );
    this.averageLuminance = 0.5;
  }

  /**
   * Initialize with initial state
   * @param {Object} initialState - Initial state from StateStore
   */
  init(initialState) {
    this.manualExposure = initialState.exposure ?? 1.0;
    this.currentExposure = this.manualExposure;
    this.autoExposureValue = this.manualExposure;
    this.enabled = initialState.autoExposure ?? false;

    // Set initial exposure
    if (this.exposurePass) {
      this.exposurePass.uniforms.exposure.value = this.currentExposure;
    }
  }

  /**
   * Enable or disable auto-exposure
   * @param {boolean} enabled - Whether auto-exposure should be enabled
   */
  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (this.enabled) {
      // When enabling, start from current exposure
      this.autoExposureValue = this.currentExposure ?? this.manualExposure ?? 1;
    } else {
      // When disabling, revert to manual exposure
      this.setExposure(this.manualExposure ?? 1);
    }
  }

  /**
   * Set the manual exposure value (used when auto-exposure is disabled)
   * @param {number} value - Manual exposure value
   */
  setManualExposure(value) {
    this.manualExposure = value;
    if (!this.enabled) {
      this.setExposure(value);
    }
  }

  /**
   * Set the exposure value and update the uniform
   * @param {number} value - Exposure value to set
   */
  setExposure(value) {
    this.currentExposure = value;
    if (this.exposurePass) {
      this.exposurePass.uniforms.exposure.value = value;
    }
    // Update UI display in real-time (even when auto-exposure is enabled)
    if (this.onExposureChange) {
      this.onExposureChange(value);
    }
  }

  /**
   * Sample the scene luminance by rendering to a small render target
   * and calculating the average brightness
   */
  sampleSceneLuminance() {
    // Skip sampling in unlit mode (no meaningful luminance)
    if (!this.luminanceRenderTarget || !this.renderer) return;

    const previousTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.luminanceRenderTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previousTarget);

    try {
      this.renderer.readRenderTargetPixels(
        this.luminanceRenderTarget,
        0,
        0,
        this.sampleSize,
        this.sampleSize,
        this.luminanceBuffer,
      );

      // Calculate average luminance using Rec. 709 weights
      let sum = 0;
      for (let i = 0; i < this.luminanceBuffer.length; i += 4) {
        const r = this.luminanceBuffer[i] / 255;
        const g = this.luminanceBuffer[i + 1] / 255;
        const b = this.luminanceBuffer[i + 2] / 255;
        const value = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sum += value;
      }

      const avg = sum / (this.luminanceBuffer.length / 4);
      
      // Smooth the luminance value to avoid flickering
      this.averageLuminance = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(this.averageLuminance ?? avg, avg, 0.35),
        0,
        1,
      );
    } catch (error) {
      // Ignore read errors (e.g., if readPixels is unavailable)
    }
  }

  /**
   * Apply auto-exposure calculation and update exposure uniform
   * Should be called every frame when auto-exposure is enabled
   */
  applyAutoExposure() {
    if (!this.enabled) return;

    // Clamp luminance to reasonable range
    const luminance = THREE.MathUtils.clamp(
      this.averageLuminance ?? this.target,
      0.05,
      1.2,
    );

    // Calculate target exposure: inverse relationship with luminance
    // Brighter scenes need lower exposure, darker scenes need higher exposure
    // Use more aggressive curve for very bright scenes (looking at sky) to reach 0.50 at max brightness
    let targetExposure;
    if (luminance > this.brightThreshold) {
      // For very bright scenes, map luminance to exposure range
      // At brightThreshold (0.65), use normal calculation
      // At max brightness (1.2), exposure should be 0.50 (min)
      const thresholdExposure = this.target / this.brightThreshold;
      const normalizedBrightness = (luminance - this.brightThreshold) / (1.2 - this.brightThreshold);
      // Interpolate from threshold exposure down to 0.50 as brightness increases
      // Use exponential curve for more aggressive drop
      const curve = Math.pow(normalizedBrightness, 1.8); // Exponential curve
      targetExposure = THREE.MathUtils.lerp(thresholdExposure, this.min, curve);
    } else {
      // Normal response for typical scenes
      targetExposure = this.target / luminance;
    }

    targetExposure = THREE.MathUtils.clamp(targetExposure, this.min, this.max);

    // Smoothly interpolate to target exposure
    this.autoExposureValue = THREE.MathUtils.lerp(
      this.autoExposureValue ?? targetExposure,
      targetExposure,
      this.smooth,
    );

    // Update the exposure uniform
    this.setExposure(this.autoExposureValue);
  }

  /**
   * Update method to be called every frame
   * Samples luminance and applies auto-exposure if enabled
   * @param {boolean} unlitMode - Whether we're in unlit mode (skip sampling if true)
   */
  update(unlitMode = false) {
    if (unlitMode) return;
    
    this.sampleSceneLuminance();
    this.applyAutoExposure();
  }

  /**
   * Get the current exposure value
   * @returns {number} Current exposure value
   */
  getExposure() {
    return this.currentExposure;
  }

  /**
   * Get the average luminance value
   * @returns {number} Average luminance (0-1)
   */
  getAverageLuminance() {
    return this.averageLuminance;
  }

  /**
   * Reset luminance state (useful when scene brightness changes dramatically,
   * e.g., when swapping HDRI presets)
   */
  resetLuminance() {
    // Reset to a neutral value to allow quick adaptation to new scene brightness
    this.averageLuminance = this.target;
    // Also reset auto-exposure value to current exposure to avoid sudden jumps
    this.autoExposureValue = this.currentExposure ?? this.manualExposure ?? 1;
  }

  /**
   * Apply a state snapshot (used when loading saved state)
   * @param {Object} state - Full state object
   */
  applyStateSnapshot(state) {
    this.manualExposure = state.exposure ?? 1.0;
    this.autoExposureValue = this.manualExposure;
    this.setEnabled(state.autoExposure ?? false);
    if (!this.enabled) {
      this.setExposure(this.manualExposure);
    }
  }

  /**
   * Dispose of resources
   */
  dispose() {
    if (this.luminanceRenderTarget) {
      this.luminanceRenderTarget.dispose();
      this.luminanceRenderTarget = null;
    }
  }
}

