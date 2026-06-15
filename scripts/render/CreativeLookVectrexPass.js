import * as THREE from 'three';
import {
  FullScreenQuad,
  Pass,
} from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/Pass.js';
import { resetRendererFullViewport } from './resetRendererFullViewport.js';
import { VECTREX_DEFAULT_INTENSITY } from './CreativeLookMaterials.js';
import {
  VECTREX_PERSISTENCE_DECAY,
} from './creativeLookVectrexArt.js';

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const EXTRACT_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float threshold;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float lum = luma(c);
  float soft = max(0.03, threshold * 0.18 + 0.02);
  float mask = smoothstep(threshold - soft, threshold + soft, lum);
  gl_FragColor = vec4(c * mask, 1.0);
}
`;

const BLUR_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 pixelStep;

void main() {
  vec2 o1 = pixelStep;
  vec2 o2 = pixelStep * 2.0;
  vec4 c =
    texture2D(tDiffuse, vUv) * 0.2270270270
    + texture2D(tDiffuse, vUv + o1) * 0.1945945946
    + texture2D(tDiffuse, vUv - o1) * 0.1945945946
    + texture2D(tDiffuse, vUv + o2) * 0.1216216216
    + texture2D(tDiffuse, vUv - o2) * 0.1216216216;
  gl_FragColor = c / 0.8590270278;
}
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tCurrent;
uniform sampler2D tFeedback;
uniform sampler2D tBloom;
uniform float decay;
uniform float bloomStrength;
uniform float intensity;
uniform vec2 uResolution;
uniform float uTime;

float vectrexGrid(vec2 uv) {
  vec2 cells = uResolution / 48.0;
  vec2 g = abs(fract(uv * cells - 0.5) - 0.5) / fwidth(uv * cells);
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  return line * 0.035;
}

void main() {
  vec3 cur = texture2D(tCurrent, vUv).rgb;
  vec3 prev = texture2D(tFeedback, vUv).rgb;
  vec3 bloom = texture2D(tBloom, vUv).rgb;

  float inten = clamp(intensity, 0.0, 2.0);
  float d = mix(0.84, 0.96, clamp(intensity * 0.5, 0.0, 1.0));
  d = mix(d, decay, 0.5);

  vec3 persisted = prev * d + cur;
  float persistLuma = dot(persisted, vec3(0.2126, 0.7152, 0.0722));
  persisted /= 1.0 + persistLuma * 0.3;

  vec3 col = persisted + bloom * bloomStrength * (0.75 + inten * 0.35);
  col = max(col, cur);

  float grid = vectrexGrid(vUv);
  col += vec3(0.04, 0.11, 0.05) * grid;

  col *= 0.985 + 0.015 * sin(uTime * 17.3 + vUv.y * 40.0);

  gl_FragColor = vec4(clamp(col, 0.0, 2.45), 1.0);
}
`;

