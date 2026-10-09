import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  normalizeImportScale,
  resolveSharedImportScaleFactor,
} from './normalizeImportScale.js';

function boxMesh(size) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshBasicMaterial(),
  );
}

test('normalizeImportScale scaleFactor reuses a shared multiplier', () => {
  const mesh = boxMesh({ x: 0.5, y: 0.5, z: 0.5 });
  const result = normalizeImportScale(mesh, { scaleFactor: 4 });
  assert.equal(result.scaleFactor, 4);
  assert.equal(result.skipped, false);
  mesh.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 2) < 1e-5);
  assert.equal(mesh.userData.orbyImportNormalization.shared, true);
});

test('resolveSharedImportScaleFactor returns the first mesh import factor', () => {
  const chicken = boxMesh({ x: 1, y: 1, z: 1 });
  chicken.userData.orbyImportNormalization = { scaleFactor: 3.85, skipped: false };
  const deer = boxMesh({ x: 1, y: 1, z: 1 });
  deer.userData.orbyImportNormalization = { scaleFactor: 1, skipped: true };

  assert.equal(
    resolveSharedImportScaleFactor([{ mesh: chicken }, { mesh: deer }]),
    3.85,
  );
});

test('resolveSharedImportScaleFactor skips font and svg assets', () => {
  const font = boxMesh({ x: 1, y: 1, z: 1 });
  font.userData.orbyFontGenerated = true;
  font.userData.orbyImportNormalization = { scaleFactor: 9, skipped: false };
  const svg = boxMesh({ x: 1, y: 1, z: 1 });
  svg.userData.orbyImportNormalization = { scaleFactor: 8, skipped: false };
  const glb = boxMesh({ x: 1, y: 1, z: 1 });
  glb.userData.orbyImportNormalization = { scaleFactor: 1.5, skipped: false };

  assert.equal(
    resolveSharedImportScaleFactor([
      { mesh: font },
      { mesh: svg, isSvgExtrudeModel: true },
      { mesh: glb },
    ]),
    1.5,
  );
});
