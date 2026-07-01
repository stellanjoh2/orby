/**
 * Export movement easing curves.
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_EXPORT_MOVEMENT_EASING,
  DEFAULT_EXPORT_MOVEMENT_EASING_FAMILY,
  DEFAULT_EXPORT_MOVEMENT_EASING_TYPE,
  EXPORT_MOVEMENT_EASING_FAMILIES,
  EXPORT_MOVEMENT_EASING_TYPES,
  composeExportMovementEasing,
  easeExportMovementProgress,
  exportMovementEasingLabel,
  normalizeExportMovementEasing,
  parseExportMovementEasing,
} from './exportMovementEasing.js';

const NEAR_ONE = 1e-6;

function assertEaseEndpoint(value, id, end) {
  assert.ok(
    Math.abs(value - end) < NEAR_ONE,
    `${id} at ${end} got ${value}`,
  );
}

describe('exportMovementEasing', () => {
  it('defaults to linear', () => {
    assert.equal(normalizeExportMovementEasing(undefined), DEFAULT_EXPORT_MOVEMENT_EASING);
    assert.equal(normalizeExportMovementEasing('not-a-curve'), DEFAULT_EXPORT_MOVEMENT_EASING);
    assert.equal(easeExportMovementProgress(0.25), 0.25);
    assert.equal(easeExportMovementProgress(0.75), 0.75);
  });

  it('composes and parses family + type', () => {
    assert.equal(
      composeExportMovementEasing('expo', 'out'),
      'expo.out',
    );
    assert.equal(
      composeExportMovementEasing('linear', 'in'),
      DEFAULT_EXPORT_MOVEMENT_EASING,
    );
    assert.deepEqual(parseExportMovementEasing('quint.out'), {
      family: 'quint',
      type: 'out',
    });
    assert.deepEqual(parseExportMovementEasing('linear'), {
      family: DEFAULT_EXPORT_MOVEMENT_EASING_FAMILY,
      type: DEFAULT_EXPORT_MOVEMENT_EASING_TYPE,
    });
  });

  it('maps endpoints for every composed curve', () => {
    for (const { id: family } of EXPORT_MOVEMENT_EASING_FAMILIES) {
      if (family === 'linear') {
        assert.equal(easeExportMovementProgress(0, 'linear'), 0);
        assert.equal(easeExportMovementProgress(1, 'linear'), 1);
        continue;
      }
      for (const { id: type } of EXPORT_MOVEMENT_EASING_TYPES) {
        const id = composeExportMovementEasing(family, type);
        assert.equal(easeExportMovementProgress(0, id), 0, `${id} at 0`);
        assertEaseEndpoint(easeExportMovementProgress(1, id), id, 1);
      }
    }
  });

  it('ease-out slows near the end of the clip', () => {
    const mid = easeExportMovementProgress(0.5, 'quint.out');
    assert.ok(mid > 0.5, `expected front-loaded progress, got ${mid}`);
    const earlyDelta =
      easeExportMovementProgress(0.3, 'quint.out')
      - easeExportMovementProgress(0.1, 'quint.out');
    const lateDelta =
      easeExportMovementProgress(0.95, 'quint.out')
      - easeExportMovementProgress(0.8, 'quint.out');
    assert.ok(
      lateDelta < earlyDelta,
      `expected deceleration near end, early Δ=${earlyDelta} late Δ=${lateDelta}`,
    );
  });

  it('labels known curves', () => {
    assert.equal(exportMovementEasingLabel('quint.out'), 'Quint · Out');
    assert.equal(exportMovementEasingLabel('linear'), 'Linear');
    assert.equal(exportMovementEasingLabel('bogus'), 'Linear');
  });
});
