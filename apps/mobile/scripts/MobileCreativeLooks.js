import * as THREE from 'three';
import { StateStore } from '../../../scripts/StateStore.js';
import { MaterialController } from '../../../scripts/render/MaterialController.js';
import {
  computeCreativeLookToonLightScalars,
} from '../../../scripts/render/CreativeLookMaterials.js';
import { buildMobileCreativeLookResetPatch } from './mobileStyleControls.js';
import { MATERIAL_EMISSIVE_SLIDER_MAX } from '../../../scripts/constants.js';
import {
  MOBILE_MATERIAL_DEFAULTS,
  MOBILE_MATERIAL_MR_MAP_DEFAULTS,
  MOBILE_MATERIAL_SCALAR_DEFAULTS,
} from './mobileParityDefaults.js';

/** Same fallback as desktop SceneManager when the studio rig is off. */
const MOBILE_KEY_LIGHT_DIR = new THREE.Vector3(0.35, 0.92, 0.42).normalize();

/**
 * Desktop-parity Shader Lab via MaterialController (lighting, maps, geometry prep).
 */
export class MobileCreativeLooks {
  /** @param {THREE.WebGLRenderer} renderer @param {THREE.Scene} scene @param {THREE.Camera} camera */
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.stateStore = new StateStore();
    this.stateStore.set('hdriStrength', 2);
    this.stateStore.set('hdriEnabled', true);
    this.stateStore.set('material.brightness', MOBILE_MATERIAL_DEFAULTS.brightness);

    this.materialController = new MaterialController({
      stateStore: this.stateStore,
      getCreativeLookKeyLightDir: (out) => out.copy(MOBILE_KEY_LIGHT_DIR),
      getCreativeLookToonLightScalars: () => {
        const state = this.stateStore.getState();
        return computeCreativeLookToonLightScalars(null, {
          hdriStrength: state.hdriStrength,
          hdriEnabled: state.hdriEnabled !== false,
        });
      },
      afterCreativeLookMaterialRebuild: () => {
        this.onEnvironmentResync?.();
        if (!this.currentModel || typeof this.renderer?.compile !== 'function') return;
        requestAnimationFrame(() => {
          if (!this.renderer || !this.scene || !this.camera || !this.currentModel) return;
          try {
            this.renderer.compile(this.scene, this.camera);
          } catch {
            /* ignore compile failures on partial rebuild */
          }
        });
      },
      onCreativeLookAsciiSync: () => {
        this.onCreativeLookSync?.();
      },
    });

    /** @type {(() => void) | null} */
    this.onCreativeLookStateChanged = null;

