import { LensFlareEffect } from '../LensFlareEffect.js';

/**
 * Manages the lens flare effect system, including initialization,
 * settings updates, and occlusion handling for performance.
 */
export class LensFlareController {
  constructor({ camera, stateStore }) {
    this.camera = camera;
    this.stateStore = stateStore;

    this.lensFlare = null;
    this.lensFlareEnabled = false;
    this.hdriEnabled = false;
    this.modelRoot = null;
  }

  /**
   * Initialize the lens flare system with initial state
   * @param {Object} initialState - Initial lens flare state from StateStore
   * @param {boolean} hdriEnabled - Whether HDRI is enabled (lens flare requires HDRI)
   */
  init(initialState, hdriEnabled = false) {
    const defaults = this.stateStore.getDefaults().lensFlare;
    const state = initialState?.lensFlare ?? defaults;

    this.lensFlareEnabled = state.enabled ?? false;
    this.hdriEnabled = hdriEnabled;

    const safeHeight = Math.min(
      90,
      Math.max(0, state?.height ?? defaults?.height ?? 15),
    );

    this.lensFlare = new LensFlareEffect({
      enabled: this.lensFlareEnabled && this.hdriEnabled,
      rotation: state.rotation ?? 0,
      height: safeHeight,
      color: state.color ?? defaults?.color ?? '#d28756',
      quality: state.quality ?? 'maximum',
    });

    this.camera.add(this.lensFlare);
    this.lensFlare.position.set(0, 0, -1);
    this.lensFlare.userData.lensflare = 'no-occlusion';
  }

  /**
   * Set the model root for occlusion checking
   * @param {THREE.Object3D|null} modelRoot - The model root to check occlusion against
   */
  setModelRoot(modelRoot) {
    this.modelRoot = modelRoot;
    if (this.lensFlare) {
      this.lensFlare.occlusionCheckObjects = modelRoot ? [modelRoot] : null;
    }
  }

  /**
   * Enable or disable the lens flare effect
   * @param {boolean} enabled - Whether lens flare should be enabled
   */
  setEnabled(enabled) {
    this.lensFlareEnabled = !!enabled;
    if (this.lensFlare) {
      this.lensFlare.setEnabled(this.lensFlareEnabled && this.hdriEnabled);
    }
  }

  /**
   * Update HDRI enabled state (lens flare requires HDRI to be enabled)
   * @param {boolean} enabled - Whether HDRI is enabled
   */
  setHdriEnabled(enabled) {
    this.hdriEnabled = enabled;
    if (this.lensFlare) {
      this.lensFlare.setEnabled(this.lensFlareEnabled && this.hdriEnabled);
    }
  }

  /**
   * Set the rotation of the lens flare
   * @param {number} value - Rotation value in degrees
   */
  setRotation(value) {
    if (this.lensFlare) {
      this.lensFlare.setRotation(value ?? 0);
    }
  }

  /**
   * Set the height of the lens flare (0-90)
   * @param {number} value - Height value (will be clamped to 0-90)
   */
  setHeight(value) {
    if (this.lensFlare) {
      const clamped = Math.max(0, Math.min(90, value ?? 0));
      this.lensFlare.setHeight(clamped);
    }
  }

  /**
   * Set the color of the lens flare
   * @param {string} value - Color value (hex string)
   */
  setColor(value) {
    if (this.lensFlare && value) {
      this.lensFlare.setColor(value);
    }
  }

  /**
   * Set the quality mode of the lens flare
   * @param {string} mode - Quality mode ('low', 'medium', 'high', 'maximum')
   */
  setQuality(mode) {
    if (this.lensFlare && mode) {
      this.lensFlare.setQuality(mode);
    }
  }

  /**
   * Apply a state snapshot (used when loading saved state)
   * @param {Object} state - Full state object
   */
  applyStateSnapshot(state) {
    const lensDefaults = this.stateStore.getDefaults().lensFlare;
    const lensState = {
      ...lensDefaults,
      ...(state.lensFlare ?? {}),
    };

    this.setHeight(lensState.height ?? 0);
    this.setColor(lensState.color ?? '#d28756');
    this.setQuality(lensState.quality ?? 'maximum');
    this.setRotation(lensState.rotation ?? 0);
    this.setEnabled(lensState.enabled ?? false);
  }

  /**
   * Dispose of the lens flare system
   */
  dispose() {
    if (this.lensFlare) {
      this.camera.remove(this.lensFlare);
      this.lensFlare.dispose?.();
      this.lensFlare = null;
    }
    this.modelRoot = null;
  }
}

