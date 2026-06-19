import * as THREE from 'three';
import { mergeVertices } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/utils/BufferGeometryUtils.js';
import { isTextureImageReady } from '../utils/textureReady.js';
import { resolveVoxelLookConfig } from './creativeLookVoxelArt.js';
import { buildGreedyVoxelMeshGeometry } from './voxelGreedyMesh.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _p = new THREE.Vector3();
const _size = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _color = new THREE.Color();

/** Canvas/ImageData sRGB byte → linear for vertex colours in the linear render pipeline. */
function srgbByteToLinear(byte) {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const _matrix = new THREE.Matrix4();

const NEIGHBOR_OFFSETS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function isOccupied(flags, idx) {
  return flags[idx] === 1 || flags[idx] === 3;
}

function countOccupiedNeighbors(flags, idx, nx, ny, nz, toIndex) {
  const { ix, iy, iz } = indexToCoords(idx, nx, ny);
  let count = 0;
  for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
    const nIdx = toIndex(ix + dx, iy + dy, iz + dz);
    if (isOccupied(flags, nIdx)) count += 1;
  }
  return count;
}

function countSurfaceShellNeighbors(flags, idx, nx, ny, nz, toIndex) {
  const { ix, iy, iz } = indexToCoords(idx, nx, ny);
  let count = 0;
  for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
    const nIdx = toIndex(ix + dx, iy + dy, iz + dz);
    if (flags[nIdx] === 1) count += 1;
  }
  return count;
}

function clearOccupiedVoxel(idx, flags, cellColors, surfaceOwners, meshSurfaceSets) {
  flags[idx] = 0;
  surfaceOwners[idx] = 0;
  const base = idx * 3;
  cellColors[base] = 0;
  cellColors[base + 1] = 0;
  cellColors[base + 2] = 0;
  for (let m = 0; m < meshSurfaceSets.length; m += 1) {
    meshSurfaceSets[m].delete(idx);
  }
}

/** @returns {number[][]} */
function collectOccupiedComponents(flags, nx, ny, nz, toIndex) {
  const cellCount = flags.length;
  /** @type {boolean[]} */
  const visited = new Array(cellCount).fill(false);
  /** @type {number[][]} */
  const components = [];

  for (let i = 0; i < cellCount; i += 1) {
    if (!isOccupied(flags, i) || visited[i]) continue;
    /** @type {number[]} */
    const component = [];
    /** @type {number[]} */
    const queue = [i];
    visited[i] = true;
    while (queue.length > 0) {
      const idx = queue.pop();
      component.push(idx);
      const { ix, iy, iz } = indexToCoords(idx, nx, ny);
      for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
        const nIdx = toIndex(ix + dx, iy + dy, iz + dz);
        if (!isOccupied(flags, nIdx) || visited[nIdx]) continue;
        visited[nIdx] = true;
        queue.push(nIdx);
      }
    }
    components.push(component);
  }
  return components;
}

/**
 * Peel 1-voxel-wide spikes (straight stray bars are chains of cubes with <=2 neighbors).
 */
function erodeThinOccupiedSpikes(params) {
  const {
    flags, cellColors, surfaceOwners, meshSurfaceSets, nx, ny, nz, toIndex,
    maxPasses = 4,
    maxNeighbors = 2,
  } = params;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    /** @type {number[]} */
    const remove = [];
    for (let i = 0; i < flags.length; i += 1) {
      if (!isOccupied(flags, i)) continue;
      if (countOccupiedNeighbors(flags, i, nx, ny, nz, toIndex) <= maxNeighbors) {
        remove.push(i);
      }
    }
    if (remove.length === 0) break;
    for (const idx of remove) {
      clearOccupiedVoxel(idx, flags, cellColors, surfaceOwners, meshSurfaceSets);
    }
  }
}

function cullSmallOccupiedComponents(params) {
  const {
    flags, cellColors, surfaceOwners, meshSurfaceSets, nx, ny, nz, toIndex, minVoxels,
  } = params;

  const components = collectOccupiedComponents(flags, nx, ny, nz, toIndex);
  if (components.length <= 1) return;

  components.sort((a, b) => b.length - a.length);
  /** @type {Set<number>} */
  const keep = new Set(components[0]);
  for (let c = 1; c < components.length; c += 1) {
    if (components[c].length >= minVoxels) {
      for (const idx of components[c]) keep.add(idx);
    }
  }

  for (let i = 0; i < flags.length; i += 1) {
    if (!isOccupied(flags, i) || keep.has(i)) continue;
    clearOccupiedVoxel(i, flags, cellColors, surfaceOwners, meshSurfaceSets);
  }
}

/**
 * Remove needle-shaped satellite blobs separated from the main body in grid space.
 */
function cullNeedleSatellites(params) {
  const {
    flags, cellColors, surfaceOwners, meshSurfaceSets, nx, ny, nz, toIndex,
    minGridGap = 2,
    maxAspectRatio = 4,
    maxNeedleVoxels = 64,
  } = params;

  const components = collectOccupiedComponents(flags, nx, ny, nz, toIndex);
  if (components.length <= 1) return;

  components.sort((a, b) => b.length - a.length);
  const main = components[0];

  let mix = nx;
  let miy = ny;
  let miz = nz;
  let maix = 0;
  let maiy = 0;
  let maiz = 0;
  for (const idx of main) {
    const { ix, iy, iz } = indexToCoords(idx, nx, ny);
    mix = Math.min(mix, ix);
    miy = Math.min(miy, iy);
    miz = Math.min(miz, iz);
    maix = Math.max(maix, ix);
    maiy = Math.max(maiy, iy);
    maiz = Math.max(maiz, iz);
  }

  /** @type {number[]} */
  const remove = [];
  for (let c = 1; c < components.length; c += 1) {
    const comp = components[c];
    let cix0 = nx;
    let ciy0 = ny;
    let ciz0 = nz;
    let cix1 = 0;
    let ciy1 = 0;
    let ciz1 = 0;
    for (const idx of comp) {
      const { ix, iy, iz } = indexToCoords(idx, nx, ny);
      cix0 = Math.min(cix0, ix);
      ciy0 = Math.min(ciy0, iy);
      ciz0 = Math.min(ciz0, iz);
      cix1 = Math.max(cix1, ix);
      ciy1 = Math.max(ciy1, iy);
      ciz1 = Math.max(ciz1, iz);
    }

    const gapX = Math.max(0, Math.max(cix0 - maix - 1, mix - cix1 - 1));
    const gapY = Math.max(0, Math.max(ciy0 - maiy - 1, miy - ciy1 - 1));
    const gapZ = Math.max(0, Math.max(ciz0 - maiz - 1, miz - ciz1 - 1));
    const minGap = Math.min(gapX, gapY, gapZ);

    const spanX = cix1 - cix0 + 1;
    const spanY = ciy1 - ciy0 + 1;
    const spanZ = ciz1 - ciz0 + 1;
    const minSpan = Math.max(1, Math.min(spanX, spanY, spanZ));
    const maxSpan = Math.max(spanX, spanY, spanZ);
    const aspect = maxSpan / minSpan;
    const isNeedle = aspect >= maxAspectRatio && comp.length <= maxNeedleVoxels;
    const isSatellite = minGap >= minGridGap;

    if (isNeedle || isSatellite) {
      remove.push(...comp);
    }
  }

  for (const idx of remove) {
    clearOccupiedVoxel(idx, flags, cellColors, surfaceOwners, meshSurfaceSets);
  }
}

