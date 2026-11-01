import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  preserveExtrudeGroupOnRebuild,
  replaceExtrudeGroupChildren,
} from './extrudeGroupRebuild.js';

function makeMeshGroup(name = 'mesh') {
  const group = new THREE.Group();
  group.name = name;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 0.2),
    new THREE.MeshBasicMaterial(),
  );
  group.add(mesh);
  return group;
}

test('replaceExtrudeGroupChildren keeps live transform and runtime userData', () => {
  const live = makeMeshGroup('Generated Text');
  live.position.set(1.5, 0.04, -0.8);
  live.scale.set(2, 2, 2);
  live.rotation.y = 0.3;
  live.userData.orbyFontGenerated = true;
  live.userData.orbyAssetId = 'asset-1';
  live.userData.orbyPivotCenterDelta = {
    modelDelta: new THREE.Vector3(-0.5, 0, 0.2),
    rootDelta: new THREE.Vector3(),
  };
  live.userData.orbyFontAssetSettings = { fontExtrude: { tracking: 8 } };
  live.userData.orbySvgExtrudeDepth = 0.2;

  const rebuilt = makeMeshGroup('Generated Text');
  rebuilt.userData.orbySvgExtrude = true;
  rebuilt.userData.orbyFontExtrude = true;
  rebuilt.userData.orbySvgExtrudeDepth = 0.55;
  rebuilt.userData.orbyFontGlyphCount = 3;

  replaceExtrudeGroupChildren(live, rebuilt);

  assert.deepEqual(live.position.toArray(), [1.5, 0.04, -0.8]);
  assert.deepEqual(live.scale.toArray(), [2, 2, 2]);
  assert.ok(Math.abs(live.rotation.y - 0.3) < 1e-9);
  assert.equal(live.userData.orbyFontGenerated, true);
  assert.equal(live.userData.orbyAssetId, 'asset-1');
  assert.equal(live.userData.orbyFontAssetSettings.fontExtrude.tracking, 8);
  assert.equal(live.userData.orbySvgExtrudeDepth, 0.55);
  assert.equal(live.userData.orbyFontGlyphCount, 3);
  assert.equal(live.userData.orbySvgExtrude, true);
  assert.equal(live.children.length, 1);
  assert.ok(live.userData.orbyPivotCenterDelta);
});

test('preserveExtrudeGroupOnRebuild returns the same group identity', () => {
  const live = makeMeshGroup('live');
  live.position.set(3, 0, 0);
  live.userData.orbyAssetId = 'keep-me';
  const rebuilt = makeMeshGroup('rebuilt');
  rebuilt.userData.orbySvgExtrudeDepth = 1;

  const result = preserveExtrudeGroupOnRebuild(live, rebuilt);
  assert.equal(result, live);
  assert.equal(live.position.x, 3);
  assert.equal(live.userData.orbyAssetId, 'keep-me');
  assert.equal(live.userData.orbySvgExtrudeDepth, 1);
});
