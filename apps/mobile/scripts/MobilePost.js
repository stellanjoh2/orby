import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import {
  GradingShader,
  BloomTintShader,
  GrainTintShader,
} from '../../../scripts/shaders/index.js';
import { mergeLookFilterState } from '../../../scripts/render/lookFilterPresets.js';
import {
  buildToneCurveLutBytes,
  normalizeToneCurve,
} from '../../../scripts/math/toneCurvePchip.js';
import {
  applyChromaticAberrationToPass,
  AberrationShader,
} from '../../../scripts/render/chromaticAberration.js';
import {
  CAMERA_TEMPERATURE_MIN_K,
  CAMERA_TEMPERATURE_MAX_K,
  CAMERA_TEMPERATURE_NEUTRAL_K,
  cameraShadowsUiToShader,
  effectiveVignetteIntensity,
} from '../../../scripts/constants.js';
import { MOBILE_FX_DEFAULTS } from './mobileFxDefaults.js';
import { getNestedValue, setNestedValue } from './mobileFxControls.js';

const TONE_MAPPING_MAP = {
  none: 0,
  reinhard: 2,
  'aces-filmic': 4,
};

/**
 * Mobile post stack — grading + bloom + grain + chromatic aberration.
 */
export class MobilePost {
  /** @param {THREE.WebGLRenderer} renderer @param {THREE.Scene} scene @param {THREE.Camera} camera */
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this._grainTime = 0;

    const size = new THREE.Vector2();
    renderer.getSize(size);
    const rw = Math.max(1, Math.floor(size.x));
    const rh = Math.max(1, Math.floor(size.y));

