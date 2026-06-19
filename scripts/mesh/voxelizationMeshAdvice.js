import { isVoxelCreativeLookPreset } from '../render/creativeLookVoxelArt.js';
import { normalizeCreativeLookPreset } from '../render/CreativeLookMaterials.js';

/** Voxel HD SAT-marks every triangle against the shared grid — warn before apply above this. */
export const VOXEL_HD_TRIANGLE_WARN_THRESHOLD = 200_000;

/** Stronger guidance above this — tab freezes are common. */
export const VOXEL_HD_TRIANGLE_SEVERE_THRESHOLD = 1_000_000;

/**
 * @param {import('three').Object3D | null | undefined} object
 * @returns {{ triangles: number, meshes: number }}
 */
export function countModelMeshTriangles(object) {
  let triangles = 0;
  let meshes = 0;

  object?.traverse?.((child) => {
    if (!child.isMesh) return;
    meshes += 1;
    const geometry = child.geometry;
    if (!geometry) return;
    const position = geometry.attributes?.position;
    if (geometry.index) {
      triangles += geometry.index.count / 3;
    } else if (position) {
      triangles += position.count / 3;
    }
  });

  return {
    triangles: Math.round(triangles),
    meshes,
  };
}

/** @param {number} count */
export function formatTriangleCount(count) {
  const n = Math.max(0, Math.round(Number(count) || 0));
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    if (millions >= 10) return `${Math.round(millions)} million`;
    const text = millions.toFixed(1).replace(/\.0$/, '');
    return `${text} million`;
  }
  if (n >= 10_000) {
    const thousands = n / 1000;
    if (thousands >= 100) return `${Math.round(thousands)}k`;
    const text = thousands.toFixed(1).replace(/\.0$/, '');
    return `${text}k`;
  }
  return n.toLocaleString('en-US');
}

/**
 * @param {import('three').Object3D | null | undefined} object
 * @returns {{
 *   triangles: number,
 *   meshes: number,
 *   shouldWarn: boolean,
 *   severity: 'ok' | 'moderate' | 'severe',
 * }}
 */
export function analyzeMeshForVoxelHd(object) {
  const { triangles, meshes } = countModelMeshTriangles(object);
  const shouldWarn = triangles >= VOXEL_HD_TRIANGLE_WARN_THRESHOLD;
  const severity = triangles >= VOXEL_HD_TRIANGLE_SEVERE_THRESHOLD
    ? 'severe'
    : shouldWarn
      ? 'moderate'
      : 'ok';
  return { triangles, meshes, shouldWarn, severity };
}

/**
 * Whether applying Shader Lab state will rebuild Voxel HD geometry (not a live-uniform tweak).
 * @param {import('../render/MaterialController.js').MaterialController | null | undefined} materialController
 * @param {object} creativeLookState
 */
export function willApplyVoxelHdGeometry(materialController, creativeLookState) {
  if (!creativeLookState?.enabled || !materialController?.currentModel) return false;
  const preset = normalizeCreativeLookPreset(creativeLookState.preset);
  if (!isVoxelCreativeLookPreset(preset)) return false;
  return materialController.willRebuildCreativeLookMaterials(creativeLookState);
}

export const VOXEL_HD_HIGH_POLY_ALERT_TITLE = 'High-poly mesh — Voxel HD';

/**
 * @param {{ triangles: number, meshes: number, severity: 'moderate' | 'severe' }} analysis
 */
export function buildVoxelHdHighPolyAlertBody(analysis) {
  const triLabel = formatTriangleCount(analysis.triangles);
  const meshNote = analysis.meshes === 1 ? '1 mesh' : `${analysis.meshes} meshes`;
  const intro =
    analysis.severity === 'severe'
      ? `This model has about ${triLabel} triangles (${meshNote}). Voxel HD tests every triangle against a 128³ voxel grid and often freezes the tab on meshes this dense.`
      : `This model has about ${triLabel} triangles (${meshNote}). Voxel HD can take a long time on dense meshes and may briefly freeze the viewport while it runs.`;

  return (
    `${intro}\n\n` +
    'What usually works well:\n' +
    '• Under ~200k triangles — typically finishes in a few seconds\n' +
    '• 200k–1M — slow but often OK; hide glass or interior parts in the source file if you can\n' +
    '• Over 1M — decimate in Blender or your DCC first, or try PS2 Crush / PSX for a retro mesh look without full voxelization\n\n' +
    'Voxelize anyway?'
  );
}
