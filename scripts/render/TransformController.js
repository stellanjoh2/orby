import * as THREE from 'three';

/** Prevent flipped / collapsed meshes from per-axis scale handles. */
export const MIN_MESH_SCALE = 0.01;
/** Soft ceiling so gizmo ratio spikes cannot runaway to huge world scale. */
export const MAX_MESH_SCALE = 100;
/**
 * TransformControls scales by pointEnd/pointStart. Divisors below this
 * (near-center grabs, grazing plane hits) explode sensitivity.
 */
export const MIN_SCALE_POINTER_LENGTH = 1e-3;

/**
 * @param {number} value
 * @returns {number}
 */
export function clampMeshScaleValue(value) {
  const n = Math.abs(Number(value));
  if (!Number.isFinite(n) || n === 0) return MIN_MESH_SCALE;
  return Math.min(MAX_MESH_SCALE, Math.max(MIN_MESH_SCALE, n));
}

/**
 * @param {THREE.Vector3} scale
 */
export function clampMeshScaleComponents(scale) {
  scale.x = clampMeshScaleValue(scale.x);
  scale.y = clampMeshScaleValue(scale.y);
  scale.z = clampMeshScaleValue(scale.z);
}

/**
 * Uniform-scale gizmo: ratio of pointer distances from the pivot.
 * Tiny start lengths are rejected so a near-center grab cannot spike scale.
 * @param {number} endLength
 * @param {number} startLength
 * @returns {number | null} null → ignore this pointer sample
 */
export function uniformScaleRatioFromPointer(endLength, startLength) {
  const start = Number(startLength);
  if (!Number.isFinite(start) || start < MIN_SCALE_POINTER_LENGTH) return null;
  const end = Number(endLength);
  if (!Number.isFinite(end) || end < 0) return null;
  return end / start;
}

/**
 * Per-axis gizmo: component-wise end/start in local space.
 * Negative ratios (pointer past the pivot) become 0 so clamp parks at the floor
 * instead of flipping the mesh or abs()-exploding on the far side.
 * @param {number} endComponent
 * @param {number} startComponent
 * @returns {number} multiplier for that axis (1 = unchanged)
 */
export function axisScaleRatioFromPointer(endComponent, startComponent) {
  const start = Number(startComponent);
  if (!Number.isFinite(start) || Math.abs(start) < MIN_SCALE_POINTER_LENGTH) return 1;
  const end = Number(endComponent);
  if (!Number.isFinite(end)) return 1;
  const ratio = end / start;
  return ratio < 0 ? 0 : ratio;
}

/** Axes within this delta count as one uniform scale (slider step is 0.01). */
const UNIFORM_SCALE_EPSILON = 1e-4;

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {boolean}
 */
function meshScaleAxesMatch(x, y, z) {
  return Math.abs(x - y) <= UNIFORM_SCALE_EPSILON && Math.abs(y - z) <= UNIFORM_SCALE_EPSILON;
}

/**
 * @param {object} state
 * @returns {{ x: number, y: number, z: number }}
 */
export function resolveMeshScaleFromState(state) {
  const x = clampMeshScaleValue(state?.scale ?? 1);
  const y = clampMeshScaleValue(state?.scaleY ?? x);
  const z = clampMeshScaleValue(state?.scaleZ ?? x);
  return { x, y, z };
}

/**
 * Single number for the shelf Scale slider.
 * Equal axes return that value. Otherwise the geometric mean, so one
 * control still describes overall size without throwing away a gizmo squash.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {number}
 */
export function uniformMeshScale(x, y, z) {
  const sx = clampMeshScaleValue(x);
  const sy = clampMeshScaleValue(y ?? sx);
  const sz = clampMeshScaleValue(z ?? sx);
  if (meshScaleAxesMatch(sx, sy, sz)) return sx;
  return Math.cbrt(sx * sy * sz);
}

/**
 * Shelf Scale drag. Uniform axes snap to `target`. Non-uniform axes
 * (from the scale gizmo) all multiply by the same ratio so the squash stays.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} target
 * @returns {{ x: number, y: number, z: number }}
 */
export function scaleAxesToUniformTarget(x, y, z, target) {
  const sx = clampMeshScaleValue(x);
  const sy = clampMeshScaleValue(y ?? sx);
  const sz = clampMeshScaleValue(z ?? sx);
  const next = clampMeshScaleValue(target);
  if (meshScaleAxesMatch(sx, sy, sz)) {
    return { x: next, y: next, z: next };
  }
  const current = Math.cbrt(sx * sy * sz);
  const ratio = current > 0 ? next / current : 1;
  return {
    x: clampMeshScaleValue(sx * ratio),
    y: clampMeshScaleValue(sy * ratio),
    z: clampMeshScaleValue(sz * ratio),
  };
}

