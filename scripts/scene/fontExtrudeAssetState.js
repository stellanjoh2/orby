import {
  DEFAULT_MATERIAL_BRIGHTNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_MATERIAL_SATURATION,
} from '../constants.js';
import {
  fontExtrudeTwoToneActive,
  resolveFontExtrudeSideColor,
} from '../import/fontExtrudeTwoTone.js';
import { deepClone } from '../utils/deepClone.js';

/**
 * @param {import('three').Object3D | null | undefined} mesh
 */
function isFontGeneratedMesh(mesh) {
  return !!(mesh?.userData?.orbyFontGenerated || mesh?.userData?.orbyFontExtrude);
}

/**
 * Clean Mesh material slice for a newly generated 3D text.
 * Prevents inheriting a prior GLB/session `metalness: 1` into Type Creator assets.
 * @param {object} [overrides]
 */
export function buildFontExtrudeMaterialBaseline(overrides = {}) {
  return {
    brightness: DEFAULT_MATERIAL_BRIGHTNESS,
    saturation: DEFAULT_MATERIAL_SATURATION,
    metalness: 0,
    roughness: DEFAULT_MATERIAL_ROUGHNESS,
    emissive: 0,
    importHasMrMaps: false,
    importUsesAuthoredPbr: false,
    importIsSpecGloss: false,
    surfacePreset: 'none',
    surfaceScale: 1,
    surfaceStrength: 1,
    surfaceEligible: true,
    colorOverride: false,
    overrideColor: '#ffffff',
    colorOverrideEligible: false,
    hasImportAlbedoMaps: false,
    surfaceEnabled: false,
    surfaceLastPreset: 'galvanizedSteel',
    ...overrides,
  };
}

/**
 * @param {string | null | undefined} hex
 */
function normalizeHexKey(hex) {
  if (typeof hex !== 'string') return '';
  const t = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(t)) return t;
  if (/^#[0-9a-f]{3}$/.test(t)) {
    return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
  }
  return t;
}

/**
 * @param {import('three').Object3D | null | undefined} mesh
 * @returns {{ fill: string | null, extrude: string | null }}
 */
export function readMeshFontColors(mesh) {
  let fill = null;
  let extrude = null;
  mesh?.traverse?.((child) => {
    if (!child.isMesh || !child.userData?.orbyFontExtrude) return;
    if (!fill) {
      if (typeof child.userData.orbyFontCapColor === 'string') {
        fill = child.userData.orbyFontCapColor;
      } else if (typeof child.userData.orbySvgBaseColor === 'string') {
        // Importer stamps base color even when two-tone cap fields are absent.
        fill = child.userData.orbySvgBaseColor;
      }
    }
    if (!extrude && typeof child.userData.orbyFontExtrudeColor === 'string') {
      extrude = child.userData.orbyFontExtrudeColor;
    }
  });
  if (!extrude) extrude = fill;
  return { fill, extrude };
}

/**
 * Per-mesh Type Creator snapshot so drafting the next text does not overwrite
 * the previous generated object's parked settings.
 * @param {import('three').Object3D | null | undefined} mesh
 * @param {{ fontExtrude?: object, svgExtrude?: object } | null | undefined} state
 */
export function stampFontExtrudeAssetSettings(mesh, state) {
  if (!mesh?.userData || !state) return;
  const fontExtrude = state.fontExtrude ? deepClone(state.fontExtrude) : null;
  const svgExtrude = state.svgExtrude ? deepClone(state.svgExtrude) : null;
  if (!fontExtrude && !svgExtrude) return;
  if (typeof mesh.userData.orbyFontSourceText === 'string' && fontExtrude) {
    fontExtrude.sourceText = mesh.userData.orbyFontSourceText;
  }
  syncFontExtrudeStampColorsFromMesh(fontExtrude, mesh);
  mesh.userData.orbyFontAssetSettings = {
    fontExtrude,
    svgExtrude,
  };
}

/**
 * Keep stamped face/extrude colors aligned with what is on the glyph meshes.
 * @param {object | null | undefined} fontExtrude
 * @param {import('three').Object3D | null | undefined} mesh
 */
export function syncFontExtrudeStampColorsFromMesh(fontExtrude, mesh) {
  if (!fontExtrude || !mesh) return;
  const { fill, extrude } = readMeshFontColors(mesh);
  if (fill) fontExtrude.fillColor = fill;
  if (extrude) fontExtrude.extrudeColor = extrude;
  if (fill && extrude && fontExtrudeTwoToneActive(fill, extrude)) {
    fontExtrude.extrudeColorEnabled = true;
  }
}

