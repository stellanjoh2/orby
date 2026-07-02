/**
 * Post-generation letter-spacing animation — per-glyph X offsets without re-extruding.
 */

import * as THREE from 'three';
import { FONT_EXTRUDE_TARGET_CAP_HEIGHT } from '../import/extrudeDetail.js';
import {
  DEFAULT_EXPORT_MOVEMENT_EASING,
  easeExportMovementProgress,
  normalizeExportMovementEasing,
} from '../render/exportMovementEasing.js';

export const DEFAULT_FONT_TRACKING_ANIMATOR_ENABLED = false;
/** Percent of {@link MAX_FONT_TRACKING_ANIMATOR_START} — extra spacing at t=0, settles to master at end. */
export const DEFAULT_FONT_TRACKING_ANIMATOR_AMOUNT_PERCENT = 0;
export const MAX_FONT_TRACKING_ANIMATOR_AMOUNT_PERCENT = 100;
/** Max extra letter-spacing (thousandths em) at 100% Amount Start — independent of master Letter Spacing. */
export const MAX_FONT_TRACKING_ANIMATOR_START = 500;
export const DEFAULT_FONT_TRACKING_ANIMATOR_TIME_SEC = 1.5;
export const DEFAULT_FONT_TRACKING_ANIMATOR_EASING = DEFAULT_EXPORT_MOVEMENT_EASING;
export const MIN_FONT_TRACKING_ANIMATOR_TIME_SEC = 0.1;
export const MAX_FONT_TRACKING_ANIMATOR_TIME_SEC = 5;
export const MIN_FONT_TRACKING_VALUE = -100;
export const MAX_FONT_TRACKING_VALUE = 500;
export const MIN_FONT_LINE_HEIGHT = 0.1;
export const MAX_FONT_LINE_HEIGHT = 2.5;
export const DEFAULT_FONT_LINE_HEIGHT = 1;

/** @deprecated legacy state key */
export const DEFAULT_FONT_TRACKING_ANIMATOR_START = -40;
/** @deprecated legacy absolute amount — migrated to percent */
export const DEFAULT_FONT_TRACKING_ANIMATOR_AMOUNT = 40;

/** @param {THREE.Object3D | null | undefined} model */
export function isFontTrackingAnimatorModel(model) {
  if (!model) return false;
  if (model.userData?.orbyFontCircularWrap) return false;
  if (model.userData?.orbyFontGenerated || model.userData?.orbyFontExtrude) return true;
  let found = false;
  model.traverse((child) => {
    if (found || !child.isMesh) return;
    if (child.userData?.orbyFontExtrude) found = true;
  });
  return found;
}

/** @param {unknown} value */
export function normalizeFontTrackingAnimatorEnabled(value) {
  return value === true;
}

/** @param {unknown} value */
export function clampFontTrackingAnimatorAmountPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_FONT_TRACKING_ANIMATOR_AMOUNT_PERCENT;
  return Math.min(MAX_FONT_TRACKING_ANIMATOR_AMOUNT_PERCENT, Math.max(0, n));
}

/**
 * Resolve stored percent from current or legacy state.
 * @param {{ trackingAnimatorAmountPercent?: unknown, trackingAnimatorAmount?: unknown, trackingAnimatorStart?: unknown }} [fontState]
 * @param {unknown} masterTracking
 */
