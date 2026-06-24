import { opentypePathHasArea } from '../import/opentypePathToShape.js';

/** @typedef {'auto' | 'manual'} FontCircularWrapMode */

export const DEFAULT_FONT_CIRCULAR_WRAP_ENABLED = false;
export const DEFAULT_FONT_CIRCULAR_WRAP_MODE = 'auto';
export const DEFAULT_FONT_CIRCULAR_WRAP_ARC_DEG = 360;
export const MIN_FONT_CIRCULAR_WRAP_ARC_DEG = 30;
export const MAX_FONT_CIRCULAR_WRAP_ARC_DEG = 360;

const FULL_CIRCLE_RAD = Math.PI * 2;
const TOP_ANGLE_RAD = -Math.PI / 2;

/** @param {unknown} value @returns {boolean} */
export function normalizeFontCircularWrapEnabled(value) {
  return !!value;
}

/** @param {unknown} value @returns {FontCircularWrapMode} */
export function normalizeFontCircularWrapMode(value) {
  return value === 'manual' ? 'manual' : 'auto';
}

/** @param {unknown} value @returns {number} */
export function clampFontCircularWrapArcDeg(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_FONT_CIRCULAR_WRAP_ARC_DEG;
  return Math.max(
    MIN_FONT_CIRCULAR_WRAP_ARC_DEG,
    Math.min(MAX_FONT_CIRCULAR_WRAP_ARC_DEG, Math.round(numeric)),
  );
}

/**
 * @param {number} totalArcLength
 * @param {FontCircularWrapMode} mode
 * @param {number} manualArcDeg
 */
export function computeCircularWrapRadius(totalArcLength, mode, manualArcDeg) {
  const safeLength = Math.max(Number(totalArcLength) || 0, 1);
  const arcDeg = mode === 'auto' ? 360 : clampFontCircularWrapArcDeg(manualArcDeg);
  const arcSpanRad = (arcDeg / 180) * Math.PI;
  return {
    radius: safeLength / Math.max(arcSpanRad, 0.01),
    arcSpanRad,
    arcSpanDeg: arcDeg,
  };
}

/**
 * Angle on the ring for a glyph center (arc length reversed so string reads left-to-right outside).
 */
export function computeCircularGlyphAngleRad(
  centerArcLength,
  radius,
  mode,
  arcSpanRad,
  totalArcLength,
) {
  const safeRadius = Math.max(Number(radius) || 0, 1);
  const placementArcLength = Math.max(Number(totalArcLength) || 0, 0) - centerArcLength;
  const startAngle =
    mode === 'auto' || arcSpanRad >= FULL_CIRCLE_RAD - 1e-6
      ? TOP_ANGLE_RAD
      : TOP_ANGLE_RAD - arcSpanRad * 0.5;
  return startAngle + placementArcLength / safeRadius;
}

/**
 * @typedef {Object} FontCircularSegmentInput
 * @property {import('../vendor/opentype.module.js').Glyph} glyph
 * @property {number} x
 * @property {number} wordIndex
 */

/**
 * @typedef {Object} FontCircularMeasuredSegment
 * @property {import('../vendor/opentype.module.js').Glyph} glyph
 * @property {number} wordIndex
 * @property {number} advance
 * @property {number} centerArcLength
 * @property {number} baselineY
 */

/**
 * @param {FontCircularSegmentInput[]} segments
 * @param {import('../vendor/opentype.module.js').Font} font
 * @param {number} fontSize
 * @param {number} baselineY
 * @param {(glyph: import('../vendor/opentype.module.js').Glyph, font: import('../vendor/opentype.module.js').Font, fontSize: number, tracking: number) => number} glyphAdvance
 * @param {number} tracking
 * @returns {FontCircularMeasuredSegment[]}
 */
