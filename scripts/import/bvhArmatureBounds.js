import * as THREE from 'three';

/**
 * Expand a box to include all bone world positions under `object` (rest or animated pose).
 * Falls back when {@link THREE.Box3.setFromObject} is empty (bone-only mocap imports).
 *
 * @param {THREE.Object3D | null | undefined} object
 * @param {THREE.Box3} [target]
 * @returns {THREE.Box3}
 */
export function expandBox3FromArmature(object, target = new THREE.Box3()) {
  target.makeEmpty();
  if (!object) return target;

  object.updateMatrixWorld(true);
  const point = new THREE.Vector3();

  object.traverse((child) => {
    if (!child.isBone) return;
    child.getWorldPosition(point);
    target.expandByPoint(point);
  });

  return target;
}

/**
 * @param {THREE.Object3D | null | undefined} object
 * @returns {boolean}
 */
export function isBoneOnlyArmature(object) {
  if (!object) return false;
  let hasMesh = false;
  let hasBone = false;
  object.traverse((child) => {
    if (child.isMesh && !child.userData?.orbyJointMarker) hasMesh = true;
    if (child.isBone) hasBone = true;
  });
  return hasBone && !hasMesh;
}

/**
 * @param {THREE.Bone[]} bones
 * @returns {THREE.Bone | null}
 */
export function findArmatureRootBone(bones) {
  if (!bones?.length) return null;
  const boneSet = new Set(bones);
  for (const bone of bones) {
    let parent = bone.parent;
    while (parent && !boneSet.has(parent)) {
      parent = parent.parent;
    }
    if (!parent || !boneSet.has(parent)) return bone;
  }
  return bones[0];
}
