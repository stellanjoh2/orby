import {
  geometryHasNaNPositions,
  geometryHasSpikeEdges,
} from './extrudeShapeSanitize.js';

/** Only used to rank strategies — never hard-reject on spikes alone. */
const FONT_EXTRUDE_SPIKE_RATIO = 12;

function signedArea2D(points) {
  if (!points?.length || points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum * 0.5;
}

function ringCentroid(points) {
  if (!points?.length) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
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

/**
 * toShapes() sometimes returns nested contours as two solids — looks like a filled counter.
 *
 * @param {import('three').Shape[]} shapes
 * @param {number} [curveSegments]
 * @returns {boolean}
 */
export function fontExtrudeHasUnmergedNestedShapes(shapes, curveSegments = 12) {
  if (!shapes || shapes.length < 2) return false;

  const sampleDivisions = Math.max(16, Math.round(Number(curveSegments) || 12));
  const entries = shapes
    .map((shape) => {
      const pts = shape.extractPoints(sampleDivisions)?.shape || [];
      return { shape, pts, area: Math.abs(signedArea2D(pts)) };
    })
    .filter((entry) => entry.pts.length >= 3);

  if (entries.length < 2) return false;
  entries.sort((a, b) => b.area - a.area);

  for (let o = 0; o < entries.length; o += 1) {
    const outer = entries[o];
    for (let h = o + 1; h < entries.length; h += 1) {
      const inner = entries[h];
      const centroid = ringCentroid(inner.pts);
      if (!pointInRing(centroid, outer.pts)) continue;
      if (inner.area / Math.max(outer.area, 1e-6) > 0.92) continue;
      return true;
    }
  }

  return false;
}

/**
 * @param {import('three').BufferGeometry | null | undefined} geometry
 * @returns {boolean}
 */
export function isValidFontExtrudeGeometry(geometry) {
  if (geometryHasNaNPositions(geometry)) return false;

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return false;

  const sizeX = box.max.x - box.min.x;
  const sizeY = box.max.y - box.min.y;
  const sizeZ = box.max.z - box.min.z;
  if (!Number.isFinite(sizeX) || !Number.isFinite(sizeY) || !Number.isFinite(sizeZ)) return false;
  if (sizeX <= 1e-8 || sizeY <= 1e-8 || sizeZ <= 1e-8) return false;

  return true;
}

/**
 * Holed glyph with wrong winding fills the counter on caps (inverted "o").
 *
 * @param {import('three').BufferGeometry} geometry
 * @param {import('three').Shape} shape
 * @param {number} [curveSegments]
 * @returns {boolean}
 */
export function fontExtrudeHoleCapLooksFilled(geometry, shape, curveSegments = 12) {
  if (!shape?.holes?.length || !geometry?.attributes?.position) return false;

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return false;

  const zmax = box.max.z;
  const zmin = box.min.z;
  const thickness = zmax - zmin;
  const capPlaneEps = Math.max(thickness * 1e-4, 1e-7);
  const pos = geometry.attributes.position;

  const extracted = shape.extractPoints(Math.max(4, Math.round(Number(curveSegments) || 12)));
  const holeRings = extracted?.holes || [];
  if (!holeRings.length) return false;

  const pointInTriangle2D = (px, py, ax, ay, bx, by, cx, cy) => {
    const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(denom) < 1e-12) return false;
    const a = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denom;
    const b = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denom;
    const c = 1 - a - b;
    return a >= -1e-4 && b >= -1e-4 && c >= -1e-4;
  };

  const capCoversPoint = (px, py, zPlane) => {
    const onPlane = (z) => Math.abs(z - zPlane) < capPlaneEps;
    const checkTri = (ia, ib, ic) => {
      const ax = pos.getX(ia);
      const ay = pos.getY(ia);
      const az = pos.getZ(ia);
      const bx = pos.getX(ib);
      const by = pos.getY(ib);
      const bz = pos.getZ(ib);
      const cx = pos.getX(ic);
      const cy = pos.getY(ic);
      const cz = pos.getZ(ic);
      if (!onPlane(az) || !onPlane(bz) || !onPlane(cz)) return false;
      return pointInTriangle2D(px, py, ax, ay, bx, by, cx, cy);
    };

    if (geometry.index) {
      const idx = geometry.index.array;
      for (let i = 0; i < idx.length; i += 3) {
        if (checkTri(idx[i], idx[i + 1], idx[i + 2])) return true;
      }
    } else {
      for (let t = 0; t < pos.count; t += 3) {
        if (checkTri(t, t + 1, t + 2)) return true;
      }
    }
    return false;
  };

  for (const holeRing of holeRings) {
    if (!holeRing?.length || holeRing.length < 3) continue;
    let sx = 0;
    let sy = 0;
    for (const p of holeRing) {
      sx += p.x;
      sy += p.y;
    }
    const px = sx / holeRing.length;
    const py = sy / holeRing.length;
    if (capCoversPoint(px, py, zmax) || capCoversPoint(px, py, zmin)) {
      return true;
    }
  }

  return false;
}

/**
 * Rank extrude candidates — higher is better.
 *
 * @param {import('three').BufferGeometry[]} geometries
 * @param {import('three').Shape[]} shapes
 * @param {number} curveSegments
 * @param {number} [creaseAngleRad]
 * @returns {number}
 */
export function scoreFontExtrudeStrategy(geometries, shapes, curveSegments, creaseAngleRad = NaN) {
  if (fontExtrudeHasUnmergedNestedShapes(shapes, curveSegments)) return -1000;

  let score = 0;
  for (let i = 0; i < geometries.length; i += 1) {
    const shape = shapes[i];
    let geometry = geometries[i];
    if (!isValidFontExtrudeGeometry(geometry)) return -1000;

    let scoredGeometry = geometry;
    let ownedGeometry = null;
    if (shape?.holes?.length) {
      ownedGeometry = geometry.clone();
      scoredGeometry = ownedGeometry;
    }

    if (fontExtrudeHoleCapLooksFilled(scoredGeometry, shape, curveSegments)) {
      if (ownedGeometry) ownedGeometry.dispose();
      return -1000;
    }

    if (ownedGeometry) ownedGeometry.dispose();
    if (geometryHasSpikeEdges(geometry, FONT_EXTRUDE_SPIKE_RATIO)) score -= 40;
    score += 10;
  }
  return score;
}
