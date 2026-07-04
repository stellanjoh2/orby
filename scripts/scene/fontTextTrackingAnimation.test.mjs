import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  applyTrackingAnimatorToGlyphStates,
  buildLineRestYBaselines,
  computeAnimatedTrackingValue,
  computeLineHeightYOffset,
  computeScrubTrackingMotionElapsed,
  computeTrackingAnimatorAmountFromPercent,
  computeTypographyAlignLineShift,
  computeTypographyLineBoundsFromRest,
  MAX_FONT_TRACKING_ANIMATOR_START,
  MAX_FONT_TRACKING_VALUE,
  computeTrackingAnimatorProgress,
  trackingDeltaToWorldSpacing,
} from './fontTextTrackingAnimation.js';

test('100% Amount Start reaches animator max when master letter-spacing is 0', () => {
  const amount = computeTrackingAnimatorAmountFromPercent(0, 100);
  const target = computeAnimatedTrackingValue(0, amount, 0);
  assert.equal(amount, MAX_FONT_TRACKING_ANIMATOR_START);
  assert.equal(target, MAX_FONT_TRACKING_ANIMATOR_START);

  const amount50 = computeTrackingAnimatorAmountFromPercent(0, 50);
  const target50 = computeAnimatedTrackingValue(0, amount50, 0);
  assert.ok(
    target > target50,
    'higher Amount Start percent should produce wider spacing at t=0',
  );
});

test('Amount Start is independent of small master letter-spacing values', () => {
  const amountNearZero = computeTrackingAnimatorAmountFromPercent(5, 100);
  const amountZero = computeTrackingAnimatorAmountFromPercent(0, 100);
  assert.equal(amountNearZero, amountZero);
  assert.equal(amountZero, MAX_FONT_TRACKING_ANIMATOR_START);
});

test('Amount Start adds on top of master letter-spacing', () => {
  const amount = computeTrackingAnimatorAmountFromPercent(150, 100);
  const target = computeAnimatedTrackingValue(150, amount, 0);
  assert.equal(amount, MAX_FONT_TRACKING_ANIMATOR_START);
  assert.equal(target, 150 + MAX_FONT_TRACKING_ANIMATOR_START);
});

test('tracking motion at 0.4s is identical regardless of composite timeline length', () => {
  const trackingTime = 0.8;
  const motionAt040 = computeScrubTrackingMotionElapsed(0.4, trackingTime);

  assert.equal(motionAt040, 0.4);
  assert.equal(
    computeScrubTrackingMotionElapsed(0.4, trackingTime),
    computeScrubTrackingMotionElapsed(0.4, trackingTime),
  );
});

test('Amount Start amplitude at progress zero is independent of Tracking Time duration', () => {
  const master = 0;
  const amount = computeTrackingAnimatorAmountFromPercent(master, 100);

  for (const trackingTime of [0.1, 0.8, 1.5, 5]) {
    const progress = computeTrackingAnimatorProgress(0, trackingTime, 'quint.out');
    const target = computeAnimatedTrackingValue(master, amount, progress);
    assert.equal(progress, 0, `progress at t=0 should be 0 for ${trackingTime}s`);
    assert.equal(
      target,
      MAX_FONT_TRACKING_ANIMATOR_START,
      `Amount Start should stay ${MAX_FONT_TRACKING_ANIMATOR_START} for ${trackingTime}s`,
    );
  }
});

test('shortening Tracking Time must reset motion — stale motion cannot clamp to settled', () => {
  const master = 0;
  const amount = computeTrackingAnimatorAmountFromPercent(master, 100);
  const staleMotion = 3;
  const newTrackingTime = 0.8;

  const staleProgress = computeTrackingAnimatorProgress(staleMotion, newTrackingTime, 'quint.out');
  assert.equal(staleProgress, 1, 'stale motion without reset would look fully settled');

  const freshProgress = computeTrackingAnimatorProgress(0, newTrackingTime, 'quint.out');
  const freshTarget = computeAnimatedTrackingValue(master, amount, freshProgress);
  assert.equal(freshTarget, MAX_FONT_TRACKING_ANIMATOR_START);
});

test('Amount Start span is fixed at progress zero regardless of reveal timeline length', () => {
  const master = 0;
  const amount = computeTrackingAnimatorAmountFromPercent(master, 100);
  const trackingTime = 0.8;

  const motion = computeScrubTrackingMotionElapsed(0, trackingTime);
  const progress = computeTrackingAnimatorProgress(motion, trackingTime, 'quint.out');
  const target = computeAnimatedTrackingValue(master, amount, progress);

  assert.equal(motion, 0);
  assert.equal(target, MAX_FONT_TRACKING_ANIMATOR_START);

  const settledMotion = computeScrubTrackingMotionElapsed(2, trackingTime);
  assert.equal(settledMotion, trackingTime);
  const settled = computeAnimatedTrackingValue(
    master,
    amount,
    computeTrackingAnimatorProgress(settledMotion, trackingTime, 'quint.out'),
  );
  assert.equal(settled, 0);
});

