import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GB_PREP_FRAGMENT, GB_POST_FRAGMENT } from './creativeLookGameBoyArt.js';

const materialsSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'CreativeLookMaterials.js'),
  'utf8',
);

test('Game Boy prep shades albedo instead of replacing luminance', () => {
  assert.match(GB_PREP_FRAGMENT, /baseCol \* shade/);
  assert.match(GB_PREP_FRAGMENT, /mix\(0\.4, 1\.0, form\)/);
  assert.match(GB_PREP_FRAGMENT, /gl_FragColor = vec4\(lit,/);
  assert.doesNotMatch(GB_PREP_FRAGMENT, /shadeLum \/ srcLum/);
  assert.doesNotMatch(GB_PREP_FRAGMENT, /GB_LUMA/);
});

test('Game Boy luma snap folds HDR and maps bright cells to the lightest shade', () => {
  assert.match(GB_POST_FRAGMENT, /float peak = max\(rgb\.r, max\(rgb\.g, rgb\.b\)\)/);
  assert.match(GB_POST_FRAGMENT, /rgb \*= 1\.0 \/ max\(peak, 1\.0\)/);
  assert.match(GB_POST_FRAGMENT, /float tier = \(1\.0 - biased\) \* 3\.0/);
  assert.doesNotMatch(GB_POST_FRAGMENT, /float tier = biased \* 3\.0/);
  assert.doesNotMatch(GB_POST_FRAGMENT, /rgb = applyFlatPostMasterHue\(rgb\)/);
});

test('Game Boy skips stacked PBR wrap so albedo luma reaches the 4-shade snap', () => {
  assert.match(materialsSrc, /lookFragNoShadow\(GB_PREP_FRAGMENT\)/);
  assert.doesNotMatch(materialsSrc, /flatPostPrepFrag\(GB_PREP_FRAGMENT\)/);
});
