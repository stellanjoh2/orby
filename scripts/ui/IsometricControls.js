/**
 * IsometricControls — master toggle and presets (Camera → Lens).
 * When enabled, isometric mode owns orbit angles; pan is locked unless unlocked.
 * Focal length stays on Lens.
 */
import {
  DEFAULT_ISOMETRIC_STATE,
  ISOMETRIC_PRESETS,
  TRUE_ISOMETRIC_ELEVATION_DEG,
  inferIsometricPresetId,
  normalizeIsometricState,
  stepIsometricHorizontalDeg,
} from '../camera/isometricPresets.js';

export class IsometricControls {
  constructor(eventBus, stateStore, uiManager, helpers) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    this.helpers = helpers;
    this._presetButtons = [];
    this._syncing = false;
  }

  bind() {
    const grid = document.querySelector('.iso-preset-grid');
    if (grid) {
      this._presetButtons = [...grid.querySelectorAll('[data-iso-preset]')];
      this._presetButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.isoPreset;
          if (!id) return;
          this.applyPreset(id);
        });
      });
    }

    this.ui.inputs.isoOrbitStep?.addEventListener('click', () => {
      this.stepOrbit45();
    });

    this.ui.inputs.isoPanUnlock?.addEventListener('click', () => {
      this.togglePanUnlock();
    });

    if (this.ui.inputs.isometricEnabled) {
      this.ui.inputs.isometricEnabled.addEventListener('change', (event) => {
        const enabled = !!event.target.checked;
        if (enabled) {
          const iso = this.stateStore.getState().camera?.isometric ?? {};
          const preset =
            ISOMETRIC_PRESETS.find((p) => p.id === iso.presetId) ??
            ISOMETRIC_PRESETS[0];
          this.stateStore.batch(() => {
            this.stateStore.set('camera.isometric.enabled', true);
            this.stateStore.set('camera.isometric.presetId', preset.id);
            this.stateStore.set(
              'camera.isometric.horizontalDeg',
              preset.horizontalDeg,
            );
            this.stateStore.set(
              'camera.isometric.verticalDeg',
              preset.verticalDeg,
            );
          });
        } else {
          this.stateStore.set('camera.isometric.enabled', false);
        }
        this.sync(this.stateStore.getState());
        this._emitIsometric();
      });
    }
  }

  _isIsoActive() {
    return !!this.stateStore.getState().camera?.isometric?.enabled;
  }

  applyPreset(presetId) {
    const preset = ISOMETRIC_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    this.stateStore.batch(() => {
      this.stateStore.set('camera.isometric.enabled', true);
      this.stateStore.set('camera.isometric.presetId', preset.id);
      this.stateStore.set('camera.isometric.horizontalDeg', preset.horizontalDeg);
      this.stateStore.set('camera.isometric.verticalDeg', preset.verticalDeg);
    });
    this.sync(this.stateStore.getState());
    this._emitIsometric();
  }

  stepOrbit45() {
    if (!this._isIsoActive()) return;
    const iso = normalizeIsometricState(
      this.stateStore.getState().camera?.isometric,
    );
    const nextH = stepIsometricHorizontalDeg(iso.horizontalDeg);
    const matched = inferIsometricPresetId(nextH, iso.verticalDeg);
    this.stateStore.batch(() => {
      this.stateStore.set('camera.isometric.horizontalDeg', nextH);
      this.stateStore.set('camera.isometric.presetId', matched);
    });
    this.sync(this.stateStore.getState());
    this._emitIsometric();
  }

  togglePanUnlock() {
    if (!this._isIsoActive()) return;
    const iso = normalizeIsometricState(
      this.stateStore.getState().camera?.isometric,
    );
    this.stateStore.set('camera.isometric.panUnlocked', !iso.panUnlocked);
    this.sync(this.stateStore.getState());
    this._emitIsometric();
  }

  _emitIsometric() {
    const iso = normalizeIsometricState(
      this.stateStore.getState().camera?.isometric,
    );
    this.eventBus.emit('camera:isometric', iso);
  }

  _updatePresetSelection(activeId) {
    for (const btn of this._presetButtons) {
      const id = btn.dataset.isoPreset;
      const on = activeId != null && id === activeId;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  sync(state) {
    if (this._syncing) return;
    this._syncing = true;
    try {
      const iso = normalizeIsometricState(state.camera?.isometric);
      const active = iso.enabled;

      if (this.ui.inputs.isometricEnabled) {
        this.ui.inputs.isometricEnabled.checked = active;
      }

      const actionDisabled = !active;
      if (this.ui.inputs.isoOrbitStep) {
        this.ui.inputs.isoOrbitStep.disabled = actionDisabled;
      }
      if (this.ui.inputs.isoPanUnlock) {
        const panBtn = this.ui.inputs.isoPanUnlock;
        const panOn = active && iso.panUnlocked;
        panBtn.disabled = actionDisabled;
        panBtn.classList.toggle('active', panOn);
        panBtn.setAttribute('aria-pressed', panOn ? 'true' : 'false');
        panBtn.textContent = panOn ? 'Lock Camera Pan' : 'Unlock Camera Pan';
        panBtn.setAttribute(
          'data-tooltip',
          panOn
            ? 'Lock right-drag pan; keep the isometric orbit target fixed'
            : 'Allow right-drag to pan the orbit target while isometric angles stay locked',
        );
      }

      for (const btn of this._presetButtons) {
        btn.disabled = !active;
      }

      this._updatePresetSelection(active ? iso.presetId : null);
    } finally {
      this._syncing = false;
    }
  }

  static defaultState() {
    return { ...DEFAULT_ISOMETRIC_STATE };
  }

  static trueIsometricElevationDeg() {
    return TRUE_ISOMETRIC_ELEVATION_DEG;
  }
}
