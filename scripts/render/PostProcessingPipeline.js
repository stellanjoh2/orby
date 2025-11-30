import * as THREE from 'three';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/FilmPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/shaders/FXAAShader.js';
import {
  BloomTintShader,
  GrainTintShader,
  AberrationShader,
  ExposureShader,
  ToneMappingShader,
  LensDirtShader,
} from '../shaders/index.js';
import { ColorAdjustController } from './ColorAdjustController.js';
import {
  CAMERA_TEMPERATURE_MIN_K,
  CAMERA_TEMPERATURE_MAX_K,
  CAMERA_TEMPERATURE_NEUTRAL_K,
} from '../constants.js';

export class PostProcessingPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = new THREE.Vector2();
    this.renderer.getSize(size);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(scene, camera);
    // clearAlpha = 1 ensures the background color shows when scene.background is null
    this.renderPass.clearAlpha = 1;

    this.bokehPass = new BokehPass(scene, camera, {
      focus: 10,
      aperture: 0.003,
      maxblur: 0.01,
      rings: 3, // Reduced rings to minimize artifacts (default is 3)
      sides: 5, // Reduced sides for smoother, less artifact-prone bokeh (default is 5)
    });

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      1.2,
      0.35,
      0.85,
    );

    this.filmPass = new FilmPass(0.0, 0.0, 648, false);
    this.bloomTintPass = new ShaderPass(BloomTintShader);
    this.grainTintPass = new ShaderPass(GrainTintShader);
    this.grainTime = 0;
    this.grainTintPass.uniforms.time.value = 0;

    this.lensDirtPass = new ShaderPass(LensDirtShader);
    this.lensDirtPass.enabled = false;

    this.aberrationPass = new ShaderPass(AberrationShader);
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
    this.toneMappingPass.renderToScreen = true;

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bokehPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.bloomTintPass);
    this.composer.addPass(this.lensDirtPass);
    this.composer.addPass(this.filmPass);
    this.composer.addPass(this.grainTintPass);
    this.composer.addPass(this.aberrationPass);
    this.composer.addPass(this.fxaaPass);
    this.composer.addPass(this.exposurePass);
    this.composer.addPass(this.colorAdjustPass);
    this.composer.addPass(this.toneMappingPass);
  }

  /**
   * Update depth of field settings
   * @param {Object} settings - DOF settings object
   */
  updateDof(settings) {
    if (!settings) return;
    const wants =
      settings.enabled === undefined ? true : Boolean(settings.enabled);
    // Use aperture to determine if DOF should be active (very small aperture = minimal blur)
    const active = wants && settings.aperture > 0.0001;
    if (this.bokehPass) {
      this.bokehPass.enabled = active;
    }
    if (!active) return;
    this.bokehPass.uniforms.focus.value = settings.focus;
    this.bokehPass.uniforms.aperture.value = settings.aperture;
    // Calculate maxblur from aperture - smaller aperture = more blur
    // Very conservative maxblur range (0.01-0.04) for smooth, camera-like DOF
    // This prevents harsh edges and ghosting artifacts, especially on backgrounds
    // Real camera DOF is subtle and smooth, not aggressive
    const maxblur = Math.min(0.04, Math.max(0.01, settings.aperture * 15));
    this.bokehPass.uniforms.maxblur.value = maxblur;
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

  /**
   * Update film grain settings
   * @param {Object} settings - Grain settings object
   */
  updateGrain(settings) {
    if (!settings) return;
    const wants =
      settings.enabled === undefined ? true : Boolean(settings.enabled);
    
    // Always keep passes enabled to prevent exposure pop
    // Instead, set intensity to 0 when disabled
    const intensity = wants ? (settings.intensity || 0) : 0;
    
    if (this.filmPass) {
      // FilmPass uses material.uniforms, not direct uniforms
      const material = this.filmPass.material;
      if (material && material.uniforms) {
        // Keep FilmPass enabled but set intensity to 0 when disabled
        this.filmPass.enabled = true;
        if (material.uniforms.nIntensity) {
          material.uniforms.nIntensity.value = intensity * 0.5;
        }
        // Also set sIntensity (scanline intensity) to 0 to fully disable FilmPass grain
        if (material.uniforms.sIntensity) {
          material.uniforms.sIntensity.value = intensity * 0.5;
        }
      }
    }
    if (this.grainTintPass) {
      // Keep GrainTintPass enabled but set intensity to 0 when disabled
      this.grainTintPass.enabled = true;
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
    if (!settings) return;
    const wants =
      settings.enabled === undefined ? true : Boolean(settings.enabled);
    const active =
      wants &&
      settings.strength > 0.0001 &&
      Math.abs(settings.offset) > 0.0001;
    if (this.aberrationPass) {
      this.aberrationPass.enabled = active;
    }
    if (!active) return;
    this.aberrationPass.uniforms.offset.value = settings.offset;
    this.aberrationPass.uniforms.strength.value = settings.strength;
  }

  /**
   * Set tone mapping mode
   * @param {string} value - Tone mapping mode ('none', 'linear', 'reinhard', 'aces-filmic')
   */
  setToneMapping(value) {
    // Map UI values to shader pass values (0=none, 1=linear, 2=reinhard, 4=aces-filmic)
    const toneMappingMap = {
      'none': 0,
      'linear': 1,
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
    if (this.grainTintPass && this.grainTintPass.uniforms?.time) {
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
   * @param {string} color - Vignette color (hex string, default '#000000')
   */
  setVignetteColor(color) {
    if (this.toneMappingPass) {
      this.toneMappingPass.uniforms.vignetteColor.value = new THREE.Color(color);
    }
  }
}

