import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DITHER_NEUTRAL_PREP_FRAGMENT,
  DITHER_TRITONE_POST_FRAGMENT,
  DITHER_CROSSHATCH_POST_FRAGMENT,
  DITHER_RASTER_POST_FRAGMENT,
} from './creativeLookDitherArt.js';

test('dither prep shades albedo instead of killing metal diffuse', () => {
  assert.match(DITHER_NEUTRAL_PREP_FRAGMENT, /baseCol \* shade/);
  assert.match(DITHER_NEUTRAL_PREP_FRAGMENT, /mix\(0\.58, 1\.0, ndl\)/);
  assert.doesNotMatch(DITHER_NEUTRAL_PREP_FRAGMENT, /metal \* 0\.92/);
  assert.doesNotMatch(DITHER_NEUTRAL_PREP_FRAGMENT, /diffFloor/);
});

test('dither tritone and crosshatch keep milder luma curves than the old crush', () => {
  assert.match(DITHER_TRITONE_POST_FRAGMENT, /mix\(1\.0, 1\.65, t\)/);
  assert.match(DITHER_TRITONE_POST_FRAGMENT, /mix\(0\.22, 0\.14, t\)/);
  assert.doesNotMatch(DITHER_TRITONE_POST_FRAGMENT, /mix\(1\.0, 2\.45, t\)/);
  assert.match(DITHER_CROSSHATCH_POST_FRAGMENT, /mix\(1\.0, 1\.7, crush\)/);
  assert.doesNotMatch(DITHER_CROSSHATCH_POST_FRAGMENT, /mix\(1\.0, 2\.55, crush\)/);
});

test('dither raster keeps a higher floor on dot luminance', () => {
  assert.match(DITHER_RASTER_POST_FRAGMENT, /mix\(0\.68, 0\.28, t\)/);
  assert.doesNotMatch(DITHER_RASTER_POST_FRAGMENT, /mix\(0\.68, 0\.12, t\)/);
});
