import * as THREE from 'three';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/ShaderPass.js';
import {
  OPTICS_POST_FRAGMENTS,
  OPTICS_THERMAL_POST_FRAGMENT,
  resolveOpticsCreativeLookVariant,
  THERMAL_DEFAULT_INTENSITY,
  THERMAL_ACID_SCENE_GAIN,
} from './creativeLookOpticsArt.js';

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Shader Lab optics — full-viewport thermal grade (HDRI + mesh + backdrop).
 */
export class CreativeLookOpticsPass {
  /** @param {import('three').WebGLRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    /** @type {import('./creativeLookOpticsArt.js').OpticsCreativeLookVariant} */
    this._variant = 'thermal';

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uIntensity: { value: THERMAL_DEFAULT_INTENSITY },
        uPatternScale: { value: 1 },
        uTime: { value: 0 },
        uMasterHue: { value: 0 },
        uLiftCrush: { value: 0 },
        uSceneGain: { value: 1 },
        uBackdropFlat: { value: 0 },
        uBackdropColor: { value: new THREE.Color('#000000') },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: OPTICS_THERMAL_POST_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });

    this.pass = new ShaderPass(this.material);
    this.pass.enabled = false;
    this._applyVariant('thermal');
  }

  getPass() {
    return this.pass;
  }

  /** @param {string | undefined | null} variant */
  _applyVariant(variant) {
    const next = resolveOpticsCreativeLookVariant(variant) ?? 'thermal';
    if (next === this._variant && this.material.fragmentShader === OPTICS_POST_FRAGMENTS[next]) {
      return;
    }
    this._variant = next;
    this.material.fragmentShader = OPTICS_POST_FRAGMENTS[next];
    this.material.uniforms.uSceneGain.value = next === 'thermal-acid' ? THERMAL_ACID_SCENE_GAIN : 1;
    this.material.needsUpdate = true;
  }

  setSize(logicalW, logicalH) {
    const pr = Math.max(1, this.renderer?.getPixelRatio?.() ?? 1);
    this.material.uniforms.uResolution.value.set(
      Math.max(1, Math.floor(logicalW * pr)),
      Math.max(1, Math.floor(logicalH * pr)),
    );
  }

  /**
   * @param {{
   *   enabled?: boolean,
   *   variant?: string,
   *   intensity?: number,
   *   patternScale?: number,
   *   time?: number,
   *   masterHue?: number,
   *   liftCrush?: number,
   *   backdropFlat?: boolean,
   *   backdropColor?: string,
   * }} settings
   */
  updateSettings(settings = {}) {
    if (!settings) return;
    if (typeof settings.enabled === 'boolean' && !settings.enabled) {
      this.pass.enabled = false;
      return;
    }
    if (settings.variant) {
      this._applyVariant(settings.variant);
    }
    if (typeof settings.intensity === 'number') {
      this.material.uniforms.uIntensity.value = THREE.MathUtils.clamp(settings.intensity, 0, 2);
    }
    if (typeof settings.patternScale === 'number') {
      this.material.uniforms.uPatternScale.value = THREE.MathUtils.clamp(settings.patternScale, 0.1, 5);
    }
    if (typeof settings.time === 'number') {
      this.material.uniforms.uTime.value = settings.time;
    }
    if (typeof settings.masterHue === 'number') {
      this.material.uniforms.uMasterHue.value = settings.masterHue;
    }
    if (typeof settings.liftCrush === 'number') {
      this.material.uniforms.uLiftCrush.value = THREE.MathUtils.clamp(settings.liftCrush, -1, 1);
    }
    if (typeof settings.backdropFlat === 'boolean') {
      this.material.uniforms.uBackdropFlat.value = settings.backdropFlat ? 1 : 0;
    }
    if (typeof settings.backdropColor === 'string' && settings.backdropColor) {
      this.material.uniforms.uBackdropColor.value.set(settings.backdropColor);
    }
    if (settings.enabled === true) {
      this.pass.enabled = true;
    }
  }
}
