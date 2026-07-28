import { resetRendererFullViewport } from './resetRendererFullViewport.js';
import { primeSceneDepthForHelperOverlay } from './primeSceneDepthForHelperOverlay.js';

/**
 * Transform widgets are viewport helpers — composite after post so AO, bloom, DoF, grading, etc. stay off them.
 * @param {Array<import('three').Object3D | null | undefined> | null | undefined} gizmos
 * @returns {boolean}
 */
export function shouldOverlayTransformGizmos(gizmos) {
  if (!gizmos?.length) return false;
  return gizmos.some((gizmo) => gizmo?.visible === true);
}

/**
 * Hide transform widgets for the main scene draw (composited after the post stack).
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
 * Draw transform widgets on top after the post stack — crisp helpers, no AO / bloom / DoF / grading.
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
 * Studio ground grid is a helper — composite after post so AO, bloom, DoF, grading, etc. stay off it.
 * @param {import('three').Object3D | null | undefined} grid
 * @returns {boolean}
 */
export function shouldOverlayGroundGrid(grid) {
  return grid?.visible === true;
}

/**
 * Hide the studio ground grid for the main scene draw (composited after the post stack).
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
 * Draw the ground grid after the post stack — crisp helper lines, no AO / bloom / DoF / grading.
 * Depth-tests against scene meshes so the grid does not draw through solid geometry.
 * Pass `depthTestAgainstScene: false` for x-ray wireframe (only-visible-faces off) so the grid
 * stays continuous under see-through wires instead of looking like an invisible mask.
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   camera: import('three').Camera,
 *   scene?: import('three').Scene | null,
 *   grid: import('three').Object3D | null | undefined,
 *   renderTarget?: import('three').WebGLRenderTarget | null,
 *   depthTestAgainstScene?: boolean,
 * }} ctx
 */
export function renderGroundGridOverlay({
  renderer,
  camera,
  scene = null,
  grid,
  renderTarget = null,
  depthTestAgainstScene = true,
}) {
  if (!renderer || !camera || !grid?.visible) return;

  const material = grid.material;
  /** @type {import('three').Material[]} */
  const mats = material
    ? (Array.isArray(material) ? material : [material])
    : [];
  /** @type {Array<{ mat: import('three').Material, depthTest: boolean, depthWrite: boolean }>} */
  const depthSnapshots = [];

  const depthPrimed = depthTestAgainstScene && scene
    ? primeSceneDepthForHelperOverlay({
        renderer,
        scene,
        camera,
        renderTarget,
        exclude: [grid],
      })
    : false;

  const prevAutoClear = renderer.autoClear;
  const prevRenderTarget = renderer.getRenderTarget();
  renderer.autoClear = false;
  renderer.setRenderTarget(renderTarget);

  if (renderTarget) {
    renderer.setViewport(0, 0, renderTarget.width, renderTarget.height);
    if (typeof renderer.setScissor === 'function') {
      renderer.setScissor(0, 0, renderTarget.width, renderTarget.height);
    }
    if (typeof renderer.setScissorTest === 'function') {
      renderer.setScissorTest(false);
    }
  } else {
    resetRendererFullViewport(renderer);
  }

  if (!depthPrimed) {
    renderer.clearDepth();
  }

  for (const mat of mats) {
    if (!mat) continue;
    depthSnapshots.push({
      mat,
      depthTest: mat.depthTest,
      depthWrite: mat.depthWrite,
    });
    mat.depthTest = depthPrimed;
    mat.depthWrite = false;
    if (!depthPrimed) {
      mat.depthTest = false;
    }
  }

  try {
    grid.updateMatrixWorld(true);
    renderer.render(grid, camera);
  } finally {
    for (const { mat, depthTest, depthWrite } of depthSnapshots) {
      mat.depthTest = depthTest;
      mat.depthWrite = depthWrite;
    }
    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(prevRenderTarget);
    resetRendererFullViewport(renderer);
  }
}
