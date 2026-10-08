import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampMaterialSaturation,
  injectMaterialSaturationFragmentForTest,
  syncMaterialSaturation,
  DEFAULT_MATERIAL_SATURATION,
} from './materialSaturationShader.js';

test('clampMaterialSaturation defaults and clamps', () => {
  assert.equal(clampMaterialSaturation(undefined), DEFAULT_MATERIAL_SATURATION);
  assert.equal(clampMaterialSaturation(1.25), 1.25);
  assert.equal(clampMaterialSaturation(-1), 0);
  assert.equal(clampMaterialSaturation(9), 2);
});

test('injects after color_fragment once', () => {
  const src = '#include <map_fragment>\n#include <color_fragment>\n#include <opaque_fragment>';
  const once = injectMaterialSaturationFragmentForTest(src);
  assert.match(once, /orbyMaterialSaturation/);
  assert.match(once, /#include <color_fragment>\n\/\* orbyMaterialSaturation \*\//);
  const twice = injectMaterialSaturationFragmentForTest(once);
  assert.equal(twice, once);
});

test('syncMaterialSaturation skips identity until first non-default', () => {
  const mat = {
    isMeshStandardMaterial: true,
    userData: {},
    onBeforeCompile: null,
    needsUpdate: false,
  };
  syncMaterialSaturation(mat, 1);
  assert.equal(mat.userData.orbyMaterialSaturationPatched, undefined);
  assert.equal(mat.onBeforeCompile, null);

  syncMaterialSaturation(mat, 0.5);
  assert.equal(mat.userData.orbyMaterialSaturationPatched, true);
  assert.equal(typeof mat.onBeforeCompile, 'function');
  assert.equal(mat.onBeforeCompile.__orbyMaterialSaturationPatch, true);
  assert.equal(mat.needsUpdate, true);

  const shader = {
    uniforms: {},
    fragmentShader: '#include <color_fragment>\nvoid main() {}',
  };
  mat.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uOrbyMaterialSaturation.value, 0.5);
  assert.match(shader.fragmentShader, /uniform float uOrbyMaterialSaturation/);
  assert.match(shader.fragmentShader, /orbyMaterialSaturation/);

  mat.needsUpdate = false;
  syncMaterialSaturation(mat, 1.5);
  assert.equal(mat.userData.orbyMaterialSaturationUniform.value, 1.5);
  assert.equal(mat.needsUpdate, false);
});
