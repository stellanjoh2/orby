/** Default orbit camera pose (matches SceneManager bootstrap). */
export const DEFAULT_CAMERA_POSITION = Object.freeze({ x: 0, y: 1.5, z: 6 });
export const DEFAULT_CAMERA_TARGET = Object.freeze({ x: 0, y: 1, z: 0 });

export function cameraDistanceBetween(position, target) {
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function defaultCameraDistance() {
  return cameraDistanceBetween(DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET);
}