export function measureCircularSegments(
  segments,
  font,
  fontSize,
  baselineY,
  glyphAdvance,
  tracking,
) {
  /** @type {FontCircularMeasuredSegment[]} */
  const measured = [];
  if (!segments.length) return measured;

  const lineOriginX = segments[0].x;
  let maxEnd = 0;

  for (let i = 0; i < segments.length; i += 1) {
    const { glyph, wordIndex, x } = segments[i];
    const advance = Math.max(glyphAdvance(glyph, font, fontSize, tracking), fontSize * 0.02);
    const centerArcLength = x - lineOriginX + advance * 0.5;
    measured.push({
      glyph,
      wordIndex,
      advance,
      centerArcLength,
      baselineY,
    });
    maxEnd = Math.max(maxEnd, x - lineOriginX + advance);
  }

  return measured;
}

/**
 * Total arc length for a measured circular line.
 * @param {FontCircularMeasuredSegment[]} measured
 */
export function getCircularTotalArcLength(measured) {
  if (!measured.length) return 0;
  const last = measured[measured.length - 1];
  return last.centerArcLength + last.advance * 0.5;
}

/**
 * @typedef {Object} FontCircularLayoutResult
 * @property {Array<{ paths: object[], y: number, text: string }>} lines
 * @property {number} width
 * @property {number} height
 * @property {number} fontSize
 * @property {{ enabled: true, mode: FontCircularWrapMode, arcSpanDeg: number, radius: number, centerX: number, centerY: number, totalArcLength: number }} circular
 */

/**
 * Build a circular layout from straight-line segment positions (first line only).
 * Letters face outward — readable from outside the ring.
 *
 * @param {Object} params
 * @param {FontCircularSegmentInput[]} params.segments
 * @param {string} params.lineText
 * @param {import('../vendor/opentype.module.js').Font} params.font
 * @param {number} params.fontSize
 * @param {number} params.baselineY
 * @param {string} params.fill
 * @param {FontCircularWrapMode} params.mode
 * @param {number} params.manualArcDeg
 * @param {number} params.tracking
 * @param {(glyph: import('../vendor/opentype.module.js').Glyph, font: import('../vendor/opentype.module.js').Font, fontSize: number, tracking: number) => number} params.glyphAdvance
 * @returns {FontCircularLayoutResult | null}
 */
export function buildFontCircularLayout({
  segments,
  lineText,
  font,
  fontSize,
  baselineY,
  fill,
  mode,
  manualArcDeg,
  tracking,
  glyphAdvance,
}) {
  if (!segments?.length || !font) return null;

  const measured = measureCircularSegments(
    segments,
    font,
    fontSize,
    baselineY,
    glyphAdvance,
    tracking,
  );
  if (!measured.length) return null;

  const totalArcLength = getCircularTotalArcLength(measured);
  const { radius, arcSpanRad, arcSpanDeg } = computeCircularWrapRadius(
    totalArcLength,
    mode,
    manualArcDeg,
  );
  const pad = fontSize * 0.65;
  const centerX = radius + pad;
  const centerY = radius + pad;

  /** @type {object[]} */
  const paths = [];
  for (const segment of measured) {
    const angleRad = computeCircularGlyphAngleRad(
      segment.centerArcLength,
      radius,
      mode,
      arcSpanRad,
      totalArcLength,
    );
    const glyphPath = segment.glyph.getPath(-segment.advance * 0.5, baselineY, fontSize);
    if (!opentypePathHasArea(glyphPath)) continue;

    paths.push({
      d: glyphPath.toPathData(2),
      fill,
      glyphPath,
      wordIndex: segment.wordIndex,
      circularTransform: {
        angleRad,
        radius,
        baselineY,
        advance: segment.advance,
      },
    });
  }

  if (!paths.length) return null;

  const extent = radius + fontSize + pad;
  return {
    lines: [{ paths, y: baselineY, text: lineText }],
    width: extent * 2,
    height: extent * 2,
    fontSize,
    align: 'center',
    maxWidth: extent * 2,
    circular: {
      enabled: true,
      mode,
      arcSpanDeg,
      radius,
      centerX,
      centerY,
      totalArcLength,
    },
  };
}

