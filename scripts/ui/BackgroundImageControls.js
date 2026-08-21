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
   * @param {import('./UIHelpers.js').UIHelpers} [helpers]
   */
  constructor(eventBus, stateStore, ui, helpers) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = ui;
    this.helpers = helpers;
    this.fitButtons = [];
    this._mounted = false;
  }

  bind() {
    this.fitPanelEl = document.getElementById('backgroundImageFitPanel');
    this.blurRowEl = document.getElementById('backgroundImageBlurRow');
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

    this.ui.inputs.backgroundImageBlur?.addEventListener('input', (event) => {
      const blur = parseFloat(event.target.value);
      this.helpers?.updateValueLabel?.('backgroundImageBlur', blur, 'decimal');
      this._commit({ blur });
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

    const detailVisible = imageOn && hasAsset;
    if (this.fitPanelEl) {
      this.fitPanelEl.hidden = !detailVisible;
    }
    if (this.blurRowEl) {
      this.blurRowEl.hidden = !detailVisible;
    }

    this.fitButtons.forEach((button) => {
      const active = button.dataset.bgImageFit === imageConfig.fit;
      button.classList.toggle('active', active);
    });

    if (this.ui.inputs.backgroundImageBlur) {
      this.helpers?.syncRangeFromState?.(this.ui.inputs.backgroundImageBlur, imageConfig.blur);
      this.helpers?.updateValueLabel?.('backgroundImageBlur', imageConfig.blur, 'decimal');
    }

    const detailDisabled = !imageOn || !fallbackActive;
    this.ui.setControlDisabled('backgroundImageEnabled', !fallbackActive);
    this.ui.setControlDisabled('backgroundImageSelectBtn', detailDisabled);
    this.ui.setControlDisabled('backgroundImageBlur', detailDisabled || !hasAsset);
    this.fitButtons.forEach((button) => {
      button.disabled = detailDisabled || !hasAsset;
      button.classList.toggle('is-disabled', detailDisabled || !hasAsset);
    });
  }
}

export { BACKGROUND_IMAGE_ACCEPT };
