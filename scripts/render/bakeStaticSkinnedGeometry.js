import * as THREE from 'three';

const _vertex = new THREE.Vector3();
const _skinned = new THREE.Vector3();
const _temp = new THREE.Vector3();
const _boneMatrix = new THREE.Matrix4();

/**
 * Bake a SkinnedMesh at its current skeleton pose into static BufferGeometry (mesh local space).
 * Removes skinIndex / skinWeight attributes.
 * @param {THREE.SkinnedMesh} skinnedMesh
 * @returns {THREE.BufferGeometry | null}
 */
export function bakeSkinnedMeshToStaticGeometry(skinnedMesh) {
  if (!skinnedMesh?.isSkinnedMesh) return null;

  const srcGeo = skinnedMesh.geometry;
  const pos = srcGeo?.attributes?.position;
  const skinIndex = srcGeo?.attributes?.skinIndex;
  const skinWeight = srcGeo?.attributes?.skinWeight;
  if (!pos || !skinIndex || !skinWeight) return null;

  const skeleton = skinnedMesh.skeleton;
  if (!skeleton?.boneMatrices?.length) return null;

  skinnedMesh.updateMatrixWorld(true);
  skeleton.update();

  const boneMatrices = skeleton.boneMatrices;
  const bindMatrix = skinnedMesh.bindMatrix;
  const bindMatrixInverse = skinnedMesh.bindMatrixInverse;

  const bakedGeo = srcGeo.clone();
  const bakedPos = bakedGeo.attributes.position;
  const out = bakedPos.array;

  for (let i = 0; i < pos.count; i += 1) {
    _vertex.fromBufferAttribute(pos, i);
    _skinned.set(0, 0, 0);

    for (let j = 0; j < 4; j += 1) {
      const weight = skinWeight.getComponent(i, j);
      if (weight <= 0) continue;
      const boneIndex = skinIndex.getComponent(i, j);
      _boneMatrix.fromArray(boneMatrices, boneIndex * 16);
      _temp.copy(_vertex).applyMatrix4(bindMatrix).applyMatrix4(_boneMatrix);
      _skinned.addScaledVector(_temp, weight);
    }

    _temp.copy(_skinned).applyMatrix4(bindMatrixInverse);
    const base = i * 3;
    out[base] = _temp.x;
    out[base + 1] = _temp.y;
    out[base + 2] = _temp.z;
  }

  bakedPos.needsUpdate = true;
  bakedGeo.deleteAttribute('skinIndex');
  bakedGeo.deleteAttribute('skinWeight');
  bakedGeo.computeBoundingBox();
  bakedGeo.computeBoundingSphere();
  return bakedGeo;
}

/**
 * Reset skinned meshes on a model to bind/rest pose (no animation clips).
 * @param {THREE.Object3D} root
 */
export function applyBindPoseToSkinnedMeshes(root) {
  if (!root) return;
  root.traverse((child) => {
    if (!child.isSkinnedMesh || !child.skeleton) return;
    child.skeleton.pose();
    child.skeleton.update();
  });
}

/**
 * Force clip 0 / time 0 on all skeletons under root (temporary static pose for baking).
 * @param {THREE.Object3D} root
 * @param {import('./AnimationController.js').AnimationController | null | undefined} animationController
 */
export function applyStaticAnimationFrameZero(root, animationController) {
  if (!root) return;

  if (animationController?.applyStaticPoseAtFrameZero) {
    animationController.applyStaticPoseAtFrameZero();
  } else {
    applyBindPoseToSkinnedMeshes(root);
  }

  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (child.isSkinnedMesh && child.skeleton) {
      child.skeleton.update();
    }
  });
}

/** @param {THREE.Mesh | THREE.SkinnedMesh} mesh */
export function meshUsesSkinning(mesh) {
  if (!mesh?.isMesh) return false;
  if (mesh.isSkinnedMesh) return true;
  const geo = mesh.geometry;
  return !!(geo?.attributes?.skinIndex && geo?.attributes?.skinWeight);
}
