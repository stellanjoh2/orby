/**
 * ViewPresetsControls — Front / Left / Right / Top camera framing (Camera → Basic).
 */
export class ViewPresetsControls {
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    this._presetButtons = [];
    this._applyingPreset = false;
  }

  bind() {
    const grid = document.querySelector('.view-preset-grid');
    if (!grid) return;

    this._presetButtons = [...grid.querySelectorAll('[data-view-preset]')];
    this._presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.viewPreset;
        if (!preset) return;
        this._applyingPreset = true;
        this.stateStore.set('camera.viewPreset', preset);
        this.eventBus.emit('camera:preset', preset);
        this._updatePresetSelection(preset);
        requestAnimationFrame(() => {
          this._applyingPreset = false;
        });
      });
    });

    this.eventBus.on('camera:pose-changed', () => {
      if (this._applyingPreset) return;
      if (this.stateStore.getState().camera?.viewPreset == null) return;
      this.stateStore.set('camera.viewPreset', null);
      this._updatePresetSelection(null);
    });
  }

  setDisabled(disabled) {
    for (const btn of this._presetButtons) {
      btn.disabled = disabled;
    }
  }

  _updatePresetSelection(activePreset) {
    for (const btn of this._presetButtons) {
      const preset = btn.dataset.viewPreset;
      const on = activePreset != null && preset === activePreset;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  sync(state) {
    this._updatePresetSelection(state.camera?.viewPreset ?? null);
  }
}
