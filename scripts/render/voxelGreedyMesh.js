import * as THREE from 'three';

/**
 * Quantized RGB key for same-color face welding (8-bit channels).
 * @param {number} idx
 * @param {Float32Array} cellColors
 */
function colorKeyFromIndex(idx, cellColors) {
  const base = idx * 3;
  const r = Math.round(cellColors[base] * 255);
  const g = Math.round(cellColors[base + 1] * 255);
  const b = Math.round(cellColors[base + 2] * 255);
  return (r << 16) | (g << 8) | b;
}

/** @param {number} key */
function rgbFromColorKey(key) {
  return [
    ((key >> 16) & 255) / 255,
    ((key >> 8) & 255) / 255,
    (key & 255) / 255,
  ];
}

/**
 * @param {Set<number>} cells
 * @param {number} nx
 * @param {number} ny
 * @param {number} nz
 * @param {(ix: number, iy: number, iz: number) => number} toIndex
 * @param {number} ix
 * @param {number} iy
 * @param {number} iz
 */
function cellIndexAt(cells, nx, ny, nz, toIndex, ix, iy, iz) {
  if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return -1;
  const idx = toIndex(ix, iy, iz);
  return cells.has(idx) ? idx : -1;
}

/**
 * @param {Set<number>} cells
 * @param {Float32Array} cellColors
 * @param {number} nx
 * @param {number} ny
 * @param {number} nz
 * @param {(ix: number, iy: number, iz: number) => number} toIndex
 * @param {number} ix
 * @param {number} iy
 * @param {number} iz
 * @param {number} dx
 * @param {number} dy
 * @param {number} dz
 */
function exposedFaceColorKey(cells, cellColors, nx, ny, nz, toIndex, ix, iy, iz, dx, dy, dz) {
  const selfIdx = cellIndexAt(cells, nx, ny, nz, toIndex, ix, iy, iz);
  if (selfIdx < 0) return 0;
  const selfKey = colorKeyFromIndex(selfIdx, cellColors);
  const nIdx = cellIndexAt(cells, nx, ny, nz, toIndex, ix + dx, iy + dy, iz + dz);
  if (nIdx < 0) return selfKey;
  const neighborKey = colorKeyFromIndex(nIdx, cellColors);
  return selfKey === neighborKey ? 0 : selfKey;
}

/**
 * @param {Int32Array | null} mask
 * @param {number} uSize
 * @param {number} vSize
 */
function greedyMergeMask(mask, uSize, vSize) {
  /** @type {{ u: number, v: number, uLen: number, vLen: number, key: number }[]} */
  const quads = [];
  if (!mask) return quads;

  const used = new Uint8Array(uSize * vSize);

  for (let u = 0; u < uSize; u += 1) {
    for (let v = 0; v < vSize; v += 1) {
      const flat = u * vSize + v;
      if (used[flat]) continue;
      const key = mask[flat];
      if (!key) continue;

      let vLen = 1;
      while (v + vLen < vSize) {
        const next = u * vSize + (v + vLen);
        if (used[next] || mask[next] !== key) break;
        vLen += 1;
      }

      let uLen = 1;
      let grow = true;
      while (u + uLen < uSize && grow) {
        for (let dv = 0; dv < vLen; dv += 1) {
          const probe = (u + uLen) * vSize + (v + dv);
          if (used[probe] || mask[probe] !== key) {
            grow = false;
            break;
          }
        }
        if (grow) uLen += 1;
      }

      for (let du = 0; du < uLen; du += 1) {
        for (let dv = 0; dv < vLen; dv += 1) {
          used[(u + du) * vSize + (v + dv)] = 1;
        }
      }

      quads.push({ u, v, uLen, vLen, key });
    }
  }

  return quads;
}

/**
 * @param {{
 *   positions: number[],
 *   normals: number[],
 *   colors: number[],
 *   indices: number[],
 *   vertexOffset: number,
 *   origin: THREE.Vector3,
 *   voxelSize: number,
 *   key: number,
 *   u0: number, v0: number, uLen: number, vLen: number,
 *   planeAxis: 'x' | 'y' | 'z',
 *   planeCoord: number,
 *   faceSign: 1 | -1,
 *   uAxis: 'x' | 'y' | 'z',
 *   vAxis: 'x' | 'y' | 'z',
 * }} params
 */
