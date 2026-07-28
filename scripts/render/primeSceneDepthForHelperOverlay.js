import * as THREE from 'three';
import { resetRendererFullViewport } from './resetRendererFullViewport.js';

/** @type {THREE.MeshDepthMaterial | null} */
let sharedDepthOverrideMaterial = null;

function getSharedDepthOverrideMaterial() {
  if (!sharedDepthOverrideMaterial) {
    sharedDepthOverrideMaterial = new THREE.MeshDepthMaterial({
      depthTest: true,
      depthWrite: true,
    });
    sharedDepthOverrideMaterial.skinning = true;
    sharedDepthOverrideMaterial.morphTargets = true;
  }
  return sharedDepthOverrideMaterial;
}

/**
 * Helpers / overlays that must not punch holes in grid / wireframe depth tests.
 * @param {import('three').Object3D} object
 */
function shouldSkipDepthPrimeObject(object) {
  const u = object?.userData;
  if (!u) return false;
  return !!(
    u.isWireframeOverlay
    || u.isUvCheckerOverlay
    || u.isNormalViewOverlay
    || u.isTopologyWarningsOverlay
    || u.meshglHdriShadowReceiver
    || u.meshglDofDepthProxy
    || u.meshglDofFocusPlane
    || u.skipBokehDepth
  );
}

/**
 * Write mesh depth into `renderTarget` (or the screen) so helper overlays can depth-test
 * against scene geometry. Post stacks only touch color — composer RT depth is not on screen.
 * Color writes are disabled so the graded beauty plate is not overwritten.
 *
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   scene: import('three').Scene,
 *   camera: import('three').Camera,
 *   renderTarget?: import('three').WebGLRenderTarget | null,
 *   exclude?: Array<import('three').Object3D | null | undefined>,
 * }} ctx
 * @returns {boolean}
 */
export function primeSceneDepthForHelperOverlay({
  renderer,
  scene,
  camera,
  renderTarget = null,
  exclude = [],
}) {
  if (!renderer || !scene || !camera) return false;
  if (renderTarget?.depthBuffer === false) return false;

  /** @type {Array<{ object: import('three').Object3D, visible: boolean }>} */
  const snapshots = [];
  const seen = new Set();
  for (const object of exclude) {
    if (!object || seen.has(object)) continue;
    seen.add(object);
    snapshots.push({ object, visible: object.visible });
    object.visible = false;
  }

  scene.traverse((object) => {
    if (!object.visible || seen.has(object)) return;
    if (!shouldSkipDepthPrimeObject(object)) return;
    seen.add(object);
    snapshots.push({ object, visible: object.visible });
    object.visible = false;
  });

  // Bind-pose depth from stale bone matrices punches ghost holes in the grid / wireframe.
  const skeletonsUpdated = new Set();
  scene.traverse((object) => {
    if (!object.visible || !object.isSkinnedMesh || !object.skeleton) return;
    if (skeletonsUpdated.has(object.skeleton)) return;
    object.skeleton.update();
    skeletonsUpdated.add(object.skeleton);
  });

  const prevAutoClear = renderer.autoClear;
  const prevRenderTarget = renderer.getRenderTarget();
  const prevOverride = scene.overrideMaterial;

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

  renderer.clearDepth();
  scene.overrideMaterial = getSharedDepthOverrideMaterial();

  const gl = renderer.getContext();
  /** @type {[boolean, boolean, boolean, boolean] | null} */
  let prevColorMask = null;
  if (gl) {
    prevColorMask = gl.getParameter(gl.COLOR_WRITEMASK);
    gl.colorMask(false, false, false, false);
  }

  try {
    renderer.render(scene, camera);
  } finally {
    scene.overrideMaterial = prevOverride;
    if (gl && prevColorMask) {
      gl.colorMask(prevColorMask[0], prevColorMask[1], prevColorMask[2], prevColorMask[3]);
    }
  }

  for (const { object, visible } of snapshots) {
    object.visible = visible;
  }

  renderer.autoClear = prevAutoClear;
  renderer.setRenderTarget(prevRenderTarget);
  resetRendererFullViewport(renderer);

  return true;
}
