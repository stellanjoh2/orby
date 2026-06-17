import { mobileHaptic } from './mobileHaptics.js';

/**
 * Shared slider-focus chrome fade (`data-slider-focus` + `.is-slider-focus` row).
 * Used by pointer-driven focus and touch range drag so all sliders share one hide path.
 * @param {HTMLElement} root
 */
export function createMobileSliderChrome(root) {
  /** @type {HTMLElement | null} */
  let activeRow = null;
  /** @type {HTMLInputElement | null} */
  let activeInput = null;

  const release = () => {
    if (!activeRow && root.dataset.sliderFocus == null) return;
    activeRow?.classList.remove('is-slider-focus');
    activeRow = null;
    activeInput = null;
    delete root.dataset.sliderFocus;
  };

  /** @param {HTMLInputElement} input */
  const engage = (input) => {
    const row = input.closest('.orby-mobile-fx-grade');
    if (!(row instanceof HTMLElement)) return;

    if (activeRow !== row) {
      activeRow?.classList.remove('is-slider-focus');
    }
    activeInput = input;
    activeRow = row;
    root.dataset.sliderFocus = 'true';
    row.classList.add('is-slider-focus');
    mobileHaptic('soft');
  };

  return {
    engage,
    release,
    isActive: () => root.dataset.sliderFocus != null,
    getActiveInput: () => activeInput,
  };
}
