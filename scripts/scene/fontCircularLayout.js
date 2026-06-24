import { opentypePathHasArea } from '../import/opentypePathToShape.js';

/** @typedef {'auto' | 'manual'} FontCircularWrapMode */
/** @typedef {'inward' | 'outward'} FontCircularWrapFacing */

export const DEFAULT_FONT_CIRCULAR_WRAP_ENABLED = false;
export const DEFAULT_FONT_CIRCULAR_WRAP_MODE = 'auto';
export const DEFAULT_FONT_CIRCULAR_WRAP_FACING = 'outward';
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

/** @param {unknown} value @returns {FontCircularWrapFacing} */
export function normalizeFontCircularWrapFacing(value) {
  return value === 'outward' ? 'outward' : 'inward';
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
 * @param {number} centerArcLength
 * @param {number} radius
 * @param {FontCircularWrapMode} mode
 * @param {number} arcSpanRad
 */
/**
 * Map straight-line arc length to placement on the ring.
 * @param {number} centerArcLength
 */
export function computeCircularGlyphPlacementArcLength(centerArcLength) {
  return centerArcLength;
}

export function computeCircularGlyphAngleRad(
  centerArcLength,
  radius,
  mode,
  arcSpanRad,
) {
  const safeRadius = Math.max(Number(radius) || 0, 1);
  const placementArcLength = computeCircularGlyphPlacementArcLength(centerArcLength);
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
 *
 * @param {Object} params
 * @param {FontCircularSegmentInput[]} params.segments
 * @param {string} params.lineText
 * @param {import('../vendor/opentype.module.js').Font} params.font
 * @param {number} params.fontSize
 * @param {number} params.baselineY
 * @param {string} params.fill
 * @param {FontCircularWrapMode} params.mode
 * @param {FontCircularWrapFacing} params.facing
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
  facing,
  manualArcDeg,
  tracking,
  glyphAdvance,
}) {
  const wrapFacing = normalizeFontCircularWrapFacing(facing);
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
      facing: wrapFacing,
      arcSpanDeg,
      radius,
      centerX,
      centerY,
      totalArcLength,
    },
  };
}

/**
 * Conservative ink bounds for circular preview fit.
 * @param {{ circular?: { centerX: number, centerY: number, radius: number }, fontSize?: number, lines?: { paths?: object[] }[] }} layout
 */
export function getCircularLayoutPreviewBounds(layout) {
  const circular = layout?.circular;
  if (!circular?.enabled) return null;

  const fontSize = Number(layout?.fontSize) > 0 ? Number(layout.fontSize) : 72;
  const pad = fontSize * 0.35;
  const outer = circular.radius + fontSize * 0.6 + pad;
  const minX = circular.centerX - outer;
  const maxX = circular.centerX + outer;
  const minY = circular.centerY - outer;
  const maxY = circular.centerY + outer;
  return { minX, minY, maxX, maxY };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ circular?: { centerX: number, centerY: number, radius: number }, lines?: { paths?: object[] }[] }} layout
 * @param {string} [defaultFill]
 */
export function drawCircularLayoutPreview(ctx, layout, defaultFill = '#808080') {
  const circular = layout?.circular;
  if (!ctx || !circular?.enabled) return;

  for (const line of layout?.lines || []) {
    for (const pathEntry of line.paths || []) {
      const glyphPath = pathEntry.glyphPath;
      const transform = pathEntry.circularTransform;
      if (!glyphPath?.draw || !transform) continue;

      const cx = circular.centerX + transform.radius * Math.sin(transform.angleRad);
      const cy = circular.centerY - transform.radius * Math.cos(transform.angleRad);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(computeCircularGlyphRotationY(transform.angleRad, circular.facing));
      ctx.scale(computeCircularGlyphScaleX(circular.facing), 1);
      ctx.translate(0, -transform.baselineY);

      const prevFill = glyphPath.fill;
      glyphPath.fill = pathEntry.fill || defaultFill;
      glyphPath.draw(ctx);
      glyphPath.fill = prevFill;
      ctx.restore();
    }
  }
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

/**
 * Y rotation so extruded caps face away from the ring center (outward) or toward it (inward).
 * @param {number} theta
 * @param {FontCircularWrapFacing} [facing]
 */
export function computeCircularGlyphRotationY(theta, facing = DEFAULT_FONT_CIRCULAR_WRAP_FACING) {
  const outwardRotation = -theta;
  if (normalizeFontCircularWrapFacing(facing) === 'inward') {
    return outwardRotation + Math.PI;
  }
  return outwardRotation;
}

/** @param {FontCircularWrapFacing} [facing] */
export function computeCircularGlyphScaleX(_facing = DEFAULT_FONT_CIRCULAR_WRAP_FACING) {
  return 1;
}

/**
 * @param {THREE.Group} group
 * @param {number} layoutFontSize
 * @param {{ radius: number, facing?: FontCircularWrapFacing }} circularLayout
 * @param {number} targetCapHeight
 */
export function applyFontCircularRingTransforms(group, layoutFontSize, circularLayout, targetCapHeight) {
  const facing = normalizeFontCircularWrapFacing(circularLayout?.facing);
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
    glyphGroup.rotation.set(0, computeCircularGlyphRotationY(theta, facing), 0);
    glyphGroup.scale.set(1, 1, 1);
  });
}
