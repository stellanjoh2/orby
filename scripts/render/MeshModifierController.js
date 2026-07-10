import * as THREE from 'three';
import { isShapeLibraryModel } from '../shapeLibrary/shapeLibraryCatalog.js';
import {
  createModifierEntryDefaults,
  hasActiveModifiers,
  normalizeModifiersState,
} from '../state/defaults/modifierDefaults.js';
import {
  applyModifierNormalStack,
  applyModifierStack,
  modifierBoundsFromBox,
} from '../deform/meshModifierMath.js';
import { countGeometryTriangles, subdivideBufferGeometry } from '../deform/meshSubdivide.js';

const MAX_MODIFIER_SUBDIVISIONS = 3;
const MAX_MODIFIER_TRIANGLES = 500_000;

const _vertex = new THREE.Vector3();
const _modelSpace = new THREE.Vector3();
const _deformed = new THREE.Vector3();
const _meshLocal = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _modelNormal = new THREE.Vector3();
const _meshLocalNormal = new THREE.Vector3();
const _meshToModel = new THREE.Matrix4();
const _modelToMesh = new THREE.Matrix4();
const _meshToModelNormal = new THREE.Matrix3();
const _modelToMeshNormal = new THREE.Matrix3();

/**
 * CPU mesh modifiers — snapshots base geometry and reapplies the modifier stack.
 */
export class MeshModifierController {
  constructor() {
    /** @type {THREE.Object3D | null} */
    this._model = null;
    /** @type {Array<{
     *   mesh: THREE.Mesh,
     *   sourceGeo: THREE.BufferGeometry,
     *   derivedGeo: THREE.BufferGeometry | null,
     *   base: Float32Array,
     *   baseNormal: Float32Array | null,
     *   authoredBase: Float32Array,
     *   authoredNormal: Float32Array | null,
     *   subdivisions: number,
     *   matrixWorld: THREE.Matrix4
     * }>} */
    this._meshes = [];
    /** @type {ReturnType<typeof modifierBoundsFromBox> | null} */
    this._bounds = null;
    this._supported = true;
    this._modelWorld = new THREE.Matrix4();
    this._invModelWorld = new THREE.Matrix4();
  }

  /**
   * @param {THREE.Object3D | null} model
   */
  bindModel(model) {
    this.release();
    this._model = model;
    this._supported = false;
    if (!model || !isShapeLibraryModel(model)) {
      return;
    }

    this._supported = true;
    let hasUnsupported = false;
    const baseBox = new THREE.Box3();
    model.updateMatrixWorld(true);
    this._modelWorld.copy(model.matrixWorld);
    this._invModelWorld.copy(this._modelWorld).invert();

    model.traverse((child) => {
      if (!child.isMesh) return;
      const mesh = /** @type {THREE.Mesh} */ (child);
      if (mesh.isSkinnedMesh || (mesh.morphTargetInfluences?.length ?? 0) > 0) {
        hasUnsupported = true;
        return;
      }
      const geo = mesh.geometry;
      const pos = geo?.attributes?.position;
      if (!pos) return;

      const normalAttr = geo.attributes.normal;
      const base = new Float32Array(pos.array);
      const baseNormal = normalAttr ? new Float32Array(normalAttr.array) : null;
      this._meshes.push({
        mesh,
        sourceGeo: geo,
        derivedGeo: null,
        base,
        baseNormal,
        authoredBase: new Float32Array(base),
        authoredNormal: baseNormal ? new Float32Array(baseNormal) : null,
        subdivisions: 0,
        matrixWorld: mesh.matrixWorld.clone(),
      });

      geo.computeBoundingBox();
      if (geo.boundingBox) {
        const worldBox = geo.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
        baseBox.union(worldBox);
      }
    });

    if (hasUnsupported) {
      this._supported = false;
      this._meshes = [];
      this._bounds = null;
      return;
    }

    if (baseBox.isEmpty()) {
      this._bounds = null;
      return;
    }

    const modelBox = baseBox.applyMatrix4(this._invModelWorld);
    this._bounds = modifierBoundsFromBox(modelBox);
  }

  release() {
    if (this._model && this._meshes.length) {
      for (const entry of this._meshes) {
        this._restoreAuthoredMesh(entry);
      }
    }
    this._model = null;
    this._meshes = [];
    this._bounds = null;
    this._supported = true;
  }

