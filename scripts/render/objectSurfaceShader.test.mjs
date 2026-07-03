import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySvgExtrudeSurfaceToMaterial,
  ensureOrbySurfaceHookLinked,
  relinkOuterShaderPatchesAfterSurface,
} from './SvgExtrudeSurfaceShader.js';

function mockStandardMaterial() {
  return {
    isMeshStandardMaterial: true,
    userData: {},
    onBeforeCompile: null,
    needsUpdate: false,
  };
}

function mockPhysicalFragment() {
  return `#include <common>
#include <roughnessmap_fragment>
#include <metalnessmap_fragment>
#include <normal_fragment_begin>
#include <normal_fragment_maps>
#include <opaque_fragment>`;
}

test('applySvgExtrudeSurfaceToMaterial injects ceramic surf body', () => {
  const mat = mockStandardMaterial();
  applySvgExtrudeSurfaceToMaterial(mat, { preset: 'ceramic', scale: 1, strength: 1 });
  assert.equal(mat.userData.svgExtrudeProceduralPatched, true);
  assert.equal(typeof mat.onBeforeCompile, 'function');

  const shader = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: mockPhysicalFragment(), uniforms: {} };
  mat.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /orby_svg_surf/);
  assert.match(shader.vertexShader, /vOrbyWorldPos/);
  assert.equal(shader.uniforms.uOrbySurfaceMode.value, 3);
});

test('surface inserts under live shadow tint hook', () => {
  const mat = mockStandardMaterial();
  const inner = () => {};
  const shadowHook = (shader) => {
    mat.userData.orbyShadowTint?.previousOnBeforeCompile?.(shader);
  };
  shadowHook.__orbyShadowTintPatch = true;
  mat.userData.shadowTintPatched = true;
  mat.userData.shadowTintOnBeforeCompile = shadowHook;
  mat.userData.orbyShadowTint = { previousOnBeforeCompile: inner };
  mat.onBeforeCompile = shadowHook;

  applySvgExtrudeSurfaceToMaterial(mat, { preset: 'ceramic', scale: 1, strength: 1 });

  const surfaceHook = mat.userData.svgExtrudeProceduralOnBeforeCompile;
  assert.equal(typeof surfaceHook, 'function');
  assert.equal(mat.onBeforeCompile, shadowHook);
  assert.equal(mat.userData.orbyShadowTint.previousOnBeforeCompile, surfaceHook);

  const shader = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: mockPhysicalFragment(), uniforms: {} };
  shadowHook(shader);
  assert.match(shader.fragmentShader, /orby_svg_surf/);
});

test('ensureOrbySurfaceHookLinked repairs surface mistakenly set as outer hook', () => {
  const mat = mockStandardMaterial();
  const inner = () => {};
  const shadowHook = (shader) => {
    inner(shader);
  };
  shadowHook.__orbyShadowTintPatch = true;
  const surfaceHook = (shader) => {
    inner(shader);
  };
  surfaceHook.__orbySvgSurfPatch = true;

  mat.userData.shadowTintPatched = true;
  mat.userData.shadowTintOnBeforeCompile = shadowHook;
  mat.userData.orbyShadowTint = { previousOnBeforeCompile: inner };
  mat.userData.svgExtrudeProceduralPatched = true;
  mat.userData.svgExtrudeProceduralOnBeforeCompile = surfaceHook;
  mat.onBeforeCompile = surfaceHook;

  assert.equal(ensureOrbySurfaceHookLinked(mat), true);
  assert.equal(mat.onBeforeCompile, shadowHook);
  assert.equal(mat.userData.orbyShadowTint.previousOnBeforeCompile, surfaceHook);
});

test('relinkOuterShaderPatchesAfterSurface re-wraps shadow cache key after surface sync', () => {
  const mat = mockStandardMaterial();
  const inner = () => {};
  const shadowHook = (shader) => {
    mat.userData.orbyShadowTint?.previousOnBeforeCompile?.(shader);
  };
  shadowHook.__orbyShadowTintPatch = true;
  mat.userData.shadowTintPatched = true;
  mat.userData.shadowTintOnBeforeCompile = shadowHook;
  mat.userData.orbyShadowTint = {
    previousOnBeforeCompile: inner,
    color: { getHexString: () => '080808' },
    strength: 0,
    opacity: 0.25,
    uniforms: { color: {}, strength: {}, opacity: {} },
  };
  mat.onBeforeCompile = shadowHook;
  mat.customProgramCacheKey = () => '|orbyShadowTint:080808:0:0.25';

  applySvgExtrudeSurfaceToMaterial(mat, { preset: 'ceramic', scale: 1, strength: 1 });
  relinkOuterShaderPatchesAfterSurface(mat);

  assert.match(String(mat.customProgramCacheKey()), /orbySvgSurf:v13:ceramic/);
  assert.match(String(mat.customProgramCacheKey()), /orbyShadowTint:080808:0:0.25/);
  assert.equal(mat.userData.orbyShadowTint.previousOnBeforeCompile, mat.userData.svgExtrudeProceduralOnBeforeCompile);
  assert.equal(mat.needsUpdate, true);

  const shader = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: mockPhysicalFragment(), uniforms: {} };
  shadowHook(shader);
  assert.match(shader.fragmentShader, /orby_svg_surf/);
});
