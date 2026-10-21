import test from 'node:test';
import assert from 'node:assert/strict';
import {
  proresProfileFromSettings,
  proresProfileLabel,
  videoExportSupportsAlpha,
} from './proresExportSettings.js';

test('videoExportSupportsAlpha', () => {
  assert.equal(videoExportSupportsAlpha('png'), true);
  assert.equal(videoExportSupportsAlpha('gif'), true);
  assert.equal(videoExportSupportsAlpha('mov'), true);
  assert.equal(videoExportSupportsAlpha('mp4'), false);
});

test('proresProfileFromSettings opaque', () => {
  assert.equal(proresProfileFromSettings({ qualityPreset: 'low' }), 1);
  assert.equal(proresProfileFromSettings({ qualityPreset: 'medium' }), 2);
  assert.equal(proresProfileFromSettings({ qualityPreset: 'high' }), 3);
  assert.equal(proresProfileFromSettings({}), 2);
});

test('proresProfileFromSettings transparent', () => {
  assert.equal(
    proresProfileFromSettings({ transparent: true, qualityPreset: 'low' }),
    4,
  );
  assert.equal(
    proresProfileFromSettings({ transparent: true, qualityPreset: 'medium' }),
    4,
  );
  assert.equal(
    proresProfileFromSettings({ transparent: true, qualityPreset: 'high' }),
    5,
  );
});

test('proresProfileLabel', () => {
  assert.equal(proresProfileLabel(3), 'ProRes 422 HQ');
  assert.equal(proresProfileLabel(4), 'ProRes 4444');
  assert.equal(proresProfileLabel(5), 'ProRes 4444 XQ');
});
