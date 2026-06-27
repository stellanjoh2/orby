import * as THREE from 'three';
import { ORBY_BLACK } from '../../constants.js';

const ASPECT_219 = 21 / 9;

/**
 * 21∶9 letterbox bar rects for the largest inner picture area — matches
 * `.viewport-letterbox` container-query geometry in styles.css.
 *
 * @param {number} w
 * @param {number} h
 * @returns {Array<{ x: number, y: number, width: number, height: number }>}
 */
export function computeCinematicLetterbox219Mattes(w, h) {
  if (w <= 0 || h <= 0) return [];

  const ar = w / h;
  if (ar >= ASPECT_219) {
    const innerW = h * ASPECT_219;
    const gap = w - innerW;
    const left = Math.floor(gap / 2);
    const right = gap - left;
    if (left <= 0 && right <= 0) return [];
    const bars = [];
    if (left > 0) bars.push({ x: 0, y: 0, width: left, height: h });
    if (right > 0) bars.push({ x: w - right, y: 0, width: right, height: h });
    return bars;
  }

  const innerH = (w * 9) / 21;
  const gap = h - innerH;
  const top = Math.floor(gap / 2);
  const bottom = gap - top;
  if (top <= 0 && bottom <= 0) return [];
  const bars = [];
  if (top > 0) bars.push({ x: 0, y: 0, width: w, height: top });
  if (bottom > 0) bars.push({ x: 0, y: h - bottom, width: w, height: bottom });
  return bars;
}

/**
 * Paint Orby black mattes for export stills (same geometry as viewport overlay).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
export function fillCinematicLetterbox219Mattes(ctx, w, h) {
  const bars = computeCinematicLetterbox219Mattes(w, h);
  if (!bars.length) return;
  ctx.fillStyle = ORBY_BLACK;
  for (const bar of bars) {
    ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
  }
}

/**
 * Draw Orby-black 21∶9 mattes straight into the renderer's default framebuffer.
 *
 * MP4 export records `renderer.domElement` via `captureStream`, which samples the GL
 * drawing buffer — a CSS overlay or 2D-canvas matte (the still-image path) is never seen.
 * So the bars must be cleared into GL itself. Uses the three.js state API (not raw
 * `gl.scissor`) to keep `WebGLState`'s cache in sync. Geometry matches the bars from
 * {@link computeCinematicLetterbox219Mattes}; GL scissor origin is bottom-left so Y flips.
 *
 * @param {import('three').WebGLRenderer} renderer
 */
export function fillCinematicLetterbox219MattesGl(renderer) {
  const gl = renderer?.getContext?.();
  if (!gl) return;
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const bars = computeCinematicLetterbox219Mattes(w, h);
  if (!bars.length) return;

  const prevRenderTarget = renderer.getRenderTarget();
  const prevScissorTest = renderer.getScissorTest();
  const prevScissor = renderer.getScissor(new THREE.Vector4());
  const prevClearColor = renderer.getClearColor(new THREE.Color());
  const prevClearAlpha = renderer.getClearAlpha();

  renderer.setRenderTarget(null);
  renderer.setScissorTest(true);
  renderer.setClearColor(ORBY_BLACK, 1);
  for (const bar of bars) {
    const glY = h - bar.y - bar.height;
    renderer.setScissor(bar.x, glY, bar.width, bar.height);
    renderer.clear(true, false, false);
  }

  renderer.setScissorTest(prevScissorTest);
  renderer.setScissor(prevScissor.x, prevScissor.y, prevScissor.z, prevScissor.w);
  renderer.setClearColor(prevClearColor, prevClearAlpha);
  renderer.setRenderTarget(prevRenderTarget);
}
