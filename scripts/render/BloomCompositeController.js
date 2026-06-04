import * as THREE from 'three';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/ShaderPass.js';
import { buildBloomCompositeShader } from '../shaders/index.js';
import {
  ANAMORPHIC_BLOOM_SPREAD_MAX,
  foldAnamorphicStreakAngleDeg,
  resolveAnamorphicBloomQualityTier,
} from '../constants.js';

/**
 * Bloom tint + anamorphic streak in one fullscreen pass (after UnrealBloomPass).
 */
export class BloomCompositeController {
  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {number} initialSampleRadius
   */
  constructor(renderer, initialSampleRadius) {
    this.renderer = renderer;
    this._sampleRadius = Math.max(1, Math.min(64, Math.floor(initialSampleRadius)));
    this._bloomTintActive = false;
    this._anamorphicActive = false;

    const shader = buildBloomCompositeShader(this._sampleRadius);
    this.pass = new ShaderPass(shader);
    this.uniforms = this.pass.uniforms;
    this.pass.enabled = false;

    if (renderer) {
      const size = new THREE.Vector2();
      renderer.getSize(size);
      this.setResolution(size.x, size.y);
    }
  }

  getPass() {
    return this.pass;
  }

  setResolution(width, height) {
    if (this.uniforms.resolution) {
      this.uniforms.resolution.value.set(width, height);
    }
  }

  /**
   * @param {boolean} active
   * @param {object} [settings]
   */
  setBloomTint(active, settings = {}) {
    this._bloomTintActive = !!active;
    if (!active) {
      if (this.uniforms.bloomTintStrength) {
        this.uniforms.bloomTintStrength.value = 0;
      }
      this._syncPassEnabled();
      return;
    }
    if (this.uniforms.bloomTint) {
      this.uniforms.bloomTint.value = new THREE.Color(settings.color ?? '#ffe9cc');
    }
    const strength =
      typeof settings.strength === 'number' && !Number.isNaN(settings.strength)
        ? settings.strength
        : 1.2;
    if (this.uniforms.bloomTintStrength) {
      this.uniforms.bloomTintStrength.value = THREE.MathUtils.clamp(
        strength * 7.5,
        0,
        15.0,
      );
    }
    this._syncPassEnabled();
  }

  /**
   * @param {object} settings
   * @param {{ forceOff?: boolean }} [opts]
   */
  setAnamorphic(settings, { forceOff = false } = {}) {
    if (forceOff || !settings?.enabled) {
      this._anamorphicActive = false;
      if (this.uniforms.anamorphicStrength) {
        this.uniforms.anamorphicStrength.value = 0;
      }
      this._syncPassEnabled();
      return;
    }

    const tier = resolveAnamorphicBloomQualityTier(settings.quality);
    this._ensureSampleRadius(tier.sampleRadius);

    const spread = THREE.MathUtils.clamp(
      typeof settings.spread === 'number' && !Number.isNaN(settings.spread)
        ? settings.spread
        : 0.2,
      0,
      ANAMORPHIC_BLOOM_SPREAD_MAX,
    );
    const rawThreshold =
      typeof settings.threshold === 'number' && !Number.isNaN(settings.threshold)
        ? settings.threshold
        : 0.7;
    const threshold = THREE.MathUtils.clamp(rawThreshold, 0, 2);
    let soften =
      typeof settings.soften === 'number' && !Number.isNaN(settings.soften)
        ? Math.max(1e-4, settings.soften)
        : 0.12;
    if (threshold > 1.0) {
      soften += (threshold - 1.0) * 0.72;
    }
    soften = Math.min(soften, 2.5);

    const u = this.uniforms;
    u.threshold.value = threshold;
    u.soften.value = soften;
    u.anamorphicStrength.value =
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

    this._anamorphicActive = true;
    this._syncPassEnabled();
  }

  /** Disable both bloom tint and anamorphic (e.g. creative look / quality tier). */
  forceOff() {
    this._bloomTintActive = false;
    this._anamorphicActive = false;
    if (this.uniforms.bloomTintStrength) {
      this.uniforms.bloomTintStrength.value = 0;
    }
    if (this.uniforms.anamorphicStrength) {
      this.uniforms.anamorphicStrength.value = 0;
    }
    this.pass.enabled = false;
  }

  _syncPassEnabled() {
    this.pass.enabled = this._bloomTintActive || this._anamorphicActive;
  }

  _ensureSampleRadius(sampleRadius) {
    const r = Math.max(1, Math.min(64, Math.floor(sampleRadius)));
    if (r === this._sampleRadius) return;
    this._sampleRadius = r;
    const shader = buildBloomCompositeShader(r);
    const u = this.uniforms;
    for (const key of Object.keys(shader.uniforms)) {
      if (!Object.prototype.hasOwnProperty.call(u, key)) {
        u[key] = shader.uniforms[key];
      }
    }
    this.pass.material.dispose();
    this.pass.material = new THREE.ShaderMaterial({
      name: 'BloomCompositePass',
      uniforms: u,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
    });
  }
}
