import { isBackgroundFallbackActive } from '../render/backgroundFallback.js';
import {
  applyBackgroundMode,
  getBackgroundMode,
} from '../render/backgroundMode.js';

/**
 * Studio → Background flat color toggle + picker (when Render Backdrop is off).
 */
export class BackgroundSolidControls {
  /**
   * @param {import('../EventBus.js').EventBus} eventBus
   * @param {import('../StateStore.js').StateStore} stateStore
   * @param {import('../UIManager.js').UIManager} ui
   */
  constructor(eventBus, stateStore, ui) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = ui;
    this._mounted = false;
  }

  bind() {
    if (!this.ui.inputs.backgroundSolidEnabled) return;
    this._mounted = true;

    this.ui.inputs.backgroundSolidEnabled.addEventListener('change', (event) => {
      const checked = event.target.checked;
      if (checked) {
        applyBackgroundMode(this.stateStore, this.eventBus, 'solid');
        return;
      }
      if (getBackgroundMode(this.stateStore.getState()) === 'solid') {
        applyBackgroundMode(this.stateStore, this.eventBus, 'solid');
      }
    });
  }

  sync(state) {
    if (!this._mounted) return;
    const mode = getBackgroundMode(state);
    const fallbackActive = isBackgroundFallbackActive(state);
    const solidOn = mode === 'solid';

    if (this.ui.inputs.backgroundSolidEnabled) {
      this.ui.inputs.backgroundSolidEnabled.checked = solidOn;
    }

    const detailDisabled = !solidOn || !fallbackActive;
    this.ui.setControlDisabled('backgroundSolidEnabled', !fallbackActive);
    this.ui.setControlDisabled('backgroundColor', detailDisabled);
  }
}