    /** @type {THREE.Object3D | null} */
    this.currentModel = null;
    /** @type {(() => void) | null} */
    this.onCreativeLookSync = null;
    /** @type {(() => void) | null} */
    this.onEnvironmentResync = null;
    /** @type {((loading: boolean) => void) | null} */
    this.onCreativeLookLoading = null;
    /** @type {((presetId: string) => Promise<void>) | null} */
    this.prepareCreativeLookPost = null;
    /** @type {((presetId: string) => boolean) | null} */
    this.needsCreativeLookPostPrepare = null;
    this._elapsed = 0;
    /** @type {Promise<void>} */
    this._creativeLookApplyChain = Promise.resolve();
  }

  /** @param {number} strength */
  setHdriStrength(strength) {
    this.stateStore.set('hdriStrength', strength);
    this.stateStore.set('hdriEnabled', strength > 0);
  }

  /** @param {number} blurriness */
  setHdriBlurriness(blurriness) {
    this.stateStore.set('hdriBlurriness', blurriness);
  }

  /**
   * Desktop-parity env sync — StateStore + MaterialController (not just envMapIntensity).
   * @param {THREE.Texture | null} envTexture
   * @param {number} intensity
   * @param {number} [blurriness]
   */
  syncEnvironment(envTexture, intensity, blurriness) {
    this.setHdriStrength(intensity);
    if (blurriness !== undefined) {
      this.setHdriBlurriness(blurriness);
    }
    if (this.currentModel && envTexture) {
      const blur = blurriness ?? this.stateStore.getState().hdriBlurriness ?? 0;
      this.materialController.updateMaterialsEnvironment(envTexture, intensity, blur);
    }
  }

  /** @param {THREE.Object3D} model */
  setModel(model) {
    this.currentModel = model;
    this.materialController.setModel(model, 'shaded', {
      material: { brightness: MOBILE_MATERIAL_DEFAULTS.brightness },
      creativeLook: { enabled: false, preset: 'neon-edge' },
    });
    this.materialController.setShading('shaded');
    this.applyStudioMaterialDefaults(model);
    this.onEnvironmentResync?.();
  }

  /**
   * Match desktop SceneStateApplier material block after import.
   * @param {THREE.Object3D} model
   */
  applyStudioMaterialDefaults(model) {
    const importUsesAuthoredPbr = this.materialController._modelHasAuthoredPbrMaterials(model);
    const hasMrMaps = this.materialController._modelHasImportMrMaps(model);
    const mrDefaults = importUsesAuthoredPbr
      ? MOBILE_MATERIAL_MR_MAP_DEFAULTS
      : MOBILE_MATERIAL_SCALAR_DEFAULTS;

    const brightness = MOBILE_MATERIAL_DEFAULTS.brightness;
    const metalness = mrDefaults.metalness;
    const roughness = mrDefaults.roughness;

    this.stateStore.set('material.brightness', brightness);
    this.stateStore.set('material.metalness', metalness);
    this.stateStore.set('material.roughness', roughness);
    this.stateStore.set('material.emissive', MOBILE_MATERIAL_DEFAULTS.emissive);
    this.stateStore.set('material.importHasMrMaps', hasMrMaps);
    this.stateStore.set('material.importUsesAuthoredPbr', importUsesAuthoredPbr);

    this.materialController.setMaterialBrightness(brightness);
    this.materialController.setMaterialMetalness(metalness);
    this.materialController.setMaterialRoughness(roughness);
    this.materialController.setMaterialEmissive(MOBILE_MATERIAL_DEFAULTS.emissive);
  }

  getMaterialSettings() {
    const state = this.stateStore.getState();
    const importUsesAuthoredPbr = !!state.material?.importUsesAuthoredPbr;
    const mrDefaults = importUsesAuthoredPbr
      ? MOBILE_MATERIAL_MR_MAP_DEFAULTS
      : MOBILE_MATERIAL_SCALAR_DEFAULTS;
    return {
      brightness: state.material?.brightness ?? MOBILE_MATERIAL_DEFAULTS.brightness,
      metalness: state.material?.metalness ?? mrDefaults.metalness,
      roughness: state.material?.roughness ?? mrDefaults.roughness,
      emissive: state.material?.emissive ?? MOBILE_MATERIAL_DEFAULTS.emissive,
    };
  }

  /** @param {'brightness' | 'metalness' | 'roughness' | 'emissive'} key @param {number} value */
  setMaterialValue(key, value) {
    const mc = this.materialController;
    switch (key) {
      case 'brightness': {
        const clamped = Math.max(0, Math.min(5, value));
        this.stateStore.set('material.brightness', clamped);
        mc.setMaterialBrightness(clamped);
        break;
      }
      case 'metalness': {
        const clamped = Math.max(0, Math.min(1, value));
        this.stateStore.set('material.metalness', clamped);
        mc.setMaterialMetalness(clamped);
        break;
      }
      case 'roughness': {
        const clamped = Math.max(0, Math.min(1, value));
        this.stateStore.set('material.roughness', clamped);
        mc.setMaterialRoughness(clamped);
        break;
      }
      case 'emissive': {
        const clamped = Math.max(0, Math.min(MATERIAL_EMISSIVE_SLIDER_MAX, value));
        this.stateStore.set('material.emissive', clamped);
        mc.setMaterialEmissive(clamped);
        break;
      }
      default:
        break;
    }
  }

  clearModel() {
    this.currentModel = null;
    this._elapsed = 0;
  }

  getCreativeLookSettings() {
    return { ...this.materialController.creativeLookSettings };
  }

  /** @param {object} patch */
  setCreativeLookSettings(patch) {
    this.materialController.setCreativeLookSettings(patch);
    this.onCreativeLookStateChanged?.();
    this.onCreativeLookSync?.();
  }

  togglePauseShaderAnimations() {
    const paused = !!this.materialController.creativeLookSettings.pauseShaderAnimations;
    this.setCreativeLookSettings({ pauseShaderAnimations: !paused });
    return !paused;
  }

  toggleViewportBloom() {
    const on = !!this.materialController.creativeLookSettings.viewportBloom;
    this.setCreativeLookSettings({ viewportBloom: !on });
    return !on;
  }

  /** Reset slider tuning for the active shader preset (keeps preset selected). */
  resetCreativeLookSliders() {
    if (!this.materialController.creativeLookSettings.enabled) return false;
    const preset = this.materialController.creativeLookSettings.preset;
    this.setCreativeLookSettings(buildMobileCreativeLookResetPatch(preset));
    return true;
  }

  /**
   * @param {string} presetId — creative-look id, or `none` / `standard` to restore PBR
   * @returns {Promise<void>}
   */
  setCreativeLook(presetId) {
    this._creativeLookApplyChain = this._creativeLookApplyChain
      .catch(() => {})
      .then(() => this._applyCreativeLookOnce(presetId));
    return this._creativeLookApplyChain;
  }

  /**
   * Serialize material rebuilds — rapid rail swipes were overlapping GPU work and crashing mobile WebGL.
   * @param {string} presetId
   */
  async _applyCreativeLookOnce(presetId) {
    const patch =
      presetId === 'none' || presetId === 'standard'
        ? { enabled: false }
        : { enabled: true, preset: presetId };
    const heavy = this.materialController.willRebuildCreativeLookMaterials(patch);
    const needsPostPrepare =
      presetId !== 'none'
      && presetId !== 'standard'
      && this.needsCreativeLookPostPrepare?.(presetId);
    const showSpinner = heavy || needsPostPrepare;

    if (showSpinner) {
      this.onCreativeLookLoading?.(true);
    }

    try {
      if (needsPostPrepare) {
        await this.prepareCreativeLookPost?.(presetId);
      }

      if (heavy) {
        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
      }

      if (presetId === 'none' || presetId === 'standard') {
        this.materialController.setCreativeLookSettings({ enabled: false });
        this.onCreativeLookStateChanged?.();
        this.onCreativeLookSync?.();
        this.onEnvironmentResync?.();
        return;
      }
      this.materialController.setCreativeLookSettings({
        enabled: true,
        preset: presetId,
      });
      this.onCreativeLookStateChanged?.();
      this.onCreativeLookSync?.();
    } catch (err) {
      console.error('[Orby Mobile] Shader apply failed', presetId, err);
      this.onCreativeLookStateChanged?.();
    } finally {
      if (showSpinner) {
        this.onCreativeLookLoading?.(false);
      }
    }
  }

  /** @param {number} dt */
  tick(dt) {
    if (!this.currentModel) return;
    this._elapsed += dt;
    this.materialController.updateCreativeLookTime(this._elapsed);
  }
}
