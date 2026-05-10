/**
 * RenderControls - Handles all render/post-processing-related UI controls
 * Manages DOF, bloom, grain, aberration, camera, exposure, and export
 */
import {
  AMBIENT_OCCLUSION_INTENSITY_MIN,
  CAMERA_TEMPERATURE_NEUTRAL_K,
  DOF_FOCUS_MIN_M,
  effectiveVignetteIntensity,
  getAntiAliasingUiState,
  isVignetteUiEnabled,
  ANAMORPHIC_BLOOM_SPREAD_MAX,
  normalizeAnamorphicBloomQualityId,
  RENDER_QUALITY_DEFAULT,
  sanitizeAmbientOcclusion,
} from '../constants.js';
import { ToneCurveController } from './ToneCurveController.js';

const ANAMORPHIC_BLOOM_INPUT_KEYS = [
  'anamorphicBloomEnabled',
  'anamorphicBloomStrength',
  'anamorphicBloomSpread',
  'anamorphicBloomThreshold',
  'anamorphicBloomSoften',
  'anamorphicBloomStreakTint',
  'anamorphicBloomQuality',
];
const ANAMORPHIC_BLOOM_SLIDER_KEYS = ANAMORPHIC_BLOOM_INPUT_KEYS.filter(
  (id) => id !== 'anamorphicBloomEnabled',
);

