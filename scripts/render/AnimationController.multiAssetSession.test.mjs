import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { AnimationController } from './AnimationController.js';

function makeClip(name = 'clip') {
  return new THREE.AnimationClip(name, 1, [
    new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 1, 0, 0]),
  ]);
}

describe('AnimationController multi-asset session park', () => {
  it('keeps a paused clip paused after detach/attach (selection switch)', () => {
    const controller = new AnimationController();
    const modelA = new THREE.Object3D();
    controller.setModel(modelA, [makeClip('a')]);
    controller.currentAction.paused = true;
    controller.currentAction.time = 0.35;

    const parked = controller.detachSession();
    assert.ok(parked);
    assert.equal(parked.currentAction.paused, true);
    assert.equal(controller.mixer, null);

    const modelB = new THREE.Object3D();
    controller.setModel(modelB, [makeClip('b')]);
    assert.equal(controller.currentAction.paused, false);

    controller.detachSession();
    controller.attachSession(parked);

    assert.equal(controller.currentAction.paused, true);
    assert.ok(Math.abs(controller.currentAction.time - 0.35) < 1e-6);
  });

  it('updateParkedSessions advances playing parked clips but not paused ones', () => {
    const controller = new AnimationController();
    const modelA = new THREE.Object3D();
    controller.setModel(modelA, [makeClip('a')]);
    controller.currentAction.paused = true;
    const timePaused = controller.currentAction.time;
    const pausedSession = controller.detachSession();

    const modelB = new THREE.Object3D();
    controller.setModel(modelB, [makeClip('b')]);
    controller.currentAction.time = 0.1;
    const playingSession = controller.detachSession();
    playingSession.currentAction.paused = false;

    const assets = [
      { id: 1, animationSession: pausedSession },
      { id: 2, animationSession: playingSession },
    ];

    AnimationController.updateParkedSessions(assets, 3, 0.2);

    assert.ok(Math.abs(pausedSession.currentAction.time - timePaused) < 1e-6);
    assert.ok(playingSession.currentAction.time > 0.1);
  });

  it('hasParkedPlayingSession ignores paused parked clips', () => {
    const action = { paused: true, isRunning: () => true };
    const assets = [{ id: 1, animationSession: { currentAction: action } }];
    assert.equal(AnimationController.hasParkedPlayingSession(assets, 2), false);

    action.paused = false;
    assert.equal(AnimationController.hasParkedPlayingSession(assets, 2), true);
    assert.equal(AnimationController.hasParkedPlayingSession(assets, 1), false);
  });
});
