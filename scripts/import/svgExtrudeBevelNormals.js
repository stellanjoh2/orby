/** SVG bevel shoulder helpers — shared triangle utilities only (normals live in svgExtrudeNormals.js). */

/** |faceNormal.z| below this → vertical side wall in normalized studio space. */
export const SVG_EXTRUDE_SIDE_Z_MAX = 0.12;
/** |faceNormal.z| at or above this → flat cap (front or back). */
export const SVG_EXTRUDE_CAP_Z_MIN = 0.92;

/**
 * @param {import('three').BufferAttribute} pos
 * @param {number} ia
 * @param {number} ib
 * @param {number} ic
 * @returns {{ nx: number, ny: number, nz: number, absNz: number } | null}
 */
export function svgExtrudeTriangleFaceNormal(pos, ia, ib, ic) {
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
 * Flat face normals on chamfer shoulders (cap↔bevel and side↔bevel junctions).
 *
 * @param {import('three').BufferGeometry} geometry
 * @param {number} creaseAngleRad
 * @returns {import('three').BufferGeometry}
 */
export function hardenSvgExtrudeBevelShoulderNormals(geometry, creaseAngleRad) {
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
    const face = svgExtrudeTriangleFaceNormal(pos, ia, ib, ic);
    if (!face) return;
    if (
      face.absNz <= SVG_EXTRUDE_SIDE_Z_MAX ||
      face.absNz >= SVG_EXTRUDE_CAP_Z_MIN
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
