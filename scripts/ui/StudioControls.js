/**
 * StudioControls - Handles all studio/environment-related UI controls
 * Manages HDRI, lights, ground, podium, grid, and lens flare
 */
import { HDRI_STRENGTH_UNIT } from '../config/hdri.js';
import { UIHelpers } from './UIHelpers.js';

export class StudioControls {
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    this.helpers = new UIHelpers(eventBus, stateStore, uiManager);
  }

  bind() {
    // HDRI controls
    this.ui.inputs.hdriButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const preset = button.dataset.hdri;
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
        this.helpers.showToast('WARNING: LENS FLARES IS AN EXPERIMENTAL (UNOPTIMIZED) FEATURE');
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
    this.helpers.bindColorInput('lensFlareColor', 'lensFlare.color', 'studio:lens-flare-color');
    this.ui.inputs.lensFlareQuality?.addEventListener('change', (event) => {
      const value = event.target.value;
      this.stateStore.set('lensFlare.quality', value);
      this.eventBus.emit('studio:lens-flare-quality', value);
    });

    // Ground/Podium
    this.ui.inputs.groundSolid.addEventListener('change', (event) => {
      const enabled = event.target.checked;
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
      const value = this.helpers.applySnapToCenter(event.target, -2, 2, 0);
      this.helpers.updateValueLabel('groundY', value, 'distance');
      this.stateStore.set('groundY', value);
      this.eventBus.emit('studio:ground-y', value);
    });
    this.helpers.enableSliderKeyboardStepping(this.ui.inputs.groundY);
    this.ui.inputs.podiumScale?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('podiumScale', value, 'decimal');
      this.stateStore.set('podiumScale', value);
      this.eventBus.emit('studio:podium-scale', value);
    });
    this.ui.inputs.gridScale?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('gridScale', value, 'decimal');
      this.stateStore.set('gridScale', value);
      this.eventBus.emit('studio:grid-scale', value);
    });
    this.ui.inputs.podiumSnap?.addEventListener('click', () => {
      this.eventBus.emit('studio:podium-snap');
    });
    this.ui.inputs.gridSnap?.addEventListener('click', () => {
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
      } else {
        ['key', 'fill', 'rim', 'ambient'].forEach((lightId) => {
          this.stateStore.set(`lights.${lightId}.enabled`, true);
          this.eventBus.emit('lights:update', { lightId, property: 'enabled', value: true });
          const enabledInput = this.ui.inputs[`${lightId}LightEnabled`];
          if (enabledInput) enabledInput.checked = true;
        });
        ['key', 'fill', 'rim'].forEach((lightId) => {
          this.stateStore.set(`lights.${lightId}.castShadows`, true);
          this.eventBus.emit('lights:update', { lightId, property: 'castShadows', value: true });
          const castShadowsInput = this.ui.inputs[`${lightId}LightCastShadows`];
          if (castShadowsInput) castShadowsInput.checked = true;
        });
        this.stateStore.set('showLightIndicators', true);
        this.eventBus.emit('lights:show-indicators', true);
        if (this.ui.inputs.showLightIndicators) this.ui.inputs.showLightIndicators.checked = true;
        this.stateStore.set('lightsCastShadows', true);
        this.eventBus.emit('lights:cast-shadows', true);
        if (this.ui.inputs.lightsCastShadows) this.ui.inputs.lightsCastShadows.checked = true;
      }
      this.ui.updateLightSliderStates();
    });
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
    if (this.ui.inputs.podiumScale) {
      this.ui.inputs.podiumScale.value = state.podiumScale ?? 1;
      this.helpers.updateValueLabel('podiumScale', state.podiumScale ?? 1, 'decimal');
    }
    if (this.ui.inputs.gridScale) {
      this.ui.inputs.gridScale.value = state.gridScale ?? 1;
      this.helpers.updateValueLabel('gridScale', state.gridScale ?? 1, 'decimal');
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
}