/**
 * Manages model transform operations (scale, position, rotation).
 * Writes land on the active asset pivot, or modelRoot when the scene has one asset.
 */
export class TransformController {
  constructor({ modelRoot }) {
    this.modelRoot = modelRoot;
    /** Active asset pivot. Falls back to modelRoot for a one-asset scene. */
    this.target = modelRoot;
  }

  /**
   * Set the model root (called when model changes)
   * @param {THREE.Group} modelRoot - The root group to apply transforms to
   */
  setModelRoot(modelRoot) {
    this.modelRoot = modelRoot;
    this.target = modelRoot;
  }

  /**
   * Object rotate / scale / move writes here (the selected asset's pivot).
   * @param {THREE.Object3D | null | undefined} object
   */
  setTarget(object) {
    this.target = object || this.modelRoot;
  }

  /** @returns {THREE.Object3D | null | undefined} */
  _node() {
    return this.target || this.modelRoot;
  }

  /**
   * Reset all transforms to defaults
   */
  reset() {
    const node = this._node();
    if (!node) return;
    node.rotation.set(0, 0, 0);
    node.position.set(0, 0, 0);
    node.scale.set(1, 1, 1);
  }

  /**
   * Scale along X. The shelf Scale slider writes all three axes instead.
   * @param {number} value
   */
  setScaleX(value) {
    if (!this._node()) return;
    this._node().scale.x = clampMeshScaleValue(value);
  }

  /**
   * Scale along Y. Used by reset and scene restore; the shelf uses uniform scale.
   * @param {number} value
   */
  setScaleY(value) {
    if (!this._node()) return;
    this._node().scale.y = clampMeshScaleValue(value);
  }

  /**
   * Scale along Z. Used by reset and scene restore; the shelf uses uniform scale.
   * @param {number} value
   */
  setScaleZ(value) {
    if (!this._node()) return;
    this._node().scale.z = clampMeshScaleValue(value);
  }

  /**
   * Force X, Y, and Z to the same value.
   * Reset and the S shortcut use this. The shelf slider scales all axes
   * by the same ratio instead, so a gizmo squash is kept.
   * @param {number} value
   */
  setScale(value) {
    const v = clampMeshScaleValue(value);
    this.setScaleVector(v, v, v);
  }

  /**
   * Per-axis scale from the gizmo or scene settings restore.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setScaleVector(x, y, z) {
    if (!this._node()) return;
    this._node().scale.set(
      clampMeshScaleValue(x),
      clampMeshScaleValue(y),
      clampMeshScaleValue(z),
    );
  }

  /**
   * Set the X position offset of the model
   * @param {number} value - X offset in world units
   */
  setXOffset(value) {
    if (!this._node()) return;
    this._node().position.x = value;
  }

  /**
   * Set the Y position offset of the model
   * @param {number} value - Y offset in world units
   */
  setYOffset(value) {
    if (!this._node()) return;
    this._node().position.y = value;
  }

  /**
   * Set the Z position offset of the model
   * @param {number} value - Z offset in world units
   */
  setZOffset(value) {
    if (!this._node()) return;
    this._node().position.z = value;
  }

  /**
   * Set the X rotation of the model
   * @param {number} value - Rotation in degrees
   */
  setRotationX(value) {
    if (!this._node()) return;
    this._node().rotation.x = THREE.MathUtils.degToRad(value);
  }

  /**
   * Set the Y rotation of the model
   * @param {number} value - Rotation in degrees
   */
  setRotationY(value) {
    if (!this._node()) return;
    this._node().rotation.y = THREE.MathUtils.degToRad(value);
  }

  /**
   * Set the Z rotation of the model
   * @param {number} value - Rotation in degrees
   */
  setRotationZ(value) {
    if (!this._node()) return;
    this._node().rotation.z = THREE.MathUtils.degToRad(value);
  }

  /**
   * Apply transform state from StateStore
   * @param {Object} state - State object with transform properties
   */
  applyState(state) {
    if (!this._node()) return;
    const { x, y, z } = resolveMeshScaleFromState(state);
    this.setScaleVector(x, y, z);
    this.setXOffset(state.xOffset ?? 0);
    this.setYOffset(state.yOffset ?? 0);
    this.setZOffset(state.zOffset ?? 0);
    this.setRotationX(state.rotationX ?? 0);
    this.setRotationY(state.rotationY ?? 0);
    this.setRotationZ(state.rotationZ ?? 0);
  }
}

