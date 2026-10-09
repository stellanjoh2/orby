import * as THREE from 'three';
import {
  STUDIO_IMPORT_SCALE_TOLERANCE,
  STUDIO_IMPORT_TARGET_MAX_DIMENSION,
} from '../constants.js';
import { expandBox3FromArmature } from './bvhArmatureBounds.js';

/**
 * Uniformly scale a loaded root so its world AABB max dimension sits near
 * {@link STUDIO_IMPORT_TARGET_MAX_DIMENSION}. Skips when already within tolerance.
 *
 * Pass `scaleFactor` to reuse another asset's import multiplier (multi-asset packs)
 * instead of fitting this object to the studio target on its own.
 *
 * @param {THREE.Object3D | null | undefined} object
 * @param {{ target?: number, tolerance?: number, scaleFactor?: number }} [options]
 * @returns {{ maxDimensionBefore: number, scaleFactor: number, skipped: boolean } | null}
 */
export function normalizeImportScale(object, options = {}) {
  if (!object) return null;

  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) {
    expandBox3FromArmature(object, bounds);
  }
  if (!bounds || bounds.isEmpty()) return null;

  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) return null;

  const shared = options.scaleFactor;
  if (Number.isFinite(shared) && shared > 0) {
    if (Math.abs(shared - 1) <= 1e-12) {
      object.userData.orbyImportNormalization = {
        maxDimensionBefore: maxDimension,
        scaleFactor: 1,
        skipped: true,
        shared: true,
      };
      return { maxDimensionBefore: maxDimension, scaleFactor: 1, skipped: true };
    }
    object.scale.multiplyScalar(shared);
    object.updateMatrixWorld(true);
    object.userData.orbyImportNormalization = {
      maxDimensionBefore: maxDimension,
      scaleFactor: shared,
      skipped: false,
      shared: true,
    };
    return {
      maxDimensionBefore: maxDimension,
      scaleFactor: shared,
      skipped: false,
    };
  }

  const target = options.target ?? STUDIO_IMPORT_TARGET_MAX_DIMENSION;
  const tolerance = options.tolerance ?? STUDIO_IMPORT_SCALE_TOLERANCE;

  const relativeError = Math.abs(maxDimension - target) / target;
  if (relativeError <= tolerance) {
    object.userData.orbyImportNormalization = {
      maxDimensionBefore: maxDimension,
      scaleFactor: 1,
      skipped: true,
    };
    return { maxDimensionBefore: maxDimension, scaleFactor: 1, skipped: true };
  }

  const uniformScale = target / maxDimension;
  if (!Number.isFinite(uniformScale) || uniformScale <= 0) return null;

  object.scale.multiplyScalar(uniformScale);
  object.updateMatrixWorld(true);

  object.userData.orbyImportNormalization = {
    maxDimensionBefore: maxDimension,
    scaleFactor: uniformScale,
    skipped: false,
  };
  return {
    maxDimensionBefore: maxDimension,
    scaleFactor: uniformScale,
    skipped: false,
  };
}

/**
 * Import scale from the first scene asset that already went through
 * {@link normalizeImportScale}. Skips generated font/SVG so same-authoring-scale
 * pack GLBs can opt in to a shared multiplier.
 *
 * Do not use for Object → Add additional / shape append — unrelated files must
 * each fit {@link STUDIO_IMPORT_TARGET_MAX_DIMENSION} on their own.
 *
 * @param {{ mesh?: import('three').Object3D | null, isSvgExtrudeModel?: boolean }[] | null | undefined} assets
 * @returns {number | null}
 */
export function resolveSharedImportScaleFactor(assets) {
  if (!Array.isArray(assets)) return null;
  for (const asset of assets) {
    if (asset?.isSvgExtrudeModel) continue;
    const mesh = asset?.mesh;
    if (!mesh?.userData) continue;
    if (mesh.userData.orbyFontGenerated || mesh.userData.orbyFontExtrude) continue;
    const factor = mesh.userData.orbyImportNormalization?.scaleFactor;
    if (Number.isFinite(factor) && factor > 0) return factor;
  }
  return null;
}
