import * as THREE from 'three';
import { StateStore } from '../../../scripts/StateStore.js';
import { MaterialController } from '../../../scripts/render/MaterialController.js';
import {
  computeCreativeLookToonLightScalars,
} from '../../../scripts/render/CreativeLookMaterials.js';
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
        this.renderer.compile(this.scene, this.camera);
        this.onEnvironmentResync?.();
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
    this._elapsed = 0;
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
    const hasMrMaps = this.materialController._modelHasImportMrMaps(model);
    const pbr = hasMrMaps
      ? MOBILE_MATERIAL_MR_MAP_DEFAULTS
      : {
          metalness: this.materialController.materialSettings.metalness,
          roughness: this.materialController.materialSettings.roughness,
        };

    const brightness = MOBILE_MATERIAL_DEFAULTS.brightness;
    const metalness = hasMrMaps ? pbr.metalness : (Number.isFinite(pbr.metalness) ? pbr.metalness : MOBILE_MATERIAL_SCALAR_DEFAULTS.metalness);
    const roughness = hasMrMaps ? pbr.roughness : (Number.isFinite(pbr.roughness) ? pbr.roughness : MOBILE_MATERIAL_SCALAR_DEFAULTS.roughness);

    this.stateStore.set('material.brightness', brightness);
    this.stateStore.set('material.metalness', metalness);
    this.stateStore.set('material.roughness', roughness);
    this.stateStore.set('material.emissive', MOBILE_MATERIAL_DEFAULTS.emissive);
    this.stateStore.set('material.importHasMrMaps', hasMrMaps);

    this.materialController.setMaterialBrightness(brightness);
    this.materialController.setMaterialMetalness(metalness);
    this.materialController.setMaterialRoughness(roughness);
    this.materialController.setMaterialEmissive(MOBILE_MATERIAL_DEFAULTS.emissive);
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

  /**
   * @param {string} presetId — creative-look id, or `none` / `standard` to restore PBR
   */
  setCreativeLook(presetId) {
    if (presetId === 'none' || presetId === 'standard') {
      this.materialController.setCreativeLookSettings({
        enabled: false,
        preset: 'neon-edge',
      });
      return;
    }
    this.materialController.setCreativeLookSettings({
      enabled: true,
      preset: presetId,
    });
    this.onCreativeLookStateChanged?.();
    this.onCreativeLookSync?.();
  }

  /** @param {number} dt */
  tick(dt) {
    if (!this.currentModel) return;
    this._elapsed += dt;
    this.materialController.updateCreativeLookTime(this._elapsed);
  }
}
