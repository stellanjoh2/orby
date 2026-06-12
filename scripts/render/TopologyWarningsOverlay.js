import * as THREE from 'three';
import { LineSegments2 } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/lines/LineMaterial.js';
import { ORBY_LIME, ORBY_PINK, ORBY_PINK_MUTED } from '../constants.js';
import { collectGeometryTopologyVisuals } from '../mesh/topologyAnalysis.js';

const EDGE_LINE_WIDTH = 4;
const LOOSE_POINT_SIZE = 12;
const FACE_OPACITY = 0.5;
const OVERLAY_RENDER_ORDER = 1001;

const EMPTY_VISUALS = {
  openBorderSegments: [],
  nonManifoldSegments: [],
  looseVertexPositions: [],
  ngonFacePositions: [],
  degenerateFacePositions: [],
  islandFacePositions: [],
  islandBorderSegments: [],
};

/**
 * @param {THREE.Object3D} object
 */
function isTopologySourceMesh(object) {
  if (!object?.isMesh || !object.geometry) return false;
  if (
    object.userData.isWireframeOverlay
    || object.userData.isUvCheckerOverlay
    || object.userData.isNormalViewOverlay
    || object.userData.isTopologyWarningsOverlay
  ) {
    return false;
  }

  let parent = object.parent;
  while (parent) {
    if (parent.userData?.isTopologyWarningsOverlay) return false;
    parent = parent.parent;
  }

  return true;
}

/**
 * @param {import('../mesh/topologyAnalysis.js').TopologyMeshVisuals} visuals
 * @param {import('../mesh/topologyAnalysis.js').TopologyWarningCategory | null | undefined} category
 * @returns {import('../mesh/topologyAnalysis.js').TopologyMeshVisuals}
 */
function filterVisualsForCategory(visuals, category) {
  if (!category) return EMPTY_VISUALS;

  switch (category) {
    case 'non-manifold-edges':
      return { ...EMPTY_VISUALS, nonManifoldSegments: visuals.nonManifoldSegments };
    case 'open-borders':
      return { ...EMPTY_VISUALS, openBorderSegments: visuals.openBorderSegments };
    case 'loose-vertices':
      return { ...EMPTY_VISUALS, looseVertexPositions: visuals.looseVertexPositions };
    case 'loose-geometry':
      return {
        ...EMPTY_VISUALS,
        islandFacePositions: visuals.islandFacePositions,
        openBorderSegments: visuals.islandBorderSegments,
      };
    case 'ngons':
      return { ...EMPTY_VISUALS, ngonFacePositions: visuals.ngonFacePositions };
    case 'degenerate-triangles':
      return { ...EMPTY_VISUALS, degenerateFacePositions: visuals.degenerateFacePositions };
    default:
      return EMPTY_VISUALS;
  }
}

/** @param {THREE.Object3D} object */
function markTopologyOverlayPart(object) {
  object.userData.isTopologyWarningsOverlay = true;
  object.renderOrder = OVERLAY_RENDER_ORDER;
}

/**
 * In-viewport topology warning overlay — highlights one warning category at a time.
 */
export class TopologyWarningsOverlay {
  /**
   * @param {{ getLineResolution?: () => { width: number, height: number } }} [options]
   */
  constructor({ getLineResolution = () => ({ width: 1, height: 1 }) } = {}) {
    this.getLineResolution = getLineResolution;
    /** @type {boolean} */
    this.enabled = false;
    /** @type {import('../mesh/topologyAnalysis.js').TopologyWarningCategory | null} */
    this._category = null;
    /** @type {THREE.Object3D|null} */
    this._model = null;
    /** @type {THREE.Object3D[]} */
    this._overlayRoots = [];
    this._rebuildToken = 0;
  }

  /** @param {THREE.Object3D|null} model */
  setModel(model) {
    if (this._model === model) return;
    this.clear();
    this._model = model ?? null;
    if (this.enabled && this._model) this.rebuild();
  }

  /**
   * @param {import('../mesh/topologyAnalysis.js').TopologyWarningCategory | null} category
   * @param {boolean} [rebuild]
   */
  setCategory(category, rebuild = true) {
    this._category = category ?? null;
    if (this.enabled && rebuild) this.rebuild();
  }

  setEnabled(enabled, rebuild = true) {
    this.enabled = !!enabled;
    if (this.enabled) {
      if (rebuild) this.rebuild();
    } else {
      this._category = null;
      this.clear();
    }
  }

  rebuild() {
    void this.rebuildAsync();
  }

  /** @returns {Promise<void>} */
  async rebuildAsync() {
    this._rebuildSync();
  }

  _rebuildSync() {
    this.clear();
    if (!this._model || !this.enabled || !this._category) return;

    const resolution = this.getLineResolution();
    /** @type {THREE.Mesh[]} */
    const sourceMeshes = [];
    this._model.traverse((child) => {
      if (isTopologySourceMesh(child)) sourceMeshes.push(child);
    });

    for (const sourceMesh of sourceMeshes) {
      const rawVisuals = collectGeometryTopologyVisuals(sourceMesh.geometry);
      if (!rawVisuals) continue;

      const visuals = filterVisualsForCategory(rawVisuals, this._category);
      const group = this._createMeshOverlay(sourceMesh, visuals, resolution);
      if (!group) continue;

      const hostParent = sourceMesh.parent;
      if (hostParent) {
        hostParent.add(group);
      } else {
        this._model.add(group);
      }
      this._overlayRoots.push(group);
    }
  }

