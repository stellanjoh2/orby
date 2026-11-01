/**
 * Preserve live extrude group identity across geometry rebuilds.
 * Kept free of CDN imports so Node can unit-test the transform contract.
 */

/**
 * @param {import('three').Object3D} node
 */
export function disposeExtrudeMeshNode(node) {
  node.traverse?.((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((mat) => mat?.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
}

/**
 * Swap rebuilt mesh children into the live group without resetting its transform.
 * Fresh importer groups are identity — copying their pose wiped pivot offsets,
 * import scale, and multi-asset placement. Runtime metadata on the live root
 * (asset id, pivot delta, font document stamp) must survive; importer keys from
 * the rebuild overlay on top.
 *
 * @param {import('three').Group} targetGroup
 * @param {import('three').Group} sourceGroup
 */
export function replaceExtrudeGroupChildren(targetGroup, sourceGroup) {
  while (targetGroup.children.length) {
    const child = targetGroup.children[0];
    disposeExtrudeMeshNode(child);
    targetGroup.remove(child);
  }

  while (sourceGroup.children.length) {
    targetGroup.add(sourceGroup.children[0]);
  }

  if (sourceGroup.name) targetGroup.name = sourceGroup.name;
  targetGroup.userData = {
    ...targetGroup.userData,
    ...sourceGroup.userData,
  };
}

/**
 * @param {import('three').Group | null} existingGroup
 * @param {import('three').Group} rebuiltGroup
 * @returns {import('three').Group}
 */
export function preserveExtrudeGroupOnRebuild(existingGroup, rebuiltGroup) {
  if (!existingGroup) return rebuiltGroup;
  replaceExtrudeGroupChildren(existingGroup, rebuiltGroup);
  return existingGroup;
}
