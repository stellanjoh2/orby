import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyPerLightHeightDelta,
  applyPerLightRotateDelta,
  clampLightHeight,
  wrapLightRotateDeg,
} from './lightViewportTransform.js';

test('wrapLightRotateDeg wraps into 0–360', () => {
  assert.equal(wrapLightRotateDeg(0), 0);
  assert.equal(wrapLightRotateDeg(360), 0);
  assert.equal(wrapLightRotateDeg(361), 1);
  assert.equal(wrapLightRotateDeg(-1), 359);
});

test('clampLightHeight clamps to shelf range', () => {
  assert.equal(clampLightHeight(-1), 0);
  assert.equal(clampLightHeight(5), 5);
  assert.equal(clampLightHeight(99), 10);
});

test('applyPerLightRotateDelta respects fine control scale', () => {
  assert.equal(applyPerLightRotateDelta(10, 20, { fine: false }), 30);
  assert.equal(applyPerLightRotateDelta(10, 20, { fine: true }), 15);
});

test('applyPerLightHeightDelta respects fine control scale', () => {
  assert.equal(applyPerLightHeightDelta(5, 2, { fine: false }), 7);
  assert.equal(applyPerLightHeightDelta(5, 2, { fine: true }), 5.5);
});
