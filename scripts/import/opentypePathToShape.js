import * as THREE from 'three';

/** Low curve sampling for glyph caps — fewer vertices → cleaner earcut triangulation. */
export const FONT_EXTRUDE_CURVE_DIVISIONS = 4;

/** Side-wall curve segments passed to ExtrudeGeometry (Bezier stems along Z). */
export const FONT_EXTRUDE_SIDE_CURVE_SEGMENTS = 8;

/**
 * Split opentype path commands into closed subpaths (one per moveto).
 * @param {Array<{ type: string }>} commands
 * @returns {Array<Array<{ type: string }>>}
 */
export function splitOpentypeSubpaths(commands) {
  const subpaths = [];
  let current = [];
  for (const cmd of commands || []) {
    if (cmd.type === 'M') {
      if (current.length) subpaths.push(current);
      current = [cmd];
    } else if (current.length) {
      current.push(cmd);
    }
  }
  if (current.length) subpaths.push(current);
  return subpaths;
}

/**
 * @param {Array<{ type: string, x?: number, y?: number, x1?: number, y1?: number, x2?: number, y2?: number }>} commands
 * @returns {THREE.Path}
 */
export function commandsToThreePath(commands) {
  const path = new THREE.Path();
  let startX = 0;
  let startY = 0;
  for (const cmd of commands) {
    if (cmd.type === 'M') {
      startX = cmd.x;
      startY = cmd.y;
      path.moveTo(cmd.x, cmd.y);
    } else if (cmd.type === 'L') path.lineTo(cmd.x, cmd.y);
    else if (cmd.type === 'C') path.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
    else if (cmd.type === 'Q') path.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
    else if (cmd.type === 'Z') path.lineTo(startX, startY);
  }
  return path;
}

/**
 * @param {THREE.Vector2[]} points
 */
function signedArea2D(points) {
  if (!points?.length || points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum * 0.5;
}

function ringCentroid(points) {
  if (!points?.length) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/** Ray-cast point-in-polygon (even-odd). */
function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Rebuild a shape from {@link THREE.Shape#extractPoints} — straight segments only.
 * @param {THREE.Shape} shape
 * @param {number} divisions
 */
export function resampleShapeLinear(shape, divisions = FONT_EXTRUDE_CURVE_DIVISIONS) {
  const extracted = shape.extractPoints(divisions);
  const contour = extracted?.shape || [];
  if (contour.length < 3) return null;

  const rebuilt = new THREE.Shape();
  rebuilt.moveTo(contour[0].x, contour[0].y);
  for (let i = 1; i < contour.length; i += 1) {
    rebuilt.lineTo(contour[i].x, contour[i].y);
  }

  for (const holeRing of extracted?.holes || []) {
    if (!holeRing?.length || holeRing.length < 3) continue;
    const holePath = new THREE.Path();
    holePath.moveTo(holeRing[0].x, holeRing[0].y);
    for (let i = 1; i < holeRing.length; i += 1) {
      holePath.lineTo(holeRing[i].x, holeRing[i].y);
    }
    rebuilt.holes.push(holePath);
  }

  return rebuilt;
}

/**
 * Convert an opentype.js glyph path to one or more THREE.Shape instances (outer + holes merged).
 * @param {import('../vendor/opentype.module.js').Path} opentypePath
 * @param {number} [divisions]
 * @returns {THREE.Shape[]}
 */
export function opentypePathToShapes(opentypePath, divisions = FONT_EXTRUDE_CURVE_DIVISIONS) {
  if (!opentypePath?.commands?.length) return [];

  const subpaths = splitOpentypeSubpaths(opentypePath.commands);
  if (!subpaths.length) return [];

  const rings = subpaths
    .map((cmds) => {
      const path = commandsToThreePath(cmds);
      const pts = path.getPoints(divisions);
      return pts.length >= 3 ? pts : null;
    })
    .filter(Boolean);

  if (!rings.length) return [];

  const ranked = rings
    .map((pts) => ({ pts, area: Math.abs(signedArea2D(pts)) }))
    .sort((a, b) => b.area - a.area);

  const shapes = [];
  const used = new Set();

  for (let o = 0; o < ranked.length; o += 1) {
    if (used.has(o)) continue;
    const outerPts = ranked[o].pts;
    const shape = new THREE.Shape();
    shape.moveTo(outerPts[0].x, outerPts[0].y);
    for (let i = 1; i < outerPts.length; i += 1) {
      shape.lineTo(outerPts[i].x, outerPts[i].y);
    }
    used.add(o);

    for (let h = o + 1; h < ranked.length; h += 1) {
      if (used.has(h)) continue;
      const holePts = ranked[h].pts;
      const centroid = ringCentroid(holePts);
      if (!pointInRing(centroid, outerPts)) continue;
      const holePath = new THREE.Path();
      holePath.moveTo(holePts[0].x, holePts[0].y);
      for (let i = 1; i < holePts.length; i += 1) {
        holePath.lineTo(holePts[i].x, holePts[i].y);
      }
      shape.holes.push(holePath);
      used.add(h);
    }

    const resampled = resampleShapeLinear(shape, divisions);
    if (resampled) shapes.push(resampled);
  }

  return shapes;
}

/**
 * @param {import('../vendor/opentype.module.js').Path} opentypePath
 */
export function opentypePathHasArea(opentypePath) {
  const box = opentypePath?.getBoundingBox?.();
  if (!box) return false;
  const w = (box.x2 ?? 0) - (box.x1 ?? 0);
  const h = (box.y2 ?? 0) - (box.y1 ?? 0);
  return w > 0.5 && h > 0.5;
}