/**
 * @param {import('three').Object3D | null | undefined} mesh
 * @param {{ fontExtrude?: object, svgExtrude?: object } | null | undefined} fallback
 */
export function readFontExtrudeAssetSettings(mesh, fallback = null) {
  const stamped = mesh?.userData?.orbyFontAssetSettings;
  if (stamped?.fontExtrude) {
    const out = {
      fontExtrude: deepClone(stamped.fontExtrude),
      svgExtrude: stamped.svgExtrude ? deepClone(stamped.svgExtrude) : deepClone(fallback?.svgExtrude),
    };
    syncFontExtrudeStampColorsFromMesh(out.fontExtrude, mesh);
    if (typeof mesh.userData?.orbyFontSourceText === 'string') {
      out.fontExtrude.sourceText = mesh.userData.orbyFontSourceText;
    }
    return out;
  }
  if (!fallback?.fontExtrude) return null;
  const fontExtrude = deepClone(fallback.fontExtrude);
  if (typeof mesh?.userData?.orbyFontSourceText === 'string') {
    fontExtrude.sourceText = mesh.userData.orbyFontSourceText;
  }
  syncFontExtrudeStampColorsFromMesh(fontExtrude, mesh);
  return {
    fontExtrude,
    svgExtrude: fallback.svgExtrude ? deepClone(fallback.svgExtrude) : undefined,
  };
}

/**
 * When the live Type Creator draft no longer matches this mesh, park/restore
 * the mesh's own settings instead of another object's draft.
 * Same sourceText alone is not enough — two "Hello" objects must stay isolated.
 * @param {object} slice
 * @param {import('three').Object3D | null | undefined} mesh
 * @param {object | null | undefined} [parkedSlice] previously parked asset state
 */
export function reconcileFontExtrudeSliceForMesh(slice, mesh, parkedSlice = null) {
  if (!slice || !isFontGeneratedMesh(mesh)) return slice;
  const meshText = mesh.userData?.orbyFontSourceText;
  if (typeof meshText !== 'string') return slice;

  const liveText = slice.fontExtrude?.sourceText;
  const stamp = mesh.userData?.orbyFontAssetSettings;
  const meshColors = readMeshFontColors(mesh);
  const liveFill = normalizeHexKey(slice.fontExtrude?.fillColor);
  // Effective side color — toggle-off keeps the picker value but mesh sides match face.
  const liveSide = normalizeHexKey(
    resolveFontExtrudeSideColor(slice.fontExtrude, slice.fontExtrude?.fillColor),
  );
  const meshFill = normalizeHexKey(meshColors.fill);
  const meshSide = normalizeHexKey(meshColors.extrude || meshColors.fill);
  // Missing glyph colors are unknown — never treat as a match. Otherwise drafting
  // text #2's fill while parking text #1 stamps the draft onto the wrong object.
  const liveColorsMatchMesh =
    !!meshFill
    && liveFill === meshFill
    && liveSide === meshSide;

  // Accept live only when it targets this mesh (same text + colors already on glyphs).
  // Same sourceText with different colors is another object's draft — keep the stamp.
  if (liveText === meshText && liveColorsMatchMesh) {
    if (slice.fontExtrude) {
      if (meshColors.fill) slice.fontExtrude.fillColor = meshColors.fill;
      if (meshColors.extrude) slice.fontExtrude.extrudeColor = meshColors.extrude;
      if (
        meshColors.fill
        && meshColors.extrude
        && fontExtrudeTwoToneActive(meshColors.fill, meshColors.extrude)
      ) {
        slice.fontExtrude.extrudeColorEnabled = true;
      }
    }
    stampFontExtrudeAssetSettings(mesh, slice);
    return slice;
  }

  const parked =
    parkedSlice?.fontExtrude?.sourceText === meshText
      ? {
          fontExtrude: parkedSlice.fontExtrude,
          svgExtrude: parkedSlice.svgExtrude,
        }
      : stamp?.fontExtrude
        ? {
            fontExtrude: stamp.fontExtrude,
            svgExtrude: stamp.svgExtrude,
          }
        : null;
  const resolved = readFontExtrudeAssetSettings(mesh, parked || slice);
  if (!resolved?.fontExtrude) return slice;
  slice.fontExtrude = resolved.fontExtrude;
  if (resolved.svgExtrude) slice.svgExtrude = resolved.svgExtrude;
  stampFontExtrudeAssetSettings(mesh, slice);
  return slice;
}