  /** @returns {boolean} */
  canSubdivide() {
    if (!this._supported || !this._meshes.length) return false;
    return this._meshes.some((entry) => this._entryCanSubdivide(entry));
  }

  /** @returns {boolean} */
  canRestoreOriginal() {
    if (!this._supported || !this._meshes.length) return false;
    return this._meshes.some((entry) => entry.subdivisions > 0 || !!entry.derivedGeo);
  }

  /**
   * @returns {boolean} false when already at authored geometry
   */
  restoreOriginalMeshes() {
    if (!this._supported || !this._meshes.length) return false;
    if (!this.canRestoreOriginal()) return false;

    for (const entry of this._meshes) {
      this._restoreAuthoredMesh(entry);
    }
    this._recomputeBounds();
    return true;
  }

  /**
   * @returns {boolean} false when capped or unsupported
   */
  subdivideMeshes() {
    if (!this._supported || !this._meshes.length) return false;
    if (!this.canSubdivide()) return false;

    let changed = false;
    for (const entry of this._meshes) {
      if (!this._entryCanSubdivide(entry)) continue;
      if (!this._subdivideEntry(entry)) continue;
      changed = true;
    }
    if (!changed) return false;

    this._recomputeBounds();
    return true;
  }

  /** @param {typeof this._meshes[number]} entry */
  _entryCanSubdivide(entry) {
    if (entry.subdivisions >= MAX_MODIFIER_SUBDIVISIONS) return false;
    const geo = entry.derivedGeo ?? entry.sourceGeo;
    const triangles = countGeometryTriangles(geo);
    return triangles > 0 && triangles * 4 <= MAX_MODIFIER_TRIANGLES;
  }

  /** @param {typeof this._meshes[number]} entry */
  _subdivideEntry(entry) {
    const working = this._geometryFromSnapshot(entry);
    const subdivided = subdivideBufferGeometry(working, MAX_MODIFIER_TRIANGLES);
    working.dispose();
    if (!subdivided) return false;

    entry.derivedGeo?.dispose();
    entry.derivedGeo = subdivided;
    entry.mesh.geometry = subdivided;
    entry.subdivisions += 1;
    this._snapshotEntryBase(entry, subdivided);
    return true;
  }

