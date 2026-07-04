import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { applyConstantOffsetToGlyph } from './fontTextConstantTypes.js';

function makeGlyphState() {
  const group = new THREE.Group();
  group.position.set(1, 2, 0.5);
  group.scale.set(2, 2, 2);
  return {
    group,
    restPosition: new THREE.Vector3(1, 2, 0.5),
    restRotationX: 0,
    restRotationY: 0,
    restRotationZ: 0,
    restScale: new THREE.Vector3(2, 2, 2),
    slideDistance: 0.2,
    meshMaterials: [],
    lastTypographyX: 0,
    lastTypographyY: 0,
  };
}

test('breathe with line pivot composes on reveal scale instead of resetting to rest', () => {
  const state = makeGlyphState();
  // Simulate mid-reveal scale pose (50% of rest).
  state.group.scale.set(1, 1, 1);
  const revealScale = state.group.scale.x;

  const linePivot = { center: new THREE.Vector3(0, 0, 0), slideDistance: 0.2 };
  applyConstantOffsetToGlyph(state, 0, 1, 0, {
    type: 'breathe',
    intensity: 0.5,
    speedSec: 2,
    spread: 1,
    lineGlyphIndex: 0,
    lineGlyphCount: 3,
    linePivot,
    useLinePivotMotion: true,
  });

  const scaleMul = 1 + 0.08 * 0.5 * Math.sin(0);
  assert.ok(
    Math.abs(state.group.scale.x - revealScale * scaleMul) < 1e-6,
    'breathe should multiply reveal scale, not snap back to restScale',
  );
});

test('float with line pivot composes on reveal position instead of resetting to rest', () => {
  const state = makeGlyphState();
  // Simulate mid-reveal vertical offset.
  state.group.position.y = 1.4;
  const revealY = state.group.position.y;
  const restY = state.restPosition.y;

  const linePivot = { center: new THREE.Vector3(0, 0, 0), slideDistance: 0.2 };
  applyConstantOffsetToGlyph(state, 0, 1, 0, {
    type: 'float',
    intensity: 1,
    speedSec: 2,
    spread: 1,
    lineGlyphIndex: 0,
    lineGlyphCount: 3,
    linePivot,
    useLinePivotMotion: true,
  });

  assert.ok(
    Math.abs(state.group.position.y - revealY) < Math.abs(state.group.position.y - restY),
    'float should stay anchored to reveal position, not snap back to restPosition',
  );
});
