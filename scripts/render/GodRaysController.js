import * as THREE from 'three';
import {
  applyGodRaysLightScale,
  applyGodRaysSettings,
  normalizeGodRaysState,
  syncGodRaysLightSource,
} from '../GodRaysEffect.js';

/**
 * pmndrs GodRays — sun mesh follows lens-flare rotation/height.
 */
export class GodRaysController {
  constructor({ godRaysPass, stateStore, getCamera }) {
    this.godRaysPass = godRaysPass;
    this.stateStore = stateStore;
    this.getCamera = getCamera;

    this.userEnabled = false;
    this.hdriEnabled = false;
    this.settings = null;
    this._sunScratch = new THREE.Vector3();
  }

  init(initialState) {
    const defaults = this.stateStore.getDefaults().godRays;
    this.settings = {
      ...defaults,
      ...(initialState.godRays ?? {}),
    };
    this.hdriEnabled = !!initialState.hdriEnabled;
    this.userEnabled = !!this.settings.enabled;
    this.updateSettings(this.settings);
  }

  updateSettings(settings = null) {
    if (!this.godRaysPass) return;

    if (settings) {
      const defaults = this.stateStore.getDefaults().godRays;
      this.settings = {
        ...(this.settings ?? defaults),
        ...settings,
      };
    }

    const defaults = this.stateStore.getDefaults().godRays;
    const currentState = this.stateStore.getState();
    const merged = {
      ...defaults,
      ...(this.settings ?? {}),
      ...(currentState.godRays ?? {}),
    };

    this.userEnabled = !!merged.enabled;
    const active = this.userEnabled && this.hdriEnabled;
    this.godRaysPass.enabled = active;

    const normalized = normalizeGodRaysState(merged, defaults);
    applyGodRaysSettings(
      this.godRaysPass.godRaysEffect,
      normalized,
      defaults,
      this.godRaysPass,
    );
  }

  prepareFrame() {
    if (!this.godRaysPass?.enabled) return;

    const state = this.stateStore.getState();
    const lensFlare = state.lensFlare ?? this.stateStore.getDefaults().lensFlare;
    const godRays = normalizeGodRaysState(
      {
        ...this.stateStore.getDefaults().godRays,
        ...(state.godRays ?? {}),
      },
      this.stateStore.getDefaults().godRays,
    );

    const light = this.godRaysPass.lightSource;
    syncGodRaysLightSource(
      light,
      lensFlare.rotation ?? 0,
      lensFlare.height ?? 15,
      godRays.color,
      this._sunScratch,
    );
    applyGodRaysLightScale(light, godRays.lightScale);
  }

  setEnabled(enabled) {
    this.userEnabled = !!enabled;
    this.updateSettings({ enabled: this.userEnabled });
  }

  setHdriEnabled(enabled) {
    this.hdriEnabled = !!enabled;
    this.updateSettings();
  }

  _patch(key, value) {
    if (value === undefined || value === null) return;
    this.updateSettings({ [key]: value });
  }

  setColor(value) {
    if (!value) return;
    this._patch('color', value);
  }

  setLightScale(value) {
    if (!Number.isFinite(value)) return;
    this._patch('lightScale', value);
  }

  setOpacity(value) {
    if (!Number.isFinite(value)) return;
    this._patch('opacity', value);
  }

  setDensity(value) {
    if (!Number.isFinite(value)) return;
    this._patch('density', value);
  }

  setDecay(value) {
    if (!Number.isFinite(value)) return;
    this._patch('decay', value);
  }

  setWeight(value) {
    if (!Number.isFinite(value)) return;
    this._patch('weight', value);
  }

  setExposure(value) {
    if (!Number.isFinite(value)) return;
    this._patch('exposure', value);
  }

  setClampMax(value) {
    if (!Number.isFinite(value)) return;
    this._patch('clampMax', value);
  }

  setBlur(enabled) {
    this._patch('blur', !!enabled);
  }

  setQuality(value) {
    if (!value) return;
    this._patch('quality', value);
  }

  /** @deprecated Legacy API — maps to opacity. */
  setStrength(value) {
    if (!Number.isFinite(value)) return;
    this._patch('opacity', THREE.MathUtils.clamp(value * 0.5, 0, 1));
  }

  /** @deprecated Legacy API — maps to density. */
  setLength(value) {
    if (!Number.isFinite(value)) return;
    this._patch('density', THREE.MathUtils.lerp(0.88, 1.08, THREE.MathUtils.clamp(value, 0, 1)));
  }

  /** @deprecated Legacy API — maps to decay. */
  setSoftness(value) {
    if (!Number.isFinite(value)) return;
    this._patch('decay', THREE.MathUtils.lerp(0.99, 0.86, THREE.MathUtils.clamp(value, 0, 1)));
  }

  /** @deprecated Legacy API — no direct mapping; ignored. */
  setThreshold() {}

  applyStateSnapshot(state) {
    this.updateSettings(state.godRays);
  }

  setModelRoot() {}

  dispose() {
    this.godRaysPass = null;
    this.settings = null;
  }
}
