import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyImportPhysicalGlassPresentation,
  applyPhysicalGlassSurfaceParams,
  isDefaultGlassTintHex,
  isImportGlassProtectedFromObjectSliders,
  isUsableImportTexture,
  resolveBaselineColor,
  resolveImportGlassBaseline,
  resolvePhysicalGlassUserParams,
} from './importPhysicalGlassPresentation.js';

test('resolvePhysicalGlassUserParams clamps user glass sliders', () => {
  const params = resolvePhysicalGlassUserParams({
    glassOpacity: 2,
    glassBody: -1,
    glassReflection: 99,
    glassTintHex: '#ff0000',
    glassRefractionBlur: 4,
  });
  assert.equal(params.glassOpacity, 1);
  assert.equal(params.glassBody, 0);
  assert.equal(params.glassReflection, 4);
  assert.equal(params.glassTintHex, '#ff0000');
  assert.equal(params.glassRefractionBlur, 1);
});

test('applyPhysicalGlassSurfaceParams uses transmission not BLEND opacity', () => {
  const mat = {
    transmission: 0,
    thickness: 0,
    ior: 1,
    roughness: 1,
    metalness: 1,
    color: { copy() { return this; }, lerp() { return this; }, multiplyScalar() { return this; } },
    attenuationColor: { copy() { return this; }, lerp() { return this; } },
    specularColor: { setRGB() {} },
    specularIntensity: 0,
    transparent: false,
    opacity: 0.5,
    depthWrite: true,
    side: 0,
    userData: {},
    needsUpdate: false,
  };
  const params = resolvePhysicalGlassUserParams({
    glassOpacity: 0.8,
    glassBody: 0.2,
    glassReflection: 2,
    glassTintHex: '#080808',
    glassRefractionBlur: 0,
  });
  applyPhysicalGlassSurfaceParams(mat, params, {
    baselineTransmission: 1,
    baselineRoughness: 0.06,
  });
  assert.ok(mat.transmission > 0.5);
  assert.equal(mat.opacity, 1);
  assert.equal(mat.metalness, 0);
  assert.ok(mat.roughness <= 0.03);
  assert.equal(mat.userData.orbyGltfPhysicalGlass, true);
  assert.equal(mat.userData.orbyGltfTransmissionFallback, undefined);
});

test('isUsableImportTexture rejects JSON-cloned texture stubs', () => {
  assert.equal(isUsableImportTexture(null), false);
  assert.equal(isUsableImportTexture({ uuid: 'x', image: 'data:image/jpeg' }), false);
  assert.equal(isUsableImportTexture({ isTexture: true }), true);
});

test('resolveImportGlassBaseline prefers live Color/Texture over cloned stubs', () => {
  const realMap = { isTexture: true };
  const realColor = { isColor: true, r: 1, g: 0.57, b: 0.09 };
  const resolved = resolveImportGlassBaseline(
    { map: { uuid: 'dead' }, color: { r: 1, g: 0, b: 0 }, transmission: 1 },
    { map: realMap, color: realColor, transmission: 1, roughness: 0.1 },
  );
  assert.equal(resolved.map, realMap);
  assert.equal(resolved.color, realColor);
  assert.equal(resolved.roughness, 0.1);
});

test('applyImportPhysicalGlassPresentation does not assign non-texture maps', () => {
  const mat = {
    isMeshPhysicalMaterial: true,
    map: { uuid: 'cloned-stub' },
    alphaMap: { uuid: 'cloned-alpha' },
    transmission: 0,
    thickness: 0,
    ior: 1,
    roughness: 1,
    metalness: 1,
    color: { copy() { return this; }, lerp() { return this; }, multiplyScalar() { return this; } },
    attenuationColor: { copy() { return this; }, lerp() { return this; } },
    specularColor: { setRGB() {} },
    specularIntensity: 0,
    transparent: false,
    opacity: 0.5,
    depthWrite: true,
    side: 0,
    userData: {
      orbyGltfImportBaseline: {
        transmission: 1,
        map: { uuid: 'cloned-stub' },
      },
    },
    needsUpdate: false,
  };
  applyImportPhysicalGlassPresentation(
    mat,
    () => mat,
    resolvePhysicalGlassUserParams({ glassOpacity: 1, glassTintHex: '#ff9318' }),
    { baseline: mat.userData.orbyGltfImportBaseline },
  );
  assert.equal(mat.map, null);
  assert.equal(mat.alphaMap, null);
});

