import * as THREE from 'three';

/**
 * @typedef {{ modelDelta: THREE.Vector3, rootDelta: THREE.Vector3 }} CenterPivotDelta
 */

/** World-space lift from the studio floor grid for generated font meshes. */
export const FONT_STUDIO_GRID_CLEARANCE = 0.04;

const _box = new THREE.Box3();
const _mat = new THREE.Matrix4();
const _center = new THREE.Vector3();

/**
 * Axis-aligned bounds of `object` in `root`'s local space.
 * Unlike world AABB + worldToLocal(corner), this stays correct when `root` is rotated.
 * @param {THREE.Object3D} root
 * @param {THREE.Object3D} object
 * @returns {THREE.Box3 | null}
 */
export function computeBoundsInRootLocal(root, object) {
  if (!root || !object) return null;
  object.updateMatrixWorld(true);
  root.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const boxLocal = new THREE.Box3();
  let has = false;

  object.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const geom = child.geometry;
    if (!geom.boundingBox) geom.computeBoundingBox();
    if (!geom.boundingBox || geom.boundingBox.isEmpty()) return;
    _box.copy(geom.boundingBox);
    _mat.multiplyMatrices(rootInverse, child.matrixWorld);
    _box.applyMatrix4(_mat);
    if (!has) {
      boxLocal.copy(_box);
      has = true;
    } else {
      boxLocal.union(_box);
    }
  });

  return has && !boxLocal.isEmpty() ? boxLocal : null;
}

/**
 * Move generated font geometry so its block is centered on X/Z and sits above the grid.
 * Unlike {@link centerModelGeometryOnRoot}, the bbox bottom — not center — lands at `gridClearance`.
 *
 * @param {THREE.Object3D} modelRoot
 * @param {THREE.Object3D} model
 * @param {{ gridClearance?: number }} [options]
 * @returns {CenterPivotDelta | null}
 */
export function centerFontModelGeometryOnRoot(modelRoot, model, options = {}) {
  if (!modelRoot || !model) return null;

  const gridClearance = Number.isFinite(options.gridClearance)
    ? options.gridClearance
    : FONT_STUDIO_GRID_CLEARANCE;

  const boxLocal = computeBoundsInRootLocal(modelRoot, model);
  if (!boxLocal) return null;

  const modelBefore = model.position.clone();
  boxLocal.getCenter(_center);
  const offsetInRoot = new THREE.Vector3(
    _center.x,
    boxLocal.min.y - gridClearance,
    _center.z,
  );

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
 * Does not move {@link modelRoot} — use on import so the mesh lands at the studio origin.
 *
 * @param {THREE.Object3D} modelRoot
 * @param {THREE.Object3D} model
 * @returns {CenterPivotDelta | null}
 */
export function centerModelGeometryOnRoot(modelRoot, model) {
  if (!modelRoot || !model) return null;

  const boxLocal = computeBoundsInRootLocal(modelRoot, model);
  if (!boxLocal) return null;

  const modelBefore = model.position.clone();
  boxLocal.getCenter(_center);
  model.position.sub(_center);
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
 * Font pivot recenter that keeps the ink in the same world place.
 * Use on multi-object select — {@link centerFontModelGeometryOnRoot} alone jumps the text.
 *
 * @param {THREE.Object3D} modelRoot
 * @param {THREE.Object3D} model
 * @param {{ gridClearance?: number }} [options]
 * @returns {CenterPivotDelta | null}
 */
export function captureAndApplyCenterFontPivot(modelRoot, model, options = {}) {
  if (!modelRoot || !model) return null;

  model.updateMatrixWorld(true);
  modelRoot.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return null;

  const rootBefore = modelRoot.position.clone();
  const centerWorldBefore = box.getCenter(new THREE.Vector3());

  const localDelta = centerFontModelGeometryOnRoot(modelRoot, model, options);
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