export class RenderControls {
  constructor(eventBus, stateStore, uiManager, helpers) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    this.helpers = helpers;
    this.toneCurveController = null;
  }

  /** Anamorphic bloom: toggle follows master Bloom; sliders follow this toggle (like Lens dirt). */
  _syncAnamorphicBloomControlsDisabled(state) {
    const bloomOn = !!state.bloom?.enabled;
    const abDef = this.stateStore.getDefaults().lensFlare?.anamorphicBloom ?? {};
    const ab = { ...abDef, ...(state.lensFlare?.anamorphicBloom ?? {}) };
    const abOn = !!ab.enabled;
    this.ui.setEffectControlsDisabled('anamorphicBloomEnabled', !bloomOn);
    this.ui.setEffectControlsDisabled(ANAMORPHIC_BLOOM_SLIDER_KEYS, !bloomOn || !abOn);
  }

  _syncColorCheckerRawToggleUi(rawOn) {
    const btn = this.ui.inputs.colorCheckerRawToggle;
    if (!btn) return;
    const on = !!rawOn;
    btn.classList.toggle('color-checker-raw-toggle--on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const label = btn.querySelector('.color-checker-raw-toggle__label');
    if (label) {
      label.textContent = on ? 'Reference colors — On' : 'Reference colors — Off';
    }
  }

  bind() {
    const touchLookFilterCustom = () => {
      if (this.stateStore.getState().lookFilterPreset !== 'custom') {
        this.stateStore.set('lookFilterPreset', 'custom');
      }
    };
    // DOF
    const emitDof = () => this.eventBus.emit('render:dof', this.stateStore.getState().dof);
    this.ui.inputs.toggleDof.addEventListener('change', (event) => {
      touchLookFilterCustom();
      const enabled = event.target.checked;
      this.stateStore.set('dof.enabled', enabled);
      this.ui.setEffectControlsDisabled(['dofFocus', 'dofAperture'], !enabled);
      emitDof();
    });
    this.ui.inputs.dofFocus.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const raw = parseFloat(event.target.value);
      const value = Math.max(DOF_FOCUS_MIN_M, raw);
      if (value !== raw) {
        event.target.value = String(value);
      }
      this.helpers.updateValueLabel('dofFocus', value, 'distance');
      this.stateStore.set('dof.focus', value);
      emitDof();
    });
    this.ui.inputs.dofAperture.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('dofAperture', value, 'decimal', 3);
      this.stateStore.set('dof.aperture', value);
      emitDof();
    });

    // Bloom
    const emitBloom = () => this.eventBus.emit('render:bloom', this.stateStore.getState().bloom);
    this.ui.inputs.toggleBloom.addEventListener('change', (event) => {
      touchLookFilterCustom();
      const enabled = event.target.checked;
      this.stateStore.set('bloom.enabled', enabled);
      this.ui.setEffectControlsDisabled(
        [
          'bloomThreshold',
          'bloomStrength',
          'bloomRadius',
          'bloomColor',
          'bloomQuality',
        ],
        !enabled,
      );
      emitBloom();
    });
    [['bloomThreshold', 'threshold'], ['bloomStrength', 'strength'], ['bloomRadius', 'radius']].forEach(([inputKey, property]) => {
      this.ui.inputs[inputKey].addEventListener('input', (event) => {
        touchLookFilterCustom();
        const value = parseFloat(event.target.value);
        this.helpers.updateValueLabel(inputKey, value, 'decimal');
        this.stateStore.set(`bloom.${property}`, value);
        emitBloom();
      });
    });
    this.ui.inputs.bloomColor.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const value = event.target.value;
      this.stateStore.set('bloom.color', value);
      emitBloom();
    });
    if (this.ui.inputs.bloomQuality) {
      this.ui.inputs.bloomQuality.addEventListener('change', (event) => {
        touchLookFilterCustom();
        const raw = event.target.value;
        const quality =
          raw === 'low' || raw === 'high' || raw === 'ultra'
            ? raw
            : 'medium';
        this.stateStore.set('bloom.quality', quality);
        emitBloom();
      });
    }

    const emitAnamorphicBloom = () => {
      this.eventBus.emit('studio:lens-flare-anamorphic-bloom');
    };
    if (this.ui.inputs.anamorphicBloomEnabled) {
      this.ui.inputs.anamorphicBloomEnabled.addEventListener('change', (event) => {
        touchLookFilterCustom();
        this.stateStore.set('lensFlare.anamorphicBloom.enabled', event.target.checked);
        emitAnamorphicBloom();
      });
    }
    if (this.ui.inputs.anamorphicBloomStrength) {
      this.ui.inputs.anamorphicBloomStrength.addEventListener('input', (event) => {
        touchLookFilterCustom();
        const value = parseFloat(event.target.value);
        this.helpers.updateValueLabel('anamorphicBloomStrength', value, 'decimal');
        this.stateStore.set('lensFlare.anamorphicBloom.strength', value);
        emitAnamorphicBloom();
      });
    }
    if (this.ui.inputs.anamorphicBloomSpread) {
      this.ui.inputs.anamorphicBloomSpread.addEventListener('input', (event) => {
        touchLookFilterCustom();
        let value = parseFloat(event.target.value);
        value = Math.min(ANAMORPHIC_BLOOM_SPREAD_MAX, Math.max(0, value));
        if (value !== parseFloat(event.target.value)) {
          event.target.value = String(value);
        }
        this.helpers.updateValueLabel('anamorphicBloomSpread', value, 'decimal');
        this.stateStore.set('lensFlare.anamorphicBloom.spread', value);
        emitAnamorphicBloom();
      });
    }
    if (this.ui.inputs.anamorphicBloomThreshold) {
      this.ui.inputs.anamorphicBloomThreshold.addEventListener('input', (event) => {
        touchLookFilterCustom();
        const value = parseFloat(event.target.value);
        this.helpers.updateValueLabel('anamorphicBloomThreshold', value, 'decimal');
        this.stateStore.set('lensFlare.anamorphicBloom.threshold', value);
        emitAnamorphicBloom();
      });
    }
    if (this.ui.inputs.anamorphicBloomSoften) {
      this.ui.inputs.anamorphicBloomSoften.addEventListener('input', (event) => {
        touchLookFilterCustom();
        const value = parseFloat(event.target.value);
        this.helpers.updateValueLabel('anamorphicBloomSoften', value, 'decimal');
        this.stateStore.set('lensFlare.anamorphicBloom.soften', value);
        emitAnamorphicBloom();
      });
    }
    this.helpers.bindColorInput(
      'anamorphicBloomStreakTint',
      'lensFlare.anamorphicBloom.streakTint',
      'studio:lens-flare-anamorphic-bloom',
    );
    if (this.ui.inputs.anamorphicBloomQuality) {
      this.ui.inputs.anamorphicBloomQuality.addEventListener('change', (event) => {
        touchLookFilterCustom();
        const q = normalizeAnamorphicBloomQualityId(event.target.value);
        this.stateStore.set('lensFlare.anamorphicBloom.quality', q);
        const spread = this.stateStore.getState().lensFlare?.anamorphicBloom?.spread ?? 0.2;
        const clamped = Math.min(ANAMORPHIC_BLOOM_SPREAD_MAX, Math.max(0, spread));
        if (clamped !== spread) {
          this.stateStore.set('lensFlare.anamorphicBloom.spread', clamped);
          if (this.ui.inputs.anamorphicBloomSpread) {
            this.ui.inputs.anamorphicBloomSpread.value = clamped;
            this.helpers.updateValueLabel('anamorphicBloomSpread', clamped, 'decimal');
          }
        }
        emitAnamorphicBloom();
      });
    }

    // Lens Dirt
    const emitLensDirt = () => this.eventBus.emit('render:lens-dirt', this.stateStore.getState().lensDirt);
    if (this.ui.inputs.lensDirtEnabled) {
      this.ui.inputs.lensDirtEnabled.addEventListener('change', (event) => {
        touchLookFilterCustom();
        const enabled = event.target.checked;
        this.stateStore.set('lensDirt.enabled', enabled);
        this.ui.setEffectControlsDisabled(['lensDirtStrength'], !enabled);
        emitLensDirt();
      });
    }
    if (this.ui.inputs.lensDirtStrength) {
      this.ui.inputs.lensDirtStrength.addEventListener('input', (event) => {
        touchLookFilterCustom();
        const value = parseFloat(event.target.value);
        this.helpers.updateValueLabel('lensDirtStrength', value, 'decimal');
        this.stateStore.set('lensDirt.strength', value);
        emitLensDirt();
      });
    }

    // Grain
    const emitGrain = () => this.eventBus.emit('render:grain', this.stateStore.getState().grain);
    this.ui.inputs.toggleGrain.addEventListener('change', (event) => {
      touchLookFilterCustom();
      const enabled = event.target.checked;
      this.stateStore.set('grain.enabled', enabled);
      this.ui.setEffectControlsDisabled(['grainIntensity'], !enabled);
      emitGrain();
    });
    this.ui.inputs.grainIntensity.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const value = parseFloat(event.target.value) * 0.15;
      this.helpers.updateValueLabel('grainIntensity', value / 0.15, 'decimal');
      this.stateStore.set('grain.intensity', value);
      emitGrain();
    });

    // Aberration
    const emitAberration = () => this.eventBus.emit('render:aberration', this.stateStore.getState().aberration);
    this.ui.inputs.toggleAberration.addEventListener('change', (event) => {
      touchLookFilterCustom();
      const enabled = event.target.checked;
      this.stateStore.set('aberration.enabled', enabled);
      this.ui.setEffectControlsDisabled(
        ['aberrationAmount'],
        !enabled,
      );
      emitAberration();
    });
    this.ui.inputs.aberrationAmount.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('aberrationAmount', value, 'decimal', 4);
      this.stateStore.set('aberration.amount', value);
      emitAberration();
    });

    const emitAmbientOcclusion = () =>
      this.eventBus.emit('render:ambient-occlusion', this.stateStore.getState().ambientOcclusion);
    if (this.ui.inputs.toggleAmbientOcclusion) {
      this.ui.inputs.toggleAmbientOcclusion.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        // Capture the checked state before any notify-driven UI sync and commit
        // both state updates together so the first click cannot be overwritten.
        this.stateStore.batch(() => {
          this.stateStore.set('ambientOcclusion.enabled', enabled);
          if (this.stateStore.getState().lookFilterPreset !== 'custom') {
            this.stateStore.set('lookFilterPreset', 'custom');
          }
        });
        this.ui.setEffectControlsDisabled(
          [
            'ambientOcclusionIntensity',
            'ambientOcclusionRadius',
            'ambientOcclusionColor',
            'ambientOcclusionQuality',
          ],
          !enabled,
        );
        emitAmbientOcclusion();
      });
    }
    if (this.ui.inputs.ambientOcclusionIntensity) {
      this.ui.inputs.ambientOcclusionIntensity.addEventListener('input', (event) => {
        touchLookFilterCustom();
        const raw = parseFloat(event.target.value);
        const value = Math.max(AMBIENT_OCCLUSION_INTENSITY_MIN, raw);
        if (value !== raw) {
          event.target.value = String(value);
        }
        this.helpers.updateValueLabel('ambientOcclusionIntensity', value, 'decimal');
        this.stateStore.set('ambientOcclusion.intensity', value);
        emitAmbientOcclusion();
      });
    }
    if (this.ui.inputs.ambientOcclusionRadius) {
      this.ui.inputs.ambientOcclusionRadius.addEventListener('input', (event) => {
        touchLookFilterCustom();
        const value = parseFloat(event.target.value);
        this.helpers.updateValueLabel('ambientOcclusionRadius', value, 'decimal');
        this.stateStore.set('ambientOcclusion.radius', value);
        emitAmbientOcclusion();
      });
    }
    if (this.ui.inputs.ambientOcclusionQuality) {
      this.ui.inputs.ambientOcclusionQuality.addEventListener('change', (event) => {
        touchLookFilterCustom();
        const value = event.target.value;
        const normalized =
          value === 'low' || value === 'medium' ? value : 'max';
        this.stateStore.set('ambientOcclusion.quality', normalized);
        emitAmbientOcclusion();
      });
    }
    if (this.ui.inputs.ambientOcclusionColor) {
      this.ui.inputs.ambientOcclusionColor.addEventListener('input', (event) => {
        touchLookFilterCustom();
        this.stateStore.set('ambientOcclusion.color', event.target.value);
        emitAmbientOcclusion();
      });
    }

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

    if (this.ui.inputs.compositionGridEnabled) {
      this.ui.inputs.compositionGridEnabled.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        this.stateStore.set('camera.compositionGridEnabled', enabled);
        this.eventBus.emit('camera:composition-grid', enabled);
      });
    }

    if (this.ui.inputs.toneCurveOpen) {
      const updateToneCurveFoldout = (open) => {
        const el = document.querySelector('#toneCurveContainer');
        if (el) {
          el.classList.toggle('tone-curve-foldout--collapsed', !open);
          el.classList.toggle('tone-curve-foldout--expanded', open);
        }
      };
      this.ui.inputs.toneCurveOpen.addEventListener('change', (event) => {
        const open = event.target.checked;
        this.stateStore.set('toneCurveOpen', open);
        updateToneCurveFoldout(open);
      });
      updateToneCurveFoldout(
        this.stateStore.getState().toneCurveOpen ?? false,
      );
    }

    // Camera
    this.ui.inputs.cameraFov.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('cameraFov', value, 'angle');
      this.stateStore.set('camera.fov', value);
      this.eventBus.emit('camera:fov', value);
    });
    this.ui.inputs.cameraTilt?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      if (!Number.isFinite(value)) return;
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

    if (this.ui.inputs.cameraHandheld) {
      this.ui.inputs.cameraHandheld.forEach((radio) => {
        radio.addEventListener('change', (event) => {
          const value = event.target.value;
          this.stateStore.set('camera.handheld', value);
          this.eventBus.emit('camera:handheld', value);
        });
      });
    }

    const emitFisheye = () => this.eventBus.emit('camera:fisheye');
    if (this.ui.inputs.fisheyeEnabled) {
      this.ui.inputs.fisheyeEnabled.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        // Only toggle enabled — horiz FOV / strength / cylindrical stay in state so
        // turning fisheye off and on again restores the user's last lens settings.
        this.stateStore.set('fisheye.enabled', enabled);
        this.ui.setEffectControlsDisabled(
          ['fisheyeHorizontalFOV', 'fisheyeStrength', 'fisheyeCylindricalRatio'],
          !enabled,
        );
        if (this.ui.inputs.cameraFov) {
          this.ui.inputs.cameraFov.disabled = enabled;
        }
        emitFisheye();
      });
    }
    if (this.ui.inputs.fisheyeHorizontalFOV) {
      this.ui.inputs.fisheyeHorizontalFOV.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        this.helpers.updateValueLabel('fisheyeHorizontalFOV', value, 'angle');
        this.stateStore.set('fisheye.horizontalFOVDeg', value);
        emitFisheye();
      });
    }
    if (this.ui.inputs.fisheyeStrength) {
      this.ui.inputs.fisheyeStrength.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        this.helpers.updateValueLabel('fisheyeStrength', value, 'decimal');
        this.stateStore.set('fisheye.strength', value);
        emitFisheye();
      });
    }
    if (this.ui.inputs.fisheyeCylindricalRatio) {
      this.ui.inputs.fisheyeCylindricalRatio.addEventListener(
        'input',
        (event) => {
          const value = parseFloat(event.target.value);
          this.helpers.updateValueLabel(
            'fisheyeCylindricalRatio',
            value,
            'decimal',
          );
          this.stateStore.set('fisheye.cylindricalRatio', value);
          emitFisheye();
        },
      );
    }

    // Exposure
    this.ui.inputs.exposure.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const value = this.helpers.applySnapToCenter(event.target, 0, 2, 1.0);
      this.helpers.updateValueLabel('exposure', value, 'decimal');
      this.stateStore.set('exposure', value);
      this.eventBus.emit('scene:exposure', value);
    });
    this.helpers.enableSliderKeyboardStepping(this.ui.inputs.exposure);
    if (this.ui.inputs.autoExposure) {
      this.ui.inputs.autoExposure.addEventListener('change', (event) => {
        touchLookFilterCustom();
        const enabled = event.target.checked;
        this.stateStore.set('autoExposure', enabled);
        this.ui.setEffectControlsDisabled(['exposure'], enabled);
        this.eventBus.emit('camera:auto-exposure', enabled);
      });
    }

    // Color & Tone
    this.ui.inputs.cameraContrast?.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const value = this.helpers.applySnapToCenter(event.target, 0, 2, 1.0);
      this.stateStore.set('camera.contrast', value);
      this.helpers.updateValueLabel('cameraContrast', value, 'decimal');
      this.eventBus.emit('render:contrast', value);
    });
    if (this.ui.inputs.cameraContrast) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraContrast);

    this.ui.inputs.cameraTemperature?.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const parsed = this.helpers.applySnapToCenter(event.target, 2000, 10000, 6000);
      const kelvin = Number.isFinite(parsed) ? parsed : CAMERA_TEMPERATURE_NEUTRAL_K;
      this.stateStore.set('camera.temperature', kelvin);
      this.helpers.updateValueLabel('cameraTemperature', kelvin, 'kelvin');
      this.eventBus.emit('render:temperature', kelvin);
    });
    if (this.ui.inputs.cameraTemperature) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraTemperature);

    this.ui.inputs.cameraTint?.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const value = this.helpers.applySnapToCenter(event.target, -100, 100, 0) || 0;
      this.stateStore.set('camera.tint', value);
      this.helpers.updateValueLabel('cameraTint', value, 'integer');
      this.eventBus.emit('render:tint', value / 100);
    });
    if (this.ui.inputs.cameraTint) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraTint);

    this.ui.inputs.cameraHighlights?.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const value = this.helpers.applySnapToCenter(event.target, -100, 100, 0) || 0;
      this.stateStore.set('camera.highlights', value);
      this.helpers.updateValueLabel('cameraHighlights', value, 'integer');
      this.eventBus.emit('render:highlights', value / 100);
    });
    if (this.ui.inputs.cameraHighlights) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraHighlights);

    this.ui.inputs.cameraShadows?.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const value = this.helpers.applySnapToCenter(event.target, -50, 50, 0) || 0;
      this.stateStore.set('camera.shadows', value);
      this.helpers.updateValueLabel('cameraShadows', value, 'integer');
      this.eventBus.emit('render:shadows', value / 50);
    });
    if (this.ui.inputs.cameraShadows) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraShadows);

    this.ui.inputs.cameraSaturation?.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const value = this.helpers.applySnapToCenter(event.target, 0, 2, 1.0);
      this.stateStore.set('camera.saturation', value);
      this.helpers.updateValueLabel('cameraSaturation', value, 'decimal');
      this.eventBus.emit('render:saturation', value);
    });
    if (this.ui.inputs.cameraSaturation) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraSaturation);

    this.ui.inputs.cameraClarity?.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const value = this.helpers.applySnapToCenter(event.target, -100, 100, 0);
      this.stateStore.set('camera.clarity', value);
      this.helpers.updateValueLabel('cameraClarity', value, 'integer');
      this.eventBus.emit('render:clarity', value);
    });
    if (this.ui.inputs.cameraClarity) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraClarity);

    this.ui.inputs.cameraFade?.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const value = parseFloat(event.target.value) || 0;
      this.stateStore.set('camera.fade', value);
      this.helpers.updateValueLabel('cameraFade', value, 'integer');
      this.eventBus.emit('render:fade', value);
    });
    if (this.ui.inputs.cameraFade) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraFade);

    this.ui.inputs.cameraSharpness?.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const value = parseFloat(event.target.value) || 0;
      this.stateStore.set('camera.sharpness', value);
      this.helpers.updateValueLabel('cameraSharpness', value, 'integer');
      this.eventBus.emit('render:sharpness', value);
    });
    if (this.ui.inputs.cameraSharpness) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraSharpness);

    // Vignette
    const emitVignetteFromState = () => {
      const cam = this.stateStore.getState().camera ?? {};
      const defCam = this.stateStore.getDefaults().camera ?? {};
      this.eventBus.emit(
        'render:vignette',
        effectiveVignetteIntensity(cam, defCam),
      );
    };
    this.ui.inputs.toggleVignette?.addEventListener('change', (event) => {
      touchLookFilterCustom();
      const enabled = event.target.checked;
      this.stateStore.set('camera.vignetteEnabled', enabled);
      if (enabled) {
        const cur = Number(this.stateStore.getState().camera?.vignette ?? 0);
        if (cur === 0) {
          const defV = this.stateStore.getDefaults().camera?.vignette ?? 0.5;
          this.stateStore.set('camera.vignette', defV);
          if (this.ui.inputs.vignetteIntensity) {
            this.ui.inputs.vignetteIntensity.value = String(defV);
            this.helpers.updateValueLabel('vignetteIntensity', defV, 'decimal');
          }
        }
      }
      this.ui.setEffectControlsDisabled(
        ['vignetteIntensity', 'vignetteColor'],
        !enabled,
      );
      emitVignetteFromState();
    });
    this.ui.inputs.vignetteIntensity?.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const value = this.helpers.applySnapToCenter(event.target, 0, 1, 0);
      this.stateStore.set('camera.vignette', value);
      this.helpers.updateValueLabel('vignetteIntensity', value, 'decimal');
      emitVignetteFromState();
    });
    if (this.ui.inputs.vignetteIntensity) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.vignetteIntensity);

    this.ui.inputs.vignetteColor?.addEventListener('input', (event) => {
      touchLookFilterCustom();
      const value = event.target.value;
      this.stateStore.set('camera.vignetteColor', value);
      this.eventBus.emit('render:vignette-color', value);
    });

    if (this.ui.inputs.renderQuality) {
      this.ui.inputs.renderQuality.addEventListener('change', () => {
        const raw = this.ui.inputs.renderQuality.value;
        const value =
          raw === 'medium' || raw === 'low' || raw === 'max'
            ? raw
            : RENDER_QUALITY_DEFAULT;
        // Batch with look-filter touch: calling touchLookFilterCustom() before set() used to
        // notify subscribers while renderQuality was still the old tier, so syncControls reset
        // this <select> to Medium and Ultra didn't apply until a second change.
        this.stateStore.batch(() => {
          this.stateStore.set('renderQuality', value);
          if (this.stateStore.getState().lookFilterPreset !== 'custom') {
            this.stateStore.set('lookFilterPreset', 'custom');
          }
        });
        this.eventBus.emit('render:apply-performance');
      });
    }

    // Anti-aliasing & Tone Mapping
    this.ui.inputs.antiAliasing.addEventListener('change', (event) => {
      touchLookFilterCustom();
      const value = event.target.value;
      this.stateStore.set('antiAliasing', value);
      this.eventBus.emit('render:anti-aliasing', value);
    });
    this.ui.inputs.toneMapping.addEventListener('change', (event) => {
      touchLookFilterCustom();
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
    this.ui.buttons.exportSvg?.addEventListener('click', () => {
      this.eventBus.emit('export:svg');
    });
    if (this.ui.inputs.exportSvgColorDetail) {
      this.ui.inputs.exportSvgColorDetail.addEventListener('change', (event) => {
        const raw = event.target.value;
        const level =
          raw === 'low' || raw === 'medium' || raw === 'high' ? raw : 'high';
        this.stateStore.set('svgColorDetail', level);
      });
    }
    this.ui.buttons.exportSvgColor?.addEventListener('click', () => {
      const raw = this.ui.inputs.exportSvgColorDetail?.value;
      const level =
        raw === 'low' || raw === 'medium' || raw === 'high' ? raw : 'high';
      this.stateStore.set('svgColorDetail', level);
      this.eventBus.emit('export:svg-color', { detail: level });
    });
    this.ui.buttons.exportSvgGlb?.addEventListener('click', () => {
      this.eventBus.emit('export:svg-glb');
    });
    this.ui.buttons.exportVideo?.addEventListener('click', () => {
      this.eventBus.emit('export:video', { ...(this.ui.exportSettings.video || {}) });
    });

    if (this.ui.inputs.lookFilterPresetsOpen) {
      const updateLookFilterGrid = (open) => {
        const container = document.querySelector('#lookFilterPresetsContainer');
        if (container) {
          container.classList.toggle(
            'look-filter-presets-container--collapsed',
            !open,
          );
          container.classList.toggle('look-filter-presets-container--expanded', open);
        }
      };
      this.ui.inputs.lookFilterPresetsOpen.addEventListener('change', (event) => {
        const open = event.target.checked;
        this.stateStore.set('lookFilterPresetsOpen', open);
        updateLookFilterGrid(open);
      });
      updateLookFilterGrid(
        this.stateStore.getState().lookFilterPresetsOpen ?? false,
      );
    }
    document.querySelectorAll('.look-filter-tile').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-look-filter');
        if (!id) return;
        const current = this.stateStore.getState().lookFilterPreset ?? 'none';
        if (id !== current) this.ui.uiSounds?.playSelect();
        this.eventBus.emit('render:look-filter', id);
      });
    });

    const setColorCheckerControlsDisabled = (muted) => {
      this.ui.setEffectControlsDisabled(
        [
          'colorCheckerDistance',
          'colorCheckerRotate',
          'colorCheckerHeight',
          'colorCheckerScale',
          'colorCheckerRawToggle',
        ],
        muted,
      );
    };

    if (this.ui.inputs.colorCheckerEnabled) {
      this.ui.inputs.colorCheckerEnabled.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        this.stateStore.set('colorChecker.enabled', enabled);
        setColorCheckerControlsDisabled(!enabled);
        this.eventBus.emit('scene:color-checker');
      });
    }
    if (this.ui.inputs.colorCheckerDistance) {
      this.ui.inputs.colorCheckerDistance.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        this.stateStore.set('colorChecker.distance', value);
        this.helpers.updateValueLabel('colorCheckerDistance', value, 'distance');
        this.eventBus.emit('scene:color-checker');
      });
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.colorCheckerDistance);
    }
    if (this.ui.inputs.colorCheckerRotate) {
      this.ui.inputs.colorCheckerRotate.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        this.stateStore.set('colorChecker.rotate', value);
        this.helpers.updateValueLabel('colorCheckerRotate', value, 'angle');
        this.eventBus.emit('scene:color-checker');
      });
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.colorCheckerRotate);
    }
    if (this.ui.inputs.colorCheckerHeight) {
      this.ui.inputs.colorCheckerHeight.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        this.stateStore.set('colorChecker.height', value);
        this.helpers.updateValueLabel('colorCheckerHeight', value, 'distance');
        this.eventBus.emit('scene:color-checker');
      });
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.colorCheckerHeight);
    }
    if (this.ui.inputs.colorCheckerScale) {
      this.ui.inputs.colorCheckerScale.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        this.stateStore.set('colorChecker.scale', value);
        this.helpers.updateValueLabel('colorCheckerScale', value, 'multiplier');
        this.eventBus.emit('scene:color-checker');
      });
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.colorCheckerScale);
    }
    if (this.ui.inputs.colorCheckerRawToggle) {
      this.ui.inputs.colorCheckerRawToggle.addEventListener('click', () => {
        const next = !this.stateStore.getState().colorChecker?.rawColors;
        this.stateStore.set('colorChecker.rawColors', next);
        this._syncColorCheckerRawToggleUi(next);
        this.eventBus.emit('scene:color-checker-reference-shading');
        this.eventBus.emit('scene:color-checker');
      });
    }

    this.toneCurveController = new ToneCurveController(
      this.eventBus,
      this.stateStore,
    );
    this.toneCurveController.bind();
  }

  sync(state) {
    // DOF
    const dofFocus = Math.max(DOF_FOCUS_MIN_M, state.dof.focus ?? DOF_FOCUS_MIN_M);
    if (dofFocus !== state.dof.focus) {
      this.stateStore.set('dof.focus', dofFocus);
    }
    this.ui.inputs.dofFocus.value = dofFocus;
    this.helpers.updateValueLabel('dofFocus', dofFocus, 'distance');
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
    if (this.ui.inputs.bloomQuality) {
      const quality = state.bloom.quality;
      this.ui.inputs.bloomQuality.value =
        quality === 'low' || quality === 'high' || quality === 'ultra'
          ? quality
          : 'medium';
    }
    this.ui.inputs.toggleBloom.checked = !!state.bloom.enabled;
    this.ui.setEffectControlsDisabled(
      [
        'bloomThreshold',
        'bloomStrength',
        'bloomRadius',
        'bloomColor',
        'bloomQuality',
      ],
      !state.bloom.enabled,
    );

    const abDef = this.stateStore.getDefaults().lensFlare?.anamorphicBloom ?? {};
    const ab = { ...abDef, ...(state.lensFlare?.anamorphicBloom ?? {}) };
    if (this.ui.inputs.anamorphicBloomEnabled) {
      this.ui.inputs.anamorphicBloomEnabled.checked = !!ab.enabled;
    }
    if (this.ui.inputs.anamorphicBloomStrength) {
      this.ui.inputs.anamorphicBloomStrength.value = ab.strength ?? 1;
      this.helpers.updateValueLabel('anamorphicBloomStrength', ab.strength ?? 1, 'decimal');
    }
    if (this.ui.inputs.anamorphicBloomSpread) {
      this.ui.inputs.anamorphicBloomSpread.value = ab.spread ?? 0.2;
      this.helpers.updateValueLabel('anamorphicBloomSpread', ab.spread ?? 0.2, 'decimal');
    }
    if (this.ui.inputs.anamorphicBloomThreshold) {
      this.ui.inputs.anamorphicBloomThreshold.value = ab.threshold ?? 0.7;
      this.helpers.updateValueLabel('anamorphicBloomThreshold', ab.threshold ?? 0.7, 'decimal');
    }
    if (this.ui.inputs.anamorphicBloomSoften) {
      this.ui.inputs.anamorphicBloomSoften.value = ab.soften ?? 0.12;
      this.helpers.updateValueLabel('anamorphicBloomSoften', ab.soften ?? 0.12, 'decimal');
    }
    if (this.ui.inputs.anamorphicBloomStreakTint && ab.streakTint) {
      this.ui.inputs.anamorphicBloomStreakTint.value = ab.streakTint;
    }
    if (this.ui.inputs.anamorphicBloomQuality) {
      const qid = ab.quality ?? 'medium';
      this.ui.inputs.anamorphicBloomQuality.value =
        qid === 'low' || qid === 'high' || qid === 'ultra' ? qid : 'medium';
    }
    this._syncAnamorphicBloomControlsDisabled(state);

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
    this.ui.inputs.aberrationAmount.value = state.aberration.amount;
    this.helpers.updateValueLabel('aberrationAmount', state.aberration.amount, 'decimal', 4);
    this.ui.inputs.toggleAberration.checked = !!state.aberration.enabled;
    this.ui.setEffectControlsDisabled(
      ['aberrationAmount'],
      !state.aberration.enabled,
    );

    const aoRaw = state.ambientOcclusion ?? {
      enabled: false,
      intensity: 5,
      radius: 5,
      quality: 'medium',
      color: '#000000',
    };
    const ao = sanitizeAmbientOcclusion(aoRaw) ?? aoRaw;
    if (this.ui.inputs.toggleAmbientOcclusion) {
      this.ui.inputs.toggleAmbientOcclusion.checked = !!ao.enabled;
    }
    if (this.ui.inputs.ambientOcclusionIntensity) {
      this.ui.inputs.ambientOcclusionIntensity.value = ao.intensity;
      this.helpers.updateValueLabel('ambientOcclusionIntensity', ao.intensity, 'decimal');
    }
    if (this.ui.inputs.ambientOcclusionRadius) {
      this.ui.inputs.ambientOcclusionRadius.value = ao.radius;
      this.helpers.updateValueLabel('ambientOcclusionRadius', ao.radius, 'decimal');
    }
    if (this.ui.inputs.ambientOcclusionColor && ao.color) {
      this.ui.inputs.ambientOcclusionColor.value = ao.color;
    }
    if (this.ui.inputs.ambientOcclusionQuality) {
      const qVal = ao.quality === 'low' || ao.quality === 'medium' ? ao.quality : 'max';
      this.ui.inputs.ambientOcclusionQuality.value = qVal;
    }
    const aoMuted = !ao.enabled;
    this.ui.setEffectControlsDisabled(
      [
        'ambientOcclusionIntensity',
        'ambientOcclusionRadius',
        'ambientOcclusionColor',
        'ambientOcclusionQuality',
      ],
      aoMuted,
    );

    // Fresnel (synced here but bound in MeshControls)
    if (this.ui.inputs.toggleFresnel) {
      this.ui.inputs.toggleFresnel.checked = !!state.fresnel.enabled;
    }
    if (this.ui.inputs.fresnelColor) {
      // Only update if user is not actively interacting
      const isInteracting = this.ui.meshControls?.fresnelInteracting?.color || 
                           document.activeElement === this.ui.inputs.fresnelColor;
      if (!isInteracting) {
        this.ui.inputs.fresnelColor.value = state.fresnel.color;
      }
    }
    if (this.ui.inputs.fresnelRadius) {
      // Only update if user is not actively interacting
      const isInteracting = this.ui.meshControls?.fresnelInteracting?.radius || 
                           document.activeElement === this.ui.inputs.fresnelRadius;
      if (!isInteracting) {
        this.ui.inputs.fresnelRadius.value = state.fresnel.radius;
        this.helpers.updateValueLabel('fresnelRadius', state.fresnel.radius, 'decimal');
      }
    }
    if (this.ui.inputs.fresnelStrength) {
      // Only update if user is not actively interacting
      const isInteracting = this.ui.meshControls?.fresnelInteracting?.strength || 
                           document.activeElement === this.ui.inputs.fresnelStrength;
      if (!isInteracting) {
        this.ui.inputs.fresnelStrength.value = state.fresnel.strength;
        this.helpers.updateValueLabel('fresnelStrength', state.fresnel.strength, 'decimal');
      }
    }
    this.ui.setEffectControlsDisabled(['fresnelColor', 'fresnelRadius', 'fresnelStrength'], !state.fresnel.enabled);
    
    // Camera & Exposure
    const cam = state.camera ?? {};
    const defCam = this.stateStore.getDefaults().camera ?? {};
    const fe = state.fisheye ?? {};
    const feOn = !!fe.enabled;
    if (this.ui.inputs.cameraFov) {
      this.ui.inputs.cameraFov.disabled = feOn;
    }
    this.ui.inputs.cameraFov.value = cam.fov ?? 50;
    this.helpers.updateValueLabel('cameraFov', cam.fov ?? 50, 'angle');
    if (this.ui.inputs.fisheyeEnabled) {
      this.ui.inputs.fisheyeEnabled.checked = feOn;
    }
    if (this.ui.inputs.fisheyeHorizontalFOV) {
      const h = fe.horizontalFOVDeg ?? 131;
      this.ui.inputs.fisheyeHorizontalFOV.value = h;
      this.helpers.updateValueLabel('fisheyeHorizontalFOV', h, 'angle');
    }
    if (this.ui.inputs.fisheyeStrength) {
      const s = fe.strength ?? 0.37;
      this.ui.inputs.fisheyeStrength.value = s;
      this.helpers.updateValueLabel('fisheyeStrength', s, 'decimal');
    }
    if (this.ui.inputs.fisheyeCylindricalRatio) {
      const c = fe.cylindricalRatio ?? 4;
      this.ui.inputs.fisheyeCylindricalRatio.value = c;
      this.helpers.updateValueLabel('fisheyeCylindricalRatio', c, 'decimal');
    }
    this.ui.setEffectControlsDisabled(
      ['fisheyeHorizontalFOV', 'fisheyeStrength', 'fisheyeCylindricalRatio'],
      !feOn,
    );
    if (this.ui.inputs.cameraTilt) {
      const tilt = cam.tilt ?? 0;
      this.ui.inputs.cameraTilt.value = tilt;
      this.helpers.updateValueLabel('cameraTilt', tilt, 'angle');
    }
    // Sync camera auto-orbit
    if (this.ui.inputs.cameraAutoOrbit) {
      const autoOrbitValue = cam.autoOrbit ?? 'off';
      this.ui.inputs.cameraAutoOrbit.forEach((radio) => {
        radio.checked = radio.value === autoOrbitValue;
      });
    }
    if (this.ui.inputs.cameraHandheld) {
      let handheldValue = cam.handheld ?? 'off';
      if (handheldValue === 'medium') handheldValue = 'high';
      this.ui.inputs.cameraHandheld.forEach((radio) => {
        radio.checked = radio.value === handheldValue;
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
    if (this.ui.inputs.toggleVignette) {
      this.ui.inputs.toggleVignette.checked = isVignetteUiEnabled(cam);
    }
    if (this.ui.inputs.vignetteIntensity) {
      const vignette = cam.vignette ?? defCam.vignette ?? 0.5;
      this.ui.inputs.vignetteIntensity.value = vignette;
      this.helpers.updateValueLabel('vignetteIntensity', vignette, 'decimal');
    }
    if (this.ui.inputs.vignetteColor) {
      const vignetteColor = cam.vignetteColor ?? '#000000';
      this.ui.inputs.vignetteColor.value = vignetteColor;
    }
    const vignetteOn = isVignetteUiEnabled(cam);
    this.ui.setEffectControlsDisabled(
      ['vignetteIntensity', 'vignetteColor'],
      !vignetteOn,
    );
    if (this.ui.inputs.histogramEnabled) {
      const enabled = state.histogramEnabled ?? false;
      this.ui.inputs.histogramEnabled.checked = enabled;
      const container = document.querySelector('#histogramContainer');
      if (container) {
        container.classList.toggle('histogram-container--collapsed', !enabled);
        container.classList.toggle('histogram-container--expanded', enabled);
      }
    }
    if (this.ui.inputs.compositionGridEnabled) {
      const gridOn = !!(state.camera?.compositionGridEnabled);
      this.ui.inputs.compositionGridEnabled.checked = gridOn;
      this.eventBus.emit('camera:composition-grid', gridOn);
    }
    if (this.ui.inputs.toneCurveOpen) {
      const open = state.toneCurveOpen ?? false;
      this.ui.inputs.toneCurveOpen.checked = open;
      const tcc = document.querySelector('#toneCurveContainer');
      if (tcc) {
        tcc.classList.toggle('tone-curve-foldout--collapsed', !open);
        tcc.classList.toggle('tone-curve-foldout--expanded', open);
      }
    }
    if (this.ui.inputs.antiAliasing) {
      const aa = getAntiAliasingUiState(
        state.renderQuality,
        state.antiAliasing,
      );
      this.ui.inputs.antiAliasing.value = aa.value;
      this.ui.inputs.antiAliasing.disabled = aa.disabled;
      this.ui.inputs.antiAliasing.classList.toggle('is-disabled-handle', aa.disabled);
    }
    if (this.ui.inputs.renderQuality) {
      this.ui.inputs.renderQuality.value =
        state.renderQuality ?? RENDER_QUALITY_DEFAULT;
    }
    if (this.ui.inputs.toneMapping) {
      this.ui.inputs.toneMapping.value = state.toneMapping ?? 'aces-filmic';
    }
    if (this.ui.inputs.exportSvgColorDetail) {
      this.ui.inputs.exportSvgColorDetail.value =
        state.svgColorDetail === 'low' || state.svgColorDetail === 'medium' || state.svgColorDetail === 'high'
          ? state.svgColorDetail
          : 'high';
    }
    if (this.ui.inputs.lookFilterPresetsOpen) {
      const open = state.lookFilterPresetsOpen ?? false;
      this.ui.inputs.lookFilterPresetsOpen.checked = open;
      const lookContainer = document.querySelector('#lookFilterPresetsContainer');
      if (lookContainer) {
        lookContainer.classList.toggle(
          'look-filter-presets-container--collapsed',
          !open,
        );
        lookContainer.classList.toggle('look-filter-presets-container--expanded', open);
      }
    }
    const lookId = state.lookFilterPreset ?? 'none';
    document.querySelectorAll('.look-filter-tile').forEach((el) => {
      const id = el.getAttribute('data-look-filter');
      const sel = id === lookId;
      el.classList.toggle('is-selected', sel);
      if (el instanceof HTMLButtonElement) {
        el.setAttribute('aria-pressed', sel ? 'true' : 'false');
      }
    });

    const ccDefaults = this.stateStore.getDefaults().colorChecker;
    const cc = {
      ...ccDefaults,
      ...(state.colorChecker && typeof state.colorChecker === 'object' ? state.colorChecker : {}),
    };
    if (cc.rotation != null && cc.rotate === undefined) {
      cc.rotate = cc.rotation;
    }
    if (this.ui.inputs.colorCheckerEnabled) {
      this.ui.inputs.colorCheckerEnabled.checked = !!cc.enabled;
    }
    if (this.ui.inputs.colorCheckerDistance) {
      const d = cc.distance ?? ccDefaults.distance;
      this.ui.inputs.colorCheckerDistance.value = d;
      this.helpers.updateValueLabel('colorCheckerDistance', d, 'distance');
    }
    if (this.ui.inputs.colorCheckerRotate) {
      const r = cc.rotate ?? ccDefaults.rotate ?? 0;
      this.ui.inputs.colorCheckerRotate.value = r;
      this.helpers.updateValueLabel('colorCheckerRotate', r, 'angle');
    }
    if (this.ui.inputs.colorCheckerHeight) {
      const y = cc.height ?? ccDefaults.height ?? 0;
      this.ui.inputs.colorCheckerHeight.value = y;
      this.helpers.updateValueLabel('colorCheckerHeight', y, 'distance');
    }
    if (this.ui.inputs.colorCheckerScale) {
      const sc = cc.scale ?? ccDefaults.scale ?? 1;
      this.ui.inputs.colorCheckerScale.value = sc;
      this.helpers.updateValueLabel('colorCheckerScale', sc, 'multiplier');
    }
    this._syncColorCheckerRawToggleUi(!!cc.rawColors);
    this.ui.setEffectControlsDisabled(
      [
        'colorCheckerDistance',
        'colorCheckerRotate',
        'colorCheckerHeight',
        'colorCheckerScale',
        'colorCheckerRawToggle',
      ],
      !cc.enabled,
    );

    this.toneCurveController?.syncFromState(state);
  }
}

