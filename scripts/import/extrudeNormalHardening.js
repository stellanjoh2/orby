/** Hard geometric normals on extrude side walls — fixes shadow terminator offset at cap/side edges. */

/** |normal.z| below this → vertical side wall in normalized studio space. */
export const EXTRUDE_SIDE_NORMAL_Z_MAX = 0.12;

/**
 * @param {import('three').BufferAttribute} pos
 * @param {number} ia
 * @param {number} ib
 * @param {number} ic
 * @returns {{ nx: number, ny: number, nz: number, absNz: number } | null}
 */
function extrudeTriangleFaceNormal(pos, ia, ib, ic) {
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
 * Snap side-wall vertex normals to face normals so lit/shadow boundaries align with geometry edges.
 *
 * @param {import('three').BufferGeometry} geometry
 * @returns {import('three').BufferGeometry}
 */
export function hardenExtrudeSideFaceNormals(geometry) {
  if (!geometry?.attributes?.position || !geometry.attributes.normal) {
    return geometry;
  }

  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;

  forEachExtrudeTriangle(geometry, (ia, ib, ic) => {
    const face = extrudeTriangleFaceNormal(pos, ia, ib, ic);
    if (!face || face.absNz > EXTRUDE_SIDE_NORMAL_Z_MAX) return;

    norm.setXYZ(ia, face.nx, face.ny, face.nz);
    norm.setXYZ(ib, face.nx, face.ny, face.nz);
    norm.setXYZ(ic, face.nx, face.ny, face.nz);
  });

  norm.needsUpdate = true;
  return geometry;
}
