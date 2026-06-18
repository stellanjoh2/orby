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

const _viewAxisPoint = new THREE.Vector3();
const _boxCorner = new THREE.Vector3();

const BOX_CORNER_SIGNS = [
  [-1, -1, -1],
  [-1, -1, 1],
  [-1, 1, -1],
  [-1, 1, 1],
  [1, -1, -1],
  [1, -1, 1],
  [1, 1, -1],
  [1, 1, 1],
];

/**
 * View-depth extent (m) of a spherical model bounds — used to scale DOF falloff with subject size.
 * @param {import('three').Camera | null | undefined} camera
 * @param {{ center?: import('three').Vector3, radius?: number } | null | undefined} bounds
 * @returns {number | null}
 */
export function computeModelViewDepthSpan(camera, bounds) {
  if (!camera || !bounds?.center || !Number.isFinite(bounds.radius)) return null;
  const r = Math.max(bounds.radius, 0.01);
  const cx = bounds.center.x;
  const cy = bounds.center.y;
  const cz = bounds.center.z;
  let minD = Infinity;
  let maxD = -Infinity;

  for (let i = 0; i < BOX_CORNER_SIGNS.length; i++) {
    const s = BOX_CORNER_SIGNS[i];
    _boxCorner.set(cx + s[0] * r, cy + s[1] * r, cz + s[2] * r);
    const d = worldPointToViewDepth(_boxCorner, camera);
    if (d < minD) minD = d;
    if (d > maxD) maxD = d;
  }

  const span = maxD - minD;
  return span > 1e-4 ? span : null;
}

/**
 * CoC falloff distance (m) for near/far ramps — scales with subject depth so DOF matches at any mesh scale.
 * Tuned so ~90% CoC is reached within one subject depth span (heavy blur on the mesh, not only the background).
 * @param {number} focalDepth
 * @param {number | null | undefined} modelViewDepthSpan
 * @returns {number}
 */
export function resolveDofCocFalloffDistance(focalDepth, modelViewDepthSpan) {
  const focusM = Math.max(0.2, focalDepth);
  const focusFalloff = Math.max(0.65, focusM * 0.42) * 8.0;
  if (typeof modelViewDepthSpan !== 'number' || modelViewDepthSpan <= 0.05) {
    return focusFalloff;
  }
  // span / (0.62 * -ln(0.12)) ≈ 0.40 — full blur within the subject volume.
  const modelFalloff = modelViewDepthSpan * 0.4;
  return Math.max(modelFalloff, focusM * 0.2);
}

/** World point on the camera optical axis at the given view depth (m). */
export function viewDepthToWorldPointOnAxis(viewDepth, camera, target = new THREE.Vector3()) {
  const depth = Math.max(0, viewDepth);
  _viewAxisPoint.set(0, 0, -depth);
  return target.copy(_viewAxisPoint).applyMatrix4(camera.matrixWorld);
}

/** Frustum width/height (m) at a view depth — for focal-plane debug overlays. */
export function viewDepthPlaneExtents(viewDepth, camera) {
  const depth = Math.max(0, viewDepth);
  const vFovRad = THREE.MathUtils.degToRad(camera.fov);
  const height = 2 * Math.tan(vFovRad * 0.5) * depth;
  const width = height * Math.max(0.25, camera.aspect);
  return { width, height };
}
