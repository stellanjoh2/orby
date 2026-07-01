import { resetRendererFullViewport } from './resetRendererFullViewport.js';

/**
 * Wireframe must composite after post so lines stay crisp (Shader Lab, DOF, etc.).
 * @param {import('./PostProcessingPipeline.js').PostProcessingPipeline | null | undefined} postPipeline
 * @param {boolean} shaderLabOn
 * @returns {boolean}
 */
export function shouldOverlayWireframeMeshes(postPipeline, shaderLabOn) {
  if (shaderLabOn) return true;
  return postPipeline?.bokehPass?.enabled === true;
}

/**
 * Hide wireframe overlays for the main scene draw + post stack.
 * @param {import('three').Mesh[] | null | undefined} wireframeMeshes
 * @returns {Array<{ mesh: import('three').Mesh, visible: boolean }> | null}
 */
export function hideWireframeOverlaysForPass(wireframeMeshes) {
  if (!wireframeMeshes?.length) return null;
  /** @type {Array<{ mesh: import('three').Mesh, visible: boolean }>} */
  const snapshot = [];
  for (const mesh of wireframeMeshes) {
    if (!mesh?.isMesh) continue;
    snapshot.push({ mesh, visible: mesh.visible });
    mesh.visible = false;
  }
  return snapshot.length ? snapshot : null;
}

/**
 * @param {Array<{ mesh: import('three').Mesh, visible: boolean }> | null | undefined} snapshot
 */
export function restoreWireframeOverlaysFromPass(snapshot) {
  if (!snapshot?.length) return;
  for (const { mesh, visible } of snapshot) {
    mesh.visible = visible;
  }
}

/**
 * Draw wireframe overlays after the post stack — crisp lines, not DoF blur or Shader Lab stylization.
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   camera: import('three').Camera,
 *   wireframeMeshes: import('three').Mesh[] | null | undefined,
 * }} ctx
 */
export function renderWireframeOverlay({ renderer, camera, wireframeMeshes }) {
  if (!renderer || !camera || !wireframeMeshes?.length) return;

  /** @type {Array<{ mat: import('three').Material, depthTest: boolean, depthWrite: boolean }>} */
  const depthSnapshots = [];
  for (const mesh of wireframeMeshes) {
    if (!mesh?.isMesh || !mesh.visible) continue;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
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
  }

  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setRenderTarget(null);
  resetRendererFullViewport(renderer);
  renderer.clearDepth();

  try {
    const skeletonsUpdated = new Set();
    for (const mesh of wireframeMeshes) {
      if (!mesh?.isMesh || !mesh.visible) continue;
      if (mesh.isSkinnedMesh && mesh.skeleton && !skeletonsUpdated.has(mesh.skeleton)) {
        mesh.skeleton.update();
        skeletonsUpdated.add(mesh.skeleton);
      }
      mesh.updateMatrixWorld(true);
      renderer.render(mesh, camera);
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
