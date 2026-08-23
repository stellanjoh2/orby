import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NES_PREP_FRAGMENT, NES_POST_FRAGMENT } from './creativeLookNesArt.js';

const materialsSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'CreativeLookMaterials.js'),
  'utf8',
);

test('NES prep shades albedo instead of replacing luminance', () => {
  assert.match(NES_PREP_FRAGMENT, /baseCol \* shade/);
  assert.match(NES_PREP_FRAGMENT, /mix\(0\.42, 1\.0, form\)/);
  assert.match(NES_PREP_FRAGMENT, /gl_FragColor = vec4\(lit,/);
  assert.doesNotMatch(NES_PREP_FRAGMENT, /shadeLum \/ srcLum/);
});

test('NES palette snap folds HDR peaks before 2C02 match', () => {
  assert.match(NES_POST_FRAGMENT, /float peak = max\(rgb\.r, max\(rgb\.g, rgb\.b\)\)/);
  assert.match(NES_POST_FRAGMENT, /rgb \*= 1\.0 \/ max\(peak, 1\.0\)/);
});

test('NES skips stacked PBR wrap so albedo reaches the palette snap', () => {
  assert.match(materialsSrc, /lookFragNoShadow\(NES_PREP_FRAGMENT\)/);
  assert.doesNotMatch(materialsSrc, /flatPostPrepFrag\(NES_PREP_FRAGMENT\)/);
});
