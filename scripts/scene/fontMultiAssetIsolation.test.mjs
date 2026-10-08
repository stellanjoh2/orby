import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  buildFontExtrudeMaterialBaseline,
  commitFontAssetDocument,
  commitFontAssetDocumentIfOwned,
  hydrateObjectSliceFromFontStamp,
  reconcileFontExtrudeSliceForMesh,
  stampFontExtrudeAssetSettings,
  readMeshFontColors,
  meshFontColorsMatch,
  resolveFontExtrudeForMesh,
} from './fontExtrudeAssetState.js';
import {
  captureAndApplyCenterFontPivot,
  centerFontModelGeometryOnRoot,
} from './centerModelPivot.js';

function makeFontMesh(sourceText, fill = '#ffffff', extrude = '#009bed') {
  const group = new THREE.Group();
  group.userData.orbyFontGenerated = true;
  group.userData.orbyFontExtrude = true;
  group.userData.orbyFontSourceText = sourceText;
  const glyph = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
  glyph.userData.orbyFontExtrude = true;
  glyph.userData.orbyFontCapColor = fill;
  glyph.userData.orbyFontExtrudeColor = extrude;
  group.add(glyph);
  return group;
}

/**
 * Mirror of FontTextRevealController._canMutateBoundFromLiveStore —
 * store-driven restyle is only legal when bound === focused.
 */
function canMutateBoundFromLiveStore(bound, focused, handoffDepth = 0) {
  if (!bound) return false;
  if (handoffDepth > 0) return bound === focused;
  return bound === focused;
}

test('new font material baseline never inherits session metalness', () => {
  const mat = buildFontExtrudeMaterialBaseline();
  assert.equal(mat.metalness, 0);
  assert.equal(mat.emissive, 0);
  assert.equal(mat.importUsesAuthoredPbr, false);
  assert.equal(mat.importHasMrMaps, false);
  assert.ok(mat.roughness > 0);
});

test('select handoff: peer cannot consume the next asset store', () => {
  const peer = makeFontMesh('Hello', '#ff0000', '#0000ff');
  const focused = makeFontMesh('Hello2', '#00ff00', '#880000');
  // After park, bound is null — material callbacks must no-op.
  assert.equal(canMutateBoundFromLiveStore(null, focused, 1), false);
  // Mid-handoff still holding peer while store already mirrors focused — freeze.
  assert.equal(canMutateBoundFromLiveStore(peer, focused, 1), false);
  // After bind(focused), store apply is legal.
  assert.equal(canMutateBoundFromLiveStore(focused, focused, 1), true);
  assert.equal(canMutateBoundFromLiveStore(focused, focused, 0), true);
  // Idle with wrong bind must never apply.
  assert.equal(canMutateBoundFromLiveStore(peer, focused, 0), false);
});

test('parking draft for text B does not recolor parked text A', () => {
  const a = makeFontMesh('Hello', '#ff0000', '#111111');
  stampFontExtrudeAssetSettings(a, {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#ff0000',
      extrudeColor: '#111111',
      tracking: 0,
    },
  });
  const liveForB = {
    fontExtrude: {
      sourceText: 'Hello2',
      fillColor: '#00ff00',
      extrudeColor: '#222222',
      tracking: 12,
      metalnessLeak: true,
    },
  };
  reconcileFontExtrudeSliceForMesh(liveForB, a, null);
  assert.equal(liveForB.fontExtrude.sourceText, 'Hello');
  assert.equal(liveForB.fontExtrude.fillColor, '#ff0000');
  assert.equal(liveForB.fontExtrude.extrudeColor, '#111111');
  assert.equal(a.userData.orbyFontAssetSettings.fontExtrude.fillColor, '#ff0000');
  const colors = readMeshFontColors(a);
  assert.equal(colors.fill, '#ff0000');
});

