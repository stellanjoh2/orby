import {
  applyConstantOffsetToGlyph,
  clampFontConstantIntensityForType,
  clampFontConstantSpeedSec,
  clampFontConstantSpread,
  DEFAULT_FONT_CONSTANT_INTENSITY,
  DEFAULT_FONT_CONSTANT_SPEED_SEC,
  DEFAULT_FONT_CONSTANT_SPREAD,
  DEFAULT_FONT_CONSTANT_TYPE,
  isFontConstantAnimationActive,
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

  isEnabled() {
    return isFontConstantAnimationActive(this.getType()) && this.getIntensity() > 0;
  }

  /** @param {number} delta */
  advance(delta) {
    if (!this.isEnabled()) return;
    const d = typeof delta === 'number' && Number.isFinite(delta) ? delta : 0;
    this._elapsed += d;
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
    if (this._exportDriveActive) return false;
    if (scene?.exportMovementPreview?.isActive?.()) return false;
    if (this._revealController?.isPreviewPlaying?.()) return false;
    if (!this.isEnabled()) return false;
    return (this._revealController?.getGlyphCount?.() ?? 0) > 0;
  }

  /** @param {number} delta */
  update(delta) {
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
    this._reapplyComposite();
    this.onNeedRender?.();
  }

  onModelBound() {
    this._elapsed = 0;
    this._lastAppliedType = this.getType();
  }

  unbind() {
    this._elapsed = 0;
    this._exportDriveActive = false;
    this._lastAppliedType = null;
  }

  beginExportDrive() {
    this._exportDriveActive = true;
    this._elapsed = 0;
  }

  /** @param {number} exportTimeSec */
  setExportElapsed(exportTimeSec) {
    this._elapsed = Math.max(0, exportTimeSec);
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
    if (reveal.isPreviewPlaying?.()) return;
    if (!reveal.ensureBoundToModel(reveal._boundModel)) return;

    let revealElapsed = 0;
    if (reveal.isEnabled?.()) {
      revealElapsed = reveal.isPreviewPaused?.()
        ? reveal.getPreviewElapsed()
        : reveal.getSettledRevealElapsedSec();
    }
    reveal.applyAtTime(revealElapsed, { skipConstant: true });
  }

  _reapplyComposite() {
    const reveal = this._revealController;
    if (!reveal) return;
    if (reveal.isPreviewPlaying?.()) return;

    if (!reveal.ensureBoundToModel(reveal._boundModel)) return;

    let elapsed = 0;
    if (reveal.isEnabled?.()) {
      elapsed = reveal.isPreviewPaused?.()
        ? reveal.getPreviewElapsed()
        : reveal.getSettledRevealElapsedSec();
    }
    reveal.applyAtTime(elapsed);
  }
}
