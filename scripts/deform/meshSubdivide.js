import * as THREE from 'three';

/** @param {number} a @param {number} b */
function edgeKey(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/**
 * One Loop-style triangle split — each triangle becomes four (mid-edge subdivision).
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {number} [maxTriangles]
 * @returns {THREE.BufferGeometry | null} null when the safety cap would be exceeded
 */
export function subdivideBufferGeometry(geometry, maxTriangles = 500_000) {
  const pos = geometry.getAttribute('position');
  if (!pos) return geometry;

  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const index = geometry.getIndex();
  const triangleCount = index ? index.count / 3 : pos.count / 3;
  if (triangleCount <= 0) return geometry;
  if (triangleCount * 4 > maxTriangles) return null;

  /** @type {Map<string, number>} */
  const edgeMid = new Map();
  const newPositions = [];
  const newNormals = [];
  const newUvs = [];
  const newIndices = [];

  for (let i = 0; i < pos.count; i += 1) {
    newPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (normal) {
      newNormals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
    }
    if (uv) {
      newUvs.push(uv.getX(i), uv.getY(i));
    }
  }

  /**
   * @param {number} a
   * @param {number} b
   */
  function getMidpoint(a, b) {
    const key = edgeKey(a, b);
    const cached = edgeMid.get(key);
    if (cached !== undefined) return cached;

    const idx = newPositions.length / 3;
    newPositions.push(
      (pos.getX(a) + pos.getX(b)) * 0.5,
      (pos.getY(a) + pos.getY(b)) * 0.5,
      (pos.getZ(a) + pos.getZ(b)) * 0.5,
    );
    if (normal) {
      const nx = (normal.getX(a) + normal.getX(b)) * 0.5;
      const ny = (normal.getY(a) + normal.getY(b)) * 0.5;
      const nz = (normal.getZ(a) + normal.getZ(b)) * 0.5;
      const len = Math.hypot(nx, ny, nz) || 1;
      newNormals.push(nx / len, ny / len, nz / len);
    }
    if (uv) {
      newUvs.push(
        (uv.getX(a) + uv.getX(b)) * 0.5,
        (uv.getY(a) + uv.getY(b)) * 0.5,
      );
    }
    edgeMid.set(key, idx);
    return idx;
  }

  /**
   * @param {number} a
   * @param {number} b
   * @param {number} c
   */
  function subdivideTri(a, b, c) {
    const ab = getMidpoint(a, b);
    const bc = getMidpoint(b, c);
    const ca = getMidpoint(c, a);
    newIndices.push(a, ab, ca);
    newIndices.push(ab, b, bc);
    newIndices.push(ca, bc, c);
    newIndices.push(ab, bc, ca);
  }

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      subdivideTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      subdivideTri(i, i + 1, i + 2);
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  if (newNormals.length) {
    result.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
  } else {
    result.computeVertexNormals();
  }
  if (newUvs.length) {
    result.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
  }
  result.setIndex(newIndices);
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

/** @param {THREE.BufferGeometry} geometry */
export function countGeometryTriangles(geometry) {
  const pos = geometry?.getAttribute?.('position');
  if (!pos) return 0;
  const index = geometry.getIndex();
  return index ? index.count / 3 : pos.count / 3;
}
