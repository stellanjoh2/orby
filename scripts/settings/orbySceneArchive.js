import { arrayBufferToBase64, fileFromEmbeddedAsset } from '../utils/binaryAsset.js';
import { normalizeModifiersState } from '../state/defaults/modifierDefaults.js';
import { findBakeableShapeLibraryEntry } from '../shapeLibrary/shapeLibraryCatalog.js';

export const ORBY_ASSET_KIND_FILE = 'file';
export const ORBY_ASSET_KIND_SHAPE = 'shape-library';
export const ORBY_ASSET_KIND_FONT = 'font-extrude';

/**
 * @param {unknown} payload
 * @returns {boolean}
 */
export function isOrbyScenePayload(payload) {
  if (!payload || payload.type !== 'orby-scene' || !payload.sceneSettings) return false;
  return isOrbyAssetLoadable(payload.asset);
}

/**
 * @param {unknown} asset
 * @returns {boolean}
 */
export function isOrbyAssetLoadable(asset) {
  if (!asset || typeof asset !== 'object') return false;
  if (asset.kind === ORBY_ASSET_KIND_FONT) return true;
  if (asset.kind === ORBY_ASSET_KIND_SHAPE) {
    return !!asset.dataBase64 || !!asset.shapeId;
  }
  return !!asset.dataBase64;
}

/**
 * @param {File} file
 * @returns {Promise<{ name: string, type: string, lastModified: number, dataBase64: string, kind: string }>}
 */
export async function fileToEmbeddedAsset(file) {
  const buffer = await file.arrayBuffer();
  return {
    kind: ORBY_ASSET_KIND_FILE,
    name: file.name || 'model',
    type: file.type || '',
    lastModified: file.lastModified || Date.now(),
    dataBase64: arrayBufferToBase64(buffer),
  };
}

/**
 * @param {{ name?: string, type?: string, lastModified?: number, dataBase64?: string } | null | undefined} asset
 * @param {string} [fallbackName]
 * @returns {File | null}
 */
export function embeddedAssetToFile(asset, fallbackName = 'model.glb') {
  const file = fileFromEmbeddedAsset(asset, fallbackName);
  if (!file) return null;
  if (asset?.lastModified) {
    return new File([file], file.name, {
      type: file.type,
      lastModified: asset.lastModified,
    });
  }
  return file;
}

/**
 * @param {string} text
 * @returns {string}
 */
export function orbyFontAssetName(text) {
  const slug = String(text || '')
    .trim()
    .slice(0, 40)
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'text';
}

/**
 * @param {string | null | undefined} shapeId
 * @returns {Promise<{ kind: string, shapeId: string, name?: string, type?: string, dataBase64?: string } | null>}
 */
export async function embedShapeLibraryAsset(shapeId) {
  const id = String(shapeId || '').trim();
  if (!id) return null;
  const entry = findBakeableShapeLibraryEntry(id);
  const asset = {
    kind: ORBY_ASSET_KIND_SHAPE,
    shapeId: id,
    name: `${id}.glb`,
    type: 'model/gltf-binary',
  };
  if (!entry?.glbUrl) return asset;
  try {
    const response = await fetch(entry.glbUrl);
    if (!response.ok) return asset;
    const buffer = await response.arrayBuffer();
    asset.dataBase64 = arrayBufferToBase64(buffer);
    return asset;
  } catch {
    return asset;
  }
}

/**
 * @param {unknown} shapeLibrary
 * @returns {{ panelOpen: boolean, meshModifiers: Record<string, ReturnType<typeof normalizeModifiersState>> }}
 */
export function normalizeShapeLibraryState(shapeLibrary) {
  const meshModifiers = {};
  const raw =
    shapeLibrary?.meshModifiers && typeof shapeLibrary.meshModifiers === 'object'
      ? shapeLibrary.meshModifiers
      : {};
  for (const [id, modifiers] of Object.entries(raw)) {
    if (!id) continue;
    meshModifiers[id] = normalizeModifiersState(modifiers);
  }
  return {
    panelOpen: !!shapeLibrary?.panelOpen,
    meshModifiers,
  };
}

/**
 * Tag a loaded GLB as a Shape Library mesh so modifiers / material UI treat it as one.
 * @param {import('three').Object3D | null | undefined} model
 * @param {string | null | undefined} shapeId
 */
export function applyShapeLibraryUserData(model, shapeId) {
  const id = String(shapeId || '').trim();
  if (!model || !id) return;
  model.userData.orbyShapeLibrary = true;
  model.userData.orbyShapeLibraryId = id;
}

/**
 * @param {{ kind?: string, name?: string, shapeId?: string } | null | undefined} asset
 * @returns {string}
 */
export function orbyDownloadBaseName(asset) {
  if (asset?.kind === ORBY_ASSET_KIND_FONT) {
    return orbyFontAssetName(asset.name);
  }
  if (asset?.kind === ORBY_ASSET_KIND_SHAPE) {
    return String(asset.shapeId || asset.name || 'shape').replace(/\.[^/.]+$/, '');
  }
  return String(asset?.name || 'scene').replace(/\.[^/.]+$/, '');
}
