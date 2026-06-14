import * as THREE from 'three';
import { StateStore } from '../../../scripts/StateStore.js';
import { DEFAULT_MATERIAL_BRIGHTNESS } from '../../../scripts/constants.js';
import { MaterialController } from '../../../scripts/render/MaterialController.js';
import {
  computeCreativeLookToonLightScalars,
} from '../../../scripts/render/CreativeLookMaterials.js';

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
    this.stateStore.set('material.brightness', DEFAULT_MATERIAL_BRIGHTNESS);

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
      },
      onCreativeLookAsciiSync: () => {
        this.onCreativeLookSync?.();
      },
    });

    /** @type {THREE.Object3D | null} */
    this.currentModel = null;
    /** @type {(() => void) | null} */
    this.onCreativeLookSync = null;
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
   */
  syncEnvironment(envTexture, intensity) {
    this.setHdriStrength(intensity);
    if (this.currentModel && envTexture) {
      const blur = this.stateStore.getState().hdriBlurriness ?? 0;
      this.materialController.updateMaterialsEnvironment(envTexture, intensity, blur);
    }
  }

  /** @param {THREE.Object3D} model */
  setModel(model) {
    this.currentModel = model;
    this.materialController.setModel(model, 'shaded', {
      material: { brightness: DEFAULT_MATERIAL_BRIGHTNESS },
      creativeLook: { enabled: false, preset: 'neon-edge' },
    });
    this.materialController.setShading('shaded');
  }

  clearModel() {
    this.currentModel = null;
    this._elapsed = 0;
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
  }

  /** @param {number} dt */
  tick(dt) {
    if (!this.currentModel) return;
    this._elapsed += dt;
    this.materialController.updateCreativeLookTime(this._elapsed);
  }
}
