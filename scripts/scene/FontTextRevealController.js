import * as THREE from 'three';
import {
  clampFontRevealDurationSec,
  DEFAULT_FONT_REVEAL_DURATION_SEC,
} from './fontTextRevealDuration.js';
import {
  applyRevealPoseToGlyph,
  clampFontRevealSlideDepth,
  clampFontRevealSlideTime,
  computeGlyphRevealEase,
  computeGlyphSlotProgress,
  computeGlyphSlideProgress,
  DEFAULT_FONT_REVEAL_TYPE,
  DEFAULT_FONT_REVEAL_UNIT,
  DEFAULT_FONT_REVEAL_SLIDE_DIRECTION,
  DEFAULT_FONT_REVEAL_SLIDE_DEPTH,
  DEFAULT_FONT_REVEAL_SLIDE_TIME,
  normalizeFontRevealSlideDirection,
  normalizeFontRevealStaggerEasing,
  isFontRevealAnimationActive,
  normalizeFontRevealType,
  normalizeFontRevealUnit,
  isRevealGlyphVisibleAtExportProgress,
  resetRevealGlyphPose,
} from './fontTextRevealTypes.js';
import {
  applyRevealEmissiveSlam,
  clampFontRevealEmissiveDecaySec,
  clampFontRevealEmissiveStrength,
  computeGlyphEmissiveSlamFactor,
  DEFAULT_FONT_REVEAL_EMISSIVE_COLOR,
  DEFAULT_FONT_REVEAL_EMISSIVE_DECAY_SEC,
  DEFAULT_FONT_REVEAL_EMISSIVE_SLAM,
  DEFAULT_FONT_REVEAL_EMISSIVE_STRENGTH,
  captureMaterialEmissiveRest,
  normalizeFontRevealEmissiveColor,
  normalizeFontRevealEmissiveSlamEnabled,
  restoreRevealGlyphEmissive,
} from './fontTextRevealEmissive.js';
import {
  applyTrackingAnimatorToGlyphStates,
  buildLineRestYBaselines,
  clampFontTrackingAnimatorTimeSec,
  computeAnimatedTrackingValue,
  computeScrubTrackingMotionElapsed,
  computeTrackingAnimatorAmountFromPercent,
  computeTrackingAnimatorProgress,
  computeTypographyLineBoundsFromRest,
  DEFAULT_FONT_TRACKING_ANIMATOR_TIME_SEC,
  isFontTrackingAnimatorModel,
  normalizeFontLineHeight,
  normalizeFontTrackingAnimatorEnabled,
  normalizeFontTrackingAnimatorEasing,
  resolveFontTrackingAnimatorAmountPercent,
} from './fontTextTrackingAnimation.js';
import { FONT_EXTRUDE_TARGET_CAP_HEIGHT } from '../import/extrudeDetail.js';

export {
  DEFAULT_FONT_REVEAL_DURATION_SEC,
  MIN_FONT_REVEAL_DURATION_SEC,
  MAX_FONT_REVEAL_DURATION_SEC,
  clampFontRevealDurationSec,
} from './fontTextRevealDuration.js';
export {
  DEFAULT_FONT_REVEAL_TYPE,
  DEFAULT_FONT_REVEAL_UNIT,
  DEFAULT_FONT_REVEAL_SLIDE_DEPTH,
  DEFAULT_FONT_REVEAL_SLIDE_DIRECTION,
  DEFAULT_FONT_REVEAL_SLIDE_TIME,
  clampFontRevealSlideDepth,
  clampFontRevealSlideTime,
  normalizeFontRevealSlideDirection,
  isFontRevealAnimationActive,
  normalizeFontRevealType,
  normalizeFontRevealUnit,
} from './fontTextRevealTypes.js';
export {
  DEFAULT_FONT_REVEAL_EMISSIVE_COLOR,
  DEFAULT_FONT_REVEAL_EMISSIVE_DECAY_SEC,
  DEFAULT_FONT_REVEAL_EMISSIVE_SLAM,
  DEFAULT_FONT_REVEAL_EMISSIVE_STRENGTH,
  clampFontRevealEmissiveDecaySec,
  clampFontRevealEmissiveStrength,
  normalizeFontRevealEmissiveColor,
  normalizeFontRevealEmissiveSlamEnabled,
} from './fontTextRevealEmissive.js';

/** @param {THREE.Object3D | null | undefined} model */
export function isFontExtrudeRevealModel(model) {
  if (!model) return false;
  if (model.userData?.orbyFontGenerated || model.userData?.orbyFontExtrude) return true;
  let found = false;
  model.traverse((child) => {
    if (found || !child.isMesh) return;
    if (child.userData?.orbyFontExtrude) found = true;
  });
  return found;
}

/**
 * Character-by-character reveal for extruded font meshes.
 */
export class FontTextRevealController {
  /**
   * @param {{
   *   stateStore?: import('../StateStore.js').StateStore,
   *   onPreviewTimeUpdate?: (payload: {
   *     elapsed: number,
   *     duration: number,
   *     playing: boolean,
   *   }) => void,
   *   onNeedRender?: () => void,
   *   onTypographyLayoutChange?: () => void,
   *   reapplyMaterialEmissive?: () => void,
   * }} [options]
   * @param {() => void} [options.reapplyMaterialEmissive] Re-apply Mesh → Emissive slider to live materials (no event loop).
   */
  constructor({
    stateStore,
    onPreviewTimeUpdate = null,
    onNeedRender = null,
    onTypographyLayoutChange = null,
    reapplyMaterialEmissive = null,
  } = {}) {
    this.stateStore = stateStore;
    this.onPreviewTimeUpdate = onPreviewTimeUpdate;
    this.onNeedRender = onNeedRender;
    this.onTypographyLayoutChange = onTypographyLayoutChange;
    this._reapplyMaterialEmissive = reapplyMaterialEmissive;
    /** @type {THREE.Object3D[]} */
    this._glyphGroups = [];
    /** @type {Array<import('./fontTextRevealTypes.js').RevealGlyphState>} */
    this._glyphStates = [];
    /** @type {number[] | null} */
    this._glyphWordIndices = null;
    this._wordCount = 0;
    /** @type {number[] | null} */
    this._glyphLineIndices = null;
    /** @type {number[] | null} */
    this._glyphLineGlyphIndices = null;
    /** @type {number[]} */
    this._lineGlyphCounts = [];
    /** @type {boolean[]} */
    this._lineHasCircularGlyph = [];
    this._lineCount = 0;
    /** @type {Map<number, { center: THREE.Vector3, slideDistance: number }>} */
    this._lineGroupMeta = new Map();
    /** @type {Map<number, { center: THREE.Vector3, slideDistance: number }>} */
    this._wordGroupMeta = new Map();
    /** @type {THREE.Object3D | null} */
    this._boundModel = null;
    this._elapsed = 0;
    /** Export-only tracking clock. */
    this._trackingElapsed = 0;
    /** Viewport tracking animator clock — independent of reveal duration. */
    this._trackingMotionElapsed = 0;
    this._exportDriveActive = false;
    /** @type {'idle' | 'playing' | 'paused'} */
    this._previewMode = 'idle';
    this._previewRaf = 0;
    this._previewLastTs = 0;
    /** Reentrancy guard — {@link #onMaterialBaselineChanged} may call {@link #_reapplyMaterialEmissive} → updateMaterials → callback again. */
    this._materialBaselineSyncDepth = 0;
    /** @type {import('./FontTextConstantController.js').FontTextConstantController | null} */
    this._constantController = null;
    /** Resume reveal preview when {@link #applyPauseAll} clears after pausing a playing preview. */
    this._resumeRevealWhenPauseAllClears = false;
    /** Hold tracking at the Amount start pose while tuning (until play / reset). */
    this._trackingAmountPreviewPinned = false;
    /** @type {Map<number, number>} Average rest Y per line — baked at bind for live line-height. */
    this._lineRestYBaselines = new Map();
  }

  /** @param {import('./FontTextConstantController.js').FontTextConstantController | null} controller */
  setConstantController(controller) {
    this._constantController = controller;
    controller?.setRevealController?.(this);
  }

