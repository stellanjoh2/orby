import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { createMapChannelPreviewMaterial } from './mapInspectChannelMaterial.js';

describe('createMapChannelPreviewMaterial', () => {
  it('enables skinning and morph targets when requested for animated meshes', () => {
    const texture = new THREE.Texture();
    const material = createMapChannelPreviewMaterial(texture, 'g', {
      skinning: true,
      morphTargets: true,
    });

    assert.equal(material.skinning, true);
    assert.equal(material.morphTargets, true);
    assert.match(material.vertexShader, /skinning_vertex/);
    assert.match(material.vertexShader, /morphtarget_vertex/);
  });
});
