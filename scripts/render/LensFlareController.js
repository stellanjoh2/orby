import { LensFlareEffect } from '../LensFlareEffect.js';

export function resolveDiscGlowFromState(state = {}, defaults = {}) {
  const legacyScale = state.discGlowScale;
  const hasLegacyOnly =
    legacyScale != null &&
    state.discGlowIntensity == null &&
    state.discGlowSize == null;

  return {
    intensity:
      state.discGlowIntensity ??
      (hasLegacyOnly ? legacyScale : defaults.discGlowIntensity ?? 0),
    size:
      state.discGlowSize ??
      legacyScale ??
      defaults.discGlowSize ??
      5,
    color: state.discGlowColor ?? defaults.discGlowColor ?? '#ff8844',
  };
}

/**
 * Manages the lens flare effect system, including initialization,
 * settings updates, and occlusion handling for performance.
 */
export class LensFlareController {
  constructor({ camera, scene, stateStore }) {
    this.camera = camera;
    this.scene = scene;
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

    const discGlow = resolveDiscGlowFromState(state, defaults);

    this.lensFlare = new LensFlareEffect({
      enabled: this.lensFlareEnabled && this.hdriEnabled,
      rotation: state.rotation ?? 0,
      height: safeHeight,
      color: state.color ?? defaults?.color ?? '#d28756',
      quality: state.quality ?? 'maximum',
      haloIntensity: state.haloIntensity ?? defaults?.haloIntensity ?? 1.0,
      streakLength: state.streakLength ?? defaults?.streakLength ?? 5.0,
      sunDiscScale: state.sunDiscScale ?? defaults?.sunDiscScale ?? 1.5,
      sunDiscBlur: state.sunDiscBlur ?? defaults?.sunDiscBlur ?? 1.25,
      sunDiscColor: state.sunDiscColor ?? defaults?.sunDiscColor ?? '#fff0c8',
      discGlowIntensity: discGlow.intensity,
      discGlowSize: discGlow.size,
      discGlowColor: discGlow.color,
    });

    // Fullscreen clip-space quad — must live on the scene graph, not the camera.
    // Camera children are skipped by the EffectComposer render pass in this pipeline.
    this.scene.add(this.lensFlare);
    this.lensFlare.matrixAutoUpdate = false;
    this.lensFlare.userData.lensflare = 'no-occlusion';
  }

  /** Keep uniforms fresh even if a pass skips the draw call. */
  prepareFrame(renderer) {
    if (!this.lensFlare?.visible || !this.scene) return;
    this.lensFlare.prepareFrame(renderer, this.scene, this.camera);
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
   * Freeze lens-flare procedural time (iTime) while true (e.g. shelf UI scrolling).
   */
  setTimeAnimationPaused(paused) {
    if (this.lensFlare) {
      this.lensFlare.setTimeAnimationPaused(!!paused);
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
   * Set the rainbow-halo intensity of the lens flare.
   * 1.0 matches the original subtle look; higher values push the rainbow
   * ring brighter and slightly wider.
   * @param {number} value - Halo intensity (0–5)
   */
  setHaloIntensity(value) {
    if (this.lensFlare && Number.isFinite(value)) {
      this.lensFlare.setHaloIntensity(value);
    }
  }

  /**
   * Set star-ray streak length (0–10; 5 = default look).
   * @param {number} value - Streak length
   */
  setStreakLength(value) {
    if (this.lensFlare && Number.isFinite(value)) {
      this.lensFlare.setStreakLength(value);
    }
  }

  /**
   * Set the sun disc scale (0–10). The disc stays visible when flares are occluded.
   * @param {number} value - Sun disc scale
   */
  setSunDiscScale(value) {
    if (this.lensFlare && Number.isFinite(value)) {
      this.lensFlare.setSunDiscScale(value);
    }
  }

  /**
   * Set the sun disc edge blur (0 = sharp, 5 = soft).
   * @param {number} value - Blur amount
   */
  setSunDiscBlur(value) {
    if (this.lensFlare && Number.isFinite(value)) {
      this.lensFlare.setSunDiscBlur(value);
    }
  }

  /**
   * Set the sun disc color.
   * @param {string} value - Color value (hex string)
   */
  setSunDiscColor(value) {
    if (this.lensFlare && value) {
      this.lensFlare.setSunDiscColor(value);
    }
  }

  /**
   * Set the disc glow intensity (0–10).
   * @param {number} value - Disc glow intensity
   */
  setDiscGlowIntensity(value) {
    if (this.lensFlare && Number.isFinite(value)) {
      this.lensFlare.setDiscGlowIntensity(value);
    }
  }

  /**
   * Set the disc glow size (0–10).
   * @param {number} value - Disc glow size
   */
  setDiscGlowSize(value) {
    if (this.lensFlare && Number.isFinite(value)) {
      this.lensFlare.setDiscGlowSize(value);
    }
  }

  /**
   * Set the disc glow color.
   * @param {string} value - Color value (hex string)
   */
  setDiscGlowColor(value) {
    if (this.lensFlare && value) {
      this.lensFlare.setDiscGlowColor(value);
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

    const discGlow = resolveDiscGlowFromState(lensState, lensDefaults);

    this.setHeight(lensState.height ?? 0);
    this.setColor(lensState.color ?? '#d28756');
    this.setQuality(lensState.quality ?? 'maximum');
    this.setRotation(lensState.rotation ?? 0);
    this.setHaloIntensity(lensState.haloIntensity ?? 1.0);
    this.setStreakLength(lensState.streakLength ?? 5.0);
    this.setSunDiscScale(lensState.sunDiscScale ?? 1.5);
    this.setSunDiscBlur(lensState.sunDiscBlur ?? 1.25);
    this.setSunDiscColor(lensState.sunDiscColor ?? '#fff0c8');
    this.setDiscGlowIntensity(discGlow.intensity);
    this.setDiscGlowSize(discGlow.size);
    this.setDiscGlowColor(discGlow.color);
    this.setEnabled(lensState.enabled ?? false);
  }

  /**
   * Dispose of the lens flare system
   */
  dispose() {
    if (this.lensFlare) {
      this.scene?.remove(this.lensFlare);
      this.lensFlare.dispose?.();
      this.lensFlare = null;
    }
    this.modelRoot = null;
  }
}