  getDurationSec() {
    const raw = this.stateStore?.getState()?.fontExtrude?.revealDurationSec;
    return clampFontRevealDurationSec(raw ?? DEFAULT_FONT_REVEAL_DURATION_SEC);
  }

  /** One full loop cycle of the active constant motion, or 0 when none is active. */
  _activeConstantCycleSec() {
    const constant = this._constantController;
    if (!constant?.isEnabled?.()) return 0;
    const sec = constant.getLoopCycleSec?.() ?? 0;
    return Number.isFinite(sec) && sec > 0 ? sec : 0;
  }

  /**
   * Length of the combined preview timeline (scrub / loop / time label), chosen
   * so the preview always loops cleanly regardless of settings:
   * - Reveal runs to its fully settled pose, including any emissive-slam fade,
   *   before the window ends (so the glow is never cut off mid-fade).
   * - When a constant loop is active, the window is the smallest whole number of
   *   constant cycles that still covers the settled reveal, so the constant
   *   spin lands exactly on a cycle boundary at the seam (no pop).
   */
  getPreviewDurationSec() {
    const revealLen = this.isEnabled() ? this._revealFullySettledElapsedSec() : 0;
    const trackingLen = this.isTrackingAnimatorActive() ? this.getTrackingAnimatorTimeSec() : 0;
    const constLen = this._activeConstantCycleSec();
    const motionLen = Math.max(revealLen, trackingLen);
    if (constLen <= 0) return motionLen || this.getDurationSec();
    const base = Math.max(motionLen, constLen);
    const cycles = Math.max(1, Math.ceil(base / constLen - 1e-6));
    return cycles * constLen;
  }

  /** Re-emit preview timeline length/elapsed (e.g. after a constant settings change). */
  refreshPreviewTimeline() {
    this._notifyPreviewTime();
  }

  getRevealType() {
    return normalizeFontRevealType(this.stateStore?.getState()?.fontExtrude?.revealType);
  }

  getRevealUnit() {
    const unit = normalizeFontRevealUnit(this.stateStore?.getState()?.fontExtrude?.revealUnit);
    if (unit === 'word' && this._wordCount <= 0) return 'character';
    return unit;
  }

  /**
   * @param {number} glyphIndex
   * @returns {{ slotIndex: number, slotCount: number }}
   */
  _resolveRevealSlot(glyphIndex) {
    const glyphCount = this._glyphStates.length;
    if (this.getRevealUnit() === 'word' && this._glyphWordIndices) {
      return {
        slotIndex: this._glyphWordIndices[glyphIndex] ?? glyphIndex,
        slotCount: this._wordCount,
      };
    }
    return { slotIndex: glyphIndex, slotCount: glyphCount };
  }

  getSlideDepth() {
    const raw = this.stateStore?.getState()?.fontExtrude?.revealSlideDepth;
    return clampFontRevealSlideDepth(raw ?? DEFAULT_FONT_REVEAL_SLIDE_DEPTH);
  }

  getSlideTime() {
    const raw = this.stateStore?.getState()?.fontExtrude?.revealSlideTime;
    return clampFontRevealSlideTime(raw ?? DEFAULT_FONT_REVEAL_SLIDE_TIME);
  }

  getSlideDirection() {
    const raw = this.stateStore?.getState()?.fontExtrude?.revealSlideDirection;
    return normalizeFontRevealSlideDirection(raw ?? DEFAULT_FONT_REVEAL_SLIDE_DIRECTION);
  }

  getRevealStaggerEasing() {
    const raw = this.stateStore?.getState()?.fontExtrude?.revealStaggerEasing;
    return normalizeFontRevealStaggerEasing(raw);
  }

  isLoopEnabled() {
    const loop = this.stateStore?.getState()?.fontExtrude?.revealLoop;
    return loop !== false;
  }

  isEmissiveSlamEnabled() {
    return normalizeFontRevealEmissiveSlamEnabled(
      this.stateStore?.getState()?.fontExtrude?.revealEmissiveSlam ??
        DEFAULT_FONT_REVEAL_EMISSIVE_SLAM,
    );
  }

  getEmissiveSlamStrength() {
    const raw = this.stateStore?.getState()?.fontExtrude?.revealEmissiveStrength;
    return clampFontRevealEmissiveStrength(raw ?? DEFAULT_FONT_REVEAL_EMISSIVE_STRENGTH);
  }

  getEmissiveSlamDecaySec() {
    const raw = this.stateStore?.getState()?.fontExtrude?.revealEmissiveDecaySec;
    return clampFontRevealEmissiveDecaySec(raw ?? DEFAULT_FONT_REVEAL_EMISSIVE_DECAY_SEC);
  }

  getEmissiveSlamColor() {
    const raw = this.stateStore?.getState()?.fontExtrude?.revealEmissiveColor;
    return normalizeFontRevealEmissiveColor(raw ?? DEFAULT_FONT_REVEAL_EMISSIVE_COLOR);
  }

  isEnabled() {
    return (
      isFontRevealAnimationActive(this.getRevealType()) &&
      this.getDurationSec() > 0 &&
      this._glyphStates.length > 0
    );
  }

  _isTrackingAnimatorConfigured() {
    if (!normalizeFontTrackingAnimatorEnabled(
      this.stateStore?.getState()?.fontExtrude?.trackingAnimatorEnabled,
    )) {
      return false;
    }
    if (!isFontTrackingAnimatorModel(this._boundModel)) return false;
    return this._glyphStates.length > 0;
  }

  isTrackingAnimatorActive() {
    if (!this._isTrackingAnimatorConfigured()) return false;
    if (this.getTrackingAnimatorTimeSec() <= 0) return false;
    const amountIncrease = computeTrackingAnimatorAmountFromPercent(
      this.getMasterTracking(),
      this.getTrackingAnimatorAmountPercent(),
    );
    return amountIncrease > 1e-6;
  }

  isTrackingAmountPreviewPinned() {
    return this._trackingAmountPreviewPinned;
  }

  isPreviewAnimationActive() {
    return (
      this.isEnabled()
      || this.isTrackingAnimatorActive()
      || (this._constantController?.isEnabled?.() ?? false)
    );
  }

  getBakedTracking() {
    const fromModel = Number(this._boundModel?.userData?.orbyFontGeneratedTracking);
    return Number.isFinite(fromModel) ? fromModel : 0;
  }

  /** Current letter-spacing master value (typography slider). */
  getMasterTracking() {
    const fromState = Number(this.stateStore?.getState()?.fontExtrude?.tracking);
    if (Number.isFinite(fromState)) return fromState;
    return this.getBakedTracking();
  }

  /** @deprecated use {@link getBakedTracking} */
  getGeneratedTracking() {
    return this.getBakedTracking();
  }

  /**
   * @param {number} elapsedSec
   * @param {{ trackingPreviewElapsed?: number }} [options]
   */
  _resolveTrackingMotionElapsed(elapsedSec, options = {}) {
    if (this._trackingAmountPreviewPinned && this._previewMode !== 'playing') return 0;
    if (Number.isFinite(options.trackingPreviewElapsed)) {
      return Math.max(0, options.trackingPreviewElapsed);
    }
    if (this._exportDriveActive) {
      return Math.max(0, this._trackingElapsed);
    }
    const trackingTime = this.getTrackingAnimatorTimeSec();
    if (
      (this._previewMode === 'playing' || this._previewMode === 'paused' || this._previewMode === 'idle')
      && this._isTrackingAnimatorConfigured()
      && trackingTime > 0
    ) {
      const motion = Math.max(0, this._trackingMotionElapsed);
      if (this._previewMode === 'idle' && motion >= trackingTime - 1e-4) {
        return trackingTime;
      }
      return motion;
    }
    if (this._previewMode === 'idle') {
      return Math.max(0, this._elapsed);
    }
    return Math.max(0, elapsedSec);
  }

  _resetTrackingClock() {
    this._trackingMotionElapsed = 0;
    this._trackingElapsed = 0;
  }

