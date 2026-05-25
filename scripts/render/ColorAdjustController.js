import * as THREE from 'three';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/ShaderPass.js';
import { ColorAdjustShader } from '../shaders/index.js';
import {
  buildToneCurveLutBytes,
  normalizeToneCurve,
} from '../math/toneCurvePchip.js';

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
  toneBlackY: 0.0,
  toneWhiteY: 1.0,
  toneP1x: 1 / 3,
  toneP1y: 1 / 3,
  toneP2x: 2 / 3,
  toneP2y: 2 / 3,
};

const TONE_IDENTITY_EPS = 0.002;

function defaultToneCurveObject() {
  return {
    blackY: DEFAULTS.toneBlackY,
    whiteY: DEFAULTS.toneWhiteY,
    p1: { x: DEFAULTS.toneP1x, y: DEFAULTS.toneP1y },
    p2: { x: DEFAULTS.toneP2x, y: DEFAULTS.toneP2y },
  };
}

export class ColorAdjustController {
  constructor(renderer) {
    this.pass = new ShaderPass(ColorAdjustShader);
    this.uniforms = this.pass.uniforms;
    this.pass.renderToScreen = false;
    this.pass.enabled = true;
    this.renderer = renderer;
    /** @type {THREE.DataTexture | null} */
    this._toneLutTexture = null;
    /** @type {{ blackY: number, whiteY: number, p1: {x:number,y:number}, p2: {x:number,y:number} }} */
    this._curveNorm = defaultToneCurveObject();
    this.reset();
    if (renderer) {
      const size = new THREE.Vector2();
      renderer.getSize(size);
      this.setResolution(size.x, size.y);
    }
  }

  getPass() {
    return this.pass;
  }

  _disposeToneLut() {
    if (this._toneLutTexture) {
      this._toneLutTexture.dispose();
      this._toneLutTexture = null;
    }
  }

  _uploadToneLut(c) {
    this._disposeToneLut();
    const { data, width, height, tailSlope } = buildToneCurveLutBytes(c);
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
    if (this.uniforms.toneCurveLut) {
      this.uniforms.toneCurveLut.value = tex;
    }
    if (this.uniforms.toneHdrTailSlope) {
      this.uniforms.toneHdrTailSlope.value = tailSlope;
    }
  }

  reset() {
    Object.entries(DEFAULTS).forEach(([key, value]) => {
      if (
        key === 'toneBlackY'
        || key === 'toneWhiteY'
        || key === 'toneP1x'
        || key === 'toneP1y'
        || key === 'toneP2x'
        || key === 'toneP2y'
      ) {
        return;
      }
      if (this.uniforms[key] && key !== 'resolution') {
        this.uniforms[key].value = value;
      }
    });
    this._curveNorm = defaultToneCurveObject();
    this._uploadToneLut(this._curveNorm);
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
   * @param {object} curve — `blackY`, `whiteY`, `p1`, `p2`; normalized upstream.
   */
  setToneCurve(curve) {
    if (!this.uniforms.toneCurveLut) {
      return;
    }
    this._curveNorm = normalizeToneCurve(curve);
    this._uploadToneLut(this._curveNorm);
    this._updateToneCurveIdentity();
    this._updateBypass();
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
    if (!this.uniforms.toneCurveIdentity) {
      return;
    }
    const c = this._curveNorm;
    const onDiag =
      Math.abs(c.blackY) < TONE_IDENTITY_EPS
      && Math.abs(c.whiteY - 1.0) < TONE_IDENTITY_EPS
      && Math.abs(c.p1.x - c.p1.y) < TONE_IDENTITY_EPS
      && Math.abs(c.p2.x - c.p2.y) < TONE_IDENTITY_EPS;
    this.uniforms.toneCurveIdentity.value = onDiag ? 1.0 : 0.0;
  }

  _updateBypass() {
    if (!this.uniforms.bypass) return;
    this._updateToneCurveIdentity();
    const c = this._curveNorm;
    const isDefault = Object.entries(DEFAULTS).every(([key, def]) => {
      if (key === 'toneBlackY') {
        return Math.abs(c.blackY - def) < 0.001;
      }
      if (key === 'toneWhiteY') {
        return Math.abs(c.whiteY - def) < 0.001;
      }
      if (key === 'toneP1x' || key === 'toneP1y') {
        const v = key === 'toneP1x' ? c.p1.x : c.p1.y;
        return Math.abs(v - def) < 0.001;
      }
      if (key === 'toneP2x' || key === 'toneP2y') {
        const v = key === 'toneP2x' ? c.p2.x : c.p2.y;
        return Math.abs(v - def) < 0.001;
      }
      const uniform = this.uniforms[key];
      if (!uniform || key === 'resolution') return true;
      return Math.abs(uniform.value - def) < 0.001;
    });
    this.uniforms.bypass.value = isDefault ? 1.0 : 0.0;
  }
}
