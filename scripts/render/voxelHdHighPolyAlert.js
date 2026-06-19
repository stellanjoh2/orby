import {
  analyzeMeshForVoxelHd,
  buildVoxelHdHighPolyAlertBody,
  VOXEL_HD_HIGH_POLY_ALERT_TITLE,
} from '../mesh/voxelizationMeshAdvice.js';

/**
 * @param {{ confirmMessageAlert?: (body: string, title: string, options?: object) => Promise<boolean> }} ui
 * @param {import('three').Object3D | null | undefined} model
 * @returns {Promise<boolean>} true if the user chose to proceed
 */
export async function confirmVoxelHdHighPolyAlert(ui, model) {
  const analysis = analyzeMeshForVoxelHd(model);
  if (!analysis.shouldWarn) return true;

  const body = buildVoxelHdHighPolyAlertBody(analysis);
  const confirmed = await ui?.confirmMessageAlert?.(body, VOXEL_HD_HIGH_POLY_ALERT_TITLE, {
    okLabel: 'Voxelize anyway',
    cancelLabel: 'Cancel',
    modalTone: 'caution',
  });

  return confirmed !== false;
}
