import * as THREE from 'three';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/ShaderPass.js';
import {
  DITHER_NEUTRAL_BG_HEX,
  DITHER_NEUTRAL_DEFAULT_INTENSITY,
  DITHER_NEUTRAL_DEFAULT_PATTERN_SCALE,
  DITHER_NEUTRAL_POST_FRAGMENT,
  DITHER_NEUTRAL_REF_LOGICAL_HEIGHT,
  DITHER_NEUTRAL_REF_LOGICAL_WIDTH,
  DITHER_CROSSHATCH_POST_FRAGMENT,
  DITHER_TRITONE_POST_FRAGMENT,
  creativeDitherCellSize,
} from './creativeLookDitherArt.js';

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** @typedef {'dither-neutral' | 'dither-tritone' | 'dither-crosshatch'} DitherCreativeLookVariant */

/** @type {Record<DitherCreativeLookVariant, string>} */
const DITHER_VARIANT_FRAGMENTS = {
  'dither-neutral': DITHER_NEUTRAL_POST_FRAGMENT,
  'dither-tritone': DITHER_TRITONE_POST_FRAGMENT,
  'dither-crosshatch': DITHER_CROSSHATCH_POST_FRAGMENT,
};

/**
 * Shader Lab Dither — neutral Bayer crush or extreme tritone crush on hard square pixels.
 */
export class CreativeLookDitherPass {
  /** @param {import('three').WebGLRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this._pixelRatio = Math.max(1, renderer?.getPixelRatio?.() ?? 1);
    this._patternScale = DITHER_NEUTRAL_DEFAULT_PATTERN_SCALE;
    /** @type {DitherCreativeLookVariant} */
    this._variant = 'dither-neutral';

    const cell = creativeDitherCellSize(this._patternScale);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uCellSize: { value: new THREE.Vector2(cell.width, cell.height) },
        uBgColor: { value: new THREE.Color(DITHER_NEUTRAL_BG_HEX) },
        uMasterHue: { value: 0 },
        uIntensity: { value: DITHER_NEUTRAL_DEFAULT_INTENSITY },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: DITHER_NEUTRAL_POST_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });

    this.pass = new ShaderPass(this.material);
    this.pass.enabled = false;
    this._referenceLogicalSize = new THREE.Vector2(
      DITHER_NEUTRAL_REF_LOGICAL_WIDTH,
      DITHER_NEUTRAL_REF_LOGICAL_HEIGHT,
    );
    this._referencePinned = false;
    this._applyCellSize();
  }

  /** @param {string | undefined | null} variant */
  _resolveVariant(variant) {
    if (variant === 'dither-tritone') return 'dither-tritone';
    if (variant === 'dither-crosshatch') return 'dither-crosshatch';
    return 'dither-neutral';
  }

  /** @param {DitherCreativeLookVariant} variant */
  _applyVariant(variant) {
    const next = this._resolveVariant(variant);
    if (next === this._variant) return;
    this._variant = next;
    this.material.fragmentShader = DITHER_VARIANT_FRAGMENTS[next];
    this.material.needsUpdate = true;
  }

  _applyCellSize() {
    const cell = creativeDitherCellSize(this._patternScale);
    const res = this.material.uniforms.uResolution.value;
    const ref = this._referenceLogicalSize;
    const refW = Math.max(1, ref.x);
    const refH = Math.max(1, ref.y);
    this.material.uniforms.uCellSize.value.set(
      cell.width * (res.x / refW),
      cell.height * (res.y / refH),
    );
  }

  pinReferenceLogicalSize(_logicalW, _logicalH) {
    this._referenceLogicalSize.set(
      DITHER_NEUTRAL_REF_LOGICAL_WIDTH,
      DITHER_NEUTRAL_REF_LOGICAL_HEIGHT,
    );
    this._referencePinned = true;
    this._applyCellSize();
  }

  unpinReferenceLogicalSize() {
    this._referencePinned = false;
    this._referenceLogicalSize.set(
      DITHER_NEUTRAL_REF_LOGICAL_WIDTH,
      DITHER_NEUTRAL_REF_LOGICAL_HEIGHT,
    );
  }

  getPass() {
    return this.pass;
  }

  setSize(logicalW, logicalH) {
    this._pixelRatio = Math.max(1, this.renderer?.getPixelRatio?.() ?? 1);
    if (!this._referencePinned) {
      this._referenceLogicalSize.set(
        DITHER_NEUTRAL_REF_LOGICAL_WIDTH,
        DITHER_NEUTRAL_REF_LOGICAL_HEIGHT,
      );
    }
    this.material.uniforms.uResolution.value.set(
      Math.max(1, Math.floor(logicalW * this._pixelRatio)),
      Math.max(1, Math.floor(logicalH * this._pixelRatio)),
    );
    this._applyCellSize();
  }

  /** @param {{ enabled?: boolean, variant?: string, masterHue?: number, patternScale?: number, intensity?: number }} settings */
  updateSettings(settings = {}) {
    if (!settings) return;
    if (typeof settings.variant === 'string') {
      this._applyVariant(settings.variant);
    }
    if (typeof settings.enabled === 'boolean') {
      this.pass.enabled = settings.enabled;
    }
    if (typeof settings.masterHue === 'number') {
      this.material.uniforms.uMasterHue.value = settings.masterHue;
    }
    if (typeof settings.patternScale === 'number') {
      this._patternScale = settings.patternScale;
      this._applyCellSize();
    }
    if (typeof settings.intensity === 'number') {
      this.material.uniforms.uIntensity.value = settings.intensity;
    }
  }

  dispose() {
    this.material.dispose();
  }
}
