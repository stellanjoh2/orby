import * as THREE from 'three';
import { N8AOPass } from 'n8ao';
import { MeshglEffectComposer } from './MeshglEffectComposer.js';
import { MeshglRenderPass } from './MeshglRenderPass.js';
import { MeshglBokehPass } from './MeshglBokehPass.js';
import { MeshglGodRaysPass } from './MeshglGodRaysPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/FilmPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/shaders/FXAAShader.js';
import {
  BloomTintShader,
  buildAnamorphicBloomShader,
  GrainTintShader,
  ExposureShader,
  ToneMappingShader,
  LensDirtShader,
  LensDistortionShader,
} from '../shaders/index.js';
import {
  AberrationShader,
  applyChromaticAberrationToPass,
} from './chromaticAberration.js';
import { ColorAdjustController } from './ColorAdjustController.js';
import {
  AMBIENT_OCCLUSION_INTENSITY_MAX,
  AMBIENT_OCCLUSION_INTENSITY_MIN,
  ANAMORPHIC_BLOOM_QUALITY_DEFAULT,
  CAMERA_TEMPERATURE_MIN_K,
  CAMERA_TEMPERATURE_MAX_K,
  CAMERA_TEMPERATURE_NEUTRAL_K,
  DOF_FOCUS_MIN_M,
  normalizeDofQualityId,
  resolveDofBokehMaxBlurMul,
  ANAMORPHIC_BLOOM_SPREAD_MAX,
  foldAnamorphicStreakAngleDeg,
  resolveAmbientOcclusionQualityTier,
  resolveAnamorphicBloomQualityTier,
} from '../constants.js';

export class PostProcessingPipeline {
  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').Scene} scene
   * @param {import('three').Camera} camera
   * @param {{ getDofDepthProxy?: () => import('three').Object3D | null }} [opts]
   */
  constructor(renderer, scene, camera, opts = {}) {
    this.renderer = renderer;
    const size = new THREE.Vector2();
    this.renderer.getSize(size);

    this.composer = new MeshglEffectComposer(this.renderer);
    this.renderPass = new MeshglRenderPass(scene, camera);
    // clearAlpha = 1 ensures the background color shows when scene.background is null
    this.renderPass.clearAlpha = 1;

    const rw = Math.max(1, Math.floor(size.x));
    const rh = Math.max(1, Math.floor(size.y));
    this.n8aoPass = new N8AOPass(scene, camera, rw, rh);
    this.n8aoPass.enabled = false;
    /** Last N8AO preset applied via `setQualityMode` (shader recompile if changed). */
    this._n8aoAppliedMode = 'Medium';
    this.n8aoPass.setQualityMode(this._n8aoAppliedMode);
    // Must stay off: later passes (exposure, tone mapping, grading) already handle display
    // transforms — N8AO's gamma pass washes the scene out / looks unnaturally ambient-lit.
    this.n8aoPass.configuration.gammaCorrection = false;

    this.bokehPass = new MeshglBokehPass(scene, camera, {
      focus: 10,
      aperture: 0.003,
      maxblur: 0.01,
      getDofDepthProxy: opts.getDofDepthProxy,
    });

    this.godRaysPass = new MeshglGodRaysPass(scene, camera);
    this.godRaysPass.enabled = false;

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      1.2,
      0.35,
      0.85,
    );

    this.filmPass = new FilmPass(0.0, 0.0, 648, false);
    this.filmPass.enabled = false;
    this.bloomTintPass = new ShaderPass(BloomTintShader);
    const abTier0 = resolveAnamorphicBloomQualityTier(ANAMORPHIC_BLOOM_QUALITY_DEFAULT);
    this._anamorphicBloomSampleRadius = abTier0.sampleRadius;
    this.anamorphicBloomPass = new ShaderPass(
      buildAnamorphicBloomShader(abTier0.sampleRadius),
    );
    this.anamorphicBloomPass.enabled = false;
    this.grainTintPass = new ShaderPass(GrainTintShader);
    this.grainTintPass.enabled = false;
    this.grainTime = 0;
    this.grainTintPass.uniforms.time.value = 0;

    this.lensDirtPass = new ShaderPass(LensDirtShader);
    this.lensDirtPass.enabled = false;

    this.aberrationPass = new ShaderPass(AberrationShader);
    const abAsp = size.y > 0 ? size.x / size.y : 1;
    if (this.aberrationPass.uniforms?.aspectRatio) {
      this.aberrationPass.uniforms.aspectRatio.value = abAsp;
    }
    this.exposurePass = new ShaderPass(ExposureShader);

