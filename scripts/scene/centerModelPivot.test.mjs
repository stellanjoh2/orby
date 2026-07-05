import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  captureAndApplyCenterPivot,
  centerModelGeometryOnRoot,
  centerFontModelGeometryOnRoot,
  FONT_STUDIO_GRID_CLEARANCE,
} from './centerModelPivot.js';

function makeOffsetModel() {
  const root = new THREE.Group();
  const model = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  );
  mesh.position.set(10, 0, 500);
  model.add(mesh);
  root.add(model);
  root.updateMatrixWorld(true);
  return { root, model, mesh };
}

test('centerModelGeometryOnRoot keeps modelRoot at studio origin', () => {
  const { root, model } = makeOffsetModel();
  const centerBefore = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());

  const delta = centerModelGeometryOnRoot(root, model);
  assert.ok(delta);
  assert.ok(delta.rootDelta.lengthSq() < 1e-12);
  assert.ok(root.position.lengthSq() < 1e-12);

  const centerAfter = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  assert.ok(centerAfter.lengthSq() < 1e-6, 'mesh center should sit on modelRoot origin');
  assert.ok(
    centerBefore.distanceTo(centerAfter) > 100,
    'import centering should move geometry off the authored offset',
  );
});

test('captureAndApplyCenterPivot preserves world placement', () => {
  const { root, model } = makeOffsetModel();
  const centerBefore = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());

  const delta = captureAndApplyCenterPivot(root, model);
  assert.ok(delta);
  assert.ok(delta.rootDelta.lengthSq() > 1);

  const centerAfter = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  assert.ok(centerBefore.distanceTo(centerAfter) < 1e-5);
});

test('centerFontModelGeometryOnRoot centers XZ and lifts bottom above the grid', () => {
  const root = new THREE.Group();
  const model = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 1, 1),
    new THREE.MeshBasicMaterial(),
  );
  mesh.position.set(4, 0.5, -3);
  model.add(mesh);
  root.add(model);
  root.updateMatrixWorld(true);

  const delta = centerFontModelGeometryOnRoot(root, model);
  assert.ok(delta);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(center.x) < 1e-6);
  assert.ok(Math.abs(center.z) < 1e-6);
  assert.ok(Math.abs(box.min.y - FONT_STUDIO_GRID_CLEARANCE) < 1e-6);
});
