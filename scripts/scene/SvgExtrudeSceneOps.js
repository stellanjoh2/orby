/**
 * Shared rebuild path after {@link SvgExtrudeImporter} mutates geometry.
 */

import { resetSvgExtrudeStateForFontExtrude, DEFAULT_SVG_EXTRUDE_SURFACE_PRESET, DEFAULT_SVG_EXTRUDE_SURFACE_SCALE, DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH } from '../import/extrudeDefaults.js';
import { normalizeGlyphFillHex } from '../import/FontExtrudeImporter.js';

/** @param {unknown} importer */
export function isFontExtrudeImporter(importer) {
  return !!importer && typeof importer.getFillColor === 'function';
}

/**
 * Imported SVG file extrude — not Type Creator / font extrude.
 * @param {import('three').Object3D | null | undefined} root
 */
export function isSvgFileExtrudeModel(root) {
  if (!root) return false;
  if (root.userData?.orbyFontGenerated || root.userData?.orbyFontExtrude) return false;
  if (root.userData?.orbySvgExtrude) return true;
  let found = false;
  root.traverse((child) => {
    if (found || !child.isMesh) return;
    if (child.userData?.orbySvgExtrude && !child.userData?.orbyFontExtrude) found = true;
  });
  return found;
}

/**
 * True when generating text should wipe SVG file-import state (override, surfaces, per-color maps).
 * @param {import('../SceneManager.js').SceneManager | null | undefined} scene
 */
export function shouldClearSvgExtrudeLegacyForFontGeneration(scene) {
  if (!scene) return false;
  if (scene.currentModel?.userData?.orbyFontGenerated) return false;
  if (isFontExtrudeImporter(scene.svgExtrudeImporter)) return false;
  const svg = scene.stateStore?.getState()?.svgExtrude;
  return !!(scene.currentModel || svg?.enabled);
}

/**
 * @param {import('../StateStore.js').StateStore} stateStore
 * @param {import('../EventBus.js').EventBus} eventBus
 */
export function clearSvgExtrudeLegacyForFontGeneration(stateStore, eventBus) {
  resetSvgExtrudeStateForFontExtrude(stateStore, eventBus);
  stateStore.batch(() => {
    stateStore.set('material.surfacePreset', DEFAULT_SVG_EXTRUDE_SURFACE_PRESET);
    stateStore.set('material.surfaceScale', DEFAULT_SVG_EXTRUDE_SURFACE_SCALE);
    stateStore.set('material.surfaceStrength', DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH);
    stateStore.set('material.surfaceEnabled', false);
    stateStore.set('material.surfaceLastPreset', 'galvanizedSteel');
  });
  eventBus.emit('mesh:object-surface', {
    enabled: false,
    preset: DEFAULT_SVG_EXTRUDE_SURFACE_PRESET,
    scale: DEFAULT_SVG_EXTRUDE_SURFACE_SCALE,
    strength: DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH,
  });
}

/** @param {unknown} importer */
export function supportsExtrudeBevel(importer) {
  return !!importer && typeof importer.setBevelSettings === 'function';
}

/**
 * Keep {@link FontExtrudeImporter} fill in sync with `fontExtrude.fillColor` before depth/angle rebuilds.
 * @param {import('../SceneManager.js').SceneManager} scene
 * @returns {string | null}
 */
export function syncFontExtrudeFillOnImporter(scene) {
  const importer = scene.svgExtrudeImporter;
  if (!isFontExtrudeImporter(importer)) return null;
  const isFont =
    !!scene.currentModel?.userData?.orbyFontGenerated ||
    !!scene.materialController?._isFontExtrudeModel?.(scene.currentModel);
  if (!isFont) return null;
  const fillHex = normalizeGlyphFillHex(
    scene.stateStore.getState()?.fontExtrude?.fillColor ?? importer.getFillColor(),
  );
  const extrudeHex = normalizeGlyphFillHex(
    scene.stateStore.getState()?.fontExtrude?.extrudeColor ?? importer.getExtrudeColor?.() ?? fillHex,
  );
  if (typeof importer.setTwoToneColors === 'function') {
    importer.setTwoToneColors(fillHex, extrudeHex);
  } else {
    importer.currentFillColor = fillHex;
    importer.currentExtrudeColor = extrudeHex;
    importer.currentColorPalette = [fillHex];
  }
  const available = scene.stateStore.getState()?.svgExtrude?.availableColors ?? [];
  if (available.length !== 1 || available[0] !== fillHex) {
    scene.stateStore.set('svgExtrude.availableColors', [fillHex]);
  }
  return fillHex;
}

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
const SVG_EXTRUDE_GEOMETRY_SNAPSHOT_KEYS = [
  'orbyPs2OriginalGeometry',
  'orbyWirePulseOriginalGeometry',
  'orbyWirePulsePreparedGeometry',
  'orbyVoxelOriginalGeometry',
  'orbyVoxelPreparedGeometry',
  'orbyVoxelBakedStaticGeometry',
  'orbyScanlineOriginalGeometry',
  'orbyScanlinePreparedGeometry',
];

