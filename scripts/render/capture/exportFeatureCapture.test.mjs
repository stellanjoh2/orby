/**
 * Feature capture helpers — paper key, post-pipeline pins at 2×.
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SKETCH_PAPER_RGB } from '../creativeLookSketchArt.js';
import { keyArtisticPaperBackdropToAlpha } from './keyArtisticPaperBackdrop.js';
import {
  pinAsciiReferenceForCapture,
  pinLensDistortionForExportCapture,
  unpinAsciiReferenceForCapture,
  unpinLensDistortionForExportCapture,
} from './capturePostPipelinePins.js';
import {
  getComposerOutputRenderTarget,
  resolvePostStackOverlayRenderTarget,
} from '../composerOutputBuffer.js';
import {
  compositeAsciiGroundGridOnByteTarget,
  resolveCaptureGridLineWidthPx,
  shouldCompositeGroundGridForCapture,
} from './capturePostStackOverlays.js';

describe('artistic paper backdrop keying', () => {
  it('keys exact paper rgb to transparent', () => {
    const pr = SKETCH_PAPER_RGB.map((v) => Math.round(v * 255));
    const pixels = new Uint8Array([
      pr[0], pr[1], pr[2], 255,
      40, 80, 120, 255,
    ]);
    keyArtisticPaperBackdropToAlpha(pixels, 2, 1);
    assert.equal(pixels[3], 0);
    assert.equal(pixels[4], 40);
    assert.equal(pixels[7], 255);
  });

  it('soft-feathers near-paper pixels', () => {
    const pr = SKETCH_PAPER_RGB.map((v) => Math.round(v * 255));
    const offset = 17;
    const pixels = new Uint8Array([
      pr[0] - offset,
      pr[1] - offset,
      pr[2] - offset,
      255,
    ]);
    keyArtisticPaperBackdropToAlpha(pixels, 1, 1);
    assert.ok(pixels[3] > 0 && pixels[3] < 255, `expected partial alpha, got ${pixels[3]}`);
  });
});

describe('ground grid capture composite', () => {
  it('resolveCaptureGridLineWidthPx scales with export size', () => {
    assert.equal(resolveCaptureGridLineWidthPx(1, 1), 1);
    assert.equal(resolveCaptureGridLineWidthPx(2, 1), 2);
    assert.equal(resolveCaptureGridLineWidthPx(2, 2), 4);
    assert.equal(resolveCaptureGridLineWidthPx(2.5, 2), 5);
    assert.equal(resolveCaptureGridLineWidthPx(0.25, 1), 0.5);
  });

  it('requires visible grid regardless of post preset', () => {
    assert.equal(
      shouldCompositeGroundGridForCapture({
        getGroundGrid: () => ({ visible: true }),
      }),
      true,
    );
    assert.equal(
      shouldCompositeGroundGridForCapture({
        getGroundGrid: () => ({ visible: false }),
      }),
      false,
    );
    assert.equal(
      shouldCompositeGroundGridForCapture({
        getGroundGrid: () => null,
      }),
      false,
    );
  });
});

describe('post-stack overlay render targets', () => {
  it('live loop composites grid onto the default framebuffer', () => {
    assert.equal(resolvePostStackOverlayRenderTarget({ renderToScreen: true }), null);
    assert.equal(resolvePostStackOverlayRenderTarget(null), null);
  });

  it('offline capture composites grid onto composer readBuffer', () => {
    const readBuffer = { width: 3840, height: 2160 };
    assert.equal(
      resolvePostStackOverlayRenderTarget({ renderToScreen: false, readBuffer }),
      readBuffer,
    );
  });

  it('getComposerOutputRenderTarget prefers writeBuffer when last pass does not swap', () => {
    const readBuffer = { id: 'read' };
    const writeBuffer = { id: 'write' };
    const composer = {
      readBuffer,
      writeBuffer,
      passes: [
        { enabled: false, needsSwap: true },
        { enabled: true, needsSwap: false },
      ],
    };
    assert.equal(getComposerOutputRenderTarget(composer), writeBuffer);
  });

  it('getComposerOutputRenderTarget uses readBuffer when last pass swaps', () => {
    const readBuffer = { id: 'read' };
    const writeBuffer = { id: 'write' };
    const composer = {
      readBuffer,
      writeBuffer,
      passes: [{ enabled: true, needsSwap: true }],
    };
    assert.equal(getComposerOutputRenderTarget(composer), readBuffer);
  });
});

describe('post-pipeline pins for 2× export', () => {
  it('ASCII reference pin keeps viewport logical size during export resize', () => {
    const ascii = {
      pinned: null,
      pinReferenceLogicalSize(w, h) {
        this.pinned = { w, h };
      },
      unpinReferenceLogicalSize() {
        this.pinned = null;
      },
    };
    const postPipeline = { creativeLookAscii: ascii };
    pinAsciiReferenceForCapture(postPipeline, { x: 1280, y: 720 });
    assert.deepEqual(ascii.pinned, { w: 1280, h: 720 });
    unpinAsciiReferenceForCapture(postPipeline);
    assert.equal(ascii.pinned, null);
  });

  it('lens distortion pin targets composer RT chain', () => {
    const pass = { enabled: true, renderToScreen: true };
    const snapshot = pinLensDistortionForExportCapture({ lensDistortionPass: pass });
    assert.equal(pass.renderToScreen, false);
    assert.deepEqual(snapshot, { lensRenderToScreen: true });
    unpinLensDistortionForExportCapture({ lensDistortionPass: pass }, snapshot);
    assert.equal(pass.renderToScreen, true);
  });

  it('lens pin is no-op when pass disabled', () => {
    const pass = { enabled: false, renderToScreen: true };
    const snapshot = pinLensDistortionForExportCapture({ lensDistortionPass: pass });
    assert.equal(snapshot, null);
    assert.equal(pass.renderToScreen, true);
  });
});
