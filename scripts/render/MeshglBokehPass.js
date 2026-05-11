import { BokehPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/BokehPass.js';

/**
 * Three.js stock {@link BokehPass} (same family as
 * [Depth of Field Gallery](https://threejsdemos.com/demos/lighting/depth-gallery)) with mesh-only
 * extras: optional far-depth proxy during the depth prepass, and lens-flare exclusions from depth.
 */
class MeshglBokehPass extends BokehPass {
  constructor(scene, camera, params = {}) {
    super(scene, camera, {
      focus: params.focus !== undefined ? params.focus : 1.0,
      aperture: params.aperture !== undefined ? params.aperture : 0.025,
      maxblur: params.maxblur !== undefined ? params.maxblur : 0.01,
    });
    this.getDofDepthProxy =
      typeof params.getDofDepthProxy === 'function' ? params.getDofDepthProxy : null;
    /** @type {import('three').Object3D[]} */
    this._bokehDepthHideStack = [];
  }

  /** Pipeline compatibility; quality only affects `maxblur` in {@link PostProcessingPipeline#updateDof}. */
  setDofQualityTier() {}

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

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    const depthProxy = this.getDofDepthProxy?.() ?? null;
    let restoreDepthProxy = false;
    if (depthProxy && depthProxy.visible === false) {
      depthProxy.visible = true;
      restoreDepthProxy = true;
    }

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

    if (restoreDepthProxy) {
      depthProxy.visible = false;
    }

    this.uniforms.tColor.value = readBuffer.texture;
    this.uniforms.nearClip.value = this.camera.near;
    this.uniforms.farClip.value = this.camera.far;

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
}

export { MeshglBokehPass };
