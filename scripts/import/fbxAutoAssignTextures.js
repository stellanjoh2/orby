import { fbxMaterialGroupKey } from './fbxMaterialReport.js';

/** @typedef {'albedo' | 'normal' | 'roughness' | 'metallic' | 'occlusion' | 'orm' | 'emissive' | 'opacity' | 'displacement'} FbxMapSlot */

/**
 * Common DCC / Substance export suffixes → Orby Map Slots.
 * Longer suffixes are matched first (e.g. `Normal_OpenGL` before `Normal`).
 */
const MAP_SUFFIX_RULES = [
  { slot: 'normal', suffixes: ['normal_opengl', 'normal_directx', 'normaldx', 'normal'] },
  { slot: 'albedo', suffixes: ['basecolor', 'base_color', 'albedo', 'diffuse', 'color'] },
  { slot: 'metallic', suffixes: ['metallic', 'metalness', 'metal'] },
  { slot: 'roughness', suffixes: ['roughness', 'rough'] },
  { slot: 'occlusion', suffixes: ['ambientocclusion', 'occlusion', 'ao'] },
  { slot: 'orm', suffixes: ['orm', 'occlusionroughnessmetallic'] },
  { slot: 'emissive', suffixes: ['emissive', 'emission'] },
  { slot: 'opacity', suffixes: ['opacity', 'alpha', 'transparency'] },
  { slot: 'displacement', suffixes: ['displacement', 'height'] },
];

const SUFFIX_MATCHERS = MAP_SUFFIX_RULES.flatMap((rule) =>
  rule.suffixes.map((suffix) => ({ slot: rule.slot, suffix })),
).sort((a, b) => b.suffix.length - a.suffix.length);

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'tif',
  'tiff',
  'bmp',
]);

const SLOT_TEXTURE_PROPS = {
  albedo: 'map',
  normal: 'normalMap',
  roughness: 'roughnessMap',
  metallic: 'metalnessMap',
  occlusion: 'aoMap',
  emissive: 'emissiveMap',
  opacity: 'alphaMap',
  displacement: 'displacementMap',
};

/**
 * @param {string} value
 */
export function normalizeFbxMaterialMatchKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, '');
}

/**
 * @param {string} filename
 * @returns {{ materialPrefix: string, slot: FbxMapSlot } | null}
 */
export function parseFbxTextureFilename(filename) {
  const base = String(filename || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/\.[^.]+$/, '');
  if (!base) return null;

  const lower = base.toLowerCase();
  for (const { slot, suffix } of SUFFIX_MATCHERS) {
    const needle = `_${suffix}`;
    if (!lower.endsWith(needle)) continue;
    const prefix = base.slice(0, base.length - needle.length).trim();
    if (prefix.length > 0) {
      return { materialPrefix: prefix, slot };
    }
  }
  return null;
}

/**
 * @param {string} prefix
 * @param {string[]} materialKeys
 * @returns {string | null}
 */
export function matchTexturePrefixToMaterialKey(prefix, materialKeys) {
  const candidates = materialKeys.filter((key) => key && key !== '__unnamed__');
  if (!candidates.length) return null;

  const trimmed = String(prefix || '').trim();
  const lower = trimmed.toLowerCase();
  const normalized = normalizeFbxMaterialMatchKey(trimmed);

  for (const key of candidates) {
    if (key === trimmed) return key;
  }
  for (const key of candidates) {
    if (key.toLowerCase() === lower) return key;
  }
  for (const key of candidates) {
    if (normalizeFbxMaterialMatchKey(key) === normalized) return key;
  }
  return null;
}

/**
 * @param {import('three').Material | null | undefined} mat
 * @param {FbxMapSlot} slot
 */
function materialHasSlotTexture(mat, slot) {
  if (!mat) return false;
  if (slot === 'orm') {
    return !!(
      mat.aoMap?.isTexture ||
      mat.roughnessMap?.isTexture ||
      mat.metalnessMap?.isTexture
    );
  }
  const prop = SLOT_TEXTURE_PROPS[slot];
  return !!(prop && mat[prop]?.isTexture);
}

/**
 * @param {import('three').Object3D} root
 * @param {WeakMap<import('three').Mesh, import('three').Material | import('three').Material[]>} [originalMaterials]
 * @returns {Map<string, Set<FbxMapSlot>>}
 */
export function collectFbxMaterialFilledSlots(root, originalMaterials) {
  /** @type {Map<string, Set<FbxMapSlot>>} */
  const filled = new Map();

  root?.traverse?.((child) => {
    if (!child?.isMesh) return;
    const stored = originalMaterials?.get?.(child);
    const mats = stored
      ? Array.isArray(stored)
        ? stored
        : [stored]
      : Array.isArray(child.material)
        ? child.material
        : [child.material];

    for (const mat of mats) {
      if (!mat) continue;
      const key = fbxMaterialGroupKey(mat);
      if (!filled.has(key)) filled.set(key, new Set());
      const slots = filled.get(key);
      for (const slot of Object.keys(SLOT_TEXTURE_PROPS)) {
        if (materialHasSlotTexture(mat, slot)) slots.add(slot);
      }
      if (materialHasSlotTexture(mat, 'orm')) slots.add('orm');
    }
  });

  return filled;
}

/**
 * @param {Array<{ file: File, path?: string }> | File[]} bundleFiles
 * @param {string[]} materialKeys
 * @param {import('three').Object3D} root
 * @param {WeakMap<import('three').Mesh, import('three').Material | import('three').Material[]>} [originalMaterials]
 * @returns {Array<{ materialKey: string, slot: FbxMapSlot, file: File }>}
 */
export function buildFbxAutoAssignPlan(bundleFiles, materialKeys, root, originalMaterials) {
  const filledByMaterial = collectFbxMaterialFilledSlots(root, originalMaterials);
  /** @type {Map<string, { materialKey: string, slot: FbxMapSlot, file: File }>} */
  const planByKey = new Map();

  for (const entry of bundleFiles || []) {
    const file = entry instanceof File ? entry : entry?.file;
    if (!(file instanceof File)) continue;

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!IMAGE_EXTENSIONS.has(ext)) continue;

    const parsed = parseFbxTextureFilename(file.name);
    if (!parsed) continue;

    const materialKey = matchTexturePrefixToMaterialKey(parsed.materialPrefix, materialKeys);
    if (!materialKey) continue;

    const filled = filledByMaterial.get(materialKey);
    if (filled?.has(parsed.slot)) continue;

    // Separate metallic/roughness/occlusion maps beat assigning a second ORM when all three exist.
    if (parsed.slot === 'orm' && filled) {
      const hasSplitOrm = ['roughness', 'metallic', 'occlusion'].every((s) => filled.has(s));
      if (hasSplitOrm) continue;
    }
    if (parsed.slot !== 'orm' && filled?.has('orm')) continue;

    const dedupeKey = `${materialKey}\0${parsed.slot}`;
    if (!planByKey.has(dedupeKey)) {
      planByKey.set(dedupeKey, {
        materialKey,
        slot: parsed.slot,
        file,
      });
    }
  }

  return [...planByKey.values()].sort(
    (a, b) =>
      a.materialKey.localeCompare(b.materialKey) || a.slot.localeCompare(b.slot),
  );
}