const COPY_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
void main() {
  gl_FragColor = texture2D(tDiffuse, vUv);
}
`;

class CreativeLookVectrexPass extends Pass {
  constructor() {
    super();
    this.needsSwap = true;
    this.enabled = false;
    this.renderToScreen = false;

    this._bufferW = 1;
    this._bufferH = 1;

    this._settings = {
      decay: VECTREX_PERSISTENCE_DECAY,
      bloomStrength: 0,
      intensity: VECTREX_DEFAULT_INTENSITY,
      time: 0,
    };

    this._extractMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        threshold: { value: 0.02 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: EXTRACT_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this._blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        pixelStep: { value: new THREE.Vector2(0, 0) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: BLUR_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this._compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tCurrent: { value: null },
        tFeedback: { value: null },
        tBloom: { value: null },
        decay: { value: VECTREX_PERSISTENCE_DECAY },
        bloomStrength: { value: 0 },
        intensity: { value: VECTREX_DEFAULT_INTENSITY },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this._copyMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: COPY_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this._quad = new FullScreenQuad(this._compositeMat);

    /** @type {THREE.WebGLRenderTarget | null} */
    this._rtA = null;
    /** @type {THREE.WebGLRenderTarget | null} */
    this._rtB = null;
    /** @type {THREE.WebGLRenderTarget | null} */
    this._feedback = null;
    this._feedbackPrimed = false;
  }

  /** @param {number} width @param {number} height */
  setSize(width, height) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this._bufferW && h === this._bufferH) return;
    this._bufferW = w;
    this._bufferH = h;
    this._rtA = null;
    this._rtB = null;
    this._feedback = null;
    this._feedbackPrimed = false;
  }

  /** @param {import('three').WebGLRenderer} renderer */
  _rtType(renderer) {
    return renderer?.capabilities?.isWebGL2 === true
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType;
  }

  _ensureBuffers(renderer) {
    const w = this._bufferW;
    const h = this._bufferH;
    if (this._rtA?.width === w && this._rtA?.height === h) return;

    this._rtA?.dispose();
    this._rtB?.dispose();
    this._feedback?.dispose();
    const opts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: this._rtType(renderer),
      depthBuffer: false,
      stencilBuffer: false,
    };
    this._rtA = new THREE.WebGLRenderTarget(w, h, opts);
    this._rtB = new THREE.WebGLRenderTarget(w, h, opts);
    this._feedback = new THREE.WebGLRenderTarget(w, h, opts);
    this._feedbackPrimed = false;
  }

  /** @param {import('three').WebGLRenderer} renderer @param {THREE.Material} material @param {THREE.WebGLRenderTarget | null} target */
  _draw(renderer, material, target) {
    this._quad.material = material;
    renderer.setRenderTarget(target);
    resetRendererFullViewport(renderer);
    this._quad.render(renderer);
  }

  resetPersistence() {
    this._feedbackPrimed = false;
  }

  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').WebGLRenderTarget} writeBuffer
   * @param {import('three').WebGLRenderTarget} readBuffer
   */
  render(renderer, writeBuffer, readBuffer, _deltaTime, _maskActive) {
    if (!this.enabled) return;

    const baseTex = readBuffer?.texture ?? null;
    if (!baseTex) return;

    const w = Math.max(1, readBuffer.width | 0);
    const h = Math.max(1, readBuffer.height | 0);
    this.setSize(w, h);
    this._ensureBuffers(renderer);
    if (!this._rtA || !this._rtB || !this._feedback) return;

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;

    const uExtract = this._extractMat.uniforms;
    const uBlur = this._blurMat.uniforms;
    const uComp = this._compositeMat.uniforms;
    const uCopy = this._copyMat.uniforms;

    uComp.decay.value = Number.isFinite(this._settings.decay)
      ? THREE.MathUtils.clamp(this._settings.decay, 0.7, 0.98)
      : VECTREX_PERSISTENCE_DECAY;
    const bloomStrength = Number.isFinite(this._settings.bloomStrength)
      ? Math.max(0, this._settings.bloomStrength)
      : 0;
    uComp.bloomStrength.value = bloomStrength;
    uComp.intensity.value = Number.isFinite(this._settings.intensity)
      ? THREE.MathUtils.clamp(this._settings.intensity, 0, 2)
      : 1;
    uComp.uTime.value = Number.isFinite(this._settings.time) ? this._settings.time : 0;
    uComp.uResolution.value.set(w, h);

    const radiusPx = 6.5;
    const cycles = 2;
    const bloomOn = bloomStrength > 0.0001;

    renderer.autoClear = true;

    try {
      let src = baseTex;
      if (bloomOn) {
        uExtract.tDiffuse.value = baseTex;
        this._draw(renderer, this._extractMat, this._rtA);

        src = this._rtA.texture;
        for (let c = 0; c < cycles; c += 1) {
          uBlur.tDiffuse.value = src;
          uBlur.pixelStep.value.set(radiusPx / w, 0);
          this._draw(renderer, this._blurMat, this._rtB);

          uBlur.tDiffuse.value = this._rtB.texture;
          uBlur.pixelStep.value.set(0, radiusPx / h);
          this._draw(renderer, this._blurMat, this._rtA);

          src = this._rtA.texture;
        }
      }

      if (!this._feedbackPrimed) {
        renderer.setRenderTarget(this._feedback);
        resetRendererFullViewport(renderer);
        renderer.setClearColor(0x000000, 1);
        renderer.clear(true, false, false);
        this._feedbackPrimed = true;
      }

      uComp.tCurrent.value = baseTex;
      uComp.tFeedback.value = this._feedback.texture;
      uComp.tBloom.value = src;

      this._draw(renderer, this._compositeMat, this._rtB);

      const outTarget = this.renderToScreen ? null : writeBuffer;
      uCopy.tDiffuse.value = this._rtB.texture;
      this._draw(renderer, this._copyMat, outTarget);

      this._draw(renderer, this._copyMat, this._feedback);
    } finally {
      renderer.setRenderTarget(prevTarget);
      resetRendererFullViewport(renderer);
      if (typeof renderer.setScissorTest === 'function') {
        renderer.setScissorTest(false);
      }
      renderer.autoClear = prevAutoClear;
    }
  }

  dispose() {
    this._rtA?.dispose();
    this._rtB?.dispose();
    this._feedback?.dispose();
    this._rtA = null;
    this._rtB = null;
    this._feedback = null;
    this._extractMat.dispose();
    this._blurMat.dispose();
    this._compositeMat.dispose();
    this._copyMat.dispose();
    this._quad.dispose();
  }
}

/** Phosphor persistence + bloom + faint grid for Vectrex vector CRT look. */
export class CreativeLookVectrex {
  /** @param {import('three').WebGLRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.pass = new CreativeLookVectrexPass();
  }

  getPass() {
    return this.pass;
  }

  setSize(logicalW, logicalH) {
    const pr = Math.max(1, this.renderer?.getPixelRatio?.() ?? 1);
    this.pass.setSize(
      Math.max(1, Math.floor(logicalW * pr)),
      Math.max(1, Math.floor(logicalH * pr)),
    );
  }

  /** @param {{ enabled?: boolean, intensity?: number, time?: number }} settings */
  updateSettings(settings = {}) {
    if (!settings) return;
    if (typeof settings.enabled === 'boolean') {
      this.pass.enabled = settings.enabled;
      if (!settings.enabled) {
        this.pass.resetPersistence();
      }
    }
    if (typeof settings.intensity === 'number') {
      this.pass._settings.intensity = settings.intensity;
    }
    if (typeof settings.time === 'number') {
      this.pass._settings.time = settings.time;
    }
    // Viewport bloom uses Cam/FX UnrealBloom after this pass — keep built-in phosphor bloom off.
    this.pass._settings.bloomStrength = 0;
  }
}
