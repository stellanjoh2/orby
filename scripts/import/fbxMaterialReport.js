import { MAP_TEXTURE_SLOT_DEFS, getOrmPackForMaterial } from '../render/mapInspectTypes.js';

/** @typedef {'ok' | 'partial' | 'untextured'} FbxMaterialStatus */

/**
 * @typedef {Object} FbxMaterialSlotInfo
 * @property {boolean} baseColor
 * @property {boolean} normal
 * @property {boolean} orm
 * @property {boolean} emissive
 */

/**
 * @typedef {Object} FbxMaterialEntry
 * @property {string} name
 * @property {string} key
 * @property {number} meshCount
 * @property {FbxMaterialStatus} status
 * @property {FbxMaterialSlotInfo} slots
 */

const UNNAMED_MATERIAL_KEY = '__unnamed__';

/**
 * @param {import('three').Material | null | undefined} mat
 * @returns {string}
 */
export function fbxMaterialGroupKey(mat) {
  const name = mat?.name && String(mat.name).trim();
  return name || UNNAMED_MATERIAL_KEY;
}

/**
 * @param {import('three').Material | null | undefined} mat
 * @param {string | null | undefined} materialKey
 */
export function materialMatchesFbxGroup(mat, materialKey) {
  if (!materialKey) return true;
  return fbxMaterialGroupKey(mat) === materialKey;
}

/**
 * @param {string} key
 * @returns {string}
 */
export function fbxMaterialDisplayName(key) {
  return key === UNNAMED_MATERIAL_KEY ? 'Unnamed material' : key;
}

/**
 * @typedef {Object} FbxMaterialReport
 * @property {number} meshCount
 * @property {number} materialCount
 * @property {FbxMaterialEntry[]} materials
 * @property {boolean} hasMultipleMaterials
 * @property {boolean} hasUntexturedMaterials
 * @property {boolean} hasPartialMaterials
 * @property {boolean} shouldShowDetails
 */

/**
 * @param {import('three').Material | null | undefined} mat
 * @returns {FbxMaterialSlotInfo}
 */
export function getFbxMaterialSlotInfo(mat) {
  const slots = {
    baseColor: false,
    normal: false,
    orm: false,
    emissive: false,
  };
  if (!mat) return slots;

  for (const def of MAP_TEXTURE_SLOT_DEFS) {
    const tex = mat[def.prop];
    if (!tex?.isTexture) continue;
    if (def.id === 'baseColor') slots.baseColor = true;
    if (def.id === 'normal' || def.id === 'bump') slots.normal = true;
    if (def.id === 'emissive') slots.emissive = true;
  }

  if (getOrmPackForMaterial(mat)) {
    slots.orm = true;
  }

  return slots;
}

/**
 * @param {FbxMaterialSlotInfo} slots
 * @returns {FbxMaterialStatus}
 */
export function classifyFbxMaterialSlots(slots) {
  if (!slots.baseColor && !slots.normal && !slots.orm && !slots.emissive) {
    return 'untextured';
  }
  if (slots.baseColor && slots.normal && slots.orm) {
    return 'ok';
  }
  return 'partial';
}

/**
 * Scan a loaded FBX root for per-material texture wiring (import-time snapshot).
 * @param {import('three').Object3D | null | undefined} root
 * @returns {FbxMaterialReport}
 */
function mergeSlotInfo(into, from) {
  into.baseColor = into.baseColor || from.baseColor;
  into.normal = into.normal || from.normal;
  into.orm = into.orm || from.orm;
  into.emissive = into.emissive || from.emissive;
}

export function analyzeFbxMaterials(root) {
  /** @type {Map<string, { key: string, name: string, meshCount: number, slots: FbxMaterialSlotInfo }>} */
  const byName = new Map();
  let meshCount = 0;

  root?.traverse?.((child) => {
    if (!child?.isMesh) return;
    meshCount += 1;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of materials) {
      if (!mat) continue;
      const key = fbxMaterialGroupKey(mat);
      const name = fbxMaterialDisplayName(key);
      const slots = getFbxMaterialSlotInfo(mat);
      const existing = byName.get(key);
      if (existing) {
        existing.meshCount += 1;
        mergeSlotInfo(existing.slots, slots);
        continue;
      }
      byName.set(key, {
        key,
        name,
        meshCount: 1,
        slots: { ...slots },
      });
    }
  });

  const materials = [...byName.values()].map(({ key, name, meshCount: count, slots }) => {
    const status = classifyFbxMaterialSlots(slots);
    return {
      key,
      name,
      meshCount: count,
      slots,
      status,
    };
  });

  materials.sort((a, b) => b.meshCount - a.meshCount || a.name.localeCompare(b.name));

  const hasUntexturedMaterials = materials.some((m) => m.status === 'untextured');
  const hasPartialMaterials = materials.some((m) => m.status === 'partial');
  const materialCount = materials.length;
  const hasMultipleMaterials = materialCount > 1;

  return {
    meshCount,
    materialCount,
    materials,
    hasMultipleMaterials,
    hasUntexturedMaterials,
    hasPartialMaterials,
    shouldShowDetails:
      hasMultipleMaterials || hasUntexturedMaterials || hasPartialMaterials,
  };
}

