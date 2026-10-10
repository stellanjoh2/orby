import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getGifExportResolutionSize,
  gifFrameDelayMs,
  gifskiQualityFromPreset,
  normalizeGifExportFps,
  normalizeGifExportResolution,
  normalizeVideoExportFormat,
} from './gifExportSettings.js';

test('normalizeVideoExportFormat', () => {
  assert.equal(normalizeVideoExportFormat('gif'), 'gif');
  assert.equal(normalizeVideoExportFormat('png'), 'png');
  assert.equal(normalizeVideoExportFormat('mp4'), 'mp4');
  assert.equal(normalizeVideoExportFormat('webm'), 'mp4');
});

test('GIF resolution allows up to 1080p', () => {
  assert.equal(normalizeGifExportResolution('480p'), '480p');
  assert.equal(normalizeGifExportResolution('720p'), '720p');
  assert.equal(normalizeGifExportResolution('1080p'), '1080p');
  assert.equal(normalizeGifExportResolution('1440p'), '1080p');
  assert.equal(normalizeGifExportResolution('2160p'), '1080p');
  assert.deepEqual(getGifExportResolutionSize('720p'), { width: 1280, height: 720 });
  assert.deepEqual(getGifExportResolutionSize('480p'), { width: 854, height: 480 });
  assert.deepEqual(getGifExportResolutionSize('1080p'), { width: 1920, height: 1080 });
});

test('GIF FPS clamps 60 → 30', () => {
  assert.equal(normalizeGifExportFps(24), 24);
  assert.equal(normalizeGifExportFps(30), 30);
  assert.equal(normalizeGifExportFps(60), 30);
});

test('gifski quality presets match Mozayk medium=90', () => {
  assert.equal(gifskiQualityFromPreset('low'), 70);
  assert.equal(gifskiQualityFromPreset('medium'), 90);
  assert.equal(gifskiQualityFromPreset('high'), 100);
  assert.equal(gifskiQualityFromPreset(undefined), 90);
});

test('gifFrameDelayMs', () => {
  assert.equal(gifFrameDelayMs(30), 33);
  assert.equal(gifFrameDelayMs(24), 42);
  assert.equal(gifFrameDelayMs(1), 1000);
});
