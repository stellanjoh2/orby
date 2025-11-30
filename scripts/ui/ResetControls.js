/**
 * ResetControls - Handles all reset button logic
 * Manages copy/load scene settings, and local/section reset buttons
 */
import { HDRI_STRENGTH_UNIT } from '../config/hdri.js';
import { CAMERA_TEMPERATURE_NEUTRAL_K } from '../constants.js';
import { UIHelpers } from './UIHelpers.js';

export class ResetControls {
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    this.helpers = new UIHelpers(eventBus, stateStore, uiManager);
  }

  bind() {
    this.bindCopyButtons();
    this.bindLocalResetButtons();
  }

  bindCopyButtons() {
    // Copy Scene Settings
    const copyScene = async () => {
      const result = await this.ui.sceneSettingsManager.copyToClipboard();
      this.helpers.showToast(result.message);
    };
    this.ui.buttons.copySceneButtons?.forEach(button => {
      button.addEventListener('click', copyScene);
    });

    // Load Scene Settings - Show modal
    this.ui.buttons.loadSceneButtons?.forEach(button => {
      button.addEventListener('click', () => {
        if (this.ui.buttons.loadSceneModal) {
          this.ui.buttons.loadSceneModal.style.display = 'flex';
          if (this.ui.buttons.loadSceneText) {
            this.ui.buttons.loadSceneText.focus();
            navigator.clipboard?.readText().then(text => {
              if (this.ui.buttons.loadSceneText) {
                this.ui.buttons.loadSceneText.value = text;
              }
            }).catch(() => {});
          }
        }
      });
    });

    // Close scene modal
    const closeSceneModal = () => {
      if (this.ui.buttons.loadSceneModal) {
        this.ui.buttons.loadSceneModal.style.display = 'none';
        if (this.ui.buttons.loadSceneText) {
          this.ui.buttons.loadSceneText.value = '';
        }
      }
    };

    this.ui.buttons.closeLoadSceneSettings?.addEventListener('click', closeSceneModal);
    this.ui.buttons.cancelLoadSceneSettings?.addEventListener('click', closeSceneModal);
    
    this.ui.buttons.loadSceneModal?.addEventListener('click', (event) => {
      if (event.target === this.ui.buttons.loadSceneModal) {
        closeSceneModal();
      }
    });

    // Apply scene settings
    this.ui.buttons.applySceneSettings?.addEventListener('click', () => {
      const text = this.ui.buttons.loadSceneText?.value?.trim();
      if (text) {
        const result = this.ui.sceneSettingsManager.loadFromText(text);
        if (result.success) {
          this.ui.syncControls(this.stateStore.getState());
        }
        this.helpers.showToast(result.message);
        if (result.success) {
          closeSceneModal();
        }
      }
    });

    // Reset buttons (Mesh, Studio, Render)
    const resetMesh = () => {
      const defaults = this.stateStore.getDefaults();
      this.stateStore.set('shading', defaults.shading);
      this.stateStore.set('scale', defaults.scale);
      this.stateStore.set('xOffset', defaults.xOffset ?? 0);
      this.stateStore.set('yOffset', defaults.yOffset);
      this.stateStore.set('zOffset', defaults.zOffset ?? 0);
      this.stateStore.set('autoRotate', defaults.autoRotate);
      this.stateStore.set('showNormals', defaults.showNormals);
      this.stateStore.set('clay', defaults.clay);
      // Reset material properties
      this.stateStore.set('material.brightness', defaults.material?.brightness ?? 1.0);
      this.stateStore.set('material.metalness', defaults.material?.metalness ?? 0.0);
      this.stateStore.set('material.roughness', defaults.material?.roughness ?? 0.8);
      
      this.eventBus.emit('mesh:shading', defaults.shading);
      this.eventBus.emit('mesh:scale', defaults.scale);
      this.eventBus.emit('mesh:yOffset', defaults.yOffset);
      this.eventBus.emit('mesh:auto-rotate', defaults.autoRotate);
      this.eventBus.emit('mesh:normals', defaults.showNormals);
      this.eventBus.emit('mesh:clay-color', defaults.clay.color);
      // Emit material reset events
      this.eventBus.emit('mesh:material-brightness', defaults.material?.brightness ?? 1.0);
      this.eventBus.emit('mesh:material-metalness', defaults.material?.metalness ?? 0.0);
      this.eventBus.emit('mesh:material-roughness', defaults.material?.roughness ?? 0.8);
      
      this.ui.syncUIFromState();
      this.helpers.showToast('Mesh settings reset');
    };

    const resetStudio = () => {
      const defaults = this.stateStore.getDefaults();
      this.stateStore.set('hdri', defaults.hdri);
      this.stateStore.set('hdriEnabled', defaults.hdriEnabled);
      this.stateStore.set('hdriStrength', defaults.hdriStrength);
      this.stateStore.set('hdriBackground', defaults.hdriBackground);
      this.stateStore.set('groundSolid', defaults.groundSolid);
      this.stateStore.set('groundWire', defaults.groundWire);
      this.stateStore.set('groundWireOpacity', defaults.groundWireOpacity);
      this.stateStore.set('groundY', defaults.groundY);
      this.stateStore.set('groundSolidColor', defaults.groundSolidColor);
      this.stateStore.set('groundWireColor', defaults.groundWireColor);
      this.stateStore.set('background', defaults.background);
      this.stateStore.set('lights', defaults.lights);
      this.stateStore.set('lightsEnabled', defaults.lightsEnabled);
      this.stateStore.set('lightsMaster', defaults.lightsMaster);
      this.stateStore.set('lightsRotation', defaults.lightsRotation);
      this.stateStore.set('lightsAutoRotate', defaults.lightsAutoRotate);
      this.stateStore.set('lensFlare', defaults.lensFlare);
      
      this.ui.setHdriActive(defaults.hdri);
      this.eventBus.emit('studio:hdri', defaults.hdri);
      this.eventBus.emit('studio:hdri-enabled', defaults.hdriEnabled);
      this.ui.toggleHdriControls(defaults.hdriEnabled);
      this.eventBus.emit('studio:hdri-strength', defaults.hdriStrength);
      this.eventBus.emit('studio:hdri-background', defaults.hdriBackground);
      this.eventBus.emit('studio:lens-flare-enabled', defaults.lensFlare.enabled);
      this.eventBus.emit('studio:lens-flare-rotation', defaults.lensFlare.rotation);
      this.eventBus.emit('studio:lens-flare-height', defaults.lensFlare.height);
      this.eventBus.emit('studio:lens-flare-color', defaults.lensFlare.color);
      this.eventBus.emit('studio:lens-flare-quality', defaults.lensFlare.quality);
      this.eventBus.emit('studio:ground-solid', defaults.groundSolid);
      this.eventBus.emit('studio:ground-wire', defaults.groundWire);
      this.eventBus.emit('studio:ground-wire-opacity', defaults.groundWireOpacity);
      this.eventBus.emit('studio:ground-y', defaults.groundY);
      this.eventBus.emit('studio:ground-solid-color', defaults.groundSolidColor);
      this.eventBus.emit('studio:ground-wire-color', defaults.groundWireColor);
      this.eventBus.emit('scene:background', defaults.background);
      
      Object.keys(defaults.lights).forEach((lightId) => {
        const light = defaults.lights[lightId];
        this.eventBus.emit('lights:update', { lightId, property: 'color', value: light.color });
        this.eventBus.emit('lights:update', { lightId, property: 'intensity', value: light.intensity });
      });
      this.eventBus.emit('lights:master', defaults.lightsMaster);
      this.eventBus.emit('lights:enabled', defaults.lightsEnabled);
      this.eventBus.emit('lights:rotate', defaults.lightsRotation);
      this.eventBus.emit('lights:height', defaults.lightsHeight ?? 5);
      this.eventBus.emit('lights:auto-rotate', defaults.lightsAutoRotate);
      this.ui.setLightsRotationDisabled(defaults.lightsAutoRotate);
      this.stateStore.set('lightsCastShadows', defaults.lightsCastShadows);
      this.eventBus.emit('lights:cast-shadows', defaults.lightsCastShadows);
      
      this.ui.syncUIFromState();
      this.helpers.showToast('Studio settings reset');
    };

    const resetRender = () => {
      const defaults = this.stateStore.getDefaults();
      this.stateStore.set('dof', defaults.dof);
      this.stateStore.set('bloom', defaults.bloom);
      this.stateStore.set('grain', defaults.grain);
      this.stateStore.set('aberration', defaults.aberration);
      this.stateStore.set('fresnel', defaults.fresnel);
      this.stateStore.set('camera', defaults.camera);
      this.stateStore.set('exposure', defaults.exposure);
      this.stateStore.set('antiAliasing', defaults.antiAliasing);
      this.stateStore.set('toneMapping', defaults.toneMapping);
      
      this.eventBus.emit('render:dof', defaults.dof);
      this.ui.setEffectControlsDisabled(['dofFocus', 'dofAperture'], !defaults.dof.enabled);
      this.eventBus.emit('render:bloom', defaults.bloom);
      this.ui.setEffectControlsDisabled(['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor'], !defaults.bloom.enabled);
      this.eventBus.emit('render:grain', defaults.grain);
      this.ui.setEffectControlsDisabled(['grainIntensity'], !defaults.grain.enabled);
      this.eventBus.emit('render:aberration', defaults.aberration);
      this.ui.setEffectControlsDisabled(['aberrationOffset', 'aberrationStrength'], !defaults.aberration.enabled);
      this.eventBus.emit('render:fresnel', defaults.fresnel);
      this.ui.setEffectControlsDisabled(['fresnelColor', 'fresnelRadius', 'fresnelStrength'], !defaults.fresnel.enabled);
      this.eventBus.emit('camera:fov', defaults.camera.fov);
      this.eventBus.emit('camera:tilt', defaults.camera.tilt ?? 0);
      this.eventBus.emit('scene:exposure', defaults.exposure);
      this.eventBus.emit('camera:auto-exposure', defaults.autoExposure ?? false);
      this.eventBus.emit('render:contrast', defaults.camera.contrast);
      this.eventBus.emit('render:temperature', defaults.camera.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K);
      this.eventBus.emit('render:tint', (defaults.camera.tint ?? 0) / 100);
      this.eventBus.emit('render:highlights', (defaults.camera.highlights ?? 0) / 100);
      this.eventBus.emit('render:shadows', (defaults.camera.shadows ?? 0) / 100);
      this.eventBus.emit('render:saturation', defaults.camera.saturation);
      this.eventBus.emit('render:anti-aliasing', defaults.antiAliasing);
      this.eventBus.emit('render:tone-mapping', defaults.toneMapping);
      
      this.ui.syncUIFromState();
      this.helpers.showToast('FX settings reset');
    };

    this.ui.buttons.resetMesh?.addEventListener('click', resetMesh);
    this.ui.buttons.resetStudio?.addEventListener('click', resetStudio);
    this.ui.buttons.resetRender?.addEventListener('click', resetRender);
  }

  bindLocalResetButtons() {
    const defaults = this.stateStore.getDefaults();
    
    document.querySelectorAll('[data-reset]').forEach((button) => {
      button.addEventListener('click', () => {
        const resetType = button.dataset.reset;
        
        switch (resetType) {
          case 'material':
            this.stateStore.set('material.brightness', defaults.material?.brightness ?? 1.0);
            this.stateStore.set('material.metalness', defaults.material?.metalness ?? 0.0);
            this.stateStore.set('material.roughness', defaults.material?.roughness ?? 0.8);
            this.eventBus.emit('mesh:material-brightness', defaults.material?.brightness ?? 1.0);
            this.eventBus.emit('mesh:material-metalness', defaults.material?.metalness ?? 0.0);
            this.eventBus.emit('mesh:material-roughness', defaults.material?.roughness ?? 0.8);
            this.ui.syncUIFromState();
            break;
            
          case 'clay':
            this.stateStore.set('clay', defaults.clay);
            this.eventBus.emit('mesh:clay-color', defaults.clay.color);
            this.ui.syncUIFromState();
            break;
            
          case 'wireframe':
            this.stateStore.set('wireframe', defaults.wireframe);
            if (this.ui.inputs.wireframeColor) {
              this.ui.inputs.wireframeColor.value = defaults.wireframe.color;
            }
            if (this.ui.inputs.wireframeAlwaysOn) {
              this.ui.inputs.wireframeAlwaysOn.checked = defaults.wireframe.alwaysOn;
            }
            if (this.ui.inputs.wireframeOnlyVisibleFaces) {
              this.ui.inputs.wireframeOnlyVisibleFaces.checked = defaults.wireframe.onlyVisibleFaces;
            }
            this.eventBus.emit('mesh:wireframe-always-on', defaults.wireframe.alwaysOn);
            this.eventBus.emit('mesh:wireframe-color', defaults.wireframe.color);
            this.eventBus.emit('mesh:wireframe-only-visible-faces', defaults.wireframe.onlyVisibleFaces);
            this.ui.syncUIFromState();
            break;
            
          case 'hdri':
            this.stateStore.set('hdri', defaults.hdri);
            this.stateStore.set('hdriStrength', defaults.hdriStrength);
            this.stateStore.set('hdriBlurriness', defaults.hdriBlurriness);
            this.stateStore.set('hdriRotation', defaults.hdriRotation);
            this.stateStore.set('hdriBackground', defaults.hdriBackground);
            this.stateStore.set('lensFlare', defaults.lensFlare);
            this.ui.setHdriActive(defaults.hdri);
            this.eventBus.emit('studio:hdri', defaults.hdri);
            this.eventBus.emit('studio:hdri-strength', defaults.hdriStrength);
            this.eventBus.emit('studio:hdri-blurriness', defaults.hdriBlurriness);
            this.eventBus.emit('studio:hdri-rotation', defaults.hdriRotation);
            this.eventBus.emit('studio:hdri-background', defaults.hdriBackground);
            this.eventBus.emit('studio:lens-flare-enabled', defaults.lensFlare.enabled);
            this.eventBus.emit('studio:lens-flare-rotation', defaults.lensFlare.rotation);
            this.eventBus.emit('studio:lens-flare-height', defaults.lensFlare.height);
            this.eventBus.emit('studio:lens-flare-color', defaults.lensFlare.color);
            this.ui.syncUIFromState();
            break;
          
          case 'lens-flare':
            this.stateStore.set('lensFlare', defaults.lensFlare);
            this.eventBus.emit('studio:lens-flare-enabled', defaults.lensFlare.enabled);
            this.eventBus.emit('studio:lens-flare-rotation', defaults.lensFlare.rotation);
            this.eventBus.emit('studio:lens-flare-height', defaults.lensFlare.height);
            this.eventBus.emit('studio:lens-flare-color', defaults.lensFlare.color);
            this.eventBus.emit('studio:lens-flare-quality', defaults.lensFlare.quality);
            this.ui.syncUIFromState();
            break;
            
          case 'lights':
            this.stateStore.set('lights', defaults.lights);
            this.stateStore.set('lightsMaster', defaults.lightsMaster);
            this.stateStore.set('lightsRotation', defaults.lightsRotation);
            this.stateStore.set('lightsHeight', defaults.lightsHeight ?? 5);
            Object.keys(defaults.lights).forEach((lightId) => {
              const light = defaults.lights[lightId];
              this.eventBus.emit('lights:update', { lightId, property: 'color', value: light.color });
              this.eventBus.emit('lights:update', { lightId, property: 'intensity', value: light.intensity });
              if (light.height !== undefined) {
                this.eventBus.emit('lights:update', { lightId, property: 'height', value: light.height });
              }
              if (light.rotate !== undefined) {
                this.eventBus.emit('lights:update', { lightId, property: 'rotate', value: light.rotate });
              }
            });
            this.eventBus.emit('lights:master', defaults.lightsMaster);
            this.eventBus.emit('lights:rotate', defaults.lightsRotation);
            this.eventBus.emit('lights:height', defaults.lightsHeight ?? 5);
            this.ui.syncUIFromState();
            break;
          case 'keyLight':
            this.ui.resetIndividualLight('key', defaults.lights.key);
            break;
          case 'fillLight':
            this.ui.resetIndividualLight('fill', defaults.lights.fill);
            break;
          case 'rimLight':
            this.ui.resetIndividualLight('rim', defaults.lights.rim);
            break;
          case 'ambientLight':
            this.ui.resetIndividualLight('ambient', defaults.lights.ambient);
            break;
            
          case 'podium':
            this.stateStore.set('groundSolidColor', defaults.groundSolidColor);
            this.stateStore.set('groundY', defaults.groundY);
            this.stateStore.set('podiumScale', defaults.podiumScale);
            this.eventBus.emit('studio:ground-solid-color', defaults.groundSolidColor);
            this.eventBus.emit('studio:ground-y', defaults.groundY);
            this.eventBus.emit('studio:podium-scale', defaults.podiumScale);
            this.ui.syncControls(this.stateStore.getState());
            break;
            
          case 'background':
            this.stateStore.set('background', defaults.background);
            this.eventBus.emit('scene:background', defaults.background);
            this.ui.syncUIFromState();
            break;
            
          case 'grid':
            this.stateStore.set('groundWireColor', defaults.groundWireColor);
            this.stateStore.set('groundWireOpacity', defaults.groundWireOpacity);
            this.stateStore.set('gridScale', defaults.gridScale);
            this.eventBus.emit('studio:ground-wire-color', defaults.groundWireColor);
            this.eventBus.emit('studio:ground-wire-opacity', defaults.groundWireOpacity);
            this.eventBus.emit('studio:grid-scale', defaults.gridScale);
            this.ui.syncControls(this.stateStore.getState());
            break;
            
          case 'dof':
            this.stateStore.set('dof', defaults.dof);
            this.eventBus.emit('render:dof', defaults.dof);
            this.ui.setEffectControlsDisabled(['dofFocus', 'dofAperture'], !defaults.dof.enabled);
            this.ui.syncUIFromState();
            break;
            
          case 'bloom':
            this.stateStore.set('bloom', defaults.bloom);
            this.eventBus.emit('render:bloom', defaults.bloom);
            this.ui.setEffectControlsDisabled(['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor'], !defaults.bloom.enabled);
            this.ui.syncUIFromState();
            break;

          case 'lens-dirt':
            this.stateStore.set('lensDirt', defaults.lensDirt);
            this.eventBus.emit('render:lens-dirt', defaults.lensDirt);
            this.ui.setEffectControlsDisabled(['lensDirtStrength'], !defaults.lensDirt.enabled);
            this.ui.syncControls(this.stateStore.getState());
            break;
            
          case 'grain':
            this.stateStore.set('grain', defaults.grain);
            this.eventBus.emit('render:grain', defaults.grain);
            this.ui.setEffectControlsDisabled(['grainIntensity'], !defaults.grain.enabled);
            this.ui.syncUIFromState();
            break;
            
          case 'aberration':
            this.stateStore.set('aberration', defaults.aberration);
            this.eventBus.emit('render:aberration', defaults.aberration);
            this.ui.setEffectControlsDisabled(['aberrationOffset', 'aberrationStrength'], !defaults.aberration.enabled);
            this.ui.syncUIFromState();
            break;
            
          case 'fresnel':
            this.stateStore.set('fresnel', defaults.fresnel);
            this.eventBus.emit('render:fresnel', defaults.fresnel);
            this.ui.setEffectControlsDisabled(['fresnelColor', 'fresnelRadius', 'fresnelStrength'], !defaults.fresnel.enabled);
            this.ui.syncUIFromState();
            break;
            
          case 'camera':
            this.stateStore.set('camera.fov', defaults.camera.fov);
            this.stateStore.set('camera.tilt', defaults.camera.tilt ?? 0);
            this.stateStore.set('exposure', defaults.exposure);
            this.stateStore.set('autoExposure', defaults.autoExposure ?? false);
            this.eventBus.emit('camera:fov', defaults.camera.fov);
            this.eventBus.emit('camera:tilt', defaults.camera.tilt ?? 0);
            this.eventBus.emit('scene:exposure', defaults.exposure);
            this.eventBus.emit('camera:auto-exposure', defaults.autoExposure ?? false);
            this.ui.syncControls(this.stateStore.getState());
            break;

          case 'color-correction':
            this.stateStore.set('camera.contrast', defaults.camera.contrast);
            this.stateStore.set('camera.temperature', defaults.camera.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K);
            this.stateStore.set('camera.tint', defaults.camera.tint ?? 0);
            this.stateStore.set('camera.highlights', defaults.camera.highlights ?? 0);
            this.stateStore.set('camera.shadows', defaults.camera.shadows ?? 0);
            this.stateStore.set('camera.saturation', defaults.camera.saturation);
            this.stateStore.set('camera.clarity', defaults.camera.clarity ?? 0);
            this.stateStore.set('camera.fade', defaults.camera.fade ?? 0);
            this.stateStore.set('camera.sharpness', defaults.camera.sharpness ?? 0);
            this.eventBus.emit('render:contrast', defaults.camera.contrast);
            this.eventBus.emit('render:temperature', defaults.camera.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K);
            this.eventBus.emit('render:tint', (defaults.camera.tint ?? 0) / 100);
            this.eventBus.emit('render:highlights', (defaults.camera.highlights ?? 0) / 100);
            this.eventBus.emit('render:shadows', (defaults.camera.shadows ?? 0) / 100);
            this.eventBus.emit('render:saturation', defaults.camera.saturation);
            this.eventBus.emit('render:clarity', defaults.camera.clarity ?? 0);
            this.eventBus.emit('render:fade', defaults.camera.fade ?? 0);
            this.eventBus.emit('render:sharpness', defaults.camera.sharpness ?? 0);
            this.ui.syncControls(this.stateStore.getState());
            break;

          case 'vignette':
            this.stateStore.set('camera.vignette', defaults.camera.vignette ?? 0);
            this.stateStore.set('camera.vignetteColor', defaults.camera.vignetteColor ?? '#000000');
            this.eventBus.emit('render:vignette', defaults.camera.vignette ?? 0);
            this.eventBus.emit('render:vignette-color', defaults.camera.vignetteColor ?? '#000000');
            this.ui.syncControls(this.stateStore.getState());
            break;
            
          case 'transform':
            this.stateStore.set('scale', defaults.scale);
            this.stateStore.set('xOffset', defaults.xOffset);
            this.stateStore.set('yOffset', defaults.yOffset);
            this.stateStore.set('zOffset', defaults.zOffset);
            this.stateStore.set('rotationX', defaults.rotationX);
            this.stateStore.set('rotationY', defaults.rotationY);
            this.stateStore.set('rotationZ', defaults.rotationZ);
            this.eventBus.emit('mesh:scale', defaults.scale);
            this.eventBus.emit('mesh:xOffset', defaults.xOffset);
            this.eventBus.emit('mesh:yOffset', defaults.yOffset);
            this.eventBus.emit('mesh:zOffset', defaults.zOffset);
            this.eventBus.emit('mesh:rotationX', defaults.rotationX);
            this.eventBus.emit('mesh:rotationY', defaults.rotationY);
            this.eventBus.emit('mesh:rotationZ', defaults.rotationZ);
            this.eventBus.emit('mesh:reset-transform');
            this.ui.syncUIFromState();
            break;
        }
      });
    });
  }
}

