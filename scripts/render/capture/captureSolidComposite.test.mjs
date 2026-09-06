import test from 'node:test';
import assert from 'node:assert/strict';
import { fillSolidBackdropRgba } from './captureSolidComposite.js';
import { mergeGradientUnderPostRgba } from './captureGradientComposite.js';

test('fillSolidBackdropRgba writes exact #000000 (not Orby #080808)', () => {
  const rgba = fillSolidBackdropRgba('#000000', 2, 2);
  assert.equal(rgba.length, 2 * 2 * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    assert.equal(rgba[i], 0);
    assert.equal(rgba[i + 1], 0);
    assert.equal(rgba[i + 2], 0);
    assert.equal(rgba[i + 3], 255);
  }
});

test('merge keeps solid #000000 where scene alpha is 0 even if post is Orby black', () => {
  const w = 2;
  const h = 1;
  // bottom-up GL: one empty pixel (alpha 0) + one opaque mesh pixel
  const post = new Uint8Array([
    8, 8, 8, 255, // empty plate wrongly cleared to Orby black
    200, 100, 50, 255, // mesh
  ]);
  const alpha = new Uint8Array([
    0, 0, 0, 0,
    255, 255, 255, 255,
  ]);
  const solid = fillSolidBackdropRgba('#000000', w, h);
  const merged = mergeGradientUnderPostRgba(post, alpha, solid, w, h);
  // top-down: y=0 is the only row (same as bottom-up for h=1)
  assert.deepEqual([...merged.slice(0, 4)], [0, 0, 0, 255]);
  assert.deepEqual([...merged.slice(4, 8)], [200, 100, 50, 255]);
});