/**
 * @param {import('three').Object3D | null | undefined} mesh
 * @param {string} fillHex
 * @param {string} extrudeHex
 */
export function meshFontColorsMatch(mesh, fillHex, extrudeHex) {
  const { fill, extrude } = readMeshFontColors(mesh);
  if (!fill) return false;
  const side = extrude || fill;
  return (
    normalizeHexKey(fill) === normalizeHexKey(fillHex)
    && normalizeHexKey(side) === normalizeHexKey(extrudeHex)
  );
}

/**
 * Owned typography/document for a generated font mesh.
 * Stamp wins — the live StateStore must not restyle a peer.
 * @param {import('three').Object3D | null | undefined} mesh
 * @returns {object | null}
 */
export function readOwnedFontExtrude(mesh) {
  const stamp = mesh?.userData?.orbyFontAssetSettings?.fontExtrude;
  return stamp && typeof stamp === 'object' ? stamp : null;
}

/**
 * Write the live Object-menu Type Creator + material slice onto the active font
 * mesh. Call after every user edit and after mirroring an asset into the store.
 * @param {import('three').Object3D | null | undefined} mesh
 * @param {{ fontExtrude?: object, svgExtrude?: object, material?: object } | null | undefined} state
 */
export function commitFontAssetDocument(mesh, state) {
  if (!isFontGeneratedMesh(mesh) || !state) return;
  stampFontExtrudeAssetSettings(mesh, state);
  if (state.material && typeof state.material === 'object') {
    mesh.userData.orbyFontMaterialSettings = deepClone(state.material);
  }
}

/**
 * Commit only when the live store is clearly editing this mesh (same sourceText
 * + glyph colors). Drafting the next Generate must not rewrite a peer stamp.
 * @param {import('three').Object3D | null | undefined} mesh
 * @param {{ fontExtrude?: object, svgExtrude?: object, material?: object } | null | undefined} state
 * @returns {boolean}
 */
export function commitFontAssetDocumentIfOwned(mesh, state) {
  if (!isFontGeneratedMesh(mesh) || !state?.fontExtrude) return false;
  const meshText = mesh.userData?.orbyFontSourceText;
  if (typeof meshText !== 'string' || state.fontExtrude.sourceText !== meshText) {
    return false;
  }
  const fill = state.fontExtrude.fillColor;
  const side = resolveFontExtrudeSideColor(state.fontExtrude, fill);
  if (!meshFontColorsMatch(mesh, fill, side)) return false;
  commitFontAssetDocument(mesh, state);
  return true;
}

/**
 * Object-menu slice must mirror the mesh stamp — never a peer's parked draft.
 * @param {object} slice
 * @param {import('three').Object3D | null | undefined} mesh
 */
export function hydrateObjectSliceFromFontStamp(slice, mesh) {
  if (!slice || !isFontGeneratedMesh(mesh)) return slice;
  const stamp = mesh.userData?.orbyFontAssetSettings;
  if (stamp?.fontExtrude) {
    slice.fontExtrude = deepClone(stamp.fontExtrude);
    syncFontExtrudeStampColorsFromMesh(slice.fontExtrude, mesh);
    if (typeof mesh.userData?.orbyFontSourceText === 'string') {
      slice.fontExtrude.sourceText = mesh.userData.orbyFontSourceText;
    }
    if (stamp.svgExtrude) slice.svgExtrude = deepClone(stamp.svgExtrude);
  }
  if (mesh.userData?.orbyFontMaterialSettings) {
    slice.material = deepClone(mesh.userData.orbyFontMaterialSettings);
  }
  return slice;
}

/**
 * Typography settings for a bound font mesh.
 * Owned stamp is authoritative. Fall back to `liveFontExtrude` only when this
 * mesh has no stamp yet (pre-generate draft / legacy).
 * @param {import('three').Object3D | null | undefined} mesh
 * @param {object | null | undefined} liveFontExtrude
 */
export function resolveFontExtrudeForMesh(mesh, liveFontExtrude = null) {
  const owned = readOwnedFontExtrude(mesh);
  if (owned) return owned;
  return liveFontExtrude && typeof liveFontExtrude === 'object' ? liveFontExtrude : {};
}
