import * as THREE from 'three';
import {
  mergeVertices,
  toCreasedNormals,
} from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/utils/BufferGeometryUtils.js';

export const DEFAULT_STL_SMOOTHING_ANGLE_DEG = 40;
const MIN_ANGLE_DEG = 0;
const MAX_ANGLE_DEG = 180;

export function clampStlSmoothingAngleDeg(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_STL_SMOOTHING_ANGLE_DEG;
  return Math.max(MIN_ANGLE_DEG, Math.min(MAX_ANGLE_DEG, numeric));
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @returns {THREE.BufferGeometry}
 */
export function cloneStlSourceGeometry(geometry) {
  return geometry.clone();
}

/**
 * @param {THREE.BufferGeometry} rawGeometry Unmodified STL loader output (faceted face normals).
 * @param {number} angleDeg Crease angle in degrees for {@link toCreasedNormals}.
 * @returns {THREE.BufferGeometry}
 */
export function buildSmoothedStlGeometry(rawGeometry, angleDeg) {
  const working = rawGeometry.clone();
  const merged = mergeVertices(working);
  if (merged !== working) {
    working.dispose();
  }
  const creaseAngleRad = THREE.MathUtils.degToRad(clampStlSmoothingAngleDeg(angleDeg));
  const smoothed = toCreasedNormals(merged, creaseAngleRad);
  if (smoothed !== merged) {
    merged.dispose();
  }
  return smoothed;
}

/**
 * @param {THREE.Mesh} mesh
 * @param {THREE.BufferGeometry} rawGeometry Cached faceted STL geometry.
 * @param {{ smoothShading?: boolean, angleDeg?: number }} options
 */
export function applyStlNormalSmoothing(mesh, rawGeometry, options = {}) {
  if (!mesh?.isMesh || !rawGeometry) return;

  const smoothShading = options.smoothShading !== false;
  const angleDeg = clampStlSmoothingAngleDeg(options.angleDeg);
  const useFaceted = !smoothShading;

  const previous = mesh.geometry;
  const next = useFaceted
    ? rawGeometry.clone()
    : buildSmoothedStlGeometry(rawGeometry, angleDeg);

  mesh.geometry = next;
  if (previous && previous !== rawGeometry) {
    previous.dispose();
  }
  next.computeBoundingBox();
  next.computeBoundingSphere();
}

export function modelHasStlImport(root) {
  if (!root) return false;
  let found = false;
  root.traverse((child) => {
    if (found) return;
    if (child?.isMesh && child.userData?.orbyStlImport) {
      found = true;
    }
  });
  return found;
}
