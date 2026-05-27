import * as THREE from 'three';
import { computeSunAnchorWorld } from '../GodRaysEffect.js';

/** Key directional base XZ offset — matches {@link LightsController} defaults. */
const KEY_BASE_X = 5;
const KEY_BASE_Z = 5;
const KEY_HORIZONTAL = Math.hypot(KEY_BASE_X, KEY_BASE_Z);

/**
 * Map lens-flare azimuth/elevation (same convention as God Rays / {@link computeSunAnchorWorld})
 * to 3-point key-light `rotate` (degrees, individual) and `height` (world Y).
 *
 * @param {number} lensRotationDeg
 * @param {number} lensHeightDeg - elevation 0–90
 * @param {number} [globalLightsRotationDeg] - rig master rotation
 * @returns {{ rotate: number, height: number }}
 */
export function keyLightParamsFromLensFlare(
  lensRotationDeg,
  lensHeightDeg,
  globalLightsRotationDeg = 0,
) {
  const sun = computeSunAnchorWorld(lensRotationDeg, lensHeightDeg, 1);
  const targetAzimuth = Math.atan2(sun.x, sun.z);

  const globalRad = THREE.MathUtils.degToRad(globalLightsRotationDeg ?? 0);
  const baseAzimuth = Math.atan2(
    KEY_BASE_X * Math.cos(globalRad) + KEY_BASE_Z * Math.sin(globalRad),
    -KEY_BASE_X * Math.sin(globalRad) + KEY_BASE_Z * Math.cos(globalRad),
  );

  let rotate = THREE.MathUtils.radToDeg(targetAzimuth - baseAzimuth);
  rotate = ((rotate % 360) + 360) % 360;

  const elevationRad = THREE.MathUtils.degToRad(
    THREE.MathUtils.clamp(lensHeightDeg ?? 0, 0, 90),
  );
  const height = THREE.MathUtils.clamp(
    KEY_HORIZONTAL * Math.tan(elevationRad),
    0,
    10,
  );

  return { rotate, height };
}