/**
 * Minimal straight-preview bracket marking where the circular arc starts and ends (first line).
 * Manual arc span scales the bracket width so the slider has visible feedback on the linear preview.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ lines?: { paths?: { glyphPath?: { getBoundingBox?: () => { x1: number, x2: number, y1: number, y2: number, isEmpty?: () => boolean } } }[], y?: number }[], fontSize?: number }} layout
 * @param {{ mode?: unknown, arcDeg?: unknown }} [circularWrap]
 */
export function drawCircularArcSpanPreviewIndicator(ctx, layout, circularWrap) {
  const paths = layout?.lines?.[0]?.paths;
  if (!ctx || !paths?.length) return;

  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;

  for (const entry of paths) {
    const bb = entry.glyphPath?.getBoundingBox?.();
    if (!bb || bb.isEmpty?.()) continue;
    any = true;
    minX = Math.min(minX, bb.x1, bb.x2);
    maxX = Math.max(maxX, bb.x1, bb.x2);
    maxY = Math.max(maxY, bb.y1, bb.y2);
  }
  if (!any || !Number.isFinite(minX) || !Number.isFinite(maxX)) return;

  const mode = normalizeFontCircularWrapMode(circularWrap?.mode);
  const arcDeg = clampFontCircularWrapArcDeg(circularWrap?.arcDeg);
  let bracketMinX = minX;
  let bracketMaxX = maxX;
  if (mode === 'manual' && arcDeg < MAX_FONT_CIRCULAR_WRAP_ARC_DEG) {
    const centerX = (minX + maxX) * 0.5;
    const inkWidth = Math.max(maxX - minX, 1);
    const spanWidth = inkWidth * (arcDeg / MAX_FONT_CIRCULAR_WRAP_ARC_DEG);
    bracketMinX = centerX - spanWidth * 0.5;
    bracketMaxX = centerX + spanWidth * 0.5;
  }

  const fontSize = Number(layout?.fontSize) > 0 ? Number(layout.fontSize) : 72;
  const strokeWidth = Math.max(fontSize * 0.025, 0.75);
  const tickHeight = Math.max(fontSize * 0.1, 3);
  const gap = fontSize * 0.06;
  const yBase = maxY + gap;
  const yTick = yBase + tickHeight;

  ctx.save();
  ctx.strokeStyle = 'rgba(196, 255, 0, 0.42)';
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(bracketMinX, yBase);
  ctx.lineTo(bracketMinX, yTick);
  ctx.moveTo(bracketMaxX, yBase);
  ctx.lineTo(bracketMaxX, yTick);
  ctx.moveTo(bracketMinX, yTick);
  ctx.lineTo(bracketMaxX, yTick);
  ctx.stroke();
  ctx.restore();
}

/**
 * World position of a glyph anchor on the ring (horizontal XZ plane, Y up).
 * @param {number} theta
 * @param {number} radius
 */
export function computeCircularRingPosition(theta, radius) {
  return {
    x: Math.sin(theta) * radius,
    y: 0,
    z: -Math.cos(theta) * radius,
  };
}

/** Y rotation so each glyph faces outward from the ring (view from outside). */
export function computeCircularGlyphRotationY(theta) {
  return -theta + Math.PI;
}

/**
 * @param {THREE.Group} group
 * @param {number} layoutFontSize
 * @param {{ radius: number }} circularLayout
 * @param {number} targetCapHeight
 */
export function applyFontCircularRingTransforms(group, layoutFontSize, circularLayout, targetCapHeight) {
  const em = Number(layoutFontSize) > 0 ? Number(layoutFontSize) : 72;
  const uniformScale = targetCapHeight / em;
  const layoutRadius = Math.max(Number(circularLayout?.radius) || 0, 1);
  const ringRadius = layoutRadius * uniformScale;

  group.children.forEach((glyphGroup) => {
    if (!glyphGroup.userData?.orbyFontGlyphGroup) return;
    const transform = glyphGroup.userData.orbyFontCircularTransform;
    if (!transform) return;

    const theta = transform.angleRad;
    const pos = computeCircularRingPosition(theta, ringRadius);
    glyphGroup.position.set(pos.x, pos.y, pos.z);
    glyphGroup.rotation.set(0, computeCircularGlyphRotationY(theta), 0);
  });
}
