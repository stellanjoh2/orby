/**
 * StudioControls - Handles all studio/environment-related UI controls
 * Manages HDRI, lights, ground, podium, grid, and lens flare
 */
import { HDRI_CUSTOM_ID, HDRI_STRENGTH_UNIT } from '../config/hdri.js';
import { normalizeGodRaysState } from '../GodRaysEffect.js';
import {
  DEFAULT_MATERIAL_METALNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_BACKDROP_METALNESS,
  DEFAULT_BACKDROP_ROUGHNESS,
  DEFAULT_BASE_GLASS_BLUR,
  DEFAULT_BASE_GLASS_AMOUNT,
  DEFAULT_BASE_GLASS_BRIGHTNESS,
  isKeyLightOnlyShadowCastingRenderQuality,
} from '../constants.js';
import {
  bindBaseSurfaceControls,
  syncBaseSurfaceControls,
  bindBackdropSurfaceControls,
  syncBackdropSurfaceControls,
} from './svgExtrudeControlsShared.js';
import { DEFAULT_LIGHTS_SHADOW_SOFTNESS } from '../config/shadowQuality.js';
import {
  STUDIO_CHECKBOX_UI_MANIFEST,
  STUDIO_UI_CONTROL_MANIFEST,
} from '../state/uiStudioControlManifest.js';

