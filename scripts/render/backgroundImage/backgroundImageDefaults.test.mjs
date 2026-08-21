import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKGROUND_IMAGE_BLUR_MAX_RADIUS_FRACTION,
  backgroundImageBlurRadiusPx,
  clampBackgroundImageBlur,
  DEFAULT_BACKGROUND_IMAGE,
  normalizeBackgroundImage,
} from './backgroundImageDefaults.js';
import { toTextureFriendlyImageSource } from './backgroundImageCanvas.js';

const here = dirname(fileURLToPath(import.meta.url));

test('normalizeBackgroundImage defaults blur to 0 and clamps 0–1', () => {
  assert.equal(normalizeBackgroundImage({}).blur, 0);
  assert.equal(DEFAULT_BACKGROUND_IMAGE.blur, 0);
  assert.equal(normalizeBackgroundImage({ blur: 0.25 }).blur, 0.25);
  assert.equal(normalizeBackgroundImage({ blur: 2 }).blur, 1);
  assert.equal(normalizeBackgroundImage({ blur: -1 }).blur, 0);
  assert.equal(normalizeBackgroundImage({ blur: 'nope' }).blur, 0);
  assert.equal(clampBackgroundImageBlur(0.4), 0.4);
});

test('normalizeBackgroundImage keeps fit and blur independently', () => {
  const next = normalizeBackgroundImage({
    enabled: true,
    fit: 'contain',
    blur: 0.5,
    asset: { name: 'a.jpg', type: 'image/jpeg', dataBase64: 'abc' },
  });
  assert.equal(next.fit, 'contain');
  assert.equal(next.blur, 0.5);
  assert.equal(next.asset?.name, 'a.jpg');
});

test('backgroundImageBlurRadiusPx scales with longest edge', () => {
  assert.equal(backgroundImageBlurRadiusPx(0, 2048, 1024), 0);
  assert.equal(
    backgroundImageBlurRadiusPx(1, 2048, 1024),
    2048 * BACKGROUND_IMAGE_BLUR_MAX_RADIUS_FRACTION,
  );
  assert.equal(
    backgroundImageBlurRadiusPx(0.5, 100, 400),
    0.5 * 400 * BACKGROUND_IMAGE_BLUR_MAX_RADIUS_FRACTION,
  );
});

test('toTextureFriendlyImageSource is a no-op for non-ImageBitmap sources', () => {
  assert.equal(toTextureFriendlyImageSource(null), null);
  const canvasLike = { width: 8, height: 8 };
  assert.equal(toTextureFriendlyImageSource(canvasLike), canvasLike);
});

test('background image textures always use flipY for WebGL upload', () => {
  const controllerSrc = readFileSync(join(here, 'BackgroundImageController.js'), 'utf8');
  assert.match(controllerSrc, /texture\.flipY = true/);
  assert.match(controllerSrc, /toTextureFriendlyImageSource/);
  assert.doesNotMatch(controllerSrc, /this\._source instanceof ImageBitmap/);

  const canvasSrc = readFileSync(join(here, 'backgroundImageCanvas.js'), 'utf8');
  assert.match(canvasSrc, /return toTextureFriendlyImageSource\(bitmap\)/);
});
