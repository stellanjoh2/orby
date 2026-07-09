import { resetRendererFullViewport } from './resetRendererFullViewport.js';

/**
 * Light guides are viewport helpers — composite after post so AO, bloom, DoF, grading, etc. stay off them.
 * @param {Array<import('three').Object3D | null | undefined> | null | undefined} roots
 * @returns {boolean}
 */
export function shouldOverlayLightIndicators(roots) {
  if (!roots?.length) return false;
  return roots.some((root) => root?.visible === true);
}

/**
 * Hide light guide geometry for the main scene draw + post stack.
 * @param {Array<import('three').Object3D | null | undefined> | null | undefined} roots
 * @returns {Array<{ root: import('three').Object3D, visible: boolean }> | null}
 */
export function hideLightIndicatorOverlaysForPass(roots) {
  if (!roots?.length) return null;
  /** @type {Array<{ root: import('three').Object3D, visible: boolean }>} */
  const snapshot = [];
  for (const root of roots) {
    if (!root) continue;
    snapshot.push({ root, visible: root.visible });
    root.visible = false;
  }
  return snapshot.length ? snapshot : null;
}

/**
 * @param {Array<{ root: import('three').Object3D, visible: boolean }> | null | undefined} snapshot
 */
export function restoreLightIndicatorOverlaysFromPass(snapshot) {
  if (!snapshot?.length) return;
  for (const { root, visible } of snapshot) {
    root.visible = visible;
  }
}

/**
 * @param {import('three').Object3D} root
 * @param {Array<{ mat: import('three').Material, depthTest: boolean, depthWrite: boolean }>} depthSnapshots
 */
function snapshotDepthState(root, depthSnapshots) {
  root.traverse((child) => {
    const material = child.material;
    if (!material) return;
    const mats = Array.isArray(material) ? material : [material];
    for (const mat of mats) {
      if (!mat) continue;
      depthSnapshots.push({
        mat,
        depthTest: mat.depthTest,
        depthWrite: mat.depthWrite,
      });
      mat.depthTest = false;
      mat.depthWrite = false;
    }
  });
}

/**
 * Draw spotlight cones and beam wireframes after the post stack — crisp helpers, no AO / bloom / DoF / grading.
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   camera: import('three').Camera,
 *   roots: Array<import('three').Object3D | null | undefined> | null | undefined,
 * }} ctx
 */
export function renderLightIndicatorOverlay({ renderer, camera, roots }) {
  if (!renderer || !camera || !roots?.length) return;

  /** @type {Array<{ mat: import('three').Material, depthTest: boolean, depthWrite: boolean }>} */
  const depthSnapshots = [];
  for (const root of roots) {
    if (!root?.visible) continue;
    snapshotDepthState(root, depthSnapshots);
  }

  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setRenderTarget(null);
  resetRendererFullViewport(renderer);
  renderer.clearDepth();

  try {
    for (const root of roots) {
      if (!root?.visible) continue;
      root.updateMatrixWorld(true);
      renderer.render(root, camera);
    }
  } finally {
    for (const { mat, depthTest, depthWrite } of depthSnapshots) {
      mat.depthTest = depthTest;
      mat.depthWrite = depthWrite;
    }
    renderer.autoClear = prevAutoClear;
    resetRendererFullViewport(renderer);
  }
}
