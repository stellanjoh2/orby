import {
  BACKGROUND_IMAGE_ACCEPT,
  DEFAULT_BACKGROUND_IMAGE,
  normalizeBackgroundImage,
} from '../render/backgroundImage/backgroundImageDefaults.js';
import { isBackgroundFallbackActive } from '../render/backgroundFallback.js';
import {
  applyBackgroundMode,
  getBackgroundMode,
} from '../render/backgroundMode.js';

const SELECT_BACKGROUND_IMAGE_LABEL = 'Select background image';

/**
 * Studio → Background image upload + fit (when Render Backdrop is off).
 */
export class BackgroundImageControls {
  /**
   * @param {import('../EventBus.js').EventBus} eventBus
   * @param {import('../StateStore.js').StateStore} stateStore
   * @param {import('../UIManager.js').UIManager} ui
   */
  constructor(eventBus, stateStore, ui) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = ui;
    this.fitButtons = [];
    this._mounted = false;
  }

  bind() {
    this.fitPanelEl = document.getElementById('backgroundImageFitPanel');
    this.fitButtons = Array.from(document.querySelectorAll('[data-bg-image-fit]'));
    if (!this.ui.inputs.backgroundImageEnabled) return;

    this._mounted = true;

    this.ui.inputs.backgroundImageEnabled.addEventListener('change', (event) => {
      const checked = event.target.checked;
      if (checked) {
        applyBackgroundMode(this.stateStore, this.eventBus, 'image');
        return;
      }
      if (getBackgroundMode(this.stateStore.getState()) === 'image') {
        applyBackgroundMode(this.stateStore, this.eventBus, 'solid');
      }
    });

    this.ui.inputs.backgroundImageSelectBtn?.addEventListener('click', () => {
      if (!isBackgroundFallbackActive(this.stateStore.getState())) return;
      this.ui.inputs.backgroundImageFileInput?.click();
    });

    this.ui.inputs.backgroundImageFileInput?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      this.ui.uiSounds?.playSelect?.();
      applyBackgroundMode(this.stateStore, this.eventBus, 'image');
      this.eventBus.emit('studio:background-image-upload', file);
    });

    this.fitButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const fit = button.dataset.bgImageFit;
        if (fit !== 'cover' && fit !== 'contain' && fit !== 'fill') return;
        this.ui.uiSounds?.playSelect?.();
        this._commit({ fit });
      });
    });
  }

  _commit(patch) {
    const current = this.stateStore.getState().backgroundImage ?? DEFAULT_BACKGROUND_IMAGE;
    const next = normalizeBackgroundImage({ ...current, ...patch });
    this.stateStore.set('backgroundImage', next);
    this.eventBus.emit('scene:background-image', next);
  }

  sync(state) {
    if (!this._mounted) return;
    const imageConfig = normalizeBackgroundImage(
      state.backgroundImage ?? DEFAULT_BACKGROUND_IMAGE,
    );
    const mode = getBackgroundMode(state);
    const imageOn = mode === 'image';
    const fallbackActive = isBackgroundFallbackActive(state);
    const hasAsset = !!imageConfig.asset;

    if (this.ui.inputs.backgroundImageEnabled) {
      this.ui.inputs.backgroundImageEnabled.checked = imageOn;
    }

    const selectBtn = this.ui.inputs.backgroundImageSelectBtn;
    if (selectBtn) {
      selectBtn.hidden = !imageOn;
      const fileName = imageConfig.asset?.name ?? '';
      selectBtn.textContent = hasAsset ? fileName : SELECT_BACKGROUND_IMAGE_LABEL;
      selectBtn.title = hasAsset ? fileName : '';
    }

    if (this.fitPanelEl) {
      this.fitPanelEl.hidden = !imageOn || !hasAsset;
    }

    this.fitButtons.forEach((button) => {
      const active = button.dataset.bgImageFit === imageConfig.fit;
      button.classList.toggle('active', active);
    });

    const detailDisabled = !imageOn || !fallbackActive;
    this.ui.setControlDisabled('backgroundImageEnabled', !fallbackActive);
    this.ui.setControlDisabled('backgroundImageSelectBtn', detailDisabled);
    this.fitButtons.forEach((button) => {
      button.disabled = detailDisabled || !hasAsset;
      button.classList.toggle('is-disabled', detailDisabled || !hasAsset);
    });
  }
}

export { BACKGROUND_IMAGE_ACCEPT };
