import * as THREE from 'three';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/ShaderPass.js';
import { GodRaysShader } from '../GodRaysEffect.js';

/**
 * Volumetric scattering pass with a scene depth prepass for per-pixel sun occlusion.
 */
export class MeshglGodRaysPass extends ShaderPass {
  /**
   * @param {import('three').Scene} scene
   * @param {import('three').Camera} camera
   */
  constructor(scene, camera) {
    super(GodRaysShader);
    this.scene = scene;
    this.camera = camera;

    this.renderTargetDepth = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
    });
    this.renderTargetDepth.texture.name = 'GodRaysPass.depth';

    this.materialDepth = new THREE.MeshDepthMaterial();
    this.materialDepth.depthPacking = THREE.RGBADepthPacking;
    this.materialDepth.blending = THREE.NoBlending;

    this.uniforms.tDepth.value = this.renderTargetDepth.texture;
    this._oldClearColor = new THREE.Color();
    /** @type {import('three').Object3D[]} */
    this._depthHideStack = [];
  }

  setSize(width, height) {
    if (this.renderTargetDepth) {
      this.renderTargetDepth.setSize(width, height);
    }
  }

  _beginDepthExclusions() {
    this._depthHideStack.length = 0;
    this.scene.traverse((obj) => {
      if (!obj.visible) return;
      if (obj.userData?.skipBokehDepth || obj.userData?.lensflare != null) {
        this._depthHideStack.push(obj);
        obj.visible = false;
      }
    });
  }

  _endDepthExclusions() {
    for (let i = 0; i < this._depthHideStack.length; i++) {
      this._depthHideStack[i].visible = true;
    }
    this._depthHideStack.length = 0;
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    const w = readBuffer?.width ?? 1;
    const h = readBuffer?.height ?? 1;
    this.renderTargetDepth.setSize(w, h);

    const oldOverride = this.scene.overrideMaterial;
    this.scene.overrideMaterial = this.materialDepth;

    renderer.getClearColor(this._oldClearColor);
    const oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(0xffffff);
    renderer.setClearAlpha(1.0);
    renderer.setRenderTarget(this.renderTargetDepth);
    renderer.clear();

    this._beginDepthExclusions();
    try {
      renderer.render(this.scene, this.camera);
    } finally {
      this._endDepthExclusions();
      this.scene.overrideMaterial = oldOverride;
      renderer.setClearColor(this._oldClearColor);
      renderer.setClearAlpha(oldClearAlpha);
      renderer.autoClear = oldAutoClear;
    }

    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = this.renderTargetDepth.texture;
    this.uniforms.uProjectionMatrix.value.copy(this.camera.projectionMatrix);
    this.uniforms.uInverseProjectionMatrix.value.copy(
      this.camera.projectionMatrixInverse,
    );
    this.uniforms.uViewMatrix.value.copy(this.camera.matrixWorldInverse);
    this.uniforms.uNearClip.value = this.camera.near;
    this.uniforms.uFarClip.value = this.camera.far;

    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }

  dispose() {
    this.renderTargetDepth?.dispose();
    this.materialDepth?.dispose();
    this.material?.dispose();
    this.fsQuad?.dispose?.();
  }
}
