import test from 'node:test';
import assert from 'node:assert/strict';

// TextureLoader touches `document` when resolving normal-map URLs.
if (typeof globalThis.document === 'undefined') {
  const stubEl = () => ({
    style: {},
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
  });
  globalThis.document = {
    createElementNS: stubEl,
    createElement: stubEl,
  };
}

const {
  applySvgExtrudeSurfaceToMaterial,
  ensureOrbySurfaceHookLinked,
  relinkOuterShaderPatchesAfterSurface,
} = await import('./SvgExtrudeSurfaceShader.js');

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

test('applySvgExtrudeSurfaceToMaterial injects normal-map surf body', () => {
  const mat = mockStandardMaterial();
  applySvgExtrudeSurfaceToMaterial(mat, { preset: 'galvanizedSteel', scale: 1, strength: 1 });
  assert.equal(mat.userData.svgExtrudeProceduralPatched, true);
  assert.equal(typeof mat.onBeforeCompile, 'function');

  const shader = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: mockPhysicalFragment(), uniforms: {} };
  mat.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /orby_svg_surf/);
  assert.match(shader.vertexShader, /vOrbyWorldPos/);
  assert.equal(shader.uniforms.uOrbySurfaceMode.value, 0);
  assert.ok(shader.uniforms.uOrbyNormalMap.value);
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

  applySvgExtrudeSurfaceToMaterial(mat, { preset: 'galvanizedSteel', scale: 1, strength: 1 });

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

  applySvgExtrudeSurfaceToMaterial(mat, { preset: 'galvanizedSteel', scale: 1, strength: 1 });
  relinkOuterShaderPatchesAfterSurface(mat);

  assert.match(String(mat.customProgramCacheKey()), /orbySvgSurf:v23/);
  assert.match(String(mat.customProgramCacheKey()), /orbyShadowTint:080808:0:0.25/);
  assert.equal(mat.userData.orbyShadowTint.previousOnBeforeCompile, mat.userData.svgExtrudeProceduralOnBeforeCompile);
  assert.equal(mat.needsUpdate, true);

  const shader = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: mockPhysicalFragment(), uniforms: {} };
  shadowHook(shader);
  assert.match(shader.fragmentShader, /orby_svg_surf/);
});

test('surface preset dropdown swaps normal map without program rebuild', () => {
  const mat = mockStandardMaterial();
  applySvgExtrudeSurfaceToMaterial(mat, { preset: 'galvanizedSteel', scale: 1, strength: 1 });
  const hook = mat.userData.svgExtrudeProceduralOnBeforeCompile;
  const refs = mat.userData.svgExtrudeProceduralUniforms;
  const firstMap = refs.uOrbyNormalMap.value;
  mat.needsUpdate = false;

  applySvgExtrudeSurfaceToMaterial(mat, { preset: 'dirtyMetal', scale: 1, strength: 1 });

  assert.equal(mat.userData.svgExtrudeProceduralOnBeforeCompile, hook);
  assert.equal(mat.userData.svgExtrudeProceduralUniforms, refs);
  assert.equal(mat.userData.svgExtrudeSurfacePresetId, 'dirtyMetal');
  assert.notEqual(refs.uOrbyNormalMap.value, firstMap);
  assert.equal(mat.needsUpdate, false);
});

test('reinstalls surface hook after JSON-cloned zombie patch flags', () => {
  const mat = mockStandardMaterial();
  applySvgExtrudeSurfaceToMaterial(mat, { preset: 'galvanizedSteel', scale: 1, strength: 1 });

  // Simulate Three.js Material.copy/clone: JSON userData keeps patched:true, drops functions.
  mat.userData.svgExtrudeProceduralPatched = true;
  delete mat.userData.svgExtrudeProceduralOnBeforeCompile;
  mat.userData.svgExtrudeProceduralUniforms = {
    uOrbySurfaceMode: { value: 0 },
    uOrbyScale: { value: 1 },
    uOrbyNormalStrength: { value: 0.58 },
    uOrbyNormalMap: { value: null },
  };
  mat.onBeforeCompile = null;

  applySvgExtrudeSurfaceToMaterial(mat, { preset: 'dirtyMetal', scale: 0.45, strength: 0.48 });

  assert.equal(typeof mat.userData.svgExtrudeProceduralOnBeforeCompile, 'function');
  assert.equal(typeof mat.onBeforeCompile, 'function');
  const expected = 0.58 * 0.48;
  assert.ok(
    Math.abs(mat.userData.svgExtrudeProceduralUniforms.uOrbyNormalStrength.value - expected) < 1e-6,
  );

  const shader = {
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: mockPhysicalFragment(),
    uniforms: {},
  };
  mat.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /orby_svg_surf/);
  assert.equal(
    shader.uniforms.uOrbyNormalStrength,
    mat.userData.svgExtrudeProceduralUniforms.uOrbyNormalStrength,
  );

  applySvgExtrudeSurfaceToMaterial(mat, { preset: 'dirtyMetal', scale: 0.45, strength: 1.5 });
  assert.ok(
    Math.abs(shader.uniforms.uOrbyNormalStrength.value - 0.58 * 1.5) < 1e-6,
  );
});

test('surface compile hook follows fresnel previous updates from userData', () => {
  const mat = mockStandardMaterial();
  applySvgExtrudeSurfaceToMaterial(mat, { preset: 'galvanizedSteel', scale: 1, strength: 1 });
  let fresnelCalled = false;
  const fresnelHook = () => {
    fresnelCalled = true;
  };
  fresnelHook.__orbyFresnelShaderPatch = true;
  mat.userData.fresnelPatched = true;
  mat.userData.fresnelOnBeforeCompile = fresnelHook;
  // ensureSvgExtrudeFresnelChain / applyFresnel only write userData previous — not a closed-over arg.
  mat.userData.svgExtrudeProceduralPrevious = fresnelHook;

  const shader = {
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: mockPhysicalFragment(),
    uniforms: {},
  };
  mat.onBeforeCompile(shader);
  assert.equal(fresnelCalled, true);
  assert.match(shader.fragmentShader, /orby_svg_surf/);
});
