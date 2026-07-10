import * as THREE from 'three';
import { resetRendererFullViewport } from '../render/resetRendererFullViewport.js';

/** Throttle luminance readback — full scene render + readPixels is costly every frame. */
export const LUMINANCE_SAMPLE_INTERVAL_MS = 100;

const EXPOSURE_CONVERGED_EPS = 0.003;

/**
 * Manages auto-exposure system that dynamically adjusts scene exposure
 * based on average screen luminance. Samples the scene, calculates target
 * exposure, and smoothly interpolates to the target value.
 */
export class AutoExposureController {
  constructor({ renderer, scene, camera, exposurePass, setExposure, stateStore, onExposureChange }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.exposurePass = exposurePass;
    this.setExposureUniform = typeof setExposure === 'function' ? setExposure : null;
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
    /** How much to amplify deviation from neutral exposure 1.0 (1.25² ≈ 56% vs raw; feels stronger in bright/dark views). */
    this.responseGain = 1.5625;

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
    /** @type {number} */
    this._lastSampleMs = 0;
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
    this._writeExposureUniform(this.currentExposure);
  }

  _writeExposureUniform(value) {
    if (this.setExposureUniform) {
      this.setExposureUniform(value);
    } else if (this.exposurePass?.uniforms?.exposure) {
      this.exposurePass.uniforms.exposure.value = value;
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
      this._lastSampleMs = 0;
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
    this._writeExposureUniform(value);
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
    resetRendererFullViewport(this.renderer);
    this.renderer.setRenderTarget(this.luminanceRenderTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previousTarget);
    resetRendererFullViewport(this.renderer);

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
   * @param {{ burstSample?: boolean, forceSample?: boolean }} [options]
   */
  _shouldSampleLuminance(options = {}) {
    if (options.forceSample || options.burstSample) return true;
    const now = performance.now();
    if (!this._lastSampleMs) return true;
    return now - this._lastSampleMs >= LUMINANCE_SAMPLE_INTERVAL_MS;
  }

  /**
   * Target exposure from the latest smoothed luminance sample.
   * @returns {number}
   */
  _computeTargetExposure() {
    const luminance = THREE.MathUtils.clamp(
      this.averageLuminance ?? this.target,
      0.05,
      1.2,
    );

    let targetExposure;
    if (luminance > this.brightThreshold) {
      const thresholdExposure = this.target / this.brightThreshold;
      const normalizedBrightness = (luminance - this.brightThreshold) / (1.2 - this.brightThreshold);
      const curve = Math.pow(normalizedBrightness, 1.8);
      targetExposure = THREE.MathUtils.lerp(thresholdExposure, this.min, curve);
    } else {
      targetExposure = this.target / luminance;
    }

    const neutralExposure = 1.0;
    targetExposure =
      neutralExposure + (targetExposure - neutralExposure) * this.responseGain;

    return THREE.MathUtils.clamp(targetExposure, this.min, this.max);
  }

  /** Whether auto-exposure has settled near its luminance-driven target. */
  isExposureConverged() {
    if (!this.enabled) return true;
    const target = this._computeTargetExposure();
    return Math.abs((this.autoExposureValue ?? target) - target) < EXPOSURE_CONVERGED_EPS;
  }

  /**
   * Keep the idle rAF loop alive while exposure is still easing toward target.
   * Luminance sampling itself is timer- or interaction-driven once converged.
   */
  needsContinuousFrames() {
    const lensDirt = this.stateStore?.getState()?.lensDirt?.enabled === true;
    if (!this.enabled && !lensDirt) return false;
    if (this.enabled && !this.isExposureConverged()) return true;
    return false;
  }

  /**
   * Apply auto-exposure calculation and update exposure uniform
   * Should be called every frame when auto-exposure is enabled
   */
  applyAutoExposure() {
    if (!this.enabled) return;

    const targetExposure = this._computeTargetExposure();

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
   * @param {{ burstSample?: boolean, forceSample?: boolean }} [options]
   */
  update(unlitMode = false, options = {}) {
    if (unlitMode) return;

    // Sampling runs a full extra scene render + readPixels sync. Skip when neither
    // auto-exposure nor lens dirt needs live luminance (lens dirt uses getAverageLuminance).
    const lensDirtRequested = this.stateStore?.getState()?.lensDirt?.enabled === true;
    if (!this.enabled && !lensDirtRequested) {
      return;
    }

    if (this._shouldSampleLuminance(options)) {
      this.sampleSceneLuminance();
      this._lastSampleMs = performance.now();
    }

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
    this._lastSampleMs = 0;
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

