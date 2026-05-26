import * as THREE from 'three';
import {
  applyGodRaysSettings,
  computeSunAnchorWorld,
  updateGodRaysSunUniforms,
} from '../GodRaysEffect.js';

const SUN_DISTANCE = 40;

/**
 * Screen-space volumetric light shafts (god rays) synced with lens-flare sun direction.
 */
export class GodRaysController {
  constructor({ godRaysPass, stateStore, getCamera }) {
    this.godRaysPass = godRaysPass;
    this.stateStore = stateStore;
    this.getCamera = getCamera;

    this.userEnabled = false;
    this.hdriEnabled = false;
    this.settings = null;
    this.modelRoot = null;
    this.occlusionCheckObjects = null;

    this._sunScratch = new THREE.Vector3();
    this._viewportScratch = new THREE.Vector4();
    this._rayDirection = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
    this._intersections = [];
    this._lastOcclusionCheck = 0;
    this._occlusionCheckInterval = 0.1;
    this._sunOccluded = 1;
  }

  init(initialState) {
    const defaults = this.stateStore.getDefaults().godRays;
    this.settings = {
      ...defaults,
      ...(initialState.godRays ?? {}),
    };
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
    const current = {
      ...defaults,
      ...(this.settings ?? {}),
      ...(currentState.godRays ?? {}),
    };

    this.userEnabled = !!current.enabled;
    const active = this.userEnabled && this.hdriEnabled;
    this.godRaysPass.enabled = active;

    applyGodRaysSettings(this.godRaysPass.uniforms, current, defaults);
  }

  setModelRoot(modelRoot) {
    this.modelRoot = modelRoot;
    this.occlusionCheckObjects = modelRoot ? [modelRoot] : null;
    this._lastOcclusionCheck = 0;
  }

  _updateSunOcclusion(camera) {
    const uniforms = this.godRaysPass?.uniforms;
    if (!uniforms || !camera) return;

    if (!this.occlusionCheckObjects?.length) {
      this._sunOccluded = 0;
      uniforms.uSunOccluded.value = 0;
      return;
    }

    const now = performance.now() * 0.001;
    if (now - this._lastOcclusionCheck < this._occlusionCheckInterval) {
      uniforms.uSunOccluded.value = this._sunOccluded;
      return;
    }
    this._lastOcclusionCheck = now;

    computeSunAnchorWorld(
      this.stateStore.getState().lensFlare?.rotation ?? 0,
      this.stateStore.getState().lensFlare?.height ?? 15,
      SUN_DISTANCE,
      this._sunScratch,
    );

    const distance = camera.position.distanceTo(this._sunScratch);
    this._rayDirection.copy(this._sunScratch).sub(camera.position).normalize();
    this._raycaster.set(camera.position, this._rayDirection);
    this._raycaster.far = distance;
    this._intersections.length = 0;
    this._raycaster.intersectObjects(
      this.occlusionCheckObjects,
      true,
      this._intersections,
    );

    const occluder = this._intersections.find(
      (hit) =>
        hit.object.visible !== false &&
        hit.object.userData?.lensflare !== 'no-occlusion',
    );

    this._sunOccluded = occluder ? 1 : 0;
    uniforms.uSunOccluded.value = this._sunOccluded;
  }

  /** Keep sun position in sync with lens-flare rotation/height each frame. */
  prepareFrame(renderer) {
    if (!this.godRaysPass?.enabled) return;

    const camera = this.getCamera?.();
    if (!camera) return;

    const viewport = this._viewportScratch;
    renderer.getCurrentViewport(viewport);
    this.godRaysPass.uniforms.uResolution.value.set(viewport.z, viewport.w);

    const state = this.stateStore.getState();
    const lensFlare = state.lensFlare ?? this.stateStore.getDefaults().lensFlare;
    updateGodRaysSunUniforms(
      this.godRaysPass.uniforms,
      camera,
      lensFlare.rotation ?? 0,
      lensFlare.height ?? 15,
      this._sunScratch,
    );
    this._updateSunOcclusion(camera);
  }

  setEnabled(enabled) {
    this.userEnabled = !!enabled;
    this.updateSettings({ enabled: this.userEnabled });
  }

  setHdriEnabled(enabled) {
    this.hdriEnabled = !!enabled;
    this.updateSettings();
  }

  setColor(value) {
    if (!value) return;
    this.updateSettings({ color: value });
  }

  setStrength(value) {
    if (!Number.isFinite(value)) return;
    this.updateSettings({ strength: value });
  }

  setLength(value) {
    if (!Number.isFinite(value)) return;
    this.updateSettings({ length: value });
  }

  setSoftness(value) {
    if (!Number.isFinite(value)) return;
    this.updateSettings({ softness: value });
  }

  setThreshold(value) {
    if (!Number.isFinite(value)) return;
    this.updateSettings({ threshold: value });
  }

  setQuality(value) {
    if (!value) return;
    this.updateSettings({ quality: value });
  }

  applyStateSnapshot(state) {
    this.updateSettings(state.godRays);
  }

  dispose() {
    this.godRaysPass = null;
    this.settings = null;
    this.modelRoot = null;
    this.occlusionCheckObjects = null;
  }
}
