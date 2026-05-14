import * as THREE from 'three';
import { fullViewportLogicalSize } from './fullViewportLogicalSize.js';

/** σ≈1.5 Gaussian, 5 taps — weights sum to ~0.859; we normalize in shader. */
const GAUSS_W0 = 0.227027027;
const GAUSS_W1 = 0.1945945946;
const GAUSS_W2 = 0.1216216216;
const GAUSS_SUM = GAUSS_W0 + 2 * GAUSS_W1 + 2 * GAUSS_W2;

/**
 * Two-pass separable blur (H then V) for base glass — avoids multi-tap ghosting in one projected pass.
 * Blur radius scales with blur01 (glass blur slider).
 */
export class BaseGlassSeparableBlur {
  constructor(renderer, width, height) {
    const type =
      renderer?.capabilities?.isWebGL2 === true ? THREE.HalfFloatType : THREE.UnsignedByteType;

    const rtOpts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type,
      depthBuffer: false,
      stencilBuffer: false,
    };

    this.width = width;
    this.height = height;
    this.rtH = new THREE.WebGLRenderTarget(width, height, rtOpts);
    this.rtV = new THREE.WebGLRenderTarget(width, height, rtOpts);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);

    const fragmentShader = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 pixelStep;
varying vec2 vUv;

void main() {
  vec2 o1 = pixelStep;
  vec2 o2 = pixelStep * 2.0;
  vec4 c =
    texture2D( tDiffuse, vUv ) * ${GAUSS_W0.toFixed(10)}
    + texture2D( tDiffuse, vUv + o1 ) * ${GAUSS_W1.toFixed(10)}
    + texture2D( tDiffuse, vUv - o1 ) * ${GAUSS_W1.toFixed(10)}
    + texture2D( tDiffuse, vUv + o2 ) * ${GAUSS_W2.toFixed(10)}
    + texture2D( tDiffuse, vUv - o2 ) * ${GAUSS_W2.toFixed(10)};
  gl_FragColor = c / ${GAUSS_SUM.toFixed(10)};
}
`;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        pixelStep: { value: new THREE.Vector2() },
      },
      vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new THREE.Mesh(geo, this.material);
    this.scene.add(this.quad);
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.rtH.setSize(width, height);
    this.rtV.setSize(width, height);
  }

  dispose() {
    this.rtH.dispose();
    this.rtV.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }

  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Texture} sourceTexture — sharp reflection RT texture
   * @param {number} blur01 — 0…1 from UI
   * @returns {THREE.Texture} blurred texture (rtV)
   */
  render(renderer, sourceTexture, blur01) {
    const w = this.width;
    const h = this.height;
    const b = Math.min(1, Math.max(0, blur01));
    const radiusPx = 0.35 + b * 18.0;
    /** Two H+V cycles at ~half radius each widens the kernel without visible tap ghosting. */
    const cycles = b > 0.22 ? 2 : 1;
    const r = radiusPx / Math.sqrt(cycles);

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    /** WebGLRenderer multiplies setViewport by pixelRatio; RT `w`/`h` are already texture pixels. */
    const pr = Math.max(1e-6, renderer.getPixelRatio());
    const vw = w / pr;
    const vh = h / pr;

    let src = sourceTexture;
    try {
      for (let c = 0; c < cycles; c++) {
        this.material.uniforms.tDiffuse.value = src;

        this.material.uniforms.pixelStep.value.set(r / w, 0);
        renderer.setRenderTarget(this.rtH);
        renderer.setViewport(0, 0, vw, vh);
        renderer.autoClear = true;
        renderer.clear();
        renderer.render(this.scene, this.camera);

        this.material.uniforms.tDiffuse.value = this.rtH.texture;
        this.material.uniforms.pixelStep.value.set(0, r / h);
        renderer.setRenderTarget(this.rtV);
        renderer.setViewport(0, 0, vw, vh);
        renderer.clear();
        renderer.render(this.scene, this.camera);

        src = this.rtV.texture;
      }
    } finally {
      renderer.setRenderTarget(prevTarget);
      // Restore full framebuffer; prefer GL drawing-buffer size over Three's cache (export/DPR drift).
      const v = fullViewportLogicalSize(renderer);
      renderer.setViewport(0, 0, v.x, v.y);
      if (typeof renderer.setScissorTest === 'function') {
        renderer.setScissorTest(false);
      }
      renderer.autoClear = prevAutoClear;
    }

    return this.rtV.texture;
  }
}