test('meshFontColorsMatch keeps select from repainting an already-correct peer', () => {
  const mesh = makeFontMesh('Hello2', '#ff0000', '#222fc6');
  assert.equal(meshFontColorsMatch(mesh, '#ff0000', '#222fc6'), true);
  assert.equal(meshFontColorsMatch(mesh, '#00ff00', '#222fc6'), false);
});

test('promote-to-per-asset keeps the first font mesh world position', () => {
  // Mirrors SceneObjectsController.promoteToPerAssetTransforms for a font mesh
  // that was centered on modelRoot (local offset) before a second text arrives.
  const modelRoot = new THREE.Group();
  modelRoot.position.set(0.4, 0.1, -0.2);
  const mesh = new THREE.Group();
  mesh.userData.orbyFontGenerated = true;
  const glyph = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.2));
  glyph.position.set(1, 0.5, 0);
  mesh.add(glyph);
  // Simulated centerFont offset on the model.
  mesh.position.set(-1, -0.5 + 0.04, 0);
  modelRoot.add(mesh);
  modelRoot.updateMatrixWorld(true);
  const before = mesh.getWorldPosition(new THREE.Vector3());

  const rootPos = modelRoot.position.clone();
  const rootQuat = modelRoot.quaternion.clone();
  const rootScale = modelRoot.scale.clone();
  modelRoot.remove(mesh);
  modelRoot.position.set(0, 0, 0);
  modelRoot.quaternion.identity();
  modelRoot.scale.set(1, 1, 1);

  const group = new THREE.Group();
  group.position.copy(rootPos);
  group.quaternion.copy(rootQuat);
  group.scale.copy(rootScale);
  group.add(mesh);
  modelRoot.add(group);
  group.updateMatrixWorld(true);

  const after = mesh.getWorldPosition(new THREE.Vector3());
  assert.ok(
    before.distanceTo(after) < 1e-5,
    `first text must not jump on promote (delta ${before.distanceTo(after)})`,
  );
});

test('ownership: select mirror hydrates from stamp, never peer objectState', () => {
  const a = makeFontMesh('Hello', '#ff0000', '#111111');
  const b = makeFontMesh('Hello2', '#00ff00', '#222222');
  commitFontAssetDocument(a, {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#ff0000',
      extrudeColor: '#111111',
      tracking: 4,
    },
    material: buildFontExtrudeMaterialBaseline({ metalness: 0 }),
  });
  commitFontAssetDocument(b, {
    fontExtrude: {
      sourceText: 'Hello2',
      fillColor: '#00ff00',
      extrudeColor: '#222222',
      tracking: 9,
    },
    material: buildFontExtrudeMaterialBaseline({ metalness: 0, brightness: 0.6 }),
  });

  // Polluted parked state as if the store leaked B onto A's objectState.
  const aSlice = {
    fontExtrude: deepCloneLike(b.userData.orbyFontAssetSettings.fontExtrude),
    material: { metalness: 1, brightness: 0, roughness: 0.2 },
  };
  hydrateObjectSliceFromFontStamp(aSlice, a);
  assert.equal(aSlice.fontExtrude.sourceText, 'Hello');
  assert.equal(aSlice.fontExtrude.tracking, 4);
  assert.equal(aSlice.material.metalness, 0);

  // Reveal-style resolve must read A's stamp even if live store is B.
  const liveB = b.userData.orbyFontAssetSettings.fontExtrude;
  assert.equal(resolveFontExtrudeForMesh(a, liveB).tracking, 4);
  assert.equal(commitFontAssetDocumentIfOwned(a, { fontExtrude: liveB }), false);
  assert.equal(a.userData.orbyFontAssetSettings.fontExtrude.tracking, 4);
});

function deepCloneLike(value) {
  return JSON.parse(JSON.stringify(value));
}

