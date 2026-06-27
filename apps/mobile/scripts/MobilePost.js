import * as THREE from 'three';
import { N8AOPass } from 'n8ao';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { MeshglEffectComposer } from '../../../scripts/render/MeshglEffectComposer.js';
import { MeshglRenderPass } from '../../../scripts/render/MeshglRenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { GrainTintShader } from '../../../scripts/shaders/index.js';
import { BloomCompositeController } from '../../../scripts/render/BloomCompositeController.js';
import { mergeLookFilterState } from '../../../scripts/render/lookFilterPresets.js';
import {
  applyChromaticAberrationToPass,
  AberrationShader,
} from '../../../scripts/render/chromaticAberration.js';
import {
  AMBIENT_OCCLUSION_INTENSITY_MAX,
  AMBIENT_OCCLUSION_INTENSITY_MIN,
  ANAMORPHIC_BLOOM_QUALITY_DEFAULT,
  CAMERA_TEMPERATURE_MIN_K,
  CAMERA_TEMPERATURE_MAX_K,
  CAMERA_TEMPERATURE_NEUTRAL_K,
  cameraShadowsUiToShader,
  effectiveVignetteIntensity,
  resolveAmbientOcclusionQualityTier,
  resolveAnamorphicBloomQualityTier,
  sanitizeAmbientOcclusion,
} from '../../../scripts/constants.js';
import {
  MOBILE_AMBIENT_OCCLUSION_DEFAULTS,
  MOBILE_BLOOM_RESOLUTION_SCALE,
  mobileEffectiveGrainIntensity,
} from './mobileParityDefaults.js';
import { getNestedValue, setNestedValue } from './mobileFxControls.js';
import { MobileCreativeLookPost } from './MobileCreativeLookPost.js';
import { GradingController } from '../../../scripts/render/GradingController.js';
import { ComposerLifecycle } from '../../../scripts/scene/ComposerLifecycle.js';
import { MOBILE_FX_DEFAULTS } from './mobileFxDefaults.js';
/**
 * Mobile post stack — grading + bloom + grain + chromatic aberration.
 */
export class MobilePost {
  /** @param {THREE.WebGLRenderer} renderer @param {THREE.Scene} scene @param {THREE.Camera} camera @param {import('../../../scripts/render/BackgroundController.js').BackgroundController} backgroundController */
  constructor(renderer, scene, camera, backgroundController) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.backgroundController = backgroundController;
    this._grainTime = 0;
    /** @type {number} Composer output width in physical pixels — for mobile grain boost. */
    this._composerPixelWidth = 1;

    const size = new THREE.Vector2();
    renderer.getSize(size);
    const rw = Math.max(1, Math.floor(size.x));
    const rh = Math.max(1, Math.floor(size.y));
    this._composerPixelWidth = Math.max(1, Math.floor(rw * renderer.getPixelRatio()));

    // Default composer buffers (linear) — matches desktop; sRGB/HalfFloat RT crushed HDRI contrast.
    this.composer = new MeshglEffectComposer(renderer);
    this.renderPass = new MeshglRenderPass(scene, camera);
    this.renderPass.clearAlpha = 1;
    this.composer.addPass(this.renderPass);

    this.n8aoPass = new N8AOPass(scene, camera, rw, rh);
    this.n8aoPass.enabled = false;
    this._n8aoAppliedMode = 'Medium';
    this.n8aoPass.setQualityMode(this._n8aoAppliedMode);
    this.n8aoPass.configuration.gammaCorrection = false;
    this.composer.addPass(this.n8aoPass);

    this.creativeLooks = new MobileCreativeLookPost(renderer);
    this.creativeLooks.mount(this.composer);

