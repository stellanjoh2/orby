/**
 * Font extrude cap mesh — Constrained Delaunay (cdt2d) instead of Earcut fan triangulation.
 * Scoped to font builds via {@link withFontCdtCapTriangulation}; SVG extrude is unchanged.
 */

import cdt2d from '../vendor/cdt2d.module.js';
import * as THREE from 'three';
import { ShapeUtils } from 'three';
import { toCreasedNormals } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/utils/BufferGeometryUtils.js';
import { originalTriangulateShape } from './extrudeCapTriangulation.js';

function removeDupEndPts(points) {
  if (!points?.length || points.length < 2) return;
  const first = points[0];
  const last = points[points.length - 1];
  if (typeof first.distanceTo === 'function' && first.distanceTo(last) < 0.001) {
    points.pop();
    return;
  }
  if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-5) {
    points.pop();
  }
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function triangleCentroid(points, a, b, c) {
  return {
    x: (points[a][0] + points[b][0] + points[c][0]) / 3,
    y: (points[a][1] + points[b][1] + points[c][1]) / 3,
  };
}

/**
 * @param {import('three').Vector2[]} contour
 * @param {import('three').Vector2[][]} holes
 * @returns {number[][]} faces as index triples (same layout as ShapeUtils.triangulateShape)
 */
export function triangulateFontCapWithCdt(contour, holes) {
  removeDupEndPts(contour);
  (holes || []).forEach(removeDupEndPts);

  if (!contour?.length || contour.length < 3) {
    return originalTriangulateShape(contour, holes);
  }

  const holeRings = holes || [];
  const points = contour.map((p) => [p.x, p.y]);
  /** @type {number[][]} */
  const edges = [];

  for (let i = 0; i < contour.length; i += 1) {
    edges.push([i, (i + 1) % contour.length]);
  }

  let vertexOffset = contour.length;
  for (const hole of holeRings) {
    if (!hole?.length || hole.length < 3) continue;
    for (let i = 0; i < hole.length; i += 1) {
      points.push([hole[i].x, hole[i].y]);
      edges.push([vertexOffset + i, vertexOffset + ((i + 1) % hole.length)]);
    }
    vertexOffset += hole.length;
  }

  let triangles;
  try {
    triangles = cdt2d(points, edges, { delaunay: true, exterior: false, interior: true });
  } catch {
    return originalTriangulateShape(contour, holes);
  }

  if (!triangles?.length) {
    return originalTriangulateShape(contour, holes);
  }

  /** @type {number[][]} */
  const faces = [];
  for (const tri of triangles) {
    const [a, b, c] = tri;
    const centroid = triangleCentroid(points, a, b, c);
    if (!pointInRing(centroid, contour)) continue;
    if (holeRings.some((hole) => pointInRing(centroid, hole))) continue;
    faces.push([a, b, c]);
  }

  if (!faces.length) {
    return originalTriangulateShape(contour, holes);
  }

  return faces;
}

/**
 * One pass of midpoint subdivision on coplanar cap triangles (flat extrude only).
 * Do not use on bevelled ExtrudeGeometry — bevel top rings share z=max with caps
 * and subdivision creates spike triangles across letterforms.
 *
 * @param {import('three').BufferGeometry} geometry
 * @param {{ plane?: 'max' | 'min', passes?: number }} [options]
 * @returns {import('three').BufferGeometry}
 */
