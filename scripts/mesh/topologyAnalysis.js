import * as THREE from 'three';

/** Coplanar adjacent triangles merge into one polygon when |dot(n0, n1)| ≥ this. */
const COPLANAR_DOT = 0.9995;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _normal = new THREE.Vector3();

/** Quantized world-space vertex key — welds split indices at the same position. */
function positionKey(pos, index, precision = 1e5) {
  const x = pos.getX(index);
  const y = pos.getY(index);
  const z = pos.getZ(index);
  return `${Math.round(x * precision)},${Math.round(y * precision)},${Math.round(z * precision)}`;
}

function edgePositionKey(pos, ia, ib, precision = 1e5) {
  const ka = positionKey(pos, ia, precision);
  const kb = positionKey(pos, ib, precision);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

function readPos(pos, index, target) {
  return target.fromBufferAttribute(pos, index);
}

function makeUnionFind(size) {
  const parent = new Int32Array(size);
  for (let i = 0; i < size; i += 1) {
    parent[i] = i;
  }

  const find = (i) => {
    let root = i;
    while (root !== parent[root]) {
      parent[root] = parent[parent[root]];
      root = parent[root];
    }
    return root;
  };

  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  return { parent, find, union };
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @returns {{ getTriVertex: (tri: number, corner: 0 | 1 | 2) => number, triCount: number } | null}
 */
function getTriangleAccess(geometry) {
  const pos = geometry.attributes.position;
  if (!pos?.count) return null;

  if (geometry.index) {
    const index = geometry.index;
    if (index.count % 3 !== 0) return null;
    return {
      triCount: index.count / 3,
      getTriVertex: (tri, corner) => index.getX(tri * 3 + corner),
    };
  }

  if (pos.count % 3 !== 0) return null;
  return {
    triCount: pos.count / 3,
    getTriVertex: (tri, corner) => tri * 3 + corner,
  };
}

/**
 * @param {THREE.BufferAttribute} pos
 * @param {(tri: number, corner: 0 | 1 | 2) => number} getTriVertex
 * @param {number} tri
 * @param {number[]} target
 */
function appendTrianglePositions(pos, getTriVertex, tri, target) {
  for (let corner = 0; corner < 3; corner += 1) {
    const index = getTriVertex(tri, /** @type {0|1|2} */ (corner));
    target.push(pos.getX(index), pos.getY(index), pos.getZ(index));
  }
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @returns {{ report: MeshTopologyReport, visuals: TopologyMeshVisuals } | null}
 */
function buildGeometryTopologyData(geometry) {
  const triAccess = getTriangleAccess(geometry);
  if (!triAccess) return null;

  const { getTriVertex, triCount } = triAccess;
  const emptyReport = {
    triangles: 0,
    openBorderEdges: 0,
    nonManifoldEdges: 0,
    looseVertices: 0,
    ngons: 0,
    disconnectedPieces: 0,
    degenerateTriangles: 0,
  };
  const emptyVisuals = {
    openBorderSegments: [],
    nonManifoldSegments: [],
    looseVertexPositions: [],
    ngonFacePositions: [],
    degenerateFacePositions: [],
    islandFacePositions: [],
    islandBorderSegments: [],
  };

  if (triCount <= 0) {
    return { report: emptyReport, visuals: emptyVisuals };
  }

  const pos = geometry.attributes.position;
  const vertexCount = pos.count;
  const vertexUsed = new Uint8Array(vertexCount);

  /** @type {Map<string, { tris: number[], ia: number, ib: number }>} */
  const edgeTris = new Map();
  /** @type {(THREE.Vector3 | null)[]} */
  const triNormals = new Array(triCount);
  /** @type {number[]} */
  const degenerateTriIndices = [];

  let degenerateTriangles = 0;

  for (let t = 0; t < triCount; t += 1) {
    const ia = getTriVertex(t, 0);
    const ib = getTriVertex(t, 1);
    const ic = getTriVertex(t, 2);

    if (ia === ib || ib === ic || ic === ia) {
      degenerateTriangles += 1;
      degenerateTriIndices.push(t);
    }

    vertexUsed[ia] = 1;
    vertexUsed[ib] = 1;
    vertexUsed[ic] = 1;

    readPos(pos, ia, _a);
    readPos(pos, ib, _b);
    readPos(pos, ic, _c);
    _ab.subVectors(_b, _a);
    _ac.subVectors(_c, _a);
    _normal.crossVectors(_ab, _ac);
    const len = _normal.length();
    triNormals[t] = len > 1e-14 ? _normal.clone().divideScalar(len) : null;

    for (const [va, vb] of [[ia, ib], [ib, ic], [ic, ia]]) {
      if (va === vb) continue;
      const key = edgePositionKey(pos, va, vb);
      let entry = edgeTris.get(key);
      if (!entry) {
        entry = { tris: [], ia: va, ib: vb };
        edgeTris.set(key, entry);
      }
      entry.tris.push(t);
    }
  }

  let openBorderEdges = 0;
  let nonManifoldEdges = 0;
  /** @type {number[]} */
  const openBorderSegments = [];
  /** @type {number[]} */
  const nonManifoldSegments = [];

  for (const entry of edgeTris.values()) {
    readPos(pos, entry.ia, _a);
    readPos(pos, entry.ib, _b);
    const segment = [_a.x, _a.y, _a.z, _b.x, _b.y, _b.z];
    if (entry.tris.length === 1) {
      openBorderEdges += 1;
      openBorderSegments.push(...segment);
    } else if (entry.tris.length > 2) {
      nonManifoldEdges += 1;
      nonManifoldSegments.push(...segment);
    }
  }

  /** @type {number[]} */
  const looseVertexPositions = [];
  for (let i = 0; i < vertexCount; i += 1) {
    if (!vertexUsed[i]) {
      looseVertexPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
  }

  const coplanarGroups = makeUnionFind(triCount);
  for (const entry of edgeTris.values()) {
    if (entry.tris.length !== 2) continue;
    const [t0, t1] = entry.tris;
    const n0 = triNormals[t0];
    const n1 = triNormals[t1];
    if (!n0 || !n1) continue;
    if (n0.dot(n1) >= COPLANAR_DOT) {
      coplanarGroups.union(t0, t1);
    }
  }

  /** @type {Map<number, number[]>} */
  const mergedPolygons = new Map();
  for (let t = 0; t < triCount; t += 1) {
    const root = coplanarGroups.find(t);
    if (!mergedPolygons.has(root)) mergedPolygons.set(root, []);
    mergedPolygons.get(root).push(t);
  }

  let ngons = 0;
  /** @type {Set<number>} */
  const ngonTriIndices = new Set();
  for (const triList of mergedPolygons.values()) {
    /** @type {Map<string, number>} */
    const groupEdgeCounts = new Map();
    for (const t of triList) {
      const ia = getTriVertex(t, 0);
      const ib = getTriVertex(t, 1);
      const ic = getTriVertex(t, 2);
      for (const [va, vb] of [[ia, ib], [ib, ic], [ic, ia]]) {
        if (va === vb) continue;
        const key = edgePositionKey(pos, va, vb);
        groupEdgeCounts.set(key, (groupEdgeCounts.get(key) || 0) + 1);
      }
    }
    let boundaryEdges = 0;
    for (const count of groupEdgeCounts.values()) {
      if (count === 1) boundaryEdges += 1;
    }
    if (boundaryEdges > 4) {
      ngons += 1;
      for (const t of triList) ngonTriIndices.add(t);
    }
  }

  const connectivity = makeUnionFind(triCount);
  for (const entry of edgeTris.values()) {
    if (entry.tris.length === 2) {
      connectivity.union(entry.tris[0], entry.tris[1]);
    }
  }

  /** @type {Map<number, number[]>} */
  const islandGroups = new Map();
  for (let t = 0; t < triCount; t += 1) {
    const root = connectivity.find(t);
    if (!islandGroups.has(root)) islandGroups.set(root, []);
    islandGroups.get(root).push(t);
  }

  let mainIslandRoot = -1;
  let mainIslandSize = 0;
  for (const [root, tris] of islandGroups.entries()) {
    if (tris.length > mainIslandSize) {
      mainIslandSize = tris.length;
      mainIslandRoot = root;
    }
  }

  /** @type {number[]} */
  const ngonFacePositions = [];
  for (const tri of ngonTriIndices) {
    appendTrianglePositions(pos, getTriVertex, tri, ngonFacePositions);
  }

  /** @type {number[]} */
  const degenerateFacePositions = [];
  for (const tri of degenerateTriIndices) {
    appendTrianglePositions(pos, getTriVertex, tri, degenerateFacePositions);
  }

  /** @type {number[]} */
  const islandFacePositions = [];
  for (const [root, tris] of islandGroups.entries()) {
    if (root === mainIslandRoot) continue;
    for (const tri of tris) {
      appendTrianglePositions(pos, getTriVertex, tri, islandFacePositions);
    }
  }

  /** @type {Set<number>} */
  const mainIslandTris = new Set(islandGroups.get(mainIslandRoot) ?? []);
  /** @type {number[]} */
  const islandBorderSegments = [];
  for (const entry of edgeTris.values()) {
    if (!entry.tris.every((tri) => !mainIslandTris.has(tri))) continue;
    readPos(pos, entry.ia, _a);
    readPos(pos, entry.ib, _b);
    islandBorderSegments.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z);
  }

  const disconnectedPieces = Math.max(0, islandGroups.size - 1);

  return {
    report: {
      triangles: triCount,
      openBorderEdges,
      nonManifoldEdges,
      looseVertices: looseVertexPositions.length / 3,
      ngons,
      disconnectedPieces,
      degenerateTriangles,
    },
    visuals: {
      openBorderSegments,
      nonManifoldSegments,
      looseVertexPositions,
      ngonFacePositions,
      degenerateFacePositions,
      islandFacePositions,
      islandBorderSegments,
    },
  };
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @returns {MeshTopologyReport | null}
 */
export function analyzeGeometryTopology(geometry) {
  return buildGeometryTopologyData(geometry)?.report ?? null;
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @returns {TopologyMeshVisuals | null}
 */
export function collectGeometryTopologyVisuals(geometry) {
  return buildGeometryTopologyData(geometry)?.visuals ?? null;
}

/**
 * @typedef {object} MeshTopologyReport
 * @property {number} triangles
 * @property {number} openBorderEdges
 * @property {number} nonManifoldEdges
 * @property {number} looseVertices
 * @property {number} ngons
 * @property {number} disconnectedPieces
 * @property {number} degenerateTriangles
 */

/**
 * @typedef {object} TopologyMeshVisuals
 * @property {number[]} openBorderSegments
 * @property {number[]} nonManifoldSegments
 * @property {number[]} looseVertexPositions
 * @property {number[]} ngonFacePositions
 * @property {number[]} degenerateFacePositions
 * @property {number[]} islandFacePositions
 * @property {number[]} islandBorderSegments
 */

/**
 * @typedef {'non-manifold-edges' | 'ngons' | 'loose-vertices' | 'loose-geometry' | 'open-borders' | 'degenerate-triangles'} TopologyWarningCategory
 */

/** @type {TopologyWarningCategory[]} */
export const TOPOLOGY_WARNING_CATEGORIES = [
  'non-manifold-edges',
  'ngons',
  'loose-vertices',
  'loose-geometry',
  'open-borders',
  'degenerate-triangles',
];

/**
 * @typedef {object} TopologyWarning
 * @property {'issue' | 'ok' | 'info'} kind
 * @property {string} label
 * @property {string} detail
 * @property {TopologyWarningCategory} [category]
 * @property {string} [meshName]
 */

/**
 * @typedef {object} TopologyAnalysisResult
 * @property {boolean} hasModel
 * @property {boolean} clean
 * @property {number} meshCount
 * @property {MeshTopologyReport} totals
 * @property {{ name: string, report: MeshTopologyReport, visuals: TopologyMeshVisuals }[]} meshes
 * @property {TopologyWarning[]} warnings
 */

function isAnalyzableMesh(child) {
  return (
    child.isMesh
    && !child.userData.isWireframeOverlay
    && !child.userData.isUvCheckerOverlay
    && !child.userData.isNormalViewOverlay
    && !child.userData.isTopologyWarningsOverlay
    && child.geometry
  );
}

/**
 * @param {THREE.Object3D | null | undefined} root
 * @returns {TopologyAnalysisResult}
 */
export function analyzeModelTopology(root) {
  if (!root) {
    return {
      hasModel: false,
      clean: true,
      meshCount: 0,
      totals: emptyTotals(),
      meshes: [],
      warnings: [{
        kind: 'info',
        label: 'No model loaded',
        detail: 'Load a mesh to run a topology health check.',
      }],
    };
  }

  /** @type {{ name: string, report: MeshTopologyReport, visuals: TopologyMeshVisuals }[]} */
  const meshes = [];

  root.traverse((child) => {
    if (!isAnalyzableMesh(child)) return;

    const data = buildGeometryTopologyData(child.geometry);
    if (!data) return;

    const rawName = typeof child.name === 'string' ? child.name.trim() : '';
    meshes.push({
      name: rawName || `Mesh ${meshes.length + 1}`,
      report: data.report,
      visuals: data.visuals,
    });
  });

  if (meshes.length === 0) {
    return {
      hasModel: true,
      clean: true,
      meshCount: 0,
      totals: emptyTotals(),
      meshes: [],
      warnings: [{
        kind: 'info',
        label: 'No triangle meshes found',
        detail: 'This asset has no analyzable triangle geometry.',
      }],
    };
  }

  const totals = meshes.reduce(
    (acc, entry) => mergeReports(acc, entry.report),
    emptyTotals(),
  );

  const warnings = buildWarnings(meshes, totals);
  const clean = warnings.every((item) => item.kind !== 'issue');

  return {
    hasModel: true,
    clean,
    meshCount: meshes.length,
    totals,
    meshes,
    warnings,
  };
}

function emptyTotals() {
  return {
    triangles: 0,
    openBorderEdges: 0,
    nonManifoldEdges: 0,
    looseVertices: 0,
    ngons: 0,
    disconnectedPieces: 0,
    degenerateTriangles: 0,
  };
}

/** @param {MeshTopologyReport} a @param {MeshTopologyReport} b */
function mergeReports(a, b) {
  return {
    triangles: a.triangles + b.triangles,
    openBorderEdges: a.openBorderEdges + b.openBorderEdges,
    nonManifoldEdges: a.nonManifoldEdges + b.nonManifoldEdges,
    looseVertices: a.looseVertices + b.looseVertices,
    ngons: a.ngons + b.ngons,
    disconnectedPieces: a.disconnectedPieces + b.disconnectedPieces,
    degenerateTriangles: a.degenerateTriangles + b.degenerateTriangles,
  };
}

/**
 * @param {{ name: string, report: MeshTopologyReport }[]} meshes
 * @param {MeshTopologyReport} totals
 * @returns {TopologyWarning[]}
 */
function buildWarnings(meshes, totals) {
  /** @type {TopologyWarning[]} */
  const warnings = [];

  const addIssue = (category, label, count, detail) => {
    if (count <= 0) return;
    warnings.push({
      kind: 'issue',
      category,
      label,
      detail: `${count.toLocaleString()} ${detail}`,
    });
  };

  if (totals.nonManifoldEdges > 0) {
    addIssue(
      'non-manifold-edges',
      'Non-manifold edges',
      totals.nonManifoldEdges,
      'edges shared by more than two faces — often T-junctions or internal faces',
    );
  }

  if (totals.ngons > 0) {
    addIssue(
      'ngons',
      'Ngons',
      totals.ngons,
      'faces with more than four sides (merged from coplanar triangles)',
    );
  }

  if (totals.looseVertices > 0) {
    addIssue(
      'loose-vertices',
      'Loose vertices',
      totals.looseVertices,
      'vertices not used by any face',
    );
  }

  if (totals.disconnectedPieces > 0) {
    addIssue(
      'loose-geometry',
      'Loose geometry',
      totals.disconnectedPieces,
      'separate mesh islands not connected to the main surface',
    );
  }

  if (totals.openBorderEdges > 0) {
    addIssue(
      'open-borders',
      'Open borders',
      totals.openBorderEdges,
      'boundary edges with only one adjacent face — holes or open shells',
    );
  }

  if (totals.degenerateTriangles > 0) {
    addIssue(
      'degenerate-triangles',
      'Degenerate triangles',
      totals.degenerateTriangles,
      'zero-area or collapsed triangles',
    );
  }

  if (warnings.length === 0) {
    warnings.push({
      kind: 'ok',
      label: 'Mesh looks clean',
      detail: `${totals.triangles.toLocaleString()} triangles across ${meshes.length.toLocaleString()} mesh${meshes.length === 1 ? '' : 'es'} — no topology warnings found.`,
    });
  } else if (meshes.length > 1) {
    warnings.unshift({
      kind: 'info',
      label: 'Multiple meshes',
      detail: `Checked ${meshes.length.toLocaleString()} mesh objects — counts below are totals.`,
    });
  }

  return warnings;
}
