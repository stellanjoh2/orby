import * as THREE from 'three';

/** Elevation (° above ground) → OrbitControls polar angle φ (from +Y). */
export function elevationDegToPolarRad(elevationDeg) {
  const elev = THREE.MathUtils.degToRad(
    THREE.MathUtils.clamp(Number(elevationDeg) || 0, 1, 89),
  );
  return Math.PI / 2 - elev;
}

export function polarRadToElevationDeg(phiRad) {
  const phi = THREE.MathUtils.clamp(Number(phiRad) || 0, 1e-4, Math.PI - 1e-4);
  return THREE.MathUtils.radToDeg(Math.PI / 2 - phi);
}

/**
 * Position camera on a sphere around `target` from azimuth (°) and elevation (°).
 */
export function setCameraOrbitFromAngles(
  camera,
  target,
  distance,
  horizontalDeg,
  elevationDeg,
) {
  if (!camera || !target) return;
  const dist = Math.max(0.25, Number(distance) || 5);
  const theta = THREE.MathUtils.degToRad(Number(horizontalDeg) || 0);
  const phi = elevationDegToPolarRad(elevationDeg);
  const offset = new THREE.Vector3().setFromSphericalCoords(dist, phi, theta);
  camera.position.copy(target).add(offset);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
}

export function readOrbitAnglesFromCamera(camera, target) {
  if (!camera || !target) {
    return { horizontalDeg: 45, verticalDeg: 35.264 };
  }
  const offset = new THREE.Vector3().subVectors(camera.position, target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  return {
    horizontalDeg: THREE.MathUtils.radToDeg(spherical.theta),
    verticalDeg: polarRadToElevationDeg(spherical.phi),
  };
}