export function subdivideFontExtrudeCapFaces(geometry, options = {}) {
  const plane = options.plane === 'min' ? 'min' : 'max';
  const passes = Math.max(0, Math.round(Number(options.passes) || 0));
  if (!geometry?.attributes?.position || passes < 1) return geometry;

  let geom = geometry;
  if (geom.index) {
    geom = geom.toNonIndexed();
    geometry.dispose();
  }

  for (let pass = 0; pass < passes; pass += 1) {
    geom.computeBoundingBox();
    const box = geom.boundingBox;
    if (!box) break;
    const zPlane = plane === 'max' ? box.max.z : box.min.z;
    const eps = Math.max((box.max.z - box.min.z) * 1e-5, 1e-7);

    const pos = geom.attributes.position;
    const norm = geom.attributes.normal;
    const uv = geom.attributes.uv;
    const triCount = Math.floor(pos.count / 3);

    /** @type {number[]} */
    const newPos = [];
    /** @type {number[]} */
    const newNorm = [];
    /** @type {number[]} */
    const newUv = [];

    const edgeMid = new Map();

    const edgeMidKey = (ia, ib) => {
      const ax = pos.getX(ia);
      const ay = pos.getY(ia);
      const bx = pos.getX(ib);
      const by = pos.getY(ib);
      const k1 = `${ax.toFixed(5)},${ay.toFixed(5)}`;
      const k2 = `${bx.toFixed(5)},${by.toFixed(5)}`;
      return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
    };

    const copyVert = (srcIndex, destArrays) => {
      destArrays[0].push(pos.getX(srcIndex), pos.getY(srcIndex), pos.getZ(srcIndex));
      if (norm) {
        destArrays[1].push(norm.getX(srcIndex), norm.getY(srcIndex), norm.getZ(srcIndex));
      } else {
        destArrays[1].push(0, 0, 1);
      }
      if (uv) {
        destArrays[2].push(uv.getX(srcIndex), uv.getY(srcIndex));
      } else {
        destArrays[2].push(0, 0);
      }
    };

    const getMidIndex = (ia, ib) => {
      const key = edgeMidKey(ia, ib);
      if (edgeMid.has(key)) return edgeMid.get(key);

      const mx = (pos.getX(ia) + pos.getX(ib)) * 0.5;
      const my = (pos.getY(ia) + pos.getY(ib)) * 0.5;
      const mz = (pos.getZ(ia) + pos.getZ(ib)) * 0.5;
      const mnx = norm ? (norm.getX(ia) + norm.getX(ib)) * 0.5 : 0;
      const mny = norm ? (norm.getY(ia) + norm.getY(ib)) * 0.5 : 0;
      const mnz = norm ? (norm.getZ(ia) + norm.getZ(ib)) * 0.5 : 1;
      const mux = uv ? (uv.getX(ia) + uv.getX(ib)) * 0.5 : 0;
      const muy = uv ? (uv.getY(ia) + uv.getY(ib)) * 0.5 : 0;

      const index = newPos.length / 3;
      newPos.push(mx, my, mz);
      newNorm.push(mnx, mny, mnz);
      newUv.push(mux, muy);
      edgeMid.set(key, index);
      return index;
    };

    const pushTri = (ia, ib, ic) => {
      copyVert(ia, [newPos, newNorm, newUv]);
      copyVert(ib, [newPos, newNorm, newUv]);
      copyVert(ic, [newPos, newNorm, newUv]);
    };

    const onCapPlane = (ia, ib, ic) =>
      Math.abs(pos.getZ(ia) - zPlane) < eps &&
      Math.abs(pos.getZ(ib) - zPlane) < eps &&
      Math.abs(pos.getZ(ic) - zPlane) < eps;

    for (let t = 0; t < triCount; t += 1) {
      const ia = t * 3;
      const ib = t * 3 + 1;
      const ic = t * 3 + 2;

      if (!onCapPlane(ia, ib, ic)) {
        pushTri(ia, ib, ic);
        continue;
      }

      const mAB = getMidIndex(ia, ib);
      const mBC = getMidIndex(ib, ic);
      const mCA = getMidIndex(ic, ia);

      pushTri(ia, mAB, mCA);
      pushTri(ib, mBC, mAB);
      pushTri(ic, mCA, mBC);
      pushTri(mAB, mBC, mCA);
    }

    geom.dispose();
    geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(newNorm, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(newUv, 2));
  }

  return geom;
}

const FONT_EXTRUDE_SIDE_Z_MAX = 0.12;
const FONT_EXTRUDE_CAP_Z_MIN = 0.92;

/**
 * @param {import('three').BufferAttribute} pos
 * @param {number} ia
 * @param {number} ib
 * @param {number} ic
 * @returns {{ nx: number, ny: number, nz: number, absNz: number } | null}
 */
function fontExtrudeTriangleFaceNormal(pos, ia, ib, ic) {
  const ax = pos.getX(ia);
  const ay = pos.getY(ia);
  const az = pos.getZ(ia);
  const bx = pos.getX(ib);
  const by = pos.getY(ib);
  const bz = pos.getZ(ib);
  const cx = pos.getX(ic);
  const cy = pos.getY(ic);
  const cz = pos.getZ(ic);

  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  let fnx = uy * vz - uz * vy;
  let fny = uz * vx - ux * vz;
  let fnz = ux * vy - uy * vx;
  const len = Math.hypot(fnx, fny, fnz);
  if (len < 1e-10) return null;
  fnx /= len;
  fny /= len;
  fnz /= len;
  return { nx: fnx, ny: fny, nz: fnz, absNz: Math.abs(fnz) };
}

