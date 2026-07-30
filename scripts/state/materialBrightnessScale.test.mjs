import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_MATERIAL_BRIGHTNESS,
  materialBrightnessEffectiveScale,
  materialBrightnessLitEnvMultiplier,
} from '../constants.js';
import { migrateLegacyMaterialBrightness } from './migrateLegacyMaterialBrightness.js';

describe('materialBrightnessEffectiveScale', () => {
  it('maps UI 1.0 to effective 2.0', () => {
    assert.equal(materialBrightnessEffectiveScale(1), 2);
  });

  it('preserves former default effective brightness at UI 0.875', () => {
    assert.equal(materialBrightnessEffectiveScale(0.875), 1.75);
  });

  it('defaults to effective 2.0 when UI is invalid', () => {
    assert.equal(
      materialBrightnessEffectiveScale(undefined),
      materialBrightnessEffectiveScale(DEFAULT_MATERIAL_BRIGHTNESS),
    );
  });
});

describe('materialBrightnessLitEnvMultiplier', () => {
  it('is neutral at the new default UI value', () => {
    assert.equal(materialBrightnessLitEnvMultiplier(DEFAULT_MATERIAL_BRIGHTNESS), 1);
  });
});

describe('migrateLegacyMaterialBrightness', () => {
  it('halves legacy material brightness when schemaVersion is missing', () => {
    const payload = { material: { brightness: 2.28 } };
    migrateLegacyMaterialBrightness(payload, undefined);
    assert.equal(payload.material.brightness, 1.14);
  });

  it('skips migration for schemaVersion 3+', () => {
    const payload = { material: { brightness: 1.0 } };
    migrateLegacyMaterialBrightness(payload, 3);
    assert.equal(payload.material.brightness, 1);
  });

});
