import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSupportedVideoRecorderFormat,
  videoRecorderExtensionForMime,
} from './videoRecorderFormat.js';

test('resolveSupportedVideoRecorderFormat prefers MP4 when available', () => {
  const format = resolveSupportedVideoRecorderFormat((mimeType) =>
    mimeType.startsWith('video/mp4'),
  );
  assert.equal(format?.extension, 'mp4');
  assert.match(format?.mimeType ?? '', /^video\/mp4/);
});

test('resolveSupportedVideoRecorderFormat falls back to WebM', () => {
  const format = resolveSupportedVideoRecorderFormat((mimeType) =>
    mimeType.startsWith('video/webm'),
  );
  assert.equal(format?.extension, 'webm');
  assert.match(format?.mimeType ?? '', /^video\/webm/);
});

test('videoRecorderExtensionForMime maps webm mime types', () => {
  assert.equal(videoRecorderExtensionForMime('video/webm;codecs=vp9'), 'webm');
  assert.equal(videoRecorderExtensionForMime('video/mp4;codecs=avc1'), 'mp4');
});
