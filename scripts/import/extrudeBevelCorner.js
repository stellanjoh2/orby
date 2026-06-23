/** Pre-process outline paths so a uniform extrude bevel does not self-intersect. */

import * as THREE from 'three';
import { dedupeRingPoints } from './extrudeShapeSanitize.js';

const BEVEL_CORNER_SAFETY = 0.88;
const BEVEL_SUPPORT_MARGIN = 1.06;
const MAX_EDGE_CHAMFER_FRACTION = 0.62;
const MAX_CHAMFER_PASSES = 5;
/** Match ExtrudeGeometry `curveSegments` floor — do not clamp to 12 or Low/Med/High collapse. */
const BEVEL_SOFTEN_MIN_DIVISIONS = 4;

/**
 * @param {{ x: number, y: number }} p0
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @returns {{ aLen: number, bLen: number, interior: number, exteriorTurn: number }}
 */
function vertexAngles(p0, p1, p2) {
  const ax = p0.x - p1.x;
  const ay = p0.y - p1.y;
  const bx = p2.x - p1.x;
  const by = p2.y - p1.y;
  const aLen = Math.hypot(ax, ay);
  const bLen = Math.hypot(bx, by);
  if (aLen < 1e-8 || bLen < 1e-8) {
    return { aLen, bLen, interior: Math.PI, exteriorTurn: 0 };
  }
  const dot = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (aLen * bLen)));
  const interior = Math.acos(dot);
  return { aLen, bLen, interior, exteriorTurn: Math.PI - interior };
}

/**
 * @param {{ x: number, y: number }} p0
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @returns {number}
 */
function vertexBevelOffsetLimit(p0, p1, p2) {
  const { aLen, bLen, interior } = vertexAngles(p0, p1, p2);
  if (aLen < 1e-8 || bLen < 1e-8) return Infinity;
  return Math.min(aLen, bLen) * Math.tan(interior * 0.5) * BEVEL_CORNER_SAFETY;
}

/**
 * @param {{ x: number, y: number }} p0
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @returns {number}
 */
function vertexOsculatingRadius(p0, p1, p2) {
  const { aLen, bLen, exteriorTurn } = vertexAngles(p0, p1, p2);
  if (exteriorTurn < 1e-5) return Infinity;
  const sinHalf = Math.sin(exteriorTurn * 0.5);
  if (sinHalf < 1e-8) return Infinity;
  return Math.min(aLen, bLen) / (2 * sinHalf);
}

/**
 * @param {{ x: number, y: number }} prev
 * @param {{ x: number, y: number }} curr
 * @param {{ x: number, y: number }} next
 * @param {number} bevelSize
 * @returns {boolean}
 */
function vertexNeedsChamfer(prev, curr, next, bevelSize) {
  return chamferSupportLimit(prev, curr, next, 0) < bevelSize * BEVEL_SUPPORT_MARGIN;
}

/**
 * @param {{ x: number, y: number }} prev
 * @param {{ x: number, y: number }} curr
 * @param {{ x: number, y: number }} next
 * @param {number} d
 * @returns {number}
 */
function chamferSupportLimit(prev, curr, next, d) {
  if (d <= 1e-8) {
    return Math.min(
      vertexBevelOffsetLimit(prev, curr, next),
      vertexOsculatingRadius(prev, curr, next) * BEVEL_CORNER_SAFETY,
    );
  }

  const { aLen, bLen } = vertexAngles(prev, curr, next);
  if (aLen < 1e-8 || bLen < 1e-8) return 0;

  const ax = prev.x - curr.x;
  const ay = prev.y - curr.y;
  const bx = next.x - curr.x;
  const by = next.y - curr.y;
  const pa = {
    x: curr.x + (ax / aLen) * d,
    y: curr.y + (ay / aLen) * d,
  };
  const pb = {
    x: curr.x + (bx / bLen) * d,
    y: curr.y + (by / bLen) * d,
  };

  return Math.min(
    vertexBevelOffsetLimit(prev, pa, pb),
    vertexBevelOffsetLimit(pa, pb, next),
    vertexOsculatingRadius(prev, pa, pb) * BEVEL_CORNER_SAFETY,
    vertexOsculatingRadius(pa, pb, next) * BEVEL_CORNER_SAFETY,
    Math.hypot(pb.x - pa.x, pb.y - pa.y) * 0.5 * BEVEL_CORNER_SAFETY,
  );
}

/**
 * @param {{ x: number, y: number }} prev
 * @param {{ x: number, y: number }} curr
 * @param {{ x: number, y: number }} next
 * @param {number} bevelSize
 * @returns {number}
 */
