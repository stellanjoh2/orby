import * as THREE from 'three';

const DUP_EPS = 1e-5;

/**
 * Remove consecutive duplicates and closing repeats.
 * ExtrudeGeometry bevel math divides by edge length — zero-length edges → NaN positions.
 *
 * @param {THREE.Vector2[]} points
 * @returns {THREE.Vector2[]}
 */
export function dedupeRingPoints(points) {
  const source = Array.isArray(points) ? points : [];
  if (!source.length) return [];

  const out = [];
  for (const p of source) {
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue;
    const next = p.clone ? p.clone() : new THREE.Vector2(p.x, p.y);
    const prev = out[out.length - 1];
    if (prev && prev.distanceToSquared(next) < DUP_EPS * DUP_EPS) continue;
    out.push(next);
  }

  while (out.length > 2 && out[0].distanceToSquared(out[out.length - 1]) < DUP_EPS * DUP_EPS) {
    out.pop();
  }

  return out.length >= 3 ? out : source;
}

/**
 * Rebuild a shape from sampled points with clean rings for ExtrudeGeometry.
 *
 * @param {THREE.Shape} shape
 * @param {number} [curveSegments]
 * @returns {THREE.Shape}
 */
export function sanitizeShapeForExtrudeGeometry(shape, curveSegments = 12) {
  if (!shape?.extractPoints) return shape;

  const divisions = Math.max(4, Math.round(Number(curveSegments) || 12));
  const extracted = shape.extractPoints(divisions);
  const contour = dedupeRingPoints(extracted?.shape || []);
  if (contour.length < 3) return shape;

  const rebuilt = new THREE.Shape();
  rebuilt.moveTo(contour[0].x, contour[0].y);
  for (let i = 1; i < contour.length; i += 1) {
    rebuilt.lineTo(contour[i].x, contour[i].y);
  }

  for (const hole of extracted?.holes || []) {
    const holePts = dedupeRingPoints(hole);
    if (holePts.length < 3) continue;
    const holePath = new THREE.Path();
    holePath.moveTo(holePts[0].x, holePts[0].y);
    for (let i = 1; i < holePts.length; i += 1) {
      holePath.lineTo(holePts[i].x, holePts[i].y);
    }
    rebuilt.holes.push(holePath);
  }

  return rebuilt;
}

/**
 * @param {THREE.BufferGeometry | null | undefined} geometry
 * @returns {boolean}
 */
export function geometryHasNaNPositions(geometry) {
  const arr = geometry?.attributes?.position?.array;
  if (!arr?.length) return true;
  for (let i = 0; i < arr.length; i += 1) {
    if (!Number.isFinite(arr[i])) return true;
  }
  return false;
}

/**
 * Detect cap/side spikes — vertices far from the bulk of the mesh (shooting triangles).
 *
 * @param {THREE.BufferGeometry | null | undefined} geometry
 * @param {number} [spikeRatio]
 * @returns {boolean}
 */
export function geometryHasSpikeEdges(geometry, spikeRatio = 5) {
  const arr = geometry?.attributes?.position?.array;
  if (!arr?.length || arr.length < 9) return false;

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return false;

  const cx = (box.min.x + box.max.x) * 0.5;
  const cy = (box.min.y + box.max.y) * 0.5;
  const cz = (box.min.z + box.max.z) * 0.5;
  const sizeX = box.max.x - box.min.x;
  const sizeY = box.max.y - box.min.y;
  const sizeZ = box.max.z - box.min.z;
  const bulkRadius = Math.max(sizeX, sizeY, sizeZ, 1e-6) * 0.55;
  const capEdgeLimit = Math.hypot(sizeX, sizeY) * 0.42;
  const zThickness = Math.max(sizeZ, 1e-6);
  const capPlaneEps = Math.max(zThickness * 1e-4, 1e-7);

  const dists = [];
  for (let i = 0; i < arr.length; i += 3) {
    if (!Number.isFinite(arr[i]) || !Number.isFinite(arr[i + 1]) || !Number.isFinite(arr[i + 2])) {
      return true;
    }
    dists.push(Math.hypot(arr[i] - cx, arr[i + 1] - cy, arr[i + 2] - cz));
  }

  dists.sort((a, b) => a - b);
  const median = dists[Math.floor(dists.length * 0.5)] || 0;
  const max = dists[dists.length - 1] || 0;
  const baseline = Math.max(median, bulkRadius * 0.35, 1e-6);
  if (max > baseline * spikeRatio) return true;

  const pos = geometry.attributes.position;
  const triangleEdge = (ia, ib) => Math.hypot(
    pos.getX(ia) - pos.getX(ib),
    pos.getY(ia) - pos.getY(ib),
    pos.getZ(ia) - pos.getZ(ib),
  );
  const triangleArea2 = (ia, ib, ic) => {
    const ax = pos.getX(ia);
    const ay = pos.getY(ia);
    const bx = pos.getX(ib);
    const by = pos.getY(ib);
    const cx2 = pos.getX(ic);
    const cy2 = pos.getY(ic);
    return Math.abs((bx - ax) * (cy2 - ay) - (cx2 - ax) * (by - ay));
  };
  const onCapPlane = (zPlane, ia, ib, ic) =>
    Math.abs(pos.getZ(ia) - zPlane) < capPlaneEps
    && Math.abs(pos.getZ(ib) - zPlane) < capPlaneEps
    && Math.abs(pos.getZ(ic) - zPlane) < capPlaneEps;

  const zmin = box.min.z;
  const zmax = box.max.z;
  const checkCapTriangle = (ia, ib, ic) => {
    const d01 = triangleEdge(ia, ib);
    const d12 = triangleEdge(ib, ic);
    const d20 = triangleEdge(ic, ia);
    const maxEdge = Math.max(d01, d12, d20);
    const area2 = triangleArea2(ia, ib, ic);
    const charLength = Math.sqrt(Math.max(area2, 1e-12));
    if (maxEdge > capEdgeLimit && maxEdge > charLength * 6) return true;
    if (area2 < 1e-10 && maxEdge > capEdgeLimit * 0.08) return true;
    return false;
  };

  if (geometry.index) {
    const idx = geometry.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const ia = idx[i];
      const ib = idx[i + 1];
      const ic = idx[i + 2];
      if (!onCapPlane(zmax, ia, ib, ic) && !onCapPlane(zmin, ia, ib, ic)) continue;
      if (checkCapTriangle(ia, ib, ic)) return true;
    }
  } else {
    for (let t = 0; t < pos.count; t += 3) {
      const ia = t;
      const ib = t + 1;
      const ic = t + 2;
      if (!onCapPlane(zmax, ia, ib, ic) && !onCapPlane(zmin, ia, ib, ic)) continue;
      if (checkCapTriangle(ia, ib, ic)) return true;
    }
  }

  return false;
}
