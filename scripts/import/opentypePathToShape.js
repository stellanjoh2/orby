import * as THREE from 'three';
import { ShapeUtils } from 'three';

/** Curve sampling for shape-path extraction / hole winding tests. */
export const FONT_EXTRUDE_CURVE_DIVISIONS = 4;
/** Winding tests need more samples than cap divisions or Earcut gets the wrong hole. */
const FONT_EXTRUDE_WINDING_DIVISIONS = 16;

function windingSampleDivisions(divisions) {
  return Math.max(
    FONT_EXTRUDE_WINDING_DIVISIONS,
    Math.round(Number(divisions) || FONT_EXTRUDE_WINDING_DIVISIONS),
  );
}

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

/** Non-zero winding — reliable for C-shaped outer rings (e, a). */
function windingNumber2D(point, pts) {
  let wn = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a.y <= point.y) {
      if (b.y > point.y) {
        const cross = (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y);
        if (cross > 0) wn += 1;
      }
    } else if (b.y <= point.y) {
      const cross = (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y);
      if (cross < 0) wn -= 1;
    }
  }
  return wn;
}

function pointInsideOuterRing(point, ring) {
  return windingNumber2D(point, ring) !== 0;
}

/**
 * Ensure each hole winds opposite the outer contour for Earcut.
 * Mutates hole paths in place — preserves native Bézier outer curves.
 *
 * @param {THREE.Shape} shape
 * @param {number} divisions
 */
export function normalizeFontShapeHoles(shape, divisions) {
  if (!shape?.holes?.length) return shape;
  const sampleDivisions = windingSampleDivisions(divisions);
  const extracted = shape.extractPoints(sampleDivisions);
  const outer = extracted?.shape;
  if (!outer?.length) return shape;
  const outerCW = ShapeUtils.isClockWise(outer);
  for (let i = 0; i < shape.holes.length; i += 1) {
    const holePts = extracted.holes?.[i];
    if (!holePts?.length) continue;
    if (ShapeUtils.isClockWise(holePts) === outerCW) {
      const reversed = new THREE.Path();
      const last = holePts[holePts.length - 1];
      reversed.moveTo(last.x, last.y);
      for (let j = holePts.length - 2; j >= 0; j -= 1) {
        reversed.lineTo(holePts[j].x, holePts[j].y);
      }
      shape.holes[i] = reversed;
    }
  }
  return shape;
}

/**
 * @param {THREE.Shape} shape
 * @param {number} divisions
 * @returns {THREE.Shape | null}
 */
export function prepareFontExtrudeShape(shape, divisions = FONT_EXTRUDE_CURVE_DIVISIONS) {
  if (!shape?.curves?.length) return null;
  return normalizeFontShapeHoles(shape, divisions);
}

/**
 * Reverse hole winding only — keep outer contour curves (TextGeometry-style).
 *
 * @param {THREE.Shape} shape
 * @param {number} divisions
 * @returns {THREE.Shape}
 */
export function flipFontShapeHoles(shape, divisions = FONT_EXTRUDE_CURVE_DIVISIONS) {
  if (!shape?.holes?.length) return shape;
  const sampleDivisions = windingSampleDivisions(divisions);
  const extracted = shape.extractPoints(sampleDivisions);
  const outer = extracted?.shape;
  if (!outer?.length) return shape;
  const outerCW = ShapeUtils.isClockWise(outer);

  for (let i = 0; i < shape.holes.length; i += 1) {
    const holePts = extracted.holes?.[i];
    if (!holePts?.length || holePts.length < 3) continue;
    if (ShapeUtils.isClockWise(holePts) !== outerCW) continue;

    const holePath = new THREE.Path();
    holePath.moveTo(holePts[holePts.length - 1].x, holePts[holePts.length - 1].y);
    for (let j = holePts.length - 2; j >= 0; j -= 1) {
      holePath.lineTo(holePts[j].x, holePts[j].y);
    }
    shape.holes[i] = holePath;
  }

  return shape;
}

/** @deprecated Internal polyline rebuild — used only by resample fallback paths. */
function flipFontShapeHolesPolylineRebuild(shape, divisions = FONT_EXTRUDE_CURVE_DIVISIONS) {
  if (!shape?.holes?.length) return shape;
  const sampleDivisions = windingSampleDivisions(divisions);
  const extracted = shape.extractPoints(sampleDivisions);
  const outer = extracted?.shape;
  if (!outer?.length) return shape;
  const rebuilt = new THREE.Shape();
  rebuilt.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i += 1) {
    rebuilt.lineTo(outer[i].x, outer[i].y);
  }
  for (const holeRing of extracted.holes || []) {
    if (!holeRing?.length || holeRing.length < 3) continue;
    const holePath = new THREE.Path();
    holePath.moveTo(holeRing[holeRing.length - 1].x, holeRing[holeRing.length - 1].y);
    for (let i = holeRing.length - 2; i >= 0; i -= 1) {
      holePath.lineTo(holeRing[i].x, holeRing[i].y);
    }
    rebuilt.holes.push(holePath);
  }
  return normalizeFontShapeHoles(rebuilt, sampleDivisions);
}

