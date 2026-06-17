import { normalizeBackgroundGradient } from '../../../../scripts/render/backgroundGradient/backgroundGradientDefaults.js';
import { ORBY_BLACK } from '../../../../scripts/constants.js';
import { MobileHsvColorPicker } from '../MobileHsvColorPicker.js';
import { mobileHaptic } from '../mobileHaptics.js';

/** @import { MobileUiContext } from '../mobileUiContext.js' */
/** @import { ColorPickerTarget } from '../mobileTypes.js' */

/**
 * @typedef {{
 *   onBeforeOpen?: () => void,
 * }} MobileColorPickerOptions
 */

export class MobileColorPicker {
  /**
   * @param {MobileUiContext} ctx
   * @param {MobileColorPickerOptions} [options]
   */
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.onBeforeOpen = options.onBeforeOpen;

    const { root } = ctx;
    this._layer = root.querySelector('[data-color-picker-layer]');
    this._host = root.querySelector('[data-color-picker-host]');
    this._done = root.querySelector('[data-color-picker-done]');
    this._solidSwatch = root.querySelector('[data-bg-color-open]');
    this._gradientSwatches = Array.from(root.querySelectorAll('[data-bg-gradient-color]'));

    /** @type {ColorPickerTarget | null} */
    this._target = null;
    /** @type {MobileHsvColorPicker | null} */
    this._picker = null;
  }

  bind() {
    if (!(this._host instanceof HTMLElement)) return;

    this._picker = new MobileHsvColorPicker(this._host, {
      ariaLabel: 'Background color',
      defaultValue: ORBY_BLACK,
      onInput: (color) => this._applyValue(color),
    });

    this._solidSwatch?.addEventListener('click', () => {
      this.open('solid');
    });

    this._gradientSwatches.forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.getAttribute('data-bg-gradient-color'));
        if (index !== 0 && index !== 1) return;
        this.open(/** @type {0 | 1} */ (index));
      });
    });

    this._done?.addEventListener('click', () => {
      this.close();
    });
  }

  /** @param {ColorPickerTarget} target */
  open(target) {
    if (!this._picker) return;

    const { root, scene } = this.ctx;
    let color = ORBY_BLACK;
    if (target === 'solid') {
      color = scene.getBackgroundColor();
    } else {
      const stops = normalizeBackgroundGradient(scene.getBackgroundGradient()).stops;
      color = stops[target]?.color ?? ORBY_BLACK;
    }

    this._target = target;
    this.onBeforeOpen?.();
    this._picker.setValue(color);
    this._picker.setDisabled(false);
    if (this._layer instanceof HTMLElement) {
      this._layer.hidden = false;
    }
    root.dataset.colorPicker = 'open';
    requestAnimationFrame(() => {
      this._picker?.resize();
    });
    mobileHaptic('light');
  }

  close() {
    if (this._target == null) return;
    this._target = null;
    delete this.ctx.root.dataset.colorPicker;
    if (this._layer instanceof HTMLElement) {
      this._layer.hidden = true;
    }
    mobileHaptic('soft');
  }

  /** @param {Element | null | undefined} button @param {string | undefined} color */
  syncSwatch(button, color) {
    if (!(button instanceof HTMLElement) || !color) return;
    button.style.backgroundColor = color;
    button.dataset.color = color;
  }

  /** @param {string} color */
  _applyValue(color) {
    if (!color || this._target == null) return;

    const { scene } = this.ctx;
    if (this._target === 'solid') {
      scene.setBackgroundColor(color);
      this.syncSwatch(this._solidSwatch, color);
      return;
    }

    const gradient = normalizeBackgroundGradient(scene.getBackgroundGradient());
    const stops = [...gradient.stops];
    const index = this._target;
    if (!stops[index]) return;
    stops[index] = { ...stops[index], color };
    scene.setBackgroundGradient({ stops });
    const swatch = this._gradientSwatches.find(
      (button) => Number(button.getAttribute('data-bg-gradient-color')) === index,
    );
    this.syncSwatch(swatch, color);
  }
}
