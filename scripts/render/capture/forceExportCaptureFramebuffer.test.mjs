/**
 * Force export capture framebuffer — composer RT resize at 1080p.
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  composerRenderTargetsMatchPixels,
  ensureExportCapturePixelRatio,
  forceExportCaptureFramebuffer,
} from './forceExportCaptureFramebuffer.js';

function mockCaptureStack({ bufferW, bufferH, rtW, rtH, dpr = 1 } = {}) {
  let pixelRatio = dpr;
  let rtWidth = rtW;
  let rtHeight = rtH;
  let bufferWidth = bufferW;
  let bufferHeight = bufferH;
  let composerLogicalW = rtW;
  let composerLogicalH = rtH;

  const renderTarget1 = {
    get width() {
      return rtWidth;
    },
    get height() {
      return rtHeight;
    },
    setSize(w, h) {
      rtWidth = w;
      rtHeight = h;
    },
  };

  const renderer = {
    getPixelRatio: () => pixelRatio,
    setPixelRatio: (pr) => {
      pixelRatio = pr;
    },
    setSize: () => {},
    setRenderTarget: () => {},
    getRenderTarget: () => null,
    setViewport: () => {},
    setScissorTest: () => {},
    setDrawingBufferSize: (w, h, pr) => {
      composerLogicalW = w;
      composerLogicalH = h;
      pixelRatio = pr;
      bufferWidth = Math.round(w * pr);
      bufferHeight = Math.round(h * pr);
      rtWidth = bufferWidth;
      rtHeight = bufferHeight;
    },
    getContext: () => ({
      drawingBufferWidth: bufferWidth,
      drawingBufferHeight: bufferHeight,
    }),
  };

  const composer = {
    setPixelRatio: (pr) => {
      pixelRatio = pr;
    },
    setSize: (w, h) => {
      composerLogicalW = w;
      composerLogicalH = h;
      rtWidth = Math.round(w * pixelRatio);
      rtHeight = Math.round(h * pixelRatio);
    },
    renderTarget1,
    renderTarget2: renderTarget1,
  };

  return { renderer, composer };
}

describe('forceExportCaptureFramebuffer', () => {
  it('shrinks composer RTs when logical layout matches but Ultra RT is larger (1080p trap)', () => {
    const { renderer, composer } = mockCaptureStack({
      bufferW: 1920,
      bufferH: 1080,
      rtW: 3840,
      rtH: 2160,
      dpr: 1,
    });

    const actual = forceExportCaptureFramebuffer(
      { renderer, composer },
      1920,
      1080,
    );

    assert.equal(actual.width, 1920);
    assert.equal(actual.height, 1080);
    assert.equal(composer.renderTarget1.width, 1920);
    assert.equal(composer.renderTarget1.height, 1080);
    assert.equal(composerRenderTargetsMatchPixels(composer, 1920, 1080), true);
  });

  it('ensureExportCapturePixelRatio forces DPR=1 when backing store already matches export', () => {
    const { renderer, composer } = mockCaptureStack({
      bufferW: 1920,
      bufferH: 1080,
      rtW: 1920,
      rtH: 1080,
      dpr: 2,
    });

    ensureExportCapturePixelRatio({ renderer, composer });

    assert.equal(renderer.getPixelRatio(), 1);
    assert.equal(composer.renderTarget1.width, 1920);
    assert.equal(composer.renderTarget1.height, 1080);
  });
});