export function resolveFontTrackingAnimatorAmountPercent(fontState, masterTracking) {
  if (fontState?.trackingAnimatorAmountPercent !== undefined) {
    return clampFontTrackingAnimatorAmountPercent(fontState.trackingAnimatorAmountPercent);
  }
  if (fontState?.trackingAnimatorAmount !== undefined) {
    const raw = Number(fontState.trackingAnimatorAmount);
    if (Number.isFinite(raw)) {
      if (raw <= MAX_FONT_TRACKING_ANIMATOR_AMOUNT_PERCENT) {
        return clampFontTrackingAnimatorAmountPercent(raw);
      }
      const master = Math.abs(clampFontTrackingValue(masterTracking));
      if (master > 0) {
        return clampFontTrackingAnimatorAmountPercent((raw / master) * 100);
      }
      return clampFontTrackingAnimatorAmountPercent(
        (raw / MAX_FONT_TRACKING_ANIMATOR_START) * 100,
      );
    }
  }
  if (fontState?.trackingAnimatorStart !== undefined) {
    const master = clampFontTrackingValue(masterTracking);
    const legacyStart = clampFontTrackingValue(fontState.trackingAnimatorStart);
    const legacyAmount = Math.max(0, master - legacyStart);
    if (Math.abs(master) > 0) {
      return clampFontTrackingAnimatorAmountPercent((legacyAmount / Math.abs(master)) * 100);
    }
    if (legacyAmount <= MAX_FONT_TRACKING_ANIMATOR_AMOUNT_PERCENT) {
      return clampFontTrackingAnimatorAmountPercent(legacyAmount);
    }
  }
  return DEFAULT_FONT_TRACKING_ANIMATOR_AMOUNT_PERCENT;
}

/**
 * Extra tracking at animation start — absolute span, not tied to master letter-spacing.
 * 100% Amount Start → {@link MAX_FONT_TRACKING_ANIMATOR_START} extra units on top of master.
 * @param {unknown} _masterTracking unused — kept for call-site stability
 * @param {unknown} percent
 */
export function computeTrackingAnimatorAmountFromPercent(_masterTracking, percent) {
  const p = clampFontTrackingAnimatorAmountPercent(percent);
  if (p <= 0) return 0;
  return (p / 100) * MAX_FONT_TRACKING_ANIMATOR_START;
}

/** @param {unknown} value */
export function normalizeFontTrackingAnimatorEasing(value) {
  return normalizeExportMovementEasing(value ?? DEFAULT_FONT_TRACKING_ANIMATOR_EASING);
}

/** @param {unknown} value */
export function clampFontTrackingAnimatorTimeSec(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_FONT_TRACKING_ANIMATOR_TIME_SEC;
  return Math.min(
    MAX_FONT_TRACKING_ANIMATOR_TIME_SEC,
    Math.max(MIN_FONT_TRACKING_ANIMATOR_TIME_SEC, n),
  );
}

/** @param {unknown} value */
export function clampFontTrackingValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_FONT_TRACKING_VALUE, Math.max(MIN_FONT_TRACKING_VALUE, n));
}

/**
 * @param {number} elapsedSec
 * @param {number} durationSec
 * @param {unknown} [easingId]
 */
export function computeTrackingAnimatorProgress(elapsedSec, durationSec, easingId) {
  if (durationSec <= 0) return 1;
  const linearT = Math.min(1, Math.max(0, elapsedSec / durationSec));
  return easeExportMovementProgress(linearT, normalizeFontTrackingAnimatorEasing(easingId));
}

/**
 * Scrub / idle pose: map composite timeline seconds to tracking motion seconds.
 * Capped at tracking duration — independent of reveal length.
 * @param {number} compositeElapsedSec
 * @param {number} trackingTimeSec
 */
export function computeScrubTrackingMotionElapsed(compositeElapsedSec, trackingTimeSec) {
  const trackingTime = Math.max(0, Number(trackingTimeSec) || 0);
  if (trackingTime <= 0) return 0;
  return Math.min(Math.max(0, Number(compositeElapsedSec) || 0), trackingTime);
}

/**
 * @deprecated Prefer {@link computeScrubTrackingMotionElapsed} — phase anchor removed.
 * @param {number} compositeElapsedSec
 * @param {number} phaseStartElapsedSec ignored
 * @param {number} trackingTimeSec
 */
export function computePreviewTrackingMotionElapsed(
  compositeElapsedSec,
  phaseStartElapsedSec,
  trackingTimeSec,
) {
  void phaseStartElapsedSec;
  return computeScrubTrackingMotionElapsed(compositeElapsedSec, trackingTimeSec);
}

