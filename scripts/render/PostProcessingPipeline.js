import * as THREE from 'three';
import { N8AOPass } from 'n8ao';
import { MeshglEffectComposer } from './MeshglEffectComposer.js';
import { MeshglRenderPass } from './MeshglRenderPass.js';
import { focusDistanceToBokehFocalDepth } from './dofFocalDepth.js';
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
import { GradingController } from './GradingController.js';
import { BloomCompositeController } from './BloomCompositeController.js';
import { CreativeLookViewportBloom } from './CreativeLookViewportBloom.js';
import { CreativeLookAsciiPass } from './CreativeLookAsciiPass.js';
import { CreativeLookEgaPass } from './CreativeLookEgaPass.js';
import { CreativeLookC64Pass } from './CreativeLookC64Pass.js';
import { CreativeLookGameBoyPass } from './CreativeLookGameBoyPass.js';
import { CreativeLookNesPass } from './CreativeLookNesPass.js';
import { CreativeLookMegaDrivePass } from './CreativeLookMegaDrivePass.js';
import { CreativeLookIntellivisionPass } from './CreativeLookIntellivisionPass.js';
import { CreativeLookGbaPass } from './CreativeLookGbaPass.js';
import { CreativeLookApple2Pass } from './CreativeLookApple2Pass.js';
import { CreativeLookDitherPass } from './CreativeLookDitherPass.js';
import { CreativeLookVectrex } from './CreativeLookVectrexPass.js';
import { CreativeLookWatercolour } from './CreativeLookWatercolourPass.js';
import { CreativeLookSketch } from './CreativeLookSketchPass.js';
import { CreativeLookSketchColour } from './CreativeLookSketchColourPass.js';
import { CreativeLookGouache } from './CreativeLookGouachePass.js';
import { CreativeLookOpticsPass } from './CreativeLookOpticsPass.js';
import {
  AMBIENT_OCCLUSION_INTENSITY_MAX,
  AMBIENT_OCCLUSION_INTENSITY_MIN,
  ANAMORPHIC_BLOOM_QUALITY_DEFAULT,
  CAMERA_TEMPERATURE_MIN_K,
  CAMERA_TEMPERATURE_MAX_K,
  CAMERA_TEMPERATURE_NEUTRAL_K,
  DOF_FOCUS_MIN_M,
  clampDofBlurMul,
  normalizeDofFocusMode,
  normalizeDofQualityId,
  ANAMORPHIC_BLOOM_SPREAD_MAX,
  foldAnamorphicStreakAngleDeg,
  resolveAmbientOcclusionQualityTier,
  resolveAnamorphicBloomQualityTier,
  USE_MERGED_GRADING_PASS,
  USE_MERGED_BLOOM_COMPOSITE_PASS,
  isAnamorphicBloomPipelineActive,
  isBloomPipelineActive,
} from '../constants.js';

/** Cam/FX grading stack keys — exposure always runs; color ops bypass at defaults. */
const CREATIVE_LOOK_GRADING_PASS_KEYS = new Set([
  'gradingPass',
  'exposurePass',
  'colorAdjustPass',
  'toneMappingPass',
]);

/** Cam/FX grain — allowed on Shader Lab presentation stacks. */
const CREATIVE_LOOK_GRAIN_PASS_KEYS = new Set(['filmPass', 'grainTintPass']);

