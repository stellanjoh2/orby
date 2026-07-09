import {
  applyConstantOffsetToGlyph,
  clampFontConstantIntensityForType,
  clampFontConstantSpeedSec,
  clampFontConstantSpread,
  computeConstantSpinStaggerDelaySec,
  DEFAULT_FONT_CONSTANT_INTENSITY,
  DEFAULT_FONT_CONSTANT_SPEED_SEC,
  DEFAULT_FONT_CONSTANT_SPREAD,
  DEFAULT_FONT_CONSTANT_TYPE,
  isFontConstantAnimationActive,
  isFontConstantSpinType,
  isFontConstantTypeEnabled,
  normalizeFontConstantType,
} from './fontTextConstantTypes.js';

export {
  DEFAULT_FONT_CONSTANT_INTENSITY,
  DEFAULT_FONT_CONSTANT_SPEED_SEC,
  DEFAULT_FONT_CONSTANT_SPREAD,
  DEFAULT_FONT_CONSTANT_TYPE,
  clampFontConstantIntensityForType,
  clampFontConstantSpeedSec,
  clampFontConstantSpread,
  isFontConstantAnimationActive,
  isFontConstantTypeEnabled,
  normalizeFontConstantType,
} from './fontTextConstantTypes.js';

/**
 * Continuous looping motion for extruded font glyph groups.
 * Composes additively on top of {@link FontTextRevealController} poses.
 */
export class FontTextConstantController {
  /**
   * @param {{
   *   stateStore?: import('../StateStore.js').StateStore,
   *   revealController?: import('./FontTextRevealController.js').FontTextRevealController,
   *   onNeedRender?: () => void,
   * }} [options]
   */
  constructor({ stateStore, revealController = null, onNeedRender = null } = {}) {
    this.stateStore = stateStore;
    this._revealController = revealController;
    this.onNeedRender = onNeedRender;
    this._elapsed = 0;
    this._exportDriveActive = false;
    /** Hold elapsed + live updates during model bind / spawn. */
    this._suspendLiveUpdates = true;
    /** @type {import('./fontTextConstantTypes.js').FontConstantTypeId | null} */
    this._lastAppliedType = null;
  }

  /** @param {import('./FontTextRevealController.js').FontTextRevealController} controller */
  setRevealController(controller) {
    this._revealController = controller;
  }

  getType() {
    return normalizeFontConstantType(this.stateStore?.getState()?.fontExtrude?.constantType);
  }

  getIntensity() {
    const raw = this.stateStore?.getState()?.fontExtrude?.constantIntensity;
    return clampFontConstantIntensityForType(
      this.getType(),
      raw ?? DEFAULT_FONT_CONSTANT_INTENSITY,
    );
  }

  getSpeedSec() {
    const raw = this.stateStore?.getState()?.fontExtrude?.constantSpeedSec;
    return clampFontConstantSpeedSec(raw ?? DEFAULT_FONT_CONSTANT_SPEED_SEC);
  }

  getSpread() {
    const raw = this.stateStore?.getState()?.fontExtrude?.constantSpread;
    return clampFontConstantSpread(raw ?? DEFAULT_FONT_CONSTANT_SPREAD);
  }

  getElapsed() {
    return this._elapsed;
  }

  isPauseAll() {
    return this.stateStore?.getState()?.fontExtrude?.pauseAllAnimations === true;
  }

  isEnabled() {
    return isFontConstantTypeEnabled(this.getType(), this.getIntensity());
  }

  /**
   * True loop period of the active constant motion, in seconds, or 0 when none
   * is active. Sine-based motions (float/wave/breathe/sway) repeat every Speed
   * seconds — the per-letter spread is only a phase offset. Spin shares one
   * sequence across the whole string, so when letters are staggered the string
   * doesn't return to rest until the last letter has finished: its period is
   * `(glyphCount - 1) * staggerDelay + Speed`.
   */
  getLoopCycleSec() {
    if (!this.isEnabled()) return 0;
    const speedSec = this.getSpeedSec();
    if (!isFontConstantSpinType(this.getType())) return speedSec;
    const staggerDelaySec = computeConstantSpinStaggerDelaySec(this.getIntensity());
    const count = Math.max(1, this._revealController?.getGlyphCount?.() ?? 1);
    return (count - 1) * staggerDelaySec + speedSec;
  }