    const bloomW = Math.max(1, Math.floor(rw * MOBILE_BLOOM_RESOLUTION_SCALE));
    const bloomH = Math.max(1, Math.floor(rh * MOBILE_BLOOM_RESOLUTION_SCALE));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(bloomW, bloomH), 0.2, 0.2, 1.0);
    this.bloomPass.enabled = false;
    this.composer.addPass(this.bloomPass);

    const abTier = resolveAnamorphicBloomQualityTier(ANAMORPHIC_BLOOM_QUALITY_DEFAULT);
    this.bloomCompositeController = new BloomCompositeController(renderer, abTier.sampleRadius);
    this.bloomCompositePass = this.bloomCompositeController.getPass();
    this.bloomCompositePass.enabled = false;
    this.composer.addPass(this.bloomCompositePass);

    this.filmPass = new FilmPass(0.0, 0.0, 648, false);
    this.filmPass.enabled = false;
    this.composer.addPass(this.filmPass);

    this.grainTintPass = new ShaderPass(GrainTintShader);
    this.grainTintPass.enabled = false;
    this.composer.addPass(this.grainTintPass);

    this.gradingController = new GradingController(renderer);
    this.gradingPass = this.gradingController.getPass();
    this.gradingPass.renderToScreen = false;
    this.gradingPass.enabled = true;
    this.uniforms = this.gradingController.uniforms;
    this.composer.addPass(this.gradingPass);

    this.aberrationPass = new ShaderPass(AberrationShader);
    this.aberrationPass.renderToScreen = false;
    this.composer.addPass(this.aberrationPass);

    /** @type {(() => void) | null} */
    this.beforeComposerRender = null;

    this.composerLifecycle = new ComposerLifecycle({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      composer: this.composer,
      postPipeline: this,
      backgroundController: this.backgroundController,
      syncPostProcessingForLogicalSize: (w, h) => this.setSize(w, h),
      beforeComposerRender: () => this.beforeComposerRender?.(),
    });

    this._fxState = this._cloneFxState(MOBILE_FX_DEFAULTS);
    this._lookFilterPreset = 'none';
    this._ambientOcclusion = { ...MOBILE_AMBIENT_OCCLUSION_DEFAULTS };
    /** @type {(() => object) | null} */
    this._creativeLookSettingsGetter = null;
    this.reset();
  }

  /** @param {object} src */
  _cloneFxState(src) {
    return {
      ...src,
      camera: { ...src.camera },
      bloom: { ...src.bloom },
      grain: { ...src.grain },
      aberration: { ...src.aberration },
      toneCurve: {
        ...src.toneCurve,
        p1: { ...src.toneCurve.p1 },
        p2: { ...src.toneCurve.p2 },
      },
    };
  }

  dispose() {
    this.creativeLooks?.dispose?.();
    this.composer?.dispose?.();
  }

  reset() {
    this._fxState = this._cloneFxState(
      mergeLookFilterState('none', MOBILE_FX_DEFAULTS, MOBILE_FX_DEFAULTS),
    );
    this._lookFilterPreset = 'none';
    this._ambientOcclusion = { ...MOBILE_AMBIENT_OCCLUSION_DEFAULTS };
    this._applyFxState(this._fxState);
    this._updateAmbientOcclusion(this._ambientOcclusion);
  }

  /** @param {number} dt */
  tick(dt) {
    this._grainTime += dt;
    if (this.grainTintPass?.uniforms?.time) {
      this.grainTintPass.uniforms.time.value = this._grainTime;
    }
  }

  setSize(w, h) {
    const pr = this.renderer.getPixelRatio();
    this._composerPixelWidth = Math.max(1, Math.floor(w * pr));
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.creativeLooks?.setSize(w, h);
    this.gradingController?.setResolution(w, h);
    const bloomW = Math.max(1, Math.floor(w * MOBILE_BLOOM_RESOLUTION_SCALE));
    const bloomH = Math.max(1, Math.floor(h * MOBILE_BLOOM_RESOLUTION_SCALE));
    if (this.bloomPass) {
      if (this.bloomPass.resolution) {
        this.bloomPass.resolution.set(bloomW, bloomH);
      }
      if (typeof this.bloomPass.setSize === 'function') {
        this.bloomPass.setSize(bloomW, bloomH);
      }
    }
    this.bloomCompositeController?.setResolution(w, h);
    if (this.aberrationPass?.uniforms?.aspectRatio) {
      this.aberrationPass.uniforms.aspectRatio.value = w / Math.max(1, h);
    }
    if (this._fxState?.grain) {
      this._updateGrain(this._fxState.grain);
    }
  }

  /**
   * @param {number} [creativeLookAnimTime]
   */
  render(creativeLookAnimTime = 0) {
    this.creativeLooks?.prepareRender(this, creativeLookAnimTime);
    this.composerLifecycle.renderComposerPass();
  }

  /** @param {() => object} getter */
  setCreativeLookSettingsGetter(getter) {
    this._creativeLookSettingsGetter = getter;
  }

  getCreativeLookSettings() {
    return this._creativeLookSettingsGetter?.() ?? {};
  }

  /** @param {string | null | undefined} presetId */
  syncCreativeLook(presetId) {
    this.creativeLooks?.sync(presetId, this.getCreativeLookSettings());
    if (!presetId || presetId === 'none' || presetId === 'standard') {
      this._applyFxState(this._fxState);
    }
  }

  /** @param {{ bloomTint?: string } | undefined} mood */
  applyHdriMood(mood) {
    if (!mood?.bloomTint) return;
    this._fxState.bloom = {
      ...this._fxState.bloom,
      enabled: true,
      color: mood.bloomTint,
    };
    this._applyFxState(this._fxState);
  }

  /** @param {string} presetId */
  applyLookFilter(presetId) {
    this._lookFilterPreset = presetId;
    this._fxState = mergeLookFilterState(
      presetId,
      MOBILE_FX_DEFAULTS,
      this._fxState,
    );
    this._applyFxState(this._fxState);
    return this.getFxSnapshot();
  }

  /**
   * @param {string} path dot path (e.g. `camera.contrast`, `bloom.strength`, `exposure`)
   * @param {number | boolean} value
   * @param {{ preservePreset?: boolean }} [opts]
   */
  setFxValue(path, value, { preservePreset = false } = {}) {
    setNestedValue(this._fxState, path, value);
    if (!preservePreset) {
      this._lookFilterPreset = 'none';
      this._fxState.lookFilterPreset = 'none';
    }
    this._applyFxState(this._fxState);
  }

  /**
   * @param {'exposure' | 'contrast' | 'saturation' | 'temperature'} key
   * @param {number} value
   */
  setGrade(key, value) {
    const pathMap = {
      exposure: 'exposure',
      contrast: 'camera.contrast',
      saturation: 'camera.saturation',
      temperature: 'camera.temperature',
    };
    const path = pathMap[key];
    if (path) this.setFxValue(path, value);
  }

  getFxSnapshot() {
    const cam = this._fxState.camera ?? {};
    return {
      lookFilterPreset: this._lookFilterPreset,
      exposure: this._fxState.exposure ?? 1,
      contrast: cam.contrast ?? 1,
      saturation: cam.saturation ?? 1,
      temperature: cam.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K,
      tint: cam.tint ?? 0,
      highlights: cam.highlights ?? 0,
      shadows: cam.shadows ?? 0,
      clarity: cam.clarity ?? 0,
      fade: cam.fade ?? 0,
      sharpness: cam.sharpness ?? 0,
      vignetteEnabled: cam.vignetteEnabled ?? false,
      vignette: cam.vignette ?? 0,
      grainEnabled: this._fxState.grain?.enabled ?? false,
      grainIntensity: this._fxState.grain?.intensity ?? 0,
      bloomEnabled: this._fxState.bloom?.enabled ?? false,
      bloomStrength: this._fxState.bloom?.strength ?? 0,
      aberrationEnabled: this._fxState.aberration?.enabled ?? false,
      aberrationAmount: this._fxState.aberration?.amount ?? 0,
      /** Full state for path-based UI sync. */
      state: this._cloneFxState(this._fxState),
    };
  }

  /** @deprecated use getFxSnapshot */
  getGradeSnapshot() {
    return this.getFxSnapshot();
  }

  /** @param {string} path */
  getFxValue(path) {
    return getNestedValue(this._fxState, path);
  }

  getAmbientOcclusion() {
    return { ...this._ambientOcclusion };
  }

  /** @param {boolean} enabled */
  setAmbientOcclusionEnabled(enabled) {
    const next = !!enabled;
    if (next === !!this._ambientOcclusion.enabled) return;
    this._ambientOcclusion = { ...this._ambientOcclusion, enabled: next };
    this._updateAmbientOcclusion(this._ambientOcclusion);
  }

  /** @param {object | undefined} settings */
  _updateAmbientOcclusion(settings) {
    const merged = {
      ...MOBILE_AMBIENT_OCCLUSION_DEFAULTS,
      ...(settings && typeof settings === 'object' ? settings : {}),
    };
    const ao = sanitizeAmbientOcclusion(merged) ?? merged;
    this._ambientOcclusion = { ...this._ambientOcclusion, ...ao };

    if (!this.n8aoPass || !this.renderPass) return;
    const active = !!ao.enabled;
    this.renderPass.enabled = !active;
    this.n8aoPass.enabled = active;
    if (!active) {
      this._syncRenderToScreen();
      return;
    }

    this.n8aoPass.configuration.gammaCorrection = false;

    const intensity =
      typeof ao.intensity === 'number' && !Number.isNaN(ao.intensity)
        ? ao.intensity
        : MOBILE_AMBIENT_OCCLUSION_DEFAULTS.intensity;
    const radius =
      typeof ao.radius === 'number' && !Number.isNaN(ao.radius)
        ? ao.radius
        : MOBILE_AMBIENT_OCCLUSION_DEFAULTS.radius;
    const aoQ = resolveAmbientOcclusionQualityTier(ao.quality);
    if (this._n8aoAppliedMode !== aoQ.n8aoMode) {
      this.n8aoPass.setQualityMode(aoQ.n8aoMode);
      this._n8aoAppliedMode = aoQ.n8aoMode;
    }

    this.n8aoPass.configuration.intensity = THREE.MathUtils.clamp(
      intensity,
      AMBIENT_OCCLUSION_INTENSITY_MIN,
      AMBIENT_OCCLUSION_INTENSITY_MAX,
    );
    this.n8aoPass.configuration.aoRadius = THREE.MathUtils.clamp(radius, 0.1, 25);
    const hex =
      typeof ao.color === 'string' && ao.color.trim().length > 0
        ? ao.color.trim()
        : MOBILE_AMBIENT_OCCLUSION_DEFAULTS.color;
    this.n8aoPass.configuration.color = new THREE.Color(hex);
    if (this.n8aoPass.configuration.halfRes !== aoQ.halfRes) {
      this.n8aoPass.configuration.halfRes = aoQ.halfRes;
    }

    this._syncRenderToScreen();
  }

  /** @param {object} state merged look-filter state */
  _applyFxState(state) {
    const cam = state.camera ?? {};
    const defaultsCam = MOBILE_FX_DEFAULTS.camera;

    this.gradingController.setExposure(state.exposure ?? 1);
    this.gradingController.setContrast(cam.contrast ?? 1);
    this.gradingController.setSaturation(cam.saturation ?? 1);
    this.gradingController.setTemperature(this._kelvinToShader(cam.temperature));
    this.gradingController.setTint((cam.tint ?? 0) / 100);
    this.gradingController.setHighlights((cam.highlights ?? 0) / 100);
    this.gradingController.setShadows(cameraShadowsUiToShader(cam.shadows ?? 0));
    this.gradingController.setClarity(cam.clarity ?? 0);
    this.gradingController.setFade(cam.fade ?? 0);
    this.gradingController.setSharpness(cam.sharpness ?? 0);
    this.gradingController.setToneCurve(state.toneCurve ?? MOBILE_FX_DEFAULTS.toneCurve);
    this.gradingController.setToneMapping(state.toneMapping ?? 'aces-filmic');
    this.gradingController.setVignette(effectiveVignetteIntensity(cam, defaultsCam));
    this.gradingController.setVignetteColor(cam.vignetteColor ?? '#080808');

    this._updateBloom(state.bloom);
    this._updateGrain(state.grain);
    applyChromaticAberrationToPass(this.aberrationPass, state.aberration);

    this._syncRenderToScreen();
  }

  /** @param {object | undefined} settings */
  _updateBloom(settings) {
    if (!this.bloomPass || !settings) return;
    const wants = settings.enabled === undefined ? true : Boolean(settings.enabled);
    const strength = Number(settings.strength ?? 0);
    const active = wants && strength > 0.0001;

    const thresh = Number(settings.threshold);
    if (Number.isFinite(thresh)) {
      this.bloomPass.threshold = THREE.MathUtils.clamp(thresh, 0, 1);
    }
    this.bloomPass.strength = Number.isFinite(strength) ? Math.max(0, strength) : 0.2;
    const rad = Number(settings.radius);
    if (Number.isFinite(rad)) {
      this.bloomPass.radius = THREE.MathUtils.clamp(rad, 0, 1);
    }
    this.bloomPass.enabled = active;

    if (this.bloomCompositeController) {
      if (!active) {
        this.bloomCompositeController.setBloomTint(false);
      } else {
        this.bloomCompositeController.setBloomTint(true, settings);
      }
    }
  }

  /** @param {object | undefined} settings */
  _updateGrain(settings) {
    if (!settings) return;
    const wants = settings.enabled === undefined ? true : Boolean(settings.enabled);
    const intensity = wants ? (settings.intensity || 0) : 0;
    const active = intensity > 0.0001;
    const effectiveIntensity = mobileEffectiveGrainIntensity(
      intensity,
      this._composerPixelWidth,
    );

    if (this.filmPass) {
      this.filmPass.enabled = active;
      const material = this.filmPass.material;
      if (material?.uniforms) {
        if (material.uniforms.nIntensity) {
          material.uniforms.nIntensity.value = effectiveIntensity * 0.5;
        }
        if (material.uniforms.sIntensity) {
          material.uniforms.sIntensity.value = effectiveIntensity * 0.5;
        }
      }
    }
    if (this.grainTintPass) {
      this.grainTintPass.enabled = active;
      if (this.grainTintPass.uniforms?.intensity) {
        this.grainTintPass.uniforms.intensity.value = effectiveIntensity;
      }
      if (this.grainTintPass.uniforms?.scale) {
        this.grainTintPass.uniforms.scale.value = settings.scale ?? 1;
      }
      if (this.grainTintPass.uniforms?.tint) {
        this.grainTintPass.uniforms.tint.value.set(settings.color ?? '#ffffff');
      }
    }
  }

  /** @param {number | undefined} kelvin */
  _kelvinToShader(kelvin) {
    const neutral = CAMERA_TEMPERATURE_NEUTRAL_K;
    const clamped = THREE.MathUtils.clamp(
      kelvin ?? neutral,
      CAMERA_TEMPERATURE_MIN_K,
      CAMERA_TEMPERATURE_MAX_K,
    );
    if (clamped >= neutral) {
      return (clamped - neutral) / (CAMERA_TEMPERATURE_MAX_K - neutral);
    }
    return (clamped - neutral) / (neutral - CAMERA_TEMPERATURE_MIN_K);
  }

  _syncRenderToScreen() {
    for (const pass of this.composer.passes) {
      pass.renderToScreen = false;
    }
    for (let i = this.composer.passes.length - 1; i >= 0; i--) {
      const pass = this.composer.passes[i];
      if (pass.enabled !== false) {
        pass.renderToScreen = true;
        break;
      }
    }
  }
}