test('world-preserving font pivot recenter does not jump ink between two assets', () => {
  const sceneRoot = new THREE.Group();
  const aPivot = new THREE.Group();
  aPivot.position.set(0, 0, 0);
  const aModel = new THREE.Group();
  const aMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.2));
  aMesh.position.set(1, 0.5, 0);
  aModel.add(aMesh);
  aPivot.add(aModel);
  sceneRoot.add(aPivot);
  captureAndApplyCenterFontPivot(aPivot, aModel);
  const aCenter = new THREE.Box3().setFromObject(aModel).getCenter(new THREE.Vector3());
  const aPivotBefore = aPivot.position.clone();

  const bPivot = new THREE.Group();
  bPivot.position.set(3, 0.1, -0.5);
  const bModel = new THREE.Group();
  const bMesh = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.2));
  bMesh.position.set(1.5, 0.5, 0);
  bModel.add(bMesh);
  bPivot.add(bModel);
  sceneRoot.add(bPivot);
  sceneRoot.updateMatrixWorld(true);
  const bCenterBefore = new THREE.Box3().setFromObject(bModel).getCenter(new THREE.Vector3());
  captureAndApplyCenterFontPivot(bPivot, bModel);
  const bCenterAfter = new THREE.Box3().setFromObject(bModel).getCenter(new THREE.Vector3());

  // Peer A must stay put while B's pivot is corrected.
  assert.ok(aPivot.position.distanceTo(aPivotBefore) < 1e-9);
  const aCenterAfter = new THREE.Box3().setFromObject(aModel).getCenter(new THREE.Vector3());
  assert.ok(aCenter.distanceTo(aCenterAfter) < 1e-5);
  // B ink stays in place in XZ (font Y uses grid clearance, not AABB center).
  assert.ok(Math.abs(bCenterBefore.x - bCenterAfter.x) < 1e-5);
  assert.ok(Math.abs(bCenterBefore.z - bCenterAfter.z) < 1e-5);
});

/**
 * Mirrors SceneObjectsController.commitActive font branch after the fix:
 * hydrate from stamp, then commit — never prefer the live draft.
 * Before Add-to-Scene the live store already holds text B's draft (often same
 * sourceText + colors as A); that must not rewrite A's stamp.
 */
function commitActiveFontBranch(mesh, liveStore) {
  const slice = {
    fontExtrude: deepCloneLike(liveStore.fontExtrude),
    svgExtrude: liveStore.svgExtrude ? deepCloneLike(liveStore.svgExtrude) : undefined,
    material: liveStore.material
      ? deepCloneLike(liveStore.material)
      : buildFontExtrudeMaterialBaseline(),
  };
  hydrateObjectSliceFromFontStamp(slice, mesh);
  commitFontAssetDocument(mesh, slice);
  return slice;
}

test('commitActive must not park text-B draft onto text-A stamp', () => {
  // A is in the scene. User drafts another "Hello" (same fill) with different
  // tracking + metalness, then Add to Scene. attachAdditionalAsset calls
  // commitActive() BEFORE writing B's overlay.
  const a = makeFontMesh('Hello', '#ff0000', '#111111');
  commitFontAssetDocument(a, {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#ff0000',
      extrudeColor: '#111111',
      tracking: 4,
    },
    material: buildFontExtrudeMaterialBaseline({ metalness: 0, brightness: 1 }),
  });

  const liveDraftForB = {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#ff0000',
      extrudeColor: '#111111',
      tracking: 40,
    },
    material: buildFontExtrudeMaterialBaseline({ metalness: 1, brightness: 0.35 }),
  };

  const parked = commitActiveFontBranch(a, liveDraftForB);

  assert.equal(
    a.userData.orbyFontAssetSettings.fontExtrude.tracking,
    4,
    'A stamp tracking must stay 4 — live B draft must not win on same text+colors',
  );
  assert.equal(
    a.userData.orbyFontMaterialSettings.metalness,
    0,
    'A stamp metalness must stay 0 — B draft metalness 1 must not park onto A',
  );
  assert.equal(a.userData.orbyFontMaterialSettings.brightness, 1);
  assert.equal(parked.fontExtrude.tracking, 4);
  assert.equal(parked.material.metalness, 0);
});

