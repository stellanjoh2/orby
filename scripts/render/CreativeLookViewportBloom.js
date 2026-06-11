import * as THREE from 'three';
import {
  FullScreenQuad,
  Pass,
} from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/Pass.js';
import { resetRendererFullViewport } from './resetRendererFullViewport.js';

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
  float soft = max(0.04, threshold * 0.22 + 0.03);
  float mask = smoothstep(threshold - soft, threshold + soft, lum);
  gl_FragColor = vec4(c * mask, 1.0);
}
`;

/** 5-tap separable gaussian — blurs an already-extracted bright buffer (no re-threshold). */
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
uniform sampler2D tBase;
uniform sampler2D tBloom;
uniform float strength;
uniform vec3 tint;

void main() {
  vec3 base = texture2D(tBase, vUv).rgb;
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  float glowAmt = max(strength, 0.0) * 8.0;
  vec3 glow = bloom * glowAmt;
  glow = mix(glow, glow * tint, clamp(glowAmt * 0.65, 0.0, 1.0));
  gl_FragColor = vec4(clamp(base + glow, vec3(0.0), vec3(3.0)), 1.0);
}
`;

/** @param {string | undefined} qualityId */
function resolveBlurCycles(qualityId) {
  if (qualityId === 'low') return 1;
  if (qualityId === 'high') return 3;
  if (qualityId === 'ultra') return 4;
  return 2;
}

/**
 * Extract → separable blur (bright buffer only) → composite.
 * Matches UnrealBloom's flow; avoids ghost clones from re-thresholding at each blur tap.
 */
class CreativeLookViewportBloomPass extends Pass {
  constructor() {
    super();
    this.needsSwap = false;
    this.enabled = false;
    this.renderToScreen = false;

    this._bufferW = 1;
    this._bufferH = 1;
    this._qualityId = 'medium';
    this._bloomScale = 1;

    this._settings = {
      threshold: 0.65,
      strength: 0.2,
      radius: 0.2,
      color: '#ffe9cc',
      quality: 'medium',
    };

    this._extractMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        threshold: { value: 0.65 },
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
        tBase: { value: null },
        tBloom: { value: null },
        strength: { value: 0.2 },
        tint: { value: new THREE.Color('#ffe9cc') },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this._quad = new FullScreenQuad(this._compositeMat);

    /** @type {THREE.WebGLRenderTarget | null} */
    this._rtA = null;
    /** @type {THREE.WebGLRenderTarget | null} */
    this._rtB = null;
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
  }

  /** @param {import('three').WebGLRenderer} renderer @param {THREE.Material} material @param {THREE.WebGLRenderTarget | null} target */
  _draw(renderer, material, target) {
    this._quad.material = material;
    renderer.setRenderTarget(target);
    this._quad.render(renderer);
  }

  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').WebGLRenderTarget} writeBuffer
   * @param {import('three').WebGLRenderTarget} readBuffer
   */
  render(renderer, writeBuffer, readBuffer, _deltaTime, _maskActive) {
    if (!this.enabled) return;
    this._ensureBuffers(renderer);

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const pr = Math.max(1e-6, renderer.getPixelRatio());
    const vw = this._bufferW / pr;
    const vh = this._bufferH / pr;

    const baseTex = readBuffer?.texture ?? null;
    if (!baseTex) return;

    const uExtract = this._extractMat.uniforms;
    const uBlur = this._blurMat.uniforms;
    const uComp = this._compositeMat.uniforms;

    const thresh = Number(this._settings.threshold);
    uExtract.threshold.value = Number.isFinite(thresh)
      ? THREE.MathUtils.clamp(thresh * 0.78 + 0.08, 0.05, 0.92)
      : 0.65;

    const strength = Number(this._settings.strength);
    uComp.strength.value = Number.isFinite(strength) ? Math.max(0, strength) : 0.2;

    const rad = Number(this._settings.radius);
    const r = Number.isFinite(rad) ? THREE.MathUtils.clamp(rad, 0, 1) : 0.2;
    const radiusPx = 0.35 + r * 22.0;

    const qualityId =
      this._settings.quality === 'low' ||
      this._settings.quality === 'high' ||
      this._settings.quality === 'ultra'
        ? this._settings.quality
        : 'medium';
    const cycles = resolveBlurCycles(qualityId);
    const stepPx = radiusPx / Math.sqrt(cycles);

    uComp.tint.value.set(
      typeof this._settings.color === 'string' && this._settings.color.trim()
        ? this._settings.color.trim()
        : '#ffe9cc',
    );

    renderer.autoClear = true;

    try {
      uExtract.tDiffuse.value = baseTex;
      renderer.setViewport(0, 0, vw, vh);
      renderer.clear(true, false, false);
      this._draw(renderer, this._extractMat, this._rtA);

      let src = this._rtA?.texture ?? null;
      for (let c = 0; c < cycles; c += 1) {
        uBlur.tDiffuse.value = src;
        uBlur.pixelStep.value.set(stepPx / this._bufferW, 0);
        renderer.clear(true, false, false);
        this._draw(renderer, this._blurMat, this._rtB);

        uBlur.tDiffuse.value = this._rtB?.texture ?? null;
        uBlur.pixelStep.value.set(0, stepPx / this._bufferH);
        renderer.clear(true, false, false);
        this._draw(renderer, this._blurMat, this._rtA);

        src = this._rtA?.texture ?? null;
      }

      uComp.tBase.value = baseTex;
      uComp.tBloom.value = src;

      const outTarget = this.renderToScreen ? null : writeBuffer;
      resetRendererFullViewport(renderer);
      // ShaderPass never clears the canvas before the final draw.
      this._draw(renderer, this._compositeMat, outTarget);
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
    this._rtA = null;
    this._rtB = null;
    this._extractMat.dispose();
    this._blurMat.dispose();
    this._compositeMat.dispose();
    this._quad.dispose();
  }
}

/**
 * Viewport-only bloom for Shader Lab — reads `state.bloom` (Camera & FX panel).
 */
export class CreativeLookViewportBloom {
  /** @param {import('three').WebGLRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.pass = new CreativeLookViewportBloomPass();
  }

  getPass() {
    return this.pass;
  }

  /**
   * @param {number} logicalW
   * @param {number} logicalH
   * @param {number} [pipelineBloomScale=1] — render tier × bloom quality (same as UnrealBloomPass).
   */
  setSize(logicalW, logicalH, pipelineBloomScale = 1) {
    const pr = Math.max(1, this.renderer?.getPixelRatio?.() ?? 1);
    const scale = Math.max(0.25, Math.min(1.5, pipelineBloomScale));
    const w = Math.max(1, Math.floor(logicalW * scale * pr));
    const h = Math.max(1, Math.floor(logicalH * scale * pr));
    this.pass._bufferW = w;
    this.pass._bufferH = h;
    this.pass._bloomScale = scale;
    this.pass._rtA = null;
  }

  /**
   * @param {object} settings — `state.bloom`
   */
  updateSettings(settings) {
    if (!settings) return;
    const p = this.pass;
    const qualityId =
      settings.quality === 'low' ||
      settings.quality === 'high' ||
      settings.quality === 'ultra'
        ? settings.quality
        : 'medium';
    if (qualityId !== p._qualityId) {
      p._qualityId = qualityId;
      p._rtA = null;
    }
    p._settings = {
      threshold: settings.threshold,
      strength: settings.strength,
      radius: settings.radius,
      color: settings.color,
      quality: qualityId,
    };
  }

  dispose() {
    this.pass.dispose();
  }
}
