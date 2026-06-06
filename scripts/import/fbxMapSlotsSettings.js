import { fbxMaterialGroupKey } from './fbxMaterialReport.js';

/** @typedef {'match-albedo' | 'opengl' | 'directx'} FbxNormalConvention */
/** @typedef {'gltf' | 'unity-hdrp'} FbxOrmPacking */

/**
 * @typedef {Object} FbxMaterialTuning
 * @property {FbxNormalConvention} normalConvention
 * @property {0 | 1} pbrUvChannel
 * @property {FbxOrmPacking} ormPacking
 */

/**
 * @typedef {Object} FbxMapSlotsState
 * @property {boolean} enabled
 * @property {string} activeMaterial
 * @property {FbxMaterialTuning} defaults
 * @property {Record<string, Partial<FbxMaterialTuning>>} materials
 */

export const FBX_NORMAL_CONVENTION_OPTIONS = [
  {
    id: 'match-albedo',
    label: 'Match albedo',
    hint: 'Default for most FBX folder drops — normal V flip follows the base color map.',
  },
  {
    id: 'opengl',
    label: 'OpenGL',
    hint: 'Tangent normals with flipY off — use for maps named Normal_OpenGL.',
  },
  {
    id: 'directx',
    label: 'DirectX',
    hint: 'Invert tangent green (Y) — use when bumps look like dents.',
  },
];

export const FBX_ORM_PACKING_OPTIONS = [
  {
    id: 'gltf',
    label: 'glTF / Blender / Unreal',
    hint: 'Packed ORM: red = AO, green = roughness, blue = metallic.',
  },
  {
    id: 'unity-hdrp',
    label: 'Unity HDRP',
    hint: 'Packed ORM: red = metallic, green = AO, blue = roughness.',
  },
];

/** @type {FbxMaterialTuning} */
export const FBX_MAP_SLOTS_DEFAULT_TUNING = {
  normalConvention: 'match-albedo',
  pbrUvChannel: 0,
  ormPacking: 'gltf',
};

/** @type {Record<FbxOrmPacking, { ao: 'r' | 'g' | 'b', roughness: 'r' | 'g' | 'b', metallic: 'r' | 'g' | 'b' }>} */
export const FBX_ORM_CHANNEL_LAYOUT = {
  gltf: { ao: 'r', roughness: 'g', metallic: 'b' },
  'unity-hdrp': { ao: 'g', roughness: 'b', metallic: 'r' },
};

/**
 * @param {unknown} value
 * @returns {FbxNormalConvention}
 */
export function normalizeFbxNormalConvention(value) {
  if (value === 'opengl' || value === 'directx' || value === 'match-albedo') return value;
  return 'match-albedo';
}

/**
 * @param {unknown} value
 * @returns {FbxOrmPacking}
 */
export function normalizeFbxOrmPacking(value) {
  if (value === 'unity-hdrp' || value === 'gltf') return value;
  return 'gltf';
}

/**
 * @param {unknown} value
 * @returns {0 | 1}
 */
export function normalizeFbxPbrUvChannel(value) {
  return Number(value) === 1 ? 1 : 0;
}

/**
 * @param {Partial<FbxMaterialTuning> | null | undefined} patch
 * @returns {FbxMaterialTuning}
 */
export function mergeFbxMaterialTuning(patch) {
  return {
    normalConvention: normalizeFbxNormalConvention(patch?.normalConvention),
    pbrUvChannel: normalizeFbxPbrUvChannel(patch?.pbrUvChannel),
    ormPacking: normalizeFbxOrmPacking(patch?.ormPacking),
  };
}

/**
 * Merge legacy/global fbxMapSlots state into defaults + per-material overrides.
 * @param {Record<string, unknown> | null | undefined} raw
 * @param {FbxMapSlotsState} [schemaDefaults]
 * @returns {FbxMapSlotsState}
 */