/**
 * Tracking widens from master + amount at progress 0, settling to master at progress 1.
 * @param {number} masterTracking
 * @param {number} amountIncrease
 * @param {number} progress 0–1
 */
export function computeAnimatedTrackingValue(masterTracking, amountIncrease, progress) {
  const master = clampFontTrackingValue(masterTracking);
  const amount = Math.max(0, Number(amountIncrease) || 0);
  const p = Math.min(1, Math.max(0, progress));
  return master + amount * (1 - p);
}

/**
 * World-space spacing per thousandth of an em (matches layout → normalize scale).
 * @param {number} trackingDelta thousandths of em
 * @param {number} layoutFontSize
 */
export function trackingDeltaToWorldSpacing(trackingDelta, layoutFontSize) {
  const em = Number(layoutFontSize) > 0 ? Number(layoutFontSize) : 72;
  const scale = FONT_EXTRUDE_TARGET_CAP_HEIGHT / em;
  return (trackingDelta / 1000) * em * scale;
}

/** @param {unknown} value */
export function normalizeFontLineHeight(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_FONT_LINE_HEIGHT;
  return Math.min(MAX_FONT_LINE_HEIGHT, Math.max(MIN_FONT_LINE_HEIGHT, n));
}

/**
 * Average rest Y per line — baked layout baselines for live line-height offsets.
 * @param {Array<import('./fontTextRevealTypes.js').RevealGlyphState>} glyphStates
 * @param {number[] | null} lineIndices
 */
export function buildLineRestYBaselines(glyphStates, lineIndices) {
  /** @type {Map<number, number>} */
  const baselines = new Map();
  if (!glyphStates?.length || !lineIndices?.length) return baselines;

  /** @type {Map<number, { sum: number, count: number }>} */
  const accum = new Map();
  for (let i = 0; i < glyphStates.length; i += 1) {
    const lineIndex = lineIndices[i] ?? 0;
    const y = glyphStates[i].restPosition.y;
    const entry = accum.get(lineIndex) ?? { sum: 0, count: 0 };
    entry.sum += y;
    entry.count += 1;
    accum.set(lineIndex, entry);
  }
  for (const [lineIndex, { sum, count }] of accum) {
    if (count > 0) baselines.set(lineIndex, sum / count);
  }
  return baselines;
}

/**
 * Y offset for one line when master line-height differs from baked generation value.
 * First line stays anchored; spacing scales proportionally between lines.
 * @param {number} lineIndex
 * @param {Map<number, number>} lineRestYBaselines
 * @param {unknown} bakedLineHeight
 * @param {unknown} masterLineHeight
 */
export function computeLineHeightYOffset(
  lineIndex,
  lineRestYBaselines,
  bakedLineHeight,
  masterLineHeight,
) {
  if (!lineRestYBaselines || lineRestYBaselines.size <= 1) return 0;
  const baked = normalizeFontLineHeight(bakedLineHeight);
  const master = normalizeFontLineHeight(masterLineHeight);
  if (Math.abs(master - baked) < 1e-6) return 0;

  const line0Y = lineRestYBaselines.get(0);
  if (line0Y === undefined) return 0;
  const bakedY = lineRestYBaselines.get(lineIndex);
  if (bakedY === undefined) return 0;

  const line1Y = lineRestYBaselines.get(1);
  let bakedSpacing = line1Y !== undefined ? line1Y - line0Y : 0;
  if (Math.abs(bakedSpacing) < 1e-8) {
    bakedSpacing = -FONT_EXTRUDE_TARGET_CAP_HEIGHT * baked;
  }
  const newSpacing = bakedSpacing * (master / baked);
  const targetY = line0Y + lineIndex * newSpacing;
  return targetY - bakedY;
}

/** @param {unknown} value @returns {'left' | 'center' | 'right'} */
export function normalizeFontAlign(value) {
  if (value === 'center' || value === 'right') return value;
  return 'left';
}

