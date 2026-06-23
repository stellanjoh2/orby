/** SVG extrude normal pipeline — independent from font extrude. */

import * as THREE from 'three';
import {
  mergeVertices,
  toCreasedNormals,
} from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/utils/BufferGeometryUtils.js';
import { applyExtrudeBoxUvs } from './extrudeBoxUvs.js';
import {
  hardenSvgExtrudeBevelShoulderNormals,
} from './svgExtrudeBevelNormals.js';
import {
  fixExtrudedSvgCapFaceOrientations,
  flattenSvgExtrudeCapNormals,
} from './svgExtrudeCapNormals.js';
import {
  clampExtrudeHardEdgeAngleDeg,
  MAX_EXTRUDE_NORMAL_ANGLE_DEG,
  MIN_EXTRUDE_NORMAL_ANGLE_DEG,
} from './extrudeImporterShared.js';

/** Default side-curve smoothing for SVG imports (~30°). Not tied to font extrude defaults. */
export const DEFAULT_SVG_EXTRUDE_NORMAL_ANGLE_DEG = 30;
export const DEFAULT_SVG_EXTRUDE_HARD_EDGE_ANGLE_DEG = 45;

/**
 * @param {unknown} value
 * @returns {number}
 */
export function clampSvgExtrudeNormalAngleDeg(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SVG_EXTRUDE_NORMAL_ANGLE_DEG;
  return Math.max(
    MIN_EXTRUDE_NORMAL_ANGLE_DEG,
    Math.min(MAX_EXTRUDE_NORMAL_ANGLE_DEG, numeric),
  );
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function clampSvgExtrudeHardEdgeAngleDeg(value) {
  return clampExtrudeHardEdgeAngleDeg(value);
}

/**
 * @param {unknown} normalAngleDeg
 * @returns {number}
 */
function resolveSvgExtrudeSideSmoothAngleRad(normalAngleDeg) {
  return THREE.MathUtils.degToRad(clampSvgExtrudeNormalAngleDeg(normalAngleDeg));
}

/**
 * Crease-smooth rounded side walls at the SVG smoothing angle (pre-normalize).
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {unknown} normalAngleDeg
 * @returns {THREE.BufferGeometry}
 */
export function applySvgExtrudeSideCreasedNormals(geometry, normalAngleDeg) {
  if (!geometry?.attributes?.position) return geometry;

  let geom = geometry;
  const merged = mergeVertices(geom);
  if (merged !== geom) {
    geom.dispose();
    geom = merged;
  }

  const smoothAngleRad = resolveSvgExtrudeSideSmoothAngleRad(normalAngleDeg);
  const smoothed = toCreasedNormals(geom, smoothAngleRad);
  if (smoothed !== geom) {
    geom.dispose();
    geom = smoothed;
  }
  return geom;
}

/**
 * Pre-normalize side smoothing for flat SVG extrude (bevel meshes use post-normalize pass).
 *
 * @param {THREE.Group} group
 * @param {unknown} normalAngleDeg
 */
export function applySvgExtrudeCreasedNormalsToGroup(group, normalAngleDeg) {
  group.traverse((child) => {
    if (!child.isMesh || !child.geometry || !child.userData?.orbySvgExtrude) return;
    if (child.userData?.orbyFontExtrude) return;
    if (child.userData?.orbySvgBevelEnabled) return;

    const geom = applySvgExtrudeSideCreasedNormals(child.geometry, normalAngleDeg);
    if (geom !== child.geometry) {
      child.geometry.dispose();
      child.geometry = geom;
    }
  });
}

/**
 * Post-normalize bevel — smooth side curves + collar at smoothing angle, harden shoulders.
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {unknown} normalAngleDeg
 * @param {unknown} [hardEdgeAngleDeg]
 * @returns {THREE.BufferGeometry}
 */
export function applySvgExtrudeBevelNormals(geometry, normalAngleDeg, hardEdgeAngleDeg) {
  if (!geometry?.attributes?.position) return geometry;

  let geom = geometry;
  const merged = mergeVertices(geom);
  if (merged !== geom) {
    geom.dispose();
    geom = merged;
  }

  const smoothAngleRad = resolveSvgExtrudeSideSmoothAngleRad(normalAngleDeg);
  const smoothed = toCreasedNormals(geom, smoothAngleRad);
  if (smoothed !== geom) {
    geom.dispose();
    geom = smoothed;
  }

  const hardAngleRad = THREE.MathUtils.degToRad(
    clampSvgExtrudeHardEdgeAngleDeg(hardEdgeAngleDeg),
  );
  hardenSvgExtrudeBevelShoulderNormals(geom, hardAngleRad);
  return geom;
}

/**
 * Post-normalize caps, optional bevel pass, and box UVs.
 *
 * @param {THREE.Group} group
 * @param {unknown} [normalAngleDeg]
 * @param {unknown} [hardEdgeAngleDeg]
 */
export function finalizeSvgExtrudeGroupGeometry(group, normalAngleDeg, hardEdgeAngleDeg) {
  group.traverse((child) => {
    if (!child.isMesh || !child.geometry || !child.userData?.orbySvgExtrude) return;
    if (child.userData?.orbyFontExtrude) return;

    let geom = child.geometry;
    const merged = mergeVertices(geom);
    if (merged !== geom) {
      geom.dispose();
      geom = merged;
    }

    geom = fixExtrudedSvgCapFaceOrientations(geom);

    if (child.userData?.orbySvgBevelEnabled) {
      geom = applySvgExtrudeBevelNormals(geom, normalAngleDeg, hardEdgeAngleDeg);
    }

    geom = flattenSvgExtrudeCapNormals(geom);
    child.geometry = applyExtrudeBoxUvs(geom);
  });
}
