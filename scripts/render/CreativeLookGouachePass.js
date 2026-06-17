import * as THREE from 'three';
import {
  FullScreenQuad,
  Pass,
} from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/Pass.js';
import { resetRendererFullViewport } from './resetRendererFullViewport.js';
import {
  GOUACHE_COMPOSITE_FRAGMENT,
  SKETCH_OUTLINE_REFERENCE_PIXEL_RATIO,
  creativeLookGouacheGrainScale,
  creativeLookGouacheInkWidth,
} from './creativeLookGouacheArt.js';
import {
  applyCreativeLookStrokeUniforms,
  resolveCreativeLookInkParams,
} from './creativeLookInkArt.js';

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

class CreativeLookGouachePass extends Pass {
  /** @param {import('three').WebGLRenderer} renderer */
  constructor(renderer) {
    super();
    this.renderer = renderer;
    this.needsSwap = true;
    this.enabled = false;
    this.renderToScreen = false;

    this._fullW = 1;
    this._fullH = 1;

    this._compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 1 },
        uGrainScale: { value: 1 },
        uTexelSize: { value: new THREE.Vector2(1, 1) },
        uOutlinePxScale: { value: 1 },
        uInkWidthScale: { value: 1 },
        uTime: { value: 0 },
        uStrokeColor: { value: new THREE.Color(8 / 255, 8 / 255, 8 / 255) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: GOUACHE_COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });

    this._quad = new FullScreenQuad(this._compositeMat);
  }

  /** @param {import('three').WebGLRenderer} renderer @param {THREE.Material} material @param {THREE.WebGLRenderTarget | null} target */
  _draw(renderer, material, target) {
    this._quad.material = material;
    renderer.setRenderTarget(target);
    this._quad.render(renderer);
  }

  getPass() {
    return this;
  }

  setSize(logicalW, logicalH) {
    const pr = Math.max(1, this.renderer?.getPixelRatio?.() ?? 1);
    this._fullW = Math.max(1, Math.floor(logicalW * pr));
    this._fullH = Math.max(1, Math.floor(logicalH * pr));
    this._compositeMat.uniforms.uTexelSize.value.set(1 / this._fullW, 1 / this._fullH);
    this._compositeMat.uniforms.uOutlinePxScale.value =
      pr / SKETCH_OUTLINE_REFERENCE_PIXEL_RATIO;
  }

  /**
   * @param {{
   *   enabled?: boolean,
   *   patternScale?: number,
   *   intensity?: number,
   *   time?: number,
   *   strokeColor?: string,
   *   preset?: string,
   * }} settings
   */
  updateSettings(settings = {}) {
    if (!settings) return;
    if (typeof settings.enabled === 'boolean' && !settings.enabled) {
      this.enabled = false;
      return;
    }
    const patternScale = typeof settings.patternScale === 'number'
      ? settings.patternScale
      : 1;
    this._compositeMat.uniforms.uInkWidthScale.value = creativeLookGouacheInkWidth(patternScale);
    this._compositeMat.uniforms.uGrainScale.value = creativeLookGouacheGrainScale(patternScale);
    const ink = resolveCreativeLookInkParams(
      {
        ink: {
          strokeColor: settings.strokeColor,
        },
      },
      settings.preset ?? 'gouache',
    );
    applyCreativeLookStrokeUniforms(this._compositeMat.uniforms, ink);
    if (typeof settings.intensity === 'number' && Number.isFinite(settings.intensity)) {
      this._compositeMat.uniforms.uIntensity.value = settings.intensity;
    }
    if (typeof settings.time === 'number' && Number.isFinite(settings.time)) {
      this._compositeMat.uniforms.uTime.value = settings.time;
    }
  }

  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').WebGLRenderTarget} writeBuffer
   * @param {import('three').WebGLRenderTarget} readBuffer
   */
  render(renderer, writeBuffer, readBuffer) {
    if (!this.enabled) return;

    const outTarget = this.renderToScreen ? null : writeBuffer;
    this._compositeMat.uniforms.tDiffuse.value = readBuffer.texture;
    this._draw(renderer, this._compositeMat, outTarget);

    resetRendererFullViewport(renderer);
  }

  dispose() {
    this._compositeMat.dispose();
    this._quad.dispose();
  }
}

/** Matte poster paint — flat colour blocks + chalk grain + ink outlines. */
export class CreativeLookGouache {
  /** @param {import('three').WebGLRenderer} renderer */
  constructor(renderer) {
    this.pass = new CreativeLookGouachePass(renderer);
  }

  getPass() {
    return this.pass;
  }

  setSize(logicalW, logicalH) {
    this.pass.setSize(logicalW, logicalH);
  }

  updateSettings(settings = {}) {
    this.pass.updateSettings(settings);
  }

  dispose() {
    this.pass.dispose();
  }
}
