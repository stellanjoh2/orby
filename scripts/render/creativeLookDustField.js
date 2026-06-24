import * as THREE from 'three';
import { meshUsesSkinning } from './bakeStaticSkinnedGeometry.js';

/** Fixed surface-sample count for Dust Field (total across the model). */
export const DUST_FIELD_PARTICLE_COUNT = 8000;

/** Default Shader Lab intensity (point sprite size). */
export const DUST_FIELD_DEFAULT_INTENSITY = 0;

/** Default Shader Lab scale (micro-wobble amplitude). */
export const DUST_FIELD_DEFAULT_PATTERN_SCALE = 1;

/** World-space anchor triangle shorter than this is treated as collapsed (reveal spawn origin). */
const DUST_FIELD_REVEAL_MIN_EDGE = 0.002;

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _edge1 = new THREE.Vector3();
const _edge2 = new THREE.Vector3();
const _cross = new THREE.Vector3();
const _out = new THREE.Vector3();
const _worldA = new THREE.Vector3();
const _worldB = new THREE.Vector3();
const _worldC = new THREE.Vector3();
const _rootInv = new THREE.Matrix4();

/**
 * Hide dust particles anchored to collapsed / unrevealed font glyphs (scale → 0 at pivot).
 * Non-font meshes always return 1 — no reveal coupling outside glyph groups.
 * @param {THREE.Mesh} mesh
 * @param {number} worldMaxEdge
 * @returns {number}
 */
function computeDustFieldRevealAlpha(mesh, worldMaxEdge) {
  if (worldMaxEdge < DUST_FIELD_REVEAL_MIN_EDGE) return 0;

  let node = mesh;
  while (node) {
    if (node.userData?.orbyFontGlyphGroup) {
      if (!node.visible) return 0;
      break;
    }
    node = node.parent;
  }

  const mats = mesh.material
    ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
    : [];
  let opacity = 1;
  for (const m of mats) {
    if (m && Number.isFinite(m.opacity)) {
      opacity = Math.min(opacity, m.opacity);
    }
  }
  return opacity < 0.02 ? 0 : opacity;
}

/** @param {string | undefined} preset */
export function isDustFieldCreativeLookPreset(preset) {
  return typeof preset === 'string' && preset === 'dust-field';
}

/** @param {string | undefined} preset */
export function creativeLookUsesDustFieldGeometry(preset) {
  return isDustFieldCreativeLookPreset(preset);
}

/** @param {THREE.Mesh} mesh */
export function meshDrivesDustFieldAnimation(mesh) {
  if (!mesh?.isMesh) return false;
  if (meshUsesSkinning(mesh)) return true;
  const geo = mesh.geometry;
  if (geo?.morphAttributes?.position?.length) return true;
  return !!(mesh.morphTargetInfluences?.length);
}

/**
 * @param {THREE.Vector3} a
 * @param {THREE.Vector3} b
 * @param {THREE.Vector3} c
 */
function triangleArea(a, b, c) {
  _edge1.subVectors(b, a);
  _edge2.subVectors(c, a);
  return _cross.crossVectors(_edge1, _edge2).length() * 0.5;
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @returns {{ cdf: Float32Array, triCount: number, totalArea: number }}
 */
function buildTriangleCdf(geometry) {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  const cdf = new Float32Array(triCount);
  let totalArea = 0;

  for (let t = 0; t < triCount; t += 1) {
    let ia;
    let ib;
    let ic;
    if (index) {
      ia = index.getX(t * 3);
      ib = index.getX(t * 3 + 1);
      ic = index.getX(t * 3 + 2);
    } else {
      ia = t * 3;
      ib = t * 3 + 1;
      ic = t * 3 + 2;
    }
    _vA.fromBufferAttribute(pos, ia);
    _vB.fromBufferAttribute(pos, ib);
    _vC.fromBufferAttribute(pos, ic);
    totalArea += triangleArea(_vA, _vB, _vC);
    cdf[t] = totalArea;
  }

  return { cdf, triCount, totalArea };
}

/**
 * @param {Float32Array} cdf
 * @param {number} triCount
 * @param {number} totalArea
 * @param {THREE.BufferGeometry} geometry
 * @returns {{ ia: number, ib: number, ic: number, u: number, v: number, point: THREE.Vector3 }}
 */
function sampleTriangleAnchor(cdf, triCount, totalArea, geometry) {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const r = Math.random() * totalArea;

  let lo = 0;
  let hi = triCount - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < r) lo = mid + 1;
    else hi = mid;
  }

  const t = lo;
  let ia;
  let ib;
  let ic;
  if (index) {
    ia = index.getX(t * 3);
    ib = index.getX(t * 3 + 1);
    ic = index.getX(t * 3 + 2);
  } else {
    ia = t * 3;
    ib = t * 3 + 1;
    ic = t * 3 + 2;
  }

  _vA.fromBufferAttribute(pos, ia);
  _vB.fromBufferAttribute(pos, ib);
  _vC.fromBufferAttribute(pos, ic);

  let u = Math.random();
  let v = Math.random();
  if (u + v > 1) {
    u = 1 - u;
    v = 1 - v;
  }
  _edge1.subVectors(_vB, _vA);
  _edge2.subVectors(_vC, _vA);
  _out.copy(_vA).addScaledVector(_edge1, u).addScaledVector(_edge2, v);
  return { ia, ib, ic, u, v, point: _out.clone() };
}

