import * as THREE from 'three';
import { RGBADepthPacking } from 'three';
import { Pass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/Pass.js';
import {
  BlendFunction,
  EffectPass,
  GodRaysEffect,
  KernelSize,
} from 'postprocessing';
import { GOD_RAYS_LIGHT_RADIUS } from '../GodRaysEffect.js';

/**
 * pmndrs/postprocessing god rays for three.js EffectComposer.
 * @see https://post-processing.tresjs.org/guide/pmndrs/god-rays
 */
export class MeshglGodRaysPass extends Pass {
  /**
   * @param {import('three').Scene} scene
   * @param {import('three').Camera} camera
   */
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = true;

    /** @type {import('./MeshglBokehPass.js').MeshglBokehPass | null} */
    this.bokehPass = null;

    this.lightSource = new THREE.Mesh(
      new THREE.SphereGeometry(GOD_RAYS_LIGHT_RADIUS, 24, 16),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.lightSource.name = 'GodRaysLightSource';
    this.lightSource.frustumCulled = false;
    this.lightSource.userData.lensflare = 'no-occlusion';
    this.lightSource.visible = false;
    scene.add(this.lightSource);

    this.godRaysEffect = new GodRaysEffect(camera, this.lightSource, {
      blendFunction: BlendFunction.SCREEN,
      samples: 60,
      density: 0.96,
      decay: 0.92,
      weight: 0.4,
      exposure: 0.6,
      clampMax: 1.0,
      resolutionScale: 0.5,
      blur: true,
      kernelSize: KernelSize.SMALL,
    });

    this.effectPass = new EffectPass(camera, this.godRaysEffect);
    this.effectPass.mainScene = scene;
    this.effectPass.mainCamera = camera;
    this.effectPass.needsSwap = true;

    this.renderTargetDepth = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
    });
    this.renderTargetDepth.texture.name = 'GodRaysPass.depth';
    this.materialDepth = new THREE.MeshDepthMaterial();
    this.materialDepth.depthPacking = THREE.RGBADepthPacking;
    this.materialDepth.blending = THREE.NoBlending;

    this._oldClearColor = new THREE.Color();
    /** @type {import('three').Object3D[]} */
    this._depthHideStack = [];
    this._initialized = false;
    this._lastSize = { w: 0, h: 0 };
  }

  setSize(width, height) {
    this._lastSize.w = width;
    this._lastSize.h = height;
    this.effectPass.setSize(width, height);
    this.renderTargetDepth.setSize(width, height);
  }

  _ensureInitialized(renderer, readBuffer) {
    if (this._initialized) return;
    const frameBufferType = readBuffer?.texture?.type;
    this.effectPass.initialize(renderer, false, frameBufferType);
    this.effectPass.setSize(this._lastSize.w || 1, this._lastSize.h || 1);
    this._initialized = true;
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

  _renderDepthPrepass(renderer) {
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
  }

  _syncDepthTexture(renderer) {
    const bokehDepth =
      this.bokehPass?.enabled && this.bokehPass.renderTargetDepth?.texture
        ? this.bokehPass.renderTargetDepth.texture
        : null;

    if (bokehDepth) {
      this.godRaysEffect.setDepthTexture(bokehDepth, RGBADepthPacking);
      return;
    }

    this._renderDepthPrepass(renderer);
    this.godRaysEffect.setDepthTexture(
      this.renderTargetDepth.texture,
      RGBADepthPacking,
    );
  }

  /** Rebuild shader after samples / uniforms change. */
  recompile() {
    this.effectPass?.recompile?.();
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    this._ensureInitialized(renderer, readBuffer);
    this._syncDepthTexture(renderer);

    this.lightSource.visible = true;
    try {
      this.effectPass.renderToScreen = false;
      this.effectPass.render(renderer, readBuffer, writeBuffer, deltaTime, maskActive);
    } finally {
      this.lightSource.visible = false;
    }
  }

  dispose() {
    this.scene?.remove(this.lightSource);
    this.lightSource.geometry?.dispose();
    this.lightSource.material?.dispose();
    this.renderTargetDepth?.dispose();
    this.materialDepth?.dispose();
    this.effectPass?.dispose();
    this.godRaysEffect?.dispose();
  }
}
