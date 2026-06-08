import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _cross = new THREE.Vector3();
const _n0 = new THREE.Vector3();
const _n1 = new THREE.Vector3();

function edgeKey(a, b) {
  return a < b ? a + ',' + b : b + ',' + a;
}

function readPos(pos, i, target) {
  return target.fromBufferAttribute(pos, i);
}

function writePos(pos, i, v) {
  pos.setXYZ(i, v.x, v.y, v.z);
}

function uvsCompatible(ua, ub, uvAttr, eps = 1e-4) {
  if (!uvAttr) return true;
  const ax = uvAttr.getX(ua);
  const ay = uvAttr.getY(ua);
  const bx = uvAttr.getX(ub);
  const by = uvAttr.getY(ub);
  return Math.abs(ax - bx) <= eps && Math.abs(ay - by) <= eps;
}

/**
 * Build edge list + per-vertex triangle lists from indexed geometry.
 * @param {THREE.BufferAttribute} index
 * @param {number} vertexCount
 */
function buildMeshTopology(index, vertexCount) {
  /** @type {Map<string, { a: number, b: number, tris: number[] }>} */
  const edges = new Map();
  /** @type {number[][]} */
  const vtxTris = Array.from({ length: vertexCount }, () => []);

  const triCount = index.count / 3;
  for (let t = 0; t < triCount; t += 1) {
    const base = t * 3;
    const ia = index.getX(base);
    const ib = index.getX(base + 1);
    const ic = index.getX(base + 2);
    vtxTris[ia].push(t);
    vtxTris[ib].push(t);
    vtxTris[ic].push(t);

    const pairs = [
      [ia, ib],
      [ib, ic],
      [ic, ia],
    ];
    for (const [va, vb] of pairs) {
      const key = edgeKey(va, vb);
      let edge = edges.get(key);
      if (!edge) {
        edge = { a: Math.min(va, vb), b: Math.max(va, vb), tris: [] };
        edges.set(key, edge);
      }
      edge.tris.push(t);
    }
  }

  return { edges, vtxTris, triCount };
}

/**
 * Union-find with path compression.
 * @param {Int32Array} parent
 * @param {number} i
 */
function findRoot(parent, i) {
  let root = i;
  while (parent[root] !== root) {
    root = parent[root];
  }
  let cur = i;
  while (parent[cur] !== root) {
    const next = parent[cur];
    parent[cur] = root;
    cur = next;
  }
  return root;
}

/**
 * Check collapse safety using live index + simulated midpoint at ra.
 * @param {number} ra
 * @param {number} rb
 * @param {THREE.BufferAttribute} pos
 * @param {THREE.BufferAttribute} index
 * @param {Int32Array} parent
 * @param {Set<number>} triSet
 * @param {THREE.Vector3} mid
 */
function validateCollapse(ra, rb, pos, index, parent, triSet, mid) {
  const minAreaSq = 1e-20;
  const resolve = (v) => findRoot(parent, v);

  const remapCorner = (v) => {
    const r = resolve(v);
    return r === rb ? ra : r;
  };

  for (const t of triSet) {
    const base = t * 3;
    let ia = index.getX(base);
    let ib = index.getX(base + 1);
    let ic = index.getX(base + 2);

    const r0 = remapCorner(ia);
    const r1 = remapCorner(ib);
    const r2 = remapCorner(ic);
    if (r0 === r1 || r1 === r2 || r0 === r2) continue;

    _n0.copy(triangleNormalAt(ia, ib, ic, pos, resolve, minAreaSq) || _n0.set(0, 0, 0));

    readPos(pos, r0 === ra ? ra : r0, _a);
    readPos(pos, r1 === ra ? ra : r1, _b);
    readPos(pos, r2 === ra ? ra : r2, _c);
    if (r0 === ra) _a.copy(mid);
    if (r1 === ra) _b.copy(mid);
    if (r2 === ra) _c.copy(mid);

    _ab.subVectors(_b, _a);
    _ac.subVectors(_c, _a);
    _cross.crossVectors(_ab, _ac);
    if (_cross.lengthSq() < minAreaSq) continue;

    _n1.copy(_cross).normalize();
    if (_n0.lengthSq() > 0 && _n1.dot(_n0) < 0.15) return false;
  }

  return true;
}

