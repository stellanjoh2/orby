import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCreativeLookSketchParams,
  SKETCH_STROKE_WIDTH_DEFAULT,
  SKETCH_RASTER_SIZE_DEFAULT,
} from './creativeLookSketchArt.js';

test('resolveCreativeLookSketchParams treats both-zero as unset', () => {
  const params = resolveCreativeLookSketchParams(
    { sketch: { strokeWidth: 0, rasterSize: 0 } },
    0.6,
  );
  assert.equal(params.strokeWidth, 0.6);
  assert.equal(params.rasterSize, 0.6);
  assert.ok(params.rasterSize > 0);
});

test('resolveCreativeLookSketchParams keeps raster off when stroke is set', () => {
  const params = resolveCreativeLookSketchParams(
    { sketch: { strokeWidth: 0.8, rasterSize: 0 } },
    0.6,
  );
  assert.equal(params.strokeWidth, 0.8);
  assert.equal(params.rasterSize, 0);
});

test('resolveCreativeLookSketchParams falls back when sketch params missing', () => {
  const params = resolveCreativeLookSketchParams({}, 1.2);
  assert.equal(params.strokeWidth, 1.2);
  assert.equal(params.rasterSize, 1.2);
});

test('resolveCreativeLookSketchParams uses defaults when fallback is invalid', () => {
  const params = resolveCreativeLookSketchParams({ sketch: {} }, NaN);
  assert.equal(params.strokeWidth, SKETCH_STROKE_WIDTH_DEFAULT);
  assert.equal(params.rasterSize, SKETCH_RASTER_SIZE_DEFAULT);
});
