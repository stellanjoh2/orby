import * as THREE from 'three';

/**
 * Park `newcomer` just to the +X side of `anchors`, near them and the origin.
 * Also seats the newcomer on the standing plane of the anchors (shared bbox floor)
 * so differently sized imports do not float above or sink through the podium.
 * @param {import('three').Object3D[]} anchors
 * @param {import('three').Object3D} newcomer
 * @returns {number}
 */
export function placeAssetBeside(anchors, newcomer) {
  newcomer.updateMatrixWorld(true);
  const newcomers = new THREE.Box3().setFromObject(newcomer);
  const occupied = new THREE.Box3();
  for (const anchor of anchors) {
    if (!anchor) continue;
    anchor.updateMatrixWorld(true);
    occupied.expandByObject(anchor);
  }
  if (occupied.isEmpty() || newcomers.isEmpty()) {
    newcomer.position.x = 1.25;
    return newcomer.position.x;
  }
  const occupiedSize = occupied.getSize(new THREE.Vector3());
  const newcomerSize = newcomers.getSize(new THREE.Vector3());
  const gap = Math.max(0.25, Math.min(occupiedSize.x, newcomerSize.x) * 0.2);
  newcomer.position.x += occupied.max.x - newcomers.min.x + gap;
  // Peers already sit on the studio floor; match their feet, not their centers.
  newcomer.position.y += occupied.min.y - newcomers.min.y;
  return newcomer.position.x;
}
