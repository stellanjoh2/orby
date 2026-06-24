import * as THREE from 'three';
import { getDrawingBufferLogicalSize } from './drawingBufferSize.js';

/**
 * Logical width/height for `renderer.setViewport(0, 0, w, h)` covering the full WebGL backing store.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Vector2} [target]
 */
export function fullViewportLogicalSize(renderer, target = new THREE.Vector2()) {
  return getDrawingBufferLogicalSize(renderer, target);
}