/**
 * Build a {@link THREE.ShapePath} from opentype commands (FontLoader mapping).
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
 * Rebuild a shape from {@link THREE.Shape#extractPoints} — straight segments only.
 * @param {THREE.Shape} shape
 * @param {number} divisions
 */
export function resampleShapeLinear(shape, divisions = FONT_EXTRUDE_CURVE_DIVISIONS) {
  const sampleDivisions = windingSampleDivisions(divisions);
  normalizeFontShapeHoles(shape, sampleDivisions);
  const extracted = shape.extractPoints(sampleDivisions);
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

  return normalizeFontShapeHoles(rebuilt, sampleDivisions);
}

/** Min chord-enclosed area (font units²) to qualify as a counter loop. */
const IMPLICIT_COUNTER_MIN_CHORD_AREA = 120;
/** Counter loop area must stay smaller than this fraction of the full outline. */
const IMPLICIT_COUNTER_MAX_CHORD_RATIO = 0.35;
const DUPLICATE_VERTEX_EPS = 0.01;

/**
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 */
function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * TrueType paths mark branch points with consecutive duplicate vertices.
 *
 * @param {{ x: number, y: number }[]} verts
 * @param {number} index
 */
function isDuplicateClosure(verts, index) {
  return index > 0 && dist2D(verts[index], verts[index - 1]) < DUPLICATE_VERTEX_EPS;
}

/**
 * @param {{ x: number, y: number }[]} verts
 * @param {number} start
 * @param {number} end
 */
function chordAreaFromRange(verts, start, end) {
  if (end - start < 2) return 0;
  const slice = verts.slice(start, end + 1);
  return Math.abs(signedArea2D(slice));
}

/**
 * @param {Array<{ type: string, x?: number, y?: number }>} commands
 */
function commandEndVertices(commands) {
  const verts = [];
  const cmdIndices = [];
  for (let ci = 0; ci < commands.length; ci += 1) {
    const cmd = commands[ci];
    if (cmd.type === 'Z') continue;
    verts.push({ x: cmd.x, y: cmd.y });
    cmdIndices.push(ci);
  }
  return { verts, cmdIndices };
}

/**
 * @param {{ x: number, y: number }[]} chordVerts
 * @param {{ x: number, y: number }[]} fullPts
 */
