import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeExportCameraSpinSettings,
  normalizeExportObjectSpinSettings,
  resolveExportCameraMovementDurationSec,
  resolveExportCameraMovementLinearT,
  resolveExportDurationSec,
  resolveExportMeshAnimationTiming,
} from './exportVideoMovements.js';

describe('exportVideoMovements split spin settings', () => {
  it('keeps legacy partial arc on camera when orbit is on and turntable is off', () => {
    const camera = normalizeExportCameraSpinSettings({
      turntable: false,
      orbit: true,
      spins: 0,
      subtleSpinDegrees: 90,
      spinDirection: 'forward',
    });
    assert.equal(camera.rotationDegrees, 90);
    assert.equal(normalizeExportObjectSpinSettings({
      turntable: false,
      orbit: true,
      spins: 0,
      subtleSpinDegrees: 90,
    }).rotationDegrees, 0);
  });

  it('migrates legacy partial arc to camera only when both toggles were on', () => {
    const settings = {
      turntable: true,
      orbit: true,
      spins: 0,
      subtleSpinDegrees: 22.5,
      spinDirection: 'forward',
    };
    assert.equal(normalizeExportObjectSpinSettings(settings).rotationDegrees, 0);
    assert.equal(normalizeExportCameraSpinSettings(settings).rotationDegrees, 22.5);
  });

  it('uses arc when only objectSubtleDegrees is set (missing objectSpins defaults to 0 laps)', () => {
    assert.equal(normalizeExportObjectSpinSettings({
      turntable: true,
      objectSubtleDegrees: 45,
    }).rotationDegrees, 45);
  });

  it('uses explicit object and camera fields independently', () => {
    const settings = {
      turntable: true,
      orbit: true,
      objectSpins: 0,
      objectSubtleDegrees: 45,
      objectSpinDirection: 'forward',
      cameraSpins: 0,
      cameraSubtleDegrees: 90,
      cameraSpinDirection: 'reverse',
    };
    assert.equal(normalizeExportObjectSpinSettings(settings).rotationDegrees, 45);
    assert.equal(normalizeExportCameraSpinSettings(settings).rotationDegrees, 90);
    assert.equal(normalizeExportCameraSpinSettings(settings).spinDirection, 'reverse');
  });
});

describe('export mesh animation timing', () => {
  it('keeps preset export duration when match is off', () => {
    assert.equal(
      resolveExportDurationSec({ durationSec: 10, meshAnimationsInclude: true }, 2.5),
      10,
    );
  });

  it('uses clip duration when match is on', () => {
    assert.equal(
      resolveExportDurationSec(
        {
          durationSec: 10,
          meshAnimationsInclude: true,
          meshMatchDurationToClip: true,
        },
        2.5,
      ),
      2.5,
    );
  });

  it('uses preset camera duration when match is on but sync is off', () => {
    const settings = {
      durationSec: 5,
      meshAnimationsInclude: true,
      meshMatchDurationToClip: true,
      meshSyncCameraToDuration: false,
    };
    const timing = resolveExportMeshAnimationTiming(settings, 1, 8);
    assert.equal(timing.exportDurationSec, 8);
    assert.equal(timing.cameraMovementDurationSec, 5);
    assert.equal(resolveExportCameraMovementLinearT(4, timing.cameraMovementDurationSec), 0.8);
    assert.equal(resolveExportCameraMovementLinearT(6, timing.cameraMovementDurationSec), 1);
  });

  it('syncs camera duration to clip when match and sync are on', () => {
    const timing = resolveExportMeshAnimationTiming(
      {
        durationSec: 5,
        meshAnimationsInclude: true,
        meshMatchDurationToClip: true,
        meshSyncCameraToDuration: true,
      },
      1,
      3.2,
    );
    assert.equal(timing.exportDurationSec, 3.2);
    assert.equal(timing.cameraMovementDurationSec, 3.2);
    assert.equal(
      resolveExportCameraMovementDurationSec(
        {
          meshAnimationsInclude: true,
          meshMatchDurationToClip: true,
          meshSyncCameraToDuration: true,
        },
        3.2,
      ),
      3.2,
    );
  });
});
