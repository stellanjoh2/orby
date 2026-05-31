import * as THREE from 'three';

const DENSIFY_MIN_SEGMENTS = 40;
const DENSIFY_MAX_SEGMENTS = 120;
const DENSIFY_MAX_POINTS_PER_RING = 3000;

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

  const closed =
    source.length > 2 &&
    source[0].distanceToSquared(source[source.length - 1]) < 1e-10;
  const base = closed ? source.slice(0, -1) : source.slice();
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
  const source = Array.isArray(ring) ? ring : [];
  if (source.length < 2) return 0;
  const closed =
    source.length > 2 &&
    source[0].distanceToSquared(source[source.length - 1]) < 1e-10;
  const base = closed ? source.slice(0, -1) : source.slice();
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
 * Moderate edge densification before extrude caps.
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
    DENSIFY_MIN_SEGMENTS,
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
  const byPerimeter = THREE.MathUtils.clamp(
    Math.round(contourPerimeter * 0.2),
    DENSIFY_MIN_SEGMENTS,
    DENSIFY_MAX_SEGMENTS,
  );
  const byDimension = THREE.MathUtils.clamp(
    Math.round(maxDim * 0.45),
    DENSIFY_MIN_SEGMENTS,
    DENSIFY_MAX_SEGMENTS,
  );
  const desiredSegments = Math.min(
    maxSegments,
    Math.max(byPerimeter, byDimension),
  );
  const targetSegmentLength = contourPerimeter > 0
    ? contourPerimeter / desiredSegments
    : maxDim / desiredSegments;

  const denseContour = densifyRing(contour, targetSegmentLength);
  if (denseContour.length < 3) return shape;

  const rebuilt = new THREE.Shape();
  rebuilt.moveTo(denseContour[0].x, denseContour[0].y);
  for (let i = 1; i < denseContour.length; i += 1) {
    rebuilt.lineTo(denseContour[i].x, denseContour[i].y);
  }

  (extracted?.holes || []).forEach((hole) => {
    const denseHole = densifyRing(hole, targetSegmentLength);
    if (denseHole.length < 3) return;
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