  /**
   * @param {THREE.Mesh} sourceMesh
   * @param {import('../mesh/topologyAnalysis.js').TopologyMeshVisuals} visuals
   * @param {{ width: number, height: number }} resolution
   */
  _createMeshOverlay(sourceMesh, visuals, resolution) {
    const hasEdges = visuals.openBorderSegments.length > 0 || visuals.nonManifoldSegments.length > 0;
    const hasPoints = visuals.looseVertexPositions.length > 0;
    const hasFaces = visuals.ngonFacePositions.length > 0
      || visuals.degenerateFacePositions.length > 0
      || visuals.islandFacePositions.length > 0;

    if (!hasEdges && !hasPoints && !hasFaces) return null;

    const group = new THREE.Group();
    group.userData.isTopologyWarningsOverlay = true;
    group.userData.originalMesh = sourceMesh;
    group.userData.topologyCategory = this._category;
    group.name = sourceMesh.name ? `${sourceMesh.name}_topology` : 'topology_warnings';
    group.renderOrder = OVERLAY_RENDER_ORDER;

    if (visuals.openBorderSegments.length > 0) {
      const lines = this._createLineSegments(
        visuals.openBorderSegments,
        ORBY_PINK,
        resolution,
      );
      if (lines) group.add(lines);
    }

    if (visuals.nonManifoldSegments.length > 0) {
      const lines = this._createLineSegments(
        visuals.nonManifoldSegments,
        ORBY_PINK_MUTED,
        resolution,
      );
      if (lines) group.add(lines);
    }

    if (visuals.looseVertexPositions.length > 0) {
      const points = this._createLoosePoints(visuals.looseVertexPositions);
      if (points) group.add(points);
    }

    if (visuals.islandFacePositions.length > 0) {
      const mesh = this._createFaceHighlight(sourceMesh, visuals.islandFacePositions, ORBY_PINK);
      if (mesh) group.add(mesh);
    }

    if (visuals.ngonFacePositions.length > 0) {
      const mesh = this._createFaceHighlight(sourceMesh, visuals.ngonFacePositions, ORBY_PINK);
      if (mesh) group.add(mesh);
    }

    if (visuals.degenerateFacePositions.length > 0) {
      const mesh = this._createFaceHighlight(sourceMesh, visuals.degenerateFacePositions, ORBY_LIME);
      if (mesh) group.add(mesh);
    }

    return group;
  }

  /**
   * @param {number[]} segments
   * @param {string} color
   * @param {{ width: number, height: number }} resolution
   */
  _createLineSegments(segments, color, resolution) {
    if (segments.length < 6) return null;

    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(segments);

    const material = new LineMaterial({
      color: new THREE.Color(color).getHex(),
      linewidth: EDGE_LINE_WIDTH,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      transparent: true,
      opacity: 0.98,
      worldUnits: false,
    });
    material.resolution.set(resolution.width, resolution.height);

    const lines = new LineSegments2(geometry, material);
    lines.frustumCulled = false;
    markTopologyOverlayPart(lines);
    return lines;
  }

  /** @param {number[]} positions */
  _createLoosePoints(positions) {
    if (positions.length < 3) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: new THREE.Color(ORBY_LIME).getHex(),
      size: LOOSE_POINT_SIZE,
      sizeAttenuation: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      transparent: true,
      opacity: 0.98,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    markTopologyOverlayPart(points);
    return points;
  }

  /**
   * @param {THREE.Mesh} sourceMesh
   * @param {number[]} positions
   * @param {string} color
   */
  _createFaceHighlight(sourceMesh, positions, color) {
    if (positions.length < 9) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).getHex(),
      transparent: true,
      opacity: FACE_OPACITY,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });

    const mesh = sourceMesh.isSkinnedMesh
      ? new THREE.SkinnedMesh(geometry, material)
      : new THREE.Mesh(geometry, material);

    if (mesh.isSkinnedMesh && sourceMesh.isSkinnedMesh) {
      mesh.bind(sourceMesh.skeleton, sourceMesh.bindMatrix);
      if (sourceMesh.bindMatrixInverse) {
        mesh.bindMatrixInverse = sourceMesh.bindMatrixInverse.clone();
      }
    }

    mesh.frustumCulled = false;
    markTopologyOverlayPart(mesh);
    return mesh;
  }

  clear() {
    this._rebuildToken += 1;
    for (const root of this._overlayRoots) {
      this._disposeObject(root);
      root.parent?.remove(root);
    }
    this._overlayRoots = [];
  }

  /** @param {THREE.Object3D} object */
  _disposeObject(object) {
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material?.dispose?.();
      }
    });
  }

  updateTransforms() {
    if (!this._overlayRoots.length) return;

    const resolution = this.getLineResolution();
    for (const group of this._overlayRoots) {
      const sourceMesh = group.userData.originalMesh;
      if (!sourceMesh?.isMesh) continue;

      group.position.copy(sourceMesh.position);
      group.rotation.copy(sourceMesh.rotation);
      group.scale.copy(sourceMesh.scale);
      group.matrixAutoUpdate = true;
      group.updateMatrix();

      group.traverse((child) => {
        if (child.isLineSegments2 && child.material?.resolution) {
          child.material.resolution.set(resolution.width, resolution.height);
        }
      });
    }
  }

  dispose() {
    this.clear();
    this._model = null;
    this._category = null;
  }
}
