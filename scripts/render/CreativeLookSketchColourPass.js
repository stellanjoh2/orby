import * as THREE from 'three';
import {
  FullScreenQuad,
  Pass,
} from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/Pass.js';
import { resetRendererFullViewport } from './resetRendererFullViewport.js';
import {
  SKETCH_COLOUR_COMPOSITE_FRAGMENT,
  SKETCH_COLOUR_PASS_RESOLUTION_SCALE,
  SKETCH_OUTLINE_REFERENCE_PIXEL_RATIO,
  creativeLookSketchColourWashRadius,
  creativeLookSketchGrainScale,
  resolveCreativeLookSketchParams,
} from './creativeLookSketchColourArt.js';
import {
  applyCreativeLookStrokeUniforms,
  resolveCreativeLookInkParams,
} from './creativeLookInkArt.js';
import {
  WATERCOLOUR_KUWAHARA_FRAGMENT,
  WATERCOLOUR_TEXEL_SCALE,
} from './creativeLookWatercolourArt.js';

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

class CreativeLookSketchColourPass extends Pass {
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

    this._kuwaharaMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTexelSize: { value: new THREE.Vector2(1, 1) },
        uRadius: { value: 4 },
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
        uIntensity: { value: 1 },
        uGrainScale: { value: 1 },
        uTexelSize: { value: new THREE.Vector2(1, 1) },
        uOutlinePxScale: { value: 1 },
        uInkWidthScale: { value: 1 },
        uRasterScale: { value: 1 },
        uTime: { value: 0 },
        uStrokeColor: { value: new THREE.Color(8 / 255, 8 / 255, 8 / 255) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: SKETCH_COLOUR_COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });

    this._quad = new FullScreenQuad(this._compositeMat);
    /** @type {THREE.WebGLRenderTarget | null} */
    this._paintTarget = null;
  }

  /** @param {import('three').WebGLRenderer} renderer */
  _rtType(renderer) {
    return renderer?.capabilities?.isWebGL2 === true
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType;
  }

  _ensurePaintTarget(renderer) {
    const w = this._paintW;
    const h = this._paintH;
    const type = this._rtType(renderer);
    if (this._paintTarget?.width === w && this._paintTarget?.height === h) {
      return;
    }
    this._paintTarget?.dispose();
    this._paintTarget = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this._compositeMat.uniforms.tPaint.value = this._paintTarget.texture;
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
    this._paintW = Math.max(1, Math.floor(this._fullW * SKETCH_COLOUR_PASS_RESOLUTION_SCALE));
    this._paintH = Math.max(1, Math.floor(this._fullH * SKETCH_COLOUR_PASS_RESOLUTION_SCALE));
    this._compositeMat.uniforms.uTexelSize.value.set(1 / this._fullW, 1 / this._fullH);
    this._compositeMat.uniforms.uOutlinePxScale.value =
      pr / SKETCH_OUTLINE_REFERENCE_PIXEL_RATIO;
    this._kuwaharaMat.uniforms.uTexelSize.value.set(1 / this._paintW, 1 / this._paintH);
  }

  /**
   * @param {{
   *   enabled?: boolean,
   *   strokeWidth?: number,
   *   rasterSize?: number,
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
    }
    const legacyScale = typeof settings.patternScale === 'number'
      ? settings.patternScale
      : undefined;
    const params = resolveCreativeLookSketchParams(
      {
        sketch: {
          strokeWidth: settings.strokeWidth ?? legacyScale,
          rasterSize: settings.rasterSize ?? legacyScale,
        },
      },
      legacyScale ?? 1,
    );
    if (params.rasterSize <= 0) {
      this.enabled = false;
      return;
    }
    this._compositeMat.uniforms.uInkWidthScale.value = params.strokeWidth;
    this._compositeMat.uniforms.uRasterScale.value = params.rasterSize;
    this._compositeMat.uniforms.uGrainScale.value = creativeLookSketchGrainScale(
      params.rasterSize,
    );
    this._kuwaharaMat.uniforms.uRadius.value = creativeLookSketchColourWashRadius(
      params.rasterSize,
    );
    const ink = resolveCreativeLookInkParams(
      {
        ink: {
          strokeColor: settings.strokeColor,
        },
      },
      settings.preset ?? 'sketch-colour',
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

    this._ensurePaintTarget(renderer);
    this._kuwaharaMat.uniforms.tDiffuse.value = readBuffer.texture;
    this._draw(renderer, this._kuwaharaMat, this._paintTarget);

    const outTarget = this.renderToScreen ? null : writeBuffer;
    this._compositeMat.uniforms.tDiffuse.value = readBuffer.texture;
    this._draw(renderer, this._compositeMat, outTarget);

    resetRendererFullViewport(renderer);
  }

  dispose() {
    this._paintTarget?.dispose();
    this._paintTarget = null;
    this._kuwaharaMat.dispose();
    this._compositeMat.dispose();
    this._quad.dispose();
  }
}

/** Coloured sketch — manga screentone + ink on watercolour-washed colormap. */
export class CreativeLookSketchColour {
  /** @param {import('three').WebGLRenderer} renderer */
  constructor(renderer) {
    this.pass = new CreativeLookSketchColourPass(renderer);
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
