import * as THREE from 'three';
import { APP_BACKGROUND } from '../../../scripts/constants.js';
import { getDrawingBufferLogicalSize, getDrawingBufferPixels } from '../../../scripts/render/drawingBufferSize.js';
import { resetRendererFullViewport } from '../../../scripts/render/resetRendererFullViewport.js';

/**
 * Desktop ComposerLifecycle frame prep — mobile was skipping this, which let bloom passes
 * leave clearAlpha=0 and corrupt the next RenderPass (dark / muddy scene).
 */

/** @param {THREE.WebGLRenderer} renderer */
export function resetMobileRendererViewport(renderer) {
  resetRendererFullViewport(renderer);
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {import('../../../scripts/render/BackgroundController.js').BackgroundController | null | undefined} [backgroundController]
 */
export function syncMobileRendererClearForSceneBackground(renderer, scene, backgroundController) {
  const bg = scene.background;
  if (bg == null) {
    const gradient = backgroundController?.gradientController;
    const hex = gradient?.isActive?.()
      ? gradient.getFallbackColor()
      : backgroundController?.getColor?.() ?? APP_BACKGROUND;
    renderer.setClearColor(new THREE.Color(hex), 1);
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
 * @param {THREE.Scene} [scene]
 * @param {import('../../../scripts/render/BackgroundController.js').BackgroundController | null | undefined} [backgroundController]
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
  const logical = getDrawingBufferLogicalSize(renderer);
  resyncSize(logical.x, logical.y);
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {import('../../../scripts/render/MeshglEffectComposer.js').MeshglEffectComposer} composer
 * @param {(w: number, h: number) => void} resyncSize
 * @param {import('../../../scripts/render/BackgroundController.js').BackgroundController | null | undefined} [backgroundController]
 */
export function prepareMobileComposerFrame(renderer, scene, composer, resyncSize, backgroundController) {
  ensureMobileComposerBuffersMatchRenderer(renderer, composer, resyncSize);
  resetMobileRendererViewport(renderer);
  const db = getDrawingBufferPixels(renderer);
  backgroundController?.gradientController?.syncToDrawingBuffer?.(
    db.width,
    db.height,
    { forceRedraw: true },
  );
  syncMobileRendererClearForSceneBackground(renderer, scene, backgroundController);
}