  /** @param {number} delta */
  advance(delta) {
    if (this._suspendLiveUpdates || !this.isEnabled() || this.isPauseAll()) return;
    const d = typeof delta === 'number' && Number.isFinite(delta) ? delta : 0;
    this._elapsed += d;
  }

  /** Pause live constant updates while a font mesh is being replaced. */
  beginModelTransition() {
    this._suspendLiveUpdates = true;
    this._elapsed = 0;
  }

  /**
   * Restart constant loop phase and snap glyphs to the neutral pose.
   * @param {{ reapply?: boolean }} [options]
   */
  resetAnimation({ reapply = true } = {}) {
    this._elapsed = 0;
    this._lastAppliedType = this.getType();
    if (reapply) {
      const reveal = this._revealController;
      if (!this.isEnabled() && reveal) {
        this._disableConstantMotion(reveal);
      } else {
        this._reapplyComposite();
      }
      this.onNeedRender?.();
    }
  }

  /**
   * @param {Array<import('./fontTextRevealTypes.js').RevealGlyphState>} glyphStates
   */
  applyToGlyphStates(glyphStates) {
    if (!this.isEnabled() || !glyphStates?.length) return;

    const type = this.getType();
    const intensity = this.getIntensity();
    const speedSec = this.getSpeedSec();
    const spread = this.getSpread();
    const elapsed = this._elapsed;
    const count = glyphStates.length;

    for (let i = 0; i < count; i += 1) {
      const motionSlot = this._revealController?.resolveConstantMotionSlot?.(i) ?? {};
      applyConstantOffsetToGlyph(glyphStates[i], i, count, elapsed, {
        type,
        intensity,
        speedSec,
        spread,
        lineGlyphIndex: motionSlot.lineGlyphIndex,
        lineGlyphCount: motionSlot.lineGlyphCount,
        linePivot: motionSlot.linePivot,
        useLinePivotMotion: motionSlot.useLinePivotMotion,
      });
    }
  }

  /**
   * @param {import('../SceneManager.js').SceneManager} scene
   */
  shouldRunLiveUpdate(scene) {
    if (this._suspendLiveUpdates) return false;
    if (this._exportDriveActive) return false;
    if (this.isPauseAll()) return false;
    if (scene?.exportMovementPreview?.isActive?.()) return false;
    if (this._revealController?.isPreviewPlaying?.()) return false;
    if (!this.isEnabled()) return false;
    return (this._revealController?.getGlyphCount?.() ?? 0) > 0;
  }

  /** @param {number} delta */
  update(delta) {
    if (this._suspendLiveUpdates) return;
    this._syncConstantTypeChange();
    this.advance(delta);
    this._reapplyComposite();
  }

  /** @param {THREE.Object3D | null | undefined} [model] */
  onSettingsChange(model) {
    const reveal = this._revealController;
    if (!reveal) return;
    reveal.ensureBoundToModel(model ?? reveal._boundModel);
    this._syncConstantTypeChange();
    if (!this.isEnabled()) {
      this._disableConstantMotion(reveal);
    } else {
      this._reapplyComposite();
    }
    // Speed / type / intensity changes resize the composite preview window, so
    // refresh the reveal preview timeline (scrub + time label) to match.
    reveal.refreshPreviewTimeline?.();
    this.onNeedRender?.();
  }

  onModelBound() {
    this._elapsed = 0;
    this._lastAppliedType = this.getType();
    this._suspendLiveUpdates = true;
  }

  /** Resume live constant updates after bind/spawn — snaps loop back to phase zero. */
  resumeLiveUpdates() {
    if (this._exportDriveActive) return;
    this._suspendLiveUpdates = false;
    this.resetAnimation();
  }

  unbind() {
    this._elapsed = 0;
    this._exportDriveActive = false;
    this._lastAppliedType = null;
    this._suspendLiveUpdates = true;
  }