test('tracking progress at t=0 is always zero regardless of duration', () => {
  assert.equal(computeTrackingAnimatorProgress(0, 0.1, 'quint.out'), 0);
  assert.equal(computeTrackingAnimatorProgress(0, 0.8, 'quint.out'), 0);
});

test('tracking delta converts to positive world spacing', () => {
  const amount = computeTrackingAnimatorAmountFromPercent(0, 100);
  const spacing = trackingDeltaToWorldSpacing(amount, 72);
  assert.ok(spacing > 0);
});

test('tracking offset is not damped by reveal progress at timeline start', () => {
  const makeGlyph = (x) => ({
    group: new THREE.Group(),
    restPosition: new THREE.Vector3(x, 0, 0),
  });
  const glyphStates = [makeGlyph(0), makeGlyph(1), makeGlyph(2), makeGlyph(3), makeGlyph(4)];
  glyphStates.forEach((state) => {
    state.group.position.copy(state.restPosition);
  });

  applyTrackingAnimatorToGlyphStates(glyphStates, {
    animatedTracking: MAX_FONT_TRACKING_ANIMATOR_START,
    generatedTracking: 0,
    bakedAlign: 'left',
    masterAlign: 'left',
    layoutFontSize: 72,
    lineIndices: [0, 0, 0, 0, 0],
    lineGlyphIndices: [0, 1, 2, 3, 4],
    lineGlyphCounts: [5],
  });

  assert.ok(glyphStates[4].group.position.x > glyphStates[0].group.position.x + 0.01);
});

test('align shift centers a shorter line within paragraph width', () => {
  const bounds = { minX: 0, maxX: 1, width: 1 };
  const shift = computeTypographyAlignLineShift(bounds, 2, 'center');
  assert.ok(Math.abs(shift - 0.5) < 1e-6);
});

test('right align shifts shorter lines to a shared paragraph edge', () => {
  const makeGlyph = (x, width = 1) => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 1, 0.1));
    mesh.position.x = x;
    group.add(mesh);
    return { group, restPosition: group.position.clone() };
  };
  const glyphStates = [
    makeGlyph(0, 2),
    makeGlyph(3, 1),
    makeGlyph(0, 1),
    makeGlyph(2, 1),
  ];
  glyphStates.forEach((state) => {
    state.group.position.copy(state.restPosition);
  });

  applyTrackingAnimatorToGlyphStates(glyphStates, {
    animatedTracking: 0,
    generatedTracking: 0,
    masterAlign: 'right',
    layoutFontSize: 72,
    lineIndices: [0, 0, 1, 1],
    lineGlyphIndices: [0, 1, 0, 1],
    lineGlyphCounts: [2, 2],
  });

  const { boundsByLine } = computeTypographyLineBoundsFromRest(
    glyphStates,
    [0, 0, 1, 1],
    [2, 2],
  );
  const line0 = boundsByLine.get(0);
  const line1 = boundsByLine.get(1);
  assert.ok(line0 && line1);
  assert.ok(Math.abs(line0.maxX - line1.maxX) < 1e-6, 'lines share a right edge');
});

test('line bounds from rest positions use glyph ink width not pivot points', () => {
  const makeGlyph = (x, width = 1) => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 1, 0.1));
    mesh.position.x = x;
    group.add(mesh);
    return { group, restPosition: group.position.clone() };
  };
  const glyphStates = [makeGlyph(0, 2), makeGlyph(3, 1), makeGlyph(0, 1)];
  const { boundsByLine, paragraphWidth } = computeTypographyLineBoundsFromRest(
    glyphStates,
    [0, 0, 1],
    [2, 1],
  );
  const line0 = boundsByLine.get(0);
  const line1 = boundsByLine.get(1);
  assert.ok(line0.width > 3.5);
  assert.ok(Math.abs(line1.width - 1) < 1e-6);
  assert.ok(paragraphWidth > 3.5);
});

test('live typography applies align-only offsets without re-extruding', () => {
  const makeGlyph = (x, width = 1) => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 1, 0.1));
    mesh.position.x = x;
    group.add(mesh);
    return {
      group,
      restPosition: group.position.clone(),
    };
  };
  const glyphStates = [makeGlyph(0, 1), makeGlyph(2, 1), makeGlyph(0, 1)];
  glyphStates.forEach((state) => {
    state.group.position.copy(state.restPosition);
  });

  applyTrackingAnimatorToGlyphStates(glyphStates, {
    animatedTracking: 0,
    generatedTracking: 0,
    bakedAlign: 'left',
    masterAlign: 'center',
    layoutFontSize: 72,
    lineIndices: [0, 0, 1],
    lineGlyphIndices: [0, 1, 0],
    lineGlyphCounts: [2, 1],
  });

  assert.ok(Math.abs(glyphStates[2].group.position.x - 1.5) < 1e-6);
});

test('line height offset scales spacing from first line anchor', () => {
  const baselines = new Map([
    [0, 0],
    [1, -2],
    [2, -4],
  ]);
  assert.equal(computeLineHeightYOffset(0, baselines, 1, 2), 0);
  assert.ok(Math.abs(computeLineHeightYOffset(1, baselines, 1, 2) - -2) < 1e-6);
  assert.ok(Math.abs(computeLineHeightYOffset(2, baselines, 1, 2) - -4) < 1e-6);
});