export class StudioControls {
  constructor(eventBus, stateStore, uiManager, helpers) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    this.helpers = helpers;
  }

  _baseSurfaceCtx() {
    return {
      inputs: {
        surfacePreset: this.ui.inputs.baseSurfacePreset,
        surfaceScale: this.ui.inputs.baseSurfaceScale,
        surfaceScaleOutputKey: 'baseSurfaceScale',
        surfaceStrength: this.ui.inputs.baseSurfaceStrength,
        surfaceStrengthOutputKey: 'baseSurfaceStrength',
      },
      stateStore: this.stateStore,
      eventBus: this.eventBus,
      ui: this.ui,
      helpers: this.helpers,
    };
  }

  _baseGlassSurfaceCtx() {
    return {
      inputs: {
        surfacePreset: this.ui.inputs.baseGlassSurfPreset,
        surfaceScale: this.ui.inputs.baseGlassSurfScale,
        surfaceScaleOutputKey: 'baseGlassSurfScale',
        surfaceStrength: this.ui.inputs.baseGlassSurfStrength,
        surfaceStrengthOutputKey: 'baseGlassSurfStrength',
      },
      stateStore: this.stateStore,
      eventBus: this.eventBus,
      ui: this.ui,
      helpers: this.helpers,
    };
  }

  _isBaseGlassOn(state) {
    return !!(state.baseGlassSurface ?? state.podiumReflectMesh ?? false);
  }

  _backdropSurfaceCtx() {
    return {
      inputs: {
        surfacePreset: this.ui.inputs.backdropSurfacePreset,
        surfaceScale: this.ui.inputs.backdropSurfaceScale,
        surfaceScaleOutputKey: 'backdropSurfaceScale',
        surfaceStrength: this.ui.inputs.backdropSurfaceStrength,
        surfaceStrengthOutputKey: 'backdropSurfaceStrength',
      },
      stateStore: this.stateStore,
      eventBus: this.eventBus,
      ui: this.ui,
      helpers: this.helpers,
    };
  }

  bind() {
    this.helpers.bindManifestControls(STUDIO_UI_CONTROL_MANIFEST);
    this.helpers.bindManifestControls(STUDIO_CHECKBOX_UI_MANIFEST);

    // HDRI controls
    this.ui.inputs.hdriButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const preset = button.dataset.hdri;
        const current = this.stateStore.getState().hdri;
        if (preset !== current) this.ui.uiSounds?.playSelect();
        this.ui.setHdriActive(preset);
        this.stateStore.set('hdri', preset);
        if (preset !== HDRI_CUSTOM_ID) {
          this.stateStore.set('hdriCustomName', null);
          this.stateStore.set('hdriCustomAsset', null);
        }
        this.eventBus.emit('studio:hdri', preset);
      });
    });
    document.querySelectorAll('#hdriGrid .hdri-icon img').forEach((img) => {
      img.addEventListener('error', () => {
        img.style.display = 'none';
      }, { once: true });
    });
    this.ui.inputs.hdriUploadBtn?.addEventListener('click', () => {
      if (!this.stateStore.getState().hdriEnabled) return;
      this.ui.inputs.hdriFileInput?.click();
    });
    this.ui.inputs.hdriFileInput?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      this.ui.uiSounds?.playSelect();
      this.stateStore.set('hdri', HDRI_CUSTOM_ID);
      this.ui.setHdriActive(HDRI_CUSTOM_ID);
      this.eventBus.emit('studio:hdri-upload', file);
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
    this.ui.inputs.hdriBackground.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('hdriBackground', enabled);
      this.eventBus.emit('studio:hdri-background', enabled);
      this.ui.syncHdriBackgroundCheckboxes?.(enabled, { except: event.target });
      this.ui.updateHdriBackgroundFallbackVisibility?.();
      this.ui.updateHdriReceiveShadowsAoDisabled?.();
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
    this.ui.inputs.lensFlareQuality?.addEventListener('change', (event) => {
      const value = event.target.value;
      this.stateStore.set('lensFlare.quality', value);
      this.eventBus.emit('studio:lens-flare-quality', value);
    });

    // God rays (pmndrs) — sun direction follows lens flare rotation/height
    const touchGodRaysReset = () => {
      this.eventBus.emit('ui:reset-section-touched', 'volumetric-scattering');
    };
    this.ui.inputs.godRaysEnabled?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('godRays.enabled', enabled);
      this.eventBus.emit('studio:god-rays-enabled', enabled);
      this.ui.updateGodRaysControlsDisabled();
      this.ui.applyBlockStates?.(this.stateStore.getState());
    });
    this.helpers.bindColorInput('godRaysColor', 'godRays.color', 'studio:god-rays-color');
    this.ui.inputs.godRaysColor?.addEventListener('input', touchGodRaysReset);
    this.ui.inputs.godRaysLightScale?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('godRaysLightScale', value, 'decimal');
      this.stateStore.set('godRays.lightScale', value);
      this.eventBus.emit('studio:god-rays-light-scale', value);
      touchGodRaysReset();
    });
    this.ui.inputs.godRaysOpacity?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('godRaysOpacity', value, 'decimal');
      this.stateStore.set('godRays.opacity', value);
      this.eventBus.emit('studio:god-rays-opacity', value);
      touchGodRaysReset();
    });
    this.ui.inputs.godRaysDensity?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('godRaysDensity', value, 'decimal');
      this.stateStore.set('godRays.density', value);
      this.eventBus.emit('studio:god-rays-density', value);
      touchGodRaysReset();
    });
    this.ui.inputs.godRaysDecay?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('godRaysDecay', value, 'decimal');
      this.stateStore.set('godRays.decay', value);
      this.eventBus.emit('studio:god-rays-decay', value);
      touchGodRaysReset();
    });
    this.ui.inputs.godRaysWeight?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('godRaysWeight', value, 'decimal');
      this.stateStore.set('godRays.weight', value);
      this.eventBus.emit('studio:god-rays-weight', value);
      touchGodRaysReset();
    });
    this.ui.inputs.godRaysExposure?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('godRaysExposure', value, 'decimal');
      this.stateStore.set('godRays.exposure', value);
      this.eventBus.emit('studio:god-rays-exposure', value);
      touchGodRaysReset();
    });
    this.ui.inputs.godRaysClampMax?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('godRaysClampMax', value, 'decimal');
      this.stateStore.set('godRays.clampMax', value);
      this.eventBus.emit('studio:god-rays-clamp-max', value);
      touchGodRaysReset();
    });
    this.ui.inputs.godRaysBlur?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('godRays.blur', enabled);
      this.eventBus.emit('studio:god-rays-blur', enabled);
      touchGodRaysReset();
    });
    this.ui.inputs.lensFlareSpinDuringOrbit?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('lensFlare.spinDuringOrbit', enabled);
      this.eventBus.emit('studio:lens-flare-spin-during-orbit', enabled);
    });
    this.ui.inputs.lensFlareKeyLightConnect?.addEventListener('click', () => {
      const connected = !this.stateStore.getState().lensFlare?.keyLightConnected;
      this.eventBus.emit('studio:lens-flare-key-light-connected', connected);
    });
    this.ui.inputs.godRaysQuality?.addEventListener('change', (event) => {
      const value = event.target.value;
      this.stateStore.set('godRays.quality', value);
      this.eventBus.emit('studio:god-rays-quality', value);
      touchGodRaysReset();
    });

    // Ground/Podium
    this.ui.inputs.groundSolid.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      if (enabled) this.ui.uiSounds?.playShelfShow();
      else this.ui.uiSounds?.playShelfHide();
      this.stateStore.set('groundSolid', enabled);
      this.eventBus.emit('studio:ground-solid', enabled);
    });
    bindBaseSurfaceControls(this._baseSurfaceCtx(), {
      mirrorCtx: this._baseGlassSurfaceCtx(),
      mirrorCanEdit: (st) => this._isBaseGlassOn(st),
    });
    bindBaseSurfaceControls(this._baseGlassSurfaceCtx(), {
      mirrorCtx: this._baseSurfaceCtx(),
      mirrorCanEdit: (st) => !!st.groundSolid,
    });
    this.ui.inputs.baseGlassSurface?.addEventListener('change', (event) => {
      const enabled = !!event.target.checked;
      if (enabled) this.ui.uiSounds?.playShelfShow();
      else this.ui.uiSounds?.playShelfHide();
      this.stateStore.set('baseGlassSurface', enabled);
      this.eventBus.emit('studio:base-glass-surface', enabled);
      this.ui.applyBlockStates?.(this.stateStore.getState());
    });
    this.ui.inputs.backdropEnabled?.addEventListener('change', (event) => {
      const enabled = !!event.target.checked;
      if (enabled) this.ui.uiSounds?.playShelfShow();
      else this.ui.uiSounds?.playShelfHide();
      this.stateStore.set('backdropEnabled', enabled);
      this.eventBus.emit('studio:backdrop-enabled', enabled);
      this.ui.applyBlockStates?.(this.stateStore.getState());
    });
    bindBackdropSurfaceControls(this._backdropSurfaceCtx());
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
        this.stateStore.set('lightsCastShadows', true);
        this.eventBus.emit('lights:cast-shadows', true);
        if (this.ui.inputs.lightsCastShadows) {
          this.ui.inputs.lightsCastShadows.checked = true;
        }
        this._syncLightShadowControlDisabledState(true, true);
      }

      this.eventBus.emit('lights:enabled', enabled);
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
    this.helpers.bindColorInput('lightsShadowColor', 'lightsShadowColor', 'lights:shadow-color');
    this.ui.inputs.lightsShadowOpacity?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('lightsShadowOpacity', value, 'decimal', 2);
      this.stateStore.set('lightsShadowOpacity', value);
      this.eventBus.emit('lights:shadow-opacity', value);
    });
    if (this.ui.inputs.lightsShadowOpacity) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.lightsShadowOpacity);
    }
    this.ui.inputs.lightsShadowContactOffset?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('lightsShadowContactOffset', value, 'decimal', 4);
      this.stateStore.set('lightsShadowContactOffset', value);
      this.eventBus.emit('lights:shadow-contact-offset', value);
    });
    this.ui.inputs.lightsShadowNormalBias?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('lightsShadowNormalBias', value, 'decimal', 3);
      this.stateStore.set('lightsShadowNormalBias', value);
      this.eventBus.emit('lights:shadow-normal-bias', value);
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
    if (this.ui.inputs.lightsShadowNormalBias) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.lightsShadowNormalBias);
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
    this.ui.syncHdriBackgroundCheckboxes?.(state.hdriBackground);
    if (this.ui.inputs.hdriReceiveShadowsAo) {
      this.ui.inputs.hdriReceiveShadowsAo.checked = !!state.hdriReceiveShadowsAo;
    }
    this.ui.updateHdriReceiveShadowsAoDisabled?.();
    // Skip the write-back while the native color picker is open (focused) — it freezes the picker.
    if (document.activeElement !== this.ui.inputs.backgroundColor) {
      this.ui.inputs.backgroundColor.value = state.background;
    }
    
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
    if (this.ui.inputs.lensFlareStreakLength) {
      const streakLength = Math.min(10, Math.max(0, state.lensFlare?.streakLength ?? 5));
      this.ui.inputs.lensFlareStreakLength.value = streakLength;
      this.helpers.updateValueLabel('lensFlareStreakLength', streakLength, 'decimal');
    }
    if (this.ui.inputs.lensFlareSunDiscScale) {
      const sunDiscScale = Math.min(10, Math.max(0, state.lensFlare?.sunDiscScale ?? 1.5));
      this.ui.inputs.lensFlareSunDiscScale.value = sunDiscScale;
      this.helpers.updateValueLabel('lensFlareSunDiscScale', sunDiscScale, 'decimal');
    }
    if (this.ui.inputs.lensFlareSunDiscBlur) {
      const sunDiscBlur = Math.min(5, Math.max(0, state.lensFlare?.sunDiscBlur ?? 1.25));
      this.ui.inputs.lensFlareSunDiscBlur.value = sunDiscBlur;
      this.helpers.updateValueLabel('lensFlareSunDiscBlur', sunDiscBlur, 'decimal');
    }
    if (this.ui.inputs.lensFlareSunDiscColor && state.lensFlare?.sunDiscColor) {
      this.ui.inputs.lensFlareSunDiscColor.value = state.lensFlare.sunDiscColor;
    }
    if (this.ui.inputs.lensFlareDiscGlowIntensity) {
      const legacyScale = state.lensFlare?.discGlowScale;
      const hasLegacyOnly =
        legacyScale != null &&
        state.lensFlare?.discGlowIntensity == null &&
        state.lensFlare?.discGlowSize == null;
      const discGlowIntensity = Math.min(
        10,
        Math.max(
          0,
          state.lensFlare?.discGlowIntensity ?? (hasLegacyOnly ? legacyScale : 0),
        ),
      );
      this.ui.inputs.lensFlareDiscGlowIntensity.value = discGlowIntensity;
      this.helpers.updateValueLabel('lensFlareDiscGlowIntensity', discGlowIntensity, 'decimal');
    }
    if (this.ui.inputs.lensFlareDiscGlowSize) {
      const discGlowSize = Math.min(
        10,
        Math.max(0, state.lensFlare?.discGlowSize ?? state.lensFlare?.discGlowScale ?? 5),
      );
      this.ui.inputs.lensFlareDiscGlowSize.value = discGlowSize;
      this.helpers.updateValueLabel('lensFlareDiscGlowSize', discGlowSize, 'decimal');
    }
    if (this.ui.inputs.lensFlareDiscGlowColor && state.lensFlare?.discGlowColor) {
      this.ui.inputs.lensFlareDiscGlowColor.value = state.lensFlare.discGlowColor;
    }
    if (this.ui.inputs.lensFlareColor && state.lensFlare?.color) {
      this.ui.inputs.lensFlareColor.value = state.lensFlare.color;
    }
    if (this.ui.inputs.lensFlareQuality) {
      this.ui.inputs.lensFlareQuality.value = state.lensFlare?.quality ?? 'high';
    }
    if (this.ui.inputs.lensFlareSpinDuringOrbit) {
      const flare = state.lensFlare ?? {};
      this.ui.inputs.lensFlareSpinDuringOrbit.checked = !!(
        flare.spinDuringOrbit ?? state.godRays?.spinDuringOrbit
      );
    }
    this.ui.syncLensFlareKeyLightConnectButton?.();
    this.ui.updateLensFlareControlsDisabled();

    const godRays = normalizeGodRaysState(
      state.godRays ?? {},
      this.stateStore.getDefaults().godRays,
    );
    if (this.ui.inputs.godRaysEnabled) {
      this.ui.inputs.godRaysEnabled.checked = !!godRays.enabled;
    }
    if (this.ui.inputs.godRaysColor && godRays.color) {
      this.ui.inputs.godRaysColor.value = godRays.color;
    }
    if (this.ui.inputs.godRaysLightScale) {
      const lightScale = godRays.lightScale;
      this.ui.inputs.godRaysLightScale.value = lightScale;
      this.helpers.updateValueLabel('godRaysLightScale', lightScale, 'decimal');
    }
    if (this.ui.inputs.godRaysOpacity) {
      const opacity = godRays.opacity;
      this.ui.inputs.godRaysOpacity.value = opacity;
      this.helpers.updateValueLabel('godRaysOpacity', opacity, 'decimal');
    }
    if (this.ui.inputs.godRaysDensity) {
      const density = godRays.density;
      this.ui.inputs.godRaysDensity.value = density;
      this.helpers.updateValueLabel('godRaysDensity', density, 'decimal');
    }
    if (this.ui.inputs.godRaysDecay) {
      const decay = godRays.decay;
      this.ui.inputs.godRaysDecay.value = decay;
      this.helpers.updateValueLabel('godRaysDecay', decay, 'decimal');
    }
    if (this.ui.inputs.godRaysWeight) {
      const weight = godRays.weight;
      this.ui.inputs.godRaysWeight.value = weight;
      this.helpers.updateValueLabel('godRaysWeight', weight, 'decimal');
    }
    if (this.ui.inputs.godRaysExposure) {
      const exposure = godRays.exposure;
      this.ui.inputs.godRaysExposure.value = exposure;
      this.helpers.updateValueLabel('godRaysExposure', exposure, 'decimal');
    }
    if (this.ui.inputs.godRaysClampMax) {
      const clampMax = godRays.clampMax;
      this.ui.inputs.godRaysClampMax.value = clampMax;
      this.helpers.updateValueLabel('godRaysClampMax', clampMax, 'decimal');
    }
    if (this.ui.inputs.godRaysBlur) {
      this.ui.inputs.godRaysBlur.checked = godRays.blur !== false;
    }
    if (this.ui.inputs.godRaysQuality) {
      this.ui.inputs.godRaysQuality.value = godRays.quality ?? 'medium';
    }
    this.ui.updateGodRaysControlsDisabled();
    
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
    syncBaseSurfaceControls(this._baseSurfaceCtx(), state, !!state.groundSolid);
    syncBaseSurfaceControls(this._baseGlassSurfaceCtx(), state, this._isBaseGlassOn(state));
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
    if (this.ui.inputs.gridLineWidth) {
      this.ui.inputs.gridLineWidth.value = state.gridLineWidth ?? 1;
      this.helpers.updateValueLabel('gridLineWidth', state.gridLineWidth ?? 1, 'decimal');
    }
    if (this.ui.inputs.backdropEnabled) {
      this.ui.inputs.backdropEnabled.checked = !!state.backdropEnabled;
    }
    if (this.ui.inputs.backdropColor) {
      this.ui.inputs.backdropColor.value = state.backdropColor ?? '#808080';
    }
    if (this.ui.inputs.backdropMetalness) {
      const v = state.backdropMetalness ?? DEFAULT_BACKDROP_METALNESS;
      this.ui.inputs.backdropMetalness.value = v;
      this.helpers.updateValueLabel('backdropMetalness', v, 'decimal');
    }
    if (this.ui.inputs.backdropRoughness) {
      const v = state.backdropRoughness ?? DEFAULT_BACKDROP_ROUGHNESS;
      this.ui.inputs.backdropRoughness.value = v;
      this.helpers.updateValueLabel('backdropRoughness', v, 'decimal');
    }
    syncBackdropSurfaceControls(this._backdropSurfaceCtx(), state, !!state.backdropEnabled);
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
      this.ui.inputs.lightsCastShadows.checked =
        !!state.lightsEnabled && !!state.lightsCastShadows;
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
        : DEFAULT_LIGHTS_SHADOW_SOFTNESS;
      this.ui.inputs.lightsShadowSoftness.value = softness;
      this.helpers.updateValueLabel('lightsShadowSoftness', softness, 'decimal', 2);
    }
    if (this.ui.inputs.lightsShadowColor) {
      this.ui.inputs.lightsShadowColor.value = state.lightsShadowColor ?? '#080808';
    }
    if (this.ui.inputs.lightsShadowOpacity) {
      const opacity = Number.isFinite(state.lightsShadowOpacity)
        ? state.lightsShadowOpacity
        : 0.25;
      this.ui.inputs.lightsShadowOpacity.value = opacity;
      this.helpers.updateValueLabel('lightsShadowOpacity', opacity, 'decimal', 2);
    }
    if (this.ui.inputs.lightsShadowContactOffset) {
      const contact = Number.isFinite(state.lightsShadowContactOffset)
        ? state.lightsShadowContactOffset
        : -0.0005;
      this.ui.inputs.lightsShadowContactOffset.value = contact;
      this.helpers.updateValueLabel('lightsShadowContactOffset', contact, 'decimal', 4);
    }
    if (this.ui.inputs.lightsShadowNormalBias) {
      const normalBias = Number.isFinite(state.lightsShadowNormalBias)
        ? state.lightsShadowNormalBias
        : 0.01;
      this.ui.inputs.lightsShadowNormalBias.value = normalBias;
      this.helpers.updateValueLabel('lightsShadowNormalBias', normalBias, 'decimal', 3);
    }
    if (this.ui.inputs.lightsShadowTwoSided) {
      this.ui.inputs.lightsShadowTwoSided.checked = !!state.lightsShadowTwoSided;
    }
    this._syncLightShadowControlDisabledState(
      !!state.lightsEnabled && !!state.lightsCastShadows,
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
    this.ui.syncHdriUploadButton(state);
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
        const goboOn =
          lightId === 'key' && !!this.stateStore.getState().gobo?.enabled;
        castShadowsInput.checked = goboOn
          ? false
          : lightState.castShadows === true;
      }
    }
    
    const enabledInput = this.ui.inputs[`${lightId}LightEnabled`];
    if (enabledInput) {
      enabledInput.checked = lightState.enabled === true;
    }
  }

  _syncLightShadowControlDisabledState(shadowsEnabled, lightsEnabled = true) {
    const shadowsOn = !!(shadowsEnabled && lightsEnabled);
    const mute = !shadowsOn;
    this.ui.setControlDisabled('lightsShadowQuality', mute);
    this.ui.setControlDisabled('lightsShadowSoftness', mute);
    this.ui.setControlDisabled('lightsShadowColor', mute);
    this.ui.setControlDisabled('lightsShadowOpacity', mute);
    this.ui.setControlDisabled('lightsShadowContactOffset', mute);
    this.ui.setControlDisabled('lightsShadowNormalBias', mute);
    this.ui.setControlDisabled('lightsShadowTwoSided', mute);
    const keyOnly = isKeyLightOnlyShadowCastingRenderQuality(
      this.stateStore.getState().renderQuality,
    );
    this.ui.setControlDisabled(
      ['fillLightCastShadows', 'rimLightCastShadows'],
      mute || keyOnly,
    );
  }
}

