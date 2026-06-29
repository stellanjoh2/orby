import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPhysicalGlassSurfaceParams,
  resolvePhysicalGlassUserParams,
} from './importPhysicalGlassPresentation.js';

test('resolvePhysicalGlassUserParams clamps user glass sliders', () => {
  const params = resolvePhysicalGlassUserParams({
    glassOpacity: 2,
    glassBody: -1,
    glassReflection: 99,
    glassTintHex: '#ff0000',
  });
  assert.equal(params.glassOpacity, 1);
  assert.equal(params.glassBody, 0);
  assert.equal(params.glassReflection, 4);
  assert.equal(params.glassTintHex, '#ff0000');
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
  });
  applyPhysicalGlassSurfaceParams(mat, params, {
    baselineTransmission: 1,
    baselineRoughness: 0.06,
  });
  assert.ok(mat.transmission > 0.5);
  assert.equal(mat.opacity, 1);
  assert.equal(mat.metalness, 0);
  assert.equal(mat.roughness, 0.06);
  assert.equal(mat.userData.orbyGltfPhysicalGlass, true);
  assert.equal(mat.userData.orbyGltfTransmissionFallback, undefined);
});
