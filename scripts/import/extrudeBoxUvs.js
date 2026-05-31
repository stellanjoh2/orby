import * as THREE from 'three';

/** |faceNormal.z| above this → cap/bevel uses XY (matches letter face). */
const CAP_BEVEL_Z_THRESHOLD = 0.35;

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _cb = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _faceNormal = new THREE.Vector3();

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} nx
 * @param {number} ny
 * @param {number} nz
 * @returns {[number, number]}
 */
function projectExtrudeFaceUv(x, y, z, nx, ny, nz) {
  const az = Math.abs(nz);
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);

  // Caps + inset bevel: same XY plane as the glyph face (avoids rainbow streaks).
  if (az >= CAP_BEVEL_Z_THRESHOLD) {
    return [x, y];
  }

  // Side walls: horizontal run × extrusion depth.
  if (ax >= ay) {
    return [y, z];
  }
  return [x, z];
}

/**
 * Per-triangle box UVs (~1 studio unit ≈ 1 UV unit). Unindexes geometry so each face
 * gets a consistent projection (shared creased-normal verts no longer mix cap/side UVs).
 *
 * @param {THREE.BufferGeometry} geometry
 * @returns {THREE.BufferGeometry}
 */
export function applyExtrudeBoxUvs(geometry) {
  if (!geometry?.attributes?.position) return geometry;

  let geom = geometry;
  if (geometry.index) {
    geom = geometry.toNonIndexed();
    geometry.dispose();
  }

  const pos = geom.attributes.position;
  const triCount = Math.floor(pos.count / 3);
  const uv = new Float32Array(pos.count * 2);

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    const i1 = i0 + 1;
    const i2 = i0 + 2;

    _vA.fromBufferAttribute(pos, i0);
    _vB.fromBufferAttribute(pos, i1);
    _vC.fromBufferAttribute(pos, i2);
    _cb.subVectors(_vC, _vB);
    _ab.subVectors(_vA, _vB);
    _faceNormal.crossVectors(_cb, _ab);
    const len = _faceNormal.length();
    if (len > 1e-10) {
      _faceNormal.multiplyScalar(1 / len);
    } else {
      _faceNormal.set(0, 0, 1);
    }

    const nx = _faceNormal.x;
    const ny = _faceNormal.y;
    const nz = _faceNormal.z;

    for (const vi of [i0, i1, i2]) {
      const [u, v] = projectExtrudeFaceUv(
        pos.getX(vi),
        pos.getY(vi),
        pos.getZ(vi),
        nx,
        ny,
        nz,
      );
      uv[vi * 2] = u;
      uv[vi * 2 + 1] = v;
    }
  }

  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}
