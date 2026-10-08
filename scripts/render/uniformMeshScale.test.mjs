import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  axisScaleRatioFromPointer,
  clampMeshScaleComponents,
  clampMeshScaleValue,
  MAX_MESH_SCALE,
  MIN_MESH_SCALE,
  MIN_SCALE_POINTER_LENGTH,
  scaleAxesToUniformTarget,
  uniformMeshScale,
  uniformScaleRatioFromPointer,
} from './TransformController.js';

test('uniformMeshScale returns the shared value when axes match', () => {
  assert.equal(uniformMeshScale(1, 1, 1), 1);
  assert.equal(uniformMeshScale(2.5, 2.5, 2.5), 2.5);
});

test('uniformMeshScale uses the geometric mean when axes differ', () => {
  const mean = uniformMeshScale(2, 4, 2);
  assert.ok(Math.abs(mean - Math.cbrt(16)) < 1e-9);
});

test('scaleAxesToUniformTarget sets every axis when they already match', () => {
  assert.deepEqual(scaleAxesToUniformTarget(1, 1, 1, 2), { x: 2, y: 2, z: 2 });
});

test('scaleAxesToUniformTarget keeps a gizmo squash while changing overall size', () => {
  const next = scaleAxesToUniformTarget(2, 4, 2, uniformMeshScale(2, 4, 2) * 2);
  assert.ok(Math.abs(next.x - 4) < 1e-9);
  assert.ok(Math.abs(next.y - 8) < 1e-9);
  assert.ok(Math.abs(next.z - 4) < 1e-9);
  assert.ok(Math.abs(uniformMeshScale(next.x, next.y, next.z) - Math.cbrt(16) * 2) < 1e-9);
});

test('clampMeshScaleValue rejects negatives, zero, and runaway values', () => {
  assert.equal(clampMeshScaleValue(-4), 4);
  assert.equal(clampMeshScaleValue(0), MIN_MESH_SCALE);
  assert.equal(clampMeshScaleValue(1e9), MAX_MESH_SCALE);
  assert.equal(clampMeshScaleValue(0.5), 0.5);
});

test('clampMeshScaleComponents floors and caps each axis', () => {
  const scale = { x: -2, y: 0, z: 1e6 };
  clampMeshScaleComponents(scale);
  assert.equal(scale.x, 2);
  assert.equal(scale.y, MIN_MESH_SCALE);
  assert.equal(scale.z, MAX_MESH_SCALE);
});

test('uniformScaleRatioFromPointer rejects near-zero start lengths', () => {
  assert.equal(uniformScaleRatioFromPointer(1, MIN_SCALE_POINTER_LENGTH * 0.5), null);
  assert.equal(uniformScaleRatioFromPointer(2, 1), 2);
});

test('axisScaleRatioFromPointer stays stable for tiny divisors and past-pivot samples', () => {
  assert.equal(axisScaleRatioFromPointer(1, MIN_SCALE_POINTER_LENGTH * 0.25), 1);
  assert.equal(axisScaleRatioFromPointer(2, 1), 2);
  assert.equal(axisScaleRatioFromPointer(-1, 1), 0);
});
