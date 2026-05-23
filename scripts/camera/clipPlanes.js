import * as THREE from 'three';

const _viewPos = new THREE.Vector3();
const _box = new THREE.Box3();
const _corners = Array.from({ length: 8 }, () => new THREE.Vector3());

/** Max far/near ratio — tighter ranges reduce SSAO banding on large flat surfaces. */
const MAX_CLIP_RATIO = 2000;

function fillBoxCorners(box, corners) {
  const { min, max } = box;
  corners[0].set(min.x, min.y, min.z);
  corners[1].set(min.x, min.y, max.z);
  corners[2].set(min.x, max.y, min.z);
  corners[3].set(min.x, max.y, max.z);
  corners[4].set(max.x, min.y, min.z);
  corners[5].set(max.x, min.y, max.z);
  corners[6].set(max.x, max.y, min.z);
  corners[7].set(max.x, max.y, max.z);
}

function pushViewDepths(camera, points, depths) {
  const viewMatrix = camera.matrixWorldInverse;
  for (let i = 0; i < points.length; i += 1) {
    _viewPos.copy(points[i]).applyMatrix4(viewMatrix);
    const depth = -_viewPos.z;
    if (depth > 1e-4) depths.push(depth);
  }
}

function fallbackClipPlanes(camera, target) {
  const distance = target
    ? camera.position.distanceTo(target)
    : Math.max(1, camera.position.length());
  const near = Math.max(0.01, distance / 200);
  let far = Math.max(distance * 50, near + 1);
  if (far / near > MAX_CLIP_RATIO) far = near * MAX_CLIP_RATIO;
  return { near, far };
}

/**
 * Fit near/far clip planes to scene content (model + optional backdrop).
 * Utility for manual tuning — not applied automatically; default camera uses fixed near/far.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {{ modelBounds?: { box: THREE.Box3 } | null, backdropMesh?: THREE.Object3D | null, backdropBoundsBox?: THREE.Box3 | null, target?: THREE.Vector3 | null }} [options]
 */
export function computeAutoClipPlanes(camera, options = {}) {
  const {
    modelBounds = null,
    backdropMesh = null,
    backdropBoundsBox = null,
    target = null,
  } = options;
  const depths = [];

  if (modelBounds?.box && !modelBounds.box.isEmpty()) {
    fillBoxCorners(modelBounds.box, _corners);
    pushViewDepths(camera, _corners, depths);
  }

  const backdropBox =
    backdropBoundsBox && !backdropBoundsBox.isEmpty()
      ? backdropBoundsBox
      : null;
  if (backdropBox) {
    fillBoxCorners(backdropBox, _corners);
    pushViewDepths(camera, _corners, depths);
  } else if (backdropMesh) {
    _box.setFromObject(backdropMesh);
    if (!_box.isEmpty()) {
      fillBoxCorners(_box, _corners);
      pushViewDepths(camera, _corners, depths);
    }
  }

  if (target) {
    pushViewDepths(camera, [target], depths);
  }

  if (depths.length === 0) {
    return fallbackClipPlanes(camera, target);
  }

  let minD = Math.min(...depths);
  let maxD = Math.max(...depths);
  const span = Math.max(maxD - minD, 0.01);
  const pad = Math.max(span * 0.03, 0.05);

  let near = Math.max(0.001, minD - pad);
  let far = maxD + pad;
  if (far - near < 0.1) far = near + 0.1;
  if (far / near > MAX_CLIP_RATIO) far = near * MAX_CLIP_RATIO;

  return { near, far };
}

export function sanitizeClipPlanes(raw, fallback = {}) {
  const nearRaw = Number(raw?.near ?? fallback.near ?? 0.1);
  const farRaw = Number(raw?.far ?? fallback.far ?? 100);
  let near = Number.isFinite(nearRaw) ? Math.max(0.001, nearRaw) : 0.1;
  let far = Number.isFinite(farRaw) ? Math.max(0.1, farRaw) : 100;
  if (far <= near) far = near + 0.1;
  if (far / near > MAX_CLIP_RATIO) far = near * MAX_CLIP_RATIO;
  return {
    manual: !!raw?.manual,
    near,
    far,
  };
}
