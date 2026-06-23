/**
 * THREE.ExtrudeGeometry can produce inverted winding on cap triangles for shapes with
 * interior holes (e.g. "0"), while solid glyphs stay consistent. That yields flipped face
 * normals on the annulus only. Re-orient top/bottom cap triangles so outward-facing normals
 * align with +Z on the max-Z plane and -Z on the min-Z plane (after SvgExtrudeImporter
 * normalization / offsets).
 *
 * Winding fix only — caller flattens cap vertex normals afterward (no computeVertexNormals).
 *
 * @param {import('three').BufferGeometry} geometry
 * @returns {import('three').BufferGeometry}
 */
export function fixExtrudedSvgCapFaceOrientations(geometry) {
  if (!geometry?.attributes?.position) return geometry;

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const zmin = box.min.z;
  const zmax = box.max.z;
  const thickness = zmax - zmin;
  if (!Number.isFinite(thickness) || thickness <= 0) return geometry;

  const eps = Math.max(thickness * 1e-5, 1e-7);
  const pos = geometry.attributes.position;

  const triangleNormalZ = (ia, ib, ic) => {
    const ax = pos.getX(ia);
    const ay = pos.getY(ia);
    const az = pos.getZ(ia);
    const bx = pos.getX(ib);
    const by = pos.getY(ib);
    const bz = pos.getZ(ib);
    const cx = pos.getX(ic);
    const cy = pos.getY(ic);
    const cz = pos.getZ(ic);
    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;
    return e1x * e2y - e1y * e2x;
  };

  const onPlane = (zPlane, az, bz, cz) =>
    Math.abs(az - zPlane) < eps && Math.abs(bz - zPlane) < eps && Math.abs(cz - zPlane) < eps;

  if (geometry.index) {
    const idx = geometry.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const ia = idx[i];
      const ib = idx[i + 1];
      const ic = idx[i + 2];
      const az = pos.getZ(ia);
      const bz = pos.getZ(ib);
      const cz = pos.getZ(ic);
      const top = onPlane(zmax, az, bz, cz);
      const bot = onPlane(zmin, az, bz, cz);
      if (!top && !bot) continue;

      const nz = triangleNormalZ(ia, ib, ic);
      if (top && nz < 0) {
        const t = idx[i + 1];
        idx[i + 1] = idx[i + 2];
        idx[i + 2] = t;
      } else if (bot && nz > 0) {
        const t = idx[i + 1];
        idx[i + 1] = idx[i + 2];
        idx[i + 2] = t;
      }
    }
    geometry.index.needsUpdate = true;
  } else {
    const arr = pos.array;
    const triCount = pos.count / 3;
    for (let t = 0; t < triCount; t += 1) {
      const base = t * 9;
      const az = arr[base + 2];
      const bz = arr[base + 5];
      const cz = arr[base + 8];
      const top = onPlane(zmax, az, bz, cz);
      const bot = onPlane(zmin, az, bz, cz);
      if (!top && !bot) continue;

      const ia = t * 3;
      const ib = t * 3 + 1;
      const ic = t * 3 + 2;
      const nz = triangleNormalZ(ia, ib, ic);
      if (top && nz < 0) {
        for (let k = 0; k < 3; k += 1) {
          const tmp = arr[base + 3 + k];
          arr[base + 3 + k] = arr[base + 6 + k];
          arr[base + 6 + k] = tmp;
        }
      } else if (bot && nz > 0) {
        for (let k = 0; k < 3; k += 1) {
          const tmp = arr[base + 3 + k];
          arr[base + 3 + k] = arr[base + 6 + k];
          arr[base + 6 + k] = tmp;
        }
      }
    }
    pos.needsUpdate = true;
  }

  return geometry;
}

/**
 * Uniform ±Z cap normals — removes Earcut triangulation shading streaks on flat caps.
 *
 * @param {import('three').BufferGeometry} geometry
 * @returns {import('three').BufferGeometry}
 */
export function flattenSvgExtrudeCapNormals(geometry) {
  if (!geometry?.attributes?.position || !geometry.attributes.normal) return geometry;

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const zmin = box.min.z;
  const zmax = box.max.z;
  const thickness = zmax - zmin;
  if (!Number.isFinite(thickness) || thickness <= 0) return geometry;

  const eps = Math.max(thickness * 1e-5, 1e-7);
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;

  const onPlane = (zPlane, az, bz, cz) =>
    Math.abs(az - zPlane) < eps && Math.abs(bz - zPlane) < eps && Math.abs(cz - zPlane) < eps;

  const flattenTriangle = (ia, ib, ic, nx, ny, nz) => {
    norm.setXYZ(ia, nx, ny, nz);
    norm.setXYZ(ib, nx, ny, nz);
    norm.setXYZ(ic, nx, ny, nz);
  };

  if (geometry.index) {
    const idx = geometry.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const ia = idx[i];
      const ib = idx[i + 1];
      const ic = idx[i + 2];
      const az = pos.getZ(ia);
      const bz = pos.getZ(ib);
      const cz = pos.getZ(ic);
      if (onPlane(zmax, az, bz, cz)) {
        flattenTriangle(ia, ib, ic, 0, 0, 1);
      } else if (onPlane(zmin, az, bz, cz)) {
        flattenTriangle(ia, ib, ic, 0, 0, -1);
      }
    }
  } else {
    const arr = pos.array;
    const triCount = pos.count / 3;
    for (let t = 0; t < triCount; t += 1) {
      const base = t * 9;
      const az = arr[base + 2];
      const bz = arr[base + 5];
      const cz = arr[base + 8];
      const ia = t * 3;
      const ib = t * 3 + 1;
      const ic = t * 3 + 2;
      if (onPlane(zmax, az, bz, cz)) {
        flattenTriangle(ia, ib, ic, 0, 0, 1);
      } else if (onPlane(zmin, az, bz, cz)) {
        flattenTriangle(ia, ib, ic, 0, 0, -1);
      }
    }
  }

  norm.needsUpdate = true;
  return geometry;
}
