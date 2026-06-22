/**
 * Cap triangulation for concentric single-hole rings (O, 0, circular counters).
 * Earcut fans extra boundary verts into a few hubs as detail rises; annulus quads
 * add one attachment per outer edge so Ultra spreads evenly around the ring.
 */

import { ShapeUtils } from 'three';

const originalTriangulateShape = ShapeUtils.triangulateShape.bind(ShapeUtils);

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const TAU = Math.PI * 2;
const DUP_EPS = 1e-5;

function ringCentroid(ring) {
  if (!ring?.length) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of ring) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / ring.length, y: sy / ring.length };
}

function polarAngle(point, center) {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

function angleDelta(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function normalizeAngle(angle) {
  let a = angle;
  while (a <= -Math.PI) a += TAU;
  while (a > Math.PI) a -= TAU;
  return a;
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

function meanHoleRadius(hole, center) {
  if (!hole?.length) return 0;
  let total = 0;
  for (const p of hole) total += dist(p, center);
  return total / hole.length;
}

/** Outer boundary is a fairly uniform ring around the hole — not P, e, B, etc. */
function isRoughRing(outer, holeCenter, holeRadius) {
  const radii = outer.map((p) => dist(p, holeCenter));
  const minR = Math.min(...radii);
  const maxR = Math.max(...radii);
  if (minR < holeRadius * 1.03) return false;
  const meanR = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
  return (maxR - minR) / Math.max(meanR, 1e-6) < 0.45;
}

function isConcentricSingleHole(outer, hole) {
  const outerCenter = ringCentroid(outer);
  const holeCenter = ringCentroid(hole);
  if (!pointInRing(holeCenter, outer)) return false;
  const holeRadius = meanHoleRadius(hole, holeCenter);
  if (holeRadius <= 0) return false;
  if (dist(outerCenter, holeCenter) > holeRadius * 0.4) return false;
  return isRoughRing(outer, holeCenter, holeRadius);
}

function outerEdgeMidAngle(a0, a1) {
  let mid = (a0 + a1) * 0.5;
  if (angleDelta(a0, a1) > Math.PI) mid = normalizeAngle(mid + Math.PI);
  return normalizeAngle(mid);
}

function angleInSpan(target, start, end) {
  let t = normalizeAngle(target);
  let s = normalizeAngle(start);
  let e = normalizeAngle(end);
  if (e < s) e += TAU;
  if (t < s) t += TAU;
  return t >= s && t <= e;
}

function findHoleEdgeForAngle(holeSorted, targetAngle) {
  if (!holeSorted.length) return null;
  for (let i = 0; i < holeSorted.length; i += 1) {
    const j = (i + 1) % holeSorted.length;
    if (angleInSpan(targetAngle, holeSorted[i].angle, holeSorted[j].angle)) {
      return { h0: holeSorted[i].index, h1: holeSorted[j].index };
    }
  }
  let best = 0;
  let bestDelta = angleDelta(holeSorted[0].angle, targetAngle);
  for (let i = 1; i < holeSorted.length; i += 1) {
    const delta = angleDelta(holeSorted[i].angle, targetAngle);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  const j = (best + 1) % holeSorted.length;
  return { h0: holeSorted[best].index, h1: holeSorted[j].index };
}

function isDuplicateClosingIndex(outer, index) {
  return index > 0
    && index === outer.length - 1
    && dist(outer[0], outer[index]) < DUP_EPS;
}

function buildSortedOuterEntries(outer, center) {
  const entries = [];
  for (let index = 0; index < outer.length; index += 1) {
    if (isDuplicateClosingIndex(outer, index)) continue;
    entries.push({ index, angle: polarAngle(outer[index], center) });
  }
  entries.sort((a, b) => a.angle - b.angle);
  if (entries.length > 2 && dist(outer[entries[0].index], outer[entries.at(-1).index]) < DUP_EPS) {
    entries.pop();
  }
  return entries;
}

function triangleArea2(a, b, c) {
  return Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
}

function validateCapFaces(faces, contourLength, holes) {
  if (!faces?.length) return false;
  const holeLen = (holes || []).reduce((sum, hole) => sum + (hole?.length || 0), 0);
  const maxIndex = contourLength + holeLen - 1;
  for (const face of faces) {
    if (!Array.isArray(face) || face.length !== 3) return false;
    for (const index of face) {
      if (!Number.isInteger(index) || index < 0 || index > maxIndex) return false;
    }
  }
  return true;
}

function pushCapTriangle(faces, a, b, c, allPoints) {
  if (a === b || b === c || c === a) return;
  const pa = allPoints[a];
  const pb = allPoints[b];
  const pc = allPoints[c];
  if (!pa || !pb || !pc) return;
  if (!Number.isFinite(pa.x) || !Number.isFinite(pa.y)) return;
  if (!Number.isFinite(pb.x) || !Number.isFinite(pb.y)) return;
  if (!Number.isFinite(pc.x) || !Number.isFinite(pc.y)) return;
  if (triangleArea2(pa, pb, pc) < 1e-10) return;

  faces.push([a, b, c]);
}

function capEdgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Every outer boundary edge must appear in at least one cap triangle — otherwise
 * ExtrudeGeometry leaves a wedge gap that reads as a missing side face at some angles.
 *
 * @param {number[][]} faces
 * @param {{ x: number, y: number }[]} outer
 * @param {Array<{ index: number }>} outerSorted
 * @returns {boolean}
 */
function annulusCoversAllOuterEdges(faces, outer, outerSorted) {
  const covered = new Set();
  for (const face of faces) {
    if (!face || face.length !== 3) continue;
    covered.add(capEdgeKey(face[0], face[1]));
    covered.add(capEdgeKey(face[1], face[2]));
    covered.add(capEdgeKey(face[2], face[0]));
  }

  for (let i = 0; i < outerSorted.length; i += 1) {
    const j = (i + 1) % outerSorted.length;
    const o0 = outerSorted[i].index;
    const o1 = outerSorted[j].index;
    if (o0 === o1 || dist(outer[o0], outer[o1]) < DUP_EPS) continue;
    if (!covered.has(capEdgeKey(o0, o1))) return false;
  }
  return true;
}

/**
 * @param {{ x: number, y: number }[]} outer
 * @param {{ x: number, y: number }[]} hole
 * @param {{ x: number, y: number }} center
 * @returns {number[][] | null}
 */
export function triangulateSingleHoleAnnulusStrip(outer, hole, center) {
  if (outer.length < 3 || hole.length < 3) return null;

  const outerSorted = buildSortedOuterEntries(outer, center);
  const holeSorted = hole
    .map((p, index) => ({ index, angle: polarAngle(p, center) }))
    .sort((a, b) => a.angle - b.angle);

  if (outerSorted.length < 3 || holeSorted.length < 3) return null;

  const faces = [];
  const holeOffset = outer.length;
  const allPoints = [...outer, ...hole];

  for (let i = 0; i < outerSorted.length; i += 1) {
    const j = (i + 1) % outerSorted.length;
    const o0 = outerSorted[i].index;
    const o1 = outerSorted[j].index;
    if (o0 === o1 || dist(outer[o0], outer[o1]) < DUP_EPS) continue;

    const holeEdge = findHoleEdgeForAngle(
      holeSorted,
      outerEdgeMidAngle(outerSorted[i].angle, outerSorted[j].angle),
    );
    if (!holeEdge) continue;

    const hi0 = holeOffset + holeEdge.h0;
    const hi1 = holeOffset + holeEdge.h1;
    if (holeEdge.h0 === holeEdge.h1) {
      pushCapTriangle(faces, o0, o1, hi0, allPoints);
      continue;
    }

    pushCapTriangle(faces, o0, o1, hi1, allPoints);
    pushCapTriangle(faces, o0, hi1, hi0, allPoints);
  }

  if (!annulusCoversAllOuterEdges(faces, outer, outerSorted)) return null;

  const minFaces = Math.max(3, outerSorted.length * 2);
  if (faces.length < minFaces * 0.75) return null;

  return faces.length >= 3 ? faces : null;
}

/**
 * @param {{ x: number, y: number }[]} contour
 * @param {Array<{ x: number, y: number }[]>} holes
 * @returns {number[][] | null}
 */
export function triangulateHoledCap(contour, holes) {
  if (holes?.length !== 1) return null;
  if (contour.length < 3 || holes[0].length < 3) return null;
  if (!isConcentricSingleHole(contour, holes[0])) return null;

  const center = ringCentroid(holes[0]);
  return triangulateSingleHoleAnnulusStrip(contour, holes[0], center);
}

/**
 * @param {{ x: number, y: number }[]} contour
 * @param {Array<{ x: number, y: number }[]>} holes
 * @returns {boolean}
 */
export function isConcentricSingleHoleRing(contour, holes) {
  if (holes?.length !== 1) return false;
  if (contour.length < 3 || holes[0].length < 3) return false;
  return isConcentricSingleHole(contour, holes[0]);
}

let patchInstalled = false;

function patchedTriangulateShape(contour, holes) {
  if (holes?.length === 1) {
    const annulus = triangulateHoledCap(contour, holes);
    if (annulus?.length && validateCapFaces(annulus, contour.length, holes)) {
      return annulus;
    }
  }
  return originalTriangulateShape(contour, holes);
}

export function installExtrudeCapTriangulationPatch() {
  if (patchInstalled) return;
  patchInstalled = true;
  ShapeUtils.triangulateShape = patchedTriangulateShape;
}

/** Scope custom cap triangulation to one extrude (SVG only — font uses stock Earcut). */
export function withPatchedCapTriangulation(buildGeometry) {
  const previous = ShapeUtils.triangulateShape;
  ShapeUtils.triangulateShape = patchedTriangulateShape;
  try {
    return buildGeometry();
  } finally {
    ShapeUtils.triangulateShape = previous;
  }
}

/** Run extrude with stock Earcut caps (fallback when annulus produces spikes). */
export function withStockCapTriangulation(buildGeometry) {
  const patched = ShapeUtils.triangulateShape;
  ShapeUtils.triangulateShape = originalTriangulateShape;
  try {
    return buildGeometry();
  } finally {
    ShapeUtils.triangulateShape = patched;
  }
}

export { originalTriangulateShape };
