import * as THREE from 'three';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/ShaderPass.js';
import {
  GBA_BG_HEX,
  GBA_POST_FRAGMENT,
  GBA_REF_LOGICAL_HEIGHT,
  GBA_REF_LOGICAL_WIDTH,
  creativeGbaCellSize,
} from './creativeLookGbaArt.js';
import { applyFlatPostBgColorUniform } from './creativeLookFlatPostMasterHue.js';

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Screen-space GBA crush — 240×160 macro pixels, 15-bit high-color quantize.
 */
export class CreativeLookGbaPass {
  /** @param {import('three').WebGLRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this._pixelRatio = Math.max(1, renderer?.getPixelRatio?.() ?? 1);

    const cell = creativeGbaCellSize();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uCellSize: { value: new THREE.Vector2(cell.width, cell.height) },
        uBgColor: { value: new THREE.Color(GBA_BG_HEX) },
        uMasterHue: { value: 0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: GBA_POST_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });

    this.pass = new ShaderPass(this.material);
    this.pass.enabled = false;
    this._referenceLogicalSize = new THREE.Vector2(
      GBA_REF_LOGICAL_WIDTH,
      GBA_REF_LOGICAL_HEIGHT,
    );
    this._referencePinned = false;
    this._applyCellSize();
  }

  _applyCellSize() {
    const cell = creativeGbaCellSize();
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
    this._referenceLogicalSize.set(GBA_REF_LOGICAL_WIDTH, GBA_REF_LOGICAL_HEIGHT);
    this._referencePinned = true;
    this._applyCellSize();
  }

  unpinReferenceLogicalSize() {
    this._referencePinned = false;
    this._referenceLogicalSize.set(GBA_REF_LOGICAL_WIDTH, GBA_REF_LOGICAL_HEIGHT);
  }

  getPass() {
    return this.pass;
  }

  setSize(logicalW, logicalH) {
    this._pixelRatio = Math.max(1, this.renderer?.getPixelRatio?.() ?? 1);
    if (!this._referencePinned) {
      this._referenceLogicalSize.set(GBA_REF_LOGICAL_WIDTH, GBA_REF_LOGICAL_HEIGHT);
    }
    this.material.uniforms.uResolution.value.set(
      Math.max(1, Math.floor(logicalW * this._pixelRatio)),
      Math.max(1, Math.floor(logicalH * this._pixelRatio)),
    );
    this._applyCellSize();
  }

  /** @param {{ enabled?: boolean, masterHue?: number, bgColor?: string }} settings */
  updateSettings(settings = {}) {
    if (!settings) return;
    if (typeof settings.enabled === 'boolean') {
      this.pass.enabled = settings.enabled;
    }
    if (typeof settings.masterHue === 'number') {
      this.material.uniforms.uMasterHue.value = settings.masterHue;
    }
    applyFlatPostBgColorUniform(this.material, settings.bgColor);
  }

  dispose() {
    this.material.dispose();
  }
}
