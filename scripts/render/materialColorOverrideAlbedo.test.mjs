import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  importMaterialUsesAlphaAlbedo,
  resolveColorOverrideAlbedoSlots,
} from './materialColorOverrideAlbedo.js';

describe('resolveColorOverrideAlbedoSlots', () => {
  it('keeps albedo and vertex colors when override is off', () => {
    const map = new THREE.Texture();
    const importMat = { map, vertexColors: true };
    const slots = resolveColorOverrideAlbedoSlots(importMat, false);
    assert.equal(slots.map, map);
    assert.equal(slots.alphaMap, null);
    assert.equal(slots.vertexColors, true);
  });

  it('drops opaque albedo so the override swatch is the base color', () => {
    const map = new THREE.Texture();
    const importMat = { map, vertexColors: true };
    const slots = resolveColorOverrideAlbedoSlots(importMat, true);
    assert.equal(slots.map, null);
    assert.equal(slots.alphaMap, null);
    assert.equal(slots.vertexColors, false);
  });

  it('tints BLEND / MASK / cutout maps instead of replacing them', () => {
    const map = new THREE.Texture();
    const blend = resolveColorOverrideAlbedoSlots(
      { map, userData: { alphaMode: 'BLEND' }, transparent: true },
      true,
    );
    assert.equal(blend.map, map);
    assert.equal(blend.alphaMap, null);

    const cutout = resolveColorOverrideAlbedoSlots(
      { map, alphaTest: 0.5 },
      true,
    );
    assert.equal(cutout.map, map);
    assert.equal(importMaterialUsesAlphaAlbedo({ map, alphaTest: 0.5 }), true);
  });

  it('keeps a dedicated alphaMap and its albedo so the decal stays a tint', () => {
    const map = new THREE.Texture();
    const alphaMap = new THREE.Texture();
    const slots = resolveColorOverrideAlbedoSlots(
      { map, alphaMap, transparent: true },
      true,
    );
    assert.equal(slots.map, map);
    assert.equal(slots.alphaMap, alphaMap);
  });

  it('treats import baseline BLEND as alpha even if live flags look opaque', () => {
    const map = new THREE.Texture();
    const importMat = {
      map,
      transparent: false,
      userData: {
        orbyGltfImportBaseline: { alphaMode: 'BLEND', transparent: true },
      },
    };
    assert.equal(importMaterialUsesAlphaAlbedo(importMat), true);
    assert.equal(resolveColorOverrideAlbedoSlots(importMat, true).map, map);
  });
});
