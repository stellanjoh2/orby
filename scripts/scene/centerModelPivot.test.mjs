import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  captureAndApplyCenterPivot,
  captureAndApplyCenterFontPivot,
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

test('font center after place-beside keeps ink center on the asset group origin', () => {
  const sceneRoot = new THREE.Group();
  const first = new THREE.Group();
  const firstMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.2));
  firstMesh.position.set(1, 0.5, 0);
  first.add(firstMesh);
  sceneRoot.add(first);
  centerFontModelGeometryOnRoot(first, first);

  const second = new THREE.Group();
  const secondModel = new THREE.Group();
  const secondMesh = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 0.2));
  // Left-canonical layout: geometry sits in +X from the model origin.
  secondMesh.position.set(3, 0.5, 0);
  secondModel.add(secondMesh);
  second.add(secondModel);
  sceneRoot.add(second);

  centerFontModelGeometryOnRoot(second, secondModel);
  const occupied = new THREE.Box3().setFromObject(first);
  const neu = new THREE.Box3().setFromObject(second);
  second.position.x += occupied.max.x - neu.min.x + 0.25;
  centerFontModelGeometryOnRoot(second, secondModel);

  const center = new THREE.Box3().setFromObject(secondModel).getCenter(new THREE.Vector3());
  const local = second.worldToLocal(center.clone());
  assert.ok(Math.abs(local.x) < 1e-5, `expected X center on group, got ${local.x}`);
  assert.ok(Math.abs(local.z) < 1e-5, `expected Z center on group, got ${local.z}`);
});

test('font center is idempotent on a rotated asset pivot', () => {
  const pivot = new THREE.Group();
  pivot.rotation.set(0.2, 0.5, -0.15);
  pivot.position.set(1.2, 0.4, -0.8);
  const model = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 0.3));
  mesh.position.set(2, 0.5, 0);
  model.add(mesh);
  pivot.add(model);
  pivot.updateMatrixWorld(true);

  centerFontModelGeometryOnRoot(pivot, model);
  const posAfterFirst = model.position.clone();
  centerFontModelGeometryOnRoot(pivot, model);
  assert.ok(
    posAfterFirst.distanceTo(model.position) < 1e-5,
    `re-center must not drift on rotated pivots (delta ${posAfterFirst.distanceTo(model.position)})`,
  );
});

test('centering a second font asset does not move the first asset group', () => {
  const sceneRoot = new THREE.Group();
  const first = new THREE.Group();
  const firstModel = new THREE.Group();
  const firstMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.2));
  firstMesh.position.set(1, 0.5, 0);
  firstModel.add(firstMesh);
  first.add(firstModel);
  sceneRoot.add(first);
  centerFontModelGeometryOnRoot(first, firstModel);
  const firstGroupBefore = first.position.clone();
  const firstModelBefore = firstModel.position.clone();

  const second = new THREE.Group();
  const secondModel = new THREE.Group();
  const secondMesh = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 0.2));
  secondMesh.position.set(2, 0.5, 0);
  secondModel.add(secondMesh);
  second.add(secondModel);
  sceneRoot.add(second);
  centerFontModelGeometryOnRoot(second, secondModel);
  second.position.x = 3;

  assert.ok(first.position.distanceTo(firstGroupBefore) < 1e-9);
  assert.ok(firstModel.position.distanceTo(firstModelBefore) < 1e-9);
});

test('captureAndApplyCenterFontPivot keeps world ink center while fixing local pivot', () => {
  const pivot = new THREE.Group();
  pivot.position.set(2.5, 0.1, -0.4);
  const model = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 0.3));
  mesh.position.set(2, 0.5, 0);
  model.add(mesh);
  pivot.add(model);
  pivot.updateMatrixWorld(true);

  const centerBefore = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  const delta = captureAndApplyCenterFontPivot(pivot, model);
  assert.ok(delta);
  assert.ok(delta.rootDelta.lengthSq() > 0);

  const centerAfter = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  assert.ok(
    centerBefore.distanceTo(centerAfter) < 1e-5,
    `world ink must stay put (delta ${centerBefore.distanceTo(centerAfter)})`,
  );

  const localCenter = pivot.worldToLocal(centerAfter.clone());
  assert.ok(Math.abs(localCenter.x) < 1e-5, `expected local X ~0, got ${localCenter.x}`);
  assert.ok(Math.abs(localCenter.z) < 1e-5, `expected local Z ~0, got ${localCenter.z}`);
});