/**
 * Drop interior voxels that fail multi-axis parity (removes straight false-fill columns).
 */
function cullFilledExteriorByParity(flags, cellColors, surfaceOwners, meshSurfaceSets, parityCtx) {
  const { nx, ny, nz, toIndex } = parityCtx.grid;

  for (let iz = 0; iz < nz; iz += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        const idx = toIndex(ix, iy, iz);
        if (flags[idx] !== 3) continue;
        if (isVoxelInsideByParity(ix, iy, iz, parityCtx)) continue;
        clearOccupiedVoxel(idx, flags, cellColors, surfaceOwners, meshSurfaceSets);
      }
    }
  }
}

/**
 * Peel thin surface-shell voxels (SAT ribbons / sliver triangles).
 */
function erodeThinSurfaceShell(params) {
  const {
    flags, cellColors, surfaceOwners, meshSurfaceSets, nx, ny, nz, toIndex,
    maxPasses = 2,
    maxNeighbors = 3,
  } = params;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    /** @type {number[]} */
    const remove = [];
    for (let i = 0; i < flags.length; i += 1) {
      if (flags[i] !== 1) continue;
      if (countOccupiedNeighbors(flags, i, nx, ny, nz, toIndex) <= maxNeighbors) {
        remove.push(i);
      }
    }
    if (remove.length === 0) break;
    for (const idx of remove) {
      clearOccupiedVoxel(idx, flags, cellColors, surfaceOwners, meshSurfaceSets);
    }
  }
}

/**
 * Peel surface voxels weakly tied to the shell — tapered tips (A-10 nose) and SAT ears.
 */
function peelDanglingSurfaceShell(params) {
  const {
    flags, cellColors, surfaceOwners, meshSurfaceSets, nx, ny, nz, toIndex,
    maxPasses = 2,
    maxOccupiedNeighbors = 4,
    maxSurfaceNeighbors = 2,
  } = params;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    /** @type {number[]} */
    const remove = [];
    for (let i = 0; i < flags.length; i += 1) {
      if (flags[i] !== 1) continue;
      if (countOccupiedNeighbors(flags, i, nx, ny, nz, toIndex) > maxOccupiedNeighbors) continue;
      if (countSurfaceShellNeighbors(flags, i, nx, ny, nz, toIndex) > maxSurfaceNeighbors) continue;
      remove.push(i);
    }
    if (remove.length === 0) break;
    for (const idx of remove) {
      clearOccupiedVoxel(idx, flags, cellColors, surfaceOwners, meshSurfaceSets);
    }
  }
}

/**
 * Remove 1-voxel-wide straight rods (common parity leak along one grid axis).
 */
function cullOneWideOccupiedRods(params) {
  const {
    flags, cellColors, surfaceOwners, meshSurfaceSets, nx, ny, nz, toIndex,
    minRodLength = 3,
    thinMaxNeighbors = 3,
  } = params;

  /** @type {boolean[]} */
  const remove = new Array(flags.length).fill(false);

  const tryMarkRun = (indices) => {
    if (indices.length < minRodLength) return;
    for (const idx of indices) {
      if (countOccupiedNeighbors(flags, idx, nx, ny, nz, toIndex) > thinMaxNeighbors) continue;
      remove[idx] = true;
    }
  };

  for (let iz = 0; iz < nz; iz += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      /** @type {number[]} */
      let run = [];
      for (let ix = 0; ix <= nx; ix += 1) {
        const idx = ix < nx ? toIndex(ix, iy, iz) : -1;
        if (ix < nx && isOccupied(flags, idx)) {
          run.push(idx);
        } else {
          tryMarkRun(run);
          run = [];
        }
      }
    }
  }

  for (let iz = 0; iz < nz; iz += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      /** @type {number[]} */
      let run = [];
      for (let iy = 0; iy <= ny; iy += 1) {
        const idx = iy < ny ? toIndex(ix, iy, iz) : -1;
        if (iy < ny && isOccupied(flags, idx)) {
          run.push(idx);
        } else {
          tryMarkRun(run);
          run = [];
        }
      }
    }
  }

  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      /** @type {number[]} */
      let run = [];
      for (let iz = 0; iz <= nz; iz += 1) {
        const idx = iz < nz ? toIndex(ix, iy, iz) : -1;
        if (iz < nz && isOccupied(flags, idx)) {
          run.push(idx);
        } else {
          tryMarkRun(run);
          run = [];
        }
      }
    }
  }

  for (let i = 0; i < flags.length; i += 1) {
    if (!remove[i]) continue;
    clearOccupiedVoxel(i, flags, cellColors, surfaceOwners, meshSurfaceSets);
  }
}

/**
 * Lazy canvas sampler for diffuse maps during voxel colour extraction.
 */
class TextureColorSampler {
  /** @param {THREE.Texture | null | undefined} texture */
  constructor(texture) {
    /** @type {CanvasRenderingContext2D | null} */
    this.ctx = null;
    this.width = 0;
    this.height = 0;
    if (!isTextureImageReady(texture)) return;

    const img = texture.image;
    const w = img?.width ?? img?.videoWidth ?? 0;
    const h = img?.height ?? img?.videoHeight ?? 0;
    if (!w || !h) return;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, w, h);
    this.ctx = ctx;
    this.width = w;
    this.height = h;
  }

  /** @param {number} u @param {number} v @param {THREE.Color} target */
  sample(u, v, target) {
    if (!this.ctx || this.width <= 0 || this.height <= 0) {
      target.setRGB(1, 1, 1);
      return target;
    }
    const x = THREE.MathUtils.clamp(u, 0, 1) * (this.width - 1);
    const y = (1 - THREE.MathUtils.clamp(v, 0, 1)) * (this.height - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, this.width - 1);
    const y1 = Math.min(y0 + 1, this.height - 1);
    const tx = x - x0;
    const ty = y - y0;
    const c00 = this._read(x0, y0);
    const c10 = this._read(x1, y0);
    const c01 = this._read(x0, y1);
    const c11 = this._read(x1, y1);
    target.setRGB(
      (1 - tx) * ((1 - ty) * c00[0] + ty * c01[0]) + tx * ((1 - ty) * c10[0] + ty * c11[0]),
      (1 - tx) * ((1 - ty) * c00[1] + ty * c01[1]) + tx * ((1 - ty) * c10[1] + ty * c11[1]),
      (1 - tx) * ((1 - ty) * c00[2] + ty * c01[2]) + tx * ((1 - ty) * c10[2] + ty * c11[2]),
    );
    return target;
  }

  /** @param {number} x @param {number} y @returns {[number, number, number]} */
  _read(x, y) {
    const data = this.ctx.getImageData(x, y, 1, 1).data;
    return [
      srgbByteToLinear(data[0]),
      srgbByteToLinear(data[1]),
      srgbByteToLinear(data[2]),
    ];
  }
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @returns {THREE.BufferGeometry}
 */
