/**
 * ResetControls - Handles all reset button logic
 * Manages copy/load scene settings, and local/section reset buttons
 */
import { HDRI_STRENGTH_UNIT } from '../config/hdri.js';
import { CAMERA_TEMPERATURE_NEUTRAL_K, DEFAULT_MATERIAL_ROUGHNESS } from '../constants.js';
import { animateModalClose, animateModalOpen } from './modalReveal.js';
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
    const saveOrby = async () => {
      const result = await this.ui.sceneSettingsManager.saveOrbyToFile();
      this.helpers.showToast(result.message);
    };
    this.ui.buttons.saveOrbyButtons?.forEach((button) => {
      button.addEventListener('click', saveOrby);
    });
    this.ui.buttons.loadOrbyButtons?.forEach((button) => {
      button.addEventListener('click', () => {
        this.ui.buttons.orbyFileInput?.click();
      });
    });
    this.ui.buttons.orbyFileInput?.addEventListener('change', async (event) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      const result = await this.ui.sceneSettingsManager.loadOrbyFromFile(file);
      this.helpers.showToast(result.message);
      event.target.value = '';
    });

    // Load Scene Settings - Show modal
    this.ui.buttons.loadSceneButtons?.forEach(button => {
      button.addEventListener('click', () => {
        const modal = this.ui.buttons.loadSceneModal;
        const text = this.ui.buttons.loadSceneText;
        if (!modal) return;
        const panel = modal.querySelector('.load-settings-content');
        void animateModalOpen(modal, panel).then(() => {
          if (text) {
            text.focus();
            navigator.clipboard?.readText().then((clip) => {
              if (this.ui.buttons.loadSceneText) {
                this.ui.buttons.loadSceneText.value = clip;
              }
            }).catch(() => {});
          }
        });
      });
    });

    // Close scene modal
    const closeSceneModal = () => {
      const modal = this.ui.buttons.loadSceneModal;
      if (!modal) return;
      const panel = modal.querySelector('.load-settings-content');
      animateModalClose(modal, panel, () => {
        if (this.ui.buttons.loadSceneText) {
          this.ui.buttons.loadSceneText.value = '';
        }
      });
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
      this.stateStore.set('rotationX', defaults.rotationX ?? 0);
      this.stateStore.set('rotationY', defaults.rotationY ?? 0);
      this.stateStore.set('rotationZ', defaults.rotationZ ?? 0);
      this.stateStore.set('autoRotate', defaults.autoRotate);
      this.stateStore.set('clay', defaults.clay);
      this.stateStore.set('fresnel', defaults.fresnel);
      this.stateStore.set('svgExtrude.depth', defaults.svgExtrude?.depth ?? 0.2);
      this.stateStore.set('svgExtrude.normalAngle', defaults.svgExtrude?.normalAngle ?? 45);
      this.stateStore.set('svgExtrude.colorDepths', defaults.svgExtrude?.colorDepths ?? {});
      this.stateStore.set('svgExtrude.colorOffsets', defaults.svgExtrude?.colorOffsets ?? {});
      this.stateStore.set('svgExtrude.flipDirection', defaults.svgExtrude?.flipDirection ?? false);
      this.stateStore.set('svgExtrude.colorOverride', defaults.svgExtrude?.colorOverride ?? false);
      this.stateStore.set('svgExtrude.overrideColor', defaults.svgExtrude?.overrideColor ?? '#7ed321');
      this.stateStore.set('svgExtrude.surfacePreset', defaults.svgExtrude?.surfacePreset ?? 'none');
      this.stateStore.set('svgExtrude.surfaceScale', defaults.svgExtrude?.surfaceScale ?? 1.0);
      this.stateStore.set('advanced.reverseNormals', defaults.advanced?.reverseNormals ?? false);
      // Reset material properties
      this.stateStore.set('material.brightness', defaults.material?.brightness ?? 1.0);
      this.stateStore.set('material.metalness', defaults.material?.metalness ?? 0.0);
      this.stateStore.set('material.roughness', defaults.material?.roughness ?? DEFAULT_MATERIAL_ROUGHNESS);
      this.stateStore.set('material.emissive', defaults.material?.emissive ?? 0.0);
      
      this.eventBus.emit('mesh:shading', defaults.shading);
      this.eventBus.emit('mesh:scale', defaults.scale);
      this.eventBus.emit('mesh:xOffset', defaults.xOffset ?? 0);
      this.eventBus.emit('mesh:yOffset', defaults.yOffset);
      this.eventBus.emit('mesh:zOffset', defaults.zOffset ?? 0);
      this.eventBus.emit('mesh:rotationX', defaults.rotationX ?? 0);
      this.eventBus.emit('mesh:rotationY', defaults.rotationY ?? 0);
      this.eventBus.emit('mesh:rotationZ', defaults.rotationZ ?? 0);
      this.eventBus.emit('mesh:auto-rotate', defaults.autoRotate);
      this.eventBus.emit('mesh:clay-color', defaults.clay.color);
      this.eventBus.emit('mesh:clay-normal-map', defaults.clay.normalMap);
      // Emit material reset events
      this.eventBus.emit('mesh:material-brightness', defaults.material?.brightness ?? 1.0);
      this.eventBus.emit('mesh:material-metalness', defaults.material?.metalness ?? 0.0);
      this.eventBus.emit('mesh:material-roughness', defaults.material?.roughness ?? DEFAULT_MATERIAL_ROUGHNESS);
      this.eventBus.emit('mesh:material-emissive', defaults.material?.emissive ?? 0.0);
      this.eventBus.emit('render:fresnel', defaults.fresnel);
      this.eventBus.emit('mesh:svg-extrude-depth', defaults.svgExtrude?.depth ?? 0.2);
      this.eventBus.emit('mesh:svg-extrude-normal-angle', defaults.svgExtrude?.normalAngle ?? 45);
      this.eventBus.emit('mesh:svg-extrude-color-depths', defaults.svgExtrude?.colorDepths ?? {});
      this.eventBus.emit('mesh:svg-extrude-color-offsets', defaults.svgExtrude?.colorOffsets ?? {});
      this.eventBus.emit('mesh:svg-extrude-flip-direction', defaults.svgExtrude?.flipDirection ?? false);
      this.eventBus.emit('mesh:svg-extrude-color-override', {
        enabled: defaults.svgExtrude?.colorOverride ?? false,
        color: defaults.svgExtrude?.overrideColor ?? '#7ed321',
      });
      this.eventBus.emit('mesh:svg-extrude-surface', {
        preset: defaults.svgExtrude?.surfacePreset ?? 'none',
        scale: defaults.svgExtrude?.surfaceScale ?? 1.0,
      });
      this.eventBus.emit('mesh:reverse-normals', defaults.advanced?.reverseNormals ?? false);
      
      this.ui.syncUIFromState();
      this.helpers.showToast('Mesh settings reset');
    };

    const resetStudio = () => {
      const defaults = this.stateStore.getDefaults();
      this.stateStore.set('hdri', defaults.hdri);
      this.stateStore.set('hdriEnabled', defaults.hdriEnabled);
      this.stateStore.set('hdriStrength', defaults.hdriStrength);
      this.stateStore.set('hdriBlurriness', defaults.hdriBlurriness);
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
      this.stateStore.set('lightsHeight', defaults.lightsHeight ?? 5);
      this.stateStore.set('lightsAutoRotate', defaults.lightsAutoRotate);
      this.stateStore.set('showLightIndicators', defaults.showLightIndicators ?? false);
      this.stateStore.set('lensFlare', defaults.lensFlare);
      
      this.ui.setHdriActive(defaults.hdri);
      this.eventBus.emit('studio:hdri', defaults.hdri);
      this.eventBus.emit('studio:hdri-enabled', defaults.hdriEnabled);
      this.ui.toggleHdriControls(defaults.hdriEnabled);
      this.eventBus.emit('studio:hdri-strength', defaults.hdriStrength);
      this.eventBus.emit('studio:hdri-blurriness', defaults.hdriBlurriness);
      this.eventBus.emit('studio:hdri-background', defaults.hdriBackground);
      // Ensure lens flare toggle is fully reset (state + event + UI sync)
      this.stateStore.set('lensFlare.enabled', defaults.lensFlare.enabled);
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
      this.eventBus.emit('lights:show-indicators', defaults.showLightIndicators ?? false);
      
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
      this.stateStore.set('autoExposure', defaults.autoExposure ?? false);
      this.stateStore.set('antiAliasing', defaults.antiAliasing);
      this.stateStore.set('renderQuality', defaults.renderQuality ?? 'medium');
      this.stateStore.set('svgColorDetail', defaults.svgColorDetail ?? 'high');
      this.stateStore.set('toneCurve', defaults.toneCurve);
      this.stateStore.set('toneMapping', defaults.toneMapping);
      this.stateStore.set('lookFilterPreset', 'none');
      
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
      this.eventBus.emit('render:clarity', defaults.camera.clarity ?? 0);
      this.eventBus.emit('render:fade', defaults.camera.fade ?? 0);
      this.eventBus.emit('render:sharpness', defaults.camera.sharpness ?? 0);
      this.eventBus.emit('render:vignette', defaults.camera.vignette ?? 0);
      this.eventBus.emit('render:vignette-color', defaults.camera.vignetteColor ?? '#000000');
      this.eventBus.emit('render:anti-aliasing', defaults.antiAliasing);
      this.eventBus.emit('render:tone-curve', defaults.toneCurve);
      this.eventBus.emit('render:tone-mapping', defaults.toneMapping);
      this.eventBus.emit('render:apply-performance');
      
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
            this.stateStore.set('material.roughness', defaults.material?.roughness ?? DEFAULT_MATERIAL_ROUGHNESS);
            this.stateStore.set('material.emissive', defaults.material?.emissive ?? 0.0);
            this.eventBus.emit('mesh:material-brightness', defaults.material?.brightness ?? 1.0);
            this.eventBus.emit('mesh:material-metalness', defaults.material?.metalness ?? 0.0);
            this.eventBus.emit('mesh:material-roughness', defaults.material?.roughness ?? DEFAULT_MATERIAL_ROUGHNESS);
            this.eventBus.emit('mesh:material-emissive', defaults.material?.emissive ?? 0.0);
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
            if (this.ui.inputs.wireframeHideMesh) {
              this.ui.inputs.wireframeHideMesh.checked = defaults.wireframe.hideMesh;
            }
            this.eventBus.emit('mesh:wireframe-always-on', defaults.wireframe.alwaysOn);
            this.eventBus.emit('mesh:wireframe-color', defaults.wireframe.color);
            this.eventBus.emit('mesh:wireframe-only-visible-faces', defaults.wireframe.onlyVisibleFaces);
            this.eventBus.emit('mesh:wireframe-hide-mesh', defaults.wireframe.hideMesh);
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
            this.eventBus.emit('studio:podium-scale', defaults.podiumScale);
            this.eventBus.emit('studio:ground-y', defaults.groundY);
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
            this.stateStore.set('gridY', defaults.gridY);
            this.stateStore.set('gridScale', defaults.gridScale);
            this.eventBus.emit('studio:ground-wire-color', defaults.groundWireColor);
            this.eventBus.emit('studio:ground-wire-opacity', defaults.groundWireOpacity);
            this.eventBus.emit('studio:grid-y', defaults.gridY);
            this.eventBus.emit('studio:grid-scale', defaults.gridScale);
            this.ui.syncControls(this.stateStore.getState());
            break;
            
          case 'dof':
            this.stateStore.set('lookFilterPreset', 'custom');
            this.stateStore.set('dof', defaults.dof);
            this.eventBus.emit('render:dof', defaults.dof);
            this.ui.setEffectControlsDisabled(['dofFocus', 'dofAperture'], !defaults.dof.enabled);
            this.ui.syncUIFromState();
            break;
            
          case 'bloom':
            this.stateStore.set('lookFilterPreset', 'custom');
            this.stateStore.set('bloom', defaults.bloom);
            this.eventBus.emit('render:bloom', defaults.bloom);
            this.ui.setEffectControlsDisabled(['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor'], !defaults.bloom.enabled);
            this.ui.syncUIFromState();
            break;

          case 'lens-dirt':
            this.stateStore.set('lookFilterPreset', 'custom');
            this.stateStore.set('lensDirt', defaults.lensDirt);
            this.eventBus.emit('render:lens-dirt', defaults.lensDirt);
            this.ui.setEffectControlsDisabled(['lensDirtStrength'], !defaults.lensDirt.enabled);
            this.ui.syncControls(this.stateStore.getState());
            break;
            
          case 'grain':
            this.stateStore.set('lookFilterPreset', 'custom');
            this.stateStore.set('grain', defaults.grain);
            this.eventBus.emit('render:grain', defaults.grain);
            this.ui.setEffectControlsDisabled(['grainIntensity'], !defaults.grain.enabled);
            this.ui.syncUIFromState();
            break;
            
          case 'aberration':
            this.stateStore.set('lookFilterPreset', 'custom');
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
            // Reset basic camera settings (FOV, Tilt, Exposure, Auto Exposure)
            this.stateStore.set('lookFilterPreset', 'custom');
            this.stateStore.set('camera.fov', defaults.camera.fov);
            this.stateStore.set('camera.tilt', defaults.camera.tilt ?? 0);
            this.stateStore.set('exposure', defaults.exposure);
            this.stateStore.set('autoExposure', defaults.autoExposure ?? false);
            // Also reset vignette (camera/post-processing effect)
            this.stateStore.set('camera.vignette', defaults.camera.vignette ?? 0);
            this.stateStore.set('camera.vignetteColor', defaults.camera.vignetteColor ?? '#000000');
            // Emit events to update the scene
            this.eventBus.emit('camera:fov', defaults.camera.fov);
            this.eventBus.emit('camera:tilt', defaults.camera.tilt ?? 0);
            this.eventBus.emit('scene:exposure', defaults.exposure);
            this.eventBus.emit('camera:auto-exposure', defaults.autoExposure ?? false);
            this.eventBus.emit('render:vignette', defaults.camera.vignette ?? 0);
            this.eventBus.emit('render:vignette-color', defaults.camera.vignetteColor ?? '#000000');
            // Sync UI to reflect the reset values
            this.ui.syncControls(this.stateStore.getState());
            break;

          case 'color-correction':
            this.stateStore.set('lookFilterPreset', 'custom');
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
            // Ensure state is fully updated and DOM has time to update before syncing UI
            requestAnimationFrame(() => {
              this.ui.syncControls(this.stateStore.getState());
            });
            break;

          case 'vignette':
            this.stateStore.set('lookFilterPreset', 'custom');
            this.stateStore.set('camera.vignette', defaults.camera.vignette ?? 0);
            this.stateStore.set('camera.vignetteColor', defaults.camera.vignetteColor ?? '#000000');
            this.eventBus.emit('render:vignette', defaults.camera.vignette ?? 0);
            this.eventBus.emit('render:vignette-color', defaults.camera.vignetteColor ?? '#000000');
            this.ui.syncControls(this.stateStore.getState());
            break;

          case 'tone-curve':
            this.stateStore.set('lookFilterPreset', 'custom');
            this.stateStore.set('toneCurve', defaults.toneCurve);
            this.eventBus.emit('render:tone-curve', this.stateStore.getState().toneCurve);
            this.ui.renderControls.toneCurveController?.syncFromState(
              this.stateStore.getState(),
            );
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

          case 'svg-extrude':
            this.stateStore.set('svgExtrude.depth', defaults.svgExtrude?.depth ?? 0.2);
            this.stateStore.set('svgExtrude.normalAngle', defaults.svgExtrude?.normalAngle ?? 45);
            this.stateStore.set('svgExtrude.colorDepths', defaults.svgExtrude?.colorDepths ?? {});
            this.stateStore.set('svgExtrude.colorOffsets', defaults.svgExtrude?.colorOffsets ?? {});
            this.stateStore.set('svgExtrude.flipDirection', defaults.svgExtrude?.flipDirection ?? false);
            this.stateStore.set('svgExtrude.colorOverride', defaults.svgExtrude?.colorOverride ?? false);
            this.stateStore.set('svgExtrude.overrideColor', defaults.svgExtrude?.overrideColor ?? '#7ed321');
            this.stateStore.set('svgExtrude.surfacePreset', defaults.svgExtrude?.surfacePreset ?? 'none');
            this.stateStore.set('svgExtrude.surfaceScale', defaults.svgExtrude?.surfaceScale ?? 1.0);
            this.eventBus.emit('mesh:svg-extrude-depth', defaults.svgExtrude?.depth ?? 0.2);
            this.eventBus.emit('mesh:svg-extrude-normal-angle', defaults.svgExtrude?.normalAngle ?? 45);
            this.eventBus.emit('mesh:svg-extrude-color-depths', defaults.svgExtrude?.colorDepths ?? {});
            this.eventBus.emit('mesh:svg-extrude-color-offsets', defaults.svgExtrude?.colorOffsets ?? {});
            this.eventBus.emit('mesh:svg-extrude-flip-direction', defaults.svgExtrude?.flipDirection ?? false);
            this.eventBus.emit('mesh:svg-extrude-color-override', {
              enabled: defaults.svgExtrude?.colorOverride ?? false,
              color: defaults.svgExtrude?.overrideColor ?? '#7ed321',
            });
            this.eventBus.emit('mesh:svg-extrude-surface', {
              preset: defaults.svgExtrude?.surfacePreset ?? 'none',
              scale: defaults.svgExtrude?.surfaceScale ?? 1.0,
            });
            this.ui.syncUIFromState();
            this.helpers.showToast('SVG Extrude settings reset');
            break;

          case 'advanced':
            this.stateStore.set('advanced.reverseNormals', defaults.advanced?.reverseNormals ?? false);
            this.eventBus.emit('mesh:reverse-normals', defaults.advanced?.reverseNormals ?? false);
            this.ui.syncUIFromState();
            break;
        }
      });
    });
  }
}