/** Drop creative-look / overlay geometry snapshots after SVG extrude rebuild. */
function purgeSvgExtrudeMeshGeometrySnapshots(scene) {
  scene.currentModel?.traverse((child) => {
    if (!child.isMesh) return;
    for (const key of SVG_EXTRUDE_GEOMETRY_SNAPSHOT_KEYS) {
      delete child.userData[key];
    }
  });
}

export function rebuildSvgExtrudeMeshesAfterImporterChange(scene) {
  // Rebuild swaps mesh geometry; drop reverse-normals caches tied to disposed buffers.
  scene.originalGeometryIndices = new WeakMap();
  scene.originalGeometryAttributes = new WeakMap();
  purgeSvgExtrudeMeshGeometrySnapshots(scene);

  scene.materialController._appliedCreativeLookPreset = null;
  scene.materialController.prepareMesh(scene.currentModel);
  scene.setShading(scene.currentShading);
  const svgState = scene.stateStore.getState().svgExtrude || {};
  syncFontExtrudeFillOnImporter(scene);
  // Color override must run before font two-tone reapply — override wins when enabled.
  scene.setSvgExtrudeColorOverride(
    {
      enabled: !!svgState.colorOverride,
      color: svgState.overrideColor ?? '#7ed321',
    },
    { updateState: false },
  );
  const fillHex = normalizeGlyphFillHex(
    scene.stateStore.getState()?.fontExtrude?.fillColor
      ?? scene.svgExtrudeImporter?.getFillColor?.(),
  );
  const isFont =
    !!scene.currentModel?.userData?.orbyFontGenerated ||
    !!scene.materialController?._isFontExtrudeModel?.(scene.currentModel);
  if (isFont && fillHex) {
    const extrudeHex = normalizeGlyphFillHex(
      scene.stateStore.getState()?.fontExtrude?.extrudeColor ?? fillHex,
    );
    scene.applyFontExtrudeColors(fillHex, extrudeHex);
  }
  scene.setReverseNormals(scene.stateStore.getState().advanced?.reverseNormals ?? false);
  scene.refreshBoneHelpers();
  scene.cameraController?.refreshModelBounds?.(scene.currentModel);
  scene._syncShadowCameraBounds?.();
  scene._syncStudioGroundSurfaces?.();
  scene.fontTextRevealController?.bindModel?.(scene.currentModel);
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
    syncFontExtrudeFillOnImporter(scene);
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

/**
 * Coerce a value to a `#rrggbb` lowercase hex, or null if not a valid color string.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeSvgExtrudeHexColor(value) {
  if (typeof value !== 'string') return null;
  let hex = value.trim().toLowerCase();
  if (!hex) return null;
  if (hex[0] !== '#') hex = `#${hex}`;
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
}

/**
 * Keep only replacements whose key is a current palette color and whose value is a
 * valid hex that differs from the base color (same-as-base = no replacement).
 * @param {Record<string, unknown>} colorReplacements
 * @param {import('../StateStore.js').StateStore} stateStore
 */
export function sanitizeSvgExtrudeColorReplacements(colorReplacements, stateStore) {
  const availableColors = stateStore.getState()?.svgExtrude?.availableColors || [];
  const sanitized = {};
  Object.entries(colorReplacements || {}).forEach(([color, value]) => {
    if (!availableColors.includes(color)) return;
    const normalized = normalizeSvgExtrudeHexColor(value);
    if (!normalized) return;
    if (normalized === normalizeSvgExtrudeHexColor(color)) return;
    sanitized[color] = normalized;
  });
  return sanitized;
}
