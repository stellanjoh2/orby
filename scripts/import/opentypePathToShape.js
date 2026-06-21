import * as THREE from 'three';
import { SVGLoader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/loaders/SVGLoader.js';

/** Low curve sampling for glyph caps — fewer vertices → cleaner earcut triangulation. */
export const FONT_EXTRUDE_CURVE_DIVISIONS = 4;

/** TrueType / opentype outlines use nonzero winding — same as SVG default. */
const OPENTYPE_SHAPE_FILL_RULE = 'nonzero';

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
 * Build a {@link THREE.ShapePath} from opentype commands — same mapping as Three.js FontLoader.
 *
 * @param {Array<{ type: string, x?: number, y?: number, x1?: number, y1?: number, x2?: number, y2?: number }>} commands
 * @returns {THREE.ShapePath}
 */
export function commandsToShapePath(commands) {
  const shapePath = new THREE.ShapePath();
  let startX = 0;
  let startY = 0;

  for (const cmd of commands || []) {
    if (cmd.type === 'M') {
      startX = cmd.x;
      startY = cmd.y;
      shapePath.moveTo(cmd.x, cmd.y);
    } else if (cmd.type === 'L') {
      shapePath.lineTo(cmd.x, cmd.y);
    } else if (cmd.type === 'C') {
      shapePath.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
    } else if (cmd.type === 'Q') {
      shapePath.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
    } else if (cmd.type === 'Z') {
      shapePath.lineTo(startX, startY);
    }
  }

  return shapePath;
}

/**
 * Decompose a ShapePath into filled shapes — same scanline fill-rule logic as SVG extrude.
 *
 * @param {THREE.ShapePath} shapePath
 * @returns {THREE.Shape[]}
 */
function createShapesFromPath(shapePath) {
  shapePath.userData = shapePath.userData || {};
  shapePath.userData.style = {
    ...(shapePath.userData.style || {}),
    fillRule: OPENTYPE_SHAPE_FILL_RULE,
  };
  return SVGLoader.createShapes(shapePath);
}

/**
 * @param {THREE.Shape} shape
 * @returns {boolean}
 */
function shapeHasUsableOutline(shape) {
  return !!shape?.curves?.length;
}

/**
 * Sample each subpath to polylines, then decompose via SVGLoader.createShapes().
 *
 * @param {Array<{ type: string }>} commands
 * @param {number} divisions
 * @returns {THREE.Shape[]}
 */
function opentypePathToPolylineShapes(commands, divisions) {
  const subpaths = splitOpentypeSubpaths(commands);
  if (!subpaths.length) return [];

  const sampleDivisions = Math.max(4, Math.round(Number(divisions) || FONT_EXTRUDE_CURVE_DIVISIONS));
  const shapePath = new THREE.ShapePath();

  for (const cmds of subpaths) {
    const pts = commandsToThreePath(cmds).getPoints(sampleDivisions);
    if (pts.length < 3) continue;
    shapePath.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) {
      shapePath.lineTo(pts[i].x, pts[i].y);
    }
  }

  return createShapesFromPath(shapePath).filter(shapeHasUsableOutline);
}

/**
 * Convert an opentype.js glyph path to one or more THREE.Shape instances (outer + holes merged).
 * Uses SVGLoader.createShapes() — same fill-rule decomposition as SVG extrude (nonzero winding).
 *
 * @param {import('../vendor/opentype.module.js').Path} opentypePath
 * @param {number} [divisions]
 * @param {{ nativeCurves?: boolean }} [options] — default true; false = resampled polyline fallback
 * @returns {THREE.Shape[]}
 */
export function opentypePathToShapes(opentypePath, divisions = FONT_EXTRUDE_CURVE_DIVISIONS, options = {}) {
  const commands = opentypePath?.commands;
  if (!commands?.length) return [];

  if (options.nativeCurves === false) {
    return opentypePathToPolylineShapes(commands, divisions);
  }

  return createShapesFromPath(commandsToShapePath(commands)).filter(shapeHasUsableOutline);
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
