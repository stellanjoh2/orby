import * as THREE from 'three';

const _viewPos = new THREE.Vector3();

/**
 * Same linearization as BokehShader2 / three.js webgl_postprocessing_dof2.
 */
export function linearizeBokehDepth(depth, near, far) {
  const znear = Math.max(1e-4, near);
  const zfar = Math.max(znear + 1e-3, far);
  return (-zfar * znear) / (depth * (zfar - znear) - zfar);
}

/** View-space depth in meters (BokehDepthShader `vViewZDepth`). */
export function worldPointToViewDepth(worldPoint, camera) {
  _viewPos.copy(worldPoint).applyMatrix4(camera.matrixWorldInverse);
  return Math.max(0, -_viewPos.z);
}

/** View depth (m) → BokehShader2 `focalDepth` uniform (meters along the view axis). */
export function viewDepthToBokehFocalDepth(viewDepth, near, _far) {
  const znear = Math.max(1e-4, near);
  return Math.max(znear, viewDepth);
}

export function worldPointToBokehFocalDepth(worldPoint, camera, near, far) {
  return viewDepthToBokehFocalDepth(worldPointToViewDepth(worldPoint, camera), near, far);
}

/** UI / raycast focus distance in meters → shader focal plane. */
export function focusDistanceToBokehFocalDepth(distance, _camera, near, _far) {
  return viewDepthToBokehFocalDepth(distance, near, _far);
}