function ensureIndexedGeometry(geometry) {
  let working = geometry.clone();
  if (!working.index) {
    const merged = mergeVertices(working);
    if (merged !== working) {
      working.dispose?.();
      working = merged;
    }
  }
  if (!working.index) {
    const flat = working.toNonIndexed();
    working.dispose?.();
    working = flat;
    const merged = mergeVertices(working);
    if (merged !== working) {
      working.dispose?.();
      working = merged;
    }
  }
  return working;
}

/**
 * @param {THREE.Box3} bbox
 * @param {number} maxAxis
 */
export function computeSharedVoxelGrid(bbox, maxAxis) {
  if (!bbox || bbox.isEmpty()) return null;

  bbox.getSize(_size);
  const maxDim = Math.max(_size.x, _size.y, _size.z, 1e-6);
  const voxelSize = maxDim / maxAxis;
  const pad = voxelSize * 0.35;
  _origin.set(bbox.min.x - pad, bbox.min.y - pad, bbox.min.z - pad);

  const span = bbox.max.clone().addScalar(pad).sub(_origin);
  const nx = Math.max(1, Math.ceil(span.x / voxelSize));
  const ny = Math.max(1, Math.ceil(span.y / voxelSize));
  const nz = Math.max(1, Math.ceil(span.z / voxelSize));
  const cellCount = nx * ny * nz;
  if (cellCount > 512 * 512 * 512) return null;

  return {
    origin: _origin.clone(),
    voxelSize,
    nx,
    ny,
    nz,
    toIndex: (ix, iy, iz) => ix + iy * nx + iz * nx * ny,
  };
}

/**
 * SAT test: triangle vs axis-aligned box centered at (cx,cy,cz) with half-extents (hx,hy,hz).
 * Triangle vertices are absolute world coordinates.
 */
function triangleIntersectsAabb(
  v0x, v0y, v0z,
  v1x, v1y, v1z,
  v2x, v2y, v2z,
  cx, cy, cz,
  hx, hy, hz,
) {
  const v0px = v0x - cx;
  const v0py = v0y - cy;
  const v0pz = v0z - cz;
  const v1px = v1x - cx;
  const v1py = v1y - cy;
  const v1pz = v1z - cz;
  const v2px = v2x - cx;
  const v2py = v2y - cy;
  const v2pz = v2z - cz;

  let min = Math.min(v0px, v1px, v2px);
  let max = Math.max(v0px, v1px, v2px);
  if (min > hx || max < -hx) return false;

  min = Math.min(v0py, v1py, v2py);
  max = Math.max(v0py, v1py, v2py);
  if (min > hy || max < -hy) return false;

  min = Math.min(v0pz, v1pz, v2pz);
  max = Math.max(v0pz, v1pz, v2pz);
  if (min > hz || max < -hz) return false;

  const e0x = v1px - v0px;
  const e0y = v1py - v0py;
  const e0z = v1pz - v0pz;
  const e1x = v2px - v1px;
  const e1y = v2py - v1py;
  const e1z = v2pz - v1pz;
  const e2x = v0px - v2px;
  const e2y = v0py - v2py;
  const e2z = v0pz - v2pz;

  const nx = e0y * e1z - e0z * e1y;
  const ny = e0z * e1x - e0x * e1z;
  const nz = e0x * e1y - e0y * e1x;
  const d = -(nx * v0px + ny * v0py + nz * v0pz);
  const r = hx * Math.abs(nx) + hy * Math.abs(ny) + hz * Math.abs(nz);
  if (Math.abs(d) > r) return false;

  const testAxis = (ax, ay, az, ex, ey, ez) => {
    const px = ay * ez - az * ey;
    const py = az * ex - ax * ez;
    const pz = ax * ey - ay * ex;
    const p0 = px * v0px + py * v0py + pz * v0pz;
    const p1 = px * v1px + py * v1py + pz * v1pz;
    const p2 = px * v2px + py * v2py + pz * v2pz;
    let pMin = Math.min(p0, p1, p2);
    let pMax = Math.max(p0, p1, p2);
    const rad = hx * Math.abs(px) + hy * Math.abs(py) + hz * Math.abs(pz);
    return !(pMin > rad || pMax < -rad);
  };

  if (!testAxis(1, 0, 0, e0x, e0y, e0z)) return false;
  if (!testAxis(1, 0, 0, e1x, e1y, e1z)) return false;
  if (!testAxis(1, 0, 0, e2x, e2y, e2z)) return false;
  if (!testAxis(0, 1, 0, e0x, e0y, e0z)) return false;
  if (!testAxis(0, 1, 0, e1x, e1y, e1z)) return false;
  if (!testAxis(0, 1, 0, e2x, e2y, e2z)) return false;
  if (!testAxis(0, 0, 1, e0x, e0y, e0z)) return false;
  if (!testAxis(0, 0, 1, e1x, e1y, e1z)) return false;
  if (!testAxis(0, 0, 1, e2x, e2y, e2z)) return false;

  return true;
}

/** Closest-point barycentric weights on triangle for world point p. */
function barycentricOnTriangle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const v0x = bx - ax;
  const v0y = by - ay;
  const v0z = bz - az;
  const v1x = cx - ax;
  const v1y = cy - ay;
  const v1z = cz - az;
  const v2x = px - ax;
  const v2y = py - ay;
  const v2z = pz - az;

  const d00 = v0x * v0x + v0y * v0y + v0z * v0z;
  const d01 = v0x * v1x + v0y * v1y + v0z * v1z;
  const d11 = v1x * v1x + v1y * v1y + v1z * v1z;
  const d20 = v2x * v0x + v2y * v0y + v2z * v0z;
  const d21 = v2x * v1x + v2y * v1y + v2z * v1z;
  const denom = d00 * d11 - d01 * d01;

  let v = 0;
  let w = 0;
  if (Math.abs(denom) > 1e-14) {
    v = (d11 * d20 - d01 * d21) / denom;
    w = (d00 * d21 - d01 * d20) / denom;
  }
  const u = 1 - v - w;
  return {
    u: THREE.MathUtils.clamp(u, 0, 1),
    v: THREE.MathUtils.clamp(v, 0, 1),
    w: THREE.MathUtils.clamp(w, 0, 1),
  };
}

/**
 * +X ray at fixed (y,z) hits triangle — return world-space x of intersection, or null.
 */
function rayTriangleHitX(tris, tri, rayOx, y, z) {
  const base = tri * 9;
  const ax = tris[base];
  const ay = tris[base + 1];
  const az = tris[base + 2];
  const bx = tris[base + 3];
  const by = tris[base + 4];
  const bz = tris[base + 5];
  const cx = tris[base + 6];
  const cy = tris[base + 7];
  const cz = tris[base + 8];

  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;
  const e2x = cx - ax;
  const e2y = cy - ay;
  const e2z = cz - az;

  const dirX = 1;
  const dirY = 0;
  const dirZ = 0;

  const px = dirY * e2z - dirZ * e2y;
  const py = dirZ * e2x - dirX * e2z;
  const pz = dirX * e2y - dirY * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-9) return null;
  const invDet = 1 / det;

  const tx = rayOx - ax;
  const ty = y - ay;
  const tz = z - az;
  const u = (tx * px + ty * py + tz * pz) * invDet;
  if (u < 0 || u > 1) return null;

  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dirX * qx + dirY * qy + dirZ * qz) * invDet;
  if (v < 0 || u + v > 1) return null;

  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  if (t < 1e-6) return null;
  return rayOx + t;
}

