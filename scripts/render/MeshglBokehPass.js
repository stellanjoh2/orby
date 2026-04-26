import {
  Color,
  HalfFloatType,
  MeshDepthMaterial,
  NearestFilter,
  NoBlending,
  RGBADepthPacking,
  ShaderMaterial,
  UniformsUtils,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { Pass, FullScreenQuad } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/Pass.js';
import { BokehShaderMeshgl } from '../shaders/BokehShaderMeshgl.js';

/**
 * BokehPass using BokehShaderMeshgl (edge-safe color taps for high FOV / strong blur).
 */
class MeshglBokehPass extends Pass {
  constructor(scene, camera, params) {
    super();

    this.scene = scene;
    this.camera = camera;

    const focus = params.focus !== undefined ? params.focus : 1.0;
    const aperture = params.aperture !== undefined ? params.aperture : 0.025;
    const maxblur = params.maxblur !== undefined ? params.maxblur : 1.0;

    this.renderTargetDepth = new WebGLRenderTarget(1, 1, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      type: HalfFloatType,
    });

    this.renderTargetDepth.texture.name = 'MeshglBokehPass.depth';

    this.materialDepth = new MeshDepthMaterial();
    this.materialDepth.depthPacking = RGBADepthPacking;
    this.materialDepth.blending = NoBlending;

    const bokehUniforms = UniformsUtils.clone(BokehShaderMeshgl.uniforms);

    bokehUniforms.tDepth.value = this.renderTargetDepth.texture;

    bokehUniforms.focus.value = focus;
    bokehUniforms.aspect.value = camera.aspect;
    bokehUniforms.aperture.value = aperture;
    bokehUniforms.maxblur.value = maxblur;
    bokehUniforms.nearClip.value = camera.near;
    bokehUniforms.farClip.value = camera.far;
    bokehUniforms.uHalfTexel.value = new Vector2(0.5, 0.5);

    this.materialBokeh = new ShaderMaterial({
      defines: { ...BokehShaderMeshgl.defines },
      uniforms: bokehUniforms,
      vertexShader: BokehShaderMeshgl.vertexShader,
      fragmentShader: BokehShaderMeshgl.fragmentShader,
    });

    this.uniforms = bokehUniforms;

    this.fsQuad = new FullScreenQuad(this.materialBokeh);

    this._oldClearColor = new Color();
    /** @type {import('three').Object3D[]} */
    this._bokehDepthHideStack = [];
  }

  /**
   * Screen-space / camera-attached FX (e.g. lens flare) must not write into the DOF depth
   * prepass: they sit near the camera and would stamp near depth over the center of the buffer,
   * killing blur there while the color buffer still shows the flare.
   */
  _beginBokehDepthExclusions() {
    this._bokehDepthHideStack.length = 0;
    this.scene.traverse((obj) => {
      if (!obj.visible) return;
      if (obj.userData?.skipBokehDepth || obj.userData?.lensflare != null) {
        this._bokehDepthHideStack.push(obj);
        obj.visible = false;
      }
    });
  }

  _endBokehDepthExclusions() {
    for (let i = 0; i < this._bokehDepthHideStack.length; i++) {
      this._bokehDepthHideStack[i].visible = true;
    }
    this._bokehDepthHideStack.length = 0;
  }

  render(renderer, writeBuffer, readBuffer) {
    this.scene.overrideMaterial = this.materialDepth;

    renderer.getClearColor(this._oldClearColor);
    const oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    renderer.setClearColor(0xffffff);
    renderer.setClearAlpha(1.0);
    renderer.setRenderTarget(this.renderTargetDepth);
    renderer.clear();

    this._beginBokehDepthExclusions();
    try {
      renderer.render(this.scene, this.camera);
    } finally {
      this._endBokehDepthExclusions();
    }

    this.uniforms.tColor.value = readBuffer.texture;
    this.uniforms.nearClip.value = this.camera.near;
    this.uniforms.farClip.value = this.camera.far;
    this.uniforms.aspect.value = this.camera.aspect;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      renderer.clear();
      this.fsQuad.render(renderer);
    }

    this.scene.overrideMaterial = null;
    renderer.setClearColor(this._oldClearColor);
    renderer.setClearAlpha(oldClearAlpha);
    renderer.autoClear = oldAutoClear;
  }

  setSize(width, height) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.materialBokeh.uniforms.aspect.value = w / h;
    this.materialBokeh.uniforms.uHalfTexel.value.set(0.5 / w, 0.5 / h);
    this.renderTargetDepth.setSize(w, h);
  }

  dispose() {
    this.renderTargetDepth.dispose();
    this.materialDepth.dispose();
    this.materialBokeh.dispose();
    this.fsQuad.dispose();
  }
}

export { MeshglBokehPass };