/**
 * Shift line ink within a reference width (matches FontExtrudeController layout).
 * @param {{ minX: number, maxX: number, width: number }} bounds
 * @param {'left' | 'center' | 'right'} align
 * @param {number} refWidth
 */
export function computeLineInkAlignOffset(bounds, align, refWidth) {
  if (!bounds) return 0;
  if (align === 'right') return refWidth - bounds.maxX;
  if (align === 'center') return (refWidth - bounds.width) * 0.5 - bounds.minX;
  return -bounds.minX;
}

/**
 * @param {Array<import('./fontTextRevealTypes.js').RevealGlyphState>} glyphStates
 * @param {number[] | null} lineIndices
 * @param {number[]} lineGlyphCounts
 */
export function computeTypographyLineBoundsFromRest(glyphStates, lineIndices, lineGlyphCounts) {
  /** @type {Map<number, { minX: number, maxX: number, width: number }>} */
  const boundsByLine = new Map();
  for (let i = 0; i < glyphStates.length; i += 1) {
    const lineIndex = lineIndices?.[i] ?? 0;
    const { group } = glyphStates[i];
    if (!group) continue;
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) continue;
    const existing = boundsByLine.get(lineIndex);
    if (!existing) {
      boundsByLine.set(lineIndex, { minX: box.min.x, maxX: box.max.x, width: 0 });
    } else {
      existing.minX = Math.min(existing.minX, box.min.x);
      existing.maxX = Math.max(existing.maxX, box.max.x);
    }
  }
  for (const bounds of boundsByLine.values()) {
    bounds.width = Math.max(bounds.maxX - bounds.minX, 0);
  }
  let paragraphWidth = 1;
  for (const bounds of boundsByLine.values()) {
    paragraphWidth = Math.max(paragraphWidth, bounds.width);
  }
  return { boundsByLine, paragraphWidth };
}

/**
 * Absolute horizontal shift so line ink matches master alignment.
 * Rest bounds are measured from the current mesh — not a delta from baked metadata.
 *
 * @param {{ minX: number, maxX: number, width: number }} bounds
 * @param {number} paragraphWidth
 * @param {'left' | 'center' | 'right'} masterAlign
 * @param {number} [widthAdjust]
 */
export function computeTypographyAlignLineShift(
  bounds,
  paragraphWidth,
  masterAlign,
  widthAdjust = 0,
) {
  const adjust = Number(widthAdjust) || 0;
  const masterBounds = adjust
    ? {
      minX: bounds.minX,
      maxX: bounds.maxX + adjust,
      width: bounds.width + adjust,
    }
    : bounds;
  const paragraphForMaster = Math.max(paragraphWidth + adjust, 1);
  const refMaster = masterAlign === 'left' ? masterBounds.width : paragraphForMaster;
  return computeLineInkAlignOffset(masterBounds, masterAlign, refMaster);
}

/**
 * @param {Array<import('./fontTextRevealTypes.js').RevealGlyphState>} glyphStates
 * @param {{
 *   animatedTracking: number,
 *   generatedTracking: number,
 *   align?: 'left' | 'center' | 'right',
 *   bakedAlign?: 'left' | 'center' | 'right',
 *   masterAlign?: 'left' | 'center' | 'right',
 *   layoutFontSize: number,
 *   lineIndices: number[] | null,
 *   lineGlyphIndices: number[] | null,
 *   lineGlyphCounts: number[],
 *   bakedLineHeight?: number,
 *   masterLineHeight?: number,
 *   lineRestYBaselines?: Map<number, number>,
 *   layoutBounds?: Map<number, { minX: number, maxX: number, width: number }>,
 *   paragraphWidth?: number,
 * }} options
 */
