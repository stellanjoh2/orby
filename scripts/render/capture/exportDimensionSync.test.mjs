/**
 * Dimension switch spot checks — pure size / tier math (no WebGL).
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clampCapturePixelArea,
  clampCapturePixelSize,
  resolveCaptureSize,
  resolvePngExportCaptureSize,
  resolveVideoExportCaptureSize,
} from './CaptureSizePolicy.js';
import {
  getExportVideoResolutionSize,
  normalizeExportVideoAspectRatio,
  normalizeExportVideoResolution,
} from '../exportVideoResolution.js';
import {
  resolveBloomQualityTier,
  resolveRenderQualityTier,
} from '../../constants.js';

/** Mirrors SceneManager.syncPostProcessingForLogicalSize bloom RT sizing. */
function resolveExportBloomPixelSize(logicalW, logicalH, renderQuality, bloomQualityId) {
  const tier = resolveRenderQualityTier(renderQuality);
  const bloomQuality = resolveBloomQualityTier(bloomQualityId);
  const bloomScale = tier.bloomResolutionScale * bloomQuality.resolutionScale;
  return {
    width: Math.max(1, Math.floor(logicalW * bloomScale)),
    height: Math.max(1, Math.floor(logicalH * bloomScale)),
    bloomOff: tier.forceBloomOff,
  };
}

function mockRenderer({ logicalW = 1280, logicalH = 720, dpr = 1, maxTex = 16384 } = {}) {
  return {
    getPixelRatio: () => dpr,
    getSize: (target) => {
      target.set(logicalW, logicalH);
    },
    getDrawingBufferSize: (target) => {
      target.set(Math.round(logicalW * dpr), Math.round(logicalH * dpr));
    },
    getContext: () => ({
      MAX_TEXTURE_SIZE: 0x0d33,
      MAX_RENDERBUFFER_SIZE: 0x8d41,
      getParameter: () => maxTex,
    }),
  };
}

describe('export video resolution switches', () => {
  it('1080p / 1440p / 4K landscape sizes', () => {
    assert.deepEqual(getExportVideoResolutionSize('1080p'), { width: 1920, height: 1080 });
    assert.deepEqual(getExportVideoResolutionSize('1440p'), { width: 2560, height: 1440 });
    assert.deepEqual(getExportVideoResolutionSize('2160p'), { width: 3840, height: 2160 });
  });

  it('normalizes unknown resolution to 1080p', () => {
    assert.equal(normalizeExportVideoResolution('720p'), '1080p');
    assert.equal(normalizeExportVideoResolution('2160p'), '2160p');
  });

  it('9:16 aspect UI is forced to 16:9 (portrait export disabled)', () => {
    assert.equal(normalizeExportVideoAspectRatio('9:16'), '16:9');
    assert.deepEqual(getExportVideoResolutionSize('1080p', '9:16'), {
      width: 1920,
      height: 1080,
    });
  });

  it('resolveCaptureSize(video) matches preset table', () => {
    for (const res of ['1080p', '1440p', '2160p']) {
      const viaPolicy = resolveVideoExportCaptureSize(res);
      const viaEntry = resolveCaptureSize({ mode: 'video', resolution: res });
      assert.deepEqual(viaPolicy, viaEntry);
      assert.equal(viaEntry.cameraAspect, viaEntry.width / viaEntry.height);
    }
  });
});

describe('PNG scale switches', () => {
  it('1× and 2× scale preview backing store', () => {
    const renderer = mockRenderer({ logicalW: 1600, logicalH: 900, dpr: 2 });
    const oneX = resolvePngExportCaptureSize(renderer, 1);
    const twoX = resolvePngExportCaptureSize(renderer, 2);
    assert.equal(oneX.width, 3200);
    assert.equal(oneX.height, 1800);
    assert.equal(twoX.width, 6400);
    assert.equal(twoX.height, 3600);
    assert.equal(twoX.width / oneX.width, 2);
  });

  it('switching 1× → 2× preserves aspect', () => {
    const renderer = mockRenderer({ logicalW: 1440, logicalH: 810, dpr: 1 });
    const oneX = resolvePngExportCaptureSize(renderer, 1);
    const twoX = resolvePngExportCaptureSize(renderer, 2);
    assert.equal(oneX.cameraAspect, twoX.cameraAspect);
  });
});

describe('render quality tier × export bloom RT', () => {
  const logicalW = 1920;
  const logicalH = 1080;

  it('Max tier full bloom resolution at 1080p export', () => {
    const bloom = resolveExportBloomPixelSize(logicalW, logicalH, 'max', 'medium');
    assert.equal(bloom.bloomOff, false);
    assert.equal(bloom.width, 1440);
    assert.equal(bloom.height, 810);
  });

  it('Medium tier half bloom resolution', () => {
    const bloom = resolveExportBloomPixelSize(logicalW, logicalH, 'medium', 'medium');
    assert.equal(bloom.width, 720);
    assert.equal(bloom.height, 405);
  });

  it('Low tier disables bloom pass', () => {
    const bloom = resolveExportBloomPixelSize(logicalW, logicalH, 'low', 'medium');
    assert.equal(bloom.bloomOff, true);
  });

  it('tier switch sequence preserves monotonic bloom scale (max ≥ medium)', () => {
    const max = resolveExportBloomPixelSize(logicalW, logicalH, 'max', 'medium');
    const medium = resolveExportBloomPixelSize(logicalW, logicalH, 'medium', 'medium');
    assert.ok(max.width >= medium.width);
    assert.ok(max.height >= medium.height);
  });
});

describe('pixel budget clamp', () => {
  it('area clamp preserves aspect', () => {
    const { width, height } = clampCapturePixelArea(8000, 4500, 16_000_000);
    assert.ok(width * height <= 16_000_000);
    const aspectBefore = 8000 / 4500;
    const aspectAfter = width / height;
    assert.ok(Math.abs(aspectBefore - aspectAfter) < 0.002);
  });

  it('GPU max dimension clamp via mock renderer', () => {
    const renderer = mockRenderer({ maxTex: 4096 });
    const { width, height } = clampCapturePixelSize(8000, 4500, renderer);
    assert.ok(width <= 4096);
    assert.ok(height <= 4096);
  });
});
