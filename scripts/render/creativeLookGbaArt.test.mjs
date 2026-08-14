import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GBA_PREP_FRAGMENT, GBA_POST_FRAGMENT } from './creativeLookGbaArt.js';
import { MD_PREP_FRAGMENT, MD_POST_FRAGMENT } from './creativeLookMegaDriveArt.js';

const materialsSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'CreativeLookMaterials.js'),
  'utf8',
);

test('GBA prep shades albedo instead of replacing luminance', () => {
  assert.match(GBA_PREP_FRAGMENT, /baseCol \* shade/);
  assert.match(GBA_PREP_FRAGMENT, /mix\(0\.55, 1\.0, form\)/);
  assert.doesNotMatch(GBA_PREP_FRAGMENT, /shadeLum \/ srcLum/);
  assert.doesNotMatch(GBA_PREP_FRAGMENT, /shadowAccent/);
  assert.doesNotMatch(GBA_PREP_FRAGMENT, /mix\(vec3\(lum\), lit, 1\.12\)/);
});

test('GBA 15-bit snap folds HDR peaks before quantize', () => {
  assert.match(GBA_POST_FRAGMENT, /float peak = max\(rgb\.r, max\(rgb\.g, rgb\.b\)\)/);
  assert.match(GBA_POST_FRAGMENT, /rgb \*= 1\.0 \/ max\(peak, 1\.0\)/);
});

test('Mega Drive prep and snap follow the same high-color contract', () => {
  assert.match(MD_PREP_FRAGMENT, /baseCol \* shade/);
  assert.match(MD_PREP_FRAGMENT, /mix\(0\.55, 1\.0, form\)/);
  assert.doesNotMatch(MD_PREP_FRAGMENT, /shadeLum \/ srcLum/);
  assert.doesNotMatch(MD_PREP_FRAGMENT, /shadowAccent/);
  assert.match(MD_POST_FRAGMENT, /rgb \*= 1\.0 \/ max\(peak, 1\.0\)/);
});

test('GBA and Mega Drive skip stacked PBR wrap so albedo reaches the color snap', () => {
  assert.match(materialsSrc, /lookFragNoShadow\(GBA_PREP_FRAGMENT\)/);
  assert.match(materialsSrc, /lookFragNoShadow\(MD_PREP_FRAGMENT\)/);
  assert.doesNotMatch(materialsSrc, /flatPostPrepFrag\(GBA_PREP_FRAGMENT\)/);
  assert.doesNotMatch(materialsSrc, /flatPostPrepFrag\(MD_PREP_FRAGMENT\)/);
});
