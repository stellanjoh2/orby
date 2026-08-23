import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyShapeLibraryUserData,
  isOrbyAssetLoadable,
  isOrbyScenePayload,
  normalizeShapeLibraryState,
  orbyDownloadBaseName,
  orbyFontAssetName,
  ORBY_ASSET_KIND_FILE,
  ORBY_ASSET_KIND_FONT,
  ORBY_ASSET_KIND_SHAPE,
} from './orbySceneArchive.js';
import {
  collectAppliedFbxMapSlots,
  isFbxSidecarTextureName,
  textureForFbxMapSlot,
} from './orbyFbxMapAssets.js';

test('isOrbyScenePayload accepts legacy file archives', () => {
  assert.equal(
    isOrbyScenePayload({
      type: 'orby-scene',
      sceneSettings: { hdri: 'beach' },
      asset: { dataBase64: 'abc', name: 'mesh.glb' },
    }),
    true,
  );
  assert.equal(isOrbyAssetLoadable({ dataBase64: 'abc' }), true);
  assert.equal(isOrbyAssetLoadable({ kind: ORBY_ASSET_KIND_FILE }), false);
});

test('isOrbyScenePayload accepts font-extrude archives without mesh bytes', () => {
  assert.equal(
    isOrbyScenePayload({
      type: 'orby-scene',
      sceneSettings: { fontExtrude: { sourceText: 'Hi' } },
      asset: { kind: ORBY_ASSET_KIND_FONT, name: 'Hi' },
    }),
    true,
  );
});

test('isOrbyScenePayload accepts shape-library archives by id or embedded glb', () => {
  assert.equal(
    isOrbyAssetLoadable({ kind: ORBY_ASSET_KIND_SHAPE, shapeId: 'cube' }),
    true,
  );
  assert.equal(
    isOrbyAssetLoadable({ kind: ORBY_ASSET_KIND_SHAPE, dataBase64: 'abc' }),
    true,
  );
  assert.equal(
    isOrbyAssetLoadable({ kind: ORBY_ASSET_KIND_SHAPE }),
    false,
  );
  assert.equal(isOrbyScenePayload({ type: 'orby-scene', sceneSettings: {} }), false);
});

test('orby download names stay filename-safe', () => {
  assert.equal(orbyFontAssetName('Hello World!'), 'Hello-World');
  assert.equal(orbyFontAssetName('   '), 'text');
  assert.equal(orbyDownloadBaseName({ kind: ORBY_ASSET_KIND_FONT, name: 'Type Logo' }), 'Type-Logo');
  assert.equal(orbyDownloadBaseName({ kind: ORBY_ASSET_KIND_SHAPE, shapeId: 'pipe' }), 'pipe');
  assert.equal(orbyDownloadBaseName({ name: 'hero.glb' }), 'hero');
});

test('normalizeShapeLibraryState restores per-shape modifier cache', () => {
  const next = normalizeShapeLibraryState({
    panelOpen: true,
    meshModifiers: {
      cube: { bend: { amount: 0.4 }, twist: { amount: 0 } },
    },
  });
  assert.equal(next.panelOpen, true);
  assert.equal(next.meshModifiers.cube.bend.amount, 0.4);
  assert.equal(next.meshModifiers.cube.bend.enabled, true);
  assert.equal(next.meshModifiers.cube.twist.enabled, false);
  assert.equal(next.meshModifiers.cube.taper.amount, 0);
});

test('FBX sidecar names keep image maps and drop the mesh', () => {
  assert.equal(isFbxSidecarTextureName('body_BaseColor.png'), true);
  assert.equal(isFbxSidecarTextureName('folder/Normal.jpg'), true);
  assert.equal(isFbxSidecarTextureName('car.fbx'), false);
  assert.equal(isFbxSidecarTextureName('notes.txt'), false);
});

test('applyShapeLibraryUserData tags the loaded root', () => {
  const model = { userData: {} };
  applyShapeLibraryUserData(model, 'cube');
  assert.equal(model.userData.orbyShapeLibrary, true);
  assert.equal(model.userData.orbyShapeLibraryId, 'cube');
  applyShapeLibraryUserData(model, '  ');
  assert.equal(model.userData.orbyShapeLibraryId, 'cube');
});

test('collectAppliedFbxMapSlots reads user textures from slot file names', () => {
  const albedo = {
    isTexture: true,
    userData: { orbyFbxUserTexture: true, orbyFbxFileName: 'body.png' },
  };
  const material = {
    name: 'Body',
    map: albedo,
    userData: { orbyFbxSlotFileNames: { albedo: 'body.png' } },
  };
  const model = {
    traverse(fn) {
      fn({ isMesh: true, material });
    },
  };
  const slots = collectAppliedFbxMapSlots(model);
  assert.equal(slots.length, 1);
  assert.equal(slots[0].materialKey, 'Body');
  assert.equal(slots[0].slot, 'albedo');
  assert.equal(slots[0].fileName, 'body.png');
  assert.equal(textureForFbxMapSlot(material, 'albedo'), albedo);
});
