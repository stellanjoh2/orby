import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  buildFontExtrudeMaterialBaseline,
  commitFontAssetDocument,
  commitFontAssetDocumentIfOwned,
  hydrateObjectSliceFromFontStamp,
  readOwnedFontExtrude,
  reconcileFontExtrudeSliceForMesh,
  resolveFontExtrudeForMesh,
  stampFontExtrudeAssetSettings,
} from './fontExtrudeAssetState.js';

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

test('parking while drafting another text keeps the mesh sourceText and colors', () => {
  const mesh = makeFontMesh('Hello', '#eeeeee', '#112233');
  stampFontExtrudeAssetSettings(mesh, {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#eeeeee',
      extrudeColor: '#112233',
      postscriptName: 'Mattone-Regular',
    },
    svgExtrude: { enabled: true, depth: 0.2 },
  });

  const slice = {
    fontExtrude: {
      sourceText: "What's up",
      fillColor: '#ffcbcb',
      extrudeColor: '#009bed',
      postscriptName: 'Mattone-Regular',
    },
    svgExtrude: { enabled: true, depth: 0.5 },
  };

  reconcileFontExtrudeSliceForMesh(slice, mesh, null);
  assert.equal(slice.fontExtrude.sourceText, 'Hello');
  assert.equal(slice.fontExtrude.fillColor, '#eeeeee');
  assert.equal(slice.fontExtrude.extrudeColor, '#112233');
  assert.equal(slice.fontExtrude.extrudeColorEnabled, true);
  assert.equal(slice.svgExtrude.depth, 0.2);
});

test('live edits applied to the mesh (matching colors) update the stamp', () => {
  const mesh = makeFontMesh('Hello', '#aaaaaa', '#0000ff');
  stampFontExtrudeAssetSettings(mesh, {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#aaaaaa',
      extrudeColor: '#0000ff',
      tracking: 0,
    },
  });

  const slice = {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#aaaaaa',
      extrudeColor: '#0000ff',
      tracking: 12,
    },
  };

  reconcileFontExtrudeSliceForMesh(slice, mesh, null);
  assert.equal(slice.fontExtrude.tracking, 12);
  assert.equal(mesh.userData.orbyFontAssetSettings.fontExtrude.tracking, 12);
});

test('two meshes with the same sourceText keep separate stamps', () => {
  const a = makeFontMesh('Hello', '#ff0000', '#0000ff');
  stampFontExtrudeAssetSettings(a, {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#ff0000',
      extrudeColor: '#0000ff',
      tracking: 0,
    },
  });

  // Draft for another "Hello" with different colors must not overwrite A.
  const liveForB = {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#00ff00',
      extrudeColor: '#880000',
      tracking: 8,
    },
  };
  reconcileFontExtrudeSliceForMesh(liveForB, a, null);
  assert.equal(liveForB.fontExtrude.fillColor, '#ff0000');
  assert.equal(liveForB.fontExtrude.extrudeColor, '#0000ff');
  assert.equal(liveForB.fontExtrude.tracking, 0);
  assert.equal(a.userData.orbyFontAssetSettings.fontExtrude.tracking, 0);
});

test('polluted parked state falls back to mesh sourceText without a stamp', () => {
  const mesh = makeFontMesh('Hello', '#cccccc', '#334455');
  const slice = {
    fontExtrude: {
      sourceText: "What's up",
      fillColor: '#ffcbcb',
      extrudeColor: '#009bed',
    },
  };
  const parked = {
    fontExtrude: {
      sourceText: "What's up",
      fillColor: '#ffcbcb',
      extrudeColor: '#009bed',
    },
  };

  reconcileFontExtrudeSliceForMesh(slice, mesh, parked);
  assert.equal(slice.fontExtrude.sourceText, 'Hello');
  assert.equal(slice.fontExtrude.fillColor, '#cccccc');
  assert.equal(slice.fontExtrude.extrudeColor, '#334455');
});

test('missing cap fields still read orbySvgBaseColor so draft fill cannot overwrite', () => {
  const mesh = makeFontMesh('Hello', '#eeeeee', '#112233');
  mesh.traverse((child) => {
    if (!child.isMesh) return;
    delete child.userData.orbyFontCapColor;
    delete child.userData.orbyFontExtrudeColor;
    child.userData.orbySvgBaseColor = '#eeeeee';
  });
  stampFontExtrudeAssetSettings(mesh, {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#eeeeee',
      extrudeColor: '#eeeeee',
      tracking: 0,
    },
  });

  const slice = {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#ff0000',
      extrudeColor: '#00ff00',
      tracking: 9,
    },
  };
  reconcileFontExtrudeSliceForMesh(slice, mesh, null);
  assert.equal(slice.fontExtrude.fillColor, '#eeeeee');
  assert.equal(slice.fontExtrude.tracking, 0);
});

test('same sourceText without a stamp still rejects a mismatched live draft', () => {
  const mesh = makeFontMesh('Hello', '#aaaaaa', '#bbbbbb');
  const slice = {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#ff0000',
      extrudeColor: '#00ff00',
      tracking: 4,
    },
  };
  reconcileFontExtrudeSliceForMesh(slice, mesh, null);
  assert.equal(slice.fontExtrude.fillColor, '#aaaaaa');
  assert.equal(slice.fontExtrude.extrudeColor, '#bbbbbb');
});