/** +Y ray at fixed (x,z) — world-space y of intersection, or null. */
function rayTriangleHitY(tris, tri, rayOy, x, z) {
  const base = tri * 9;
  const ax = tris[base];
  const ay = tris[base + 1];
  const az = tris[base + 2];
  const bx = tris[base + 3];
  const by = tris[base + 4];
  const bz = tris[base + 5];
  const cx = tris[base + 6];
  const cy = tris[base + 7];
  const cz = tris[base + 8];

  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;
  const e2x = cx - ax;
  const e2y = cy - ay;
  const e2z = cz - az;

  const dirX = 0;
  const dirY = 1;
  const dirZ = 0;

  const px = dirY * e2z - dirZ * e2y;
  const py = dirZ * e2x - dirX * e2z;
  const pz = dirX * e2y - dirY * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-9) return null;
  const invDet = 1 / det;

  const tx = x - ax;
  const ty = rayOy - ay;
  const tz = z - az;
  const u = (tx * px + ty * py + tz * pz) * invDet;
  if (u < 0 || u > 1) return null;

  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dirX * qx + dirY * qy + dirZ * qz) * invDet;
  if (v < 0 || u + v > 1) return null;

  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  if (t < 1e-6) return null;
  return rayOy + t;
}

/** +Z ray at fixed (x,y) — world-space z of intersection, or null. */
function rayTriangleHitZ(tris, tri, rayOz, x, y) {
  const base = tri * 9;
  const ax = tris[base];
  const ay = tris[base + 1];
  const az = tris[base + 2];
  const bx = tris[base + 3];
  const by = tris[base + 4];
  const bz = tris[base + 5];
  const cx = tris[base + 6];
  const cy = tris[base + 7];
  const cz = tris[base + 8];

  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;
  const e2x = cx - ax;
  const e2y = cy - ay;
  const e2z = cz - az;

  const dirX = 0;
  const dirY = 0;
  const dirZ = 1;

  const px = dirY * e2z - dirZ * e2y;
  const py = dirZ * e2x - dirX * e2z;
  const pz = dirX * e2y - dirY * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-9) return null;
  const invDet = 1 / det;

  const tx = x - ax;
  const ty = y - ay;
  const tz = rayOz - az;
  const u = (tx * px + ty * py + tz * pz) * invDet;
  if (u < 0 || u > 1) return null;

  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dirX * qx + dirY * qy + dirZ * qz) * invDet;
  if (v < 0 || u + v > 1) return null;

  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  if (t < 1e-6) return null;
  return rayOz + t;
}

/** Merge nearly-coincident ray hits before parity counting. */
function mergeRayHits(hits, voxelSize) {
  if (hits.length === 0) return hits;
  hits.sort((a, b) => a - b);
  /** @type {number[]} */
  const merged = [hits[0]];
  for (let i = 1; i < hits.length; i += 1) {
    if (hits[i] - merged[merged.length - 1] > voxelSize * 0.01) {
      merged.push(hits[i]);
    }
  }
  return merged;
}

function parityInsideFromHits(hits, cellCenter) {
  let crossings = 0;
  for (let h = 0; h < hits.length; h += 1) {
    if (hits[h] < cellCenter) crossings += 1;
  }
  return crossings % 2 === 1;
}

/**
 * @typedef {{
 *   bucketsX: number[][],
 *   bucketsY: number[][],
 *   bucketsZ: number[][],
 *   tris: Float32Array,
 *   triCount: number,
 *   grid: ReturnType<typeof computeSharedVoxelGrid>,
 *   minInsideVotes: number,
 * }} VoxelParityContext
 */

function buildVoxelParityContext(tris, triCount, grid, minInsideVotes = 2) {
  return {
    bucketsX: buildScanlineTriangleBucketsX(tris, triCount, grid),
    bucketsY: buildScanlineTriangleBucketsY(tris, triCount, grid),
    bucketsZ: buildScanlineTriangleBucketsZ(tris, triCount, grid),
    tris,
    triCount,
    grid,
    minInsideVotes,
  };
}

function collectAxisHits(tris, triCount, trisInRow, hitFn, ...fixedCoords) {
  /** @type {number[]} */
  const hits = [];
  for (let i = 0; i < trisInRow.length; i += 1) {
    const hit = hitFn(tris, trisInRow[i], ...fixedCoords);
    if (hit !== null) hits.push(hit);
  }
  return hits;
}

function isVoxelInsideByParity(ix, iy, iz, ctx) {
  const { grid, bucketsX, bucketsY, bucketsZ, minInsideVotes } = ctx;
  const { origin, voxelSize, nx, ny, nz } = grid;
  const xc = origin.x + (ix + 0.5) * voxelSize;
  const yc = origin.y + (iy + 0.5) * voxelSize;
  const zc = origin.z + (iz + 0.5) * voxelSize;
  let insideVotes = 0;
  let testedAxes = 0;

  const xRow = bucketsX[iy * nz + iz];
  if (xRow.length > 0) {
    testedAxes += 1;
    const rayOx = origin.x - voxelSize;
    const hits = mergeRayHits(
      collectAxisHits(ctx.tris, ctx.triCount, xRow, rayTriangleHitX, rayOx, yc, zc),
      voxelSize,
    );
    if (parityInsideFromHits(hits, xc)) insideVotes += 1;
  }

  const yRow = bucketsY[ix * nz + iz];
  if (yRow.length > 0) {
    testedAxes += 1;
    const rayOy = origin.y - voxelSize;
    const hits = mergeRayHits(
      collectAxisHits(ctx.tris, ctx.triCount, yRow, rayTriangleHitY, rayOy, xc, zc),
      voxelSize,
    );
    if (parityInsideFromHits(hits, yc)) insideVotes += 1;
  }

  const zRow = bucketsZ[ix + iy * nx];
  if (zRow.length > 0) {
    testedAxes += 1;
    const rayOz = origin.z - voxelSize;
    const hits = mergeRayHits(
      collectAxisHits(ctx.tris, ctx.triCount, zRow, rayTriangleHitZ, rayOz, xc, yc),
      voxelSize,
    );
    if (parityInsideFromHits(hits, zc)) insideVotes += 1;
  }

  if (testedAxes === 0) return false;
  if (testedAxes === 1) return insideVotes === 1;
  return insideVotes >= minInsideVotes;
}

function indexToCoords(idx, nx, ny) {
  const iz = Math.floor(idx / (nx * ny));
  const rem = idx - iz * nx * ny;
  const iy = Math.floor(rem / nx);
  const ix = rem - iy * nx;
  return { ix, iy, iz };
}

/**
 * @param {Array<{ pos: THREE.BufferAttribute, index: THREE.BufferAttribute, matrixWorld: THREE.Matrix4 }>} sources
 */
