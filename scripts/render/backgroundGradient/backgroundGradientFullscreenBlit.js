import * as THREE from 'three';
import { FullScreenQuad } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/Pass.js';
import { CopyShader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/shaders/CopyShader.js';

/**
 * Fullscreen copy of the gradient canvas texture into the active render target.
 * Avoids Three.js scene.background, which can render into a partial GL viewport after
 * post/export resize (hard rectangular seam in PNG export).
 */
export class BackgroundGradientFullscreenBlit {
  constructor() {
    this._fsQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
        vertexShader: CopyShader.vertexShader,
        fragmentShader: CopyShader.fragmentShader,
        depthTest: false,
        depthWrite: false,
      }),
    );
  }

  /** @param {THREE.WebGLRenderer} renderer @param {THREE.Texture} texture */
  render(renderer, texture) {
    this._fsQuad.material.uniforms.tDiffuse.value = texture;
    this._fsQuad.render(renderer);
  }

  dispose() {
    this._fsQuad.material.dispose();
    this._fsQuad.dispose();
  }
}
