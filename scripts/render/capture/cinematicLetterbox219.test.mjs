/**
 * 21∶9 letterbox matte geometry — matches styles.css `.viewport-letterbox` bars.
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeCinematicLetterbox219Mattes,
  fillCinematicLetterbox219Mattes,
} from './cinematicLetterbox219.js';

describe('cinematic letterbox 21:9 mattes', () => {
  it('ultrawide viewport gets left/right bars', () => {
    const bars = computeCinematicLetterbox219Mattes(2560, 1080);
    assert.equal(bars.length, 2);
    const [left, right] = bars;
    assert.equal(left.x, 0);
    assert.equal(left.height, 1080);
    assert.equal(right.x + right.width, 2560);
    assert.equal(left.width + right.width + 1080 * (21 / 9), 2560);
  });

  it('16:9 viewport gets top/bottom bars', () => {
    const bars = computeCinematicLetterbox219Mattes(1920, 1080);
    assert.equal(bars.length, 2);
    const [top, bottom] = bars;
    assert.equal(top.width, 1920);
    assert.equal(top.height + bottom.height + (1920 * 9) / 21, 1080);
  });

  it('tall viewport gets top/bottom bars', () => {
    const bars = computeCinematicLetterbox219Mattes(1080, 1920);
    assert.equal(bars.length, 2);
    const [top, bottom] = bars;
    assert.equal(top.x, 0);
    assert.equal(top.y, 0);
    assert.equal(top.width, 1080);
    assert.equal(bottom.y + bottom.height, 1920);
    assert.equal(top.height + bottom.height + (1080 * 9) / 21, 1920);
  });

  it('exact 21:9 frame has no mattes', () => {
    assert.deepEqual(computeCinematicLetterbox219Mattes(2100, 900), []);
  });

  it('2× export doubles bar thickness', () => {
    const oneX = computeCinematicLetterbox219Mattes(1920, 1080);
    const twoX = computeCinematicLetterbox219Mattes(3840, 2160);
    assert.equal(twoX[0].width, oneX[0].width * 2);
    assert.equal(twoX[1].width, oneX[1].width * 2);
  });

  it('fill paints only matte pixels', () => {
    const rects = [];
    const ctx = {
      fillStyle: '',
      fillRect(x, y, w, h) {
        rects.push({ x, y, w, h });
      },
    };
    fillCinematicLetterbox219Mattes(ctx, 1920, 1080);
    assert.equal(ctx.fillStyle, '#000000');
    assert.equal(rects.length, 2);
    assert.ok(rects.every((r) => r.w > 0 && r.h > 0));
  });
});