export function normalizeFbxMapSlotsState(raw, schemaDefaults) {
  const d = schemaDefaults?.defaults ?? FBX_MAP_SLOTS_DEFAULT_TUNING;
  const legacyInvert = !!raw?.invertNormalY;
  const defaults = mergeFbxMaterialTuning({
    normalConvention:
      raw?.defaults?.normalConvention ??
      (legacyInvert ? 'directx' : d.normalConvention),
    pbrUvChannel: raw?.defaults?.pbrUvChannel ?? raw?.pbrUvChannel ?? d.pbrUvChannel,
    ormPacking: raw?.defaults?.ormPacking ?? d.ormPacking,
  });

  /** @type {Record<string, Partial<FbxMaterialTuning>>} */
  const materials = {};
  if (raw?.materials && typeof raw.materials === 'object') {
    for (const [key, patch] of Object.entries(raw.materials)) {
      if (!key || !patch || typeof patch !== 'object') continue;
      materials[key] = mergeFbxMaterialTuning(patch);
    }
  }

  return {
    enabled: !!raw?.enabled,
    activeMaterial: typeof raw?.activeMaterial === 'string' ? raw.activeMaterial : '',
    defaults,
    materials,
  };
}

/**
 * @param {FbxMapSlotsState | Record<string, unknown> | null | undefined} state
 * @param {string | null | undefined} materialKey
 * @returns {FbxMaterialTuning}
 */
export function getFbxMaterialTuning(state, materialKey) {
  const normalized = normalizeFbxMapSlotsState(state);
  const key = materialKey && String(materialKey).trim() ? String(materialKey).trim() : '';
  const patch = key ? normalized.materials[key] : null;
  return mergeFbxMaterialTuning({
    ...normalized.defaults,
    ...(patch || {}),
  });
}

/**
 * @param {FbxMapSlotsState} state
 * @param {string} materialKey
 * @param {Partial<FbxMaterialTuning>} patch
 * @returns {FbxMapSlotsState}
 */
export function setFbxMaterialTuning(state, materialKey, patch) {
  const normalized = normalizeFbxMapSlotsState(state);
  const key = String(materialKey || '').trim();
  if (!key) return normalized;
  const prev = getFbxMaterialTuning(normalized, key);
  normalized.materials[key] = mergeFbxMaterialTuning({ ...prev, ...patch });
  return normalized;
}

/**
 * Copy one material's tuning to every listed material key.
 * @param {FbxMapSlotsState} state
 * @param {string[]} materialKeys
 * @param {string} sourceMaterialKey
 */
export function applyFbxTuningToAllMaterials(state, materialKeys, sourceMaterialKey) {
  const normalized = normalizeFbxMapSlotsState(state);
  const source = getFbxMaterialTuning(normalized, sourceMaterialKey);
  for (const key of materialKeys) {
    if (!key) continue;
    normalized.materials[key] = { ...source };
  }
  return normalized;
}

/**
 * @param {string | null | undefined} fileName
 * @returns {FbxNormalConvention | null}
 */
export function inferNormalConventionFromFilename(fileName) {
  const name = String(fileName || '');
  if (/opengl/i.test(name)) return 'opengl';
  if (/directx|normaldx/i.test(name)) return 'directx';
  return null;
}

/**
 * @param {import('three').Material | null | undefined} material
 * @param {FbxNormalConvention} convention
 * @returns {boolean}
 */
export function resolveFbxNormalFlipY(material, convention) {
  const albedoFlipY = material?.map?.isTexture ? material.map.flipY : true;
  if (convention === 'opengl') return false;
  if (convention === 'directx') return albedoFlipY;
  return albedoFlipY;
}

/**
 * @param {FbxNormalConvention} convention
 * @returns {number}
 */
export function resolveFbxNormalScaleY(convention) {
  return convention === 'directx' ? -1 : 1;
}

/**
 * @param {import('three').Material | null | undefined} material
 * @param {FbxMapSlotsState | Record<string, unknown> | null | undefined} state
 * @returns {FbxMaterialTuning}
 */
export function getFbxTuningForImportMaterial(material, state) {
  const normalized = normalizeFbxMapSlotsState(state);
  const key = fbxMaterialGroupKey(material);
  const tuning = getFbxMaterialTuning(normalized, key);
  const fileName = material?.userData?.orbyFbxSlotFileNames?.normal;
  const inferred = inferNormalConventionFromFilename(fileName);
  if (inferred && !normalized.materials[key]) {
    return { ...tuning, normalConvention: inferred };
  }
  return tuning;
}

/**
 * @param {import('three').Material | null | undefined} material
 * @returns {boolean}
 */
export function materialHasPackedFbxOrm(material) {
  const ao = material?.aoMap;
  const rough = material?.roughnessMap;
  const metal = material?.metalnessMap;
  return !!(
    ao?.isTexture &&
    rough === ao &&
    metal === ao &&
    ao.userData?.orbyFbxUserTexture
  );
}
