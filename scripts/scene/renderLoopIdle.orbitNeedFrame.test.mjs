import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  orbitControlsHaveDampingDeltas,
  orbitControlsNeedFrame,
} from './renderLoopIdle.js';

function mockControls({ state = -1, theta = 0, phi = 0, radius = 0, panLenSq = 0 } = {}) {
  return {
    enabled: true,
    state,
    sphericalDelta: { theta, phi, radius },
    panOffset: { lengthSq: () => panLenSq },
  };
}

describe('orbitControlsHaveDampingDeltas vs orbitControlsNeedFrame', () => {
  it('treats pointer-down alone as needing a frame but not as damping remainder', () => {
    const controls = mockControls({ state: 0 });
    assert.equal(orbitControlsNeedFrame(controls), true);
    assert.equal(orbitControlsHaveDampingDeltas(controls), false);
  });

  it('detects residual spherical damping without pointer state', () => {
    const controls = mockControls({ state: -1, theta: 1e-5 });
    assert.equal(orbitControlsHaveDampingDeltas(controls), true);
    assert.equal(orbitControlsNeedFrame(controls), true);
  });

  it('reports settled when deltas and pointer are idle', () => {
    const controls = mockControls({ state: -1 });
    assert.equal(orbitControlsHaveDampingDeltas(controls), false);
    assert.equal(orbitControlsNeedFrame(controls), false);
  });
});
