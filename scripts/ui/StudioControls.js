/**
 * StudioControls - Handles all studio/environment-related UI controls
 * Manages HDRI, lights, ground, podium, grid, and lens flare
 */
import { HDRI_STRENGTH_UNIT } from '../config/hdri.js';
import {
  DEFAULT_MATERIAL_METALNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_BASE_GLASS_BLUR,
  DEFAULT_BASE_GLASS_AMOUNT,
  DEFAULT_BASE_GLASS_BRIGHTNESS,
} from '../constants.js';

export class StudioControls {
  constructor(eventBus, stateStore, uiManager, helpers) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    this.helpers = helpers;
  }

  bind() {
    // HDRI controls
    this.ui.inputs.hdriButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const preset = button.dataset.hdri;
        const current = this.stateStore.getState().hdri;
        if (preset !== current) this.ui.uiSounds?.playSelect();
        this.ui.setHdriActive(preset);
        this.stateStore.set('hdri', preset);
        this.eventBus.emit('studio:hdri', preset);
      });
    });
    this.ui.inputs.hdriEnabled.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('hdriEnabled', enabled);
      this.eventBus.emit('studio:hdri-enabled', enabled);
      this.ui.toggleHdriControls(enabled);
    });
    this.ui.inputs.hdriStrength.addEventListener('input', (event) => {
      const normalized = Math.min(3, Math.max(0, parseFloat(event.target.value)));
      const actual = normalized * HDRI_STRENGTH_UNIT;
      this.helpers.updateValueLabel('hdriStrength', normalized, 'decimal');
      this.stateStore.set('hdriStrength', actual);
      this.eventBus.emit('studio:hdri-strength', actual);
    });
    this.ui.inputs.hdriBlurriness.addEventListener('input', (event) => {
      const value = Math.min(1, Math.max(0, parseFloat(event.target.value)));
      this.helpers.updateValueLabel('hdriBlurriness', value, 'decimal');
      this.stateStore.set('hdriBlurriness', value);
      this.eventBus.emit('studio:hdri-blurriness', value);
    });
    this.ui.inputs.hdriRotation.addEventListener('input', (event) => {
      const value = Math.min(360, Math.max(0, parseFloat(event.target.value)));
      this.helpers.updateValueLabel('hdriRotation', value, 'angle');
      this.stateStore.set('hdriRotation', value);
      this.eventBus.emit('studio:hdri-rotation', value);
    });
    this.ui.inputs.hdriBackground.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('hdriBackground', enabled);
      this.eventBus.emit('studio:hdri-background', enabled);
    });

    // Lens Flare
    this.ui.inputs.lensFlareEnabled?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('lensFlare.enabled', enabled);
      this.eventBus.emit('studio:lens-flare-enabled', enabled);
      if (enabled) {
        this.helpers.showToast(
          'WARNING: LENS FLARES IS AN EXPERIMENTAL (UNOPTIMIZED) FEATURE',
          3200,
          { caution: false, notification: false },
        );
      }
      this.ui.updateLensFlareControlsDisabled();
    });
    this.ui.inputs.lensFlareRotation?.addEventListener('input', (event) => {
      const value = Math.min(360, Math.max(0, parseFloat(event.target.value)));
      this.helpers.updateValueLabel('lensFlareRotation', value, 'angle');
      this.stateStore.set('lensFlare.rotation', value);
      this.eventBus.emit('studio:lens-flare-rotation', value);
    });
    this.ui.inputs.lensFlareHeight?.addEventListener('input', (event) => {
      const value = Math.min(90, Math.max(0, parseFloat(event.target.value) || 0));
      event.target.value = value;
      this.helpers.updateValueLabel('lensFlareHeight', value, 'angle');
      this.stateStore.set('lensFlare.height', value);
      this.eventBus.emit('studio:lens-flare-height', value);
    });
    this.ui.inputs.lensFlareHalo?.addEventListener('input', (event) => {
      const value = Math.min(5, Math.max(0, parseFloat(event.target.value) || 0));
      this.helpers.updateValueLabel('lensFlareHalo', value, 'multiplier');
      this.stateStore.set('lensFlare.haloIntensity', value);
      this.eventBus.emit('studio:lens-flare-halo', value);
    });
    this.helpers.bindColorInput('lensFlareColor', 'lensFlare.color', 'studio:lens-flare-color');
    this.ui.inputs.lensFlareQuality?.addEventListener('change', (event) => {
      const value = event.target.value;
      this.stateStore.set('lensFlare.quality', value);
      this.eventBus.emit('studio:lens-flare-quality', value);
    });

    // Ground/Podium
    this.ui.inputs.groundSolid.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      if (enabled) this.ui.uiSounds?.playShelfShow();
      else this.ui.uiSounds?.playShelfHide();
      this.stateStore.set('groundSolid', enabled);
      this.eventBus.emit('studio:ground-solid', enabled);
    });
    this.ui.inputs.groundWire.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('groundWire', enabled);
      this.eventBus.emit('studio:ground-wire', enabled);
    });
    this.helpers.bindColorInput('groundSolidColor', 'groundSolidColor', 'studio:ground-solid-color');
    this.helpers.bindColorInput('groundWireColor', 'groundWireColor', 'studio:ground-wire-color');
    this.ui.inputs.groundWireOpacity.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('groundWireOpacity', value, 'decimal');
      this.stateStore.set('groundWireOpacity', value);
      this.eventBus.emit('studio:ground-wire-opacity', value);
    });
    this.ui.inputs.groundY.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('groundY', value, 'distance');
      this.stateStore.set('groundY', value);
      this.eventBus.emit('studio:ground-y', value);
    });
    this.helpers.enableSliderKeyboardStepping(this.ui.inputs.groundY);
    this.ui.inputs.gridY?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('gridY', value, 'distance');
      this.stateStore.set('gridY', value);
      this.eventBus.emit('studio:grid-y', value);
    });
    if (this.ui.inputs.gridY) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.gridY);
    }
    this.ui.inputs.baseScale?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('baseScale', value, 'decimal');
      this.stateStore.set('baseScale', value);
      this.eventBus.emit('studio:base-scale', value);
    });
    this.ui.inputs.baseMetalness?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('baseMetalness', value, 'decimal');
      this.stateStore.set('baseMetalness', value);
      this.eventBus.emit('studio:base-metalness', value);
    });
    this.ui.inputs.baseRoughness?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('baseRoughness', value, 'decimal');
      this.stateStore.set('baseRoughness', value);
      this.eventBus.emit('studio:base-roughness', value);
    });
    this.ui.inputs.baseGlassSurface?.addEventListener('change', (event) => {
      const enabled = !!event.target.checked;
      const podiumUp = !!this.stateStore.getState().groundSolid;
      if (podiumUp) {
        if (enabled) this.ui.uiSounds?.playShelfShow();
        else this.ui.uiSounds?.playShelfHide();
      }
      this.stateStore.set('baseGlassSurface', enabled);
      this.eventBus.emit('studio:base-glass-surface', enabled);
      this.ui.applyBlockStates?.(this.stateStore.getState());
    });
    this.ui.inputs.baseGlassBrightness?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('baseGlassBrightness', value, 'decimal');
      this.stateStore.set('baseGlassBrightness', value);
      this.eventBus.emit('studio:base-glass-brightness', value);
    });
    if (this.ui.inputs.baseGlassBrightness) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.baseGlassBrightness);
    }
    this.ui.inputs.baseGlassBlur?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('baseGlassBlur', value, 'decimal');
      this.stateStore.set('baseGlassBlur', value);
      this.eventBus.emit('studio:base-glass-blur', value);
    });
    if (this.ui.inputs.baseGlassBlur) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.baseGlassBlur);
    }
    this.ui.inputs.baseGlassAmount?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('baseGlassAmount', value, 'decimal');
      this.stateStore.set('baseGlassAmount', value);
      this.eventBus.emit('studio:base-glass-amount', value);
    });
    if (this.ui.inputs.baseGlassAmount) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.baseGlassAmount);
    }
    this.ui.inputs.gridScale?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('gridScale', value, 'decimal');
      this.stateStore.set('gridScale', value);
      this.eventBus.emit('studio:grid-scale', value);
    });
    this.ui.inputs.backdropEnabled?.addEventListener('change', (event) => {
      const enabled = !!event.target.checked;
      if (enabled) this.ui.uiSounds?.playShelfShow();
      else this.ui.uiSounds?.playShelfHide();
      this.stateStore.set('backdropEnabled', enabled);
      this.eventBus.emit('studio:backdrop-enabled', enabled);
      this.ui.applyBlockStates?.(this.stateStore.getState());
    });
    this.helpers.bindColorInput('backdropColor', 'backdropColor', 'studio:backdrop-color');
    this.ui.inputs.backdropTextureEnabled?.addEventListener('change', (event) => {
      const enabled = !!event.target.checked;
      this.stateStore.set('backdropTextureEnabled', enabled);
      this.eventBus.emit('studio:backdrop-texture-enabled', enabled);
      this.ui.applyBlockStates?.(this.stateStore.getState());
    });
    this.ui.inputs.backdropTextureScale?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('backdropTextureScale', value, 'decimal');
      this.stateStore.set('backdropTextureScale', value);
      this.eventBus.emit('studio:backdrop-texture-scale', value);
    });
    this.ui.inputs.backdropScale?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('backdropScale', value, 'decimal');
      this.stateStore.set('backdropScale', value);
      this.eventBus.emit('studio:backdrop-scale', value);
    });
    this.ui.inputs.backdropWidth?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('backdropWidth', value, 'decimal');
      this.stateStore.set('backdropWidth', value);
      this.eventBus.emit('studio:backdrop-width', value);
    });
    this.ui.inputs.backdropRotation?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('backdropRotation', value, 'angle');
      this.stateStore.set('backdropRotation', value);
      this.eventBus.emit('studio:backdrop-rotation', value);
    });
    this.ui.inputs.backdropY?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('backdropY', value, 'distance');
      this.stateStore.set('backdropY', value);
      this.eventBus.emit('studio:backdrop-y', value);
    });
    this.ui.inputs.backdropSnap?.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      this.eventBus.emit('studio:backdrop-snap');
    });
    this.ui.inputs.baseSnap?.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      this.eventBus.emit('studio:base-snap');
    });
    this.ui.inputs.gridSnap?.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      this.eventBus.emit('studio:grid-snap');
    });

    // Light color controls
    this.ui.inputs.lightControls.forEach((control) => {
      const lightId = control.dataset.light;
      const colorInput = control.querySelector('input[type="color"]');
      colorInput.addEventListener('input', () => {
        this.stateStore.set(`lights.${lightId}.color`, colorInput.value);
        this.eventBus.emit('lights:update', {
          lightId,
          property: 'color',
          value: colorInput.value,
        });
      });
    });

    // Light indicators and cast shadows
    this.ui.inputs.showLightIndicators?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('showLightIndicators', enabled);
      this.eventBus.emit('lights:show-indicators', enabled);
    });
    this.ui.inputs.lightsCastShadows?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('lightsCastShadows', enabled);
      this.eventBus.emit('lights:cast-shadows', enabled);
      this._syncLightShadowControlDisabledState(
        enabled,
        this.stateStore.getState().lightsEnabled !== false,
      );
      ['key', 'fill', 'rim'].forEach((lightId) => {
        this.stateStore.set(`lights.${lightId}.castShadows`, enabled);
        this.eventBus.emit('lights:update', { lightId, property: 'castShadows', value: enabled });
        const castShadowsInput = this.ui.inputs[`${lightId}LightCastShadows`];
        if (castShadowsInput) {
          castShadowsInput.checked = enabled;
        }
      });
    });

    // Master light controls
    this.ui.inputs.lightsMaster?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value) || 0;
      this.helpers.updateValueLabel('lightsMaster', value, 'decimal');
      this.stateStore.set('lightsMaster', value);
      this.eventBus.emit('lights:master', value);
    });
    this.ui.inputs.lightsEnabled?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('lightsEnabled', enabled);
      this.eventBus.emit('lights:enabled', enabled);
      
      if (!enabled) {
        ['key', 'fill', 'rim', 'ambient'].forEach((lightId) => {
          this.stateStore.set(`lights.${lightId}.enabled`, false);
          this.eventBus.emit('lights:update', { lightId, property: 'enabled', value: false });
          const enabledInput = this.ui.inputs[`${lightId}LightEnabled`];
          if (enabledInput) enabledInput.checked = false;
        });
        ['key', 'fill', 'rim'].forEach((lightId) => {
          this.stateStore.set(`lights.${lightId}.castShadows`, false);
          this.eventBus.emit('lights:update', { lightId, property: 'castShadows', value: false });
          const castShadowsInput = this.ui.inputs[`${lightId}LightCastShadows`];
          if (castShadowsInput) castShadowsInput.checked = false;
        });
        this.stateStore.set('showLightIndicators', false);
        this.eventBus.emit('lights:show-indicators', false);
        if (this.ui.inputs.showLightIndicators) this.ui.inputs.showLightIndicators.checked = false;
        this.stateStore.set('lightsCastShadows', false);
        this.eventBus.emit('lights:cast-shadows', false);
        if (this.ui.inputs.lightsCastShadows) this.ui.inputs.lightsCastShadows.checked = false;
        this._syncLightShadowControlDisabledState(false, false);
      } else {
        ['key', 'fill', 'rim', 'ambient'].forEach((lightId) => {
          this.stateStore.set(`lights.${lightId}.enabled`, true);
          this.eventBus.emit('lights:update', { lightId, property: 'enabled', value: true });
          const enabledInput = this.ui.inputs[`${lightId}LightEnabled`];
          if (enabledInput) enabledInput.checked = true;
        });
        this.stateStore.set('showLightIndicators', true);
        this.eventBus.emit('lights:show-indicators', true);
        if (this.ui.inputs.showLightIndicators) this.ui.inputs.showLightIndicators.checked = true;
        this._syncLightShadowControlDisabledState(
          this.stateStore.getState().lightsCastShadows !== false,
          true,
        );
      }
      this.ui.updateLightSliderStates();
    });
    this.ui.inputs.lightsShadowQuality?.addEventListener('change', (event) => {
      const raw = event.target.value;
      const quality =
        raw === 'low' || raw === 'high' || raw === 'ultra' ? raw : 'medium';
      this.stateStore.set('lightsShadowQuality', quality);
      this.eventBus.emit('lights:shadow-quality', quality);
    });
    this.ui.inputs.lightsShadowSoftness?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('lightsShadowSoftness', value, 'decimal', 2);
      this.stateStore.set('lightsShadowSoftness', value);
      this.eventBus.emit('lights:shadow-softness', value);
    });
    this.ui.inputs.lightsShadowContactOffset?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('lightsShadowContactOffset', value, 'decimal', 4);
      this.stateStore.set('lightsShadowContactOffset', value);
      this.eventBus.emit('lights:shadow-contact-offset', value);
    });
    this.ui.inputs.lightsShadowTwoSided?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('lightsShadowTwoSided', enabled);
      this.eventBus.emit('lights:shadow-two-sided', enabled);
    });
    if (this.ui.inputs.lightsShadowSoftness) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.lightsShadowSoftness);
    }
    if (this.ui.inputs.lightsShadowContactOffset) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.lightsShadowContactOffset);
    }
    this.ui.inputs.lightsRotation?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value) || 0;
      this.helpers.updateValueLabel('lightsRotation', value, 'angle');
      this.stateStore.set('lightsRotation', value);
      this.eventBus.emit('lights:rotate', value);
    });
    this.ui.inputs.lightsHeight?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value) || 0;
      this.helpers.updateValueLabel('lightsHeight', value, 'decimal');
      this.stateStore.set('lightsHeight', value);
      this.eventBus.emit('lights:height', value);
    });
    if (this.ui.inputs.lightsHeight) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.lightsHeight);
    this.ui.inputs.lightsAutoRotate?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('lightsAutoRotate', enabled);
      this.eventBus.emit('lights:auto-rotate', enabled);
      this.ui.setLightsRotationDisabled(enabled);
    });

    // Individual light controls
    this.bindIndividualLightControls('key');
    this.bindIndividualLightControls('fill');
    this.bindIndividualLightControls('rim');
    this.bindIndividualLightControls('ambient');

    // Individual light enabled toggles
    const handleIndividualLightToggle = (lightId, enabled) => {
      this.stateStore.set(`lights.${lightId}.enabled`, enabled);
      this.eventBus.emit('lights:update', { lightId, property: 'enabled', value: enabled });
      
      if (lightId !== 'ambient') {
        this.stateStore.set(`lights.${lightId}.castShadows`, enabled);
        this.eventBus.emit('lights:update', { lightId, property: 'castShadows', value: enabled });
        const castShadowsInput = this.ui.inputs[`${lightId}LightCastShadows`];
        if (castShadowsInput) castShadowsInput.checked = enabled;
      }
      
      if (enabled) {
        const masterEnabled = this.stateStore.getState().lightsEnabled;
        if (!masterEnabled) {
          this.stateStore.set('lightsEnabled', true);
          this.eventBus.emit('lights:enabled', true);
          if (this.ui.inputs.lightsEnabled) this.ui.inputs.lightsEnabled.checked = true;
        }
      }
      this.ui.updateLightSliderStates();
    };

    this.ui.inputs.keyLightEnabled?.addEventListener('change', (event) => {
      handleIndividualLightToggle('key', event.target.checked);
    });
    this.ui.inputs.fillLightEnabled?.addEventListener('change', (event) => {
      handleIndividualLightToggle('fill', event.target.checked);
    });
    this.ui.inputs.rimLightEnabled?.addEventListener('change', (event) => {
      handleIndividualLightToggle('rim', event.target.checked);
    });
    this.ui.inputs.ambientLightEnabled?.addEventListener('change', (event) => {
      handleIndividualLightToggle('ambient', event.target.checked);
    });

    // Cast shadows toggles
    this.ui.inputs.keyLightCastShadows?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('lights.key.castShadows', enabled);
      this.eventBus.emit('lights:update', { lightId: 'key', property: 'castShadows', value: enabled });
    });
    this.ui.inputs.fillLightCastShadows?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('lights.fill.castShadows', enabled);
      this.eventBus.emit('lights:update', { lightId: 'fill', property: 'castShadows', value: enabled });
    });
    this.ui.inputs.rimLightCastShadows?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('lights.rim.castShadows', enabled);
      this.eventBus.emit('lights:update', { lightId: 'rim', property: 'castShadows', value: enabled });
    });
  }

  bindIndividualLightControls(lightId) {
    const strengthInput = this.ui.inputs[`${lightId}LightStrength`];
    if (strengthInput) {
      strengthInput.addEventListener('input', (event) => {
        const baseIntensity = parseFloat(event.target.value) || 0;
        this.helpers.updateValueLabel(`${lightId}LightStrength`, baseIntensity, 'decimal');
        this.stateStore.set(`lights.${lightId}.intensity`, baseIntensity);
        this.eventBus.emit('lights:update', { lightId, property: 'intensity', value: baseIntensity });
      });
      this.helpers.enableSliderKeyboardStepping(strengthInput);
    }

    if (lightId !== 'ambient') {
      const heightInput = this.ui.inputs[`${lightId}LightHeight`];
      if (heightInput) {
        heightInput.addEventListener('input', (event) => {
          const value = parseFloat(event.target.value) || 0;
          this.helpers.updateValueLabel(`${lightId}LightHeight`, value, 'decimal');
          this.stateStore.set(`lights.${lightId}.height`, value);
          this.eventBus.emit('lights:update', { lightId, property: 'height', value });
        });
        this.helpers.enableSliderKeyboardStepping(heightInput);
      }

      const rotateInput = this.ui.inputs[`${lightId}LightRotate`];
      if (rotateInput) {
        rotateInput.addEventListener('input', (event) => {
          const value = parseFloat(event.target.value) || 0;
          this.helpers.updateValueLabel(`${lightId}LightRotate`, value, 'angle');
          this.stateStore.set(`lights.${lightId}.rotate`, value);
          this.eventBus.emit('lights:update', { lightId, property: 'rotate', value });
        });
      }
    }
  }

  sync(state) {
    this.ui.setHdriActive(state.hdri);
    this.ui.inputs.hdriEnabled.checked = !!state.hdriEnabled;
    this.ui.toggleHdriControls(state.hdriEnabled);
    const normalizedStrength = Math.min(3, Math.max(0, state.hdriStrength / HDRI_STRENGTH_UNIT));
    this.ui.inputs.hdriStrength.value = normalizedStrength;
    this.helpers.updateValueLabel('hdriStrength', normalizedStrength, 'decimal');
    if (this.ui.inputs.hdriBlurriness) {
      const blurriness = state.hdriBlurriness ?? 0;
      this.ui.inputs.hdriBlurriness.value = blurriness;
      this.helpers.updateValueLabel('hdriBlurriness', blurriness, 'decimal');
    }
    if (this.ui.inputs.hdriRotation) {
      const rotation = state.hdriRotation ?? 0;
      this.ui.inputs.hdriRotation.value = rotation;
      this.helpers.updateValueLabel('hdriRotation', rotation, 'angle');
    }
    this.ui.inputs.hdriBackground.checked = state.hdriBackground;
    this.ui.inputs.backgroundColor.value = state.background;
    
    // Lens Flare
    if (this.ui.inputs.lensFlareEnabled) {
      this.ui.inputs.lensFlareEnabled.checked = !!state.lensFlare?.enabled;
    }
    if (this.ui.inputs.lensFlareRotation) {
      const rotation = state.lensFlare?.rotation ?? 0;
      this.ui.inputs.lensFlareRotation.value = rotation;
      this.helpers.updateValueLabel('lensFlareRotation', rotation, 'angle');
    }
    if (this.ui.inputs.lensFlareHeight) {
      const height = Math.min(90, Math.max(0, state.lensFlare?.height ?? 0));
      this.ui.inputs.lensFlareHeight.value = height;
      this.helpers.updateValueLabel('lensFlareHeight', height, 'angle');
    }
    if (this.ui.inputs.lensFlareHalo) {
      const halo = Math.min(5, Math.max(0, state.lensFlare?.haloIntensity ?? 1));
      this.ui.inputs.lensFlareHalo.value = halo;
      this.helpers.updateValueLabel('lensFlareHalo', halo, 'multiplier');
    }
    if (this.ui.inputs.lensFlareColor && state.lensFlare?.color) {
      this.ui.inputs.lensFlareColor.value = state.lensFlare.color;
    }
    if (this.ui.inputs.lensFlareQuality) {
      this.ui.inputs.lensFlareQuality.value = state.lensFlare?.quality ?? 'maximum';
    }
    this.ui.updateLensFlareControlsDisabled();
    
    // Ground/Podium
    this.ui.inputs.groundSolid.checked = state.groundSolid;
    this.ui.inputs.groundWire.checked = state.groundWire;
    this.ui.inputs.groundSolidColor.value = state.groundSolidColor;
    this.ui.inputs.groundWireColor.value = state.groundWireColor;
    this.ui.inputs.groundWireOpacity.value = state.groundWireOpacity;
    this.helpers.updateValueLabel('groundWireOpacity', state.groundWireOpacity, 'decimal');
    this.ui.inputs.groundY.value = state.groundY;
    this.helpers.updateValueLabel('groundY', state.groundY, 'distance');
    if (this.ui.inputs.gridY) {
      this.ui.inputs.gridY.value = state.gridY ?? 0;
      this.helpers.updateValueLabel('gridY', state.gridY ?? 0, 'distance');
    }
    if (this.ui.inputs.baseScale) {
      this.ui.inputs.baseScale.value = state.baseScale ?? 1;
      this.helpers.updateValueLabel('baseScale', state.baseScale ?? 1, 'decimal');
    }
    if (this.ui.inputs.baseMetalness) {
      const v = state.baseMetalness ?? DEFAULT_MATERIAL_METALNESS;
      this.ui.inputs.baseMetalness.value = v;
      this.helpers.updateValueLabel('baseMetalness', v, 'decimal');
    }
    if (this.ui.inputs.baseRoughness) {
      const v = state.baseRoughness ?? DEFAULT_MATERIAL_ROUGHNESS;
      this.ui.inputs.baseRoughness.value = v;
      this.helpers.updateValueLabel('baseRoughness', v, 'decimal');
    }
    if (this.ui.inputs.baseGlassSurface) {
      this.ui.inputs.baseGlassSurface.checked = !!(
        state.baseGlassSurface ??
        state.podiumReflectMesh ??
        false
      );
    }
    if (this.ui.inputs.baseGlassBrightness) {
      const br = state.baseGlassBrightness ?? DEFAULT_BASE_GLASS_BRIGHTNESS;
      this.ui.inputs.baseGlassBrightness.value = br;
      this.helpers.updateValueLabel('baseGlassBrightness', br, 'decimal');
    }
    if (this.ui.inputs.baseGlassBlur) {
      const vb = state.baseGlassBlur ?? DEFAULT_BASE_GLASS_BLUR;
      this.ui.inputs.baseGlassBlur.value = vb;
      this.helpers.updateValueLabel('baseGlassBlur', vb, 'decimal');
    }
    if (this.ui.inputs.baseGlassAmount) {
      const va = state.baseGlassAmount ?? DEFAULT_BASE_GLASS_AMOUNT;
      this.ui.inputs.baseGlassAmount.value = va;
      this.helpers.updateValueLabel('baseGlassAmount', va, 'decimal');
    }
    if (this.ui.inputs.gridScale) {
      this.ui.inputs.gridScale.value = state.gridScale ?? 1;
      this.helpers.updateValueLabel('gridScale', state.gridScale ?? 1, 'decimal');
    }
    if (this.ui.inputs.backdropEnabled) {
      this.ui.inputs.backdropEnabled.checked = !!state.backdropEnabled;
    }
    if (this.ui.inputs.backdropColor) {
      this.ui.inputs.backdropColor.value = state.backdropColor ?? '#808080';
    }
    if (this.ui.inputs.backdropTextureEnabled) {
      this.ui.inputs.backdropTextureEnabled.checked = !!state.backdropTextureEnabled;
    }
    if (this.ui.inputs.backdropTextureScale) {
      const v = state.backdropTextureScale ?? 1.8;
      this.ui.inputs.backdropTextureScale.value = v;
      this.helpers.updateValueLabel('backdropTextureScale', v, 'decimal');
    }
    if (this.ui.inputs.backdropScale) {
      const v = state.backdropScale ?? 1;
      this.ui.inputs.backdropScale.value = v;
      this.helpers.updateValueLabel('backdropScale', v, 'decimal');
    }
    if (this.ui.inputs.backdropWidth) {
      const v = state.backdropWidth ?? 2;
      this.ui.inputs.backdropWidth.value = v;
      this.helpers.updateValueLabel('backdropWidth', v, 'decimal');
    }
    if (this.ui.inputs.backdropRotation) {
      const v = state.backdropRotation ?? 0;
      this.ui.inputs.backdropRotation.value = v;
      this.helpers.updateValueLabel('backdropRotation', v, 'angle');
    }
    if (this.ui.inputs.backdropY) {
      const v = state.backdropY ?? 0;
      this.ui.inputs.backdropY.value = v;
      this.helpers.updateValueLabel('backdropY', v, 'distance');
    }
    
    // Lights
    if (this.ui.inputs.lightsRotation) {
      this.ui.inputs.lightsRotation.value = state.lightsRotation ?? 0;
      this.helpers.updateValueLabel('lightsRotation', state.lightsRotation ?? 0, 'angle');
    }
    if (this.ui.inputs.lightsHeight) {
      const heightValue = state.lightsHeight ?? 5;
      this.ui.inputs.lightsHeight.value = heightValue;
      this.helpers.updateValueLabel('lightsHeight', heightValue, 'decimal');
    }
    if (this.ui.inputs.lightsMaster) {
      const masterValue = state.lightsMaster ?? 1;
      this.ui.inputs.lightsMaster.value = masterValue;
      this.helpers.updateValueLabel('lightsMaster', masterValue, 'decimal');
    }
    if (this.ui.inputs.showLightIndicators) {
      this.ui.inputs.showLightIndicators.checked = !!state.showLightIndicators;
    }
    if (this.ui.inputs.lightsAutoRotate) {
      this.ui.inputs.lightsAutoRotate.checked = !!state.lightsAutoRotate;
      this.ui.setLightsRotationDisabled(!!state.lightsAutoRotate);
    }
    if (this.ui.inputs.lightsCastShadows) {
      this.ui.inputs.lightsCastShadows.checked = !!state.lightsCastShadows;
    }
    const shadowQuality =
      state.lightsShadowQuality === 'low'
      || state.lightsShadowQuality === 'high'
      || state.lightsShadowQuality === 'ultra'
        ? state.lightsShadowQuality
        : 'medium';
    if (this.ui.inputs.lightsShadowQuality) {
      this.ui.inputs.lightsShadowQuality.value = shadowQuality;
    }
    if (this.ui.inputs.lightsShadowSoftness) {
      const softness = Number.isFinite(state.lightsShadowSoftness)
        ? state.lightsShadowSoftness
        : 4;
      this.ui.inputs.lightsShadowSoftness.value = softness;
      this.helpers.updateValueLabel('lightsShadowSoftness', softness, 'decimal', 2);
    }
    if (this.ui.inputs.lightsShadowContactOffset) {
      const contact = Number.isFinite(state.lightsShadowContactOffset)
        ? state.lightsShadowContactOffset
        : -0.0001;
      this.ui.inputs.lightsShadowContactOffset.value = contact;
      this.helpers.updateValueLabel('lightsShadowContactOffset', contact, 'decimal', 4);
    }
    if (this.ui.inputs.lightsShadowTwoSided) {
      this.ui.inputs.lightsShadowTwoSided.checked = !!state.lightsShadowTwoSided;
    }
    this._syncLightShadowControlDisabledState(
      !!state.lightsCastShadows,
      !!state.lightsEnabled,
    );
    if (this.ui.inputs.lightsEnabled) {
      this.ui.inputs.lightsEnabled.checked = !!state.lightsEnabled;
    }
    this.ui.updateLightSliderStates();
    this.ui.inputs.lightControls.forEach((control) => {
      const lightId = control.dataset.light;
      const colorInput = control.querySelector('input[type="color"]');
      if (colorInput && state.lights[lightId]) {
        colorInput.value = state.lights[lightId].color;
      }
    });
    
    // Sync individual light controls
    this.syncIndividualLight('key', state.lights?.key, { intensity: 1.28, height: 5, rotate: 0 });
    this.syncIndividualLight('fill', state.lights?.fill, { intensity: 0.8, height: 3, rotate: 0 });
    this.syncIndividualLight('rim', state.lights?.rim, { intensity: 0.96, height: 4, rotate: 0 });
    this.syncIndividualLight('ambient', state.lights?.ambient, { intensity: 0.48 });
    
    // HDRI buttons
    this.ui.inputs.hdriButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.hdri === state.hdri);
    });
  }

  syncIndividualLight(lightId, lightState, defaults) {
    if (!lightState) return;
    
    const strengthInput = this.ui.inputs[`${lightId}LightStrength`];
    if (strengthInput) {
      const baseIntensity = lightState.intensity ?? defaults.intensity;
      strengthInput.value = baseIntensity;
      this.helpers.updateValueLabel(`${lightId}LightStrength`, baseIntensity, 'decimal');
    }
    
    if (lightId !== 'ambient') {
      const heightInput = this.ui.inputs[`${lightId}LightHeight`];
      if (heightInput) {
        const height = lightState.height ?? defaults.height;
        heightInput.value = height;
        this.helpers.updateValueLabel(`${lightId}LightHeight`, height, 'decimal');
      }
      
      const rotateInput = this.ui.inputs[`${lightId}LightRotate`];
      if (rotateInput) {
        const rotate = lightState.rotate ?? defaults.rotate;
        rotateInput.value = rotate;
        this.helpers.updateValueLabel(`${lightId}LightRotate`, rotate, 'angle');
      }
      
      const castShadowsInput = this.ui.inputs[`${lightId}LightCastShadows`];
      if (castShadowsInput) {
        castShadowsInput.checked = lightState.castShadows !== false;
      }
    }
    
    const enabledInput = this.ui.inputs[`${lightId}LightEnabled`];
    if (enabledInput) {
      enabledInput.checked = lightState.enabled !== false;
    }
  }

  _syncLightShadowControlDisabledState(shadowsEnabled, lightsEnabled = true) {
    const mute = !(!!shadowsEnabled && !!lightsEnabled);
    this.ui.setControlDisabled('lightsShadowQuality', mute);
    this.ui.setControlDisabled('lightsShadowSoftness', mute);
    this.ui.setControlDisabled('lightsShadowContactOffset', mute);
    this.ui.setControlDisabled('lightsShadowTwoSided', mute);
    this.ui.setBlockMuted('lightsShadows', mute);
  }
}