test('owned stamp is source of truth; live store is draft fallback only', () => {
  const mesh = makeFontMesh('Hello', '#ff0000', '#0000ff');
  stampFontExtrudeAssetSettings(mesh, {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#ff0000',
      extrudeColor: '#0000ff',
      tracking: 3,
    },
  });
  const live = {
    sourceText: 'Other',
    fillColor: '#00ff00',
    extrudeColor: '#880000',
    tracking: 99,
  };
  assert.equal(resolveFontExtrudeForMesh(mesh, live).tracking, 3);
  assert.equal(readOwnedFontExtrude(mesh).tracking, 3);
});

test('commitIfOwned rejects drafting another text onto the focused mesh stamp', () => {
  const mesh = makeFontMesh('Hello', '#ff0000', '#111111');
  stampFontExtrudeAssetSettings(mesh, {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#ff0000',
      extrudeColor: '#111111',
      tracking: 0,
    },
  });
  const drafted = {
    fontExtrude: {
      sourceText: 'Hello2',
      fillColor: '#00ff00',
      extrudeColor: '#222222',
      tracking: 12,
    },
    material: buildFontExtrudeMaterialBaseline({ metalness: 1 }),
  };
  assert.equal(commitFontAssetDocumentIfOwned(mesh, drafted), false);
  assert.equal(mesh.userData.orbyFontAssetSettings.fontExtrude.tracking, 0);
  assert.equal(mesh.userData.orbyFontMaterialSettings, undefined);
});

test('commitIfOwned writes typography + material when store owns the mesh', () => {
  const mesh = makeFontMesh('Hello', '#ff0000', '#111111');
  const state = {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#ff0000',
      extrudeColor: '#111111',
      tracking: 8,
    },
    material: buildFontExtrudeMaterialBaseline({ metalness: 0, roughness: 0.4 }),
  };
  assert.equal(commitFontAssetDocumentIfOwned(mesh, state), true);
  assert.equal(mesh.userData.orbyFontAssetSettings.fontExtrude.tracking, 8);
  assert.equal(mesh.userData.orbyFontMaterialSettings.metalness, 0);
  assert.equal(mesh.userData.orbyFontMaterialSettings.roughness, 0.4);
});

test('commitIfOwned uses effective side color when Extrude color toggle is off', () => {
  // Mesh sides match face; picker still holds a leftover contrasting extrude hex.
  const mesh = makeFontMesh('Hello', '#ff0000', '#ff0000');
  stampFontExtrudeAssetSettings(mesh, {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#ff0000',
      extrudeColor: '#ff0000',
      extrudeColorEnabled: false,
      tracking: 0,
    },
  });
  const state = {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#ff0000',
      extrudeColor: '#00aaff',
      extrudeColorEnabled: false,
      tracking: 14,
    },
    material: buildFontExtrudeMaterialBaseline(),
  };
  assert.equal(commitFontAssetDocumentIfOwned(mesh, state), true);
  assert.equal(mesh.userData.orbyFontAssetSettings.fontExtrude.tracking, 14);
});

test('hydrateObjectSliceFromFontStamp prefers mesh document over polluted objectState', () => {
  const mesh = makeFontMesh('Hello', '#ff0000', '#111111');
  commitFontAssetDocument(mesh, {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#ff0000',
      extrudeColor: '#111111',
      tracking: 5,
    },
    material: buildFontExtrudeMaterialBaseline({ metalness: 0 }),
  });
  const slice = {
    fontExtrude: {
      sourceText: 'Polluted',
      fillColor: '#00ff00',
      extrudeColor: '#00ff00',
      tracking: 99,
    },
    material: { metalness: 1, brightness: 0, roughness: 0.2 },
  };
  hydrateObjectSliceFromFontStamp(slice, mesh);
  assert.equal(slice.fontExtrude.sourceText, 'Hello');
  assert.equal(slice.fontExtrude.tracking, 5);
  assert.equal(slice.material.metalness, 0);
});

test('peer stamp stays frozen while another asset document is committed', () => {
  const a = makeFontMesh('Hello', '#ff0000', '#111111');
  const b = makeFontMesh('Hello2', '#00ff00', '#222222');
  commitFontAssetDocument(a, {
    fontExtrude: {
      sourceText: 'Hello',
      fillColor: '#ff0000',
      extrudeColor: '#111111',
      tracking: 1,
    },
    material: buildFontExtrudeMaterialBaseline({ metalness: 0 }),
  });
  commitFontAssetDocument(b, {
    fontExtrude: {
      sourceText: 'Hello2',
      fillColor: '#00ff00',
      extrudeColor: '#222222',
      tracking: 2,
    },
    material: buildFontExtrudeMaterialBaseline({ metalness: 0, brightness: 0.5 }),
  });
  // Edit B's document — A must not change.
  commitFontAssetDocument(b, {
    fontExtrude: {
      sourceText: 'Hello2',
      fillColor: '#00ff00',
      extrudeColor: '#222222',
      tracking: 20,
    },
    material: buildFontExtrudeMaterialBaseline({ metalness: 0.2 }),
  });
  assert.equal(a.userData.orbyFontAssetSettings.fontExtrude.tracking, 1);
  assert.equal(a.userData.orbyFontMaterialSettings.metalness, 0);
  assert.equal(b.userData.orbyFontAssetSettings.fontExtrude.tracking, 20);
  assert.equal(b.userData.orbyFontMaterialSettings.metalness, 0.2);
});