    this.fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = this.renderer.getPixelRatio();
    this.fxaaPass.material.uniforms.resolution.value.x = 1 / (size.x * pixelRatio);
    this.fxaaPass.material.uniforms.resolution.value.y = 1 / (size.y * pixelRatio);
    this.fxaaPass.enabled = false;

    this.aberrationPass.renderToScreen = false;
    this.fxaaPass.renderToScreen = false;
    this.exposurePass.renderToScreen = false;

    this.colorAdjust = new ColorAdjustController(this.renderer);
    this.colorAdjustPass = this.colorAdjust.getPass();

    this.toneMappingPass = new ShaderPass(ToneMappingShader);
    this.toneMappingPass.renderToScreen = false;

    /** Full-frame lens distortion / fisheye (after CA — aberration runs post-grade so saturation does not kill fringes). */
    this.lensDistortionPass = new ShaderPass(LensDistortionShader);
    this.lensDistortionPass.enabled = false;
    this.lensDistortionPass.renderToScreen = true;

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.n8aoPass);
    this.composer.addPass(this.bokehPass);
    this.composer.addPass(this.godRaysPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.bloomTintPass);
    this.composer.addPass(this.anamorphicBloomPass);
    this.composer.addPass(this.lensDirtPass);
    this.composer.addPass(this.filmPass);
    this.composer.addPass(this.grainTintPass);
    this.composer.addPass(this.fxaaPass);
    this.composer.addPass(this.exposurePass);
    this.composer.addPass(this.colorAdjustPass);
    this.composer.addPass(this.toneMappingPass);
    // Chromatic aberration after grading + tone map so low-saturation looks (e.g. Noir) keep visible channel separation.
    this.composer.addPass(this.aberrationPass);
    this.composer.addPass(this.lensDistortionPass);

    /** @type {Array<{ pass: import('three/examples/jsm/postprocessing/Pass.js').Pass, key: string }>} */
    this._managedPasses = [
      { pass: this.renderPass, key: 'renderPass' },
      { pass: this.n8aoPass, key: 'n8aoPass' },
      { pass: this.bokehPass, key: 'bokehPass' },
      { pass: this.godRaysPass, key: 'godRaysPass' },
      { pass: this.bloomPass, key: 'bloomPass' },
      { pass: this.bloomTintPass, key: 'bloomTintPass' },
      { pass: this.anamorphicBloomPass, key: 'anamorphicBloomPass' },
      { pass: this.lensDirtPass, key: 'lensDirtPass' },
      { pass: this.filmPass, key: 'filmPass' },
      { pass: this.grainTintPass, key: 'grainTintPass' },
      { pass: this.fxaaPass, key: 'fxaaPass' },
      { pass: this.exposurePass, key: 'exposurePass' },
      { pass: this.colorAdjustPass, key: 'colorAdjustPass' },
      { pass: this.toneMappingPass, key: 'toneMappingPass' },
      { pass: this.aberrationPass, key: 'aberrationPass' },
      { pass: this.lensDistortionPass, key: 'lensDistortionPass' },
    ];
    /** @type {Array<{ enabled: boolean, renderToScreen: boolean }> | null} */
    this._unlitPresentationSnapshot = null;
  }

  /**
   * Display → Unlit: draw through {@link RenderPass} into an RT (no MSAA on geometry) instead of
   * `renderer.render()` to the antialiased default framebuffer, which is much slower at high DPR.
   */
  pushUnlitPresentation() {
    if (this._unlitPresentationSnapshot) return;
    this._unlitPresentationSnapshot = this._managedPasses.map(({ pass }) => ({
      enabled: pass.enabled,
      renderToScreen: pass.renderToScreen,
    }));
    for (const { pass, key } of this._managedPasses) {
      if (key === 'renderPass') continue;
      pass.enabled = false;
    }
    this.renderPass.enabled = true;
    this.n8aoPass.enabled = false;
    this.renderPass.renderToScreen = true;
  }

  popUnlitPresentation() {
    const snap = this._unlitPresentationSnapshot;
    if (!snap) return;
    this._managedPasses.forEach(({ pass }, i) => {
      pass.enabled = snap[i].enabled;
      pass.renderToScreen = snap[i].renderToScreen;
    });
    this._unlitPresentationSnapshot = null;
  }

  /**
   * Update depth of field settings
   * @param {Object} settings - DOF settings object
   */
  updateDof(settings) {
    if (!settings) return;
    const qualityId = normalizeDofQualityId(settings.quality);
    const wants =
      settings.enabled === undefined ? true : Boolean(settings.enabled);
    // Use aperture to determine if DOF should be active (very small aperture = minimal blur)
    const active = wants && settings.aperture > 0.0001;
    if (this.bokehPass) {
      this.bokehPass.enabled = active;
    }
    if (!active) return;
    const focus = Math.max(
      DOF_FOCUS_MIN_M,
      typeof settings.focus === 'number' && !Number.isNaN(settings.focus)
        ? settings.focus
        : DOF_FOCUS_MIN_M,
    );
    this.bokehPass.uniforms.focus.value = focus;
    this.bokehPass.uniforms.aperture.value = settings.aperture;
    // Calculate maxblur from aperture - smaller aperture = more blur
    // Very conservative maxblur range (0.01-0.04) for smooth, camera-like DOF
    // This prevents harsh edges and ghosting artifacts, especially on backgrounds
    // Real camera DOF is subtle and smooth, not aggressive
    const mul = resolveDofBokehMaxBlurMul(qualityId);
    const maxblur = Math.min(0.04, Math.max(0.01, settings.aperture * 15 * mul));
    this.bokehPass.uniforms.maxblur.value = maxblur;
  }

  /**
   * Screen-space volumetric light shafts (after DOF, before bloom).
   * @param {object} settings
   * @param {{ forceOff?: boolean }} [opts]
   */
  updateGodRays(settings, { forceOff = false } = {}) {
    if (!this.godRaysPass) return;
    if (forceOff || !settings?.enabled) {
      this.godRaysPass.enabled = false;
      if (this.godRaysPass.uniforms?.uStrength) {
        this.godRaysPass.uniforms.uStrength.value = 0;
      }
      return;
    }
    this.godRaysPass.enabled = true;
  }

  /**
   * Update bloom settings
   * @param {Object} settings - Bloom settings object
   */
  updateBloom(settings) {
    if (!settings) return;
    const wants =
      settings.enabled === undefined ? true : Boolean(settings.enabled);
    const active = wants && settings.strength > 0.0001;
    if (this.bloomPass) {
      this.bloomPass.enabled = active;
    }
    if (this.bloomTintPass) {
      this.bloomTintPass.enabled = active;
    }
    if (!active) return;
    this.bloomPass.threshold = settings.threshold;
    this.bloomPass.strength = settings.strength;
    this.bloomPass.radius = settings.radius;
    this.bloomTintPass.uniforms.tint.value = new THREE.Color(settings.color);
    // Increase tint strength significantly so bloom color is very noticeable
    // 200% stronger = 3x multiplier (was 2.5, now 7.5)
    const tintStrength = THREE.MathUtils.clamp(settings.strength * 7.5, 0, 15.0);
    this.bloomTintPass.uniforms.strength.value = tintStrength;
  }

  _ensureAnamorphicBloomShaderSampleRadius(sampleRadius) {
    if (!this.anamorphicBloomPass) return;
    const r = Math.max(1, Math.min(64, Math.floor(sampleRadius)));
    if (r === this._anamorphicBloomSampleRadius) return;
    this._anamorphicBloomSampleRadius = r;
    const shader = buildAnamorphicBloomShader(r);
    const u = this.anamorphicBloomPass.uniforms;
    for (const key of Object.keys(shader.uniforms)) {
      if (!Object.prototype.hasOwnProperty.call(u, key)) {
        u[key] = shader.uniforms[key];
      }
    }
    this.anamorphicBloomPass.material.dispose();
    this.anamorphicBloomPass.material = new THREE.ShaderMaterial({
      name: 'AnamorphicBloomPass',
      uniforms: u,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
    });
  }

  /**
   * Streak highlights along a rotatable axis (after Unreal bloom + bloom tint).
   * @param {object} settings
   * @param {{ forceOff?: boolean }} [opts]
   */
  updateAnamorphicBloom(settings, { forceOff = false } = {}) {
    if (!this.anamorphicBloomPass) return;
    if (forceOff || !settings?.enabled) {
      this.anamorphicBloomPass.enabled = false;
      return;
    }
    const tier = resolveAnamorphicBloomQualityTier(settings.quality);
    this._ensureAnamorphicBloomShaderSampleRadius(tier.sampleRadius);
    const spread = THREE.MathUtils.clamp(
      typeof settings.spread === 'number' && !Number.isNaN(settings.spread)
        ? settings.spread
        : 0.2,
      0,
      ANAMORPHIC_BLOOM_SPREAD_MAX,
    );
    const u = this.anamorphicBloomPass.uniforms;
    const rawThreshold =
      typeof settings.threshold === 'number' && !Number.isNaN(settings.threshold)
        ? settings.threshold
        : 0.7;
    const threshold = THREE.MathUtils.clamp(rawThreshold, 0, 2);
    let soften =
      typeof settings.soften === 'number' && !Number.isNaN(settings.soften)
        ? Math.max(1e-4, settings.soften)
        : 0.12;
    // After Unreal bloom, linear luminance spikes on speculars/emissive can swing frame-to-frame.
    // At high thresholds (~1.5–2) the smoothstep band is otherwise too narrow → visible strobing.
    if (threshold > 1.0) {
      soften += (threshold - 1.0) * 0.72;
    }
    soften = Math.min(soften, 2.5);
    u.threshold.value = threshold;
    u.soften.value = soften;
    u.strength.value =
      typeof settings.strength === 'number' && !Number.isNaN(settings.strength)
        ? Math.max(0, settings.strength)
        : 1.0;
    u.spread.value = spread;
    const hex =
      typeof settings.streakTint === 'string' && settings.streakTint.trim().length > 0
        ? settings.streakTint.trim()
        : '#7ec8ff';
    u.streakTint.value.set(hex);
    if (u.streakDir) {
      const angleDeg = foldAnamorphicStreakAngleDeg(
        typeof settings.streakAngle === 'number' && !Number.isNaN(settings.streakAngle)
          ? settings.streakAngle
          : 0,
      );
      const rad = THREE.MathUtils.degToRad(angleDeg);
      u.streakDir.value.set(Math.cos(rad), Math.sin(rad));
    }
    this.anamorphicBloomPass.enabled = true;
  }

  /**
   * Update film grain settings
   * @param {Object} settings - Grain settings object
   */
  updateGrain(settings) {
    if (!settings) return;
    const wants =
      settings.enabled === undefined ? true : Boolean(settings.enabled);
    const intensity = wants ? (settings.intensity || 0) : 0;
    const active = intensity > 0.0001;
    
    if (this.filmPass) {
      this.filmPass.enabled = active;
      // FilmPass uses material.uniforms, not direct uniforms
      const material = this.filmPass.material;
      if (material && material.uniforms) {
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
        this.grainTintPass.uniforms.tint.value = new THREE.Color(
          settings.color || '#ffffff',
        );
      }
    }
  }

  /**
   * Update chromatic aberration settings
   * @param {Object} settings - Aberration settings object
   */
  updateAberration(settings) {
    applyChromaticAberrationToPass(this.aberrationPass, settings);
  }

  /**
   * Screen-space ambient occlusion (N8AO / WebGL). When active, replaces RenderPass:
   * N8AOPass renders the scene and composites AO in one pass.
   * @param {object} settings
   * @param {boolean} forceOffTier - Render-quality tier disables AO (e.g. Low)
   */
  updateAmbientOcclusion(settings, forceOffTier = false) {
    if (!this.n8aoPass || !this.renderPass) return;
    const wants = Boolean(settings?.enabled);
    const active = wants && !forceOffTier;
    this.renderPass.enabled = !active;
    this.n8aoPass.enabled = active;
    if (!active) return;

    this.n8aoPass.configuration.gammaCorrection = false;

    const intensity =
      typeof settings.intensity === 'number' && !Number.isNaN(settings.intensity)
        ? settings.intensity
        : 5;
    const radius =
      typeof settings.radius === 'number' && !Number.isNaN(settings.radius)
        ? settings.radius
        : 5;
    const aoQ = resolveAmbientOcclusionQualityTier(settings.quality);
    if (this._n8aoAppliedMode !== aoQ.n8aoMode) {
      this.n8aoPass.setQualityMode(aoQ.n8aoMode);
      this._n8aoAppliedMode = aoQ.n8aoMode;
    }
    const halfRes = aoQ.halfRes;

    this.n8aoPass.configuration.intensity = THREE.MathUtils.clamp(
      intensity,
      AMBIENT_OCCLUSION_INTENSITY_MIN,
      AMBIENT_OCCLUSION_INTENSITY_MAX,
    );
    this.n8aoPass.configuration.aoRadius = THREE.MathUtils.clamp(radius, 0.1, 25);
    const hex =
      typeof settings.color === 'string' && settings.color.trim().length > 0
        ? settings.color.trim()
        : '#080808';
    this.n8aoPass.configuration.color = new THREE.Color(hex);
    if (this.n8aoPass.configuration.halfRes !== halfRes) {
      this.n8aoPass.configuration.halfRes = halfRes;
    }
  }

  /**
   * Set tone mapping mode
   * @param {string} value - Tone mapping mode ('none', 'reinhard', 'aces-filmic')
   */
  setToneMapping(value) {
    if (value === 'linear') value = 'none';
    // Map UI values to shader pass values (0=none, 2=reinhard, 4=aces-filmic)
    const toneMappingMap = {
      'none': 0,
      'reinhard': 2,
      'aces-filmic': 4,
    };
    
    const toneMappingValue = toneMappingMap[value] ?? 4; // Default to ACES Filmic
    
    // Update the tone mapping shader pass
    if (this.toneMappingPass) {
      this.toneMappingPass.uniforms.toneMappingType.value = toneMappingValue;
    }
  }

  /**
   * Update grain time uniform (for animation)
   * @param {number} delta - Time delta in seconds
   */
  updateGrainTime(delta) {
    if (
      this.grainTintPass?.enabled &&
      this.grainTintPass.uniforms?.time
    ) {
      this.grainTime += delta * 60;
      this.grainTintPass.uniforms.time.value = this.grainTime;
    }
  }

  /**
   * Set contrast adjustment
   * @param {number} value - Contrast value (0-2, default 1.0)
   */
  setContrast(value) {
    this.colorAdjust?.setContrast(value);
  }

  /**
   * Set saturation adjustment
   * @param {number} value - Saturation value (0-2, default 1.0)
   */
  setSaturation(value) {
    this.colorAdjust?.setSaturation(value);
  }

  /**
   * Set color temperature in Kelvin
   * @param {number} kelvin - Temperature in Kelvin (2000-12000, default 6000)
   */
  setTemperature(kelvin) {
    if (!this.colorAdjust) return;
    const neutral = CAMERA_TEMPERATURE_NEUTRAL_K;
    const minK = CAMERA_TEMPERATURE_MIN_K;
    const maxK = CAMERA_TEMPERATURE_MAX_K;
    const clamped = THREE.MathUtils.clamp(
      kelvin ?? neutral,
      minK,
      maxK,
    );
    let normalized;
    if (clamped >= neutral) {
      normalized =
        (clamped - neutral) / (maxK - neutral);
    } else {
      normalized =
        (clamped - neutral) / (neutral - minK);
    }
    this.colorAdjust.setTemperature(normalized);
  }

  /**
   * Set tint adjustment
   * @param {number} value - Tint value (-100 to 100, normalized to -1 to 1)
   */
  setTint(value) {
    this.colorAdjust?.setTint(value);
  }

  /**
   * Set highlights adjustment
   * @param {number} value - Highlights value (-100 to 100, normalized to -1 to 1)
   */
  setHighlights(value) {
    this.colorAdjust?.setHighlights(value);
  }

  /**
   * Set shadows adjustment
   * @param {number} value - Shadows value (-50 to 50, normalized to -1 to 1)
   */
  setShadows(value) {
    this.colorAdjust?.setShadows(value);
  }

  /**
   * Set clarity adjustment (midtone contrast)
   * @param {number} value - Clarity value (-100 to 100, default 0)
   */
  setClarity(value) {
    this.colorAdjust?.setClarity(value);
  }

  /**
   * Set fade adjustment (fade to black)
   * @param {number} value - Fade value (0 to 100, default 0)
   */
  setFade(value) {
    this.colorAdjust?.setFade(value);
  }

  /**
   * Set sharpness adjustment
   * @param {number} value - Sharpness value (0 to 100, default 0)
   */
  setSharpness(value) {
    this.colorAdjust?.setSharpness(value);
  }

  setToneCurve(curve) {
    this.colorAdjust?.setToneCurve(curve);
  }

  /**
   * Set vignette intensity
   * @param {number} value - Vignette intensity (0-1, default 0)
   */
  setVignette(value) {
    if (this.toneMappingPass) {
      this.toneMappingPass.uniforms.vignetteIntensity.value = value;
    }
  }

  /**
   * Set vignette color
   * @param {string} color - Vignette color (hex string, default '#080808')
   */
  setVignetteColor(color) {
    if (this.toneMappingPass) {
      this.toneMappingPass.uniforms.vignetteColor.value = new THREE.Color(color);
    }
  }

  /** Swap the main scene camera used by render / AO / DOF passes. */
  setMainCamera(camera) {
    if (!camera) return;
    this.renderPass.camera = camera;
    if (this.n8aoPass) {
      this.n8aoPass.camera = camera;
    }
    if (this.bokehPass) {
      this.bokehPass.camera = camera;
    }
  }
}

