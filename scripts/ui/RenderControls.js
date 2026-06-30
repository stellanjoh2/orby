/**
 * RenderControls - Handles all render/post-processing-related UI controls
 * Manages DOF, bloom, grain, aberration, camera, exposure, and export
 */
import {
  CAMERA_TEMPERATURE_NEUTRAL_K,
  DOF_FOCUS_MIN_M,
  DOF_UI_CONTROL_IDS,
  clampCameraShadowsUi,
  effectiveVignetteIntensity,
  getAntiAliasingUiState,
  isAnamorphicBloomPipelineActive,
  isBloomTuningActive,
  isVignetteUiEnabled,
  ANAMORPHIC_BLOOM_SPREAD_MAX,
  foldAnamorphicStreakAngleDeg,
  grainIntensityStoredToUi,
  grainIntensityUiToStored,
  GRAIN_SCALE_DEFAULT,
  normalizeAnamorphicBloomQualityId,
  normalizeDofFocusMode,
  normalizeDofQualityId,
  RENDER_QUALITY_DEFAULT,
  sanitizeAmbientOcclusion,
} from '../constants.js';
import { ToneCurveController } from './ToneCurveController.js';
import {
  DEFAULT_CAMERA_POSITION,
  defaultCameraDistance,
} from '../camera/cameraDefaults.js';
import {
  RENDER_LOOK_FILTER_MANIFEST,
  RENDER_PLAIN_MANIFEST,
} from '../state/uiRenderControlManifest.js';
import { normalizeAberrationQualityId } from '../render/chromaticAberration.js';

