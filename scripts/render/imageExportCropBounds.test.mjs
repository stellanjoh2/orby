/**
 * Multi-object transparent PNG crop bounds.
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { resolveExportCropWorldBox } from './imageExportCropBounds.js';

function boxMesh(size, position) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size));
  mesh.position.copy(position);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('resolveExportCropWorldBox', () => {
  it('unions every visible root so crop covers multi-object layouts', () => {
    const a = boxMesh(1, new THREE.Vector3(-2, 0, 0));
    const b = boxMesh(1, new THREE.Vector3(2, 0, 0));
    const box = resolveExportCropWorldBox([a, b]);
    assert.ok(box);
    assert.ok(box.min.x < -2);
    assert.ok(box.max.x > 2);
  });

  it('skips hidden roots', () => {
    const a = boxMesh(1, new THREE.Vector3(-2, 0, 0));
    const b = boxMesh(1, new THREE.Vector3(2, 0, 0));
    b.visible = false;
    const box = resolveExportCropWorldBox([a, b]);
    assert.ok(box);
    assert.ok(box.max.x < 1);
  });

  it('falls back to the active model when roots are empty', () => {
    const fallback = boxMesh(2, new THREE.Vector3(0, 0, 0));
    const box = resolveExportCropWorldBox([], fallback);
    assert.ok(box);
    assert.ok(box.getSize(new THREE.Vector3()).x > 1.5);
  });

  it('returns null when nothing is visible', () => {
    assert.equal(resolveExportCropWorldBox([], null), null);
  });
});