  /** When Tracking Time shrinks, restart from Amount Start — never inherit old progress. */
  _reconcileTrackingMotionToTime() {
    const trackingTime = this.getTrackingAnimatorTimeSec();
    if (trackingTime <= 0) {
      this._resetTrackingClock();
      return;
    }
    if (this._trackingMotionElapsed > trackingTime + 1e-4) {
      this._resetTrackingClock();
    }
  }

  _advanceTrackingMotion(delta) {
    if (!this.isTrackingAnimatorActive()) return;
    const d = typeof delta === 'number' && Number.isFinite(delta) ? delta : 0;
    if (d <= 0) return;
    const trackingTime = this.getTrackingAnimatorTimeSec();
    if (trackingTime <= 0) return;
    this._trackingMotionElapsed = Math.min(this._trackingMotionElapsed + d, trackingTime);
  }

  /** Idle pose clocks — reveal settled + tracking settled can differ in length. */
  _syncIdleCompositeClocks() {
    if (this.isEnabled()) {
      this._elapsed = this._revealFullySettledElapsedSec();
    } else {
      this._elapsed = 0;
    }
    if (this.isTrackingAnimatorActive()) {
      const trackingTime = this.getTrackingAnimatorTimeSec();
      this._trackingMotionElapsed = trackingTime;
      this._trackingElapsed = trackingTime;
    } else {
      this._trackingMotionElapsed = 0;
      this._trackingElapsed = this._elapsed;
    }
  }

  /** Phase-zero clocks for preview restart / reset animations. */
  _resetCompositeClocks() {
    this._elapsed = 0;
    this._trackingMotionElapsed = 0;
    this._trackingElapsed = 0;
  }

  _clearTrackingAmountPreviewPin() {
    this._trackingAmountPreviewPinned = false;
  }

  getBakedAlign() {
    const align = this._boundModel?.userData?.orbyFontGeneratedAlign;
    return align === 'center' || align === 'right' ? align : 'left';
  }

  /** @deprecated use {@link getBakedAlign} */
  getGeneratedAlign() {
    return this.getBakedAlign();
  }

  /** Current horizontal alignment (typography select). */
  getMasterAlign() {
    const fromState = this.stateStore?.getState()?.fontExtrude?.align;
    if (fromState === 'center' || fromState === 'right' || fromState === 'left') {
      return fromState;
    }
    return this.getBakedAlign();
  }

  getBakedLineHeight() {
    const fromModel = Number(this._boundModel?.userData?.orbyFontGeneratedLineHeight);
    if (Number.isFinite(fromModel)) return normalizeFontLineHeight(fromModel);
    const inferred = this._inferBakedLineHeightFromRestBaselines();
    if (Number.isFinite(inferred)) return normalizeFontLineHeight(inferred);
    return normalizeFontLineHeight(this.stateStore?.getState()?.fontExtrude?.lineHeight ?? 1);
  }

  /** Legacy meshes without baked metadata — infer multiplier from rest line spacing. */
  _inferBakedLineHeightFromRestBaselines() {
    if (this._lineRestYBaselines.size <= 1) return NaN;
    const y0 = this._lineRestYBaselines.get(0);
    const y1 = this._lineRestYBaselines.get(1);
    if (y0 === undefined || y1 === undefined) return NaN;
    const spacing = Math.abs(y1 - y0);
    if (spacing < 1e-8) return NaN;
    return spacing / FONT_EXTRUDE_TARGET_CAP_HEIGHT;
  }

  /** Current line-height multiplier (typography slider). */
  getMasterLineHeight() {
    const fromState = Number(this.stateStore?.getState()?.fontExtrude?.lineHeight);
    if (Number.isFinite(fromState)) return normalizeFontLineHeight(fromState);
    return this.getBakedLineHeight();
  }

  getLayoutFontSize() {
    const size = Number(this._boundModel?.userData?.orbyFontLayoutFontSize);
    return Number.isFinite(size) && size > 0 ? size : 72;
  }

  getTrackingAnimatorAmountPercent() {
    const fontState = this.stateStore?.getState()?.fontExtrude;
    return resolveFontTrackingAnimatorAmountPercent(fontState, this.getMasterTracking());
  }

  getTrackingAnimatorTimeSec() {
    const raw = this.stateStore?.getState()?.fontExtrude?.trackingAnimatorTimeSec;
    return clampFontTrackingAnimatorTimeSec(raw ?? DEFAULT_FONT_TRACKING_ANIMATOR_TIME_SEC);
  }

  getTrackingAnimatorEasing() {
    const raw = this.stateStore?.getState()?.fontExtrude?.trackingAnimatorEasing;
    return normalizeFontTrackingAnimatorEasing(raw);
  }

  isPreviewPlaying() {
    return this._previewMode === 'playing';
  }

  isPreviewPaused() {
    return this._previewMode === 'paused';
  }

  isPauseAll() {
    return this.stateStore?.getState()?.fontExtrude?.pauseAllAnimations === true;
  }

  getPreviewElapsed() {
    return this._elapsed;
  }

  getGlyphCount() {
    return this._glyphStates.length;
  }

  getSettledRevealElapsedSec() {
    return this._revealFullySettledElapsedSec();
  }

  _revealTimingOptions() {
    return {
      slideDepth: this.getSlideDepth(),
      slideTime: this.getSlideTime(),
      staggerEasing: this.getRevealStaggerEasing(),
    };
  }

  _revealEmissiveDecaySec() {
    return this.isEmissiveSlamEnabled() && this.getEmissiveSlamStrength() > 0
      ? this.getEmissiveSlamDecaySec()
      : 0;
  }

  _revealFullySettledElapsedSec() {
    const duration = this.getDurationSec();
    const decaySec = this._revealEmissiveDecaySec();
    return duration + decaySec;
  }

  /**
   * Map export timeline seconds to reveal elapsed.
   * Export plays reveal once, then holds the settled pose for the rest of the clip
   * (export duration may exceed reveal duration). Viewport Loop toggle is ignored here.
   * @param {number} exportTimeSec
   */
  _resolveExportRevealElapsed(exportTimeSec) {
    const duration = this.getDurationSec();
    if (duration <= 0) return 0;
    const decaySec = this._revealEmissiveDecaySec();
    const endTime = duration + decaySec;
    const t = Math.max(0, exportTimeSec);
    if (decaySec > 0) {
      return Math.min(t, endTime);
    }
    return Math.min(t, duration);
  }

  _areRevealEmissiveSlamMaterialsSettled(elapsedSec = this._elapsed) {
    if (!this.isEmissiveSlamEnabled() || this.getEmissiveSlamStrength() <= 0) return true;
    const duration = this.getDurationSec();
    const count = this._glyphStates.length;
    if (count <= 0 || duration <= 0) return true;
    const timing = this._revealTimingOptions();
    const decaySec = this.getEmissiveSlamDecaySec();
    const checkedSlots = new Set();
    for (let i = 0; i < count; i += 1) {
      const { slotIndex, slotCount } = this._resolveRevealSlot(i);
      const slotKey = `${slotIndex}:${slotCount}`;
      if (checkedSlots.has(slotKey)) continue;
      checkedSlots.add(slotKey);
      const factor = computeGlyphEmissiveSlamFactor(
        slotIndex,
        slotCount,
        elapsedSec,
        duration,
        decaySec,
        timing,
      );
      if (factor > 1e-6) return false;
    }
    return true;
  }

  _shouldRefreshMaterialEmissiveRest() {
    if (!this.isEmissiveSlamEnabled()) return true;
    return this._areRevealEmissiveSlamMaterialsSettled(this._elapsed);
  }

  /**
   * Sync Mesh → Emissive (and related material output) into per-glyph rest cache.
   * Reveal slam overlays this baseline — it never replaces the material slider long-term.
   * @param {{ skipReapply?: boolean }} [options]
   */
  syncMaterialEmissiveBaseline({ skipReapply = false } = {}) {
    if (!this._glyphStates.length) return;
    if (!skipReapply) {
      if (typeof this._reapplyMaterialEmissive === 'function') {
        this._reapplyMaterialEmissive();
      } else {
        this._restoreAllGlyphEmissive();
      }
    }
    for (const state of this._glyphStates) {
      for (const entry of state.meshMaterials) {
        const captured = captureMaterialEmissiveRest(entry.mat);
        entry.restEmissive.copy(captured.restEmissive);
        entry.restEmissiveIntensity = captured.restEmissiveIntensity;
      }
    }
  }

