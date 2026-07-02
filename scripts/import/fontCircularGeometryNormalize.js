import * as THREE from 'three';

/**
 * Per-glyph normalize for circular wrap — union ink center X, shared layout baseline Y.
 * rotateX(π) keeps opentype baseline y=0 fixed; bbox minY would pull mid-line punctuation
 * and multi-contour glyphs (i, ä) onto the ring floor.
 *
 * @param {THREE.Group} glyphGroup
 * @param {number} uniformScale
 */
export function normalizeFontCircularGlyphGroupGeometry(glyphGroup, uniformScale) {
  /** @type {THREE.Mesh[]} */
  const meshes = [];
  glyphGroup.children.forEach((child) => {
    if (!child.isMesh || !child.geometry) return;
    child.geometry.scale(uniformScale, uniformScale, 1);
    child.geometry.rotateX(Math.PI);
    child.geometry.computeBoundingBox();
    meshes.push(child);
  });
  if (!meshes.length) return;

  const unionBox = new THREE.Box3();
  meshes.forEach((child) => {
    unionBox.union(child.geometry.boundingBox);
  });
  if (unionBox.isEmpty()) return;

  const pivotX = (unionBox.min.x + unionBox.max.x) * 0.5;
  const pivotY = 0;

  meshes.forEach((child) => {
    child.geometry.translate(-pivotX, -pivotY, 0);
    child.geometry.computeBoundingBox();
    child.geometry.computeBoundingSphere();
  });

  glyphGroup.rotation.set(0, 0, 0);
}