const ANAMORPHIC_BLOOM_INPUT_KEYS = [
  'anamorphicBloomEnabled',
  'anamorphicBloomStrength',
  'anamorphicBloomSpread',
  'anamorphicBloomStreakAngle',
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
    /** Look-filter thumbs use data-src until the presets fold-out opens once. */
    this._lookFilterThumbsHydrated = false;
  }

  syncDofUiState(dof) {
    this._syncDofControlStates?.(dof);
  }

  /** Anamorphic Bloom: toggle follows bloom pipeline; sliders follow this toggle (like Lens Dirt). */
  _syncAnamorphicBloomControlsDisabled(state) {
    const bloomOn = isAnamorphicBloomPipelineActive(state);
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

  /** PNG 1×/2× — always choosable; export resolution is decoupled from Medium/Low preview DPR. */
  _syncExportSizeControls() {
    document.querySelectorAll('[data-export-size]').forEach((btn) => {
      btn.disabled = false;
      btn.classList.remove('is-disabled');
    });
  }

  bind() {
    /** Batches primary control writes with look-filter preset so syncControls never runs between them (avoids first-click checkbox resets). */
    const commitLookFilterTouchWith = (fn) => {
      this.stateStore.batch(() => {
        fn();
        if (this.stateStore.getState().lookFilterPreset !== 'custom') {
          this.stateStore.set('lookFilterPreset', 'custom');
        }
      });
    };

    const emitVignetteFromState = () => {
      const cam = this.stateStore.getState().camera ?? {};
      const defCam = this.stateStore.getDefaults().camera ?? {};
      this.eventBus.emit(
        'render:vignette',
        effectiveVignetteIntensity(cam, defCam),
      );
    };

    this.helpers.bindLookFilterManifestControls(RENDER_LOOK_FILTER_MANIFEST, {
      commitLookFilterTouchWith,
      emitHooks: { vignetteEffective: emitVignetteFromState },
    });
    this.helpers.bindLookFilterManifestControls(RENDER_PLAIN_MANIFEST);

    // DOF
    const emitDof = () => this.eventBus.emit('render:dof', this.stateStore.getState().dof);
    this._syncDofControlStates = (dof) => {
      const enabled = !!dof?.enabled;
      this.ui.setEffectControlsDisabled(DOF_UI_CONTROL_IDS, !enabled);
      this.ui.setEffectControlsDisabled(['dofFocus'], !enabled);
    };
    this.eventBus.on('ui:dof-focus-changed', (focus) => {
      const value = Math.max(DOF_FOCUS_MIN_M, focus);
      if (this.ui.inputs.dofFocus) {
        this.ui.inputs.dofFocus.value = String(value);
      }
      this.helpers.updateValueLabel('dofFocus', value, 'distance');
    });
    this.eventBus.on('ui:dof-focus-mode-changed', (focusMode) => {
      const mode = normalizeDofFocusMode(focusMode);
      if (this.ui.inputs.dofFocusMode) {
        this.ui.inputs.dofFocusMode.value = mode;
      }
      this.stateStore.set('dof.focusMode', mode);
      this._syncDofControlStates(this.stateStore.getState().dof);
    });
    this.ui.inputs.toggleDof.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      commitLookFilterTouchWith(() => {
        this.stateStore.set('dof.enabled', enabled);
      });
      this._syncDofControlStates(this.stateStore.getState().dof);
      emitDof();
    });
    if (this.ui.inputs.dofFocusMode) {
      this.ui.inputs.dofFocusMode.addEventListener('change', (event) => {
        const focusMode = normalizeDofFocusMode(event.target.value);
        commitLookFilterTouchWith(() => {
          this.stateStore.set('dof.focusMode', focusMode);
        });
        this.eventBus.emit(
          'dof:reset-smooth-focus',
          this.stateStore.getState().dof.focus ?? DOF_FOCUS_MIN_M,
        );
        this._syncDofControlStates(this.stateStore.getState().dof);
        emitDof();
      });
    }
    this.ui.inputs.dofFocus.addEventListener('input', (event) => {
      const raw = parseFloat(event.target.value);
      const value = Math.max(DOF_FOCUS_MIN_M, raw);
      if (value !== raw) {
        event.target.value = String(value);
      }
      this.helpers.updateValueLabel('dofFocus', value, 'distance');
      commitLookFilterTouchWith(() => {
        this.stateStore.set('dof.focusMode', 'manual');
        this.stateStore.set('dof.focus', value);
        if (this.ui.inputs.dofFocusMode) {
          this.ui.inputs.dofFocusMode.value = 'manual';
        }
        this.eventBus.emit('dof:reset-smooth-focus', value);
      });
      this._syncDofControlStates(this.stateStore.getState().dof);
      emitDof();
    });
    if (this.ui.inputs.toggleDofFocusPlane) {
      this.ui.inputs.toggleDofFocusPlane.addEventListener('change', (event) => {
        this.stateStore.set('dof.showFocusPlane', event.target.checked);
        emitDof();
      });
    }
    if (this.ui.inputs.dofQuality) {
      this.ui.inputs.dofQuality.addEventListener('change', (event) => {
        const quality = normalizeDofQualityId(event.target.value);
        commitLookFilterTouchWith(() => {
          this.stateStore.set('dof.quality', quality);
        });
        emitDof();
      });
    }

    // Bloom
    const emitBloom = () => this.eventBus.emit('render:bloom', this.stateStore.getState().bloom);
    this.ui.inputs.toggleBloom.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      commitLookFilterTouchWith(() => {
        this.stateStore.set('bloom.enabled', enabled);
      });
      this.ui.setEffectControlsDisabled(
        [
          'bloomThreshold',
          'bloomStrength',
          'bloomRadius',
          'bloomColor',
          'bloomQuality',
        ],
        !isBloomTuningActive(this.stateStore.getState()),
      );
      emitBloom();
    });
    if (this.ui.inputs.bloomQuality) {
      this.ui.inputs.bloomQuality.addEventListener('change', (event) => {
        const raw = event.target.value;
        const quality =
          raw === 'low' || raw === 'high' || raw === 'ultra'
            ? raw
            : 'medium';
        commitLookFilterTouchWith(() => {
          this.stateStore.set('bloom.quality', quality);
        });
        emitBloom();
      });
    }

    const emitAnamorphicBloom = () => {
      this.eventBus.emit('studio:lens-flare-anamorphic-bloom');
    };
    if (this.ui.inputs.anamorphicBloomEnabled) {
      this.ui.inputs.anamorphicBloomEnabled.addEventListener('change', (event) => {
        const checked = event.target.checked;
        commitLookFilterTouchWith(() => {
          this.stateStore.set('lensFlare.anamorphicBloom.enabled', checked);
        });
        emitAnamorphicBloom();
      });
    }
    if (this.ui.inputs.anamorphicBloomQuality) {
      this.ui.inputs.anamorphicBloomQuality.addEventListener('change', (event) => {
        const q = normalizeAnamorphicBloomQualityId(event.target.value);
        commitLookFilterTouchWith(() => {
          this.stateStore.set('lensFlare.anamorphicBloom.quality', q);
          const spread = this.stateStore.getState().lensFlare?.anamorphicBloom?.spread ?? 0.2;
          const clamped = Math.min(ANAMORPHIC_BLOOM_SPREAD_MAX, Math.max(0, spread));
          if (clamped !== spread) {
            this.stateStore.set('lensFlare.anamorphicBloom.spread', clamped);
          }
        });
        const spreadAfter =
          this.stateStore.getState().lensFlare?.anamorphicBloom?.spread ?? 0.2;
        if (this.ui.inputs.anamorphicBloomSpread) {
          this.ui.inputs.anamorphicBloomSpread.value = spreadAfter;
          this.helpers.updateValueLabel('anamorphicBloomSpread', spreadAfter, 'decimal');
        }
        emitAnamorphicBloom();
      });
    }

    // Lens Dirt
    const emitLensDirt = () => this.eventBus.emit('render:lens-dirt', this.stateStore.getState().lensDirt);
    if (this.ui.inputs.lensDirtEnabled) {
      this.ui.inputs.lensDirtEnabled.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        commitLookFilterTouchWith(() => {
          this.stateStore.set('lensDirt.enabled', enabled);
        });
        this.ui.setEffectControlsDisabled(['lensDirtStrength', 'lensDirtTintColor'], !enabled);
        emitLensDirt();
      });
    }

    // Grain
    const emitGrain = () => this.eventBus.emit('render:grain', this.stateStore.getState().grain);
    this.ui.inputs.toggleGrain.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      commitLookFilterTouchWith(() => {
        this.stateStore.set('grain.enabled', enabled);
      });
      this.ui.setEffectControlsDisabled(['grainIntensity', 'grainScale'], !enabled);
      emitGrain();
    });
    this.ui.inputs.grainIntensity.addEventListener('input', (event) => {
      const uiValue = parseFloat(
        this.helpers.canonicalizeRangeInputValue(event.target).toFixed(2),
      );
      event.target.value = String(uiValue);
      const value = grainIntensityUiToStored(uiValue);
      this.helpers.updateValueLabel('grainIntensity', uiValue, 'decimal');
      commitLookFilterTouchWith(() => {
        this.stateStore.set('grain.intensity', value);
      });
      emitGrain();
    });
    this.ui.inputs.grainScale.addEventListener('input', (event) => {
      const uiValue = parseFloat(
        this.helpers.canonicalizeRangeInputValue(event.target).toFixed(2),
      );
      event.target.value = String(uiValue);
      this.helpers.updateValueLabel('grainScale', uiValue, 'multiplier');
      commitLookFilterTouchWith(() => {
        this.stateStore.set('grain.scale', uiValue);
      });
      emitGrain();
    });

    // Aberration
    const emitAberration = () => this.eventBus.emit('render:aberration', this.stateStore.getState().aberration);
    this.ui.inputs.toggleAberration.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      commitLookFilterTouchWith(() => {
        this.stateStore.set('aberration.enabled', enabled);
      });
      this.ui.setEffectControlsDisabled(
        ['aberrationAmount', 'aberrationBlur', 'aberrationFalloff', 'aberrationQuality'],
        !enabled,
      );
      emitAberration();
    });
    if (this.ui.inputs.aberrationQuality) {
      this.ui.inputs.aberrationQuality.addEventListener('change', (event) => {
        const quality = normalizeAberrationQualityId(event.target.value);
        commitLookFilterTouchWith(() => {
          this.stateStore.set('aberration.quality', quality);
        });
        emitAberration();
      });
    }

    const emitAmbientOcclusion = () =>
      this.eventBus.emit('render:ambient-occlusion', this.stateStore.getState().ambientOcclusion);
    if (this.ui.inputs.toggleAmbientOcclusion) {
      this.ui.inputs.toggleAmbientOcclusion.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        commitLookFilterTouchWith(() => {
          this.stateStore.set('ambientOcclusion.enabled', enabled);
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
    if (this.ui.inputs.ambientOcclusionQuality) {
      this.ui.inputs.ambientOcclusionQuality.addEventListener('change', (event) => {
        const value = event.target.value;
        const normalized =
          value === 'low' || value === 'medium' ? value : 'max';
        commitLookFilterTouchWith(() => {
          this.stateStore.set('ambientOcclusion.quality', normalized);
        });
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
        this.eventBus.emit('camera:composition-grid', {
          enabled,
          animate: true,
        });
        this.ui.setEffectControlsDisabled(['compositionGuidesColor'], !enabled);
        if (enabled) {
          this.eventBus.emit(
            'camera:composition-portrait-crop-guide',
            !!(this.stateStore.getState().camera?.compositionPortraitCropGuide),
          );
        }
      });
    }
    if (this.ui.inputs.compositionGuidesColor) {
      this.ui.inputs.compositionGuidesColor.addEventListener('change', (event) => {
        const inverted = event.target.value === 'dark';
        this.stateStore.set('camera.compositionGuidesInverted', inverted);
        this.eventBus.emit('camera:composition-guides-inverted', inverted);
      });
    }

    if (this.ui.inputs.cinematicLetterbox219) {
      this.ui.inputs.cinematicLetterbox219.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        this.stateStore.set('camera.cinematicLetterbox219', enabled);
        this.eventBus.emit('camera:cinematic-letterbox-219', {
          enabled,
          animate: true,
        });
      });
    }

    if (this.ui.inputs.toneCurveOpen) {
      const updateToneCurveFoldout = (open) => {
        const el = document.querySelector('#toneCurveContainer');
        if (el) {
          el.classList.toggle('tone-curve-foldout--collapsed', !open);
          el.classList.toggle('tone-curve-foldout--expanded', open);
        }
        this.toneCurveController?.setFoldoutOpen(!!open);
      };
      this.ui.inputs.toneCurveOpen.addEventListener('change', (event) => {
        const open = event.target.checked;
        this.stateStore.set('toneCurveOpen', open);
        updateToneCurveFoldout(open);
      });
    }

    // Camera (FOV + lens presets live in LensControls.js)
    const emitCameraWorldPosition = (position) => {
      if (this.stateStore.getState().camera?.isometric?.enabled) return;
      this.stateStore.set('camera.worldPosition', { ...position });
      this.eventBus.emit('camera:world-position', position);
    };

    this.ui.inputs.cameraPosX?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      if (!Number.isFinite(value)) return;
      this.helpers.updateValueLabel('cameraPosX', value, 'distance');
      const pos = {
        ...(this.stateStore.getState().camera?.worldPosition ?? DEFAULT_CAMERA_POSITION),
      };
      pos.x = value;
      emitCameraWorldPosition(pos);
    });
    if (this.ui.inputs.cameraPosX) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraPosX);
    }

    this.ui.inputs.cameraPosY?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      if (!Number.isFinite(value)) return;
      this.helpers.updateValueLabel('cameraPosY', value, 'distance');
      const pos = {
        ...(this.stateStore.getState().camera?.worldPosition ?? DEFAULT_CAMERA_POSITION),
      };
      pos.y = value;
      emitCameraWorldPosition(pos);
    });
    if (this.ui.inputs.cameraPosY) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraPosY);
    }

    this.ui.inputs.cameraPosZ?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      if (!Number.isFinite(value)) return;
      this.helpers.updateValueLabel('cameraPosZ', value, 'distance');
      const pos = {
        ...(this.stateStore.getState().camera?.worldPosition ?? DEFAULT_CAMERA_POSITION),
      };
      pos.z = value;
      emitCameraWorldPosition(pos);
    });
    if (this.ui.inputs.cameraPosZ) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraPosZ);
    }

    this.ui.inputs.cameraDistance?.addEventListener('input', (event) => {
      if (this.stateStore.getState().camera?.isometric?.enabled) return;
      const value = parseFloat(event.target.value);
      if (!Number.isFinite(value)) return;
      this.helpers.updateValueLabel('cameraDistance', value, 'distance');
      this.stateStore.set('camera.distance', value);
      this.eventBus.emit('camera:distance', value);
    });
    if (this.ui.inputs.cameraDistance) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraDistance);
    }
    
    // Camera Auto-Orbit
    this.ui.inputs.cameraAutoOrbit.forEach((radio) => {
      radio.addEventListener('change', (event) => {
        if (this.stateStore.getState().camera?.isometric?.enabled) {
          event.target.checked = event.target.value === 'off';
          return;
        }
        const value = event.target.value;
        this.stateStore.set('camera.autoOrbit', value);
        this.eventBus.emit('camera:auto-orbit', value);
      });
    });

    if (this.ui.inputs.cameraHandheld) {
      this.ui.inputs.cameraHandheld.forEach((radio) => {
        radio.addEventListener('change', (event) => {
          if (this.stateStore.getState().camera?.isometric?.enabled) {
            event.target.checked = event.target.value === 'off';
            return;
          }
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
        this.ui.lensControls?.setFovDisabled(enabled);
        emitFisheye();
      });
    }

    if (this.ui.inputs.autoExposure) {
      this.ui.inputs.autoExposure.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        commitLookFilterTouchWith(() => {
          this.stateStore.set('autoExposure', enabled);
        });
        this.ui.setEffectControlsDisabled(['exposure'], enabled);
        this.eventBus.emit('camera:auto-exposure', enabled);
      });
    }

    const emitClipPlanes = (options = {}) =>
      this.eventBus.emit('camera:clip-planes', options);
    if (this.ui.inputs.manualClipPlanes) {
      this.ui.inputs.manualClipPlanes.addEventListener('change', (event) => {
        const manual = event.target.checked;
        this.stateStore.set('camera.clipPlanes.manual', manual);
        this.ui.setClipPlanesFoldoutOpen(manual);
        if (manual) {
          const near = parseFloat(this.ui.inputs.cameraClipNear?.value);
          const far = parseFloat(this.ui.inputs.cameraClipFar?.value);
          if (Number.isFinite(near)) this.stateStore.set('camera.clipPlanes.near', near);
          if (Number.isFinite(far)) this.stateStore.set('camera.clipPlanes.far', far);
          emitClipPlanes();
        } else {
          emitClipPlanes({ restoreDefaults: true });
        }
      });
    }
    if (this.ui.inputs.cameraClipNear) {
      this.ui.inputs.cameraClipNear.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        if (!Number.isFinite(value)) return;
        this.helpers.updateValueLabel('cameraClipNear', value, 'decimal', 2);
        if (!this.stateStore.getState().camera?.clipPlanes?.manual) return;
        this.stateStore.set('camera.clipPlanes.near', value);
        emitClipPlanes();
      });
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraClipNear);
    }
    if (this.ui.inputs.cameraClipFar) {
      this.ui.inputs.cameraClipFar.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        if (!Number.isFinite(value)) return;
        this.helpers.updateValueLabel('cameraClipFar', value, 'decimal', 1);
        if (!this.stateStore.getState().camera?.clipPlanes?.manual) return;
        this.stateStore.set('camera.clipPlanes.far', value);
        emitClipPlanes();
      });
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.cameraClipFar);
    }

    // Color & Tone — sliders bound via RENDER_LOOK_FILTER_MANIFEST

    // Vignette
    this.ui.inputs.toggleVignette?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      commitLookFilterTouchWith(() => {
        this.stateStore.set('camera.vignetteEnabled', enabled);
        if (enabled) {
          const cur = Number(this.stateStore.getState().camera?.vignette ?? 0);
          if (cur === 0) {
            const defV = this.stateStore.getDefaults().camera?.vignette ?? 0.5;
            this.stateStore.set('camera.vignette', defV);
          }
        }
      });
      this.ui.setEffectControlsDisabled(
        ['vignetteIntensity', 'vignetteColor'],
        !enabled,
      );
      emitVignetteFromState();
    });

    if (this.ui.inputs.renderQuality) {
      this.ui.inputs.renderQuality.addEventListener('change', () => {
        const raw = this.ui.inputs.renderQuality.value;
        const value =
          raw === 'medium' || raw === 'low' || raw === 'max'
            ? raw
            : RENDER_QUALITY_DEFAULT;
        commitLookFilterTouchWith(() => {
          this.stateStore.set('renderQuality', value);
        });
        this.eventBus.emit('render:apply-performance');
        this._syncExportSizeControls();
      });
    }

    // Anti-aliasing & Tone Mapping
    this.ui.inputs.antiAliasing.addEventListener('change', (event) => {
      const value = event.target.value;
      commitLookFilterTouchWith(() => {
        this.stateStore.set('antiAliasing', value);
      });
      this.eventBus.emit('render:anti-aliasing', value);
    });
    this.ui.inputs.toneMapping.addEventListener('change', (event) => {
      const value = event.target.value;
      commitLookFilterTouchWith(() => {
        this.stateStore.set('toneMapping', value);
      });
      this.eventBus.emit('render:tone-mapping', value);
    });

    // Export
    this.ui.buttons.exportPng?.addEventListener('click', () => {
      this.eventBus.emit('export:png', {
        transparent: this.ui.exportSettings.transparent,
        transparentFraming: this.ui.exportSettings.transparentFraming,
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
      this.eventBus.emit('export:svg-color', {
        detail: level,
        transparent: this.ui.exportSettings.transparent,
      });
    });
    this.ui.buttons.exportSvgGlb?.addEventListener('click', () => {
      this.eventBus.emit('export:svg-glb');
    });
    this.ui.buttons.exportVideo?.addEventListener('click', () => {
      this.eventBus.emit('export:video', { ...(this.ui.exportSettings.video || {}) });
    });
    this.ui.buttons.exportVideoCapturePreview?.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      const scrub = this.ui.dom.exportPreviewScrub;
      const previewT = scrub ? parseFloat(scrub.value) : undefined;
      this.eventBus.emit('export:video-capture-preview', {
        download: false,
        showThumbnail: true,
        ...(Number.isFinite(previewT) ? { previewT } : {}),
        ...(this.ui.exportSettings.video || {}),
      });
    });
    this.ui.buttons.exportVideoCameraSave?.addEventListener('click', () => {
      this.eventBus.emit('export:video-camera-bookmark-save');
    });
    this.ui.buttons.exportVideoCameraRestore?.addEventListener('click', () => {
      this.eventBus.emit('export:video-camera-bookmark-restore');
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
        if (open) this.hydrateLookFilterThumbs();
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
    if (this.ui.inputs.toneCurveOpen) {
      const open = this.stateStore.getState().toneCurveOpen ?? false;
      const tcc = document.querySelector('#toneCurveContainer');
      if (tcc) {
        tcc.classList.toggle('tone-curve-foldout--collapsed', !open);
        tcc.classList.toggle('tone-curve-foldout--expanded', open);
      }
      this.toneCurveController.setFoldoutOpen(open);
    }
  }

  sync(state) {
    // DOF
    const dofFocus = Math.max(DOF_FOCUS_MIN_M, state.dof.focus ?? DOF_FOCUS_MIN_M);
    if (dofFocus !== state.dof.focus) {
      this.stateStore.set('dof.focus', dofFocus);
    }
    if (this.ui.inputs.dofFocusMode) {
      this.ui.inputs.dofFocusMode.value = normalizeDofFocusMode(state.dof?.focusMode);
    }
    this.ui.inputs.dofFocus.value = dofFocus;
    this.helpers.updateValueLabel('dofFocus', dofFocus, 'distance');
    if (this.ui.inputs.dofForegroundBlur) {
      this.ui.inputs.dofForegroundBlur.value = state.dof.foregroundBlur ?? 1;
      this.helpers.updateValueLabel(
        'dofForegroundBlur',
        state.dof.foregroundBlur ?? 1,
        'decimal',
        2,
      );
    }
    if (this.ui.inputs.dofBackgroundBlur) {
      this.ui.inputs.dofBackgroundBlur.value = state.dof.backgroundBlur ?? 1;
      this.helpers.updateValueLabel(
        'dofBackgroundBlur',
        state.dof.backgroundBlur ?? 1,
        'decimal',
        2,
      );
    }
    this.ui.inputs.dofAperture.value = state.dof.aperture;
    this.helpers.updateValueLabel('dofAperture', state.dof.aperture, 'fstop');
    if (this.ui.inputs.toggleDofZoomAttenuation) {
      this.ui.inputs.toggleDofZoomAttenuation.checked =
        state.dof.zoomAttenuation !== false;
    }
    if (this.ui.inputs.toggleDofFocusPlane) {
      this.ui.inputs.toggleDofFocusPlane.checked = !!state.dof?.showFocusPlane;
    }
    this.ui.inputs.toggleDof.checked = !!state.dof.enabled;
    if (this.ui.inputs.dofQuality) {
      const dq = normalizeDofQualityId(state.dof?.quality);
      this.ui.inputs.dofQuality.value = dq;
    }
    this._syncDofControlStates(state.dof);
    
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
      !isBloomTuningActive(state),
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
    if (this.ui.inputs.anamorphicBloomStreakAngle) {
      const ang = foldAnamorphicStreakAngleDeg(ab.streakAngle ?? 0);
      this.ui.inputs.anamorphicBloomStreakAngle.value = ang;
      this.helpers.updateValueLabel('anamorphicBloomStreakAngle', ang, 'angle');
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
    if (this.ui.inputs.lensDirtTintColor && state.lensDirt) {
      this.ui.inputs.lensDirtTintColor.value =
        state.lensDirt.tintColor ?? this.stateStore.getDefaults().lensDirt.tintColor;
    }
    if (this.ui.inputs.lensDirtEnabled) {
      const enabled = !!state.lensDirt?.enabled;
      this.ui.inputs.lensDirtEnabled.checked = enabled;
      this.ui.setEffectControlsDisabled(['lensDirtStrength', 'lensDirtTintColor'], !enabled);
    }

    // Auto Exposure
    if (this.ui.inputs.autoExposure) {
      const enabled = !!state.autoExposure;
      this.ui.inputs.autoExposure.checked = enabled;
      this.ui.setEffectControlsDisabled(['exposure'], enabled);
    }
    const clip = state.camera?.clipPlanes ?? this.stateStore.getDefaults().camera?.clipPlanes ?? {};
    if (this.ui.inputs.manualClipPlanes) {
      this.ui.inputs.manualClipPlanes.checked = !!clip.manual;
    }
    if (this.ui.inputs.cameraClipNear) {
      const near = clip.near ?? 0.1;
      this.ui.inputs.cameraClipNear.value = near;
      this.helpers.updateValueLabel('cameraClipNear', near, 'decimal', 2);
    }
    if (this.ui.inputs.cameraClipFar) {
      const far = clip.far ?? 100;
      this.ui.inputs.cameraClipFar.value = far;
      this.helpers.updateValueLabel('cameraClipFar', far, 'decimal', 1);
    }
    this.ui.setClipPlanesFoldoutOpen(!!clip.manual);

    // Grain
    const grainUi = parseFloat(grainIntensityStoredToUi(state.grain.intensity).toFixed(2));
    this.helpers.syncRangeFromState(this.ui.inputs.grainIntensity, grainUi);
    this.helpers.updateValueLabel('grainIntensity', grainUi, 'decimal');
    const grainScale = state.grain.scale ?? GRAIN_SCALE_DEFAULT;
    this.helpers.syncRangeFromState(this.ui.inputs.grainScale, grainScale);
    this.helpers.updateValueLabel('grainScale', grainScale, 'multiplier');
    this.ui.inputs.toggleGrain.checked = !!state.grain.enabled;
    this.ui.setEffectControlsDisabled(['grainIntensity', 'grainScale'], !state.grain.enabled);
    
    // Aberration
    this.ui.inputs.aberrationAmount.value = state.aberration.amount;
    this.helpers.updateValueLabel('aberrationAmount', state.aberration.amount, 'decimal', 4);
    if (this.ui.inputs.aberrationBlur) {
      this.ui.inputs.aberrationBlur.value = state.aberration.blur ?? 0;
      this.helpers.updateValueLabel('aberrationBlur', state.aberration.blur ?? 0, 'decimal', 2);
    }
    if (this.ui.inputs.aberrationFalloff) {
      this.ui.inputs.aberrationFalloff.value = state.aberration.falloff ?? 1;
      this.helpers.updateValueLabel('aberrationFalloff', state.aberration.falloff ?? 1, 'decimal', 2);
    }
    if (this.ui.inputs.aberrationQuality) {
      const q = normalizeAberrationQualityId(state.aberration.quality);
      this.ui.inputs.aberrationQuality.value = q;
    }
    this.ui.inputs.toggleAberration.checked = !!state.aberration.enabled;
    this.ui.setEffectControlsDisabled(
      ['aberrationAmount', 'aberrationBlur', 'aberrationFalloff', 'aberrationQuality'],
      !state.aberration.enabled,
    );

    const aoRaw = state.ambientOcclusion ?? {
      enabled: false,
      intensity: 3,
      radius: 1,
      quality: 'medium',
      color: '#080808',
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
    this.syncCameraWorldPose({
      position: cam.worldPosition ?? DEFAULT_CAMERA_POSITION,
      distance: cam.distance ?? defaultCameraDistance(),
    });
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
    const clipPlanes = cam.clipPlanes ?? defCam.clipPlanes ?? {};
    if (this.ui.inputs.manualClipPlanes) {
      this.ui.inputs.manualClipPlanes.checked = !!clipPlanes.manual;
    }
    if (this.ui.inputs.cameraClipNear) {
      const near = clipPlanes.near ?? 0.1;
      this.ui.inputs.cameraClipNear.value = near;
      this.helpers.updateValueLabel('cameraClipNear', near, 'decimal', 2);
    }
    if (this.ui.inputs.cameraClipFar) {
      const far = clipPlanes.far ?? 100;
      this.ui.inputs.cameraClipFar.value = far;
      this.helpers.updateValueLabel('cameraClipFar', far, 'decimal', 1);
    }
    this.ui.setClipPlanesFoldoutOpen(!!clipPlanes.manual);
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
      const shadows = clampCameraShadowsUi(state.camera?.shadows ?? 0);
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
      const vignetteColor = cam.vignetteColor ?? '#080808';
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
      // Do not emit `camera:composition-grid` here — same reason as letterbox (sync runs inside
      // the checkbox `change` handler before `{ animate: true }` is emitted).
      this.ui.setEffectControlsDisabled(['compositionGuidesColor'], !gridOn);
    }
    if (this.ui.inputs.compositionGuidesColor) {
      const inverted = !!(state.camera?.compositionGuidesInverted);
      this.ui.inputs.compositionGuidesColor.value = inverted ? 'dark' : 'light';
      this.eventBus.emit('camera:composition-guides-inverted', inverted);
    }
    if (this.ui.inputs.cinematicLetterbox219) {
      const lb = !!(state.camera?.cinematicLetterbox219);
      this.ui.inputs.cinematicLetterbox219.checked = lb;
      // Do not emit here: `stateStore.set` from the checkbox `change` handler runs
      // `syncControls` synchronously before that handler emits `{ animate: true }`. A boolean
      // payload is interpreted as `animate: false` and aborts the letterbox transition.
    }
    if (this.ui.inputs.toneCurveOpen) {
      const open = state.toneCurveOpen ?? false;
      this.ui.inputs.toneCurveOpen.checked = open;
      const tcc = document.querySelector('#toneCurveContainer');
      if (tcc) {
        tcc.classList.toggle('tone-curve-foldout--collapsed', !open);
        tcc.classList.toggle('tone-curve-foldout--expanded', open);
      }
      this.toneCurveController?.setFoldoutOpen(open);
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
      const toneMapping = state.toneMapping ?? 'aces-filmic';
      this.ui.inputs.toneMapping.value =
        toneMapping === 'linear' ? 'none' : toneMapping;
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
      if (open) this.hydrateLookFilterThumbs();
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
    this._syncExportSizeControls();
  }

  /** @deprecated Portrait 9∶16 composition toggle removed from UI. */
  syncCompositionAspectButtons(_portrait) {}

  syncCameraWorldPose(pose) {
    const position = pose?.position ?? DEFAULT_CAMERA_POSITION;
    const distance = pose?.distance ?? defaultCameraDistance();
    if (this.ui.inputs.cameraPosX) {
      this.ui.inputs.cameraPosX.value = position.x;
      this.helpers.updateValueLabel('cameraPosX', position.x, 'distance');
    }
    if (this.ui.inputs.cameraPosY) {
      this.ui.inputs.cameraPosY.value = position.y;
      this.helpers.updateValueLabel('cameraPosY', position.y, 'distance');
    }
    if (this.ui.inputs.cameraPosZ) {
      this.ui.inputs.cameraPosZ.value = position.z;
      this.helpers.updateValueLabel('cameraPosZ', position.z, 'distance');
    }
    if (this.ui.inputs.cameraDistance) {
      this.ui.inputs.cameraDistance.value = distance;
      this.helpers.updateValueLabel('cameraDistance', distance, 'distance');
    }
  }

  /**
   * Assign src from data-src on first presets open — skips decode/network while fold-out is collapsed.
   */
  hydrateLookFilterThumbs() {
    if (this._lookFilterThumbsHydrated) return;
    this._lookFilterThumbsHydrated = true;
    const container = document.querySelector('#lookFilterPresetsContainer');
    if (!container) return;
    container.querySelectorAll('.look-filter-tile__thumb[data-src]').forEach((img) => {
      if (img.getAttribute('src')) return;
      const url = img.dataset.src;
      if (!url) return;
      img.loading = 'lazy';
      img.fetchPriority = 'low';
      img.src = url;
    });
  }
}