/**
 * @param {number} totalParticles
 * @param {{ totalArea: number }[]} entries
 */
function allocateParticleCounts(totalParticles, entries) {
  const grandTotal = entries.reduce((sum, e) => sum + e.totalArea, 0);
  if (grandTotal <= 0 || entries.length === 0) return;

  let assigned = 0;
  for (const entry of entries) {
    const share = entry.totalArea / grandTotal;
    entry.count = Math.max(1, Math.round(totalParticles * share));
    assigned += entry.count;
  }

  while (assigned > totalParticles) {
    const richest = entries.reduce((best, e) => (e.count > best.count ? e : best), entries[0]);
    richest.count -= 1;
    assigned -= 1;
  }
  while (assigned < totalParticles) {
    const richest = entries.reduce((best, e) => (e.totalArea > best.totalArea ? e : best), entries[0]);
    richest.count += 1;
    assigned += 1;
  }
}

/**
 * @typedef {{
 *   meshes: THREE.Mesh[],
 *   meshIndex: Uint16Array,
 *   ia: Uint32Array,
 *   ib: Uint32Array,
 *   ic: Uint32Array,
 *   baryU: Float32Array,
 *   baryV: Float32Array,
 *   animated: boolean,
 * }} DustFieldAnchorState
 */

/**
 * @param {THREE.Object3D} modelRoot
 * @param {object} options
 * @param {(mesh: THREE.Mesh) => boolean} options.shouldIncludeMesh
 * @param {number} [options.particleCount]
 * @returns {{ geometry: THREE.BufferGeometry, meshes: THREE.Mesh[], anchors: DustFieldAnchorState } | null}
 */
