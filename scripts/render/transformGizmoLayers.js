import { resetRendererFullViewport } from './resetRendererFullViewport.js';

/**
 * Transform widgets must composite after post so they stay crisp (Shader Lab, DOF, etc.).
 * @param {import('./PostProcessingPipeline.js').PostProcessingPipeline | null | undefined} postPipeline
 * @param {boolean} shaderLabOn
 * @returns {boolean}
 */
export function shouldOverlayTransformGizmos(postPipeline, shaderLabOn) {
  if (shaderLabOn) return true;
  return postPipeline?.bokehPass?.enabled === true;
}

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
 * Draw transform widgets on top after the post stack (Shader Lab, DOF, bloom, grading, etc.).
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

/**
 * Hide the studio ground grid for the ASCII scene draw (it is composited after the post pass).
 * @param {import('three').Object3D | null | undefined} grid
 * @returns {{ grid: import('three').Object3D, visible: boolean } | null}
 */
export function hideGroundGridForPass(grid) {
  if (!grid) return null;
  const snapshot = { grid, visible: grid.visible };
  grid.visible = false;
  return snapshot;
}

/**
 * @param {{ grid: import('three').Object3D, visible: boolean } | null | undefined} snapshot
 */
export function restoreGroundGridFromPass(snapshot) {
  if (!snapshot) return;
  snapshot.grid.visible = snapshot.visible;
}

/**
 * Draw the ground grid after the ASCII post stack — crisp lines, not glyph conversion.
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   camera: import('three').Camera,
 *   grid: import('three').Object3D | null | undefined,
 * }} ctx
 */
export function renderGroundGridOverlay({ renderer, camera, grid }) {
  if (!renderer || !camera || !grid?.visible) return;

  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setRenderTarget(null);
  resetRendererFullViewport(renderer);

  grid.updateMatrixWorld(true);
  renderer.render(grid, camera);

  renderer.autoClear = prevAutoClear;
  resetRendererFullViewport(renderer);
}
