import * as THREE from 'three';

/**
 * @typedef {{ modelDelta: THREE.Vector3, rootDelta: THREE.Vector3 }} CenterPivotDelta
 */

/**
 * Move the loaded model so its bounding-box center sits on {@link modelRoot}'s origin.
 * Does not move {@link modelRoot} — use on import so the mesh lands at the studio origin.
 *
 * @param {THREE.Object3D} modelRoot
 * @param {THREE.Object3D} model
 * @returns {CenterPivotDelta | null}
 */
export function centerModelGeometryOnRoot(modelRoot, model) {
  if (!modelRoot || !model) return null;

  model.updateMatrixWorld(true);
  modelRoot.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return null;

  const modelBefore = model.position.clone();
  const centerWorldBefore = box.getCenter(new THREE.Vector3());
  const offsetInRoot = modelRoot.worldToLocal(centerWorldBefore.clone());

  model.position.sub(offsetInRoot);
  model.updateMatrixWorld(true);
  modelRoot.updateMatrixWorld(true);

  return {
    modelDelta: model.position.clone().sub(modelBefore),
    rootDelta: new THREE.Vector3(),
  };
}

/**
 * Move the loaded model so its bounding-box center sits on {@link modelRoot}'s origin.
 * Compensates {@link modelRoot} position so the mesh stays in the same place on screen.
 *
 * @param {THREE.Object3D} modelRoot
 * @param {THREE.Object3D} model
 * @returns {CenterPivotDelta | null}
 */
export function captureAndApplyCenterPivot(modelRoot, model) {
  if (!modelRoot || !model) return null;

  model.updateMatrixWorld(true);
  modelRoot.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return null;

  const rootBefore = modelRoot.position.clone();
  const centerWorldBefore = box.getCenter(new THREE.Vector3());

  const localDelta = centerModelGeometryOnRoot(modelRoot, model);
  if (!localDelta) return null;

  const boxAfter = new THREE.Box3().setFromObject(model);
  const centerWorldAfter = boxAfter.getCenter(new THREE.Vector3());
  const worldDelta = centerWorldBefore.sub(centerWorldAfter);
  modelRoot.position.add(worldDelta);
  modelRoot.updateMatrixWorld(true);

  return {
    modelDelta: localDelta.modelDelta,
    rootDelta: modelRoot.position.clone().sub(rootBefore),
  };
}

/**
 * Undo a prior center-pivot operation using its returned deltas.
 *
 * @param {THREE.Object3D} modelRoot
 * @param {THREE.Object3D} model
 * @param {CenterPivotDelta} delta
 */
export function undoCenterPivot(modelRoot, model, delta) {
  if (!modelRoot || !model || !delta) return;
  model.position.sub(delta.modelDelta);
  modelRoot.position.sub(delta.rootDelta);
  model.updateMatrixWorld(true);
  modelRoot.updateMatrixWorld(true);
}

/**
 * @param {THREE.Object3D} object
 * @returns {{ box: THREE.Box3, size: THREE.Vector3, center: THREE.Vector3, radius: number } | null}
 */
export function computeObjectBounds(object) {
  if (!object) return null;
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  return {
    box,
    size,
    center,
    radius: size.length() / 2,
  };
}