export function buildDustFieldGeometry(modelRoot, options) {
  const particleCount = Math.max(
    64,
    Math.floor(options.particleCount ?? DUST_FIELD_PARTICLE_COUNT),
  );

  modelRoot.updateWorldMatrix(true, true);
  const rootInv = modelRoot.matrixWorld.clone().invert();

  /** @type {Array<{
   *   mesh: THREE.Mesh,
   *   meshIndex: number,
   *   geometry: THREE.BufferGeometry,
   *   localMatrix: THREE.Matrix4,
   *   cdf: Float32Array,
   *   triCount: number,
   *   totalArea: number,
   *   count: number,
   * }>} */
  const entries = [];

  /** @type {THREE.Mesh[]} */
  const sampledMeshes = [];

  modelRoot.traverse((child) => {
    if (!child.isMesh) return;
    if (!options.shouldIncludeMesh(child)) return;

    const geometry = child.geometry;
    if (!geometry?.attributes?.position) return;

    const { cdf, triCount, totalArea } = buildTriangleCdf(geometry);
    if (totalArea <= 0 || triCount <= 0) return;

    const meshIndex = sampledMeshes.length;
    sampledMeshes.push(child);
    const localMatrix = child.matrixWorld.clone().premultiply(rootInv);
    entries.push({
      mesh: child,
      meshIndex,
      geometry,
      localMatrix,
      cdf,
      triCount,
      totalArea,
      count: 0,
    });
  });

  if (entries.length === 0) return null;

  allocateParticleCounts(particleCount, entries);

  const positions = new Float32Array(particleCount * 3);
  const randomPhase = new Float32Array(particleCount * 4);
  const revealAlphaArr = new Float32Array(particleCount);
  revealAlphaArr.fill(1);
  const meshIndexArr = new Uint16Array(particleCount);
  const iaArr = new Uint32Array(particleCount);
  const ibArr = new Uint32Array(particleCount);
  const icArr = new Uint32Array(particleCount);
  const baryUArr = new Float32Array(particleCount);
  const baryVArr = new Float32Array(particleCount);

  let write = 0;
  let animated = false;

  for (const entry of entries) {
    if (meshDrivesDustFieldAnimation(entry.mesh)) {
      animated = true;
    }
    for (let i = 0; i < entry.count; i += 1) {
      const anchor = sampleTriangleAnchor(
        entry.cdf,
        entry.triCount,
        entry.totalArea,
        entry.geometry,
      );
      anchor.point.applyMatrix4(entry.localMatrix);

      positions[write * 3] = anchor.point.x;
      positions[write * 3 + 1] = anchor.point.y;
      positions[write * 3 + 2] = anchor.point.z;

      randomPhase[write * 4] = Math.random();
      randomPhase[write * 4 + 1] = (Math.random() - 0.5) * 2;
      randomPhase[write * 4 + 2] = Math.random();
      randomPhase[write * 4 + 3] = Math.random();

      meshIndexArr[write] = entry.meshIndex;
      iaArr[write] = anchor.ia;
      ibArr[write] = anchor.ib;
      icArr[write] = anchor.ic;
      baryUArr[write] = anchor.u;
      baryVArr[write] = anchor.v;
      write += 1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('randomPhase', new THREE.BufferAttribute(randomPhase, 4));
  geometry.setAttribute('revealAlpha', new THREE.BufferAttribute(revealAlphaArr, 1));
  geometry.computeBoundingSphere();

  return {
    geometry,
    meshes: sampledMeshes,
    anchors: {
      meshes: sampledMeshes,
      meshIndex: meshIndexArr,
      ia: iaArr,
      ib: ibArr,
      ic: icArr,
      baryU: baryUArr,
      baryV: baryVArr,
      animated,
    },
  };
}

/**
 * Drive dust particles from live mesh deformation (GLB skinning / morph targets).
 * Also required for rigid node/transform animation (common on glTF submeshes like X-wing wings).
 * @param {DustFieldAnchorState | null | undefined} anchors
 * @param {THREE.Object3D} modelRoot
 * @param {THREE.BufferGeometry} pointsGeometry
 * @returns {boolean}
 */
export function updateDustFieldParticlePositions(anchors, modelRoot, pointsGeometry) {
  if (!anchors?.meshes?.length || !modelRoot || !pointsGeometry?.attributes?.position) {
    return false;
  }

  const posAttr = pointsGeometry.attributes.position;
  const posArr = posAttr.array;
  const revealAttr = pointsGeometry.attributes.revealAlpha;
  const revealArr = revealAttr?.array;
  const count = anchors.meshIndex.length;

  modelRoot.updateWorldMatrix(true, true);
  _rootInv.copy(modelRoot.matrixWorld).invert();

  /** @type {Set<import('three').Skeleton>} */
  const skeletonsUpdated = new Set();
  for (const mesh of anchors.meshes) {
    if (!mesh?.isSkinnedMesh || !mesh.skeleton) continue;
    if (skeletonsUpdated.has(mesh.skeleton)) continue;
    mesh.skeleton.update();
    skeletonsUpdated.add(mesh.skeleton);
  }

  /** @type {Map<THREE.Mesh, number>} */
  const revealAlphaByMesh = new Map();

  for (let i = 0; i < count; i += 1) {
    const mesh = anchors.meshes[anchors.meshIndex[i]];
    if (!mesh?.isMesh) continue;

    mesh.getVertexPosition(anchors.ia[i], _vA);
    mesh.getVertexPosition(anchors.ib[i], _vB);
    mesh.getVertexPosition(anchors.ic[i], _vC);

    _edge1.subVectors(_vB, _vA);
    _edge2.subVectors(_vC, _vA);
    _out
      .copy(_vA)
      .addScaledVector(_edge1, anchors.baryU[i])
      .addScaledVector(_edge2, anchors.baryV[i]);
    _out.applyMatrix4(mesh.matrixWorld).applyMatrix4(_rootInv);

    const base = i * 3;
    posArr[base] = _out.x;
    posArr[base + 1] = _out.y;
    posArr[base + 2] = _out.z;

    if (revealArr) {
      let revealAlpha = revealAlphaByMesh.get(mesh);
      if (revealAlpha === undefined) {
        _worldA.copy(_vA).applyMatrix4(mesh.matrixWorld);
        _worldB.copy(_vB).applyMatrix4(mesh.matrixWorld);
        _worldC.copy(_vC).applyMatrix4(mesh.matrixWorld);
        const maxEdge = Math.max(
          _worldA.distanceTo(_worldB),
          _worldA.distanceTo(_worldC),
          _worldB.distanceTo(_worldC),
        );
        revealAlpha = computeDustFieldRevealAlpha(mesh, maxEdge);
        revealAlphaByMesh.set(mesh, revealAlpha);
      }
      revealArr[i] = revealAlpha;
    }
  }

  posAttr.needsUpdate = true;
  if (revealAttr) revealAttr.needsUpdate = true;
  if (anchors.animated) {
    pointsGeometry.computeBoundingSphere();
  }
  return true;
}
