import * as THREE from 'three';
import { isConcentricSingleHoleRing } from './extrudeCapTriangulation.js';
import { dedupeRingPoints } from './extrudeShapeSanitize.js';

const DENSIFY_MIN_SEGMENTS = 40;
const DENSIFY_MAX_SEGMENTS = 120;
const DENSIFY_MAX_POINTS_PER_RING = 3000;

/**
 * @param {THREE.Vector2[]} ring
 * @returns {THREE.Vector2[]}
 */
function ringBasePoints(ring) {
  const source = Array.isArray(ring) ? ring : [];
  if (source.length < 2) return [];
  const closed =
    source.length > 2 &&
    source[0].distanceToSquared(source[source.length - 1]) < 1e-10;
  return closed ? source.slice(0, -1) : source.slice();
}

/**
 * @param {THREE.Vector2[]} ring
 * @param {number} targetSegmentLength
 * @param {number} [maxPoints]
 * @returns {THREE.Vector2[]}
 */
function densifyRing(ring, targetSegmentLength, maxPoints = DENSIFY_MAX_POINTS_PER_RING) {
  const source = Array.isArray(ring) ? ring : [];
  if (source.length < 2 || !Number.isFinite(targetSegmentLength) || targetSegmentLength <= 0) {
    return source;
  }

  const base = ringBasePoints(source);
  if (base.length < 2) return source;

  const dense = [];
  const edgeCount = base.length;
  for (let i = 0; i < edgeCount; i += 1) {
    const a = base[i];
    const b = base[(i + 1) % edgeCount];
    if (!a || !b) continue;
    dense.push(new THREE.Vector2(a.x, a.y));
    const edgeLen = a.distanceTo(b);
    const steps = Math.max(1, Math.ceil(edgeLen / targetSegmentLength));
    for (let s = 1; s < steps; s += 1) {
      if (dense.length >= maxPoints) break;
      const t = s / steps;
      dense.push(new THREE.Vector2(
        THREE.MathUtils.lerp(a.x, b.x, t),
        THREE.MathUtils.lerp(a.y, b.y, t),
      ));
    }
    if (dense.length >= maxPoints) break;
  }

  return dense.length >= 3 ? dense : source;
}

/**
 * @param {THREE.Vector2[]} ring
 * @returns {number}
 */
function ringPerimeter(ring) {
  const base = ringBasePoints(ring);
  if (base.length < 2) return 0;

  let total = 0;
  for (let i = 0; i < base.length; i += 1) {
    const a = base[i];
    const b = base[(i + 1) % base.length];
    if (!a || !b) continue;
    total += a.distanceTo(b);
  }
  return total;
}

/**
 * @param {THREE.Vector2[]} base
 * @param {number} distance
 * @returns {THREE.Vector2}
 */
function pointOnRingAtDistance(base, distance) {
  const perimeter = ringPerimeter(base);
  if (perimeter <= 0 || !base.length) {
    const p0 = base[0];
    return new THREE.Vector2(p0?.x || 0, p0?.y || 0);
  }

  let target = distance % perimeter;
  if (target < 0) target += perimeter;

  let walked = 0;
  for (let i = 0; i < base.length; i += 1) {
    const a = base[i];
    const b = base[(i + 1) % base.length];
    const edgeLen = a.distanceTo(b);
    if (walked + edgeLen >= target || i === base.length - 1) {
      const t = edgeLen > 0 ? (target - walked) / edgeLen : 0;
      return new THREE.Vector2(
        THREE.MathUtils.lerp(a.x, b.x, THREE.MathUtils.clamp(t, 0, 1)),
        THREE.MathUtils.lerp(a.y, b.y, THREE.MathUtils.clamp(t, 0, 1)),
      );
    }
    walked += edgeLen;
  }

  const p0 = base[0];
  return new THREE.Vector2(p0.x, p0.y);
}

/**
 * Even arc-length resampling — keeps outer/hole vertex counts matched on annuli.
 *
 * @param {THREE.Vector2[]} ring
 * @param {number} count
 * @returns {THREE.Vector2[]}
 */
