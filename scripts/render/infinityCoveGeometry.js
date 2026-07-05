import * as THREE from 'three';
import { mergeVertices } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/utils/BufferGeometryUtils.js';

/** Default flat stage radius — matches Studio backdrop width default (2). */
export const INFINITY_COVE_DEFAULT_FLOOR_RADIUS = 2;
/** Quarter-circle bend radius — same as Studio cyclorama curve. */
export const INFINITY_COVE_CURVE_RADIUS = 1.4;
/** Vertical wall height above the bend. */
export const INFINITY_COVE_WALL_HEIGHT = 4;

/**
 * Classic infinity cove — flat circular floor, quarter-circle bend, 90° cylindrical wall.
 * Revolved around Y (top view: circle). Floor top sits at y = 0 for asset placement / snap.
 *
 * @param {object} [options]
 * @param {number} [options.floorRadius=2] — radius of the flat stage disk
 * @param {number} [options.wallHeight=4]
 * @param {number} [options.curveRadius=1.4]
 * @param {number} [options.radialSegments=72]
 * @param {number} [options.curveSegments=56]
 * @param {number} [options.wallSegments=8]
 */
export function createInfinityCoveGeometry({
  floorRadius = INFINITY_COVE_DEFAULT_FLOOR_RADIUS,
  wallHeight = INFINITY_COVE_WALL_HEIGHT,
  curveRadius = INFINITY_COVE_CURVE_RADIUS,
  radialSegments = 72,
  curveSegments = 56,
  wallSegments = 8,
} = {}) {
  const profile = [];
  const floorR = Math.max(0, floorRadius);
  const curveR = Math.max(0.01, curveRadius);
  const wallH = Math.max(0.01, wallHeight);

  profile.push(new THREE.Vector2(0, 0));
  if (floorR > 0) {
    profile.push(new THREE.Vector2(floorR, 0));
  }

  const cx = floorR;
  const cy = curveR;
  const cSegs = Math.max(16, Math.floor(curveSegments));
  for (let i = 1; i <= cSegs; i += 1) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / cSegs);
    profile.push(new THREE.Vector2(
      cx + curveR * Math.cos(a),
      cy + curveR * Math.sin(a),
    ));
  }

  const wallR = floorR + curveR;
  const wSegs = Math.max(2, Math.floor(wallSegments));
  for (let i = 1; i <= wSegs; i += 1) {
    const t = i / wSegs;
    profile.push(new THREE.Vector2(wallR, curveR + wallH * t));
  }

  const lathe = new THREE.LatheGeometry(profile, Math.max(24, Math.floor(radialSegments)));
  // Weld the duplicate meridian (u=0 / u=1) so the revolve seam is invisible.
  const geo = mergeVertices(lathe, 1e-4);
  lathe.dispose();
  geo.computeVertexNormals();
  return geo;
}