test('resolveBaselineColor recovers JSON-cloned Color.toJSON arrays', () => {
  const fromArray = resolveBaselineColor([1, 0.57, 0.09]);
  assert.equal(fromArray?.isColor, true);
  assert.ok(Math.abs(fromArray.r - 1) < 1e-6);
  assert.ok(Math.abs(fromArray.g - 0.57) < 1e-6);
  const fromObj = resolveBaselineColor({ r: 1, g: 0.2, b: 0 });
  assert.equal(fromObj?.isColor, true);
  assert.equal(resolveBaselineColor(null), null);
});

test('isDefaultGlassTintHex matches unused window tint', () => {
  assert.equal(isDefaultGlassTintHex('#080808'), true);
  assert.equal(isDefaultGlassTintHex('#FF9218'), false);
});

test('isImportGlassProtectedFromObjectSliders covers KHR / physical glass only', () => {
  assert.equal(isImportGlassProtectedFromObjectSliders(null), false);
  assert.equal(isImportGlassProtectedFromObjectSliders({ userData: {} }), false);
  assert.equal(
    isImportGlassProtectedFromObjectSliders({
      userData: { orbyGltfPhysicalGlass: true },
    }),
    true,
  );
  assert.equal(
    isImportGlassProtectedFromObjectSliders({
      userData: { orbyGltfTransmissionFallback: true },
    }),
    true,
  );
  assert.equal(
    isImportGlassProtectedFromObjectSliders({
      userData: { orbyGltfImportBaseline: { transmission: 1 } },
    }),
    true,
  );
  assert.equal(
    isImportGlassProtectedFromObjectSliders({
      userData: { orbyGltfImportBaseline: { transmission: 0 } },
    }),
    false,
  );
});

test('import physical glass keeps authored amber instead of default black tint', () => {
  let copied;
  let attenCopied;
  const amber = { isColor: true, r: 1, g: 0.57, b: 0.09 };
  const mat = {
    isMeshPhysicalMaterial: true,
    transmission: 0,
    thickness: 0,
    ior: 1,
    roughness: 1,
    metalness: 1,
    color: {
      copy(c) { copied = c; return this; },
      lerp() { return this; },
      multiplyScalar() { return this; },
    },
    attenuationColor: {
      copy(c) { attenCopied = c; return this; },
      lerp() { return this; },
    },
    specularColor: { setRGB() {} },
    specularIntensity: 0,
    transparent: false,
    opacity: 0.5,
    depthWrite: true,
    side: 0,
    userData: {},
    needsUpdate: false,
  };
  applyImportPhysicalGlassPresentation(
    mat,
    () => mat,
    resolvePhysicalGlassUserParams({ glassOpacity: 0.45, glassTintHex: '#080808' }),
    {
      baseline: { transmission: 1, color: [1, 0.57, 0.09], roughness: 0.2 },
    },
  );
  assert.equal(copied?.isColor, true);
  assert.ok(Math.abs(copied.r - 1) < 1e-6);
  assert.ok(Math.abs(copied.g - 0.57) < 1e-6);
  assert.notEqual(attenCopied, undefined);
  assert.ok(mat.transmission > 0.9);
  assert.ok(mat.attenuationDistance >= 2.4);
});

test('applyPhysicalGlassSurfaceParams maps refraction blur to roughness and clears roughnessMap', () => {
  const mat = {
    transmission: 0,
    thickness: 0,
    ior: 1,
    roughness: 1,
    roughnessMap: { isTexture: true },
    metalness: 1,
    color: { copy() { return this; }, lerp() { return this; }, multiplyScalar() { return this; } },
    attenuationColor: { copy() { return this; }, lerp() { return this; } },
    specularColor: { setRGB() {} },
    specularIntensity: 0,
    transparent: false,
    opacity: 0.5,
    depthWrite: true,
    side: 0,
    userData: {},
    needsUpdate: false,
  };
  applyPhysicalGlassSurfaceParams(
    mat,
    resolvePhysicalGlassUserParams({ glassRefractionBlur: 1 }),
    {},
  );
  assert.ok(mat.roughness >= 0.6);
  assert.equal(mat.roughnessMap, null);
});