  /** @param {typeof this._meshes[number]} entry */
  _geometryFromSnapshot(entry) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(entry.base.slice(), 3));
    if (entry.baseNormal) {
      geo.setAttribute('normal', new THREE.BufferAttribute(entry.baseNormal.slice(), 3));
    }
    const src = entry.derivedGeo ?? entry.sourceGeo;
    const uv = src.getAttribute('uv');
    if (uv) {
      geo.setAttribute('uv', new THREE.BufferAttribute(uv.array.slice(), uv.itemSize));
    }
    const index = src.getIndex();
    if (index) {
      geo.setIndex(new THREE.BufferAttribute(index.array.slice(), 1));
    }
    return geo;
  }

  /** @param {typeof this._meshes[number]} entry @param {THREE.BufferGeometry} geo */
  _snapshotEntryBase(entry, geo) {
    const pos = geo.getAttribute('position');
    const normalAttr = geo.getAttribute('normal');
    entry.base = new Float32Array(pos.array);
    entry.baseNormal = normalAttr ? new Float32Array(normalAttr.array) : null;
  }

  _recomputeBounds() {
    if (!this._model) return;
    const baseBox = new THREE.Box3();
    this._model.updateMatrixWorld(true);
    for (const entry of this._meshes) {
      const geo = entry.mesh.geometry;
      geo.computeBoundingBox();
      if (!geo.boundingBox) continue;
      entry.mesh.updateMatrixWorld(true);
      baseBox.union(geo.boundingBox.clone().applyMatrix4(entry.mesh.matrixWorld));
    }
    if (baseBox.isEmpty()) {
      this._bounds = null;
      return;
    }
    this._modelWorld.copy(this._model.matrixWorld);
    this._invModelWorld.copy(this._modelWorld).invert();
    const modelBox = baseBox.applyMatrix4(this._invModelWorld);
    this._bounds = modifierBoundsFromBox(modelBox);
  }

  /** @returns {boolean} */
  isSupported() {
    return this._supported;
  }

  /**
   * @param {object} state
   */
  applyFromState(state) {
    if (!this._supported) return;
    const modifiers = normalizeModifiersState(state?.modifiers ?? createModifierEntryDefaults());
    if (!this._model || !this._bounds || !this._meshes.length) return;

    if (!hasActiveModifiers(modifiers)) {
      for (const entry of this._meshes) {
        this._restoreMesh(entry);
      }
      this._model.updateMatrixWorld(true);
      return;
    }

    this._model.updateMatrixWorld(true);
    this._modelWorld.copy(this._model.matrixWorld);
    this._invModelWorld.copy(this._modelWorld).invert();

    for (const entry of this._meshes) {
      const { mesh, base, baseNormal } = entry;
      mesh.updateMatrixWorld(true);
      const geo = mesh.geometry;
      const pos = geo.attributes.position;
      const normalAttr = geo.attributes.normal;
      if (!pos) continue;

      _meshToModel.multiplyMatrices(this._invModelWorld, mesh.matrixWorld);
      _modelToMesh.copy(_meshToModel).invert();
      _meshToModelNormal.getNormalMatrix(_meshToModel);
      _modelToMeshNormal.getNormalMatrix(_modelToMesh);

      const invMeshWorld = mesh.matrixWorld.clone().invert();

      for (let i = 0; i < pos.count; i++) {
        _vertex.fromArray(base, i * 3);

        _modelSpace.copy(_vertex).applyMatrix4(_meshToModel);
        applyModifierStack(_deformed, _modelSpace, this._bounds, modifiers);
        _meshLocal.copy(_deformed).applyMatrix4(_modelToMesh);

        pos.setXYZ(i, _meshLocal.x, _meshLocal.y, _meshLocal.z);

        if (baseNormal && normalAttr) {
          _normal.fromArray(baseNormal, i * 3);
          if (_normal.lengthSq() > 1e-12) {
            _modelNormal.copy(_normal).applyMatrix3(_meshToModelNormal).normalize();
            applyModifierNormalStack(_modelNormal, _modelSpace, this._bounds, modifiers);
            _meshLocalNormal.copy(_modelNormal).applyMatrix3(_modelToMeshNormal).normalize();
            normalAttr.setXYZ(
              i,
              _meshLocalNormal.x,
              _meshLocalNormal.y,
              _meshLocalNormal.z,
            );
          }
        }
      }

      pos.needsUpdate = true;
      if (normalAttr) normalAttr.needsUpdate = true;
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
    }

    this._model.updateMatrixWorld(true);
  }

  /** @param {{ mesh: THREE.Mesh, sourceGeo: THREE.BufferGeometry, derivedGeo: THREE.BufferGeometry | null, authoredBase: Float32Array, authoredNormal: Float32Array | null }} entry */
  _restoreAuthoredMesh(entry) {
    entry.derivedGeo?.dispose();
    entry.derivedGeo = null;
    entry.subdivisions = 0;
    entry.mesh.geometry = entry.sourceGeo;
    const geo = entry.sourceGeo;
    const pos = geo.getAttribute('position');
    if (pos) {
      pos.array.set(entry.authoredBase);
      pos.needsUpdate = true;
    }
    if (entry.authoredNormal) {
      const normalAttr = geo.getAttribute('normal');
      if (normalAttr?.array.length === entry.authoredNormal.length) {
        normalAttr.array.set(entry.authoredNormal);
        normalAttr.needsUpdate = true;
      } else {
        geo.setAttribute('normal', new THREE.BufferAttribute(entry.authoredNormal.slice(), 3));
      }
    }
    entry.base = new Float32Array(entry.authoredBase);
    entry.baseNormal = entry.authoredNormal
      ? new Float32Array(entry.authoredNormal)
      : null;
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
  }

  /** @param {{ mesh: THREE.Mesh, base: Float32Array, baseNormal: Float32Array | null }} entry */
  _restoreMesh(entry) {
    const geo = entry.mesh.geometry;
    const pos = geo?.attributes?.position;
    if (!pos || pos.array.length !== entry.base.length) return;
    pos.array.set(entry.base);
    pos.needsUpdate = true;

    if (entry.baseNormal) {
      const normalAttr = geo.attributes.normal;
      if (normalAttr?.array.length === entry.baseNormal.length) {
        normalAttr.array.set(entry.baseNormal);
        normalAttr.needsUpdate = true;
      } else {
        geo.setAttribute('normal', new THREE.BufferAttribute(entry.baseNormal.slice(), 3));
      }
    }

    geo.computeBoundingBox();
    geo.computeBoundingSphere();
  }
}