function appendMergedQuad(params) {
  const {
    positions, normals, colors, indices, vertexOffset,
    origin, voxelSize, key,
    u0, v0, uLen, vLen,
    planeAxis, planeCoord, faceSign, uAxis, vAxis,
  } = params;

  const axisCoord = (axis, gridCoord) => {
    if (axis === 'x') return origin.x + gridCoord * voxelSize;
    if (axis === 'y') return origin.y + gridCoord * voxelSize;
    return origin.z + gridCoord * voxelSize;
  };

  const plane = axisCoord(planeAxis, planeCoord);
  const uStart = axisCoord(uAxis, u0);
  const uEnd = axisCoord(uAxis, u0 + uLen);
  const vStart = axisCoord(vAxis, v0);
  const vEnd = axisCoord(vAxis, v0 + vLen);

  /** @type {{ x: number, y: number, z: number }[]} */
  let corners;
  if (planeAxis === 'x') {
    corners = faceSign > 0
      ? [
        { x: plane, y: uStart, z: vStart },
        { x: plane, y: uEnd, z: vStart },
        { x: plane, y: uEnd, z: vEnd },
        { x: plane, y: uStart, z: vEnd },
      ]
      : [
        { x: plane, y: uStart, z: vStart },
        { x: plane, y: uStart, z: vEnd },
        { x: plane, y: uEnd, z: vEnd },
        { x: plane, y: uEnd, z: vStart },
      ];
  } else if (planeAxis === 'y') {
    corners = faceSign > 0
      ? [
        { x: uStart, y: plane, z: vStart },
        { x: uEnd, y: plane, z: vStart },
        { x: uEnd, y: plane, z: vEnd },
        { x: uStart, y: plane, z: vEnd },
      ]
      : [
        { x: uStart, y: plane, z: vStart },
        { x: uStart, y: plane, z: vEnd },
        { x: uEnd, y: plane, z: vEnd },
        { x: uEnd, y: plane, z: vStart },
      ];
  } else {
    corners = faceSign > 0
      ? [
        { x: uStart, y: vStart, z: plane },
        { x: uEnd, y: vStart, z: plane },
        { x: uEnd, y: vEnd, z: plane },
        { x: uStart, y: vEnd, z: plane },
      ]
      : [
        { x: uStart, y: vStart, z: plane },
        { x: uStart, y: vEnd, z: plane },
        { x: uEnd, y: vEnd, z: plane },
        { x: uEnd, y: vStart, z: plane },
      ];
  }

  const normal = [0, 0, 0];
  normal[planeAxis === 'x' ? 0 : planeAxis === 'y' ? 1 : 2] = faceSign;
  const [r, g, b] = rgbFromColorKey(key);

  const base = vertexOffset;
  for (const corner of corners) {
    positions.push(corner.x, corner.y, corner.z);
    normals.push(normal[0], normal[1], normal[2]);
    colors.push(r, g, b);
  }

  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** @type {const} */
const GREEDY_FACE_PASSES = [
  { dx: 1, dy: 0, dz: 0, planeAxis: 'x', faceSign: 1, sweepAxis: 'x', uAxis: 'y', vAxis: 'z', planeCoord: (ix) => ix + 1 },
  { dx: -1, dy: 0, dz: 0, planeAxis: 'x', faceSign: -1, sweepAxis: 'x', uAxis: 'y', vAxis: 'z', planeCoord: (ix) => ix },
  { dx: 0, dy: 1, dz: 0, planeAxis: 'y', faceSign: 1, sweepAxis: 'y', uAxis: 'x', vAxis: 'z', planeCoord: (iy) => iy + 1 },
  { dx: 0, dy: -1, dz: 0, planeAxis: 'y', faceSign: -1, sweepAxis: 'y', uAxis: 'x', vAxis: 'z', planeCoord: (iy) => iy },
  { dx: 0, dy: 0, dz: 1, planeAxis: 'z', faceSign: 1, sweepAxis: 'z', uAxis: 'x', vAxis: 'y', planeCoord: (iz) => iz + 1 },
  { dx: 0, dy: 0, dz: -1, planeAxis: 'z', faceSign: -1, sweepAxis: 'z', uAxis: 'x', vAxis: 'y', planeCoord: (iz) => iz },
];

/**
 * Build welded voxel mesh geometry — internal same-color faces removed, coplanar
 * exposed faces merged into larger quads. Color boundaries stay sharp.
 *
 * @param {{
 *   cells: Set<number>,
 *   cellColors: Float32Array,
 *   nx: number,
 *   ny: number,
 *   nz: number,
 *   toIndex: (ix: number, iy: number, iz: number) => number,
 *   origin: THREE.Vector3,
 *   voxelSize: number,
 * }} params
 * @returns {THREE.BufferGeometry | null}
 */
export function buildGreedyVoxelMeshGeometry(params) {
  const { cells, cellColors, nx, ny, nz, toIndex, origin, voxelSize } = params;
  if (!cells?.size) return null;

  let minIx = nx;
  let minIy = ny;
  let minIz = nz;
  let maxIx = 0;
  let maxIy = 0;
  let maxIz = 0;

  for (const idx of cells) {
    const remZ = Math.floor(idx / (nx * ny));
    const rem = idx - remZ * nx * ny;
    const iy = Math.floor(rem / nx);
    const ix = rem - iy * nx;
    const iz = remZ;
    if (ix < minIx) minIx = ix;
    if (iy < minIy) minIy = iy;
    if (iz < minIz) minIz = iz;
    if (ix > maxIx) maxIx = ix;
    if (iy > maxIy) maxIy = iy;
    if (iz > maxIz) maxIz = iz;
  }

  const uSizeY = maxIy - minIy + 1;
  const uSizeX = maxIx - minIx + 1;
  const vSizeZ = maxIz - minIz + 1;

  /** @type {number[]} */
  const positions = [];
  /** @type {number[]} */
  const normals = [];
  /** @type {number[]} */
  const colors = [];
  /** @type {number[]} */
  const indices = [];
  let vertexOffset = 0;

  for (const pass of GREEDY_FACE_PASSES) {
    const {
      dx, dy, dz, planeAxis, faceSign, sweepAxis, uAxis, vAxis, planeCoord,
    } = pass;

    const uSize = uAxis === 'x' ? uSizeX : uSizeY;
    const vSize = vAxis === 'z' ? vSizeZ : (vAxis === 'y' ? uSizeY : uSizeX);

    const sweepMin = sweepAxis === 'x' ? minIx : sweepAxis === 'y' ? minIy : minIz;
    const sweepMax = sweepAxis === 'x' ? maxIx : sweepAxis === 'y' ? maxIy : maxIz;

    for (let sweep = sweepMin; sweep <= sweepMax; sweep += 1) {
      const mask = new Int32Array(uSize * vSize);

      for (const idx of cells) {
        const remZ = Math.floor(idx / (nx * ny));
        const rem = idx - remZ * nx * ny;
        const iy = Math.floor(rem / nx);
        const ix = rem - iy * nx;
        const iz = remZ;

        const onSweep = sweepAxis === 'x' ? ix : sweepAxis === 'y' ? iy : iz;
        if (onSweep !== sweep) continue;

        const key = exposedFaceColorKey(
          cells, cellColors, nx, ny, nz, toIndex, ix, iy, iz, dx, dy, dz,
        );
        if (!key) continue;

        const u = (uAxis === 'x' ? ix : iy) - (uAxis === 'x' ? minIx : minIy);
        const v = (vAxis === 'z' ? iz : (vAxis === 'y' ? iy : ix))
          - (vAxis === 'z' ? minIz : (vAxis === 'y' ? minIy : minIx));
        mask[u * vSize + v] = key;
      }

      const quads = greedyMergeMask(mask, uSize, vSize);
      for (const quad of quads) {
        const u0 = (uAxis === 'x' ? minIx : minIy) + quad.u;
        const v0 = (vAxis === 'z' ? minIz : (vAxis === 'y' ? minIy : minIx)) + quad.v;

        appendMergedQuad({
          positions,
          normals,
          colors,
          indices,
          vertexOffset,
          origin,
          voxelSize,
          key: quad.key,
          u0,
          v0,
          uLen: quad.uLen,
          vLen: quad.vLen,
          planeAxis,
          planeCoord: planeCoord(sweep),
          faceSign,
          uAxis,
          vAxis,
        });
        vertexOffset += 4;
      }
    }
  }

  if (positions.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * One quad per exposed voxel face — no greedy merging (readable cube wireframes on type).
 *
 * @param {{
 *   cells: Set<number>,
 *   cellColors: Float32Array,
 *   nx: number,
 *   ny: number,
 *   nz: number,
 *   toIndex: (ix: number, iy: number, iz: number) => number,
 *   origin: THREE.Vector3,
 *   voxelSize: number,
 * }} params
 * @returns {THREE.BufferGeometry | null}
 */
export function buildCubeVoxelMeshGeometry(params) {
  const { cells, cellColors, nx, ny, nz, toIndex, origin, voxelSize } = params;
  if (!cells?.size) return null;

  /** @type {number[]} */
  const positions = [];
  /** @type {number[]} */
  const normals = [];
  /** @type {number[]} */
  const colors = [];
  /** @type {number[]} */
  const indices = [];
  let vertexOffset = 0;

  for (const idx of cells) {
    const remZ = Math.floor(idx / (nx * ny));
    const rem = idx - remZ * nx * ny;
    const iy = Math.floor(rem / nx);
    const ix = rem - iy * nx;
    const iz = remZ;

    for (const pass of GREEDY_FACE_PASSES) {
      const { dx, dy, dz, planeAxis, faceSign, uAxis, vAxis, planeCoord, sweepAxis } = pass;
      const key = exposedFaceColorKey(
        cells, cellColors, nx, ny, nz, toIndex, ix, iy, iz, dx, dy, dz,
      );
      if (!key) continue;

      const u0 = uAxis === 'x' ? ix : iy;
      const v0 = vAxis === 'z' ? iz : (vAxis === 'y' ? iy : ix);
      const sweepCoord = sweepAxis === 'x' ? ix : sweepAxis === 'y' ? iy : iz;
      appendMergedQuad({
        positions,
        normals,
        colors,
        indices,
        vertexOffset,
        origin,
        voxelSize,
        key,
        u0,
        v0,
        uLen: 1,
        vLen: 1,
        planeAxis,
        planeCoord: planeCoord(sweepCoord),
        faceSign,
        uAxis,
        vAxis,
      });
      vertexOffset += 4;
    }
  }

  if (positions.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}
