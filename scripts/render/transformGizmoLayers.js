import { resetRendererFullViewport } from './resetRendererFullViewport.js';

/**
 * Hide transform widgets for the Shader Lab scene draw (ASCII / post stack).
 * @param {Array<import('three').Object3D | null | undefined>} gizmos
 * @returns {Array<{ gizmo: import('three').Object3D, visible: boolean }>}
 */
export function hideTransformGizmosForPass(gizmos) {
  /** @type {Array<{ gizmo: import('three').Object3D, visible: boolean }>} */
  const snapshot = [];
  for (const gizmo of gizmos) {
    if (!gizmo) continue;
    snapshot.push({ gizmo, visible: gizmo.visible });
    gizmo.visible = false;
  }
  return snapshot;
}

/**
 * @param {Array<{ gizmo: import('three').Object3D, visible: boolean }> | null | undefined} snapshot
 */
export function restoreTransformGizmosFromPass(snapshot) {
  if (!snapshot?.length) return;
  for (const { gizmo, visible } of snapshot) {
    gizmo.visible = visible;
  }
}

/**
 * Draw transform widgets on top after the post stack (ASCII, bloom, grading, etc.).
 * Renders each gizmo subtree individually so the main scene is not double-drawn.
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   camera: import('three').Camera,
 *   gizmos: Array<import('three').Object3D | null | undefined>,
 * }} ctx
 */
export function renderTransformGizmoOverlay({ renderer, camera, gizmos }) {
  if (!renderer || !camera) return;

  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setRenderTarget(null);
  resetRendererFullViewport(renderer);
  renderer.clearDepth();

  for (const gizmo of gizmos) {
    if (!gizmo?.visible) continue;
    gizmo.updateMatrixWorld(true);
    renderer.render(gizmo, camera);
  }

  renderer.autoClear = prevAutoClear;
  resetRendererFullViewport(renderer);
}