function chordHasWindingZeroPocket(chordVerts, fullPts) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of chordVerts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  for (let sx = 1; sx < 4; sx += 1) {
    for (let sy = 1; sy < 4; sy += 1) {
      const point = {
        x: minX + ((maxX - minX) * sx) / 4,
        y: minY + ((maxY - minY) * sy) / 4,
      };
      if (pointInRing(point, chordVerts) && windingNumber2D(point, fullPts) === 0) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Glyphs like 2/3/8 use one moveto with counters via nonzero winding — not separate subpaths.
 * Find branch-to-branch loops between duplicate-point markers (TrueType convention).
 *
 * @param {Array<{ type: string, x?: number, y?: number }>} commands
 * @returns {Array<{ start: number, end: number, cmdStart: number, cmdEnd: number, area: number }>}
 */
function findImplicitCounterBranchLoops(commands) {
  const { verts, cmdIndices } = commandEndVertices(commands);
  if (verts.length < 6) return [];

  const totalArea = Math.abs(signedArea2D(verts));
  if (totalArea <= 1e-6) return [];

  const loops = [];
  for (let start = 1; start < verts.length - 3; start += 1) {
    if (!isDuplicateClosure(verts, start)) continue;
    for (let end = start + 2; end < verts.length; end += 1) {
      if (!isDuplicateClosure(verts, end)) continue;
      const chordVerts = verts.slice(start, end + 1);
      const area = chordAreaFromRange(verts, start, end);
      if (area < IMPLICIT_COUNTER_MIN_CHORD_AREA) continue;
      if (area / totalArea > IMPLICIT_COUNTER_MAX_CHORD_RATIO) continue;
      if (!chordHasWindingZeroPocket(chordVerts, verts)) continue;
      loops.push({
        start,
        end,
        cmdStart: cmdIndices[start],
        cmdEnd: cmdIndices[end],
        area,
      });
    }
  }

  return loops;
}

/**
 * Prefer the tightest valid loop per region — avoids swallowing adjacent counters.
 *
 * @param {Array<{ start: number, end: number, cmdStart: number, cmdEnd: number, area: number }>} loops
 */
function selectNonOverlappingCounterLoops(loops) {
  const ranked = [...loops].sort((a, b) => a.area - b.area);
  const selected = [];
  const used = new Set();

  for (const loop of ranked) {
    let overlap = false;
    for (let i = loop.start; i <= loop.end; i += 1) {
      if (used.has(i)) {
        overlap = true;
        break;
      }
    }
    if (overlap) continue;
    for (let i = loop.start; i <= loop.end; i += 1) used.add(i);
    selected.push(loop);
  }

  return selected.sort((a, b) => a.start - b.start);
}

/**
 * First counter that closes back to the path origin (spine split at duplicate closure).
 *
 * @param {Array<{ type: string, x?: number, y?: number }>} commands
 * @returns {{ end: number, cmdEnd: number } | null}
 */
function findOriginCounterSplit(commands) {
  const { verts, cmdIndices } = commandEndVertices(commands);
  if (verts.length < 6) return null;

  const totalArea = Math.abs(signedArea2D(verts));
  if (totalArea <= 1e-6) return null;

  const minRatio = 0.08;

  for (let end = 2; end < verts.length - 1; end += 1) {
    if (!isDuplicateClosure(verts, end)) continue;
    const area = chordAreaFromRange(verts, 0, end);
    if (area < IMPLICIT_COUNTER_MIN_CHORD_AREA) continue;
    if (area / totalArea > IMPLICIT_COUNTER_MAX_CHORD_RATIO) continue;
    if (area / totalArea < minRatio) continue;
    if (!chordHasWindingZeroPocket(verts.slice(0, end + 1), verts)) continue;
    return { end, cmdEnd: cmdIndices[end] };
  }

  return null;
}

/**
 * @param {Array<{ type: string, x?: number, y?: number }>} commands
 * @param {Array<{ start: number, end: number, cmdStart: number, cmdEnd: number, area: number }>} loops
 * @returns {Array<{ start: number, end: number, cmdStart: number, cmdEnd: number, area: number }>}
 */
function buildOuterCommandsWithoutCounterExcursions(commands, loops) {
  let outerCmds = commands.slice();
  const sorted = [...loops].sort((a, b) => b.cmdStart - a.cmdStart);
  for (const loop of sorted) {
    outerCmds = outerCmds.slice(0, loop.cmdStart).concat(outerCmds.slice(loop.cmdEnd + 1));
  }
  return outerCmds;
}

/**
 * @param {Array<{ type: string, x?: number, y?: number }>} holeCmds
 * @param {boolean} closeLoop
 * @returns {THREE.Path}
 */
function buildCounterHolePath(holeCmds, closeLoop = false) {
  const holePath = commandsToThreePath(holeCmds);
  if (closeLoop) {
    const { verts } = commandEndVertices(holeCmds);
    if (verts.length >= 2) {
      holePath.lineTo(verts[0].x, verts[0].y);
    }
  }
  return holePath;
}

/**
 * @param {Array<{ type: string, x?: number, y?: number }>} commands
 * @param {number} divisions
 * @returns {THREE.Shape | null}
 */
function buildShapeWithImplicitCounters(commands, divisions) {
  const branchLoops = selectNonOverlappingCounterLoops(findImplicitCounterBranchLoops(commands));
  const originSplit = findOriginCounterSplit(commands);
  if (!originSplit && !branchLoops.length) return null;

  const sampleDivisions = Math.max(4, Math.round(Number(divisions) || FONT_EXTRUDE_CURVE_DIVISIONS));
  const shape = pathToShape(commandsToThreePath(
    originSplit
      ? (() => {
        const splitCmd = commands[originSplit.cmdEnd];
        return [
          { type: 'M', x: splitCmd.x, y: splitCmd.y },
          ...commands.slice(originSplit.cmdEnd + 1),
        ];
      })()
      : buildOuterCommandsWithoutCounterExcursions(commands, branchLoops),
  ));

  const outerPts = shape.extractPoints(sampleDivisions)?.shape || [];
  if (outerPts.length < 3) return null;

  const addHole = (holeCmds, closeLoop) => {
    const holePath = buildCounterHolePath(holeCmds, closeLoop);
    const holePts = holePath.getPoints(sampleDivisions);
    if (holePts.length < 3) return;
    if (!pointInsideOuterRing(ringCentroid(holePts), outerPts)) return;
    shape.holes.push(clonePath(holePath));
  };

  if (originSplit) {
    addHole(commands.slice(0, originSplit.cmdEnd + 1), false);
  }

  for (const loop of branchLoops) {
    if (originSplit && loop.start <= originSplit.end) continue;
    addHole(commands.slice(loop.cmdStart, loop.cmdEnd + 1), true);
  }

  return shape.holes.length ? shape : null;
}

/**
 * @param {THREE.Path} path
 * @returns {THREE.Shape}
 */
function pathToShape(path) {
  const shape = new THREE.Shape();
  for (const curve of path.curves) {
    shape.curves.push(curve.clone());
  }
  return shape;
}

/**
 * @param {THREE.Path} path
 * @returns {THREE.Path}
 */
function clonePath(path) {
  const cloned = new THREE.Path();
  for (const curve of path.curves) {
    cloned.curves.push(curve.clone());
  }
  return cloned;
}

/**
 * @param {Array<Array<{ type: string }>>} subpaths
 * @param {number} divisions — used only for area / hole containment tests
 * @returns {THREE.Shape[]}
 */
function buildNativeCurveShapes(subpaths, divisions) {
  const sampleDivisions = Math.max(4, Math.round(Number(divisions) || FONT_EXTRUDE_CURVE_DIVISIONS));
  const rings = subpaths
    .map((cmds) => {
      const path = commandsToThreePath(cmds);
      const pts = path.getPoints(sampleDivisions);
      if (pts.length < 3) return null;
      return { path, pts, area: Math.abs(signedArea2D(pts)) };
    })
    .filter(Boolean);

  if (!rings.length) return [];

  rings.sort((a, b) => b.area - a.area);
  const shapes = [];
  const used = new Set();

  for (let o = 0; o < rings.length; o += 1) {
    if (used.has(o)) continue;
    const { path: outerPath, pts: outerPts } = rings[o];
    const shape = pathToShape(outerPath);
    used.add(o);

    for (let h = o + 1; h < rings.length; h += 1) {
      if (used.has(h)) continue;
      const { path: holePath, pts: holePts } = rings[h];
      const centroid = ringCentroid(holePts);
      if (!pointInsideOuterRing(centroid, outerPts)) continue;
      shape.holes.push(clonePath(holePath));
      used.add(h);
    }

    shapes.push(shape);
  }

  return shapes;
}

/**
 * Convert an opentype.js glyph path to one or more THREE.Shape instances (outer + holes merged).
 * Uses {@link THREE.ShapePath#toShapes} with even-odd fill (TextGeometry path) — not SVGLoader nonzero.
 *
 * @param {import('../vendor/opentype.module.js').Path} opentypePath
 * @param {number} [divisions]
 * @param {{ nativeCurves?: boolean }} [options] — keep beziers; split implicit counters (2, 3, …)
 * @returns {THREE.Shape[]}
 */
export function opentypePathToShapes(opentypePath, divisions = FONT_EXTRUDE_CURVE_DIVISIONS, options = {}) {
  if (!opentypePath?.commands?.length) return [];

  const subpaths = splitOpentypeSubpaths(opentypePath.commands);
  if (!subpaths.length) return [];

  if (options.nativeCurves) {
    if (subpaths.length === 1) {
      const implicitCounters = buildShapeWithImplicitCounters(subpaths[0], divisions);
      if (implicitCounters) return [implicitCounters];
    }
    return buildNativeCurveShapes(subpaths, divisions);
  }

  // Primary: even-odd native Bézier shapes (TextGeometry) — do not resample to polylines;
  // resampleShapeLinear breaks holed cap triangulation (e, a, …) especially with inset bevel.
  const evenOddShapes = commandsToShapePath(opentypePath.commands)
    .toShapes(true)
    .map((shape) => prepareFontExtrudeShape(shape, divisions))
    .filter(Boolean);
  if (evenOddShapes.length) return evenOddShapes;

  const sampleDivisions = windingSampleDivisions(divisions);

  const rings = subpaths
    .map((cmds) => {
      const path = commandsToThreePath(cmds);
      const pts = path.getPoints(sampleDivisions);
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
      if (!pointInsideOuterRing(centroid, outerPts)) continue;
      const holePath = new THREE.Path();
      holePath.moveTo(holePts[0].x, holePts[0].y);
      for (let i = 1; i < holePts.length; i += 1) {
        holePath.lineTo(holePts[i].x, holePts[i].y);
      }
      shape.holes.push(holePath);
      used.add(h);
    }

    const resampled = resampleShapeLinear(shape, sampleDivisions);
    if (resampled) shapes.push(resampled);
  }

  if (!shapes.length && subpaths.length === 1) {
    const implicitCounters = buildShapeWithImplicitCounters(subpaths[0], divisions);
    if (implicitCounters) {
      const resampled = resampleShapeLinear(implicitCounters, divisions);
      if (resampled) shapes.push(resampled);
    }
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