function forEachExtrudeTriangle(geometry, callback) {
  const pos = geometry.attributes.position;
  if (geometry.index) {
    const idx = geometry.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      callback(idx[i], idx[i + 1], idx[i + 2]);
    }
    return;
  }
  for (let t = 0; t < pos.count; t += 3) {
    callback(t, t + 1, t + 2);
  }
}

/**
 * Simple chamfer — harden every bevel shoulder face (flat chamfer shading).
 *
 * @param {import('three').BufferGeometry} geometry
 * @param {number} creaseAngleRad
 * @returns {import('three').BufferGeometry}
 */
export function hardenFontExtrudeSimpleBevelFaceNormals(geometry, creaseAngleRad) {
  if (!geometry?.attributes?.position || !geometry.attributes.normal) {
    return geometry;
  }

  const creaseDot = Math.cos(
    Number.isFinite(creaseAngleRad) ? creaseAngleRad : Math.PI / 6,
  );
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;

  const snapVertex = (index, face) => {
    const dot =
      norm.getX(index) * face.nx +
      norm.getY(index) * face.ny +
      norm.getZ(index) * face.nz;
    if (dot < creaseDot) {
      norm.setXYZ(index, face.nx, face.ny, face.nz);
    }
  };

  forEachExtrudeTriangle(geometry, (ia, ib, ic) => {
    const face = fontExtrudeTriangleFaceNormal(pos, ia, ib, ic);
    if (!face) return;
    if (
      face.absNz <= FONT_EXTRUDE_SIDE_Z_MAX ||
      face.absNz >= FONT_EXTRUDE_CAP_Z_MIN
    ) {
      return;
    }

    snapVertex(ia, face);
    snapVertex(ib, face);
    snapVertex(ic, face);
  });

  norm.needsUpdate = true;
  return geometry;
}

/**
 * Simple bevel normal pipeline on final studio-space geometry (post normalize + UVs).
 *
 * @param {import('three').BufferGeometry} geometry
 * @param {number} creaseAngleRad
 * @returns {import('three').BufferGeometry}
 */
export function applyFontExtrudeSimpleBevelNormals(geometry, creaseAngleRad) {
  if (!geometry) return geometry;

  let geom = toCreasedNormals(geometry, creaseAngleRad);
  if (geom !== geometry) {
    geometry.dispose();
  }

  hardenFontExtrudeSimpleBevelFaceNormals(geom, creaseAngleRad);
  flattenFontExtrudeSimpleBevelFrontNormals(geom);
  return geom;
}

/**
 * Hard normals on the flat front cap only (simple bevel).
 * Must run after {@link FontExtrudeImporter#_normalizeFontGeometrySpace} and
 * {@link finalizeExtrudeGroupGeometry}. Side curves use toCreasedNormals; chamfer faces hardened separately.
 *
 * @param {import('three').BufferGeometry} geometry
 * @returns {import('three').BufferGeometry}
 */
export function flattenFontExtrudeSimpleBevelFrontNormals(geometry) {
  if (!geometry?.attributes?.position || !geometry.attributes.normal) {
    return geometry;
  }

  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;

  forEachExtrudeTriangle(geometry, (ia, ib, ic) => {
    const face = fontExtrudeTriangleFaceNormal(pos, ia, ib, ic);
    if (!face || face.absNz < FONT_EXTRUDE_SIDE_Z_MAX || face.nz < FONT_EXTRUDE_CAP_Z_MIN) {
      return;
    }

    norm.setXYZ(ia, 0, 0, 1);
    norm.setXYZ(ib, 0, 0, 1);
    norm.setXYZ(ic, 0, 0, 1);
  });

  norm.needsUpdate = true;
  return geometry;
}

/** @deprecated Use {@link flattenFontExtrudeSimpleBevelFrontNormals} after geometry normalize. */
export function flattenFontExtrudeCapNormals(geometry, options = {}) {
  return flattenFontExtrudeSimpleBevelFrontNormals(geometry);
}

/**
 * @param {() => T} buildGeometry
 * @template T
 * @returns {T}
 */
export function withFontCdtCapTriangulation(buildGeometry) {
  const previous = ShapeUtils.triangulateShape;
  ShapeUtils.triangulateShape = triangulateFontCapWithCdt;
  try {
    return buildGeometry();
  } finally {
    ShapeUtils.triangulateShape = previous;
  }
}