function buildWorldTriangleSoup(sources) {
  let triCount = 0;
  for (const src of sources) triCount += src.index.count / 3;
  const tris = new Float32Array(triCount * 9);
  let offset = 0;
  for (const src of sources) {
    const { pos, index, matrixWorld } = src;
    const count = index.count / 3;
    for (let t = 0; t < count; t += 1) {
      const ia = index.getX(t * 3);
      const ib = index.getX(t * 3 + 1);
      const ic = index.getX(t * 3 + 2);
      _a.fromBufferAttribute(pos, ia).applyMatrix4(matrixWorld);
      _b.fromBufferAttribute(pos, ib).applyMatrix4(matrixWorld);
      _c.fromBufferAttribute(pos, ic).applyMatrix4(matrixWorld);
      const base = offset * 9;
      tris[base] = _a.x;
      tris[base + 1] = _a.y;
      tris[base + 2] = _a.z;
      tris[base + 3] = _b.x;
      tris[base + 4] = _b.y;
      tris[base + 5] = _b.z;
      tris[base + 6] = _c.x;
      tris[base + 7] = _c.y;
      tris[base + 8] = _c.z;
      offset += 1;
    }
  }
  return { tris, triCount };
}

/**
 * Bucket triangles by the (iy, iz) scanlines their YZ bbox touches (+X parity).
 * @returns {number[][]} length ny * nz
 */
function buildScanlineTriangleBucketsX(tris, triCount, grid) {
  const { origin, voxelSize, nx, ny, nz } = grid;
  const inv = 1 / voxelSize;
  /** @type {number[][]} */
  const buckets = Array.from({ length: ny * nz }, () => []);

  for (let t = 0; t < triCount; t += 1) {
    const base = t * 9;
    const y0 = tris[base + 1];
    const y1 = tris[base + 4];
    const y2 = tris[base + 7];
    const z0 = tris[base + 2];
    const z1 = tris[base + 5];
    const z2 = tris[base + 8];

    const iy0 = Math.max(0, Math.floor((Math.min(y0, y1, y2) - origin.y) * inv));
    const iy1 = Math.min(ny - 1, Math.floor((Math.max(y0, y1, y2) - origin.y) * inv));
    const iz0 = Math.max(0, Math.floor((Math.min(z0, z1, z2) - origin.z) * inv));
    const iz1 = Math.min(nz - 1, Math.floor((Math.max(z0, z1, z2) - origin.z) * inv));

    for (let iy = iy0; iy <= iy1; iy += 1) {
      for (let iz = iz0; iz <= iz1; iz += 1) {
        buckets[iy * nz + iz].push(t);
      }
    }
  }

  return buckets;
}

/**
 * Bucket triangles by (ix, iz) for +Y parity.
 * @returns {number[][]} length nx * nz
 */
function buildScanlineTriangleBucketsY(tris, triCount, grid) {
  const { origin, voxelSize, nx, ny, nz } = grid;
  const inv = 1 / voxelSize;
  /** @type {number[][]} */
  const buckets = Array.from({ length: nx * nz }, () => []);

  for (let t = 0; t < triCount; t += 1) {
    const base = t * 9;
    const x0 = tris[base];
    const x1 = tris[base + 3];
    const x2 = tris[base + 6];
    const z0 = tris[base + 2];
    const z1 = tris[base + 5];
    const z2 = tris[base + 8];

    const ix0 = Math.max(0, Math.floor((Math.min(x0, x1, x2) - origin.x) * inv));
    const ix1 = Math.min(nx - 1, Math.floor((Math.max(x0, x1, x2) - origin.x) * inv));
    const iz0 = Math.max(0, Math.floor((Math.min(z0, z1, z2) - origin.z) * inv));
    const iz1 = Math.min(nz - 1, Math.floor((Math.max(z0, z1, z2) - origin.z) * inv));

    for (let ix = ix0; ix <= ix1; ix += 1) {
      for (let iz = iz0; iz <= iz1; iz += 1) {
        buckets[ix * nz + iz].push(t);
      }
    }
  }

  return buckets;
}

/**
 * Bucket triangles by (ix, iy) for +Z parity.
 * @returns {number[][]} length nx * ny
 */
function buildScanlineTriangleBucketsZ(tris, triCount, grid) {
  const { origin, voxelSize, nx, ny, nz } = grid;
  const inv = 1 / voxelSize;
  /** @type {number[][]} */
  const buckets = Array.from({ length: nx * ny }, () => []);

  for (let t = 0; t < triCount; t += 1) {
    const base = t * 9;
    const x0 = tris[base];
    const x1 = tris[base + 3];
    const x2 = tris[base + 6];
    const y0 = tris[base + 1];
    const y1 = tris[base + 4];
    const y2 = tris[base + 7];

    const ix0 = Math.max(0, Math.floor((Math.min(x0, x1, x2) - origin.x) * inv));
    const ix1 = Math.min(nx - 1, Math.floor((Math.max(x0, x1, x2) - origin.x) * inv));
    const iy0 = Math.max(0, Math.floor((Math.min(y0, y1, y2) - origin.y) * inv));
    const iy1 = Math.min(ny - 1, Math.floor((Math.max(y0, y1, y2) - origin.y) * inv));

    for (let ix = ix0; ix <= ix1; ix += 1) {
      for (let iy = iy0; iy <= iy1; iy += 1) {
        buckets[ix + iy * nx].push(t);
      }
    }
  }

  return buckets;
}

/**
 * Mark surface voxels via SAT triangle–AABB tests.
 */
