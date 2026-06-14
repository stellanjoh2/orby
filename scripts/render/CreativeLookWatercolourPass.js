import * as THREE from 'three';
import {
  FullScreenQuad,
  Pass,
} from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/Pass.js';
import { resetRendererFullViewport } from './resetRendererFullViewport.js';
import {
  WATERCOLOUR_BLEED_PREP_FRAGMENT,
  WATERCOLOUR_COMPOSITE_FRAGMENT,
  WATERCOLOUR_DEFAULT_RADIUS,
  WATERCOLOUR_KUWAHARA_FRAGMENT,
  WATERCOLOUR_MEGA_BLEED_PREP_FRAGMENT,
  WATERCOLOUR_PASS_RESOLUTION_SCALE,
  WATERCOLOUR_TEXEL_SCALE,
  creativeLookWatercolourRadius,
} from './creativeLookWatercolourArt.js';
import { creativeLookOutlineWidthScale } from './creativeLookOutlineWidth.js';
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

class CreativeLookWatercolourPass extends Pass {
  /** @param {import('three').WebGLRenderer} renderer */
  constructor(renderer) {
    super();
    this.renderer = renderer;
    this.needsSwap = true;
    this.enabled = false;
    this.renderToScreen = false;

    this._fullW = 1;
    this._fullH = 1;
    this._paintW = 1;
    this._paintH = 1;
    this._pixelRatio = 1;

    this._kuwaharaMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTexelSize: { value: new THREE.Vector2(1, 1) },
        uRadius: { value: WATERCOLOUR_DEFAULT_RADIUS },
        uTexelScale: { value: WATERCOLOUR_TEXEL_SCALE },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: WATERCOLOUR_KUWAHARA_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });

    this._compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tPaint: { value: null },
        tBleed: { value: null },
        tMegaBleed: { value: null },
        uIntensity: { value: 1 },
        uTexelSize: { value: new THREE.Vector2(1, 1) },
        uInkWidthScale: { value: 1 },
        uStrokeColor: { value: new THREE.Color(8 / 255, 8 / 255, 8 / 255) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: WATERCOLOUR_COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });

    this._bleedMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tPaint: { value: null },
        uTexelSize: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: WATERCOLOUR_BLEED_PREP_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });

    this._megaBleedMat = new THREE.ShaderMaterial({
      uniforms: {
        tBleed: { value: null },
        uTexelSize: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: WATERCOLOUR_MEGA_BLEED_PREP_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });

    this._quad = new FullScreenQuad(this._compositeMat);

    /** @type {THREE.WebGLRenderTarget | null} */
    this._paintTarget = null;
    /** @type {THREE.WebGLRenderTarget | null} */
    this._bleedTarget = null;
    /** @type {THREE.WebGLRenderTarget | null} */
    this._megaBleedTarget = null;
  }

  /** @param {import('three').WebGLRenderer} renderer */
  _rtType(renderer) {
    return renderer?.capabilities?.isWebGL2 === true
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType;
  }

  _ensureHalfResTargets(renderer) {
    const w = this._paintW;
    const h = this._paintH;
    const type = this._rtType(renderer);
    const needsPaint = this._paintTarget?.width !== w || this._paintTarget?.height !== h;
    const needsBleed = this._bleedTarget?.width !== w || this._bleedTarget?.height !== h;
    const needsMega = this._megaBleedTarget?.width !== w || this._megaBleedTarget?.height !== h;

    if (needsPaint) {
      this._paintTarget?.dispose();
      this._paintTarget = new THREE.WebGLRenderTarget(w, h, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type,
        depthBuffer: false,
        stencilBuffer: false,
      });
    }

    if (needsBleed) {
      this._bleedTarget?.dispose();
      this._bleedTarget = new THREE.WebGLRenderTarget(w, h, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type,
        depthBuffer: false,
        stencilBuffer: false,
      });
    }

    if (needsMega) {
      this._megaBleedTarget?.dispose();
      this._megaBleedTarget = new THREE.WebGLRenderTarget(w, h, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type,
        depthBuffer: false,
        stencilBuffer: false,
      });
    }
  }

  _disposeHalfResTargets() {
    this._paintTarget?.dispose();
    this._paintTarget = null;
    this._bleedTarget?.dispose();
    this._bleedTarget = null;
    this._megaBleedTarget?.dispose();
    this._megaBleedTarget = null;
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
    this._pixelRatio = Math.max(1, this.renderer?.getPixelRatio?.() ?? 1);
    this._fullW = Math.max(1, Math.floor(logicalW * this._pixelRatio));
    this._fullH = Math.max(1, Math.floor(logicalH * this._pixelRatio));
    this._paintW = Math.max(1, Math.floor(this._fullW * WATERCOLOUR_PASS_RESOLUTION_SCALE));
    this._paintH = Math.max(1, Math.floor(this._fullH * WATERCOLOUR_PASS_RESOLUTION_SCALE));

    this._kuwaharaMat.uniforms.uTexelSize.value.set(1 / this._fullW, 1 / this._fullH);
    this._bleedMat.uniforms.uTexelSize.value.set(1 / this._fullW, 1 / this._fullH);
    this._megaBleedMat.uniforms.uTexelSize.value.set(1 / this._fullW, 1 / this._fullH);
    this._compositeMat.uniforms.uTexelSize.value.set(1 / this._fullW, 1 / this._fullH);
    this._ensureHalfResTargets(this.renderer);
  }

  /**
   * @param {{
   *   enabled?: boolean,
   *   radius?: number,
   *   patternScale?: number,
   *   intensity?: number,
   *   strokeColor?: string,
   *   preset?: string,
   * }} settings
   */
  updateSettings(settings = {}) {
    if (!settings) return;
    // Preset on/off is not the same as composer pass on: push/pop presentation enables this
    // pass only during the slim watercolour stack. Never leave it enabled in the full chain.
    if (typeof settings.enabled === 'boolean') {
      if (!settings.enabled) {
        this.enabled = false;
      }
    }
    if (typeof settings.patternScale === 'number') {
      this._compositeMat.uniforms.uInkWidthScale.value = creativeLookOutlineWidthScale(
        settings.patternScale,
      );
    }
    if (typeof settings.radius === 'number' && Number.isFinite(settings.radius)) {
      this._kuwaharaMat.uniforms.uRadius.value = settings.radius;
    } else if (typeof settings.patternScale === 'number') {
      this._kuwaharaMat.uniforms.uRadius.value = creativeLookWatercolourRadius(
        settings.patternScale,
      );
    }
    if (typeof settings.intensity === 'number' && Number.isFinite(settings.intensity)) {
      this._compositeMat.uniforms.uIntensity.value = settings.intensity;
    }
    const ink = resolveCreativeLookInkParams(
      {
        ink: {
          strokeColor: settings.strokeColor,
        },
      },
      settings.preset ?? 'watercolour',
    );
    applyCreativeLookStrokeUniforms(this._compositeMat.uniforms, ink);
  }

  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').WebGLRenderTarget} writeBuffer
   * @param {import('three').WebGLRenderTarget} readBuffer
   */
  render(renderer, writeBuffer, readBuffer) {
    if (!this.enabled) return;

    this._ensureHalfResTargets(renderer);

    const sceneTex = readBuffer.texture;
    this._kuwaharaMat.uniforms.tDiffuse.value = sceneTex;
    this._draw(renderer, this._kuwaharaMat, this._paintTarget);

    this._bleedMat.uniforms.tDiffuse.value = sceneTex;
    this._bleedMat.uniforms.tPaint.value = this._paintTarget.texture;
    this._draw(renderer, this._bleedMat, this._bleedTarget);

    this._megaBleedMat.uniforms.tBleed.value = this._bleedTarget.texture;
    this._draw(renderer, this._megaBleedMat, this._megaBleedTarget);

    const outTarget = this.renderToScreen ? null : writeBuffer;
    this._compositeMat.uniforms.tDiffuse.value = sceneTex;
    this._compositeMat.uniforms.tPaint.value = this._paintTarget.texture;
    this._compositeMat.uniforms.tBleed.value = this._bleedTarget.texture;
    this._compositeMat.uniforms.tMegaBleed.value = this._megaBleedTarget.texture;
    this._draw(renderer, this._compositeMat, outTarget);

    resetRendererFullViewport(renderer);
  }

  dispose() {
    this._disposeHalfResTargets();
    this._kuwaharaMat.dispose();
    this._bleedMat.dispose();
    this._megaBleedMat.dispose();
    this._compositeMat.dispose();
    this._quad.dispose();
  }
}

/** Half-res Kuwahara + bleed + mega-halo bake → lightweight full-res composite. */
export class CreativeLookWatercolour {
  /** @param {import('three').WebGLRenderer} renderer */
  constructor(renderer) {
    this.pass = new CreativeLookWatercolourPass(renderer);
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