/**
 * @param {FbxMaterialEntry} entry
 * @returns {string}
 */
function formatMaterialLine(entry) {
  const meshLabel = entry.meshCount === 1 ? '1 mesh' : `${entry.meshCount} meshes`;
  const { slots } = entry;

  if (entry.status === 'untextured') {
    return `• ${entry.name} (${meshLabel}) — no textures linked in the FBX`;
  }

  const present = [];
  if (slots.baseColor) present.push('base color');
  if (slots.normal) present.push('normal');
  if (slots.orm) present.push('ORM');
  if (slots.emissive) present.push('emissive');

  if (entry.status === 'ok') {
    return `• ${entry.name} (${meshLabel}) — ${present.join(', ')}`;
  }

  const missing = [];
  if (!slots.baseColor) missing.push('base color');
  if (!slots.normal) missing.push('normal');
  if (!slots.orm) missing.push('ORM');

  return `• ${entry.name} (${meshLabel}) — ${present.join(', ')}; missing ${missing.join(', ')}`;
}

/**
 * Human-readable copy for the FBX import modal.
 * @param {FbxMaterialReport} report
 * @returns {string}
 */
export function formatFbxMaterialReportAppendix(report) {
  if (!report?.shouldShowDetails) return '';

  const lines = [
    `This file has ${report.materialCount} material${report.materialCount === 1 ? '' : 's'} across ${report.meshCount} mesh${report.meshCount === 1 ? '' : 'es'}:`,
    ...report.materials.map(formatMaterialLine),
  ];

  if (report.hasMultipleMaterials) {
    lines.push(
      'In Object → Map Slots, choose a material target first, then assign textures per part (rack vs fish).',
    );
  } else if (report.hasUntexturedMaterials) {
    lines.push('Some texture paths may be missing from the export or the dropped folder.');
  } else if (report.hasPartialMaterials) {
    lines.push('Normal and ORM maps may need a folder drop or a GLB re-export from your DCC.');
  }

  if (report.hasMultipleMaterials) {
    lines.push(
      'For shipping assets, export GLB from Blender with every material fully assigned.',
    );
  }

  return lines.join('\n');
}

/**
 * Default Map Slots target: untextured material with the most meshes, else the first group.
 * @param {FbxMaterialReport} report
 * @returns {string}
 */
export function defaultFbxActiveMaterialKey(report) {
  if (!report?.materials?.length) return '';
  const untextured = report.materials.filter((m) => m.status === 'untextured');
  const pool = untextured.length ? untextured : report.materials;
  return pool[0]?.key ?? '';
}

const FBX_MAP_SLOT_IDS = [
  'albedo',
  'normal',
  'orm',
  'roughness',
  'metallic',
  'occlusion',
  'displacement',
  'emissive',
  'opacity',
];

/**
 * @param {import('three').Object3D | null | undefined} model
 * @param {WeakMap<import('three').Mesh, import('three').Material | import('three').Material[]>} originalMaterials
 * @param {string} materialKey
 * @returns {Record<string, string>}
 */
export function getFbxUserSlotFileNamesForMaterial(model, originalMaterials, materialKey) {
  /** @type {Record<string, string>} */
  const names = {};
  if (!model || !materialKey) return names;

  model.traverse((child) => {
    if (!child?.isMesh) return;
    const stored = originalMaterials?.get(child);
    const mats = stored
      ? Array.isArray(stored)
        ? stored
        : [stored]
      : Array.isArray(child.material)
        ? child.material
        : [child.material];
    for (const mat of mats) {
      if (!mat || !materialMatchesFbxGroup(mat, materialKey)) continue;
      const files = mat.userData?.orbyFbxSlotFileNames;
      if (!files || typeof files !== 'object') continue;
      for (const slot of FBX_MAP_SLOT_IDS) {
        if (files[slot] && !names[slot]) names[slot] = String(files[slot]);
      }
    }
  });

  return names;
}

/**
 * @param {FbxMaterialReport} report
 * @returns {string}
 */
export function fbxMaterialReportModalTitle(report) {
  if (report?.hasMultipleMaterials) {
    return `FBX — ${report.materialCount} materials`;
  }
  if (report?.hasUntexturedMaterials) {
    return 'FBX — textures missing';
  }
  if (report?.hasPartialMaterials) {
    return 'FBX — incomplete textures';
  }
  return 'FBX — work in progress';
}