function markMeshSurfaceSat(params) {
  const {
    pos, uvAttr, colorAttr, index, sampler, tint, matrixWorld,
    origin, voxelSize, nx, ny, nz, toIndex, invVoxel,
    flags, cellColors, surfaceOwners, meshSurfaceSet,
  } = params;

  const hx = voxelSize * 0.5;
  const sampleColor = (ia, ib, ic, bu, bv, bw, target) => {
    if (colorAttr) {
      _a.fromBufferAttribute(colorAttr, ia);
      _b.fromBufferAttribute(colorAttr, ib);
      _c.fromBufferAttribute(colorAttr, ic);
      target.setRGB(
        _a.r * bu + _b.r * bv + _c.r * bw,
        _a.g * bu + _b.g * bv + _c.g * bw,
        _a.b * bu + _b.b * bv + _c.b * bw,
      );
      return target;
    }
    if (uvAttr && sampler.ctx) {
      _a.fromBufferAttribute(uvAttr, ia);
      _b.fromBufferAttribute(uvAttr, ib);
      _c.fromBufferAttribute(uvAttr, ic);
      const u = _a.x * bu + _b.x * bv + _c.x * bw;
      const v = _a.y * bu + _b.y * bv + _c.y * bw;
      sampler.sample(u, v, target);
      target.multiply(tint);
      return target;
    }
    return target.copy(tint);
  };

  const triCount = index.count / 3;

  for (let t = 0; t < triCount; t += 1) {
    const ia = index.getX(t * 3);
    const ib = index.getX(t * 3 + 1);
    const ic = index.getX(t * 3 + 2);
    _a.fromBufferAttribute(pos, ia).applyMatrix4(matrixWorld);
    _b.fromBufferAttribute(pos, ib).applyMatrix4(matrixWorld);
    _c.fromBufferAttribute(pos, ic).applyMatrix4(matrixWorld);

    const ax = _a.x;
    const ay = _a.y;
    const az = _a.z;
    const bx = _b.x;
    const by = _b.y;
    const bz = _b.z;
    const cx = _c.x;
    const cy = _c.y;
    const cz = _c.z;

    const ix0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - origin.x) * invVoxel));
    const ix1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - origin.x) * invVoxel));
    const iy0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - origin.y) * invVoxel));
    const iy1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - origin.y) * invVoxel));
    const iz0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - origin.z) * invVoxel));
    const iz1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - origin.z) * invVoxel));

    for (let iz = iz0; iz <= iz1; iz += 1) {
      for (let iy = iy0; iy <= iy1; iy += 1) {
        for (let ix = ix0; ix <= ix1; ix += 1) {
          const cxCell = origin.x + (ix + 0.5) * voxelSize;
          const cyCell = origin.y + (iy + 0.5) * voxelSize;
          const czCell = origin.z + (iz + 0.5) * voxelSize;

          if (!triangleIntersectsAabb(
            ax, ay, az, bx, by, bz, cx, cy, cz,
            cxCell, cyCell, czCell, hx, hx, hx,
          )) continue;

          const idx = toIndex(ix, iy, iz);
          meshSurfaceSet.add(idx);
          if (surfaceOwners[idx] < 65535) surfaceOwners[idx] += 1;

          const bc = barycentricOnTriangle(cxCell, cyCell, czCell, ax, ay, az, bx, by, bz, cx, cy, cz);
          sampleColor(ia, ib, ic, bc.u, bc.v, bc.w, _color);

          if (flags[idx] !== 1) {
            flags[idx] = 1;
            const base = idx * 3;
            cellColors[base] = _color.r;
            cellColors[base + 1] = _color.g;
            cellColors[base + 2] = _color.b;
          }
        }
      }
    }
  }
}

/**
 * Solid fill — interior only where 2+ axis parities agree (reduces straight false columns).
 */
function fillInteriorMultiAxisParity(flags, cellColors, parityCtx) {
  const { nx, ny, nz, toIndex } = parityCtx.grid;

  for (let iz = 0; iz < nz; iz += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        const idx = toIndex(ix, iy, iz);
        if (flags[idx] === 1) continue;
        if (!isVoxelInsideByParity(ix, iy, iz, parityCtx)) continue;
        flags[idx] = 3;
      }
    }
  }

  propagateFillColors(flags, cellColors, nx, ny, nz, toIndex);
}

function propagateFillColors(flags, cellColors, nx, ny, nz, toIndex) {
  const cellCount = flags.length;
  const colored = new Uint8Array(cellCount);
  /** @type {number[]} */
  const queue = [];
  for (let i = 0; i < cellCount; i += 1) {
    if (flags[i] !== 1) continue;
    colored[i] = 1;
    queue.push(i);
  }

  while (queue.length > 0) {
    const idx = queue.shift();
    const { ix, iy, iz } = indexToCoords(idx, nx, ny);
    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
      const nxIdx = ix + dx;
      const nyIdx = iy + dy;
      const nzIdx = iz + dz;
      if (nxIdx < 0 || nyIdx < 0 || nzIdx < 0 || nxIdx >= nx || nyIdx >= ny || nzIdx >= nz) continue;
      const nIdx = toIndex(nxIdx, nyIdx, nzIdx);
      if (flags[nIdx] !== 3 || colored[nIdx]) continue;
      colored[nIdx] = 1;
      const src = idx * 3;
      const dst = nIdx * 3;
      cellColors[dst] = cellColors[src];
      cellColors[dst + 1] = cellColors[src + 1];
      cellColors[dst + 2] = cellColors[src + 2];
      queue.push(nIdx);
    }
  }
}

function cullSmallSurfaceComponents(params) {
  const {
    flags, cellColors, surfaceOwners, meshSurfaceSets, nx, ny, nz, toIndex, minVoxels,
  } = params;

  /** @type {boolean[]} */
  const visited = new Array(flags.length).fill(false);
  /** @type {number[][]} */
  const components = [];

  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i] !== 1 || visited[i]) continue;
    /** @type {number[]} */
    const component = [];
    /** @type {number[]} */
    const queue = [i];
    visited[i] = true;

    while (queue.length > 0) {
      const idx = queue.pop();
      component.push(idx);
      const { ix, iy, iz } = indexToCoords(idx, nx, ny);
      for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
        const nIdx = toIndex(ix + dx, iy + dy, iz + dz);
        if (flags[nIdx] !== 1 || visited[nIdx]) continue;
        visited[nIdx] = true;
        queue.push(nIdx);
      }
    }
    components.push(component);
  }

  if (components.length <= 1) return;

  components.sort((a, b) => b.length - a.length);
  /** @type {Set<number>} */
  const keep = new Set(components[0]);
  for (let c = 1; c < components.length; c += 1) {
    if (components[c].length >= minVoxels) {
      for (const idx of components[c]) keep.add(idx);
    }
  }

  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i] !== 1 || keep.has(i)) continue;
    flags[i] = 0;
    surfaceOwners[i] = 0;
    const base = i * 3;
    cellColors[base] = 0;
    cellColors[base + 1] = 0;
    cellColors[base + 2] = 0;
    for (let m = 0; m < meshSurfaceSets.length; m += 1) {
      meshSurfaceSets[m].delete(i);
    }
  }
}

function collectMeshOccupiedVoxels(params) {
  const {
    meshSurfaceSet, flags, surfaceOwners, meshIdx, meshSurfaceSets, nx, ny, nz, toIndex,
    shellOnly = false,
  } = params;

  /** @type {Set<number>} */
  const owned = new Set(meshSurfaceSet);
  if (shellOnly) return owned;
  /** @type {number[]} */
  const queue = [...meshSurfaceSet];

  const isExclusiveOtherSurface = (idx) => {
    if (flags[idx] !== 1) return false;
    if (meshSurfaceSets[meshIdx].has(idx)) return false;
    return surfaceOwners[idx] === 1;
  };

  while (queue.length > 0) {
    const idx = queue.pop();
    const { ix, iy, iz } = indexToCoords(idx, nx, ny);
    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
      const nIdx = toIndex(ix + dx, iy + dy, iz + dz);
      const flag = flags[nIdx];
      if (flag !== 1 && flag !== 3) continue;
      if (owned.has(nIdx)) continue;
      if (isExclusiveOtherSurface(nIdx)) continue;
      owned.add(nIdx);
      queue.push(nIdx);
    }
  }

  return owned;
}

function mergeCubeGeometryFromCells(params) {
  return buildGreedyVoxelMeshGeometry(params);
}

