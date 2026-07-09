import * as THREE from 'three';

/** Prevent flipped / collapsed meshes from per-axis scale handles. */
export const MIN_MESH_SCALE = 0.01;

/**
 * @param {THREE.Vector3} scale
 */
export function clampMeshScaleComponents(scale) {
  scale.x = Math.max(MIN_MESH_SCALE, scale.x);
  scale.y = Math.max(MIN_MESH_SCALE, scale.y);
  scale.z = Math.max(MIN_MESH_SCALE, scale.z);
}

/**
 * @param {object} state
 * @returns {{ x: number, y: number, z: number }}
 */
export function resolveMeshScaleFromState(state) {
  const x = Math.max(MIN_MESH_SCALE, Number(state?.scale ?? 1) || 1);
  const y = Math.max(MIN_MESH_SCALE, Number(state?.scaleY ?? x) || x);
  const z = Math.max(MIN_MESH_SCALE, Number(state?.scaleZ ?? x) || x);
  return { x, y, z };
}

/**
 * Manages model transform operations (scale, position, rotation).
 * All transforms are applied to the modelRoot group.
 */
export class TransformController {
  constructor({ modelRoot }) {
    this.modelRoot = modelRoot;
  }

  /**
   * Set the model root (called when model changes)
   * @param {THREE.Group} modelRoot - The root group to apply transforms to
   */
  setModelRoot(modelRoot) {
    this.modelRoot = modelRoot;
  }

  /**
   * Reset all transforms to defaults
   */
  reset() {
    if (!this.modelRoot) return;
    this.modelRoot.rotation.set(0, 0, 0);
    this.modelRoot.position.set(0, 0, 0);
    this.modelRoot.scale.set(1, 1, 1);
  }

  /**
   * Scale along X from the shelf slider (state key `scale`).
   * @param {number} value
   */
  setScaleX(value) {
    if (!this.modelRoot) return;
    this.modelRoot.scale.x = Math.max(MIN_MESH_SCALE, Number(value) || 1);
  }

  /**
   * Scale along Y from the shelf slider.
   * @param {number} value
   */
  setScaleY(value) {
    if (!this.modelRoot) return;
    this.modelRoot.scale.y = Math.max(MIN_MESH_SCALE, Number(value) || 1);
  }

  /**
   * Scale along Z from the shelf slider.
   * @param {number} value
   */
  setScaleZ(value) {
    if (!this.modelRoot) return;
    this.modelRoot.scale.z = Math.max(MIN_MESH_SCALE, Number(value) || 1);
  }

  /**
   * @deprecated Use {@link setScaleX}. Kept for `mesh:scale` event compat.
   * @param {number} value
   */
  setScale(value) {
    this.setScaleX(value);
  }

  /**
   * Per-axis scale from the gizmo or scene settings restore.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setScaleVector(x, y, z) {
    if (!this.modelRoot) return;
    this.modelRoot.scale.set(
      Math.max(MIN_MESH_SCALE, Number(x) || 1),
      Math.max(MIN_MESH_SCALE, Number(y) || 1),
      Math.max(MIN_MESH_SCALE, Number(z) || 1),
    );
  }

  /**
   * Set the X position offset of the model
   * @param {number} value - X offset in world units
   */
  setXOffset(value) {
    if (!this.modelRoot) return;
    this.modelRoot.position.x = value;
  }

  /**
   * Set the Y position offset of the model
   * @param {number} value - Y offset in world units
   */
  setYOffset(value) {
    if (!this.modelRoot) return;
    this.modelRoot.position.y = value;
  }

  /**
   * Set the Z position offset of the model
   * @param {number} value - Z offset in world units
   */
  setZOffset(value) {
    if (!this.modelRoot) return;
    this.modelRoot.position.z = value;
  }

  /**
   * Set the X rotation of the model
   * @param {number} value - Rotation in degrees
   */
  setRotationX(value) {
    if (!this.modelRoot) return;
    this.modelRoot.rotation.x = THREE.MathUtils.degToRad(value);
  }

  /**
   * Set the Y rotation of the model
   * @param {number} value - Rotation in degrees
   */
  setRotationY(value) {
    if (!this.modelRoot) return;
    this.modelRoot.rotation.y = THREE.MathUtils.degToRad(value);
  }

  /**
   * Set the Z rotation of the model
   * @param {number} value - Rotation in degrees
   */
  setRotationZ(value) {
    if (!this.modelRoot) return;
    this.modelRoot.rotation.z = THREE.MathUtils.degToRad(value);
  }

  /**
   * Apply transform state from StateStore
   * @param {Object} state - State object with transform properties
   */
  applyState(state) {
    if (!this.modelRoot) return;
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

