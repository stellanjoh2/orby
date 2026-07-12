/**
 * KHR_materials_pbrSpecularGlossiness scalar conversion.
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveSpecGlossMaterialParams,
  applySpecGlossDiffuseOnlyRoughnessSlider,
  applySpecGlossMaterialUserData,
  SPEC_GLOSS_DIFFUSE_ONLY_EPSILON,
} from './gltfSpecGlossConversion.js';

describe('resolveSpecGlossMaterialParams', () => {
  it('zero scalar specular without texture is diffuse-only (ignores glossiness)', () => {
    const resolved = resolveSpecGlossMaterialParams({
      specularFactor: [0, 0, 0],
      glossinessFactor: 0.9,
    });

    assert.equal(resolved.diffuseOnly, true);
    assert.equal(resolved.metalness, 0);
    assert.equal(resolved.roughness, 1);
    assert.equal(resolved.specularIntensity, 0);
    assert.equal(resolved.specularColor.r, 0);
    assert.equal(resolved.specularColor.g, 0);
    assert.equal(resolved.specularColor.b, 0);
  });

  it('maps glossiness to roughness when specular is non-zero', () => {
    const resolved = resolveSpecGlossMaterialParams({
      specularFactor: [0.5, 0.5, 0.5],
      glossinessFactor: 0.9,
    });

    assert.equal(resolved.diffuseOnly, false);
    assert.ok(Math.abs(resolved.roughness - 0.1) < 1e-6);
    assert.equal(resolved.specularIntensity, 1);
    assert.ok(resolved.specularColor.r > SPEC_GLOSS_DIFFUSE_ONLY_EPSILON);
  });

  it('zero scalar specular with spec/gloss texture keeps texture-driven specular path', () => {
    const resolved = resolveSpecGlossMaterialParams(
      { specularFactor: [0, 0, 0], glossinessFactor: 0.2 },
      { hasSpecularGlossinessTexture: true },
    );

    assert.equal(resolved.diffuseOnly, false);
    assert.equal(resolved.roughness, 0.8);
    assert.equal(resolved.specularIntensity, 1);
    assert.equal(resolved.specularColor.r, 1);
  });

  it('defaults missing factors like glTF spec/gloss extension', () => {
    const resolved = resolveSpecGlossMaterialParams({});

    assert.equal(resolved.diffuseOnly, false);
    assert.equal(resolved.roughness, 0.04);
    assert.equal(resolved.specularIntensity, 1);
  });
});

describe('applySpecGlossMaterialUserData', () => {
  it('tags diffuse-only spec/gloss materials on userData', () => {
    const material = { userData: {} };
    const tagged = applySpecGlossMaterialUserData(material, {
      specularFactor: [0, 0, 0],
      glossinessFactor: 0.9,
    });
    assert.equal(tagged, true);
    assert.equal(material.userData.orbySpecGlossDiffuseOnly, true);
    assert.equal(material.userData.orbySpecGlossAuthoredGlossiness, 0.9);
  });
});

describe('applySpecGlossDiffuseOnlyRoughnessSlider', () => {
  it('multiplier 1.0 stays matte with specular off', () => {
    const out = applySpecGlossDiffuseOnlyRoughnessSlider(1, 0.9);
    assert.equal(out.roughness, 1);
    assert.equal(out.specularIntensity, 0);
    assert.equal(out.specularColor.r, 0);
  });

  it('lower multiplier reintroduces gloss up to authored glossiness', () => {
    const out = applySpecGlossDiffuseOnlyRoughnessSlider(0, 0.9);
    assert.ok(Math.abs(out.roughness - 0.1) < 1e-6);
    assert.equal(out.specularIntensity, 1);
    assert.equal(out.specularColor.r, 1);
  });

  it('partial multiplier blends matte and authored gloss', () => {
    const out = applySpecGlossDiffuseOnlyRoughnessSlider(0.5, 0.9);
    assert.ok(Math.abs(out.roughness - 0.55) < 1e-6);
    assert.ok(Math.abs(out.specularIntensity - 0.5) < 1e-6);
  });
});
