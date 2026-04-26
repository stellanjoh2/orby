import * as THREE from 'three';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/ShaderPass.js';
import { ColorAdjustShader } from '../shaders/index.js';
import { pchipDydx4 } from '../math/toneCurvePchip.js';

const DEFAULTS = {
  contrast: 1.0,
  saturation: 1.0,
  temperature: 0.0,
  tint: 0.0,
  highlights: 0.0,
  shadows: 0.0,
  clarity: 0.0,
  fade: 0.0,
  sharpness: 0.0,
  toneP1x: 0.25,
  toneP1y: 0.25,
  toneP2x: 0.75,
  toneP2y: 0.75,
};

const TONE_IDENTITY_EPS = 0.002;

export class ColorAdjustController {
  constructor(renderer) {
    this.pass = new ShaderPass(ColorAdjustShader);
    this.uniforms = this.pass.uniforms;
    this.pass.renderToScreen = false;
    this.pass.enabled = true;
    this.renderer = renderer;
    this.reset();
    // Initialize resolution
    if (renderer) {
      const size = new THREE.Vector2();
      renderer.getSize(size);
      this.setResolution(size.x, size.y);
    }
  }

  getPass() {
    return this.pass;
  }

  reset() {
    Object.entries(DEFAULTS).forEach(([key, value]) => {
      if (key === 'toneP1x' || key === 'toneP1y' || key === 'toneP2x' || key === 'toneP2y') {
        return;
      }
      if (this.uniforms[key] && key !== 'resolution') {
        this.uniforms[key].value = value;
      }
    });
    if (this.uniforms.toneP1 && this.uniforms.toneP2) {
      this.uniforms.toneP1.value.set(
        DEFAULTS.toneP1x,
        DEFAULTS.toneP1y,
      );
      this.uniforms.toneP2.value.set(
        DEFAULTS.toneP2x,
        DEFAULTS.toneP2y,
      );
    }
    this._setToneDydxUniform();
    // Ensure resolution is set correctly after reset
    if (this.renderer) {
      const size = new THREE.Vector2();
      this.renderer.getSize(size);
      this.setResolution(size.x, size.y);
    }
    if (this.uniforms.bypass) {
      this.uniforms.bypass.value = 1.0;
    }
    this._updateToneCurveIdentity();
    this._updateBypass();
  }

  setContrast(value) {
    this._setUniform('contrast', value, DEFAULTS.contrast);
  }

  setSaturation(value) {
    this._setUniform('saturation', value, DEFAULTS.saturation);
  }

  setTemperature(value) {
    this._setUniform('temperature', value, DEFAULTS.temperature);
  }

  setTint(value) {
    this._setUniform('tint', value, DEFAULTS.tint);
  }

  setHighlights(value) {
    this._setUniform('highlights', value, DEFAULTS.highlights);
  }

  setShadows(value) {
    this._setUniform('shadows', value, DEFAULTS.shadows);
  }

  setClarity(value) {
    this._setUniform('clarity', value, DEFAULTS.clarity);
  }

  setFade(value) {
    this._setUniform('fade', value, DEFAULTS.fade);
  }

  setSharpness(value) {
    this._setUniform('sharpness', value, DEFAULTS.sharpness);
  }

  /**
   * @param {{ p1: { x: number, y: number }, p2: { x: number, y: number } }} curve
   */
  setToneCurve(curve) {
    if (!this.uniforms.toneP1 || !this.uniforms.toneP2) return;
    const p1 = curve?.p1 ?? { x: 0.25, y: 0.25 };
    const p2 = curve?.p2 ?? { x: 0.75, y: 0.75 };
    this.uniforms.toneP1.value.set(p1.x, p1.y);
    this.uniforms.toneP2.value.set(p2.x, p2.y);
    this._setToneDydxUniform();
    this._updateToneCurveIdentity();
    this._updateBypass();
  }

  _setToneDydxUniform() {
    if (!this.uniforms.toneDydx) return;
    const p1 = this.uniforms.toneP1.value;
    const p2 = this.uniforms.toneP2.value;
    const m = pchipDydx4(p1.x, p1.y, p2.x, p2.y);
    this.uniforms.toneDydx.value.set(m[0], m[1], m[2], m[3]);
  }

  setResolution(width, height) {
    if (this.uniforms.resolution) {
      this.uniforms.resolution.value.set(width, height);
    }
  }

  _setUniform(key, value, fallback) {
    if (!this.uniforms[key]) return;
    this.uniforms[key].value = value ?? fallback;
    this._updateBypass();
  }

  _updateToneCurveIdentity() {
    if (!this.uniforms.toneCurveIdentity || !this.uniforms.toneP1 || !this.uniforms.toneP2) {
      return;
    }
    const p1 = this.uniforms.toneP1.value;
    const p2 = this.uniforms.toneP2.value;
    const onDiag =
      Math.abs(p1.x - p1.y) < TONE_IDENTITY_EPS &&
      Math.abs(p2.x - p2.y) < TONE_IDENTITY_EPS;
    this.uniforms.toneCurveIdentity.value = onDiag ? 1.0 : 0.0;
  }

  _updateBypass() {
    if (!this.uniforms.bypass) return;
    this._updateToneCurveIdentity();
    // Check all defaults except resolution (which is always set)
    const isDefault = Object.entries(DEFAULTS).every(([key, def]) => {
      if (key === 'toneP1x' || key === 'toneP1y') {
        const u = this.uniforms.toneP1?.value;
        if (!u) return true;
        const v = key === 'toneP1x' ? u.x : u.y;
        return Math.abs(v - def) < 0.001;
      }
      if (key === 'toneP2x' || key === 'toneP2y') {
        const u = this.uniforms.toneP2?.value;
        if (!u) return true;
        const v = key === 'toneP2x' ? u.x : u.y;
        return Math.abs(v - def) < 0.001;
      }
      const uniform = this.uniforms[key];
      if (!uniform || key === 'resolution') return true;
      return Math.abs(uniform.value - def) < 0.001;
    });
    this.uniforms.bypass.value = isDefault ? 1.0 : 0.0;
  }
}