  /**
   * Re-bind glyph meshMaterials after MaterialController swaps materials (e.g. Shader Lab on/off).
   * Pose / timing state is preserved — only material pointers and rest emissive are refreshed.
   */
  _refreshGlyphMaterialReferences() {
    for (const state of this._glyphStates) {
      if (!state.group) continue;
      state.meshMaterials = this._collectGlyphGroupMeshMaterials(state.group);
    }
  }

  /**
   * @param {THREE.Object3D} group
   * @returns {import('./fontTextRevealTypes.js').RevealGlyphState['meshMaterials']}
   */
  _collectGlyphGroupMeshMaterials(group) {
    /** @type {import('./fontTextRevealTypes.js').RevealGlyphState['meshMaterials']} */
    const meshMaterials = [];
    group.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat) continue;
        const { restEmissive, restEmissiveIntensity } = captureMaterialEmissiveRest(mat);
        meshMaterials.push({
          mat,
          opacity: Number.isFinite(mat.opacity) ? mat.opacity : 1,
          transparent: !!mat.transparent,
          restEmissive,
          restEmissiveIntensity,
        });
      }
    });
    return meshMaterials;
  }

  /**
   * After MaterialController updates brightness/metalness/emissive, re-sync baseline
   * and re-apply the current reveal pose (slam overlay or rest restore).
   */
  onMaterialBaselineChanged() {
    if (!this._glyphStates.length) return;

    this._refreshGlyphMaterialReferences();

    if (this._materialBaselineSyncDepth > 0) {
      this.syncMaterialEmissiveBaseline({ skipReapply: true });
      return;
    }

    const slamMayBeLive =
      this.isEmissiveSlamEnabled() &&
      this.getEmissiveSlamStrength() > 0 &&
      !this._areRevealEmissiveSlamMaterialsSettled(this._elapsed);

    this._materialBaselineSyncDepth += 1;
    try {
      if (slamMayBeLive && typeof this._reapplyMaterialEmissive === 'function') {
        // Partial material patches (e.g. fill color) leave reveal slam on live emissive;
        // re-run Mesh → Emissive via MaterialController before capturing rest.
        this._reapplyMaterialEmissive();
      } else {
        this.syncMaterialEmissiveBaseline({ skipReapply: true });
      }
    } finally {
      this._materialBaselineSyncDepth -= 1;
    }

    if (
      this._exportDriveActive
      || this._previewMode === 'playing'
      || this._previewMode === 'paused'
    ) {
      this.applyAtTime(this._elapsed);
      return;
    }
    if (this.isEnabled()) {
      this._syncIdleCompositeClocks();
      this.applyAtTime(this._elapsed);
    } else {
      this._resetGlyphs();
      this._applyTypographyTracking(0, {});
    }
  }

  /**
   * Re-capture per-glyph rest emissive after Material emissive/brightness slider changes.
   */
  refreshMaterialEmissiveRest() {
    this.syncMaterialEmissiveBaseline();
  }

  _restoreAllGlyphEmissive() {
    for (const state of this._glyphStates) {
      restoreRevealGlyphEmissive(state);
    }
  }

  shouldRunLiveUpdate(scene) {
    if (this._previewRaf) return false;
    if (this._exportDriveActive) return false;
    if (scene?.exportMovementPreview?.isActive?.()) return false;
    if (scene?.animationController?.isExportSessionActive?.()) return false;
    if (this._previewMode !== 'playing') return false;
    return this.isEnabled() || this.isTrackingAnimatorActive();
  }

  /**
   * @param {THREE.Object3D | null | undefined} model
   * @returns {boolean}
   */
  ensureBoundToModel(model) {
    if (!isFontExtrudeRevealModel(model)) return false;
    if (this._boundModel !== model || !this._glyphStates.length) {
      this.bindModel(model);
    }
    return this._glyphStates.length > 0;
  }

  /**
   * @param {THREE.Object3D | null | undefined} model
   */
  bindModel(model) {
    this._stopPreviewLoop();
    this._clearTrackingAmountPreviewPin();
    this._constantController?.beginModelTransition?.();
    this._glyphGroups = [];
    this._glyphStates = [];
    this._glyphWordIndices = null;
    this._wordCount = 0;
    this._glyphLineIndices = null;
    this._glyphLineGlyphIndices = null;
    this._lineGlyphCounts = [];
    this._lineHasCircularGlyph = [];
    this._lineCount = 0;
    this._lineRestYBaselines = new Map();
    this._lineGroupMeta = new Map();
    this._wordGroupMeta = new Map();
    /** @type {Map<number, { minX: number, maxX: number, width: number }> | null} */
    this._typographyLayoutBounds = null;
    this._typographyParagraphWidth = 1;
    this._previewMode = 'idle';
    this._resumeRevealWhenPauseAllClears = false;

    if (!isFontExtrudeRevealModel(model)) {
      this._boundModel = null;
      this._resetCompositeClocks();
      this._constantController?.onModelBound?.();
      this._notifyPreviewTime();
      return;
    }

    this._boundModel = model;
    this._collectGlyphGroups(model);
    if (!this._glyphGroups.length) {
      this._upgradeLegacyFontMesh(model);
      this._collectGlyphGroups(model);
    }
    this._buildWordRevealMeta();
    this._buildLineRevealMeta();
    for (const glyphGroup of this._glyphGroups) {
      if (!glyphGroup.userData?.orbyFontGlyphPivotFixed) {
        const isCircularGlyph = !!glyphGroup.userData?.orbyFontCircularTransform;
        if (!isCircularGlyph) {
          this._fixGlyphGroupPivot(glyphGroup);
        }
        glyphGroup.userData.orbyFontGlyphPivotFixed = true;
      }
    }
    this._buildGlyphStates();
    this._buildWordGroupMeta();
    this._buildLineGroupMeta();
    this._buildLineRestYBaselines();
    this._buildTypographyLayoutBounds();
    this.syncMaterialEmissiveBaseline();

    this._showIdlePose();
    this._constantController?.onModelBound?.();
    if (model?.visible) {
      this._constantController?.resumeLiveUpdates?.();
    }
    this._notifyPreviewTime();
  }

  /**
   * Snap reveal + constant animations back to their rest starting pose (phase zero).
   * @param {{ resumeConstant?: boolean, showSettledIdle?: boolean }} [options]
   */
  resetAllAnimations({ resumeConstant = true, showSettledIdle = false } = {}) {
    if (!this.ensureBoundToModel(this._boundModel)) return;

    if (this.isPreviewPlaying()) {
      this._stopPreviewLoop();
    }
    this._clearTrackingAmountPreviewPin();
    this._previewMode = 'idle';
    this._resetCompositeClocks();

    this._constantController?.resetAnimation?.();
    if (
      showSettledIdle
      && (this.isEnabled() || this.isTrackingAnimatorActive())
    ) {
      this._syncIdleCompositeClocks();
      this.applyAtTime(this._elapsed);
    } else {
      this.applyAtTime(0);
    }
    if (resumeConstant && !this.isPauseAll()) {
      this._constantController?.resumeLiveUpdates?.();
    }
    this._notifyPreviewTime();
    this._requestRender();
  }

  /** Snap constant loop back to phase zero — e.g. after Generate or font change. */
  resetConstantAnimation() {
    this._constantController?.resetAnimation?.();
  }

  _buildWordRevealMeta() {
    const indices = this._glyphGroups.map((group) => {
      const idx = group.userData?.orbyFontRevealWordIndex;
      return Number.isFinite(idx) ? idx : NaN;
    });
    const hasWordData = indices.length > 0 && indices.every((idx) => Number.isFinite(idx));
    this._glyphWordIndices = hasWordData ? indices : null;
    this._wordCount = hasWordData ? Math.max(...indices) + 1 : 0;
  }

  _buildWordGroupMeta() {
    this._wordGroupMeta = new Map();
    if (!this._glyphWordIndices || this._wordCount <= 0 || !this._glyphStates.length) return;

    /** @type {Map<number, number[]>} */
    const indicesByWord = new Map();
    for (let i = 0; i < this._glyphWordIndices.length; i += 1) {
      const wordIndex = this._glyphWordIndices[i];
      if (!indicesByWord.has(wordIndex)) indicesByWord.set(wordIndex, []);
      indicesByWord.get(wordIndex).push(i);
    }

    for (const [wordIndex, glyphIndices] of indicesByWord) {
      const parent = this._glyphStates[glyphIndices[0]]?.group?.parent;
      if (!parent) continue;

      parent.updateMatrixWorld(true);
      const box = new THREE.Box3();
      for (const glyphIndex of glyphIndices) {
        const { group } = this._glyphStates[glyphIndex];
        group.updateMatrixWorld(true);
        box.expandByObject(group);
      }
      if (box.isEmpty()) continue;

      const centerWorld = box.getCenter(new THREE.Vector3());
      const center = parent.worldToLocal(centerWorld.clone());
      const size = box.getSize(new THREE.Vector3());
      this._wordGroupMeta.set(wordIndex, {
        center,
        slideDistance: Math.max(size.y * 0.75, 0.08),
      });
    }
  }

  _buildLineRevealMeta() {
    const lineIndices = this._glyphGroups.map((group) => {
      const idx = group.userData?.orbyFontLineIndex;
      return Number.isFinite(idx) ? idx : 0;
    });
    const lineGlyphIndices = this._glyphGroups.map((group, glyphIndex) => {
      const idx = group.userData?.orbyFontLineGlyphIndex;
      return Number.isFinite(idx) ? idx : glyphIndex;
    });
    const hasLineData = this._glyphGroups.some((group) =>
      Number.isFinite(group.userData?.orbyFontLineIndex)
      || Number.isFinite(group.userData?.orbyFontLineGlyphIndex),
    );

    this._glyphLineIndices = hasLineData ? lineIndices : null;
    this._glyphLineGlyphIndices = hasLineData ? lineGlyphIndices : null;
    this._lineCount = hasLineData ? Math.max(...lineIndices) + 1 : 1;
    this._lineGlyphCounts = [];
    this._lineHasCircularGlyph = [];

    if (!hasLineData) return;

    for (let lineIndex = 0; lineIndex < this._lineCount; lineIndex += 1) {
      const fromUserData = this._glyphGroups.find(
        (group) => group.userData?.orbyFontLineIndex === lineIndex,
      )?.userData?.orbyFontLineGlyphCount;
      const counted = this._glyphGroups.filter(
        (group) => group.userData?.orbyFontLineIndex === lineIndex,
      ).length;
      this._lineGlyphCounts[lineIndex] =
        Number.isFinite(fromUserData) && fromUserData > 0 ? fromUserData : counted;
      this._lineHasCircularGlyph[lineIndex] = this._glyphGroups.some(
        (group) =>
          group.userData?.orbyFontLineIndex === lineIndex
          && !!group.userData?.orbyFontCircularTransform,
      );
    }
  }

  _buildLineRestYBaselines() {
    this._lineRestYBaselines = buildLineRestYBaselines(
      this._glyphStates,
      this._glyphLineIndices,
    );
  }

  _buildLineGroupMeta() {
    this._lineGroupMeta = new Map();
    if (!this._glyphStates.length) return;

    const lineCount = this._lineCount > 0 ? this._lineCount : 1;
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      const glyphIndices = [];
      for (let i = 0; i < this._glyphGroups.length; i += 1) {
        const groupLineIndex = this._glyphLineIndices?.[i] ?? 0;
        if (groupLineIndex === lineIndex) glyphIndices.push(i);
      }
      if (!glyphIndices.length) continue;

      const parent = this._glyphStates[glyphIndices[0]]?.group?.parent;
      if (!parent) continue;

      parent.updateMatrixWorld(true);
      const box = new THREE.Box3();
      for (const glyphIndex of glyphIndices) {
        const { group } = this._glyphStates[glyphIndex];
        group.updateMatrixWorld(true);
        box.expandByObject(group);
      }
      if (box.isEmpty()) continue;

      const centerWorld = box.getCenter(new THREE.Vector3());
      const center = parent.worldToLocal(centerWorld.clone());
      const size = box.getSize(new THREE.Vector3());
      this._lineGroupMeta.set(lineIndex, {
        center,
        slideDistance: Math.max(size.y * 0.75, 0.08),
      });
    }
  }

  /**
   * Per-line spread + pivot for constant animation (keeps multi-line text in sync).
   * @param {number} glyphIndex
   */
  resolveConstantMotionSlot(glyphIndex) {
    const glyphCount = this._glyphStates.length;
    const lineIndex = this._glyphLineIndices?.[glyphIndex] ?? 0;
    const lineGlyphIndex = this._glyphLineGlyphIndices?.[glyphIndex] ?? glyphIndex;
    const lineGlyphCount = this._lineGlyphCounts[lineIndex] ?? glyphCount;
    const linePivot = this._lineGroupMeta.get(lineIndex);
    const useLinePivotMotion =
      !!linePivot?.center
      && (this._lineCount > 1 || this._lineHasCircularGlyph[lineIndex]);
    return {
      lineGlyphIndex,
      lineGlyphCount,
      linePivot,
      useLinePivotMotion,
    };
  }

  _buildGlyphStates() {
    this._glyphStates = this._glyphGroups.map((group) => {
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group);
      const size = box.getSize(new THREE.Vector3());
      const slideDistance = Math.max(size.y * 0.75, 0.08);
      const meshMaterials = this._collectGlyphGroupMeshMaterials(group);

      return {
        group,
        restPosition: group.position.clone(),
        restRotationX: group.rotation.x,
        restRotationY: group.rotation.y,
        restRotationZ: group.rotation.z,
        restScale: group.scale.clone(),
        slideDistance,
        meshMaterials,
        lastTypographyX: 0,
        lastTypographyY: 0,
      };
    });
  }

  /** Canonical ink bounds at bind — immune to Shader Lab geometry/material rebuild drift. */
  _buildTypographyLayoutBounds() {
    this._typographyLayoutBounds = null;
    this._typographyParagraphWidth = 1;
    if (!this._glyphStates.length) return;

    for (const state of this._glyphStates) {
      resetRevealGlyphPose(state);
      state.lastTypographyX = 0;
      state.lastTypographyY = 0;
    }
    this._boundModel?.updateMatrixWorld(true);
    const { boundsByLine, paragraphWidth } = computeTypographyLineBoundsFromRest(
      this._glyphStates,
      this._glyphLineIndices,
      this._lineGlyphCounts,
    );
    this._typographyLayoutBounds = boundsByLine;
    this._typographyParagraphWidth = paragraphWidth;
  }

  /** @param {THREE.Object3D} model */
  _collectGlyphGroups(model) {
    this._glyphGroups = [];
    model.traverse((child) => {
      if (child.userData?.orbyFontGlyphGroup) {
        this._glyphGroups.push(child);
      }
    });
    this._glyphGroups.sort(
      (a, b) =>
        (a.userData.orbyFontGlyphIndex ?? 0) - (b.userData.orbyFontGlyphIndex ?? 0),
    );
  }

  /**
   * @param {THREE.Object3D} glyphGroup
   */
  _fixGlyphGroupPivot(glyphGroup) {
    const parent = glyphGroup.parent;
    if (!parent) return;

    parent.updateMatrixWorld(true);
    glyphGroup.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(glyphGroup);
    if (box.isEmpty()) return;

    const centerWorld = box.getCenter(new THREE.Vector3());
    const childStates = glyphGroup.children.map((child) => {
      const worldPos = new THREE.Vector3();
      child.getWorldPosition(worldPos);
      return { child, worldPos };
    });

    const centerLocal = parent.worldToLocal(centerWorld.clone());
    glyphGroup.position.copy(centerLocal);
    glyphGroup.updateMatrixWorld(true);

    for (const { child, worldPos } of childStates) {
      child.position.copy(glyphGroup.worldToLocal(worldPos));
    }
    glyphGroup.updateMatrixWorld(true);
  }

  /**
   * @param {THREE.Object3D} model
   */
  _upgradeLegacyFontMesh(model) {
    if (model.userData?.orbyFontGlyphGroupsUpgraded) return;

    /** @type {Map<number, THREE.Mesh[]>} */
    const meshByGlyph = new Map();
    /** @type {THREE.Mesh[]} */
    const looseMeshes = [];

    model.traverse((child) => {
      if (!child.isMesh || !child.userData?.orbyFontExtrude) return;
      if (child.parent?.userData?.orbyFontGlyphGroup) return;
      const idx = child.userData.orbyFontGlyphIndex;
      if (Number.isFinite(idx)) {
        if (!meshByGlyph.has(idx)) meshByGlyph.set(idx, []);
        meshByGlyph.get(idx).push(child);
      } else {
        looseMeshes.push(child);
      }
    });

    let entries = [...meshByGlyph.entries()].sort((a, b) => a[0] - b[0]);
    if (!entries.length && looseMeshes.length) {
      entries = looseMeshes.map((mesh, index) => [index, [mesh]]);
    }
    if (!entries.length) return;

    for (const [idx, meshes] of entries) {
      const glyphGroup = new THREE.Group();
      glyphGroup.userData.orbyFontGlyphGroup = true;
      glyphGroup.userData.orbyFontGlyphIndex = idx;
      model.add(glyphGroup);

      for (const mesh of meshes) {
        mesh.parent?.remove(mesh);
        glyphGroup.add(mesh);
      }
    }

    model.userData.orbyFontGlyphGroupsUpgraded = true;
  }

  unbind() {
    this._stopPreviewLoop();
    this._resetGlyphs();
    this._glyphGroups = [];
    this._glyphStates = [];
    this._glyphWordIndices = null;
    this._wordCount = 0;
    this._glyphLineIndices = null;
    this._glyphLineGlyphIndices = null;
    this._lineGlyphCounts = [];
    this._lineHasCircularGlyph = [];
    this._lineCount = 0;
    this._lineRestYBaselines = new Map();
    this._lineGroupMeta = new Map();
    this._wordGroupMeta = new Map();
    this._boundModel = null;
    this._resetCompositeClocks();
    this._exportDriveActive = false;
    this._previewMode = 'idle';
    this._resumeRevealWhenPauseAllClears = false;
    this._constantController?.unbind?.();
    this._notifyPreviewTime();
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   * @returns {boolean}
   */
  startPreview(model) {
    const target = model ?? this._boundModel;
    if (!this.ensureBoundToModel(target)) return false;
    if (this.isPauseAll()) return false;
    this._clearTrackingAmountPreviewPin();
    const duration = this.getPreviewDurationSec();

    const atTimelineEnd = this._elapsed >= Math.max(0, duration - 1e-4);
    const atTimelineStart =
      this._elapsed <= 1e-4 && this._trackingMotionElapsed <= 1e-4;
    if (this._previewMode !== 'paused' || atTimelineEnd || atTimelineStart) {
      this._resetCompositeClocks();
      this.applyAtTime(0);
    }

    // Keep the constant loop phase locked to the reveal timeline so the
    // composite preview is coherent across play / pause / resume.
    this._constantController?.setPreviewElapsed?.(this._elapsed);

    this._previewMode = 'playing';
    this._stopPreviewLoop();
    if (this.isPreviewAnimationActive()) {
      this._startPreviewLoop();
    }
    this._notifyPreviewTime();
    this._requestRender();
    return true;
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   * @returns {boolean}
   */
  pausePreview(model) {
    const target = model ?? this._boundModel;
    if (!this.ensureBoundToModel(target)) return false;
    if (this._previewMode !== 'playing') return false;

    this._previewMode = 'paused';
    this._stopPreviewLoop();
    this._notifyPreviewTime();
    this._requestRender();
    return true;
  }

  /**
   * Pause or resume all font animation playback (reveal preview + constant loop).
   * @param {boolean} active
   * @param {THREE.Object3D | null | undefined} [model]
   */
  applyPauseAll(active, model) {
    const target = model ?? this._boundModel;
    if (active) {
      if (this.isPreviewPlaying() && this.ensureBoundToModel(target)) {
        this._resumeRevealWhenPauseAllClears = true;
        this.pausePreview(target);
      } else {
        this._resumeRevealWhenPauseAllClears = false;
      }
      this._requestRender();
      return;
    }

    if (
      this._resumeRevealWhenPauseAllClears
      && this.ensureBoundToModel(target)
      && this.isEnabled()
      && !this.isPauseAll()
    ) {
      this._resumeRevealWhenPauseAllClears = false;
      this.startPreview(target);
    } else {
      this._resumeRevealWhenPauseAllClears = false;
    }
    this._requestRender();
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   * @returns {boolean}
   * @deprecated use startPreview / pausePreview
   */
  togglePreview(model) {
    if (this._previewMode === 'playing') return !this.pausePreview(model);
    return this.startPreview(model);
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   * @deprecated use startPreview
   */
  restartPreview(model) {
    const target = model ?? this._boundModel;
    if (!this.ensureBoundToModel(target)) return false;

    this._previewMode = 'playing';
    this._resetCompositeClocks();
    this.applyAtTime(0);
    this._stopPreviewLoop();
    if (this.isPreviewAnimationActive()) {
      this._startPreviewLoop();
    }
    this._notifyPreviewTime();
    this._requestRender();
    return true;
  }

  /**
   * @param {number} progress
   * @param {THREE.Object3D | null | undefined} [model]
   */
  scrubPreview(progress, model) {
    const target = model ?? this._boundModel;
    if (!this.ensureBoundToModel(target)) return false;

    this._clearTrackingAmountPreviewPin();
    const duration = this.getPreviewDurationSec();
    const p = Math.max(0, Math.min(1, Number(progress) || 0));
    this._previewMode = 'paused';
    this._stopPreviewLoop();
    this._elapsed = p * duration;
    const trackingTime = this.getTrackingAnimatorTimeSec();
    this._trackingMotionElapsed = computeScrubTrackingMotionElapsed(this._elapsed, trackingTime);
    this._trackingElapsed = this._trackingMotionElapsed;
    this._constantController?.setPreviewElapsed?.(this._elapsed);
    this.applyAtTime(this._elapsed);
    this._notifyPreviewTime();
    this._requestRender();
    return true;
  }

  stopPreview() {
    this._previewMode = 'idle';
    this._stopPreviewLoop();
    this._showIdlePose();
    this._notifyPreviewTime();
    this._requestRender();
  }

  /**
   * @param {number} elapsedSec
   * @param {{ skipConstant?: boolean, trackingPreviewElapsed?: number }} [options]
   */
  applyAtTime(elapsedSec, options = {}) {
    const duration = this.getDurationSec();
    const count = this._glyphStates.length;
    if (count === 0) return;

    const type = this.getRevealType();
    const revealActive = isFontRevealAnimationActive(type) && duration > 0;

    if (!revealActive) {
      for (const state of this._glyphStates) {
        resetRevealGlyphPose(state);
        state.lastTypographyX = 0;
        state.lastTypographyY = 0;
      }
    }

    this._applyTypographyTracking(elapsedSec, options);

    if (revealActive) {
      const slideDepth = this.getSlideDepth();
      const slideTime = this.getSlideTime();
      const slideDirection = this.getSlideDirection();
      const emissiveEnabled = this.isEmissiveSlamEnabled();
      const emissiveStrength = this.getEmissiveSlamStrength();
      const emissiveDecaySec = this.getEmissiveSlamDecaySec();
      const emissiveColor = this.getEmissiveSlamColor();
      const timing = {
        slideDepth,
        slideTime,
        staggerEasing: this.getRevealStaggerEasing(),
      };
      const useWordGroup = this.getRevealUnit() === 'word' && this._wordGroupMeta.size > 0;
      for (let i = 0; i < count; i += 1) {
        const state = this._glyphStates[i];
        const { slotIndex, slotCount } = this._resolveRevealSlot(i);
        const landLinear = computeGlyphSlotProgress(
          slotIndex,
          slotCount,
          elapsedSec,
          duration,
          timing,
        );
        const eased = computeGlyphRevealEase(
          type,
          slotIndex,
          slotCount,
          elapsedSec,
          duration,
          timing,
        );
        const slideProgress = computeGlyphSlideProgress(
          slotIndex,
          slotCount,
          elapsedSec,
          duration,
          timing,
        );
        const wordIndex = this._glyphWordIndices?.[i];
        const wordPivot =
          useWordGroup && Number.isFinite(wordIndex)
            ? this._wordGroupMeta.get(wordIndex)
            : undefined;
        applyRevealPoseToGlyph(type, eased, state, {
          slideProgress,
          landLinear,
          slideDepth,
          slideDirection,
          wordPivot,
        });
        applyRevealEmissiveSlam(state, {
          enabled: emissiveEnabled,
          strength: emissiveStrength,
          decaySec: emissiveDecaySec,
          colorHex: emissiveColor,
          glyphIndex: slotIndex,
          glyphCount: slotCount,
          elapsedSec,
          totalDurationSec: duration,
          slideDepth,
          slideTime,
          staggerEasing: timing.staggerEasing,
        });
      }
    }

    if (!options.skipConstant) {
      this._constantController?.applyToGlyphStates(this._glyphStates);
    }
    this._boundModel?.updateMatrixWorld?.(true);
  }

  /**
   * Live letter-spacing + optional tracking animator — offsets glyph groups from baked layout.
   * @param {number} elapsedSec
   * @param {{ trackingPreviewElapsed?: number }} [options]
   */
  _applyTypographyTracking(elapsedSec, options = {}) {
    if (!this._glyphStates.length || !isFontTrackingAnimatorModel(this._boundModel)) return;

    const bakedTracking = this.getBakedTracking();
    const masterTracking = this.getMasterTracking();
    let targetTracking = masterTracking;

    if (this._isTrackingAnimatorConfigured()) {
      const motionElapsed = this._resolveTrackingMotionElapsed(elapsedSec, options);
      const percent = this.getTrackingAnimatorAmountPercent();
      const amountIncrease = computeTrackingAnimatorAmountFromPercent(
        masterTracking,
        percent,
      );
      const durationSec = this.getTrackingAnimatorTimeSec();
      const progress = computeTrackingAnimatorProgress(
        motionElapsed,
        durationSec,
        this.getTrackingAnimatorEasing(),
      );
      targetTracking = computeAnimatedTrackingValue(
        masterTracking,
        amountIncrease,
        progress,
      );
    }

    applyTrackingAnimatorToGlyphStates(this._glyphStates, {
      animatedTracking: targetTracking,
      generatedTracking: bakedTracking,
      bakedAlign: this.getBakedAlign(),
      masterAlign: this.getMasterAlign(),
      layoutFontSize: this.getLayoutFontSize(),
      lineIndices: this._glyphLineIndices,
      lineGlyphIndices: this._glyphLineGlyphIndices,
      lineGlyphCounts: this._lineGlyphCounts,
      bakedLineHeight: this.getBakedLineHeight(),
      masterLineHeight: this.getMasterLineHeight(),
      lineRestYBaselines: this._lineRestYBaselines,
      layoutBounds: this._typographyLayoutBounds,
      paragraphWidth: this._typographyParagraphWidth,
    });
  }

  _resetGlyphs() {
    for (const state of this._glyphStates) {
      resetRevealGlyphPose(state);
      state.lastTypographyX = 0;
      state.lastTypographyY = 0;
    }
    this._boundModel?.updateMatrixWorld?.(true);
  }

  /** Settle glyph groups before voxel SAT sampling (reveal offsets distort the grid). */
  snapGlyphsForVoxelization() {
    if (!this._boundModel || !this._glyphStates.length) return;
    if (this.isEnabled() || this.isTrackingAnimatorActive()) {
      this._syncIdleCompositeClocks();
      this.applyAtTime(this._elapsed, { skipConstant: true });
    } else {
      this._resetGlyphs();
    }
    this._boundModel.updateMatrixWorld(true);
  }

  _showIdlePose() {
    if (
      this.isEnabled()
      || this.isTrackingAnimatorActive()
      || this._constantController?.isEnabled?.()
    ) {
      this._syncIdleCompositeClocks();
      this.applyAtTime(this._elapsed);
    } else {
      this._resetCompositeClocks();
      this.applyAtTime(0);
    }
    this._syncStudioPlacementAfterIdlePose();
  }

  /** Re-center font block on studio origin after idle typography/reveal pose settles. */
  _syncStudioPlacementAfterIdlePose() {
    if (this._previewMode === 'playing' || this._previewMode === 'paused') return;
    this.onTypographyLayoutChange?.();
  }

  _notifyPreviewTime() {
    this.onPreviewTimeUpdate?.({
      elapsed: this._elapsed,
      duration: this.getPreviewDurationSec(),
      playing: this._previewMode === 'playing',
    });
  }

  _requestRender() {
    this.onNeedRender?.();
  }

  _startPreviewLoop() {
    if (this._previewRaf) return;
    this._previewLastTs = performance.now();

    const tick = (now) => {
      this._previewRaf = 0;
      if (this.isPauseAll()) return;
      if (this._previewMode !== 'playing' || !this.isPreviewAnimationActive()) return;

      const delta = Math.max(0, (now - this._previewLastTs) / 1000);
      this._previewLastTs = now;
      this.update(delta);
      this._requestRender();

      if (this._previewMode === 'playing') {
        this._previewRaf = requestAnimationFrame(tick);
      }
    };

    this._previewRaf = requestAnimationFrame(tick);
  }

  _stopPreviewLoop() {
    if (!this._previewRaf) return;
    cancelAnimationFrame(this._previewRaf);
    this._previewRaf = 0;
  }

  /**
   * @param {number} delta
   */
  update(delta) {
    if (this._previewRaf) return;
    if (this.isPauseAll()) return;
    if (this._previewMode !== 'playing' || !this.isPreviewAnimationActive()) return;

    // Single rule for every combination of settings: advance the reveal and the
    // constant together, then wrap (or stop, if Loop is off) at the composite
    // window. The window always covers the full settled reveal plus whole
    // constant cycles, so nothing is ever cut off mid-fade or mid-spin.
    const previewLen = this.getPreviewDurationSec();
    const d = typeof delta === 'number' && Number.isFinite(delta) ? delta : 0;
    this._elapsed += d;
    this._advanceTrackingMotion(d);
    this._constantController?.advance(d);

    if (this._elapsed >= previewLen) {
      if (this.isLoopEnabled()) {
        this._resetCompositeClocks();
        this._constantController?.setPreviewElapsed?.(0);
        this.applyAtTime(0, { trackingPreviewElapsed: 0 });
      } else {
        this._elapsed = previewLen;
        this._previewMode = 'paused';
        this._stopPreviewLoop();
        this.applyAtTime(this._elapsed);
      }
      this._notifyPreviewTime();
      return;
    }
    this.applyAtTime(this._elapsed);
    this._notifyPreviewTime();
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   */
  onDurationChange(model) {
    this._applySettingsChange(model);
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   */
  onRevealTimingChange(model) {
    this._applySettingsChange(model);
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   */
  onRevealTypeChange(model) {
    this._applySettingsChange(model);
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   */
  onRevealEmissiveChange(model) {
    this._applySettingsChange(model);
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   */
  _applyLiveTypographyChange(model) {
    if (!this.ensureBoundToModel(model ?? this._boundModel)) return;
    if (this._previewMode === 'playing' || this._previewMode === 'paused') {
      this.applyAtTime(this._elapsed);
    } else {
      this._syncIdleCompositeClocks();
      this.applyAtTime(this._elapsed);
      this._syncStudioPlacementAfterIdlePose();
    }
    this._notifyPreviewTime();
    this._requestRender();
  }

  _ensurePreviewLoopRunning() {
    if (this._previewMode !== 'playing') return;
    if (!this.isPreviewAnimationActive()) return;
    this._startPreviewLoop();
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   */
  onTypographyTrackingChange(model) {
    this._applyLiveTypographyChange(model);
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   */
  onTypographyAlignChange(model) {
    this._applyLiveTypographyChange(model);
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   */
  onTypographyLineHeightChange(model) {
    this._applyLiveTypographyChange(model);
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   * @param {{ pinTrackingAmountPreview?: boolean, resetPreview?: boolean, resetTrackingClock?: boolean }} [options]
   */
  onTrackingAnimatorChange(model, options = {}) {
    if (!this.ensureBoundToModel(model ?? this._boundModel)) {
      this._notifyPreviewTime();
      return;
    }
    const inPreview =
      this._previewMode === 'playing' || this._previewMode === 'paused';
    const wasPlaying = this._previewMode === 'playing';
    if (options.resetPreview) {
      this._previewMode = 'idle';
      this._stopPreviewLoop();
      this._resetCompositeClocks();
      this._constantController?.setPreviewElapsed?.(0);
    }
    if (options.resetTrackingClock) {
      this._resetTrackingClock();
    } else {
      this._reconcileTrackingMotionToTime();
    }
    if (options.pinTrackingAmountPreview && !inPreview) {
      this._trackingAmountPreviewPinned = true;
    } else if (inPreview) {
      this._clearTrackingAmountPreviewPin();
    } else if (options.resetTrackingClock) {
      // Keep Amount Start pinned while tuning Tracking Time / easing at idle (see UI handlers).
    } else {
      this._clearTrackingAmountPreviewPin();
    }
    this._applySettingsChange(model, { ...options, skipEnsureBound: true });
    if (wasPlaying) {
      this._previewLastTs = performance.now();
      this._ensurePreviewLoopRunning();
    }
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   * @param {{ trackingPreviewElapsed?: number, skipEnsureBound?: boolean, resetPreview?: boolean, resetTrackingClock?: boolean }} [options]
   */
  _applySettingsChange(model, options = {}) {
    if (!options.skipEnsureBound) {
      this.ensureBoundToModel(model ?? this._boundModel);
    }
    if (this._glyphStates.length && !this.isEmissiveSlamEnabled()) {
      this._restoreAllGlyphEmissive();
    }
    if (this._glyphStates.length && this._shouldRefreshMaterialEmissiveRest()) {
      this.refreshMaterialEmissiveRest();
    }
    if (!this._glyphStates.length) {
      this._notifyPreviewTime();
      return;
    }
    if (!this.isEnabled() && !this.isTrackingAnimatorActive()) {
      this._previewMode = 'idle';
      this._stopPreviewLoop();
      if (this._constantController?.isEnabled?.()) {
        this._elapsed = 0;
        this.applyAtTime(0);
      } else {
        this._resetGlyphs();
        this._elapsed = 0;
      }
      this._notifyPreviewTime();
      this._requestRender();
      return;
    }
    if (this._previewMode === 'playing' || this._previewMode === 'paused') {
      // Clamp to the composite window so an active constant loop isn't yanked
      // back when only the reveal duration is being nudged mid-preview.
      this._elapsed = Math.min(this._elapsed, this.getPreviewDurationSec());
      this.applyAtTime(this._elapsed);
    } else if (options.resetPreview) {
      this.applyAtTime(this._elapsed, options);
      this._syncStudioPlacementAfterIdlePose();
    } else if (options.resetTrackingClock) {
      this.applyAtTime(this._elapsed, { ...options, trackingPreviewElapsed: 0 });
      this._syncStudioPlacementAfterIdlePose();
    } else {
      this._syncIdleCompositeClocks();
      this.applyAtTime(this._elapsed, options);
      this._syncStudioPlacementAfterIdlePose();
    }
    this._notifyPreviewTime();
    this._requestRender();
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   */
  beginExportDrive(model) {
    this._stopPreviewLoop();
    this.ensureBoundToModel(model ?? this._boundModel);
    this._constantController?.beginExportDrive?.();
    const revealActive = this.isEnabled();
    const trackingActive = this.isTrackingAnimatorActive();
    const constantActive = this._constantController?.isEnabled?.() ?? false;
    if (!revealActive && !constantActive && !trackingActive) {
      this._exportDriveActive = false;
      return;
    }
    this._exportDriveActive = true;
    this._previewMode = 'idle';
    // Pose is driven each tick by applyExportTime / applyExportFrame.
    this._requestRender();
  }

  /**
   * @param {number} frameIndex
   * @param {number} fps
   * @param {THREE.Object3D | null | undefined} [model]
   */
  applyExportFrame(frameIndex, fps, model) {
    const elapsed = Math.max(0, frameIndex) / Math.max(1, fps);
    this.applyExportTime(elapsed, model);
  }

  /**
   * @param {number} exportTimeSec
   * @param {THREE.Object3D | null | undefined} [model]
   */
  /**
   * @param {number} exportTimeSec
   * @param {THREE.Object3D | null | undefined} [model]
   * @returns {boolean}
   */
  isFullyHiddenAtExportTime(exportTimeSec, model) {
    if (!this.ensureBoundToModel(model ?? this._boundModel)) return false;
    if (!this.isEnabled() || this._glyphStates.length === 0) return false;

    const duration = this.getDurationSec();
    if (duration <= 0) return false;

    const type = this.getRevealType();
    const elapsed = this._resolveExportRevealElapsed(Math.max(0, exportTimeSec));
    const timing = this._revealTimingOptions();
    const slideDepth = this.getSlideDepth();

    for (let i = 0; i < this._glyphStates.length; i += 1) {
      const { slotIndex, slotCount } = this._resolveRevealSlot(i);
      const eased = computeGlyphRevealEase(
        type,
        slotIndex,
        slotCount,
        elapsed,
        duration,
        timing,
      );
      const landLinear = computeGlyphSlotProgress(
        slotIndex,
        slotCount,
        elapsed,
        duration,
        timing,
      );
      const slideProgress = computeGlyphSlideProgress(
        slotIndex,
        slotCount,
        elapsed,
        duration,
        timing,
      );
      if (
        isRevealGlyphVisibleAtExportProgress(type, {
          eased,
          landLinear,
          slideProgress,
          slideDepth,
        })
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * First export frame index where at least one glyph is visible.
   *
   * @param {number} startFrameIndex
   * @param {number} totalFrames
   * @param {number} fps
   * @param {THREE.Object3D | null | undefined} [model]
   * @returns {number}
   */
  findFirstVisibleExportFrameIndex(startFrameIndex, totalFrames, fps, model) {
    const start = Math.max(0, Math.round(startFrameIndex));
    const frames = Math.max(1, Math.round(totalFrames));
    const rate = Math.max(1, fps);
    if (!this.isFullyHiddenAtExportTime(start / rate, model)) return start;
    for (let i = start + 1; i < frames; i += 1) {
      if (!this.isFullyHiddenAtExportTime(i / rate, model)) return i;
    }
    return start;
  }

  applyExportTime(exportTimeSec, model) {
    this.ensureBoundToModel(model ?? this._boundModel);
    const revealActive = this.isEnabled();
    const trackingActive = this.isTrackingAnimatorActive();
    const constantActive = this._constantController?.isEnabled?.() ?? false;
    if (!revealActive && !constantActive && !trackingActive) return;
    this._exportDriveActive = true;
    const elapsed = Math.max(0, exportTimeSec);
    this._trackingElapsed = elapsed;
    this._constantController?.setExportElapsed?.(elapsed);
    this._elapsed = revealActive
      ? this._resolveExportRevealElapsed(elapsed)
      : elapsed;
    this.applyAtTime(this._elapsed);
    this._requestRender();
  }

  endExportDrive() {
    if (!this._exportDriveActive) return;
    this._exportDriveActive = false;
    this._constantController?.endExportDrive?.();
    this._previewMode = 'idle';
    this._showIdlePose();
    this._notifyPreviewTime();
    this._requestRender();
  }
}
