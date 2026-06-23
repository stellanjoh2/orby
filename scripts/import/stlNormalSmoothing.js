import * as THREE from 'three';
import {
  mergeVertices,
  toCreasedNormals,
} from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/utils/BufferGeometryUtils.js';

export const DEFAULT_STL_SMOOTHING_ANGLE_DEG = 40;
/** Set true to show Object → Advanced smoothing controls for imported meshes. */
export const IMPORT_MESH_SMOOTHING_ENABLED = false;
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
 * @param {THREE.Mesh} mesh
 * @param {Map<string, THREE.BufferGeometry>} cacheMap
 * @param {{ tagStl?: boolean }} [options]
 */
export function cacheImportRawGeometry(mesh, cacheMap, options = {}) {
  if (!importSmoothingMeshEligible(mesh) || cacheMap.has(mesh.uuid)) return;
  if (options.tagStl) mesh.userData.orbyStlImport = true;
  cacheMap.set(mesh.uuid, cloneStlSourceGeometry(mesh.geometry));
}

/**
 * @param {THREE.Object3D | null | undefined} root
 * @param {Map<string, THREE.BufferGeometry>} cacheMap
 * @param {{ tagStl?: boolean }} [options]
 */
export function populateImportRawCache(root, cacheMap, options = {}) {
  if (!root) return;
  root.traverse((child) => {
    if (child.isMesh) cacheImportRawGeometry(child, cacheMap, options);
  });
}

/**
 * Fully faceted normals — one face normal per triangle (0° smoothing).
 * Uses toNonIndexed so creaseAngle=0 in toCreasedNormals (dot > cos(0)) never averages.
 *
 * @param {THREE.BufferGeometry} rawGeometry
 * @returns {THREE.BufferGeometry}
 */
export function buildFacetedImportGeometry(rawGeometry) {
  const geom = rawGeometry.clone();
  const nonIndexed = geom.index ? geom.toNonIndexed() : geom;
  if (nonIndexed !== geom) {
    geom.dispose();
  }

  const pos = nonIndexed.attributes.position;
  const normalArray = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i += 3) {
    const ax = pos.getX(i);
    const ay = pos.getY(i);
    const az = pos.getZ(i);
    const bx = pos.getX(i + 1);
    const by = pos.getY(i + 1);
    const bz = pos.getZ(i + 1);
    const cx = pos.getX(i + 2);
    const cy = pos.getY(i + 2);
    const cz = pos.getZ(i + 2);

    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;

    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    for (let j = 0; j < 3; j += 1) {
      const base = (i + j) * 3;
      normalArray[base] = nx;
      normalArray[base + 1] = ny;
      normalArray[base + 2] = nz;
    }
  }

  nonIndexed.setAttribute('normal', new THREE.BufferAttribute(normalArray, 3));
  nonIndexed.computeBoundingBox();
  nonIndexed.computeBoundingSphere();
  return nonIndexed;
}

/**
 * @param {THREE.BufferGeometry} rawGeometry
 * @param {number} angleDeg
 * @returns {THREE.BufferGeometry}
 */
export function buildImportSmoothedGeometry(rawGeometry, angleDeg) {
  const angle = clampStlSmoothingAngleDeg(angleDeg);
  if (angle === 0) {
    return buildFacetedImportGeometry(rawGeometry);
  }

  const working = rawGeometry.clone();
  const hasSkinning = !!(
    working.attributes.skinIndex && working.attributes.skinWeight
  );

  let geom = working;
  if (!hasSkinning) {
    const merged = mergeVertices(working);
    if (merged !== working) {
      working.dispose();
      geom = merged;
    }
  }

  const creaseAngleRad = THREE.MathUtils.degToRad(angle);
  const smoothed = toCreasedNormals(geom, creaseAngleRad);
  if (smoothed !== geom) {
    geom.dispose();
  }
  return smoothed;
}

/**
 * @param {THREE.BufferGeometry} rawGeometry Unmodified import geometry.
 * @param {number} angleDeg Crease angle in degrees for {@link toCreasedNormals}.
 * @returns {THREE.BufferGeometry}
 * @deprecated Use {@link buildImportSmoothedGeometry}
 */
export function buildSmoothedStlGeometry(rawGeometry, angleDeg) {
  return buildImportSmoothedGeometry(rawGeometry, angleDeg);
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
    : buildImportSmoothedGeometry(rawGeometry, angleDeg);

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

const importSmoothingMeshEligible = (child) => {
  if (!child?.isMesh || !child.geometry?.attributes?.position) return false;
  if (child.userData?.orbySvgExtrude || child.userData?.orbyFontExtrude) return false;
  if (child.userData?.isWireframeOverlay) return false;
  return true;
};

/**
 * Imported mesh files (GLB, OBJ, STL, …) — not SVG/font extrudes.
 *
 * @param {THREE.Object3D | null | undefined} root
 * @param {boolean} [isSvgExtrudeModel]
 */
export function modelSupportsImportNormalSmoothing(root, isSvgExtrudeModel = false) {
  if (isSvgExtrudeModel || !root) return false;
  let found = false;
  root.traverse((child) => {
    if (found) return;
    if (importSmoothingMeshEligible(child)) found = true;
  });
  return found;
}
