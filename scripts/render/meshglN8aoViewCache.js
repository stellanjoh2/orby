import * as THREE from 'three';
import { orbitControlsNeedFrame } from '../scene/renderLoopIdle.js';
import {
  sceneHasN8aoBackdropMultiplyMesh,
  sceneHasN8aoExcludedMesh,
} from './meshglN8aoBackdrop.js';

const CAMERA_POS_EPS_SQ = 1e-10;
const CAMERA_QUAT_EPS = 1e-6;

/**
 * @param {import('three').Camera} camera
 * @param {import('three').Vector3 | null | undefined} cachedPos
 * @param {import('three').Quaternion | null | undefined} cachedQuat
 * @param {import('three').Matrix4 | null | undefined} cachedProjection
 */
export function cameraViewChangedSinceCache(camera, cachedPos, cachedQuat, cachedProjection) {
  if (!cachedPos || !cachedQuat || !cachedProjection) return true;
  if (camera.position.distanceToSquared(cachedPos) > CAMERA_POS_EPS_SQ) return true;
  if (1 - Math.abs(camera.quaternion.dot(cachedQuat)) > CAMERA_QUAT_EPS) return true;
  if (!camera.projectionMatrix.equals(cachedProjection)) return true;
  return false;
}

/**
 * @param {import('three').Object3D | null | undefined} modelRoot
 * @param {import('three').Matrix4 | null | undefined} cachedModelMatrix
 */
export function modelRootChangedSinceCache(modelRoot, cachedModelMatrix) {
  if (!cachedModelMatrix) return true;
  if (!modelRoot) return !cachedModelMatrix.equals(new THREE.Matrix4());
  modelRoot.updateMatrixWorld(true);
  return !modelRoot.matrixWorld.equals(cachedModelMatrix);
}

/**
 * Whether N8AO must recompute its geometry-dependent buffers (beauty, depth, AO plate).
 *
 * @param {{
 *   viewCacheValid?: boolean,
 *   resolveOrbitControls?: (() => import('three/examples/jsm/controls/OrbitControls.js').OrbitControls | null | undefined) | null,
 *   resolveModelRoot?: (() => import('three').Object3D | null | undefined) | null,
 *   resolveForceAoRecompute?: (() => boolean) | null,
 *   camera: import('three').Camera,
 *   scene: import('three').Scene,
 *   cacheCameraPos?: import('three').Vector3 | null,
 *   cacheCameraQuat?: import('three').Quaternion | null,
 *   cacheProjection?: import('three').Matrix4 | null,
 *   cacheModelMatrix?: import('three').Matrix4 | null,
 *   cacheHadGlassMesh?: boolean,
 *   cacheHadBackdropMultiplyMesh?: boolean,
 * }} ctx
 */
export function needsN8aoViewRecompute(ctx) {
  if (!ctx.viewCacheValid) return true;
  if (ctx.resolveForceAoRecompute?.()) return true;
  if (orbitControlsNeedFrame(ctx.resolveOrbitControls?.())) return true;
  if (
    cameraViewChangedSinceCache(
      ctx.camera,
      ctx.cacheCameraPos,
      ctx.cacheCameraQuat,
      ctx.cacheProjection,
    )
  ) {
    return true;
  }
  if (modelRootChangedSinceCache(ctx.resolveModelRoot?.(), ctx.cacheModelMatrix)) {
    return true;
  }
  const hasGlass = sceneHasN8aoExcludedMesh(ctx.scene);
  if (hasGlass !== ctx.cacheHadGlassMesh) return true;
  const hasMultiply = sceneHasN8aoBackdropMultiplyMesh(ctx.scene);
  if (hasMultiply !== (ctx.cacheHadBackdropMultiplyMesh ?? ctx.cacheHadGlassMesh)) {
    return true;
  }
  return false;
}

/**
 * @param {{
 *   camera: import('three').Camera,
 *   scene: import('three').Scene,
 *   resolveModelRoot?: (() => import('three').Object3D | null | undefined) | null,
 *   cacheCameraPos: import('three').Vector3,
 *   cacheCameraQuat: import('three').Quaternion,
 *   cacheProjection: import('three').Matrix4,
 *   cacheModelMatrix: import('three').Matrix4,
 * }} ctx
 * @returns {{ cacheHadGlassMesh: boolean, cacheHadBackdropMultiplyMesh: boolean }}
 */
export function snapshotN8aoViewCache(ctx) {
  ctx.cacheCameraPos.copy(ctx.camera.position);
  ctx.cacheCameraQuat.copy(ctx.camera.quaternion);
  ctx.cacheProjection.copy(ctx.camera.projectionMatrix);

  const modelRoot = ctx.resolveModelRoot?.();
  if (modelRoot) {
    modelRoot.updateMatrixWorld(true);
    ctx.cacheModelMatrix.copy(modelRoot.matrixWorld);
  } else {
    ctx.cacheModelMatrix.identity();
  }

  return {
    cacheHadGlassMesh: sceneHasN8aoExcludedMesh(ctx.scene),
    cacheHadBackdropMultiplyMesh: sceneHasN8aoBackdropMultiplyMesh(ctx.scene),
  };
}
