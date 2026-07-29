import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SHADOW_CAMERA_ORTHO_PADDING_BY_QUALITY,
  meshFocusedStudioFloorShadowReach,
} from './shadowQuality.js';

test('meshFocusedStudioFloorShadowReach caps huge cove AABB to mesh footprint', () => {
  const meshRadius = 1.5;
  const pad = SHADOW_CAMERA_ORTHO_PADDING_BY_QUALITY.medium;
  const expected = meshRadius * pad + 0.35;
  const capped = meshFocusedStudioFloorShadowReach(meshRadius, 'medium', 40);
  assert.equal(capped, expected);
  assert.ok(capped < 10, 'must not keep full cove wall-corner reach');
});

test('meshFocusedStudioFloorShadowReach keeps tiny receive surfaces', () => {
  const tiny = meshFocusedStudioFloorShadowReach(2, 'medium', 1.2);
  assert.equal(tiny, 1.2);
});

test('meshFocusedStudioFloorShadowReach ignores empty full reach', () => {
  assert.equal(meshFocusedStudioFloorShadowReach(2, 'medium', 0), 0);
  assert.equal(meshFocusedStudioFloorShadowReach(2, 'medium', NaN), 0);
});