function triangleNormalAt(ia, ib, ic, pos, resolve, minAreaSq) {
  readPos(pos, resolve(ia), _a);
  readPos(pos, resolve(ib), _b);
  readPos(pos, resolve(ic), _c);
  _ab.subVectors(_b, _a);
  _ac.subVectors(_c, _a);
  _cross.crossVectors(_ab, _ac);
  if (_cross.lengthSq() < minAreaSq) return null;
  return _n0.copy(_cross).normalize();
}

/**
 * Hole-safe PS2 decimation: collapse only short *mesh edges* (never spatial-only welds).
 * Triangles are never removed — degenerates may remain but the surface stays closed.
 *
 * @param {THREE.BufferGeometry} geometry — indexed triangles with position attribute
 * @param {number} maxEdgeLength — collapse connected edges shorter than this (world/object units)
 * @returns {THREE.BufferGeometry}
 */
export function decimatePs2CrushGeometry(geometry, maxEdgeLength) {
  if (!geometry?.attributes?.position || !geometry.index) {
    return geometry;
  }

  const tol = Math.max(Number(maxEdgeLength) || 0, 0);
  if (tol <= 1e-12) {
    return geometry.clone();
  }

  const out = geometry.clone();
  const pos = out.attributes.position;
  const uvAttr = out.attributes.uv ?? null;
  const index = out.index;
  const vertexCount = pos.count;

  const { edges, vtxTris } = buildMeshTopology(index, vertexCount);
  const parent = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) {
    parent[i] = i;
  }

  /** @type {{ a: number, b: number, len: number, tris: number[] }[]} */
  const edgeList = [];
  for (const edge of edges.values()) {
    readPos(pos, edge.a, _a);
    readPos(pos, edge.b, _b);
    edgeList.push({
      a: edge.a,
      b: edge.b,
      len: _a.distanceTo(_b),
      tris: edge.tris,
    });
  }
  edgeList.sort((x, y) => x.len - y.len);

  let collapsedAny = true;
  while (collapsedAny) {
    collapsedAny = false;

    for (const edge of edgeList) {
      const ra = findRoot(parent, edge.a);
      const rb = findRoot(parent, edge.b);
      if (ra === rb) continue;

      readPos(pos, ra, _a);
      readPos(pos, rb, _b);
      const len = _a.distanceTo(_b);
      if (len > tol) continue;

      if (!uvsCompatible(ra, rb, uvAttr)) continue;

      _c.addVectors(_a, _b).multiplyScalar(0.5);

      const triSet = new Set();
      for (const t of vtxTris[ra]) triSet.add(t);
      for (const t of vtxTris[rb]) triSet.add(t);

      if (!validateCollapse(ra, rb, pos, index, parent, triSet, _c)) continue;

      writePos(pos, ra, _c);
      parent[rb] = ra;

      const triUnion = new Set(vtxTris[ra]);
      for (const t of vtxTris[rb]) triUnion.add(t);
      vtxTris[ra] = [...triUnion];
      vtxTris[rb] = vtxTris[ra];
      collapsedAny = true;
    }
  }

  // Remap indices through union-find — never drop triangles.
  for (let i = 0; i < index.count; i += 1) {
    index.setX(i, findRoot(parent, index.getX(i)));
  }

  pos.needsUpdate = true;
  index.needsUpdate = true;
  return out;
}

/**
 * Mean edge length for adaptive collapse tolerance (indexed triangles).
 * @param {THREE.BufferGeometry} geometry
 * @returns {number | null}
 */
export function estimatePs2CrushMeanEdgeLength(geometry) {
  const index = geometry.index;
  const pos = geometry.attributes.position;
  if (!index || !pos) return null;

  let sum = 0;
  let count = 0;
  const stride = index.count > 45000 ? 9 : 3;

  for (let i = 0; i < index.count; i += stride) {
    readPos(pos, index.getX(i), _a);
    readPos(pos, index.getX(i + 1), _b);
    sum += _a.distanceTo(_b);
    count += 1;
  }

  return count > 0 ? sum / count : null;
}