function buildModelVoxelGeometries(params) {
  const {
    prepared,
    grid,
    fillInterior,
    maxVoxels,
    cullComponentMinVoxels,
    smallMeshSurfaceRatio,
    smallMeshBboxRatio,
    modelWorldBbox,
    spikeErodePasses,
    spikeMaxNeighbors,
    satelliteMinGridGapVoxels,
    needleMaxAspectRatio,
    needleMaxVoxels,
    parityMinInsideVotes,
    surfaceShellErodePasses,
    surfaceShellMaxNeighbors,
    oneWideRodMinLength,
    oneWideRodThinMaxNeighbors,
    danglingSurfaceErodePasses,
    danglingSurfaceMaxOccupiedNeighbors,
    danglingSurfaceMaxSurfaceNeighbors,
  } = params;

  const { origin, voxelSize, nx, ny, nz, toIndex } = grid;
  const cellCount = nx * ny * nz;
  const invVoxel = 1 / voxelSize;

  /** @type {Uint8Array} 0 empty, 1 surface, 3 filled */
  const flags = new Uint8Array(cellCount);
  /** @type {Float32Array} */
  const cellColors = new Float32Array(cellCount * 3);
  /** @type {Uint16Array} */
  const surfaceOwners = new Uint16Array(cellCount);
  /** @type {Set<number>[]} */
  const meshSurfaceSets = prepared.map(() => new Set());

  for (let meshIdx = 0; meshIdx < prepared.length; meshIdx += 1) {
    const item = prepared[meshIdx];
    markMeshSurfaceSat({
      pos: item.pos,
      uvAttr: item.uvAttr,
      colorAttr: item.colorAttr,
      index: item.index,
      sampler: item.sampler,
      tint: item.tint,
      matrixWorld: item.entry.matrixWorld,
      origin,
      voxelSize,
      nx,
      ny,
      nz,
      toIndex,
      invVoxel,
      flags,
      cellColors,
      surfaceOwners,
      meshSurfaceSet: meshSurfaceSets[meshIdx],
    });
  }

  let surfaceCount = 0;
  for (let i = 0; i < cellCount; i += 1) {
    if (flags[i] === 1) surfaceCount += 1;
  }
  if (surfaceCount === 0) return null;

  cullSmallSurfaceComponents({
    flags,
    cellColors,
    surfaceOwners,
    meshSurfaceSets,
    nx,
    ny,
    nz,
    toIndex,
    minVoxels: cullComponentMinVoxels,
  });

  surfaceCount = 0;
  for (let i = 0; i < cellCount; i += 1) {
    if (flags[i] === 1) surfaceCount += 1;
  }
  if (surfaceCount === 0) return null;

  const triangleSoup = buildWorldTriangleSoup(
    prepared.map((item) => ({
      pos: item.pos,
      index: item.index,
      matrixWorld: item.entry.matrixWorld,
    })),
  );

  if (fillInterior) {
    const parityCtx = buildVoxelParityContext(
      triangleSoup.tris,
      triangleSoup.triCount,
      grid,
      parityMinInsideVotes,
    );
    fillInteriorMultiAxisParity(flags, cellColors, parityCtx);

    cullFilledExteriorByParity(
      flags,
      cellColors,
      surfaceOwners,
      meshSurfaceSets,
      parityCtx,
    );

    erodeThinOccupiedSpikes({
      flags,
      cellColors,
      surfaceOwners,
      meshSurfaceSets,
      nx,
      ny,
      nz,
      toIndex,
      maxPasses: spikeErodePasses,
      maxNeighbors: spikeMaxNeighbors,
    });

    cullOneWideOccupiedRods({
      flags,
      cellColors,
      surfaceOwners,
      meshSurfaceSets,
      nx,
      ny,
      nz,
      toIndex,
      minRodLength: oneWideRodMinLength,
      thinMaxNeighbors: oneWideRodThinMaxNeighbors,
    });

    erodeThinSurfaceShell({
      flags,
      cellColors,
      surfaceOwners,
      meshSurfaceSets,
      nx,
      ny,
      nz,
      toIndex,
      maxPasses: surfaceShellErodePasses,
      maxNeighbors: surfaceShellMaxNeighbors,
    });

    peelDanglingSurfaceShell({
      flags,
      cellColors,
      surfaceOwners,
      meshSurfaceSets,
      nx,
      ny,
      nz,
      toIndex,
      maxPasses: danglingSurfaceErodePasses,
      maxOccupiedNeighbors: danglingSurfaceMaxOccupiedNeighbors,
      maxSurfaceNeighbors: danglingSurfaceMaxSurfaceNeighbors,
    });

    cullSmallOccupiedComponents({
      flags,
      cellColors,
      surfaceOwners,
      meshSurfaceSets,
      nx,
      ny,
      nz,
      toIndex,
      minVoxels: cullComponentMinVoxels,
    });

    cullNeedleSatellites({
      flags,
      cellColors,
      surfaceOwners,
      meshSurfaceSets,
      nx,
      ny,
      nz,
      toIndex,
      minGridGap: satelliteMinGridGapVoxels,
      maxAspectRatio: needleMaxAspectRatio,
      maxNeedleVoxels: needleMaxVoxels,
    });
  } else {
    erodeThinOccupiedSpikes({
      flags,
      cellColors,
      surfaceOwners,
      meshSurfaceSets,
      nx,
      ny,
      nz,
      toIndex,
      maxPasses: spikeErodePasses,
      maxNeighbors: spikeMaxNeighbors,
    });

    erodeThinSurfaceShell({
      flags,
      cellColors,
      surfaceOwners,
      meshSurfaceSets,
      nx,
      ny,
      nz,
      toIndex,
      maxPasses: surfaceShellErodePasses,
      maxNeighbors: surfaceShellMaxNeighbors,
    });

    peelDanglingSurfaceShell({
      flags,
      cellColors,
      surfaceOwners,
      meshSurfaceSets,
      nx,
      ny,
      nz,
      toIndex,
      maxPasses: danglingSurfaceErodePasses,
      maxOccupiedNeighbors: danglingSurfaceMaxOccupiedNeighbors,
      maxSurfaceNeighbors: danglingSurfaceMaxSurfaceNeighbors,
    });
  }

  for (let m = 0; m < meshSurfaceSets.length; m += 1) {
    for (const idx of [...meshSurfaceSets[m]]) {
      if (flags[idx] !== 1) meshSurfaceSets[m].delete(idx);
    }
  }

  let occupied = 0;
  for (let i = 0; i < cellCount; i += 1) {
    if (flags[i] === 1 || flags[i] === 3) occupied += 1;
  }
  if (occupied === 0 || occupied > maxVoxels) return null;

  const modelDiag = modelWorldBbox.getSize(_size).length();
  const totalMeshSurface = meshSurfaceSets.reduce((sum, set) => sum + set.size, 0);
  const meshShellOnly = meshSurfaceSets.map((set, meshIdx) => {
    if (prepared.length <= 1) return false;
    const surfaceShare = set.size / Math.max(totalMeshSurface, 1);
    const bboxShare = prepared[meshIdx].worldBboxDiagonal / Math.max(modelDiag, 1e-6);
    return surfaceShare < smallMeshSurfaceRatio || bboxShare < smallMeshBboxRatio;
  });

  /** @type {Map<THREE.Mesh, THREE.BufferGeometry | null>} */
  const out = new Map();

  for (let meshIdx = 0; meshIdx < prepared.length; meshIdx += 1) {
    const item = prepared[meshIdx];
    const owned = collectMeshOccupiedVoxels({
      meshSurfaceSet: meshSurfaceSets[meshIdx],
      flags,
      surfaceOwners,
      meshIdx,
      meshSurfaceSets,
      nx,
      ny,
      nz,
      toIndex,
      shellOnly: meshShellOnly[meshIdx],
    });

    if (owned.size === 0) {
      out.set(item.entry.mesh, null);
      continue;
    }

    const geometry = mergeCubeGeometryFromCells({
      cells: owned,
      cellColors,
      nx,
      ny,
      nz,
      toIndex,
      origin,
      voxelSize,
    });

    if (geometry) {
      geometry.applyMatrix4(item.entry.inverseWorldMatrix);
      geometry.computeBoundingSphere();
    }
    out.set(item.entry.mesh, geometry);
  }

  return out;
}