  beginExportDrive() {
    this._exportDriveActive = true;
    this._elapsed = 0;
  }

  /** @param {number} exportTimeSec */
  setExportElapsed(exportTimeSec) {
    this._elapsed = Math.max(0, exportTimeSec);
  }

  /**
   * Align the constant loop phase with the reveal preview timeline (play /
   * pause / scrub / loop seam). Explicit set — bypasses the live-update suspend
   * guard, since the reveal preview owns the phase while it drives playback.
   * @param {number} sec
   */
  setPreviewElapsed(sec) {
    const v = Number(sec);
    this._elapsed = Number.isFinite(v) && v > 0 ? v : 0;
  }

  endExportDrive() {
    this._exportDriveActive = false;
  }

  _syncConstantTypeChange() {
    const type = this.getType();
    if (this._lastAppliedType === null) {
      this._lastAppliedType = type;
      return;
    }
    if (type === this._lastAppliedType) return;
    this._resetForConstantTypeChange(type);
  }

  /**
   * Snap glyphs back to their reveal/rest pose and restart constant phase at zero.
   * @param {import('./fontTextConstantTypes.js').FontConstantTypeId} nextType
   */
  _resetForConstantTypeChange(nextType) {
    this._lastAppliedType = nextType;
    this._elapsed = 0;

    const reveal = this._revealController;
    if (!reveal) return;
    if (!isFontConstantTypeEnabled(nextType, this.getIntensity())) {
      this._disableConstantMotion(reveal);
      return;
    }
    this._snapGlyphsWithoutConstant(reveal);
  }

  /**
   * @param {import('./FontTextRevealController.js').FontTextRevealController} reveal
   */
  _resolveRevealElapsedForComposite(reveal) {
    if (reveal.isPreviewPlaying?.() || reveal.isPreviewPaused?.()) {
      return reveal.getPreviewElapsed();
    }
    if (reveal.isEnabled?.()) {
      return reveal.getSettledRevealElapsedSec();
    }
    return 0;
  }

  /**
   * @param {import('./FontTextRevealController.js').FontTextRevealController} reveal
   */
  _snapGlyphsWithoutConstant(reveal) {
    if (!reveal.ensureBoundToModel(reveal._boundModel)) return;
    reveal.applyAtTime(this._resolveRevealElapsedForComposite(reveal), { skipConstant: true });
  }

  /**
   * Turn off looping motion and restore the pre-loop reveal/rest pose (never
   * leave glyphs frozen mid-cycle).
   * @param {import('./FontTextRevealController.js').FontTextRevealController} reveal
   */
  _disableConstantMotion(reveal) {
    if (!reveal?.ensureBoundToModel(reveal._boundModel)) return;

    this._elapsed = 0;
    this.setPreviewElapsed(0);
    this._lastAppliedType = this.getType();

    const inPreview = reveal.isPreviewPlaying?.() || reveal.isPreviewPaused?.();
    const previewIsConstantOnly = inPreview
      && !reveal.isEnabled?.()
      && !reveal.isTrackingAnimatorActive?.();

    if (previewIsConstantOnly) {
      reveal._previewMode = 'idle';
      reveal._stopPreviewLoop?.();
      reveal._resetCompositeClocks?.();
      reveal.applyAtTime(0, { skipConstant: true });
      reveal._notifyPreviewTime?.();
      return;
    }

    if (inPreview) {
      reveal.applyAtTime(reveal.getPreviewElapsed(), { skipConstant: true });
      return;
    }

    reveal._syncIdleCompositeClocks?.();
    reveal.applyAtTime(reveal.getPreviewElapsed(), { skipConstant: true });
  }

  _reapplyComposite() {
    const reveal = this._revealController;
    if (!reveal) return;
    if (reveal.isPreviewPlaying?.()) return;

    if (!reveal.ensureBoundToModel(reveal._boundModel)) return;

    if (!this.isEnabled()) {
      this._disableConstantMotion(reveal);
      return;
    }

    reveal.applyAtTime(this._resolveRevealElapsedForComposite(reveal));
  }
}
