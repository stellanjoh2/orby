import {
  normalizeCreativeLookPreset,
} from '../render/CreativeLookMaterials.js';

/** Shader Lab presets that bake decimated mesh geometry (PS2 family). */
export const SHADER_LAB_RETRO_GLB_PRESETS = /** @type {const} */ ([
  'ps2-crush',
  'psx',
  'vga-dos-3d',
]);

/**
 * @typedef {{ mode: 'svg' }} SvgGlbExportKind
 * @typedef {{ mode: 'shader-lab', preset: string, family: 'retro' }} ShaderLabGlbExportKind
 * @typedef {SvgGlbExportKind | ShaderLabGlbExportKind} GlbExportKind
 */

/**
 * @param {THREE.Object3D | null | undefined} root
 */
export function modelHasRetroDecimationGeometry(root) {
  if (!root) return false;
  let found = false;
  root.traverse((child) => {
    if (found || !child.isMesh) return;
    if (child.userData?.orbyPs2CrushedGeometry) found = true;
  });
  return found;
}

/**
 * Decide which GLB export path the Exporter tab button should use.
 * @param {{
 *   isSvgExtrudeModel?: boolean,
 *   creativeLook?: { enabled?: boolean, preset?: string | null } | null,
 *   modelRoot?: THREE.Object3D | null,
 * }} params
 * @returns {GlbExportKind | null}
 */
export function resolveGlbExportKind({
  isSvgExtrudeModel = false,
  creativeLook = null,
  modelRoot = null,
} = {}) {
  if (isSvgExtrudeModel) {
    return { mode: 'svg' };
  }

  if (!creativeLook?.enabled) return null;

  const preset = normalizeCreativeLookPreset(creativeLook.preset);

  if (SHADER_LAB_RETRO_GLB_PRESETS.includes(preset)) {
    if (!modelHasRetroDecimationGeometry(modelRoot)) return null;
    return { mode: 'shader-lab', preset, family: 'retro' };
  }

  return null;
}

/** User-facing hint when the GLB button is unavailable. */
export const GLB_EXPORT_UNAVAILABLE_HINT =
  'GLB export needs SVG extrude or Shader Lab';

/** Shape Library — no GLB export path yet (modifiers included). */
export const GLB_SHAPE_LIBRARY_EXPORT_UNAVAILABLE_HINT =
  'Exporting modified Shape Library meshes isn\u2019t supported yet';
