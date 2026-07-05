import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { AnimationController } from './AnimationController.js';

describe('AnimationController export drive restore', () => {
  it('endExportDrive reactivates the live clip after capture-style export sampling', () => {
    const controller = new AnimationController();
    const tracks = [
      new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 1, 0, 0]),
    ];
    const clip = new THREE.AnimationClip('swim', 1, tracks);
    const model = new THREE.Object3D();
    controller.setModel(model, [clip]);

    controller.currentAction.time = 0.4;
    controller.currentAction.paused = false;
    controller.currentAction.play();

    controller.beginExportDrive({ include: true, clipIndex: 0 });
    controller.applyExportDriveTime(0);
    assert.equal(controller.isExportSessionActive(), true);

    controller.endExportDrive();

    assert.equal(controller.isExportSessionActive(), false);
    assert.equal(controller.currentAction.paused, false);
    assert.equal(controller.currentAction.enabled, true);
    assert.ok(Math.abs(controller.currentAction.time - 0.4) < 1e-6);
  });

  it('endExportDrive restores playback speed after export drive forced timeScale to 1', () => {
    const controller = new AnimationController();
    const clip = new THREE.AnimationClip('swim', 2, []);
    controller.setModel(new THREE.Object3D(), [clip]);

    controller.setPlaybackSpeed(2);
    controller.currentAction.paused = false;
    controller.currentAction.play();

    controller.beginExportDrive({ include: true, clipIndex: 0 });
    assert.equal(controller.currentAction.timeScale, 1);

    controller.endExportDrive();

    assert.equal(controller.currentAction.timeScale, 2);
    assert.equal(controller.currentAction.paused, false);
    assert.equal(controller.currentAction.enabled, true);
  });

  it('endExportDrive restores a paused viewport clip after pose-hold export', () => {
    const controller = new AnimationController();
    const clip = new THREE.AnimationClip('swim', 2, []);
    controller.setModel(new THREE.Object3D(), [clip]);

    controller.currentAction.time = 1.1;
    controller.currentAction.paused = true;

    controller.beginExportDrive({ include: false });
    assert.equal(controller.isExportSessionActive(), true);

    controller.endExportDrive();

    assert.equal(controller.isExportSessionActive(), false);
    assert.equal(controller.currentAction.paused, true);
    assert.ok(Math.abs(controller.currentAction.time - 1.1) < 1e-6);
  });

  it('ensureLivePlaybackResumed reactivates a clip left deactivated after export', () => {
    const controller = new AnimationController();
    const clip = new THREE.AnimationClip('swim', 1, []);
    controller.setModel(new THREE.Object3D(), [clip]);

    controller.currentAction.time = 0.25;
    controller.currentAction.paused = false;
    controller.currentAction.play();

    controller.beginExportDrive({ include: true, clipIndex: 0 });
    controller.applyExportDriveTime(0);
    controller.currentAction.stop();

    controller.ensureLivePlaybackResumed();

    assert.equal(controller.isExportSessionActive(), false);
    assert.equal(controller.currentAction.enabled, true);
    assert.equal(controller.currentAction.paused, false);
    assert.ok(Math.abs(controller.currentAction.time - 0.25) < 1e-6);
  });
});
