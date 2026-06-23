import * as THREE from 'three';
import {
  mergeVertices,
  toCreasedNormals,
} from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/utils/BufferGeometryUtils.js';
import { applyExtrudeBoxUvs } from './extrudeBoxUvs.js';

export const DEFAULT_EXTRUDE_DEPTH = 0.2;
export const MIN_EXTRUDE_DEPTH = 0.01;
export const MAX_EXTRUDE_DEPTH = 2.0;
export const DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG = 30;
/** Default floor for toCreasedNormals — keeps 90° cap/side/back edges split for shading terminators. */
export const DEFAULT_EXTRUDE_HARD_EDGE_ANGLE_DEG = 45;
export const MIN_EXTRUDE_HARD_EDGE_ANGLE_DEG = 0;
export const MAX_EXTRUDE_HARD_EDGE_ANGLE_DEG = 90;
export const MIN_EXTRUDE_NORMAL_ANGLE_DEG = 0;
export const MAX_EXTRUDE_NORMAL_ANGLE_DEG = 180;
export const MIN_EXTRUDE_COLOR_OFFSET = -1.0;
export const MAX_EXTRUDE_COLOR_OFFSET = 1.0;

/**
 * @param {unknown} value
 * @returns {number}
 */
export function clampExtrudeDepth(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_EXTRUDE_DEPTH;
  return Math.max(MIN_EXTRUDE_DEPTH, Math.min(MAX_EXTRUDE_DEPTH, numeric));
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function clampExtrudeNormalAngleDeg(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG;
  return Math.max(
    MIN_EXTRUDE_NORMAL_ANGLE_DEG,
    Math.min(MAX_EXTRUDE_NORMAL_ANGLE_DEG, numeric),
  );
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function clampExtrudeHardEdgeAngleDeg(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_EXTRUDE_HARD_EDGE_ANGLE_DEG;
  return Math.max(
    MIN_EXTRUDE_HARD_EDGE_ANGLE_DEG,
    Math.min(MAX_EXTRUDE_HARD_EDGE_ANGLE_DEG, numeric),
  );
}

/**
 * Crease angle (radians) for {@link toCreasedNormals} — enforces a hard-edge floor so cap/side
 * transitions stay split even when the smoothing slider is lower.
 *
 * @param {unknown} normalAngleDeg
 * @param {unknown} [hardEdgeAngleDeg]
 * @returns {number}
 */
export function resolveExtrudeCreaseAngleRad(normalAngleDeg, hardEdgeAngleDeg) {
  const deg = Math.max(
    clampExtrudeNormalAngleDeg(normalAngleDeg),
    clampExtrudeHardEdgeAngleDeg(hardEdgeAngleDeg),
  );
  return THREE.MathUtils.degToRad(deg);
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function clampExtrudeColorOffset(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(MIN_EXTRUDE_COLOR_OFFSET, Math.min(MAX_EXTRUDE_COLOR_OFFSET, numeric));
}

/**
 * @param {THREE.Object3D} node
 */
export function disposeExtrudeMeshNode(node) {
  node.traverse?.((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((mat) => mat?.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
}

/**
 * @param {THREE.Group} targetGroup
 * @param {THREE.Group} sourceGroup
 */
export function replaceExtrudeGroupChildren(targetGroup, sourceGroup) {
  while (targetGroup.children.length) {
    const child = targetGroup.children[0];
    disposeExtrudeMeshNode(child);
    targetGroup.remove(child);
  }

  while (sourceGroup.children.length) {
    targetGroup.add(sourceGroup.children[0]);
  }

  targetGroup.name = sourceGroup.name;
  targetGroup.userData = { ...sourceGroup.userData };
  targetGroup.scale.copy(sourceGroup.scale);
  targetGroup.position.copy(sourceGroup.position);
  targetGroup.rotation.copy(sourceGroup.rotation);
}

/**
 * @param {THREE.Group | null} existingGroup
 * @param {THREE.Group} rebuiltGroup
 * @returns {THREE.Group}
 */
export function preserveExtrudeGroupOnRebuild(existingGroup, rebuiltGroup) {
  if (!existingGroup) return rebuiltGroup;
  replaceExtrudeGroupChildren(existingGroup, rebuiltGroup);
  return existingGroup;
}

/**
 * Standard import smoothing — merge coincident verts, then crease at the given angle (STL pattern).
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {unknown} normalAngleDeg
 * @param {unknown} [hardEdgeAngleDeg]
 * @returns {THREE.BufferGeometry}
 */
export function applyImportCreasedNormals(geometry, normalAngleDeg, hardEdgeAngleDeg) {
  if (!geometry?.attributes?.position) return geometry;

  let geom = geometry;
  const merged = mergeVertices(geom);
  if (merged !== geom) {
    geom.dispose();
    geom = merged;
  }

  const creaseAngleRad = resolveExtrudeCreaseAngleRad(normalAngleDeg, hardEdgeAngleDeg);
  const smoothed = toCreasedNormals(geom, creaseAngleRad);
  if (smoothed !== geom) {
    geom.dispose();
    geom = smoothed;
  }
  return geom;
}

export function applyExtrudeDirectionOffset(group, flipDirection, defaultDepth) {
  group.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const depth = clampExtrudeDepth(child.userData?.orbySvgEffectiveDepth ?? defaultDepth);
    const colorOffset = clampExtrudeColorOffset(child.userData?.orbySvgColorOffset ?? 0);
    const directionOffset = (flipDirection ? 1 : -1) * depth * 0.5;
    child.geometry.translate(0, 0, directionOffset + colorOffset);
    child.geometry.computeBoundingBox();
    child.geometry.computeBoundingSphere();
  });
}

/** @param {THREE.Group} group */
export function applyExtrudeBoxUvsToGroup(group) {
  group.traverse((child) => {
    if (!child.isMesh || !child.geometry || !child.userData?.orbySvgExtrude) return;
    child.geometry = applyExtrudeBoxUvs(child.geometry);
  });
}
