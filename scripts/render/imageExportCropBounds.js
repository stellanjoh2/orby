import * as THREE from 'three';

/**
 * World AABB covering every visible export root.
 * Transparent crop-to-asset must include all multi-object assets, not only the
 * Object-menu selection (`currentModel`).
 *
 * @param {Iterable<import('three').Object3D | null | undefined> | null | undefined} roots
 * @param {import('three').Object3D | null | undefined} [fallback]
 * @returns {import('three').Box3 | null}
 */
export function resolveExportCropWorldBox(roots, fallback = null) {
  const box = new THREE.Box3();
  let expanded = false;
  if (roots) {
    for (const root of roots) {
      if (!root || root.visible === false) continue;
      box.expandByObject(root);
      expanded = true;
    }
  }
  if (!expanded && fallback) {
    box.setFromObject(fallback);
    expanded = !box.isEmpty();
  }
  if (!expanded || box.isEmpty()) return null;
  return box;
}
