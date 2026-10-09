import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { placeAssetBeside } from './placeAssetBeside.js';
import { centerModelGeometryOnRoot } from './centerModelPivot.js';

function makeCenteredAsset(size) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshBasicMaterial(),
  );
  group.add(mesh);
  centerModelGeometryOnRoot(group, mesh);
  group.updateMatrixWorld(true);
  return group;
}

test('placeAssetBeside seats a shorter newcomer on the anchor floor', () => {
  const tall = makeCenteredAsset({ x: 1, y: 2, z: 1 });
  const short = makeCenteredAsset({ x: 1, y: 1, z: 1 });

  const tallFloor = new THREE.Box3().setFromObject(tall).min.y;
  const shortFloorBefore = new THREE.Box3().setFromObject(short).min.y;
  assert.ok(
    shortFloorBefore - tallFloor > 0.4,
    'centered shorter mesh should start above the tall floor',
  );

  placeAssetBeside([tall], short);

  const shortFloorAfter = new THREE.Box3().setFromObject(short).min.y;
  assert.ok(
    Math.abs(shortFloorAfter - tallFloor) < 1e-6,
    `newcomer floor ${shortFloorAfter} should match anchor floor ${tallFloor}`,
  );
  assert.ok(short.position.x > 0, 'newcomer should still park beside on +X');
});