export function applyTrackingAnimatorToGlyphStates(glyphStates, options) {
  if (!glyphStates?.length) return;

  const generatedTracking = clampFontTrackingValue(options.generatedTracking);
  const animatedTracking = Number(options.animatedTracking);
  if (!Number.isFinite(animatedTracking)) return;
  // Do not clamp animated tracking to the typography slider range — Amount Start can
  // exceed MAX_FONT_TRACKING_VALUE when Amount Start adds extra width on top of master.
  const deltaTracking = animatedTracking - generatedTracking;
  const masterAlign = normalizeFontAlign(options.masterAlign ?? options.align);
  const hasTrackingDelta = Math.abs(deltaTracking) >= 1e-6;
  const bakedLineHeight = normalizeFontLineHeight(options.bakedLineHeight ?? DEFAULT_FONT_LINE_HEIGHT);
  const masterLineHeight = normalizeFontLineHeight(options.masterLineHeight ?? bakedLineHeight);
  const lineRestYBaselines = options.lineRestYBaselines;
  const hasLineHeightDelta =
    !!lineRestYBaselines
    && lineRestYBaselines.size > 1
    && Math.abs(masterLineHeight - bakedLineHeight) >= 1e-6;

  const spacingStep = trackingDeltaToWorldSpacing(deltaTracking, options.layoutFontSize);

  let boundsByLine = options.layoutBounds ?? null;
  let paragraphWidth = Number(options.paragraphWidth);
  if (!boundsByLine) {
    const measured = computeTypographyLineBoundsFromRest(
      glyphStates,
      options.lineIndices,
      options.lineGlyphCounts,
    );
    boundsByLine = measured.boundsByLine;
    paragraphWidth = measured.paragraphWidth;
  }
  if (!Number.isFinite(paragraphWidth) || paragraphWidth <= 0) {
    paragraphWidth = 1;
  }
  /** @type {Map<number, number>} */
  const lineAlignShifts = new Map();
  let hasAlignShift = false;
  for (const [lineIndex, bounds] of boundsByLine) {
    const lineGlyphCount = options.lineGlyphCounts[lineIndex] ?? glyphStates.length;
    const widthAdjust = hasTrackingDelta ? Math.max(0, lineGlyphCount - 1) * spacingStep : 0;
    const shift = computeTypographyAlignLineShift(
      bounds,
      paragraphWidth,
      masterAlign,
      widthAdjust,
    );
    lineAlignShifts.set(lineIndex, shift);
    if (Math.abs(shift) > 1e-6) hasAlignShift = true;
  }

  if (!hasTrackingDelta && !hasLineHeightDelta && !hasAlignShift) return;

  for (let i = 0; i < glyphStates.length; i += 1) {
    const state = glyphStates[i];
    const { group } = state;
    const lineIndex = options.lineIndices?.[i] ?? 0;
    const lineGlyphIndex = options.lineGlyphIndices?.[i] ?? i;
    const lineGlyphCount = options.lineGlyphCounts[lineIndex] ?? glyphStates.length;

    let xOffset = 0;

    if (hasTrackingDelta) {
      xOffset = lineGlyphIndex * spacingStep;
      if (lineGlyphCount > 1) {
        const totalSpan = (lineGlyphCount - 1) * spacingStep;
        if (masterAlign === 'center') {
          xOffset -= totalSpan * 0.5;
        } else if (masterAlign === 'right') {
          xOffset -= totalSpan;
        }
      }
    }

    if (lineAlignShifts.size) {
      const lineShift = lineAlignShifts.get(lineIndex) ?? 0;
      xOffset += lineShift;
    }

    let yOffset = 0;
    if (hasLineHeightDelta && lineRestYBaselines) {
      yOffset = computeLineHeightYOffset(
        lineIndex,
        lineRestYBaselines,
        bakedLineHeight,
        masterLineHeight,
      );
    }

    const prevTypographyX = Number(state.lastTypographyX) || 0;
    const prevTypographyY = Number(state.lastTypographyY) || 0;
    group.position.x -= prevTypographyX;
    group.position.y -= prevTypographyY;
    group.position.x += xOffset;
    group.position.y += yOffset;
    state.lastTypographyX = xOffset;
    state.lastTypographyY = yOffset;
  }
}