test('promote + placeBeside + preserveWorld finalize keeps peer world pos and material', () => {
  const modelRoot = new THREE.Group();
  modelRoot.position.set(0.4, 0.1, -0.2);

  const aMesh = new THREE.Group();
  aMesh.userData.orbyFontGenerated = true;
  const aGlyph = new THREE.Mesh(
    new THREE.BoxGeometry(2, 1, 0.2),
    new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0, roughness: 0.45 }),
  );
  aGlyph.position.set(1, 0.5, 0);
  aMesh.add(aGlyph);
  aMesh.position.set(-1, -0.5 + 0.04, 0);
  modelRoot.add(aMesh);
  modelRoot.updateMatrixWorld(true);
  const aWorldBefore = aMesh.getWorldPosition(new THREE.Vector3());
  const aMetalBefore = aGlyph.material.metalness;

  // promoteToPerAssetTransforms
  const rootPos = modelRoot.position.clone();
  const rootQuat = modelRoot.quaternion.clone();
  const rootScale = modelRoot.scale.clone();
  modelRoot.remove(aMesh);
  modelRoot.position.set(0, 0, 0);
  modelRoot.quaternion.identity();
  modelRoot.scale.set(1, 1, 1);
  const aPivot = new THREE.Group();
  aPivot.position.copy(rootPos);
  aPivot.quaternion.copy(rootQuat);
  aPivot.scale.copy(rootScale);
  aPivot.add(aMesh);
  modelRoot.add(aPivot);
  aPivot.updateMatrixWorld(true);
  const afterPromote = aMesh.getWorldPosition(new THREE.Vector3());
  if (afterPromote.distanceTo(aWorldBefore) > 1e-5) {
    aPivot.position.add(aWorldBefore.clone().sub(afterPromote));
  }

  // beginAdditionalAsset + placeBeside + preserveWorld finalize for B
  const bMesh = new THREE.Group();
  bMesh.userData.orbyFontGenerated = true;
  const bGlyph = new THREE.Mesh(
    new THREE.BoxGeometry(3, 1, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x00ff00, metalness: 0, roughness: 0.45 }),
  );
  bGlyph.position.set(1.5, 0.5, 0);
  bMesh.add(bGlyph);
  const bPivot = new THREE.Group();
  bPivot.add(bMesh);
  modelRoot.add(bPivot);
  centerFontModelGeometryOnRoot(bPivot, bMesh);

  // Inline of objectAssetState.placeAssetBeside (avoid CDN import chain via Svg ops).
  bPivot.updateMatrixWorld(true);
  const newcomers = new THREE.Box3().setFromObject(bPivot);
  const occupied = new THREE.Box3();
  aPivot.updateMatrixWorld(true);
  occupied.expandByObject(aPivot);
  const occupiedSize = occupied.getSize(new THREE.Vector3());
  const newcomerSize = newcomers.getSize(new THREE.Vector3());
  const gap = Math.max(0.25, Math.min(occupiedSize.x, newcomerSize.x) * 0.2);
  bPivot.position.x += occupied.max.x - newcomers.min.x + gap;

  captureAndApplyCenterFontPivot(bPivot, bMesh);

  const aWorldAfter = aMesh.getWorldPosition(new THREE.Vector3());
  assert.ok(
    aWorldBefore.distanceTo(aWorldAfter) < 1e-5,
    `peer A world pos must not move (delta ${aWorldBefore.distanceTo(aWorldAfter)})`,
  );
  assert.equal(aGlyph.material.metalness, aMetalBefore);

  // Footgun: applying B's parked xOffset onto A's pivot (wrong transform target).
  const bX = bPivot.position.x;
  aPivot.position.x = bX;
  const jumped = aMesh.getWorldPosition(new THREE.Vector3());
  assert.ok(
    aWorldBefore.distanceTo(jumped) > 0.5,
    'sanity: wrong-target applyState would move A — select must never do this',
  );
});
