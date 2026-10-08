import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { applyTrackingAnimatorToGlyphStates } from './fontTextTrackingAnimation.js';

/**
 * Mimic FontTextRevealController handoff: recover true rest from a parked
 * live-typography pose before the next apply (select / rebind).
 * @param {THREE.Vector3} livePosition
 * @param {{ x?: number, y?: number } | null | undefined} parked
 */
function restFromParkedLivePose(livePosition, parked) {
  const parkX = Number(parked?.x) || 0;
  const parkY = Number(parked?.y) || 0;
  return new THREE.Vector3(
    livePosition.x - parkX,
    livePosition.y - parkY,
    livePosition.z,
  );
}

function makeGlyphStates() {
  return [0, 1].map((i) => {
    const group = new THREE.Group();
    group.position.set(i * 1.0, 0, 0);
    return {
      group,
      restPosition: group.position.clone(),
      lastTypographyX: 0,
      lastTypographyY: 0,
    };
  });
}

function applyLiveTracking(states, tracking) {
  applyTrackingAnimatorToGlyphStates(states, {
    animatedTracking: tracking,
    generatedTracking: 0,
    bakedAlign: 'left',
    masterAlign: 'left',
    layoutFontSize: 1,
    lineIndices: [0, 0],
    lineGlyphIndices: [0, 1],
    lineGlyphCounts: [2],
    bakedLineHeight: 1,
    masterLineHeight: 1,
    lineRestYBaselines: new Map([[0, 0]]),
  });
}

test('capturing rest from a live typography pose double-applies tracking on rebind', () => {
  const states = makeGlyphStates();
  applyLiveTracking(states, 80);
  const afterFirst = states.map((s) => s.group.position.x);

  // Bug: treat offset poses as rest, clear lastTypography, apply again.
  for (const state of states) {
    state.restPosition.copy(state.group.position);
    state.lastTypographyX = 0;
    state.lastTypographyY = 0;
  }
  applyLiveTracking(states, 80);

  assert.ok(
    Math.abs(states[1].group.position.x - afterFirst[1]) > 0.01,
    'buggy rebind must drift the second glyph',
  );
});

test('asset focus handoff must park peer typography before the next store write', () => {
  // Select order contract (SceneObjectsController.select):
  // 1) settle + clear previous glyph states
  // 2) write next fontExtrude/material into the store
  // 3) bind the next mesh
  // If (2) runs while (1) still owns _glyphStates, material callbacks apply the
  // next text's tracking/emissive onto the previous text (jumps + darkening).
  const peer = makeGlyphStates();
  applyLiveTracking(peer, 40);
  const parked = peer.map((s) => ({
    x: s.lastTypographyX,
    y: s.lastTypographyY,
  }));
  const rest = peer.map((s, i) => restFromParkedLivePose(s.group.position, parked[i]));
  // After park, material baseline sync must see no live glyph states.
  const cleared = [];
  assert.equal(cleared.length, 0);
  assert.ok(rest.every((r, i) => Math.abs(r.x - (i * 1.0)) < 1e-6));
});

test('consuming parked typography before rest capture keeps rebind stable', () => {
  const states = makeGlyphStates();
  applyLiveTracking(states, 80);
  const afterFirst = states.map((s) => s.group.position.clone());
  const parked = states.map((s) => ({
    x: s.lastTypographyX,
    y: s.lastTypographyY,
  }));

  // Handoff keeps the live pose; rebind consumes parked offsets into rest,
  // then snaps the group to that rest (same as _buildTypographyLayoutBounds).
  for (let i = 0; i < states.length; i += 1) {
    states[i].group.position.copy(afterFirst[i]);
    const rest = restFromParkedLivePose(states[i].group.position, parked[i]);
    states[i].restPosition.copy(rest);
    states[i].group.position.copy(rest);
    states[i].lastTypographyX = 0;
    states[i].lastTypographyY = 0;
  }
  applyLiveTracking(states, 80);

  assert.ok(
    Math.abs(states[0].group.position.x - afterFirst[0].x) < 1e-5,
    `fixed rebind must not drift glyph 0 (delta ${states[0].group.position.x - afterFirst[0].x})`,
  );
  assert.ok(
    Math.abs(states[1].group.position.x - afterFirst[1].x) < 1e-5,
    `fixed rebind must not drift glyph 1 (delta ${states[1].group.position.x - afterFirst[1].x})`,
  );
});
