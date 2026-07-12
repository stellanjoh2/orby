import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveMaterialBrightnessMetalnessClamp } from '../render/materialBrightnessMetalnessClamp.js';

describe('resolveMaterialBrightnessMetalnessClamp', () => {
  it('uses authored × slider for glTF imports (not slider alone)', () => {
    assert.equal(
      resolveMaterialBrightnessMetalnessClamp({
        sliderMetalness: 1,
        authored: { metalness: 0, roughness: 0.04 },
      }),
      0,
    );
  });

  it('still clamps metals when authored metalness is high', () => {
    assert.equal(
      resolveMaterialBrightnessMetalnessClamp({
        sliderMetalness: 1,
        authored: { metalness: 1, roughness: 0.2 },
      }),
      1,
    );
  });

  it('skips clamp driver when MR maps present', () => {
    assert.equal(
      resolveMaterialBrightnessMetalnessClamp({
        sliderMetalness: 1,
        hasMrMaps: true,
        authored: { metalness: 1, roughness: 0.5 },
      }),
      0,
    );
  });

  it('uses absolute slider on shape library meshes', () => {
    assert.equal(
      resolveMaterialBrightnessMetalnessClamp({
        isShapeLibrary: true,
        sliderMetalness: 0.08,
      }),
      0.08,
    );
  });
});