function findChamferDistance(prev, curr, next, bevelSize) {
  const { aLen, bLen } = vertexAngles(prev, curr, next);
  if (aLen < 1e-8 || bLen < 1e-8) return 0;
  if (!vertexNeedsChamfer(prev, curr, next, bevelSize)) return 0;

  const target = bevelSize * BEVEL_SUPPORT_MARGIN;
  let lo = 0;
  let hi = Math.min(aLen, bLen) * MAX_EDGE_CHAMFER_FRACTION;
  for (let step = 0; step < 18; step += 1) {
    const mid = (lo + hi) * 0.5;
    if (chamferSupportLimit(prev, curr, next, mid) >= target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return lo;
}

/**
 * @param {Array<{ x: number, y: number }>} ring
 * @returns {number}
 */
function ringMinBevelSupport(ring) {
  const source = dedupeRingPoints(ring);
  if (source.length < 3) return Infinity;

  let minSupport = Infinity;
  const n = source.length;
  for (let i = 0; i < n; i += 1) {
    const prev = source[(i - 1 + n) % n];
    const curr = source[i];
    const next = source[(i + 1) % n];
    minSupport = Math.min(minSupport, chamferSupportLimit(prev, curr, next, 0));
  }
  return minSupport;
}

/**
 * @param {Array<{ x: number, y: number }>} ring
 * @param {number} bevelSize
 * @returns {{ points: Array<{ x: number, y: number }>, changed: boolean }}
 */
function chamferRingForBevel(ring, bevelSize) {
  const source = dedupeRingPoints(ring);
  if (source.length < 3 || bevelSize <= 1e-8) {
    return { points: source, changed: false };
  }

  const out = [];
  let changed = false;
  const n = source.length;

  for (let i = 0; i < n; i += 1) {
    const prev = source[(i - 1 + n) % n];
    const curr = source[i];
    const next = source[(i + 1) % n];

    const chamfer = findChamferDistance(prev, curr, next, bevelSize);
    if (chamfer <= 1e-8) {
      out.push(curr);
      continue;
    }

    const { aLen, bLen } = vertexAngles(prev, curr, next);
    const ax = prev.x - curr.x;
    const ay = prev.y - curr.y;
    const bx = next.x - curr.x;
    const by = next.y - curr.y;

    out.push(
      { x: curr.x + (ax / aLen) * chamfer, y: curr.y + (ay / aLen) * chamfer },
      { x: curr.x + (bx / bLen) * chamfer, y: curr.y + (by / bLen) * chamfer },
    );
    changed = true;
  }

  return { points: dedupeRingPoints(out), changed };
}

/**
 * @param {Array<{ x: number, y: number }>} ring
 * @param {number} bevelSize
 * @returns {Array<{ x: number, y: number }>}
 */
function softenRingForBevel(ring, bevelSize) {
  let points = dedupeRingPoints(ring);
  if (points.length < 3) return points;

  const target = bevelSize * BEVEL_SUPPORT_MARGIN;
  for (let pass = 0; pass < MAX_CHAMFER_PASSES; pass += 1) {
    if (ringMinBevelSupport(points) >= target) break;
    const result = chamferRingForBevel(points, bevelSize);
    if (!result.changed) break;
    points = result.points;
  }

  return points;
}

/**
 * @param {Array<{ x: number, y: number }>} points
 * @returns {THREE.Path}
 */
function ringToPath(points) {
  const path = new THREE.Path();
  path.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    path.lineTo(points[i].x, points[i].y);
  }
  return path;
}

/**
 * @param {Array<{ x: number, y: number }>} outer
 * @param {Array<Array<{ x: number, y: number }>>} holes
 * @returns {THREE.Shape}
 */
function shapeFromRings(outer, holes) {
  const rebuilt = new THREE.Shape();
  rebuilt.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i += 1) {
    rebuilt.lineTo(outer[i].x, outer[i].y);
  }
  for (const hole of holes) {
    if (hole?.length >= 3) {
      rebuilt.holes.push(ringToPath(hole));
    }
  }
  return rebuilt;
}

/**
 * Prepare outline for uniform extrude bevel — chamfer sharp corners and tight bends,
 * then rebuild from the same sampled polyline ExtrudeGeometry will walk.
 *
 * @param {import('three').Shape} shape
 * @param {number} bevelSize
 * @param {number} [sampleDivisions]
 * @returns {import('three').Shape}
 */
export function softenFontExtrudeShapeForBevel(shape, bevelSize, sampleDivisions = 12) {
  if (!shape?.extractPoints || !Number.isFinite(bevelSize) || bevelSize <= 1e-8) {
    return shape;
  }

  const divisions = Math.max(
    BEVEL_SOFTEN_MIN_DIVISIONS,
    Math.round(Number(sampleDivisions) || BEVEL_SOFTEN_MIN_DIVISIONS),
  );
  const extracted = shape.extractPoints(divisions);
  const outer = extracted?.shape || [];
  if (outer.length < 3) return shape;

  const softenedOuter = softenRingForBevel(outer, bevelSize);
  const softenedHoles = (extracted?.holes || []).map((hole) => softenRingForBevel(hole, bevelSize));

  return shapeFromRings(softenedOuter, softenedHoles);
}
