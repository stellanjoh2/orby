import * as THREE from 'three';
import { fullViewportLogicalSize } from '../../../scripts/render/fullViewportLogicalSize.js';

const ORBY_BLACK = '#080808';

/**
 * Desktop ComposerLifecycle frame prep — mobile was skipping this, which let bloom passes
 * leave clearAlpha=0 and corrupt the next RenderPass (dark / muddy scene).
 */

/** @param {THREE.WebGLRenderer} renderer */
export function resetMobileRendererViewport(renderer) {
  const v = fullViewportLogicalSize(renderer);
  renderer.setViewport(0, 0, v.x, v.y);
  if (typeof renderer.setScissorTest === 'function') {
    renderer.setScissorTest(false);
  }
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 */
export function syncMobileRendererClearForSceneBackground(renderer, scene) {
  const bg = scene.background;
  if (bg == null) {
    renderer.setClearColor(new THREE.Color(ORBY_BLACK), 1);
    renderer.setClearAlpha(1);
    return;
  }
  if (bg.isColor) {
    renderer.setClearColor(bg, 1);
    renderer.setClearAlpha(1);
    return;
  }
  renderer.setClearColor(0x000000, 1);
  renderer.setClearAlpha(1);
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {import('../../../scripts/render/MeshglEffectComposer.js').MeshglEffectComposer} composer
 * @param {(w: number, h: number) => void} resyncSize
 */
export function ensureMobileComposerBuffersMatchRenderer(renderer, composer, resyncSize) {
  if (!composer?.renderTarget1) return;
  const gl = renderer.getContext();
  let bw;
  let bh;
  if (gl && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0) {
    bw = gl.drawingBufferWidth;
    bh = gl.drawingBufferHeight;
  } else {
    const db = new THREE.Vector2();
    renderer.getDrawingBufferSize(db);
    bw = db.x;
    bh = db.y;
  }
  const rt = composer.renderTarget1;
  if (Math.abs(rt.width - bw) <= 2 && Math.abs(rt.height - bh) <= 2) {
    return;
  }
  const logical = fullViewportLogicalSize(renderer);
  resyncSize(logical.x, logical.y);
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {import('../../../scripts/render/MeshglEffectComposer.js').MeshglEffectComposer} composer
 * @param {(w: number, h: number) => void} resyncSize
 */
export function prepareMobileComposerFrame(renderer, scene, composer, resyncSize) {
  ensureMobileComposerBuffersMatchRenderer(renderer, composer, resyncSize);
  resetMobileRendererViewport(renderer);
  syncMobileRendererClearForSceneBackground(renderer, scene);
}
