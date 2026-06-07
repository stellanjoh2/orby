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
 * @param {THREE.Object3D | null | undefined} object
 * @param {{ target?: number, tolerance?: number }} [options]
 * @returns {{ maxDimensionBefore: number, scaleFactor: number, skipped: boolean } | null}
 */
export function normalizeImportScale(object, options = {}) {
  if (!object) return null;

  const target = options.target ?? STUDIO_IMPORT_TARGET_MAX_DIMENSION;
  const tolerance = options.tolerance ?? STUDIO_IMPORT_SCALE_TOLERANCE;

  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) {
    expandBox3FromArmature(object, bounds);
  }
  if (!bounds || bounds.isEmpty()) return null;

  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) return null;

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