/**
 * Voxelize all model meshes on one shared world-space grid.
 * @param {Array<object>} entries
 * @param {object} [options]
 * @returns {Map<THREE.Mesh, THREE.BufferGeometry | null>}
 */
export function voxelizeModelMeshes(entries, options = {}) {
  /** @type {Map<THREE.Mesh, THREE.BufferGeometry | null>} */
  const results = new Map();
  if (!entries?.length) return results;

  const cfg = resolveVoxelLookConfig(options.preset);
  let maxAxis = Math.max(8, Math.round(options.maxAxis ?? cfg.maxAxis));
  const fillInterior = options.fillInterior ?? cfg.fillInterior;
  const maxVoxels = Math.max(1000, Math.round(options.maxVoxels ?? cfg.maxVoxels));
  const cullComponentMinVoxels = options.cullComponentMinVoxels ?? cfg.cullComponentMinVoxels ?? 10;
  const smallMeshSurfaceRatio = options.smallMeshSurfaceRatio ?? cfg.smallMeshSurfaceRatio ?? 0.15;
  const smallMeshBboxRatio = options.smallMeshBboxRatio ?? cfg.smallMeshBboxRatio ?? 0.35;
  const spikeErodePasses = options.spikeErodePasses ?? cfg.spikeErodePasses ?? 5;
  const spikeMaxNeighbors = options.spikeMaxNeighbors ?? cfg.spikeMaxNeighbors ?? 2;
  const satelliteMinGridGapVoxels = options.satelliteMinGridGapVoxels ?? cfg.satelliteMinGridGapVoxels ?? 2;
  const needleMaxAspectRatio = options.needleMaxAspectRatio ?? cfg.needleMaxAspectRatio ?? 4;
  const needleMaxVoxels = options.needleMaxVoxels ?? cfg.needleMaxVoxels ?? 64;
  const parityMinInsideVotes = options.parityMinInsideVotes ?? cfg.parityMinInsideVotes ?? 2;
  const surfaceShellErodePasses = options.surfaceShellErodePasses ?? cfg.surfaceShellErodePasses ?? 2;
  const surfaceShellMaxNeighbors = options.surfaceShellMaxNeighbors ?? cfg.surfaceShellMaxNeighbors ?? 3;
  const oneWideRodMinLength = options.oneWideRodMinLength ?? cfg.oneWideRodMinLength ?? 3;
  const oneWideRodThinMaxNeighbors = options.oneWideRodThinMaxNeighbors ?? cfg.oneWideRodThinMaxNeighbors ?? 3;
  const danglingSurfaceErodePasses = options.danglingSurfaceErodePasses ?? cfg.danglingSurfaceErodePasses ?? 2;
  const danglingSurfaceMaxOccupiedNeighbors = options.danglingSurfaceMaxOccupiedNeighbors
    ?? cfg.danglingSurfaceMaxOccupiedNeighbors ?? 4;
  const danglingSurfaceMaxSurfaceNeighbors = options.danglingSurfaceMaxSurfaceNeighbors
    ?? cfg.danglingSurfaceMaxSurfaceNeighbors ?? 2;

  const worldBbox = new THREE.Box3();
  /** @type {Array<object>} */
  const prepared = [];

  for (const entry of entries) {
    const working = ensureIndexedGeometry(entry.geometry);
    if (!working.index || working.attributes.position.count < 9) {
      working.dispose?.();
      results.set(entry.mesh, null);
      continue;
    }

    const pos = working.attributes.position;
    const meshBbox = new THREE.Box3().setFromBufferAttribute(pos);
    meshBbox.applyMatrix4(entry.matrixWorld);
    worldBbox.union(meshBbox);

    const tint = entry.diffuseTint?.isColor ? entry.diffuseTint : new THREE.Color(1, 1, 1);
    prepared.push({
      entry,
      working,
      pos,
      uvAttr: working.attributes.uv ?? null,
      colorAttr: working.attributes.color ?? null,
      index: working.index,
      sampler: new TextureColorSampler(entry.diffuseMap),
      tint,
      worldBboxDiagonal: meshBbox.getSize(_size).length(),
    });
  }

  if (prepared.length === 0 || worldBbox.isEmpty()) {
    for (const item of prepared) item.working.dispose?.();
    return results;
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const grid = computeSharedVoxelGrid(worldBbox, maxAxis);
    if (!grid) {
      maxAxis = Math.max(16, Math.floor(maxAxis * 0.78));
      continue;
    }

    const built = buildModelVoxelGeometries({
      prepared,
      grid,
      fillInterior,
      maxVoxels,
      cullComponentMinVoxels,
      smallMeshSurfaceRatio,
      smallMeshBboxRatio,
      modelWorldBbox: worldBbox,
      spikeErodePasses,
      spikeMaxNeighbors,
      satelliteMinGridGapVoxels,
      needleMaxAspectRatio,
      needleMaxVoxels,
      parityMinInsideVotes,
      surfaceShellErodePasses,
      surfaceShellMaxNeighbors,
      oneWideRodMinLength,
      oneWideRodThinMaxNeighbors,
      danglingSurfaceErodePasses,
      danglingSurfaceMaxOccupiedNeighbors,
      danglingSurfaceMaxSurfaceNeighbors,
    });

    if (built) {
      for (const item of prepared) {
        results.set(item.entry.mesh, built.get(item.entry.mesh) ?? null);
        item.working.dispose?.();
      }
      return results;
    }

    maxAxis = Math.max(16, Math.floor(maxAxis * 0.78));
  }

  for (const item of prepared) {
    results.set(item.entry.mesh, null);
    item.working.dispose?.();
  }
  return results;
}

/** @param {THREE.BufferGeometry} geometry @param {object} [options] */
export function voxelizeMeshGeometry(geometry, options = {}) {
  if (!geometry?.attributes?.position) return null;

  const matrixWorld = options.matrixWorld ?? _matrix.identity();
  const inverseWorldMatrix = options.inverseWorldMatrix ?? _matrix.copy(matrixWorld).invert();
  const meshKey = /** @type {THREE.Mesh} */ (/** @type {unknown} */ ({}));

  const results = voxelizeModelMeshes(
    [{
      mesh: meshKey,
      geometry,
      matrixWorld,
      inverseWorldMatrix,
      diffuseMap: options.diffuseMap,
      diffuseTint: options.diffuseTint,
    }],
    options,
  );

  return results.get(meshKey) ?? null;
}
