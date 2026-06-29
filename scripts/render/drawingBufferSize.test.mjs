/**
 * Drawing-buffer sizing — DPR-only transitions at fixed logical size (1080p export path).
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  coerceRendererLogicalSize,
  getDrawingBufferLogicalSize,
  getViewportBackingStorePixels,
} from './drawingBufferSize.js';

function mockRendererWithGlBuffer(logicalW, logicalH, bufferW, bufferH, dpr) {
  let pixelRatio = dpr;
  let logicalWidth = logicalW;
  let logicalHeight = logicalH;
  let bufferWidth = bufferW;
  let bufferHeight = bufferH;

  return {
    getPixelRatio: () => pixelRatio,
    getSize: (target) => target.set(logicalWidth, logicalHeight),
    getDrawingBufferSize: (target) => target.set(bufferWidth, bufferHeight),
    getContext: () => ({
      drawingBufferWidth: bufferWidth,
      drawingBufferHeight: bufferHeight,
    }),
    setPixelRatio: (pr) => {
      pixelRatio = pr;
    },
    setSize: (w, h) => {
      logicalWidth = w;
      logicalHeight = h;
    },
    setDrawingBufferSize: (w, h, pr) => {
      logicalWidth = w;
      logicalHeight = h;
      pixelRatio = pr;
      bufferWidth = Math.round(w * pr);
      bufferHeight = Math.round(h * pr);
    },
  };
}

describe('drawingBufferSize', () => {
  it('getDrawingBufferLogicalSize uses GL backing store, not stale getSize', () => {
    const renderer = mockRendererWithGlBuffer(1920, 1080, 1920, 1080, 2);
    const logical = getDrawingBufferLogicalSize(renderer);
    assert.equal(logical.x, 960);
    assert.equal(logical.y, 540);
  });

  it('getViewportBackingStorePixels matches GL backing store', () => {
    const renderer = mockRendererWithGlBuffer(1920, 1080, 3840, 2160, 2);
    const px = getViewportBackingStorePixels(renderer);
    assert.equal(px.width, 3840);
    assert.equal(px.height, 2160);
  });

  it('coerceRendererLogicalSize expands backing store when only DPR changes (1080p restore)', () => {
    const renderer = mockRendererWithGlBuffer(1920, 1080, 1920, 1080, 1);
    coerceRendererLogicalSize(renderer, 1920, 1080, 2);
    assert.equal(renderer.getPixelRatio(), 2);
    const px = getViewportBackingStorePixels(renderer);
    assert.equal(px.width, 3840);
    assert.equal(px.height, 2160);
  });
});
