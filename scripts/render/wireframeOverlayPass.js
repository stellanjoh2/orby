import { resetRendererFullViewport } from './resetRendererFullViewport.js';
import { primeSceneDepthForHelperOverlay } from './primeSceneDepthForHelperOverlay.js';

/**
 * Wireframe overlay is a viewport helper — composite after post so AO, bloom, DoF, grading, etc. stay off it.
 * @param {import('three').Mesh[] | null | undefined} wireframeMeshes
 * @returns {boolean}
 */
export function shouldOverlayWireframeMeshes(wireframeMeshes) {
  if (!wireframeMeshes?.length) return false;
  return wireframeMeshes.some((mesh) => mesh?.visible === true);
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
 * @param {import('three').Mesh[] | null | undefined} wireframeMeshes
 * @returns {boolean}
 */
export function wireframeMeshesWantDepthTest(wireframeMeshes) {
  if (!wireframeMeshes?.length) return false;
  for (const mesh of wireframeMeshes) {
    if (!mesh?.isMesh) continue;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (mat?.depthTest) return true;
    }
  }
  return false;
}

/**
 * X-ray wireframe (only-visible-faces off): overlays exist but materials have depthTest false.
 * Ignores mesh.visible — overlays are hidden during the beauty/grid passes.
 * @param {import('three').Mesh[] | null | undefined} wireframeMeshes
 * @returns {boolean}
 */
export function wireframeOverlayIsXRay(wireframeMeshes) {
  if (!wireframeMeshes?.length) return false;
  let sawMaterial = false;
  for (const mesh of wireframeMeshes) {
    if (!mesh?.isMesh) continue;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat) continue;
      sawMaterial = true;
      if (mat.depthTest) return false;
    }
  }
  return sawMaterial;
}

/**
 * "Hide mesh" hides source geometry from the beauty pass — temporarily show it so depth priming
 * can occlude back-facing wireframe lines.
 * @param {import('three').Mesh[] | null | undefined} wireframeMeshes
 * @returns {Array<{ mesh: import('three').Mesh, visible: boolean }>}
 */
function revealHiddenWireframeSourcesForDepth(wireframeMeshes) {
  /** @type {Array<{ mesh: import('three').Mesh, visible: boolean }>} */
  const snapshots = [];
  if (!wireframeMeshes?.length) return snapshots;
  for (const wireMesh of wireframeMeshes) {
    const source = wireMesh?.userData?.originalMesh;
    if (!source?.isMesh || source.visible) continue;
    snapshots.push({ mesh: source, visible: source.visible });
    source.visible = true;
  }
  return snapshots;
}

/**
 * @param {Array<{ mesh: import('three').Mesh, visible: boolean }>} snapshots
 */
function restoreHiddenWireframeSourcesFromDepth(snapshots) {
  for (const { mesh, visible } of snapshots) {
    mesh.visible = visible;
  }
}

/**
 * MeshBasicMaterial.wireframe draws GL_LINES — polygonOffset does not apply. Write a solid
 * triangle depth pass with the same skinned/morph geometry first so line fragments can pass
 * the depth test. Disable polygonOffset here so solid depth matches the clip-biased line shader
 * (polygonOffset + clip bias would push solid ahead of the lines and mask them again).
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   camera: import('three').Camera,
 *   wireframeMeshes: import('three').Mesh[] | null | undefined,
 * }} ctx
 */
function primeSolidDepthForWireframeLines({ renderer, camera, wireframeMeshes }) {
  if (!renderer || !camera || !wireframeMeshes?.length) return;

  const gl = renderer.getContext();
  /** @type {[boolean, boolean, boolean, boolean] | null} */
  let prevColorMask = null;
  if (gl) {
    prevColorMask = gl.getParameter(gl.COLOR_WRITEMASK);
    gl.colorMask(false, false, false, false);
  }

  /** @type {Array<{
   *   mat: import('three').Material,
   *   wireframe: boolean,
   *   depthWrite: boolean,
   *   depthTest: boolean,
   *   colorWrite?: boolean,
   *   polygonOffset: boolean,
   * }>} */
  const snapshots = [];
  try {
    const skeletonsUpdated = new Set();
    for (const mesh of wireframeMeshes) {
      if (!mesh?.isMesh || !mesh.visible || !mesh.userData?.wireframeNeedsSolidDepthPrime) {
        continue;
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat) continue;
        snapshots.push({
          mat,
          wireframe: mat.wireframe,
          depthWrite: mat.depthWrite,
          depthTest: mat.depthTest,
          colorWrite: mat.colorWrite,
          polygonOffset: mat.polygonOffset,
        });
        mat.wireframe = false;
        mat.depthWrite = true;
        mat.depthTest = true;
        mat.polygonOffset = false;
        if ('colorWrite' in mat) mat.colorWrite = false;
      }
      if (mesh.isSkinnedMesh && mesh.skeleton && !skeletonsUpdated.has(mesh.skeleton)) {
        mesh.skeleton.update();
        skeletonsUpdated.add(mesh.skeleton);
      }
      mesh.updateMatrixWorld(true);
      renderer.render(mesh, camera);
    }
  } finally {
    for (const snap of snapshots) {
      snap.mat.wireframe = snap.wireframe;
      snap.mat.depthWrite = snap.depthWrite;
      snap.mat.depthTest = snap.depthTest;
      snap.mat.polygonOffset = snap.polygonOffset;
      if ('colorWrite' in snap.mat && snap.colorWrite !== undefined) {
        snap.mat.colorWrite = snap.colorWrite;
      }
    }
    if (gl && prevColorMask) {
      gl.colorMask(prevColorMask[0], prevColorMask[1], prevColorMask[2], prevColorMask[3]);
    }
  }
}

/**
 * Draw wireframe overlays after the post stack — crisp helper lines, no AO / bloom / DoF / grading.
 * When materials use depthTest ("only visible faces"), scene depth is primed on screen first so
 * back-facing / occluded lines are clipped (same pattern as the ground grid overlay).
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   camera: import('three').Camera,
 *   scene?: import('three').Scene | null,
 *   wireframeMeshes: import('three').Mesh[] | null | undefined,
 *   renderTarget?: import('three').WebGLRenderTarget | null,
 * }} ctx
 */
export function renderWireframeOverlay({
  renderer,
  camera,
  scene = null,
  wireframeMeshes,
  renderTarget = null,
}) {
  if (!renderer || !camera || !wireframeMeshes?.length) return;

  const wantsDepthTest = wireframeMeshesWantDepthTest(wireframeMeshes);
  const hiddenSourceSnapshots = wantsDepthTest
    ? revealHiddenWireframeSourcesForDepth(wireframeMeshes)
    : [];

  const depthPrimed = wantsDepthTest && scene
    ? primeSceneDepthForHelperOverlay({
        renderer,
        scene,
        camera,
        renderTarget,
        exclude: wireframeMeshes,
      })
    : false;

  restoreHiddenWireframeSourcesFromDepth(hiddenSourceSnapshots);

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
      if (depthPrimed && mat.depthTest) {
        mat.depthWrite = false;
      } else {
        mat.depthTest = false;
        mat.depthWrite = false;
      }
    }
  }

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

  try {
    if (depthPrimed) {
      primeSolidDepthForWireframeLines({ renderer, camera, wireframeMeshes });
    }

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
    renderer.setRenderTarget(prevRenderTarget);
    resetRendererFullViewport(renderer);
  }
}
