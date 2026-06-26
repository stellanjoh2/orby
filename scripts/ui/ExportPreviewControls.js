import { ExportMovementPreview } from '../render/ExportMovementPreview.js';

/**
 * Export movement preview transport — play/stop, scrub, reset, and time readout.
 */
export class ExportPreviewControls {
  constructor(eventBus, ui) {
    this.eventBus = eventBus;
    this.ui = ui;
    this._scrubbing = false;
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
    });
    this.ui.dom.exportPreviewScrub?.addEventListener('pointerup', () => {
      this._scrubbing = false;
      this.ui.dom.exportPreviewScrub?.classList.remove('is-scrub-playing');
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
    });

    this.ui.dom.exportPreviewPauseAll?.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      const store = this.ui.stateStore;
      const next = !store?.getState()?.fontExtrude?.pauseAllAnimations;
      store?.set('fontExtrude.pauseAllAnimations', next);
      this._applyPauseAll(next);
      this.syncPauseAll(store?.getState());
    });

    this._pauseAllUnsub = this.ui.stateStore?.subscribe?.((state) => {
      this.syncPauseAll(state);
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
    this.syncPauseAll();
  }

  /**
   * Shortcut to freeze/resume font 3D-type reveal + constant animations from the
   * Export tab. Mirrors the Object tab "Pause all" control via the shared
   * `fontExtrude.pauseAllAnimations` flag so both stay in sync.
   * @param {object} [state]
   */
  syncPauseAll(state) {
    const button = this.ui.dom.exportPreviewPauseAll;
    if (!button) return;
    const current = state ?? this.ui.stateStore?.getState();
    const paused = !!current?.fontExtrude?.pauseAllAnimations;
    button.disabled = !this._pauseAllAvailable();
    button.classList.toggle('active', paused);
    button.textContent = paused ? 'Resume all animations' : 'Pause all animations';
  }

  _hasFontMesh() {
    const scene = window.orby?.scene;
    const model = scene?.currentModel;
    return !!(
      model?.userData?.orbyFontGenerated ||
      scene?.materialController?._isFontExtrudeModel?.(model)
    );
  }

  _pauseAllAvailable() {
    const scene = window.orby?.scene;
    const reveal = scene?.fontTextRevealController;
    const constant = scene?.fontTextConstantController;
    return (
      this._hasFontMesh() &&
      !!(reveal?.isEnabled?.() || constant?.isEnabled?.())
    );
  }

  _applyPauseAll(active) {
    const scene = window.orby?.scene;
    const reveal = scene?.fontTextRevealController;
    reveal?.applyPauseAll?.(active, scene?.currentModel ?? null);
  }

  setPlaying(playing) {
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
  }

  updateTimeline(currentSec, durationSec, { fromPlayback = false } = {}) {
    if (!durationSec) return;
    const clamp = Math.max(0, Math.min(currentSec, durationSec));
    const minutes = Math.floor(clamp / 60).toString();
    const seconds = Math.floor(clamp % 60).toString().padStart(2, '0');
    if (this.ui.dom.exportPreviewTime) {
      this.ui.dom.exportPreviewTime.textContent = `${minutes}:${seconds}`;
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
}
