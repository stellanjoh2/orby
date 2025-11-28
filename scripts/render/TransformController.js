import * as THREE from 'three';

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
    this.modelRoot.scale.setScalar(1);
  }

  /**
   * Set the scale of the model
   * @param {number} value - Scale value (1.0 = 100%)
   */
  setScale(value) {
    if (!this.modelRoot) return;
    this.modelRoot.scale.setScalar(value);
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
    this.setScale(state.scale ?? 1);
    this.setXOffset(state.xOffset ?? 0);
    this.setYOffset(state.yOffset ?? 0);
    this.setZOffset(state.zOffset ?? 0);
    this.setRotationX(state.rotationX ?? 0);
    this.setRotationY(state.rotationY ?? 0);
    this.setRotationZ(state.rotationZ ?? 0);
  }
}