function resampleClosedRing(ring, count) {
  const base = ringBasePoints(ring);
  const segments = Math.round(Number(count) || 0);
  if (base.length < 3 || segments < 3) return ring;

  const perimeter = ringPerimeter(base);
  if (perimeter <= 0) return ring;

  const out = [];
  for (let i = 0; i < segments; i += 1) {
    out.push(pointOnRingAtDistance(base, (i / segments) * perimeter));
  }
  return out.length >= 3 ? out : ring;
}

/**
 * @param {THREE.Vector2[]} contour
 * @param {THREE.Path} rebuilt
 */
function appendRingToShape(contour, rebuilt) {
  if (contour.length < 3) return;
  rebuilt.moveTo(contour[0].x, contour[0].y);
  for (let i = 1; i < contour.length; i += 1) {
    rebuilt.lineTo(contour[i].x, contour[i].y);
  }
}

/**
 * Moderate edge densification before extrude caps (stock Earcut).
 *
 * @param {THREE.Shape} shape
 * @param {{ extractDivisions?: number, ringSegments?: number }} [detailSettings]
 * @returns {THREE.Shape}
 */
export function densifyShapeForExtrudeCaps(shape, detailSettings = {}) {
  if (!shape?.extractPoints) return shape;

  const extractDivisions = Math.max(
    8,
    Math.round(Number(detailSettings.extractDivisions) || 24),
  );
  const maxSegments = Math.max(
    8,
    Math.round(Number(detailSettings.ringSegments) || DENSIFY_MAX_SEGMENTS),
  );
  const extracted = shape.extractPoints(extractDivisions);
  const contour = extracted?.shape || [];
  if (!contour.length) return shape;

  const bounds = new THREE.Box2();
  bounds.makeEmpty();
  contour.forEach((p) => bounds.expandByPoint(p));
  if (bounds.isEmpty()) return shape;

  const size = new THREE.Vector2();
  bounds.getSize(size);
  const maxDim = Math.max(size.x, size.y);
  if (!Number.isFinite(maxDim) || maxDim <= 0) return shape;

  const contourPerimeter = ringPerimeter(contour);
  const segmentFloor = Math.min(DENSIFY_MIN_SEGMENTS, maxSegments);
  const byPerimeter = THREE.MathUtils.clamp(
    Math.round(contourPerimeter * 0.2),
    segmentFloor,
    maxSegments,
  );
  const byDimension = THREE.MathUtils.clamp(
    Math.round(maxDim * 0.45),
    segmentFloor,
    maxSegments,
  );
  const desiredSegments = Math.min(
    maxSegments,
    Math.max(byPerimeter, byDimension),
  );

  const holes = extracted?.holes || [];
  const useMatchedResample = holes.length === 1 && isConcentricSingleHoleRing(contour, holes);

  let denseContour;
  const denseHoles = [];

  if (useMatchedResample) {
    denseContour = dedupeRingPoints(resampleClosedRing(contour, desiredSegments));
    const denseHole = dedupeRingPoints(resampleClosedRing(holes[0], desiredSegments));
    if (denseHole.length >= 3) denseHoles.push(denseHole);
  } else {
    const targetSegmentLength = contourPerimeter > 0
      ? contourPerimeter / desiredSegments
      : maxDim / desiredSegments;
    denseContour = dedupeRingPoints(densifyRing(contour, targetSegmentLength));
    holes.forEach((hole) => {
      const denseHole = dedupeRingPoints(densifyRing(hole, targetSegmentLength));
      if (denseHole.length >= 3) denseHoles.push(denseHole);
    });
  }

  if (denseContour.length < 3) return shape;

  const rebuilt = new THREE.Shape();
  appendRingToShape(denseContour, rebuilt);

  denseHoles.forEach((denseHole) => {
    const holePath = new THREE.Path();
    holePath.moveTo(denseHole[0].x, denseHole[0].y);
    for (let i = 1; i < denseHole.length; i += 1) {
      holePath.lineTo(denseHole[i].x, denseHole[i].y);
    }
    rebuilt.holes.push(holePath);
  });

  return rebuilt;
}

/**
 * @param {THREE.Shape} shape
 * @returns {boolean}
 */
export function shapeHasHoles(shape) {
  return !!(shape?.holes?.length);
}