    // Default composer buffers (linear) — matches desktop; sRGB/HalfFloat RT crushed HDRI contrast.
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.renderPass.clearAlpha = 1;
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(rw, rh), 0.2, 0.2, 1.0);
    this.bloomPass.enabled = false;
    this.composer.addPass(this.bloomPass);

    this.bloomTintPass = new ShaderPass(BloomTintShader);
    this.bloomTintPass.enabled = false;
    this.composer.addPass(this.bloomTintPass);

    this.filmPass = new FilmPass(0.0, 0.0, 648, false);
    this.filmPass.enabled = false;
    this.composer.addPass(this.filmPass);

    this.grainTintPass = new ShaderPass(GrainTintShader);
    this.grainTintPass.enabled = false;
    this.composer.addPass(this.grainTintPass);

    this.gradingPass = new ShaderPass(GradingShader);
    this.gradingPass.renderToScreen = false;
    this.uniforms = this.gradingPass.uniforms;
    this.composer.addPass(this.gradingPass);

    this.aberrationPass = new ShaderPass(AberrationShader);
    this.aberrationPass.renderToScreen = true;
    this.composer.addPass(this.aberrationPass);

    /** @type {THREE.DataTexture | null} */
    this._toneLutTexture = null;
    this._curveNorm = normalizeToneCurve(MOBILE_FX_DEFAULTS.toneCurve);
    this._uploadToneLut(this._curveNorm);

    this._fxState = this._cloneFxState(MOBILE_FX_DEFAULTS);
    this._lookFilterPreset = 'none';
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
    this._disposeToneLut();
    this.composer?.dispose?.();
  }

  _disposeToneLut() {
    this._toneLutTexture?.dispose?.();
    this._toneLutTexture = null;
  }

  /** @param {object} curve */
  _uploadToneLut(curve) {
    this._disposeToneLut();
    const { data, width, height, tailSlope } = buildToneCurveLutBytes(curve);
    const tex = new THREE.DataTexture(
      data,
      width,
      height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    tex.needsUpdate = true;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.flipY = false;
    tex.unpackAlignment = 1;
    this._toneLutTexture = tex;
    if (this.uniforms.toneCurveLut) this.uniforms.toneCurveLut.value = tex;
    if (this.uniforms.toneHdrTailSlope) this.uniforms.toneHdrTailSlope.value = tailSlope;
  }

  reset() {
    this._fxState = this._cloneFxState(
      mergeLookFilterState('none', MOBILE_FX_DEFAULTS, MOBILE_FX_DEFAULTS),
    );
    this._lookFilterPreset = 'none';
    this._applyFxState(this._fxState);
  }

  /** @param {number} dt */
  tick(dt) {
    this._grainTime += dt;
    if (this.grainTintPass?.uniforms?.time) {
      this.grainTintPass.uniforms.time.value = this._grainTime;
    }
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    if (this.uniforms.resolution) {
      this.uniforms.resolution.value.set(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.setSize(w, h);
    }
    if (this.aberrationPass?.uniforms?.aspectRatio) {
      this.aberrationPass.uniforms.aspectRatio.value = w / Math.max(1, h);
    }
  }

  render() {
    this.composer.render();
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

  /** @param {object} state merged look-filter state */
  _applyFxState(state) {
    const cam = state.camera ?? {};
    const defaultsCam = MOBILE_FX_DEFAULTS.camera;

    if (this.uniforms.exposure) {
      this.uniforms.exposure.value = state.exposure ?? 1;
    }
    this._setUniform('contrast', cam.contrast ?? 1);
    this._setUniform('saturation', cam.saturation ?? 1);
    this._setUniform('temperature', this._kelvinToShader(cam.temperature));
    this._setUniform('tint', (cam.tint ?? 0) / 100);
    this._setUniform('highlights', (cam.highlights ?? 0) / 100);
    this._setUniform('shadows', cameraShadowsUiToShader(cam.shadows ?? 0));
    this._setUniform('clarity', cam.clarity ?? 0);
    this._setUniform('fade', cam.fade ?? 0);
    this._setUniform('sharpness', cam.sharpness ?? 0);

    const curve = normalizeToneCurve(state.toneCurve ?? MOBILE_FX_DEFAULTS.toneCurve);
    this._curveNorm = curve;
    this._uploadToneLut(curve);

    const toneMappingValue = TONE_MAPPING_MAP[state.toneMapping] ?? 4;
    if (this.uniforms.toneMappingType) {
      this.uniforms.toneMappingType.value = toneMappingValue;
    }
    if (this.uniforms.vignetteIntensity) {
      this.uniforms.vignetteIntensity.value = effectiveVignetteIntensity(cam, defaultsCam);
    }
    if (this.uniforms.vignetteColor) {
      this.uniforms.vignetteColor.value.set(cam.vignetteColor ?? '#080808');
    }

    this._updateBloom(state.bloom);
    this._updateGrain(state.grain);
    applyChromaticAberrationToPass(this.aberrationPass, state.aberration);

    this._updateToneCurveIdentity();
    this._updateBypass();
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

    if (this.bloomTintPass) {
      this.bloomTintPass.enabled = active;
      if (active && this.bloomTintPass.uniforms) {
        this.bloomTintPass.uniforms.tint.value.set(settings.color ?? '#ffe9cc');
        this.bloomTintPass.uniforms.strength.value = THREE.MathUtils.clamp(
          strength * 7.5,
          0,
          15,
        );
      }
    }
  }

  /** @param {object | undefined} settings */
  _updateGrain(settings) {
    if (!settings) return;
    const wants = settings.enabled === undefined ? true : Boolean(settings.enabled);
    const intensity = wants ? (settings.intensity || 0) : 0;
    const active = intensity > 0.0001;

    if (this.filmPass) {
      this.filmPass.enabled = active;
      const material = this.filmPass.material;
      if (material?.uniforms) {
        if (material.uniforms.nIntensity) {
          material.uniforms.nIntensity.value = intensity * 0.5;
        }
        if (material.uniforms.sIntensity) {
          material.uniforms.sIntensity.value = intensity * 0.5;
        }
      }
    }
    if (this.grainTintPass) {
      this.grainTintPass.enabled = active;
      if (this.grainTintPass.uniforms?.intensity) {
        this.grainTintPass.uniforms.intensity.value = intensity;
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

  /** @param {string} key @param {number} value */
  _setUniform(key, value) {
    if (this.uniforms[key]) this.uniforms[key].value = value;
  }

  _updateToneCurveIdentity() {
    if (!this.uniforms.toneCurveIdentity) return;
    const c = this._curveNorm;
    const eps = 0.002;
    const onDiag =
      Math.abs(c.blackY) < eps
      && Math.abs(c.whiteY - 1) < eps
      && Math.abs(c.p1.x - c.p1.y) < eps
      && Math.abs(c.p2.x - c.p2.y) < eps;
    this.uniforms.toneCurveIdentity.value = onDiag ? 1 : 0;
  }

  _updateBypass() {
    if (!this.uniforms.bypass) return;
    const u = this.uniforms;
    const atDefaults =
      Math.abs(u.contrast.value - 1) < 0.0001
      && Math.abs(u.saturation.value - 1) < 0.0001
      && Math.abs(u.temperature.value) < 0.0001
      && Math.abs(u.tint.value) < 0.0001
      && Math.abs(u.highlights.value) < 0.0001
      && Math.abs(u.shadows.value) < 0.0001
      && Math.abs(u.clarity.value) < 0.0001
      && Math.abs(u.fade.value) < 0.0001
      && Math.abs(u.sharpness.value) < 0.0001
      && (u.toneCurveIdentity?.value ?? 1) > 0.5;
    u.bypass.value = atDefaults ? 1 : 0;
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
