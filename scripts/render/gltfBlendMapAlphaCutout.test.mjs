/**
 * BLEND + baseColor map alpha cutout classification.
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyBlendMapAlphaCutout,
  classifyBlendMapAlphaSamples,
  revertBlendMapAlphaCutout,
  sampleRasterAlphaNormalized,
  shouldPromoteBlendMapToAlphaCutout,
  shouldProvisionallyCutoutUnknownBlendMap,
  GLTF_BLEND_MAP_SOFT_ALPHA_FRACTION,
} from './gltfBlendMapAlphaCutout.js';

function rgbaPixels(pairs) {
  const out = new Uint8Array(pairs.length * 4);
  for (let i = 0; i < pairs.length; i += 1) {
    const [r, g, b, a] = pairs[i];
    const o = i * 4;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = a;
  }
  return out;
}

describe('classifyBlendMapAlphaSamples', () => {
  it('treats bimodal atlas padding as cutout (Porsche-style interior)', () => {
    const samples = [];
    for (let i = 0; i < 260; i += 1) samples.push(0);
    for (let i = 0; i < 740; i += 1) samples.push(1);
    assert.equal(classifyBlendMapAlphaSamples(samples), 'cutout');
  });

  it('keeps soft gradients as soft (hair / fur)', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i / 99);
    assert.equal(classifyBlendMapAlphaSamples(samples), 'soft');
  });

  it('returns unknown for empty input', () => {
    assert.equal(classifyBlendMapAlphaSamples([]), 'unknown');
  });

  it('allows a thin soft fringe under the soft fraction cap', () => {
    const total = 1000;
    const midCount = Math.floor(total * GLTF_BLEND_MAP_SOFT_ALPHA_FRACTION);
    const samples = Array.from({ length: total }, (_, i) => (i < midCount ? 0.5 : 1));
    assert.equal(classifyBlendMapAlphaSamples(samples), 'cutout');
  });
});

describe('sampleRasterAlphaNormalized', () => {
  it('samples alpha from RGBA rasters using width and height', () => {
    const data = rgbaPixels([
      [0, 0, 0, 0],
      [255, 255, 255, 255],
      [10, 10, 10, 10],
      [200, 200, 200, 200],
    ]);
    const samples = sampleRasterAlphaNormalized(data, 2, 2, 4, 2);
    assert.ok(samples.length > 0);
    assert.ok(samples.every((a) => a >= 0 && a <= 1));
  });

  it('samples non-square atlases without out-of-bounds indices', () => {
    const width = 8;
    const height = 32;
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      const o = i * 4;
      data[o + 3] = i % 5 === 0 ? 0 : 255;
    }
    const samples = sampleRasterAlphaNormalized(data, width, height, 4, 8);
    assert.equal(samples.length, 64);
    assert.ok(samples.every((a) => Number.isFinite(a)));
  });
});

describe('shouldPromoteBlendMapToAlphaCutout', () => {
  it('promotes near-opaque BLEND + cutout map materials', () => {
    const material = {
      isMeshStandardMaterial: true,
      transparent: true,
      opacity: 1,
      alphaTest: 0,
      map: { isTexture: true },
      userData: { alphaMode: 'BLEND' },
    };
    assert.equal(shouldPromoteBlendMapToAlphaCutout(material, 'cutout'), true);
  });

  it('skips soft-profile maps', () => {
    const material = {
      isMeshStandardMaterial: true,
      transparent: true,
      opacity: 1,
      alphaTest: 0,
      map: { isTexture: true },
      userData: { alphaMode: 'BLEND' },
    };
    assert.equal(shouldPromoteBlendMapToAlphaCutout(material, 'soft'), false);
  });

  it('skips low-opacity BLEND draws', () => {
    const material = {
      isMeshStandardMaterial: true,
      transparent: true,
      opacity: 0.5,
      alphaTest: 0,
      map: { isTexture: true },
      userData: { alphaMode: 'BLEND' },
    };
    assert.equal(shouldPromoteBlendMapToAlphaCutout(material, 'cutout'), false);
  });

  it('promotes houseplant-style bimodal atlas padding as cutout', () => {
    // ~2% mid-alpha fringe, rest binary — matches Sketchfab foliage cards.
    const samples = [];
    for (let i = 0; i < 610; i += 1) samples.push(0);
    for (let i = 0; i < 20; i += 1) samples.push(0.5);
    for (let i = 0; i < 370; i += 1) samples.push(1);
    assert.equal(classifyBlendMapAlphaSamples(samples), 'cutout');
    const material = {
      isMeshStandardMaterial: true,
      transparent: true,
      opacity: 1,
      alphaTest: 0,
      map: { isTexture: true },
      userData: { alphaMode: 'BLEND' },
    };
    assert.equal(shouldPromoteBlendMapToAlphaCutout(material, 'cutout'), true);
  });
});

describe('shouldProvisionallyCutoutUnknownBlendMap', () => {
  it('provisionally cutouts unread BLEND + map so foliage punches on first frame', () => {
    const material = {
      isMeshStandardMaterial: true,
      transparent: true,
      opacity: 1,
      alphaTest: 0,
      map: { isTexture: true },
      userData: { alphaMode: 'BLEND' },
    };
    assert.equal(shouldProvisionallyCutoutUnknownBlendMap(material, 'unknown'), true);
    assert.equal(shouldProvisionallyCutoutUnknownBlendMap(material, 'soft'), false);
  });
});

describe('applyBlendMapAlphaCutout / revertBlendMapAlphaCutout', () => {
  it('promotes then restores baseline for soft refine', () => {
    const material = {
      isMeshStandardMaterial: true,
      transparent: true,
      opacity: 1,
      alphaTest: 0,
      depthWrite: false,
      alphaHash: false,
      userData: {},
      needsUpdate: false,
    };
    const baseline = {
      transparent: true,
      opacity: 1,
      depthWrite: false,
      alphaTest: 0,
      alphaHash: false,
    };
    applyBlendMapAlphaCutout(material);
    assert.equal(material.transparent, false);
    assert.ok(material.alphaTest > 0);
    assert.equal(material.depthWrite, true);
    assert.equal(material.userData.orbyBlendMitigation, 'alphaTest');
    revertBlendMapAlphaCutout(material, baseline);
    assert.equal(material.transparent, true);
    assert.equal(material.alphaTest, 0);
    assert.equal(material.depthWrite, false);
    assert.equal(material.userData.orbyBlendMitigation, undefined);
  });
});
