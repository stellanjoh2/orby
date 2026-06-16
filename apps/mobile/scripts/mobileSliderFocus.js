import { mobileHaptic } from './mobileHaptics.js';

/**
 * Chrome fade while dragging sliders — desktop mouse preview only.
 * Real touch/pen uses bindMobileRangeTouch for drag + the same chrome fade.
 * @param {{ root: HTMLElement }} opts
 */
export function bindMobileSliderFocus({ root }) {
  /** @type {HTMLElement | null} */
  let activeRow = null;
  /** @type {HTMLInputElement | null} */
  let activeInput = null;
  /** @type {number | null} */
  let activePointerId = null;

  const release = () => {
    if (!activeRow) return;
    activeRow.classList.remove('is-slider-focus');
    activeRow = null;
    activeInput = null;
    activePointerId = null;
    delete root.dataset.sliderFocus;
  };

  /**
   * @param {HTMLInputElement} input
   * @param {HTMLElement} row
   * @param {number} pointerId
   */
  const engage = (input, row, pointerId) => {
    if (activeRow !== row) {
      activeRow?.classList.remove('is-slider-focus');
    }
    activeInput = input;
    activeRow = row;
    activePointerId = pointerId;
    root.dataset.sliderFocus = 'true';
    row.classList.add('is-slider-focus');
    mobileHaptic('soft');
  };

  /** @param {PointerEvent} e */
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (!(e.target instanceof Element)) return;

    const row = e.target.closest('.orby-mobile-fx-grade');
    if (!(row instanceof HTMLElement) || !root.contains(row)) return;

    const input = row.querySelector('input[type="range"]');
    if (!(input instanceof HTMLInputElement) || input.disabled) return;

    engage(input, row, e.pointerId);
  };

  /** @param {PointerEvent} e */
  const onPointerUp = (e) => {
    if (activePointerId == null || e.pointerId !== activePointerId) return;
    release();
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener(
    'change',
    (e) => {
      if (!(e.target instanceof HTMLInputElement) || e.target.type !== 'range') return;
      if (activeInput !== e.target) return;
      release();
    },
    true,
  );
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerUp, true);

  return {
    release,
    isActive: () => root.dataset.sliderFocus != null,
  };
}