export class PostProcessingPipeline {
  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').Scene} scene
   * @param {import('three').Camera} camera
   * @param {{ getDofDepthProxy?: () => import('three').Object3D | null, getDofDepthProxies?: () => import('three').Object3D[] }} [opts]
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
      getDofDepthProxies: opts.getDofDepthProxies,
      getDofDepthProxy: opts.getDofDepthProxy,
    });

    this.godRaysPass = new MeshglGodRaysPass(scene, camera);
    this.godRaysPass.enabled = false;
    this.godRaysPass.bokehPass = this.bokehPass;

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      1.2,
      0.35,
      0.85,
    );

    const abTier0 = resolveAnamorphicBloomQualityTier(ANAMORPHIC_BLOOM_QUALITY_DEFAULT);
    this._anamorphicBloomSampleRadius = abTier0.sampleRadius;

    /** @type {import('./BloomCompositeController.js').BloomCompositeController | null} */
    this.bloomCompositeController = null;
    this.bloomCompositePass = null;
    this.bloomTintPass = null;
    this.anamorphicBloomPass = null;

    if (USE_MERGED_BLOOM_COMPOSITE_PASS) {
      this.bloomCompositeController = new BloomCompositeController(
        this.renderer,
        abTier0.sampleRadius,
      );
      this.bloomCompositePass = this.bloomCompositeController.getPass();
      this.bloomTintPass = this.bloomCompositePass;
      this.anamorphicBloomPass = this.bloomCompositePass;
    } else {
      this.bloomTintPass = new ShaderPass(BloomTintShader);
      this.anamorphicBloomPass = new ShaderPass(
        buildAnamorphicBloomShader(abTier0.sampleRadius),
      );
      this.anamorphicBloomPass.enabled = false;
    }

    this.filmPass = new FilmPass(0.0, 0.0, 648, false);
    this.filmPass.enabled = false;

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

    this.fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = this.renderer.getPixelRatio();
    this.fxaaPass.material.uniforms.resolution.value.x = 1 / (size.x * pixelRatio);
    this.fxaaPass.material.uniforms.resolution.value.y = 1 / (size.y * pixelRatio);
    this.fxaaPass.enabled = false;

    this.aberrationPass.renderToScreen = false;
    this.fxaaPass.renderToScreen = false;

    /** @type {import('./GradingController.js').GradingController | null} */
    this.gradingController = null;
    this.gradingPass = null;
    this.exposurePass = null;
    this.colorAdjustPass = null;
    this.toneMappingPass = null;
    /** @type {import('./ColorAdjustController.js').ColorAdjustController | import('./GradingController.js').GradingController | null} */
    this.colorAdjust = null;

    if (USE_MERGED_GRADING_PASS) {
      this.gradingController = new GradingController(this.renderer);
      this.gradingPass = this.gradingController.getPass();
      this.gradingPass.renderToScreen = false;
      this.colorAdjust = this.gradingController;
      this.exposurePass = this.gradingPass;
      this.colorAdjustPass = this.gradingPass;
      this.toneMappingPass = this.gradingPass;
    } else {
      this.exposurePass = new ShaderPass(ExposureShader);
      this.exposurePass.renderToScreen = false;
      this.colorAdjust = new ColorAdjustController(this.renderer);
      this.colorAdjustPass = this.colorAdjust.getPass();
      this.toneMappingPass = new ShaderPass(ToneMappingShader);
      this.toneMappingPass.renderToScreen = false;
    }

    /** Full-frame lens distortion / fisheye (after CA — aberration runs post-grade so saturation does not kill fringes). */
    this.lensDistortionPass = new ShaderPass(LensDistortionShader);
    this.lensDistortionPass.enabled = false;
    this.lensDistortionPass.renderToScreen = true;

    this.creativeLookViewportBloom = new CreativeLookViewportBloom(renderer);
    this.creativeLookViewportBloomPass = this.creativeLookViewportBloom.getPass();

    this.creativeLookAscii = new CreativeLookAsciiPass(renderer);
    this.creativeLookAsciiPass = this.creativeLookAscii.getPass();

    this.creativeLookEga = new CreativeLookEgaPass(renderer);
    this.creativeLookEgaPass = this.creativeLookEga.getPass();

    this.creativeLookC64 = new CreativeLookC64Pass(renderer);
    this.creativeLookC64Pass = this.creativeLookC64.getPass();

    this.creativeLookGameBoy = new CreativeLookGameBoyPass(renderer);
    this.creativeLookGameBoyPass = this.creativeLookGameBoy.getPass();

    this.creativeLookNes = new CreativeLookNesPass(renderer);
    this.creativeLookNesPass = this.creativeLookNes.getPass();

    this.creativeLookMegaDrive = new CreativeLookMegaDrivePass(renderer);
    this.creativeLookMegaDrivePass = this.creativeLookMegaDrive.getPass();

    this.creativeLookIntellivision = new CreativeLookIntellivisionPass(renderer);
    this.creativeLookIntellivisionPass = this.creativeLookIntellivision.getPass();

    this.creativeLookGba = new CreativeLookGbaPass(renderer);
    this.creativeLookGbaPass = this.creativeLookGba.getPass();

    this.creativeLookApple2 = new CreativeLookApple2Pass(renderer);
    this.creativeLookApple2Pass = this.creativeLookApple2.getPass();

    this.creativeLookDither = new CreativeLookDitherPass(renderer);
    this.creativeLookDitherPass = this.creativeLookDither.getPass();

    this.creativeLookVectrex = new CreativeLookVectrex(renderer);
    this.creativeLookVectrexPass = this.creativeLookVectrex.getPass();

    this.creativeLookWatercolour = new CreativeLookWatercolour(renderer);
    this.creativeLookWatercolourPass = this.creativeLookWatercolour.getPass();

    this.creativeLookSketch = new CreativeLookSketch(renderer);
    this.creativeLookSketchPass = this.creativeLookSketch.getPass();

    this.creativeLookSketchColour = new CreativeLookSketchColour(renderer);
    this.creativeLookSketchColourPass = this.creativeLookSketchColour.getPass();

    this.creativeLookGouache = new CreativeLookGouache(renderer);
    this.creativeLookGouachePass = this.creativeLookGouache.getPass();

    this.creativeLookOptics = new CreativeLookOpticsPass(renderer);
    this.creativeLookOpticsPass = this.creativeLookOptics.getPass();

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.creativeLookAsciiPass);
    this.composer.addPass(this.creativeLookEgaPass);
    this.composer.addPass(this.creativeLookC64Pass);
    this.composer.addPass(this.creativeLookGameBoyPass);
    this.composer.addPass(this.creativeLookNesPass);
    this.composer.addPass(this.creativeLookMegaDrivePass);
    this.composer.addPass(this.creativeLookIntellivisionPass);
    this.composer.addPass(this.creativeLookGbaPass);
    this.composer.addPass(this.creativeLookApple2Pass);
    this.composer.addPass(this.creativeLookDitherPass);
    this.composer.addPass(this.creativeLookVectrexPass);
    this.composer.addPass(this.creativeLookWatercolourPass);
    this.composer.addPass(this.creativeLookSketchPass);
    this.composer.addPass(this.creativeLookSketchColourPass);
    this.composer.addPass(this.creativeLookGouachePass);
    this.composer.addPass(this.creativeLookOpticsPass);
    this.composer.addPass(this.creativeLookViewportBloomPass);
    this.composer.addPass(this.n8aoPass);
    this.composer.addPass(this.bokehPass);
    this.composer.addPass(this.godRaysPass);
    this.composer.addPass(this.bloomPass);
    if (USE_MERGED_BLOOM_COMPOSITE_PASS) {
      this.composer.addPass(this.bloomCompositePass);
    } else {
      this.composer.addPass(this.bloomTintPass);
      this.composer.addPass(this.anamorphicBloomPass);
    }
    this.composer.addPass(this.lensDirtPass);
    this.composer.addPass(this.filmPass);
    this.composer.addPass(this.grainTintPass);
    this.composer.addPass(this.fxaaPass);
    if (USE_MERGED_GRADING_PASS) {
      this.composer.addPass(this.gradingPass);
    } else {
      this.composer.addPass(this.exposurePass);
      this.composer.addPass(this.colorAdjustPass);
      this.composer.addPass(this.toneMappingPass);
    }
    // Chromatic aberration after grading + tone map so low-saturation looks (e.g. Noir) keep visible channel separation.
    this.composer.addPass(this.aberrationPass);
    this.composer.addPass(this.lensDistortionPass);

    /** @type {Array<{ pass: import('three/examples/jsm/postprocessing/Pass.js').Pass, key: string }>} */
    this._managedPasses = [
      { pass: this.renderPass, key: 'renderPass' },
      { pass: this.creativeLookAsciiPass, key: 'creativeLookAsciiPass' },
      { pass: this.creativeLookEgaPass, key: 'creativeLookEgaPass' },
      { pass: this.creativeLookC64Pass, key: 'creativeLookC64Pass' },
      { pass: this.creativeLookGameBoyPass, key: 'creativeLookGameBoyPass' },
      { pass: this.creativeLookNesPass, key: 'creativeLookNesPass' },
      { pass: this.creativeLookMegaDrivePass, key: 'creativeLookMegaDrivePass' },
      { pass: this.creativeLookIntellivisionPass, key: 'creativeLookIntellivisionPass' },
      { pass: this.creativeLookGbaPass, key: 'creativeLookGbaPass' },
      { pass: this.creativeLookApple2Pass, key: 'creativeLookApple2Pass' },
      { pass: this.creativeLookDitherPass, key: 'creativeLookDitherPass' },
      { pass: this.creativeLookVectrexPass, key: 'creativeLookVectrexPass' },
      { pass: this.creativeLookWatercolourPass, key: 'creativeLookWatercolourPass' },
      { pass: this.creativeLookSketchPass, key: 'creativeLookSketchPass' },
      { pass: this.creativeLookSketchColourPass, key: 'creativeLookSketchColourPass' },
      { pass: this.creativeLookGouachePass, key: 'creativeLookGouachePass' },
      { pass: this.creativeLookOpticsPass, key: 'creativeLookOpticsPass' },
      { pass: this.creativeLookViewportBloomPass, key: 'creativeLookViewportBloomPass' },
      { pass: this.n8aoPass, key: 'n8aoPass' },
      { pass: this.bokehPass, key: 'bokehPass' },
      { pass: this.godRaysPass, key: 'godRaysPass' },
      { pass: this.bloomPass, key: 'bloomPass' },
      ...(USE_MERGED_BLOOM_COMPOSITE_PASS
        ? [{ pass: this.bloomCompositePass, key: 'bloomCompositePass' }]
        : [
            { pass: this.bloomTintPass, key: 'bloomTintPass' },
            { pass: this.anamorphicBloomPass, key: 'anamorphicBloomPass' },
          ]),
      { pass: this.lensDirtPass, key: 'lensDirtPass' },
      { pass: this.filmPass, key: 'filmPass' },
      { pass: this.grainTintPass, key: 'grainTintPass' },
      { pass: this.fxaaPass, key: 'fxaaPass' },
      ...(USE_MERGED_GRADING_PASS
        ? [{ pass: this.gradingPass, key: 'gradingPass' }]
        : [
            { pass: this.exposurePass, key: 'exposurePass' },
            { pass: this.colorAdjustPass, key: 'colorAdjustPass' },
            { pass: this.toneMappingPass, key: 'toneMappingPass' },
          ]),
      { pass: this.aberrationPass, key: 'aberrationPass' },
      { pass: this.lensDistortionPass, key: 'lensDistortionPass' },
    ];
    /** @type {Array<{ enabled: boolean, renderToScreen: boolean }> | null} */
    this._unlitPresentationSnapshot = null;
    /** @type {Array<{ enabled: boolean, renderToScreen: boolean }> | null} */
    this._creativeLookViewportSnapshot = null;
    /** @type {Array<{ enabled: boolean, renderToScreen: boolean }> | null} */
    this._creativeLookAsciiSnapshot = null;
    /** @type {Array<{ enabled: boolean, renderToScreen: boolean }> | null} */
    this._creativeLookVectrexSnapshot = null;
    /** @type {Array<{ enabled: boolean, renderToScreen: boolean }> | null} */
    this._creativeLookWatercolourSnapshot = null;
    /** @type {Array<{ enabled: boolean, renderToScreen: boolean }> | null} */
    this._creativeLookSketchSnapshot = null;
    /** @type {Array<{ enabled: boolean, renderToScreen: boolean }> | null} */
    this._creativeLookGouacheSnapshot = null;
    /** @type {Array<{ enabled: boolean, renderToScreen: boolean }> | null} */
    this._creativeLookOpticsSnapshot = null;
    /** @type {{ min: number, mag: number } | null} */
    this._composerFilterRestore = null;
    /** @type {object | null} — last `state.bloom` for Shader Lab viewport bloom prep */
    this._lastBloomSettings = null;
    /** @type {object | null} — last anamorphic settings for Shader Lab viewport bloom prep */
    this._lastAnamorphicBloomSettings = null;
    this._lastAnamorphicBloomForceOff = false;
    /** @type {boolean} */
    this._asciiBloomActive = false;
    /** @type {boolean} */
    this._asciiAnamorphicActive = false;
    /** @type {'ascii' | 'ega-pixel' | 'c64-pixel' | 'gameboy-pixel' | 'gba-pixel' | 'nes-pixel' | 'megadrive-pixel' | 'intellivision-pixel' | 'apple2-pixel' | 'dither-neutral' | 'dither-tritone' | 'dither-crosshatch' | null} */
    this._flatPostVariant = null;
  }

  /**
   * Sync Camera & FX bloom for ASCII Art terminal stack (scene → glyphs → bloom → screen).
   * @param {object} [state]
   */
  prepareCreativeLookAsciiPresentation(state) {
    this._asciiBloomActive = isBloomPipelineActive(state ?? {});
    this._asciiAnamorphicActive = isAnamorphicBloomPipelineActive(state ?? {});
    if (this._lastBloomSettings) {
      this.updateBloom(this._lastBloomSettings);
    }
  }

  /**
   * Sync UnrealBloom + tint from Camera & FX bloom sliders before the slim viewport stack runs.
   * Uses the same pass as normal bloom (soft pyramid blur) — avoids custom-pass canvas bugs.
   */
  prepareCreativeLookViewportPresentation() {
    const settings = this._lastBloomSettings;
    if (!settings || !this.bloomPass) return;

    const thresh = Number(settings.threshold);
    this.bloomPass.threshold = Number.isFinite(thresh)
      ? THREE.MathUtils.clamp(thresh * 0.78 + 0.08, 0.05, 0.92)
      : 0.65;
    const strength = Number(settings.strength);
    this.bloomPass.strength = Number.isFinite(strength) ? Math.max(0, strength) : 0.2;
    const rad = Number(settings.radius);
    this.bloomPass.radius = Number.isFinite(rad)
      ? THREE.MathUtils.clamp(rad, 0, 1)
      : 0.2;

    if (this.bloomCompositeController) {
      this.bloomCompositeController.setBloomTint(true, settings);
      this.bloomCompositeController.setAnamorphic(
        this._lastAnamorphicBloomSettings ?? {},
        {
          forceOff:
            this._lastAnamorphicBloomForceOff || !this._lastAnamorphicBloomSettings,
        },
      );
    } else if (this.bloomTintPass) {
      this.bloomTintPass.enabled = true;
      this.bloomTintPass.uniforms.tint.value = new THREE.Color(settings.color ?? '#ffe9cc');
      const tintStrength = THREE.MathUtils.clamp(
        (Number.isFinite(strength) ? strength : 0.2) * 7.5,
        0,
        15.0,
      );
      this.bloomTintPass.uniforms.strength.value = tintStrength;
    }
    if (
      this._lastAnamorphicBloomSettings &&
      this.anamorphicBloomPass &&
      this.anamorphicBloomPass !== this.bloomCompositePass
    ) {
      this.updateAnamorphicBloom(this._lastAnamorphicBloomSettings, {
        forceOff: this._lastAnamorphicBloomForceOff,
      });
    }
  }

  /**
   * Shader Lab + viewport bloom: slim stack — scene → bloom → tint/anamorphic → grain → CA → grading → screen.
   * Skips Cam/FX color grade / tone curve; keeps exposure + tone mapping for brightness control.
   */
  pushCreativeLookViewportPresentation() {
    if (this._creativeLookViewportSnapshot) return;

    this._creativeLookViewportSnapshot = this._managedPasses.map(({ pass }) => ({
      enabled: pass.enabled,
      renderToScreen: pass.renderToScreen,
    }));

    const slimPostKeys = new Set([
      'filmPass',
      'grainTintPass',
      'anamorphicBloomPass',
      'aberrationPass',
      'lensDistortionPass',
    ]);

    for (let i = 0; i < this._managedPasses.length; i += 1) {
      const { pass, key } = this._managedPasses[i];
      const snap = this._creativeLookViewportSnapshot[i];

      if (key === 'renderPass' || key === 'n8aoPass') {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookAsciiPass') {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookEgaPass') {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookC64Pass') {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookGameBoyPass') {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookNesPass') {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookMegaDrivePass') {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookIntellivisionPass') {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookGbaPass') {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookApple2Pass') {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookDitherPass') {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookVectrexPass') {
        pass.enabled = false;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookWatercolourPass') {
        pass.enabled = false;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookSketchPass' || key === 'creativeLookSketchColourPass') {
        pass.enabled = false;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookGouachePass') {
        pass.enabled = false;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookViewportBloomPass') {
        pass.enabled = false;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'bloomPass') {
        pass.enabled = true;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'bloomCompositePass' || key === 'bloomTintPass') {
        pass.enabled = true;
        pass.renderToScreen = false;
        continue;
      }
      if (slimPostKeys.has(key)) {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (CREATIVE_LOOK_GRADING_PASS_KEYS.has(key)) {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      pass.enabled = false;
      pass.renderToScreen = false;
    }
  }

  popCreativeLookViewportPresentation() {
    const snap = this._creativeLookViewportSnapshot;
    if (!snap) return;
    this._managedPasses.forEach(({ pass }, i) => {
      pass.enabled = snap[i].enabled;
      pass.renderToScreen = snap[i].renderToScreen;
    });
    this._creativeLookViewportSnapshot = null;
  }

  /**
   * Vectrex vector CRT — scene → phosphor persistence → (optional Cam/FX bloom) → grain → screen.
   * @param {{ viewportBloom?: boolean }} [options]
   */
  pushCreativeLookVectrexPresentation({ viewportBloom = false } = {}) {
    if (this._creativeLookVectrexSnapshot) return;

    this._creativeLookVectrexSnapshot = this._managedPasses.map(({ pass }) => ({
      enabled: pass.enabled,
      renderToScreen: pass.renderToScreen,
    }));

    const slimPostKeys = new Set([
      'filmPass',
      'grainTintPass',
      'anamorphicBloomPass',
      'aberrationPass',
      'lensDistortionPass',
    ]);

    for (let i = 0; i < this._managedPasses.length; i += 1) {
      const { pass, key } = this._managedPasses[i];
      const snap = this._creativeLookVectrexSnapshot[i];

      if (key === 'renderPass') {
        pass.enabled = true;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookVectrexPass') {
        pass.enabled = true;
        pass.renderToScreen = false;
        continue;
      }
      if (viewportBloom) {
        if (
          key === 'creativeLookAsciiPass' ||
          key === 'creativeLookEgaPass' ||
          key === 'creativeLookC64Pass' ||
          key === 'creativeLookGameBoyPass' ||
          key === 'creativeLookNesPass' ||
          key === 'creativeLookMegaDrivePass' ||
          key === 'creativeLookIntellivisionPass' ||
          key === 'creativeLookGbaPass' ||
          key === 'creativeLookApple2Pass' ||
          key === 'creativeLookDitherPass' ||
          key === 'creativeLookWatercolourPass' ||
          key === 'creativeLookSketchPass' ||
          key === 'creativeLookSketchColourPass' ||
          key === 'creativeLookGouachePass' ||
          key === 'creativeLookOpticsPass' ||
          key === 'creativeLookViewportBloomPass'
        ) {
          pass.enabled = false;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'bloomPass') {
          pass.enabled = true;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'bloomCompositePass' || key === 'bloomTintPass') {
          pass.enabled = true;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'anamorphicBloomPass') {
          pass.enabled = snap.enabled;
          pass.renderToScreen = false;
          continue;
        }
        if (slimPostKeys.has(key)) {
          pass.enabled = snap.enabled;
          pass.renderToScreen = false;
          continue;
        }
      }
      if (
        key === 'creativeLookAsciiPass' ||
        key === 'creativeLookEgaPass' ||
        key === 'creativeLookC64Pass' ||
        key === 'creativeLookGameBoyPass' ||
        key === 'creativeLookNesPass' ||
        key === 'creativeLookMegaDrivePass' ||
        key === 'creativeLookIntellivisionPass' ||
        key === 'creativeLookGbaPass' ||
        key === 'creativeLookApple2Pass' ||
        key === 'creativeLookDitherPass' ||
        key === 'creativeLookWatercolourPass' ||
        key === 'creativeLookSketchPass' ||
        key === 'creativeLookSketchColourPass' ||
        key === 'creativeLookGouachePass' ||
          key === 'creativeLookOpticsPass' ||
        key === 'creativeLookViewportBloomPass'
      ) {
        pass.enabled = false;
        pass.renderToScreen = false;
        continue;
      }
      if (CREATIVE_LOOK_GRAIN_PASS_KEYS.has(key)) {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (slimPostKeys.has(key)) {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      pass.enabled = false;
      pass.renderToScreen = false;
    }

    const composer = this.composer;
    if (composer && this.creativeLookVectrex) {
      const w = composer._width ?? 1;
      const h = composer._height ?? 1;
      this.creativeLookVectrex.setSize(w, h);
    }
  }

  popCreativeLookVectrexPresentation() {
    const snap = this._creativeLookVectrexSnapshot;
    if (!snap) return;
    this._managedPasses.forEach(({ pass }, i) => {
      pass.enabled = snap[i].enabled;
      pass.renderToScreen = snap[i].renderToScreen;
    });
    this._creativeLookVectrexSnapshot = null;
  }

  /** Tear down Vectrex presentation if a frame ends mid-stack or preset turns off. */
  releaseCreativeLookVectrex() {
    if (this._creativeLookVectrexSnapshot) {
      this.popCreativeLookVectrexPresentation();
      return;
    }
    if (this.creativeLookVectrexPass) {
      this.creativeLookVectrexPass.enabled = false;
    }
    this.creativeLookVectrex?.pass?.resetPersistence?.();
  }

  /**
   * Watercolour — scene → Kuwahara → (optional Shader Lab bloom) → Cam/FX grading → screen.
   * @param {{ viewportBloom?: boolean }} [options]
   */
  pushCreativeLookWatercolourPresentation({ viewportBloom = false } = {}) {
    if (this._creativeLookWatercolourSnapshot) return;

    this._creativeLookWatercolourSnapshot = this._managedPasses.map(({ pass }) => ({
      enabled: pass.enabled,
      renderToScreen: pass.renderToScreen,
    }));

    const slimPostKeys = new Set([
      'filmPass',
      'grainTintPass',
      'anamorphicBloomPass',
      'aberrationPass',
      'lensDistortionPass',
    ]);
    const gradingKeys = CREATIVE_LOOK_GRADING_PASS_KEYS;

    for (let i = 0; i < this._managedPasses.length; i += 1) {
      const { pass, key } = this._managedPasses[i];
      const snap = this._creativeLookWatercolourSnapshot[i];

      if (key === 'renderPass') {
        pass.enabled = true;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookWatercolourPass') {
        pass.enabled = true;
        pass.renderToScreen = false;
        continue;
      }
      if (viewportBloom) {
        if (
          key === 'creativeLookVectrexPass' ||
          key === 'creativeLookSketchPass' ||
          key === 'creativeLookSketchColourPass' ||
          key === 'creativeLookGouachePass' ||
          key === 'creativeLookOpticsPass' ||
          key === 'creativeLookViewportBloomPass'
        ) {
          pass.enabled = false;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'bloomPass') {
          pass.enabled = true;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'bloomCompositePass' || key === 'bloomTintPass') {
          pass.enabled = true;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'anamorphicBloomPass') {
          pass.enabled = snap.enabled;
          pass.renderToScreen = false;
          continue;
        }
        if (slimPostKeys.has(key)) {
          pass.enabled = snap.enabled;
          pass.renderToScreen = false;
          continue;
        }
      }
      if (CREATIVE_LOOK_GRAIN_PASS_KEYS.has(key)) {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (gradingKeys.has(key)) {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      pass.enabled = false;
      pass.renderToScreen = false;
    }
  }

  popCreativeLookWatercolourPresentation() {
    const snap = this._creativeLookWatercolourSnapshot;
    if (!snap) return;
    this._managedPasses.forEach(({ pass }, i) => {
      pass.enabled = snap[i].enabled;
      pass.renderToScreen = snap[i].renderToScreen;
    });
    if (this.creativeLookWatercolourPass) {
      this.creativeLookWatercolourPass.enabled = false;
    }
    this._creativeLookWatercolourSnapshot = null;
  }

  /** Tear down watercolour presentation if a frame ends mid-stack or preset turns off. */
  releaseCreativeLookWatercolour() {
    if (this._creativeLookWatercolourSnapshot) {
      this.popCreativeLookWatercolourPresentation();
      return;
    }
    if (this.creativeLookWatercolourPass) {
      this.creativeLookWatercolourPass.enabled = false;
    }
  }

  /**
   * Gouache — scene → flat poster composite → (optional Shader Lab bloom) → Cam/FX grading → screen.
   * @param {{ viewportBloom?: boolean }} [options]
   */
  pushCreativeLookGouachePresentation({ viewportBloom = false } = {}) {
    if (this._creativeLookGouacheSnapshot) return;

    this._creativeLookGouacheSnapshot = this._managedPasses.map(({ pass }) => ({
      enabled: pass.enabled,
      renderToScreen: pass.renderToScreen,
    }));

    const slimPostKeys = new Set([
      'filmPass',
      'grainTintPass',
      'anamorphicBloomPass',
      'aberrationPass',
      'lensDistortionPass',
    ]);
    const gradingKeys = CREATIVE_LOOK_GRADING_PASS_KEYS;

    for (let i = 0; i < this._managedPasses.length; i += 1) {
      const { pass, key } = this._managedPasses[i];
      const snap = this._creativeLookGouacheSnapshot[i];

      if (key === 'renderPass') {
        pass.enabled = true;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookGouachePass') {
        pass.enabled = true;
        pass.renderToScreen = false;
        continue;
      }
      if (viewportBloom) {
        if (
          key === 'creativeLookVectrexPass' ||
          key === 'creativeLookWatercolourPass' ||
          key === 'creativeLookSketchPass' ||
          key === 'creativeLookSketchColourPass' ||
          key === 'creativeLookViewportBloomPass'
        ) {
          pass.enabled = false;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'bloomPass') {
          pass.enabled = true;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'bloomCompositePass' || key === 'bloomTintPass') {
          pass.enabled = true;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'anamorphicBloomPass') {
          pass.enabled = snap.enabled;
          pass.renderToScreen = false;
          continue;
        }
        if (slimPostKeys.has(key)) {
          pass.enabled = snap.enabled;
          pass.renderToScreen = false;
          continue;
        }
      }
      if (CREATIVE_LOOK_GRAIN_PASS_KEYS.has(key)) {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (gradingKeys.has(key)) {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      pass.enabled = false;
      pass.renderToScreen = false;
    }
  }

  popCreativeLookGouachePresentation() {
    const snap = this._creativeLookGouacheSnapshot;
    if (!snap) return;
    this._managedPasses.forEach(({ pass }, i) => {
      pass.enabled = snap[i].enabled;
      pass.renderToScreen = snap[i].renderToScreen;
    });
    if (this.creativeLookGouachePass) {
      this.creativeLookGouachePass.enabled = false;
    }
    this._creativeLookGouacheSnapshot = null;
  }

  /** Tear down gouache presentation if a frame ends mid-stack or preset turns off. */
  releaseCreativeLookGouache() {
    if (this._creativeLookGouacheSnapshot) {
      this.popCreativeLookGouachePresentation();
      return;
    }
    if (this.creativeLookGouachePass) {
      this.creativeLookGouachePass.enabled = false;
    }
  }

  /**
   * Optics — scene → thermal / night-vision grade → (optional bloom) → grading → screen.
   * @param {{ viewportBloom?: boolean }} [options]
   */
  pushCreativeLookOpticsPresentation({ viewportBloom = false } = {}) {
    if (this._creativeLookOpticsSnapshot) return;

    this._creativeLookOpticsSnapshot = this._managedPasses.map(({ pass }) => ({
      enabled: pass.enabled,
      renderToScreen: pass.renderToScreen,
    }));

    const slimPostKeys = new Set([
      'filmPass',
      'grainTintPass',
      'anamorphicBloomPass',
      'aberrationPass',
      'lensDistortionPass',
    ]);
    const gradingKeys = CREATIVE_LOOK_GRADING_PASS_KEYS;

    for (let i = 0; i < this._managedPasses.length; i += 1) {
      const { pass, key } = this._managedPasses[i];
      const snap = this._creativeLookOpticsSnapshot[i];

      if (key === 'renderPass') {
        pass.enabled = true;
        pass.renderToScreen = false;
        continue;
      }
      if (key === 'creativeLookOpticsPass') {
        pass.enabled = true;
        pass.renderToScreen = false;
        continue;
      }
      if (viewportBloom) {
        if (
          key === 'creativeLookVectrexPass' ||
          key === 'creativeLookWatercolourPass' ||
          key === 'creativeLookSketchPass' ||
          key === 'creativeLookSketchColourPass' ||
          key === 'creativeLookGouachePass' ||
          key === 'creativeLookOpticsPass' ||
          key === 'creativeLookViewportBloomPass'
        ) {
          pass.enabled = false;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'bloomPass') {
          pass.enabled = true;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'bloomCompositePass' || key === 'bloomTintPass') {
          pass.enabled = true;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'anamorphicBloomPass') {
          pass.enabled = snap.enabled;
          pass.renderToScreen = false;
          continue;
        }
        if (slimPostKeys.has(key)) {
          pass.enabled = snap.enabled;
          pass.renderToScreen = false;
          continue;
        }
      }
      if (CREATIVE_LOOK_GRAIN_PASS_KEYS.has(key)) {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (gradingKeys.has(key)) {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      pass.enabled = false;
      pass.renderToScreen = false;
    }
  }

  popCreativeLookOpticsPresentation() {
    const snap = this._creativeLookOpticsSnapshot;
    if (!snap) return;
    this._managedPasses.forEach(({ pass }, i) => {
      pass.enabled = snap[i].enabled;
      pass.renderToScreen = snap[i].renderToScreen;
    });
    if (this.creativeLookOpticsPass) {
      this.creativeLookOpticsPass.enabled = false;
    }
    this._creativeLookOpticsSnapshot = null;
  }

  releaseCreativeLookOptics() {
    if (this._creativeLookOpticsSnapshot) {
      this.popCreativeLookOpticsPresentation();
      return;
    }
    if (this.creativeLookOpticsPass) {
      this.creativeLookOpticsPass.enabled = false;
    }
  }

  /** Shader Lab thermal / night-vision — full-viewport false-color grade. */
  updateCreativeLookOptics(settings) {
    this.creativeLookOptics?.updateSettings(settings ?? {});
  }

  /**
   * Sketch family — scene → (optional wash) → stipple + ink → (optional bloom) → grading → screen.
   * @param {{ viewportBloom?: boolean, passKey?: 'creativeLookSketchPass' | 'creativeLookSketchColourPass' }} [options]
   */
  pushCreativeLookSketchPresentation({
    viewportBloom = false,
    passKey = 'creativeLookSketchPass',
  } = {}) {
    if (this._creativeLookSketchSnapshot) {
      if (this._creativeLookSketchActivePassKey === passKey) return;
      this.popCreativeLookSketchPresentation();
    }

    this._creativeLookSketchActivePassKey = passKey;
    this._creativeLookSketchSnapshot = this._managedPasses.map(({ pass }) => ({
      enabled: pass.enabled,
      renderToScreen: pass.renderToScreen,
    }));

    const sketchFamilyKeys = new Set([
      'creativeLookSketchPass',
      'creativeLookSketchColourPass',
    ]);

    const slimPostKeys = new Set([
      'filmPass',
      'grainTintPass',
      'anamorphicBloomPass',
      'aberrationPass',
      'lensDistortionPass',
    ]);
    const gradingKeys = CREATIVE_LOOK_GRADING_PASS_KEYS;

    for (let i = 0; i < this._managedPasses.length; i += 1) {
      const { pass, key } = this._managedPasses[i];
      const snap = this._creativeLookSketchSnapshot[i];

      if (key === 'renderPass') {
        pass.enabled = true;
        pass.renderToScreen = false;
        continue;
      }
      if (key === passKey) {
        pass.enabled = true;
        pass.renderToScreen = false;
        continue;
      }
      if (sketchFamilyKeys.has(key)) {
        pass.enabled = false;
        pass.renderToScreen = false;
        continue;
      }
      if (viewportBloom) {
        if (
          key === 'creativeLookVectrexPass' ||
          key === 'creativeLookWatercolourPass' ||
          key === 'creativeLookGouachePass' ||
          key === 'creativeLookOpticsPass' ||
          key === 'creativeLookViewportBloomPass'
        ) {
          pass.enabled = false;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'bloomPass') {
          pass.enabled = true;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'bloomCompositePass' || key === 'bloomTintPass') {
          pass.enabled = true;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'anamorphicBloomPass') {
          pass.enabled = snap.enabled;
          pass.renderToScreen = false;
          continue;
        }
        if (slimPostKeys.has(key)) {
          pass.enabled = snap.enabled;
          pass.renderToScreen = false;
          continue;
        }
      }
      if (CREATIVE_LOOK_GRAIN_PASS_KEYS.has(key)) {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      if (gradingKeys.has(key)) {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }
      pass.enabled = false;
      pass.renderToScreen = false;
    }
  }

  popCreativeLookSketchPresentation() {
    const snap = this._creativeLookSketchSnapshot;
    if (!snap) return;
    this._managedPasses.forEach(({ pass }, i) => {
      pass.enabled = snap[i].enabled;
      pass.renderToScreen = snap[i].renderToScreen;
    });
    if (this.creativeLookSketchPass) {
      this.creativeLookSketchPass.enabled = false;
    }
    if (this.creativeLookSketchColourPass) {
      this.creativeLookSketchColourPass.enabled = false;
    }
    this._creativeLookSketchActivePassKey = null;
    this._creativeLookSketchSnapshot = null;
  }

  /** Tear down sketch presentation if a frame ends mid-stack or preset turns off. */
  releaseCreativeLookSketch() {
    if (this._creativeLookSketchSnapshot) {
      this.popCreativeLookSketchPresentation();
      return;
    }
    if (this.creativeLookSketchPass) {
      this.creativeLookSketchPass.enabled = false;
    }
    if (this.creativeLookSketchColourPass) {
      this.creativeLookSketchColourPass.enabled = false;
    }
  }

  /** @param {number} filter — THREE.NearestFilter or THREE.LinearFilter */
  _setComposerBufferFilter(filter) {
    const composer = this.composer;
    if (!composer?.renderTarget1) return;
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
      if (rt?.texture) {
        rt.texture.minFilter = filter;
        rt.texture.magFilter = filter;
      }
    }
  }

  /**
   * ASCII Art terminal mode — scene → luminance → hard glyphs → (optional bloom) → (optional grain) → grading → screen.
   * Skips FXAA and chromatic aberration. Glyphs stay nearest-sampled;
   * when bloom is on, composer buffers stay NearestFilter so glyphs stay 1:1 crisp.
   */
  pushCreativeLookAsciiPresentation() {
    if (this._creativeLookAsciiSnapshot) return;

    this._creativeLookAsciiSnapshot = this._managedPasses.map(({ pass }) => ({
      enabled: pass.enabled,
      renderToScreen: pass.renderToScreen,
    }));

    const bloomActive = this._asciiBloomActive === true;
    const bloomKeys = new Set([
      'bloomPass',
      'bloomCompositePass',
      'bloomTintPass',
      'anamorphicBloomPass',
    ]);

    const rt = this.composer?.renderTarget1?.texture;
    if (rt) {
      this._composerFilterRestore = { min: rt.minFilter, mag: rt.magFilter };
      this._setComposerBufferFilter(THREE.NearestFilter);
    }

    for (let i = 0; i < this._managedPasses.length; i += 1) {
      const { pass, key } = this._managedPasses[i];
      const snap = this._creativeLookAsciiSnapshot[i];

      if (
        key === 'renderPass' ||
        key === 'creativeLookAsciiPass' ||
        key === 'creativeLookEgaPass' ||
        key === 'creativeLookC64Pass' ||
        key === 'creativeLookGameBoyPass' ||
        key === 'creativeLookNesPass' ||
        key === 'creativeLookMegaDrivePass' ||
        key === 'creativeLookIntellivisionPass' ||
        key === 'creativeLookGbaPass' ||
        key === 'creativeLookApple2Pass' ||
        key === 'creativeLookDitherPass'
      ) {
        pass.enabled = true;
        pass.renderToScreen = false;
        continue;
      }

      if (key === 'creativeLookVectrexPass' || key === 'creativeLookWatercolourPass' || key === 'creativeLookSketchPass' || key === 'creativeLookSketchColourPass' || key === 'creativeLookGouachePass' || key === 'creativeLookOpticsPass') {
        pass.enabled = false;
        pass.renderToScreen = false;
        continue;
      }

      if (bloomActive && bloomKeys.has(key)) {
        if (key === 'bloomPass') {
          pass.enabled = true;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'bloomCompositePass' || key === 'bloomTintPass') {
          pass.enabled = true;
          pass.renderToScreen = false;
          continue;
        }
        if (key === 'anamorphicBloomPass') {
          pass.enabled = this._asciiAnamorphicActive ? snap.enabled : false;
          pass.renderToScreen = false;
          continue;
        }
      }

      if (CREATIVE_LOOK_GRADING_PASS_KEYS.has(key)) {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }

      if (CREATIVE_LOOK_GRAIN_PASS_KEYS.has(key)) {
        pass.enabled = snap.enabled;
        pass.renderToScreen = false;
        continue;
      }

      pass.enabled = false;
      pass.renderToScreen = false;
    }
    this._applyFlatPostPassEnabled();
  }

  _applyFlatPostPassEnabled() {
    const variant = this._flatPostVariant;
    if (this.creativeLookAsciiPass) {
      this.creativeLookAsciiPass.enabled = variant === 'ascii';
    }
    if (this.creativeLookEgaPass) {
      this.creativeLookEgaPass.enabled = variant === 'ega-pixel';
    }
    if (this.creativeLookC64Pass) {
      this.creativeLookC64Pass.enabled = variant === 'c64-pixel';
    }
    if (this.creativeLookGameBoyPass) {
      this.creativeLookGameBoyPass.enabled = variant === 'gameboy-pixel';
    }
    if (this.creativeLookNesPass) {
      this.creativeLookNesPass.enabled = variant === 'nes-pixel';
    }
    if (this.creativeLookMegaDrivePass) {
      this.creativeLookMegaDrivePass.enabled = variant === 'megadrive-pixel';
    }
    if (this.creativeLookIntellivisionPass) {
      this.creativeLookIntellivisionPass.enabled = variant === 'intellivision-pixel';
    }
    if (this.creativeLookGbaPass) {
      this.creativeLookGbaPass.enabled = variant === 'gba-pixel';
    }
    if (this.creativeLookApple2Pass) {
      this.creativeLookApple2Pass.enabled = variant === 'apple2-pixel';
    }
    if (this.creativeLookDitherPass) {
      this.creativeLookDitherPass.enabled =
        variant === 'dither-neutral'
        || variant === 'dither-tritone'
        || variant === 'dither-crosshatch'
        || variant === 'dither-raster';
    }
    if (this.creativeLookWatercolourPass && !this._creativeLookWatercolourSnapshot) {
      this.creativeLookWatercolourPass.enabled = false;
    }
    if (this.creativeLookSketchPass && !this._creativeLookSketchSnapshot) {
      this.creativeLookSketchPass.enabled = false;
    }
    if (this.creativeLookSketchColourPass && !this._creativeLookSketchSnapshot) {
      this.creativeLookSketchColourPass.enabled = false;
    }
    if (this.creativeLookGouachePass && !this._creativeLookGouacheSnapshot) {
      this.creativeLookGouachePass.enabled = false;
    }
    if (this.creativeLookOpticsPass && !this._creativeLookOpticsSnapshot) {
      this.creativeLookOpticsPass.enabled = false;
    }
  }

  popCreativeLookAsciiPresentation() {
    const snap = this._creativeLookAsciiSnapshot;
    if (!snap) return;
    this._managedPasses.forEach(({ pass }, i) => {
      pass.enabled = snap[i].enabled;
      pass.renderToScreen = snap[i].renderToScreen;
    });
    if (this._composerFilterRestore) {
      this._setComposerBufferFilter(this._composerFilterRestore.min);
      this._composerFilterRestore = null;
    }
    this._creativeLookAsciiSnapshot = null;
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
   * Update depth of field (Martins Upitis BokehShader2 — three.js dof2).
   * @param {Object} settings
   * @param {{ zoomAttenuation?: number, focalLengthMm?: number, cameraNear?: number, cameraFar?: number, camera?: import('three').PerspectiveCamera, groundPlaneY?: number, groundPlaneEnabled?: boolean, modelViewDepthSpan?: number | null }} [opts]
   */
  updateDof(settings, opts = {}) {
    if (!settings) return;
    const qualityId = normalizeDofQualityId(settings.quality);
    const wants =
      settings.enabled === undefined ? true : Boolean(settings.enabled);
    const active = wants && settings.aperture > 0.0001;
    if (this.bokehPass) {
      this.bokehPass.enabled = active;
    }
    if (!active) return;

    const camera = opts.camera ?? this.bokehPass?.camera ?? null;
    const near = opts.cameraNear ?? camera?.near ?? 0.1;
    const far = opts.cameraFar ?? camera?.far ?? 100;
    const zoomMul =
      typeof opts.zoomAttenuation === 'number' && Number.isFinite(opts.zoomAttenuation)
        ? Math.min(1, Math.max(0, opts.zoomAttenuation))
        : 1;
    const focusDistance = Math.max(
      DOF_FOCUS_MIN_M,
      typeof settings.focus === 'number' && !Number.isNaN(settings.focus)
        ? settings.focus
        : DOF_FOCUS_MIN_M,
    );
    const focalDepth = focusDistanceToBokehFocalDepth(focusDistance, camera, near, far);
    const fgMul = clampDofBlurMul(settings.foregroundBlur);
    const bgMul = clampDofBlurMul(settings.backgroundBlur);
    const aperture = Math.max(0.0001, settings.aperture ?? 0.003);

    const fstop = THREE.MathUtils.clamp(0.014 / aperture, 1.4, 16);
    const maxblur = THREE.MathUtils.clamp(
      0.45 + aperture * 90 * zoomMul,
      0.35,
      2.5,
    );

    this.bokehPass.applySettings?.({
      focalDepth,
      focalLengthMm: opts.focalLengthMm ?? 35,
      fstop,
      maxblur,
      foregroundBlur: fgMul,
      backgroundBlur: bgMul,
      focusMode: settings.focusMode,
      groundPlaneY: opts.groundPlaneY,
      groundPlaneEnabled: opts.groundPlaneEnabled,
      modelViewDepthSpan: opts.modelViewDepthSpan ?? null,
    });
    this.bokehPass.setDofQualityTier?.(qualityId);
  }

  /**
   * Screen-space volumetric light shafts (after DOF, before bloom).
   * @param {object} settings
   * @param {{ forceOff?: boolean }} [opts]
   */
  updateGodRays(settings, { forceOff = false } = {}) {
    if (!this.godRaysPass) return;
    this.godRaysPass.enabled = !forceOff && !!settings?.enabled;
  }

  /**
   * Shader Lab ASCII Art — screen-space glyph pass after the luminance prepass.
   * @param {{ enabled?: boolean, intensity?: number }} settings
   */
  updateCreativeLookAscii(settings) {
    this.creativeLookAscii?.updateSettings(settings ?? {});
  }

  /** Shader Lab EGA Pixel — screen-space 640×350 palette crush after the colormap prepass. */
  updateCreativeLookEga(settings) {
    this.creativeLookEga?.updateSettings(settings ?? {});
  }

  /** Shader Lab C64 Pixel — screen-space palette crush after the colormap prepass. */
  updateCreativeLookC64(settings) {
    this.creativeLookC64?.updateSettings(settings ?? {});
  }

  /** Shader Lab Game Boy — 4-shade DMG post pass. */
  updateCreativeLookGameBoy(settings) {
    this.creativeLookGameBoy?.updateSettings(settings ?? {});
  }

  /** Shader Lab NES — 2C02 PPU system palette post pass. */
  updateCreativeLookNes(settings) {
    this.creativeLookNes?.updateSettings(settings ?? {});
  }

  /** Shader Lab Mega Drive — 9-bit VDP palette post pass. */
  updateCreativeLookMegaDrive(settings) {
    this.creativeLookMegaDrive?.updateSettings(settings ?? {});
  }

  /** Shader Lab Intellivision — STIC 16-color palette post pass. */
  updateCreativeLookIntellivision(settings) {
    this.creativeLookIntellivision?.updateSettings(settings ?? {});
  }

  /** Shader Lab Game Boy Advance — 15-bit high-color post pass. */
  updateCreativeLookGba(settings) {
    this.creativeLookGba?.updateSettings(settings ?? {});
  }

  /** Shader Lab Apple II — HGR NTSC artifact post pass. */
  updateCreativeLookApple2(settings) {
    this.creativeLookApple2?.updateSettings(settings ?? {});
  }

  /** Shader Lab Dither — neutral 4×4 Bayer ordered dither post pass. */
  updateCreativeLookDither(settings) {
    this.creativeLookDither?.updateSettings(settings ?? {});
  }

  /** Shader Lab Vectrex — phosphor persistence + bloom post pass. */
  updateCreativeLookVectrex(settings) {
    this.creativeLookVectrex?.updateSettings(settings ?? {});
  }

  /** Shader Lab Watercolour — Kuwahara painterly post pass. */
  updateCreativeLookWatercolour(settings) {
    this.creativeLookWatercolour?.updateSettings(settings ?? {});
  }

  /** Shader Lab Sketch — stipple grain + ink outline post pass. */
  updateCreativeLookSketch(settings) {
    this.creativeLookSketch?.updateSettings(settings ?? {});
  }

  /** Shader Lab Sketch Colour — coloured wash + manga screentone + ink. */
  updateCreativeLookSketchColour(settings) {
    this.creativeLookSketchColour?.updateSettings(settings ?? {});
  }

  /** Shader Lab Gouache — flat poster blocks + chalk grain + ink outlines. */
  updateCreativeLookGouache(settings) {
    this.creativeLookGouache?.updateSettings(settings ?? {});
  }

  /**
   * @param {{ enabled?: boolean, variant?: 'ascii' | 'ega-pixel' | 'c64-pixel' | 'gameboy-pixel' | 'gba-pixel' | 'nes-pixel' | 'megadrive-pixel' | 'intellivision-pixel' | 'apple2-pixel' | 'dither-neutral' | 'dither-tritone' | 'dither-crosshatch' | null }} mode
   */
  setCreativeLookFlatPostMode(mode = {}) {
    const enabled = mode.enabled === true;
    this._flatPostVariant = enabled ? (mode.variant ?? 'ascii') : null;
    this._applyFlatPostPassEnabled();
  }

  /**
   * Update bloom settings
   * @param {Object} settings - Bloom settings object
   */
  updateBloom(settings) {
    if (!settings) return;
    this._lastBloomSettings = settings;
    this.creativeLookViewportBloom?.updateSettings(settings);

    const thresh = Number(settings.threshold);
    const strength = Number(settings.strength);
    const rad = Number(settings.radius);
    if (this.bloomPass) {
      if (Number.isFinite(thresh)) {
        this.bloomPass.threshold = THREE.MathUtils.clamp(thresh, 0, 1);
      }
      if (Number.isFinite(strength)) {
        this.bloomPass.strength = Math.max(0, strength);
      }
      if (Number.isFinite(rad)) {
        this.bloomPass.radius = THREE.MathUtils.clamp(rad, 0, 1);
      }
    }

    const wants =
      settings.enabled === undefined ? true : Boolean(settings.enabled);
    const active = wants && (Number(settings.strength ?? 0) > 0.0001);
    if (this.bloomPass) {
      this.bloomPass.enabled = active;
    }
    if (this.bloomCompositeController) {
      if (!active) {
        this.bloomCompositeController.setBloomTint(false);
      } else {
        this.bloomCompositeController.setBloomTint(true, settings);
      }
      return;
    }
    if (this.bloomTintPass) {
      this.bloomTintPass.enabled = active;
    }
    if (!active) return;
    this.bloomTintPass.uniforms.tint.value = new THREE.Color(settings.color);
    const tintStrength = THREE.MathUtils.clamp(
      (Number.isFinite(strength) ? strength : 0.2) * 7.5,
      0,
      15.0,
    );
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
    if (settings != null) {
      this._lastAnamorphicBloomSettings = settings;
      this._lastAnamorphicBloomForceOff = forceOff;
    }
    if (this.bloomCompositeController) {
      this.bloomCompositeController.setAnamorphic(settings, { forceOff });
      return;
    }
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
   * Update grain settings
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
    if (this.gradingController) {
      this.gradingController.setToneMapping(value);
      return;
    }
    if (value === 'linear') value = 'none';
    const toneMappingMap = {
      'none': 0,
      'reinhard': 2,
      'aces-filmic': 4,
    };

    const toneMappingValue = toneMappingMap[value] ?? 4;

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
   * Deterministic grain phase for offline export (no interactive rAF loop).
   * @param {number} elapsedSec — wall time from clip start (frameIndex / fps)
   */
  setGrainTimeForExport(elapsedSec) {
    if (!this.grainTintPass?.enabled || !this.grainTintPass.uniforms?.time) {
      return;
    }
    const t = Math.max(0, Number(elapsedSec) || 0);
    this.grainTime = t * 60;
    this.grainTintPass.uniforms.time.value = this.grainTime;
  }

  /**
   * Suppress film grain for SVG vector capture — noise traces as thousands of micro-paths.
   * Also zeros Shader Lab chalk grain (sketch / gouache) while leaving ink and colour bands.
   * @returns {{ filmPass?: boolean, grainTintPass?: boolean, creativeLookGrainScales: Array<number | null> }}
   */
  beginSvgExportGrainSuppression() {
    const snapshot = {
      filmPass: this.filmPass?.enabled,
      grainTintPass: this.grainTintPass?.enabled,
      creativeLookGrainScales: [],
    };
    if (this.filmPass) this.filmPass.enabled = false;
    if (this.grainTintPass) this.grainTintPass.enabled = false;
    for (const look of [
      this.creativeLookSketch,
      this.creativeLookSketchColour,
      this.creativeLookGouache,
    ]) {
      const u = look?.pass?._compositeMat?.uniforms?.uGrainScale;
      if (u) {
        snapshot.creativeLookGrainScales.push(u.value);
        u.value = 0;
      } else {
        snapshot.creativeLookGrainScales.push(null);
      }
    }
    return snapshot;
  }

  /**
   * @param {{ filmPass?: boolean, grainTintPass?: boolean, creativeLookGrainScales: Array<number | null> } | null | undefined} snapshot
   */
  endSvgExportGrainSuppression(snapshot) {
    if (!snapshot) return;
    if (this.filmPass && snapshot.filmPass !== undefined) {
      this.filmPass.enabled = snapshot.filmPass;
    }
    if (this.grainTintPass && snapshot.grainTintPass !== undefined) {
      this.grainTintPass.enabled = snapshot.grainTintPass;
    }
    const looks = [
      this.creativeLookSketch,
      this.creativeLookSketchColour,
      this.creativeLookGouache,
    ];
    looks.forEach((look, i) => {
      const prev = snapshot.creativeLookGrainScales[i];
      const u = look?.pass?._compositeMat?.uniforms?.uGrainScale;
      if (u && prev !== null && prev !== undefined) {
        u.value = prev;
      }
    });
  }

  /**
   * Set manual / auto exposure multiplier
   * @param {number} value
   */
  setExposure(value) {
    if (this.gradingController) {
      this.gradingController.setExposure(value);
    } else if (this.exposurePass?.uniforms?.exposure) {
      this.exposurePass.uniforms.exposure.value = value;
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
    if (this.gradingController) {
      this.gradingController.setVignette(value);
      return;
    }
    if (this.toneMappingPass) {
      this.toneMappingPass.uniforms.vignetteIntensity.value = value;
    }
  }

  /**
   * Set vignette color
   * @param {string} color - Vignette color (hex string, default '#080808')
   */
  setVignetteColor(color) {
    if (this.gradingController) {
      this.gradingController.setVignetteColor(color);
      return;
    }
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

