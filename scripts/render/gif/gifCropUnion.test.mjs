import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGifUnionCrop,
  computeUnionAlphaBounds,
  cropImageDataToBounds,
  expandBoundsToManualWidth,
  normalizeGifManualCropWidth,
  unionAlphaBounds,
} from './gifCropUnion.js';

function solidFrame(width, height, alphaRect) {
  const data = new Uint8ClampedArray(width * height * 4);
  const { x0, y0, x1, y1 } = alphaRect;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = 180;
      data[i + 1] = 255;
      data[i + 2] = 57;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

test('unionAlphaBounds merges rects', () => {
  const u = unionAlphaBounds(
    { minCol: 10, minRow: 10, maxCol: 20, maxRow: 20 },
    { minCol: 5, minRow: 15, maxCol: 30, maxRow: 18 },
  );
  assert.deepEqual(u, { minCol: 5, minRow: 10, maxCol: 30, maxRow: 20 });
});

test('union crop covers moving content without clipping', () => {
  const frames = [
    solidFrame(100, 80, { x0: 10, y0: 10, x1: 30, y1: 40 }),
    solidFrame(100, 80, { x0: 50, y0: 20, x1: 70, y1: 50 }),
  ];
  const bounds = computeUnionAlphaBounds(frames, { padding: 0 });
  assert.deepEqual(bounds, {
    minCol: 10,
    minRow: 10,
    maxCol: 70,
    maxRow: 50,
  });

  const cropped = applyGifUnionCrop(frames, { padding: 0 });
  assert.equal(cropped.cropped, true);
  assert.equal(cropped.width, 61);
  assert.equal(cropped.height, 41);
  assert.equal(cropped.frames.length, 2);
  assert.equal(cropped.frames[0].width, 61);
  assert.equal(cropped.frames[1].width, 61);

  // First frame content starts at local (0,0); second at (40,10)
  assert.equal(cropped.frames[0].data[3], 255);
  const secondOpaque = (10 * 61 + 40) * 4 + 3;
  assert.equal(cropped.frames[1].data[secondOpaque], 255);
});

test('cropImageDataToBounds copies RGBA', () => {
  const src = solidFrame(10, 10, { x0: 2, y0: 2, x1: 5, y1: 5 });
  const out = cropImageDataToBounds(src, {
    minCol: 2,
    minRow: 2,
    maxCol: 5,
    maxRow: 5,
  });
  assert.equal(out.width, 4);
  assert.equal(out.height, 4);
  assert.equal(out.data[0], 180);
  assert.equal(out.data[3], 255);
});

test('manual width expands but never clips content', () => {
  const bounds = { minCol: 40, minRow: 10, maxCol: 60, maxRow: 50 };
  const narrower = expandBoundsToManualWidth(bounds, 100, 10);
  assert.equal(narrower.maxCol - narrower.minCol + 1, 21);
  const wider = expandBoundsToManualWidth(bounds, 100, 50);
  assert.equal(wider.maxCol - wider.minCol + 1, 50);
  assert.ok(wider.minCol <= 40 && wider.maxCol >= 60);

  const frames = [solidFrame(100, 80, { x0: 40, y0: 10, x1: 60, y1: 50 })];
  const cropped = applyGifUnionCrop(frames, { padding: 0, manualWidthPx: 50 });
  assert.equal(cropped.width, 50);
  assert.equal(normalizeGifManualCropWidth(50, 100), 50);
  assert.equal(normalizeGifManualCropWidth(null), null);
});