test('live typography applies line-height offsets without re-extruding', () => {
  const makeGlyph = (x, y, lineIndex) => ({
    group: new THREE.Group(),
    restPosition: new THREE.Vector3(x, y, 0),
    lineIndex,
  });
  const glyphStates = [
    makeGlyph(0, 0, 0),
    makeGlyph(1, 0, 0),
    makeGlyph(0, -2, 1),
    makeGlyph(1, -2, 1),
  ];
  glyphStates.forEach((state) => {
    state.group.position.copy(state.restPosition);
  });
  const lineIndices = [0, 0, 1, 1];
  const lineRestYBaselines = buildLineRestYBaselines(glyphStates, lineIndices);

  applyTrackingAnimatorToGlyphStates(glyphStates, {
    animatedTracking: 0,
    generatedTracking: 0,
    bakedAlign: 'left',
    masterAlign: 'left',
    layoutFontSize: 72,
    lineIndices,
    lineGlyphIndices: [0, 1, 0, 1],
    lineGlyphCounts: [2, 2],
    bakedLineHeight: 1,
    masterLineHeight: 2,
    lineRestYBaselines,
  });

  assert.equal(glyphStates[0].group.position.y, 0);
  assert.equal(glyphStates[1].group.position.y, 0);
  assert.ok(Math.abs(glyphStates[2].group.position.y - -4) < 1e-6);
  assert.ok(Math.abs(glyphStates[3].group.position.y - -4) < 1e-6);
});

test('resetting letter-spacing to baked value clears stale live offsets', () => {
  const makeGlyph = (x) => ({
    group: new THREE.Group(),
    restPosition: new THREE.Vector3(x, 0, 0),
    lastTypographyX: 0,
    lastTypographyY: 0,
  });
  const glyphStates = [makeGlyph(0), makeGlyph(1.2)];
  const spacingStep = trackingDeltaToWorldSpacing(500, 72);
  glyphStates.forEach((state) => {
    state.group.position.copy(state.restPosition);
  });

  applyTrackingAnimatorToGlyphStates(glyphStates, {
    animatedTracking: 500,
    generatedTracking: 0,
    bakedAlign: 'left',
    masterAlign: 'left',
    layoutFontSize: 72,
    lineIndices: [0, 0],
    lineGlyphIndices: [0, 1],
    lineGlyphCounts: [2],
  });

  assert.ok(Math.abs(glyphStates[1].group.position.x - (1.2 + spacingStep)) < 1e-6);

  applyTrackingAnimatorToGlyphStates(glyphStates, {
    animatedTracking: 0,
    generatedTracking: 0,
    bakedAlign: 'left',
    masterAlign: 'left',
    layoutFontSize: 72,
    lineIndices: [0, 0],
    lineGlyphIndices: [0, 1],
    lineGlyphCounts: [2],
  });

  assert.ok(Math.abs(glyphStates[1].group.position.x - 1.2) < 1e-6);
  assert.equal(glyphStates[1].lastTypographyX, 0);
});

test('re-bind must strip typography before measuring rest or spacing doubles', () => {
  const makeGlyph = (x) => ({
    group: new THREE.Group(),
    restPosition: new THREE.Vector3(x, 0, 0),
    lastTypographyX: 0,
    lastTypographyY: 0,
  });
  const glyphStates = [makeGlyph(0), makeGlyph(1.2)];
  glyphStates.forEach((state) => {
    state.group.position.copy(state.restPosition);
  });
  const spacingStep = trackingDeltaToWorldSpacing(200, 72);
  const trackingOptions = {
    animatedTracking: 200,
    generatedTracking: 0,
    bakedAlign: 'left',
    masterAlign: 'left',
    layoutFontSize: 72,
    lineIndices: [0, 0],
    lineGlyphIndices: [0, 1],
    lineGlyphCounts: [2],
  };

  applyTrackingAnimatorToGlyphStates(glyphStates, trackingOptions);
  const expectedSecondX = 1.2 + spacingStep;
  assert.ok(Math.abs(glyphStates[1].group.position.x - expectedSecondX) < 1e-6);

  const pollutedStates = glyphStates.map((state) => ({
    group: state.group,
    restPosition: state.group.position.clone(),
    lastTypographyX: 0,
    lastTypographyY: 0,
  }));
  applyTrackingAnimatorToGlyphStates(pollutedStates, trackingOptions);
  assert.ok(pollutedStates[1].group.position.x > expectedSecondX + spacingStep * 0.5);

  glyphStates[1].group.position.x = 1.2;
  glyphStates[0].group.position.x = 0;
  glyphStates[0].lastTypographyX = 0;
  glyphStates[1].lastTypographyX = 0;
  const cleanStates = glyphStates.map((state) => ({
    group: state.group,
    restPosition: state.group.position.clone(),
    lastTypographyX: 0,
    lastTypographyY: 0,
  }));
  applyTrackingAnimatorToGlyphStates(cleanStates, trackingOptions);
  assert.ok(Math.abs(cleanStates[1].group.position.x - expectedSecondX) < 1e-6);
});
