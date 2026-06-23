/**
 * Font extrude cap mesh — Constrained Delaunay (cdt2d) instead of Earcut fan triangulation.
 * Scoped to font builds via {@link withFontCdtCapTriangulation}; SVG extrude is unchanged.
 */

import cdt2d from '../vendor/cdt2d.module.js';
import { ShapeUtils } from 'three';
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
