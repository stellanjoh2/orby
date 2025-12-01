/**
 * RenderControls - Handles all render/post-processing-related UI controls
 * Manages DOF, bloom, grain, aberration, camera, exposure, and export
 */
import { CAMERA_TEMPERATURE_NEUTRAL_K } from '../constants.js';
import { UIHelpers } from './UIHelpers.js';

export class RenderControls {
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    this.helpers = new UIHelpers(eventBus, stateStore, uiManager);
  }

  bind() {
    // DOF
    const emitDof = () => this.eventBus.emit('render:dof', this.stateStore.getState().dof);
    this.ui.inputs.toggleDof.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('dof.enabled', enabled);
      this.ui.setEffectControlsDisabled(['dofFocus', 'dofAperture'], !enabled);
      emitDof();
    });
    this.ui.inputs.dofFocus.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('dofFocus', value, 'distance');
      this.stateStore.set('dof.focus', value);
      emitDof();
    });
    this.ui.inputs.dofAperture.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('dofAperture', value, 'decimal', 3);
      this.stateStore.set('dof.aperture', value);
      emitDof();
    });

    // Bloom
    const emitBloom = () => this.eventBus.emit('render:bloom', this.stateStore.getState().bloom);
    this.ui.inputs.toggleBloom.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('bloom.enabled', enabled);
      this.ui.setEffectControlsDisabled(['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor'], !enabled);
      emitBloom();
    });
    [['bloomThreshold', 'threshold'], ['bloomStrength', 'strength'], ['bloomRadius', 'radius']].forEach(([inputKey, property]) => {
      this.ui.inputs[inputKey].addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        this.helpers.updateValueLabel(inputKey, value, 'decimal');
        this.stateStore.set(`bloom.${property}`, value);
        emitBloom();
      });
    });
    this.ui.inputs.bloomColor.addEventListener('input', (event) => {
      const value = event.target.value;
      this.stateStore.set('bloom.color', value);
      emitBloom();
    });

    // Lens Dirt
    const emitLensDirt = () => this.eventBus.emit('render:lens-dirt', this.stateStore.getState().lensDirt);
    if (this.ui.inputs.lensDirtEnabled) {
      this.ui.inputs.lensDirtEnabled.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        this.stateStore.set('lensDirt.enabled', enabled);
        this.ui.setEffectControlsDisabled(['lensDirtStrength'], !enabled);
        emitLensDirt();
      });
    }
    if (this.ui.inputs.lensDirtStrength) {
      this.ui.inputs.lensDirtStrength.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        this.helpers.updateValueLabel('lensDirtStrength', value, 'decimal');
        this.stateStore.set('lensDirt.strength', value);
        emitLensDirt();
      });
    }

    // Grain
    const emitGrain = () => this.eventBus.emit('render:grain', this.stateStore.getState().grain);
    this.ui.inputs.toggleGrain.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('grain.enabled', enabled);
      this.ui.setEffectControlsDisabled(['grainIntensity'], !enabled);
      emitGrain();
    });
    this.ui.inputs.grainIntensity.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value) * 0.15;
      this.helpers.updateValueLabel('grainIntensity', value / 0.15, 'decimal');
      this.stateStore.set('grain.intensity', value);
      emitGrain();
    });

    // Aberration
    const emitAberration = () => this.eventBus.emit('render:aberration', this.stateStore.getState().aberration);
    this.ui.inputs.toggleAberration.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('aberration.enabled', enabled);
      this.ui.setEffectControlsDisabled(['aberrationOffset', 'aberrationStrength'], !enabled);
      emitAberration();
    });
    this.ui.inputs.aberrationOffset.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('aberrationOffset', value, 'decimal', 3);
      this.stateStore.set('aberration.offset', value);
      emitAberration();
    });
    this.ui.inputs.aberrationStrength.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('aberrationStrength', value, 'decimal');
      this.stateStore.set('aberration.strength', value);
      emitAberration();
    });

    // Background
    this.helpers.bindColorInput('backgroundColor', 'background', 'scene:background');
    
    // Histogram toggle
    if (this.ui.inputs.histogramEnabled) {
      const updateHistogramUi = (enabled) => {
        const container = document.querySelector('#histogramContainer');
        if (container) {
          container.classList.toggle('histogram-container--collapsed', !enabled);
          container.classList.toggle('histogram-container--expanded', enabled);
        }
      };
      this.ui.inputs.histogramEnabled.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        this.stateStore.set('histogramEnabled', enabled);
        this.eventBus.emit('render:histogram-enabled', enabled);
        updateHistogramUi(enabled);
      });
      // Initialize UI state from current store
      updateHistogramUi(this.stateStore.getState().histogramEnabled ?? false);
    }
    
    // Camera
    this.ui.inputs.cameraFov.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('cameraFov', value, 'angle');
      this.stateStore.set('camera.fov', value);
      this.eventBus.emit('camera:fov', value);
    });
    this.ui.inputs.cameraTilt?.addEventListener('input', (event) => {
      const value = this.helpers.applySnapToCenter(event.target, -45, 45, 0);
      this.helpers.updateValueLabel('cameraTilt', value, 'angle');
      this.stateStore.set('camera.tilt', value);
      this.eventBus.emit('camera:tilt', value);
    });
    if (this.ui.inputs.cameraTilt) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraTilt);
    
    // Camera Auto-Orbit
    this.ui.inputs.cameraAutoOrbit.forEach((radio) => {
      radio.addEventListener('change', (event) => {
        const value = event.target.value;
        this.stateStore.set('camera.autoOrbit', value);
        this.eventBus.emit('camera:auto-orbit', value);
      });
    });

    // Exposure
    this.ui.inputs.exposure.addEventListener('input', (event) => {
      const value = this.helpers.applySnapToCenter(event.target, 0, 2, 1.0);
      this.helpers.updateValueLabel('exposure', value, 'decimal');
      this.stateStore.set('exposure', value);
      this.eventBus.emit('scene:exposure', value);
    });
    this.helpers.enableSliderKeyboardStepping(this.ui.inputs.exposure);
    if (this.ui.inputs.autoExposure) {
      this.ui.inputs.autoExposure.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        this.stateStore.set('autoExposure', enabled);
        this.ui.setEffectControlsDisabled(['exposure'], enabled);
        this.eventBus.emit('camera:auto-exposure', enabled);
      });
    }

    // Color & Tone
    this.ui.inputs.cameraContrast?.addEventListener('input', (event) => {
      const value = this.helpers.applySnapToCenter(event.target, 0, 2, 1.0);
      this.stateStore.set('camera.contrast', value);
      this.helpers.updateValueLabel('cameraContrast', value, 'decimal');
      this.eventBus.emit('render:contrast', value);
    });
    if (this.ui.inputs.cameraContrast) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraContrast);

    this.ui.inputs.cameraTemperature?.addEventListener('input', (event) => {
      const parsed = this.helpers.applySnapToCenter(event.target, 2000, 10000, 6000);
      const kelvin = Number.isFinite(parsed) ? parsed : CAMERA_TEMPERATURE_NEUTRAL_K;
      this.stateStore.set('camera.temperature', kelvin);
      this.helpers.updateValueLabel('cameraTemperature', kelvin, 'kelvin');
      this.eventBus.emit('render:temperature', kelvin);
    });
    if (this.ui.inputs.cameraTemperature) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraTemperature);

    this.ui.inputs.cameraTint?.addEventListener('input', (event) => {
      const value = this.helpers.applySnapToCenter(event.target, -100, 100, 0) || 0;
      this.stateStore.set('camera.tint', value);
      this.helpers.updateValueLabel('cameraTint', value, 'integer');
      this.eventBus.emit('render:tint', value / 100);
    });
    if (this.ui.inputs.cameraTint) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraTint);

    this.ui.inputs.cameraHighlights?.addEventListener('input', (event) => {
      const value = this.helpers.applySnapToCenter(event.target, -100, 100, 0) || 0;
      this.stateStore.set('camera.highlights', value);
      this.helpers.updateValueLabel('cameraHighlights', value, 'integer');
      this.eventBus.emit('render:highlights', value / 100);
    });
    if (this.ui.inputs.cameraHighlights) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraHighlights);

    this.ui.inputs.cameraShadows?.addEventListener('input', (event) => {
      const value = this.helpers.applySnapToCenter(event.target, -50, 50, 0) || 0;
      this.stateStore.set('camera.shadows', value);
      this.helpers.updateValueLabel('cameraShadows', value, 'integer');
      this.eventBus.emit('render:shadows', value / 50);
    });
    if (this.ui.inputs.cameraShadows) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraShadows);

    this.ui.inputs.cameraSaturation?.addEventListener('input', (event) => {
      const value = this.helpers.applySnapToCenter(event.target, 0, 2, 1.0);
      this.stateStore.set('camera.saturation', value);
      this.helpers.updateValueLabel('cameraSaturation', value, 'decimal');
      this.eventBus.emit('render:saturation', value);
    });
    if (this.ui.inputs.cameraSaturation) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraSaturation);

    this.ui.inputs.cameraClarity?.addEventListener('input', (event) => {
      const value = this.helpers.applySnapToCenter(event.target, -100, 100, 0);
      this.stateStore.set('camera.clarity', value);
      this.helpers.updateValueLabel('cameraClarity', value, 'integer');
      this.eventBus.emit('render:clarity', value);
    });
    if (this.ui.inputs.cameraClarity) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraClarity);

    this.ui.inputs.cameraFade?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value) || 0;
      this.stateStore.set('camera.fade', value);
      this.helpers.updateValueLabel('cameraFade', value, 'integer');
      this.eventBus.emit('render:fade', value);
    });
    if (this.ui.inputs.cameraFade) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraFade);

    this.ui.inputs.cameraSharpness?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value) || 0;
      this.stateStore.set('camera.sharpness', value);
      this.helpers.updateValueLabel('cameraSharpness', value, 'integer');
      this.eventBus.emit('render:sharpness', value);
    });
    if (this.ui.inputs.cameraSharpness) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraSharpness);

    // Vignette
    this.ui.inputs.vignetteIntensity?.addEventListener('input', (event) => {
      const value = this.helpers.applySnapToCenter(event.target, 0, 1, 0);
      this.stateStore.set('camera.vignette', value);
      this.helpers.updateValueLabel('vignetteIntensity', value, 'decimal');
      this.eventBus.emit('render:vignette', value);
    });
    if (this.ui.inputs.vignetteIntensity) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.vignetteIntensity);

    this.ui.inputs.vignetteColor?.addEventListener('input', (event) => {
      const value = event.target.value;
      this.stateStore.set('camera.vignetteColor', value);
      this.eventBus.emit('render:vignette-color', value);
    });

    // Anti-aliasing & Tone Mapping
    this.ui.inputs.antiAliasing.addEventListener('change', (event) => {
      const value = event.target.value;
      this.stateStore.set('antiAliasing', value);
      this.eventBus.emit('render:anti-aliasing', value);
    });
    this.ui.inputs.toneMapping.addEventListener('change', (event) => {
      const value = event.target.value;
      this.stateStore.set('toneMapping', value);
      this.eventBus.emit('render:tone-mapping', value);
    });

    // Export
    this.ui.buttons.exportPng?.addEventListener('click', () => {
      this.eventBus.emit('export:png', {
        transparent: this.ui.exportSettings.transparent,
        size: this.ui.exportSettings.size,
      });
    });
  }

  sync(state) {
    // DOF
    this.ui.inputs.dofFocus.value = state.dof.focus;
    this.helpers.updateValueLabel('dofFocus', state.dof.focus, 'distance');
    this.ui.inputs.dofAperture.value = state.dof.aperture;
    this.helpers.updateValueLabel('dofAperture', state.dof.aperture, 'decimal', 3);
    this.ui.inputs.toggleDof.checked = !!state.dof.enabled;
    this.ui.setEffectControlsDisabled(['dofFocus', 'dofAperture'], !state.dof.enabled);
    
    // Bloom
    this.ui.inputs.bloomThreshold.value = state.bloom.threshold;
    this.helpers.updateValueLabel('bloomThreshold', state.bloom.threshold, 'decimal');
    this.ui.inputs.bloomStrength.value = state.bloom.strength;
    this.helpers.updateValueLabel('bloomStrength', state.bloom.strength, 'decimal');
    this.ui.inputs.bloomRadius.value = state.bloom.radius;
    this.helpers.updateValueLabel('bloomRadius', state.bloom.radius, 'decimal');
    if (this.ui.inputs.bloomColor && state.bloom.color) {
      this.ui.inputs.bloomColor.value = state.bloom.color;
    }
    this.ui.inputs.toggleBloom.checked = !!state.bloom.enabled;
    this.ui.setEffectControlsDisabled(['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor'], !state.bloom.enabled);

    // Lens Dirt
    if (this.ui.inputs.lensDirtStrength && state.lensDirt) {
      this.ui.inputs.lensDirtStrength.value = state.lensDirt.strength;
      this.helpers.updateValueLabel('lensDirtStrength', state.lensDirt.strength, 'decimal');
    }
    if (this.ui.inputs.lensDirtEnabled) {
      const enabled = !!state.lensDirt?.enabled;
      this.ui.inputs.lensDirtEnabled.checked = enabled;
      this.ui.setEffectControlsDisabled(['lensDirtStrength'], !enabled);
    }

    // Auto Exposure
    if (this.ui.inputs.autoExposure) {
      const enabled = !!state.autoExposure;
      this.ui.inputs.autoExposure.checked = enabled;
      this.ui.setEffectControlsDisabled(['exposure'], enabled);
    }
    
    // Grain
    this.ui.inputs.grainIntensity.value = (state.grain.intensity / 0.15).toFixed(2);
    this.helpers.updateValueLabel('grainIntensity', state.grain.intensity / 0.15, 'decimal');
    this.ui.inputs.toggleGrain.checked = !!state.grain.enabled;
    this.ui.setEffectControlsDisabled(['grainIntensity'], !state.grain.enabled);
    
    // Aberration
    this.ui.inputs.aberrationOffset.value = state.aberration.offset;
    this.helpers.updateValueLabel('aberrationOffset', state.aberration.offset, 'decimal', 3);
    this.ui.inputs.aberrationStrength.value = state.aberration.strength;
    this.helpers.updateValueLabel('aberrationStrength', state.aberration.strength, 'decimal');
    this.ui.inputs.toggleAberration.checked = !!state.aberration.enabled;
    this.ui.setEffectControlsDisabled(['aberrationOffset', 'aberrationStrength'], !state.aberration.enabled);
    
    // Fresnel (synced here but bound in MeshControls)
    this.ui.inputs.toggleFresnel.checked = !!state.fresnel.enabled;
    this.ui.inputs.fresnelColor.value = state.fresnel.color;
    this.ui.inputs.fresnelRadius.value = state.fresnel.radius;
    this.helpers.updateValueLabel('fresnelRadius', state.fresnel.radius, 'decimal');
    this.ui.inputs.fresnelStrength.value = state.fresnel.strength;
    this.helpers.updateValueLabel('fresnelStrength', state.fresnel.strength, 'decimal');
    this.ui.setEffectControlsDisabled(['fresnelColor', 'fresnelRadius', 'fresnelStrength'], !state.fresnel.enabled);
    
    // Camera & Exposure
    this.ui.inputs.cameraFov.value = state.camera.fov;
    this.helpers.updateValueLabel('cameraFov', state.camera.fov, 'angle');
    if (this.ui.inputs.cameraTilt) {
      this.ui.inputs.cameraTilt.value = state.camera.tilt ?? 0;
      this.helpers.updateValueLabel('cameraTilt', state.camera.tilt ?? 0, 'angle');
    }
    // Sync camera auto-orbit
    if (this.ui.inputs.cameraAutoOrbit) {
      const autoOrbitValue = state.camera?.autoOrbit ?? 'off';
      this.ui.inputs.cameraAutoOrbit.forEach((radio) => {
        radio.checked = radio.value === autoOrbitValue;
      });
    }
    this.ui.inputs.exposure.value = state.exposure;
    this.helpers.updateValueLabel('exposure', state.exposure, 'decimal');
    if (this.ui.inputs.cameraContrast) {
      const contrast = state.camera?.contrast ?? 1.0;
      this.ui.inputs.cameraContrast.value = contrast;
      this.helpers.updateValueLabel('cameraContrast', contrast, 'decimal');
    }
    if (this.ui.inputs.cameraTemperature) {
      const temp = state.camera?.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K;
      this.ui.inputs.cameraTemperature.value = temp;
      this.helpers.updateValueLabel('cameraTemperature', temp, 'kelvin');
    }
    if (this.ui.inputs.cameraTint) {
      const tint = state.camera?.tint ?? 0;
      this.ui.inputs.cameraTint.value = tint;
      this.helpers.updateValueLabel('cameraTint', tint, 'integer');
    }
    if (this.ui.inputs.cameraHighlights) {
      const highlights = state.camera?.highlights ?? 0;
      this.ui.inputs.cameraHighlights.value = highlights;
      this.helpers.updateValueLabel('cameraHighlights', highlights, 'integer');
    }
    if (this.ui.inputs.cameraShadows) {
      const shadows = state.camera?.shadows ?? 0;
      this.ui.inputs.cameraShadows.value = shadows;
      this.helpers.updateValueLabel('cameraShadows', shadows, 'integer');
    }
    if (this.ui.inputs.cameraSaturation) {
      const saturation = state.camera?.saturation ?? 1.0;
      this.ui.inputs.cameraSaturation.value = saturation;
      this.helpers.updateValueLabel('cameraSaturation', saturation, 'decimal');
    }
    if (this.ui.inputs.cameraClarity) {
      const clarity = state.camera?.clarity ?? 0;
      this.ui.inputs.cameraClarity.value = clarity;
      this.helpers.updateValueLabel('cameraClarity', clarity, 'integer');
    }
    if (this.ui.inputs.cameraFade) {
      const fade = state.camera?.fade ?? 0;
      this.ui.inputs.cameraFade.value = fade;
      this.helpers.updateValueLabel('cameraFade', fade, 'integer');
    }
    if (this.ui.inputs.cameraSharpness) {
      const sharpness = state.camera?.sharpness ?? 0;
      this.ui.inputs.cameraSharpness.value = sharpness;
      this.helpers.updateValueLabel('cameraSharpness', sharpness, 'integer');
    }
    if (this.ui.inputs.vignetteIntensity) {
      const vignette = state.camera?.vignette ?? 0;
      this.ui.inputs.vignetteIntensity.value = vignette;
      this.helpers.updateValueLabel('vignetteIntensity', vignette, 'decimal');
    }
    if (this.ui.inputs.vignetteColor) {
      const vignetteColor = state.camera?.vignetteColor ?? '#000000';
      this.ui.inputs.vignetteColor.value = vignetteColor;
    }
    if (this.ui.inputs.histogramEnabled) {
      const enabled = state.histogramEnabled ?? false;
      this.ui.inputs.histogramEnabled.checked = enabled;
      const container = document.querySelector('#histogramContainer');
      if (container) {
        container.classList.toggle('histogram-container--collapsed', !enabled);
        container.classList.toggle('histogram-container--expanded', enabled);
      }
    }
    if (this.ui.inputs.antiAliasing) {
      this.ui.inputs.antiAliasing.value = state.antiAliasing ?? 'none';
    }
    if (this.ui.inputs.toneMapping) {
      this.ui.inputs.toneMapping.value = state.toneMapping ?? 'aces-filmic';
    }
  }
}

