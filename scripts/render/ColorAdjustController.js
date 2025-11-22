import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/ShaderPass.js';
import { ColorAdjustShader } from '../shaders/index.js';

const DEFAULTS = {
  contrast: 1.0,
  saturation: 1.0,
  temperature: 0.0,
  tint: 0.0,
  highlights: 0.0,
  shadows: 0.0,
};

export class ColorAdjustController {
  constructor() {
    this.pass = new ShaderPass(ColorAdjustShader);
    this.uniforms = this.pass.uniforms;
    this.pass.renderToScreen = false;
    this.pass.enabled = true;
    this.reset();
  }

  getPass() {
    return this.pass;
  }

  reset() {
    Object.entries(DEFAULTS).forEach(([key, value]) => {
      if (this.uniforms[key]) {
        this.uniforms[key].value = value;
      }
    });
    if (this.uniforms.bypass) {
      this.uniforms.bypass.value = 1.0;
    }
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

  _setUniform(key, value, fallback) {
    if (!this.uniforms[key]) return;
    this.uniforms[key].value = value ?? fallback;
    this._updateBypass();
  }

  _updateBypass() {
    if (!this.uniforms.bypass) return;
    const isDefault = Object.entries(DEFAULTS).every(([key, def]) => {
      const uniform = this.uniforms[key];
      if (!uniform) return true;
      return Math.abs(uniform.value - def) < 0.001;
    });
    this.uniforms.bypass.value = isDefault ? 1.0 : 0.0;
  }
}

