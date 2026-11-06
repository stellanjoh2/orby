import test from 'node:test';
import assert from 'node:assert/strict';
import { INTV_PREP_FRAGMENT, INTV_POST_FRAGMENT } from './creativeLookIntellivisionArt.js';

test('intellivision prep shades mesh color without luminance renormalization', () => {
  assert.match(INTV_PREP_FRAGMENT, /baseCol \* shade/);
  assert.doesNotMatch(INTV_PREP_FRAGMENT, /shadeLum \/ srcLum/);
  assert.doesNotMatch(INTV_PREP_FRAGMENT, /shadowAccent/);
});

test('intellivision snap prefers hue over a brighter palette neighbor', () => {
  assert.match(INTV_POST_FRAGMENT, /intvHueMismatch/);
  assert.match(INTV_POST_FRAGMENT, /if \(peak > 1\.0\) rgb \/= peak/);
  assert.match(INTV_POST_FRAGMENT, /lumDiff \* 0\.22 \+ colDist \* 0\.42 \+ intvHueMismatch/);
  assert.doesNotMatch(INTV_POST_FRAGMENT, /lumDiff \* 0\.54 \+ colDist \* 0\.36/);
});
