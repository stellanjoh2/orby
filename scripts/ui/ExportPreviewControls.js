import { ExportMovementPreview } from '../render/ExportMovementPreview.js';
import {
  SCRUB_CAPTURE_DEBOUNCE_MS,
  USE_CAPTURE_PREVIEW_ON_SCRUB,
} from '../constants.js';
import { formatPreviewTime } from '../utils/timeFormatter.js';
import {
  creativeLookPresetUsesShaderAnimation,
  normalizeCreativeLookPreset,
  resolveCreativeLookPresetChoice,
} from '../render/CreativeLookMaterials.js';

/**
 * Export movement preview transport — play/stop, scrub, reset, and time readout.
 */
export class ExportPreviewControls {
  constructor(eventBus, ui) {
    this.eventBus = eventBus;
    this.ui = ui;
    this._scrubbing = false;
    this._scrubCaptureTimer = null;
    this._scrubCapturePendingT = null;
    /** Export preview session frozen via dock Pause all (not scrub-idle). */
    this._exportPreviewPaused = false;
    this._exportPreviewWasPlaying = false;
    this._liveGlbPausedByDock = false;
  }

  bind() {
    this._syncScrubFill();

    this.ui.dom.exportPreviewPlayPause?.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      this.eventBus.emit('export:video-preview-play-toggle', {
        ...(this.ui.exportSettings.video || {}),
      });
    });

    this.ui.dom.exportPreviewReset?.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      this.eventBus.emit('export:video-preview-reset', {
        ...(this.ui.exportSettings.video || {}),
      });
    });

    this.ui.dom.exportPreviewExit?.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      this.eventBus.emit('export:movement-preview-stop', { silent: false });
    });

    this.ui.dom.exportPreviewScrub?.addEventListener('pointerdown', () => {
      this._scrubbing = true;
      this.ui.dom.exportPreviewScrub?.classList.add('is-scrub-playing');
      this._exportMovementPreview()?.pausePlayback?.();
    });
    this.ui.dom.exportPreviewScrub?.addEventListener('pointerup', () => {
      this._scrubbing = false;
      this.ui.dom.exportPreviewScrub?.classList.remove('is-scrub-playing');
      this._flushScrubCapturePreview();
    });
    this.ui.dom.exportPreviewScrub?.addEventListener('pointercancel', () => {
      this._scrubbing = false;
      this.ui.dom.exportPreviewScrub?.classList.remove('is-scrub-playing');
    });
    this.ui.dom.exportPreviewScrub?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.ui.updateSliderFill?.(event.target);
      this.eventBus.emit('export:video-preview-scrub', {
        t: value,
        ...(this.ui.exportSettings.video || {}),
      });
      this._scheduleScrubCapturePreview(value);
    });

    this.ui.dom.exportPreviewPauseAll?.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      this._togglePauseAll();
    });

    this._pauseAllUnsub = this.ui.stateStore?.subscribe?.((state) => {
      this.syncPauseAll(state);
    });

    this.eventBus.on('export:movement-preview-stop', () => {
      this._clearExportPreviewPauseState();
    });

    this.eventBus.on('scene:model-load-complete', () => {
      this.syncAvailability(true);
    });
    this.eventBus.on('scene:model-cleared', () => {
      this.eventBus.emit('export:movement-preview-stop', { silent: true });
      this.syncAvailability(false);
    });

    const hasModel = !!window.orby?.scene?.currentModel;
    this.syncAvailability(hasModel);
  }

  syncAvailability(hasModel) {
    const video = this.ui.exportSettings.video || {};
    const canPreview = !!hasModel && ExportMovementPreview.canPreview(video);
    const playBtn = this.ui.dom.exportPreviewPlayPause;
    const resetBtn = this.ui.dom.exportPreviewReset;
    const scrub = this.ui.dom.exportPreviewScrub;
    if (playBtn) playBtn.disabled = !canPreview;
    if (resetBtn) resetBtn.disabled = !canPreview;
    if (scrub) scrub.disabled = !canPreview;
    const captureBtn = this.ui.buttons.exportVideoCapturePreview;
    if (captureBtn) captureBtn.disabled = !canPreview;
    this.syncPauseAll();
  }

  /**
   * Pause/resume export preview motion, font type animations, and Shader Lab motion.
   */
  _togglePauseAll() {
    const state = this.ui.stateStore?.getState();
    this._setPauseAllEngaged(!this._pauseAllEngaged(state), state);
    this.syncPauseAll(state);
    this._requestRender();
  }

  _pauseAllEngaged(state) {
    const current = state ?? this.ui.stateStore?.getState();
    const preview = this._exportMovementPreview();
    if (preview?.isActive?.()) {
      return (
        this._exportPreviewPaused
        || (
          this._shaderPauseSupported(current)
          && !!current?.creativeLook?.pauseShaderAnimations
        )
      );
    }
    return (
      (this._fontPauseAvailable() && !!current?.fontExtrude?.pauseAllAnimations)
      || (
        this._shaderPauseSupported(current)
        && !!current?.creativeLook?.pauseShaderAnimations
      )
    );
  }

  _setPauseAllEngaged(paused, state) {
    const preview = this._exportMovementPreview();
    if (preview?.isActive?.()) {
      if (paused && !this._exportPreviewPaused) {
        this._applyExportPreviewPause(preview);
      } else if (!paused && this._exportPreviewPaused) {
        this._resumeExportPreviewPause(preview);
      }
    } else if (!paused) {
      this._clearExportPreviewPauseState();
    }

    if (!preview?.isActive?.() && this._fontPauseAvailable()) {
      this.ui.stateStore?.set('fontExtrude.pauseAllAnimations', paused);
      this._applyFontPauseAll(paused);
    }

    if (this._shaderPauseSupported(state)) {
      this.ui.stateStore?.set('creativeLook.pauseShaderAnimations', paused);
    }
  }

  _applyExportPreviewPause(preview) {
    this._exportPreviewWasPlaying = !!preview.isPlaying?.();
    preview.pausePlayback?.();
    this._pauseLiveGlbIfNeeded();
    this._exportPreviewPaused = true;
    this.ui.syncExportPreviewBanner?.();
  }

  _resumeExportPreviewPause(preview) {
    if (this._exportPreviewWasPlaying) {
      preview.resumePlayback?.();
    }
    this._resumeLiveGlbIfNeeded();
    this._clearExportPreviewPauseState();
  }

  _clearExportPreviewPauseState() {
    this._resumeLiveGlbIfNeeded();
    this._exportPreviewPaused = false;
    this._exportPreviewWasPlaying = false;
    this.ui.syncExportPreviewBanner?.();
  }

  _exportMovementPreview() {
    return window.orby?.scene?.exportMovementPreview ?? null;
  }

  _pauseLiveGlbIfNeeded() {
    const ac = window.orby?.scene?.animationController;
    if (
      !ac?.currentAction
      || ac.isExportSessionActive?.()
      || ac.currentAction.paused
    ) {
      return;
    }
    ac.togglePlayback();
    this._liveGlbPausedByDock = true;
  }

  _resumeLiveGlbIfNeeded() {
    if (!this._liveGlbPausedByDock) return;
    const ac = window.orby?.scene?.animationController;
    if (ac?.currentAction?.paused && !ac.isExportSessionActive?.()) {
      ac.togglePlayback();
    }
    this._liveGlbPausedByDock = false;
  }

  _requestRender() {
    window.orby?.scene?.requestRender?.();
  }

  /**
   * Sync bottom dock Pause all — export preview session or Object-tab font mirror.
   * @param {object} [state]
   */
  /** True when dock Pause all froze an active export preview session. */
  isExportPreviewPaused() {
    return !!this._exportPreviewPaused;
  }

  syncPauseAll(state) {
    const button = this.ui.dom.exportPreviewPauseAll;
    if (!button) return;
    const current = state ?? this.ui.stateStore?.getState();
    const paused = this._pauseAllEngaged(current);
    button.disabled = !this._pauseAllAvailable(current);
    button.classList.toggle('active', paused);
    button.textContent = paused ? 'Resume all animations' : 'Pause all animations';
    this.ui.syncExportPreviewBanner?.();
  }

  _shaderPauseSupported(state) {
    const current = state ?? this.ui.stateStore?.getState();
    if (!current?.creativeLook?.enabled) return false;
    const preset =
      resolveCreativeLookPresetChoice(current.creativeLook?.preset)
      ?? normalizeCreativeLookPreset(null);
    return creativeLookPresetUsesShaderAnimation(preset);
  }

  _pauseAllAvailable(state) {
    const video = this.ui.exportSettings.video || {};
    if (ExportMovementPreview.canPreview(video)) return true;
    if (this._shaderPauseSupported(state)) return true;
    return this._fontPauseAvailable();
  }

  _fontPauseAvailable() {
    const scene = window.orby?.scene;
    const reveal = scene?.fontTextRevealController;
    const constant = scene?.fontTextConstantController;
    return (
      this._hasFontMesh() &&
      !!(reveal?.isEnabled?.() || constant?.isEnabled?.())
    );
  }

  _applyFontPauseAll(active) {
    const scene = window.orby?.scene;
    const reveal = scene?.fontTextRevealController;
    reveal?.applyPauseAll?.(active, scene?.currentModel ?? null);
  }

  _hasFontMesh() {
    const scene = window.orby?.scene;
    const model = scene?.currentModel;
    return !!(
      model?.userData?.orbyFontGenerated ||
      scene?.materialController?._isFontExtrudeModel?.(model)
    );
  }

  setPlaying(playing) {
    if (playing) {
      if (this._pauseAllEngaged()) {
        this._setPauseAllEngaged(false);
      } else {
        this._clearExportPreviewPauseState();
      }
    }
    const button = this.ui.dom.exportPreviewPlayPause;
    const icon = button?.querySelector('i');
    const srLabel = button?.querySelector('.sr-only');
    if (icon) {
      icon.classList.toggle('fa-play', !playing);
      icon.classList.toggle('fa-stop', playing);
    }
    if (srLabel) {
      srLabel.textContent = playing ? 'Stop' : 'Play';
    }
    button?.setAttribute(
      'aria-label',
      playing
        ? 'Stop export preview and restore camera'
        : 'Play export preview',
    );
    button?.setAttribute(
      'data-tooltip',
      playing
        ? 'Stop preview and return to frame 0 with orbit restored'
        : 'Play export movement preview in the viewport',
    );
    button?.classList.toggle('is-active', !!playing);
    if (this.ui.dom.exportPreviewScrub) {
      this.ui.dom.exportPreviewScrub.classList.toggle('is-scrub-playing', !!playing);
    }
    this.syncPauseAll();
  }

  updateTimeline(currentSec, durationSec, { fromPlayback = false } = {}) {
    if (!durationSec) return;
    const clamp = Math.max(0, Math.min(currentSec, durationSec));
    if (this.ui.dom.exportPreviewTime) {
      this.ui.dom.exportPreviewTime.textContent = formatPreviewTime(clamp);
    }
    const scrub = this.ui.dom.exportPreviewScrub;
    if (scrub && (!this._scrubbing || fromPlayback)) {
      const progress = durationSec === 0 ? 0 : clamp / durationSec;
      scrub.value = String(progress);
      this.ui.updateSliderFill?.(scrub);
    }
  }

  _syncScrubFill() {
    const scrub = this.ui.dom.exportPreviewScrub;
    if (scrub) {
      this.ui.updateSliderFill?.(scrub);
    }
  }

  _scheduleScrubCapturePreview(t) {
    if (!USE_CAPTURE_PREVIEW_ON_SCRUB) return;
    this._scrubCapturePendingT = t;
    clearTimeout(this._scrubCaptureTimer);
    this._scrubCaptureTimer = setTimeout(() => {
      if (this._scrubbing) return;
      this._flushScrubCapturePreview();
    }, SCRUB_CAPTURE_DEBOUNCE_MS);
  }

  _flushScrubCapturePreview() {
    if (!USE_CAPTURE_PREVIEW_ON_SCRUB) return;
    clearTimeout(this._scrubCaptureTimer);
    this._scrubCaptureTimer = null;
    const t = this._scrubCapturePendingT;
    if (!Number.isFinite(t)) return;
    this._scrubCapturePendingT = null;
    this.eventBus.emit('export:video-capture-preview', {
      download: false,
      previewT: t,
      showThumbnail: true,
      preservePreviewSession: true,
      showSpinner: false,
      ...(this.ui.exportSettings.video || {}),
    });
  }
}
