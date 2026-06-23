/** SVG extrude normal pipeline — separate from font extrude. */

import {
  mergeVertices,
} from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/utils/BufferGeometryUtils.js';
import { applyExtrudeBoxUvs } from './extrudeBoxUvs.js';
import { applyImportCreasedNormals } from './extrudeImporterShared.js';
import { smoothSvgExtrudeBevelNormals } from './svgExtrudeBevelNormals.js';
import {
  fixExtrudedSvgCapFaceOrientations,
  flattenSvgExtrudeCapNormals,
} from './svgExtrudeCapNormals.js';

/**
 * Crease side walls before studio normalize (XY scale + rotateX), same order as font extrude.
 * Non-uniform normalize breaks merge+crease on holed paths when run after scale.
 *
 * @param {THREE.Group} group
 * @param {unknown} [normalAngleDeg]
 * @param {unknown} [hardEdgeAngleDeg]
 */
export function applySvgExtrudeCreasedNormalsToGroup(group, normalAngleDeg, hardEdgeAngleDeg) {
  group.traverse((child) => {
    if (!child.isMesh || !child.geometry || !child.userData?.orbySvgExtrude) return;
    if (child.userData?.orbyFontExtrude) return;
    // Bevel meshes get a dedicated post-normalize smooth pass; pre-crease would double-split curves.
    if (child.userData?.orbySvgBevelEnabled) return;

    const geom = applyImportCreasedNormals(child.geometry, normalAngleDeg, hardEdgeAngleDeg);
    if (geom !== child.geometry) {
      child.geometry.dispose();
      child.geometry = geom;
    }
  });
}

/**
 * Post-normalize caps, bevel smooth, and box UVs.
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
      const smoothed = smoothSvgExtrudeBevelNormals(
        geom,
        normalAngleDeg,
        hardEdgeAngleDeg,
      );
      if (smoothed !== geom) {
        geom.dispose();
        geom = smoothed;
      }
    }

    geom = flattenSvgExtrudeCapNormals(geom);
    child.geometry = applyExtrudeBoxUvs(geom);
  });
}
