/**
 * Shared rebuild path after {@link SvgExtrudeImporter} mutates geometry.
 */

/**
 * @param {import('../SceneManager.js').SceneManager} scene
 * @returns {boolean}
 */
export function canMutateSvgExtrudeImporter(scene) {
  return !!(scene.currentModel && scene.svgExtrudeImporter && scene.isSvgExtrudeModel);
}

/**
 * Re-register meshes, resync shading, color override, normals, bones, and stats.
 * @param {import('../SceneManager.js').SceneManager} scene
 */
export function rebuildSvgExtrudeMeshesAfterImporterChange(scene) {
  scene.materialController.prepareMesh(scene.currentModel);
  scene.setShading(scene.currentShading);
  const svgState = scene.stateStore.getState().svgExtrude || {};
  scene.setSvgExtrudeColorOverride(
    {
      enabled: !!svgState.colorOverride,
      color: svgState.overrideColor ?? '#7ed321',
    },
    { updateState: false },
  );
  scene.setReverseNormals(scene.stateStore.getState().advanced?.reverseNormals ?? false);
  scene.refreshBoneHelpers();
  scene.cameraController?.refreshModelBounds?.(scene.currentModel);
  scene._syncShadowCameraBounds?.();
  scene._applyShadowTintToScene?.();
  if (scene.currentFile) {
    scene.updateStatsUI(scene.currentFile, scene.currentModel, scene.currentAssetMetadata);
  }
}

/**
 * @param {import('../SceneManager.js').SceneManager} scene
 * @param {() => void} mutateImporter
 * @param {{ logLabel?: string, toastOnError?: string }} [options]
 * @returns {boolean}
 */
export function runSvgExtrudeImporterMutation(scene, mutateImporter, options = {}) {
  const { logLabel = 'update SVG extrude', toastOnError = 'Could not update SVG' } = options;
  if (!canMutateSvgExtrudeImporter(scene)) return false;
  try {
    mutateImporter();
    rebuildSvgExtrudeMeshesAfterImporterChange(scene);
    return true;
  } catch (error) {
    console.error(`Failed to ${logLabel}`, error);
    scene.ui?.showToast?.(toastOnError);
    return false;
  }
}

/**
 * @param {Record<string, unknown>} colorDepths
 * @param {import('../StateStore.js').StateStore} stateStore
 */
export function sanitizeSvgExtrudeColorDepths(colorDepths, stateStore) {
  const availableColors = stateStore.getState()?.svgExtrude?.availableColors || [];
  const sanitized = {};
  Object.entries(colorDepths || {}).forEach(([color, value]) => {
    if (!availableColors.includes(color)) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    sanitized[color] = Math.max(0.01, Math.min(2.0, numeric));
  });
  return sanitized;
}

/**
 * @param {Record<string, unknown>} colorOffsets
 * @param {import('../StateStore.js').StateStore} stateStore
 */
export function sanitizeSvgExtrudeColorOffsets(colorOffsets, stateStore) {
  const availableColors = stateStore.getState()?.svgExtrude?.availableColors || [];
  const sanitized = {};
  Object.entries(colorOffsets || {}).forEach(([color, value]) => {
    if (!availableColors.includes(color)) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    sanitized[color] = Math.max(-1.0, Math.min(1.0, numeric));
  });
  return sanitized;
}
