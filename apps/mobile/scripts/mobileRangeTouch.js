import { mobileHaptic } from './mobileHaptics.js';

const coarseTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)');

/** @param {HTMLInputElement} input */
function parseSliderBounds(input) {
  const min = parseFloat(input.min);
  const max = parseFloat(input.max);
  const step = parseFloat(input.step);
  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 100,
    step: Number.isFinite(step) && step > 0 ? step : 0.01,
  };
}

/** @param {HTMLInputElement} input @param {number} clientX */
function valueFromClientX(input, clientX) {
  const { min, max, step } = parseSliderBounds(input);
  const rect = input.getBoundingClientRect();
  if (rect.width <= 0) return parseFloat(input.value);

  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  let value = min + ratio * (max - min);
  if (step > 0) {
    value = Math.round(value / step) * step;
  }
  return Math.min(max, Math.max(min, value));
}

/** @param {number} value @param {number} step */
function formatSliderValue(value, step) {
  const stepText = String(step);
  if (stepText.includes('.')) {
    const decimals = stepText.split('.')[1]?.length ?? 0;
    return value.toFixed(decimals);
  }
  return String(Math.round(value));
}

/**
 * iOS Safari often fails to drag custom-styled `<input type="range">` inside
 * overflow scrollers — native behavior works in desktop preview (mouse) but not
 * on real touch. Drive value updates from pointer events instead.
 * @param {{ root: HTMLElement }} opts
 */
export function bindMobileRangeTouch({ root }) {
  /** @type {HTMLInputElement | null} */
  let dragInput = null;
  /** @type {number | null} */
  let dragPointerId = null;

  const releaseChrome = () => {
    root.querySelectorAll('.is-slider-focus').forEach((row) => {
      row.classList.remove('is-slider-focus');
    });
    delete root.dataset.sliderFocus;
  };

  /** @param {HTMLInputElement} input */
  const engageChrome = (input) => {
    const row = input.closest('.orby-mobile-fx-grade');
    if (!(row instanceof HTMLElement)) return;
    root.querySelectorAll('.is-slider-focus').forEach((el) => {
      if (el !== row) el.classList.remove('is-slider-focus');
    });
    root.dataset.sliderFocus = 'true';
    row.classList.add('is-slider-focus');
    mobileHaptic('soft');
  };

  /** @param {HTMLInputElement} input @param {number} clientX */
  const applyValue = (input, clientX) => {
    const { step } = parseSliderBounds(input);
    const next = valueFromClientX(input, clientX);
    const nextText = formatSliderValue(next, step);
    if (input.value === nextText) return;
    input.value = nextText;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  /** @param {EventTarget | null} target */
  const resolveRangeInput = (target) => {
    if (!(target instanceof Element) || !root.contains(target)) return null;
    if (target.closest('.effect-toggle, button, .orby-mobile-preset, .orby-mobile-color-swatch')) {
      return null;
    }

    if (target instanceof HTMLInputElement && target.type === 'range' && !target.disabled) {
      return target;
    }

    const row = target.closest('.orby-mobile-fx-grade');
    if (!(row instanceof HTMLElement)) return null;
    const input = row.querySelector('input[type="range"]');
    return input instanceof HTMLInputElement && !input.disabled ? input : null;
  };

  /** @param {PointerEvent} e */
  const onPointerDown = (e) => {
    if (!coarseTouchDevice.matches) return;
    if (e.pointerType === 'mouse') return;

    const input = resolveRangeInput(e.target);
    if (!input) return;

    e.preventDefault();
    e.stopPropagation();

    dragInput = input;
    dragPointerId = e.pointerId;
    engageChrome(input);
    input.setPointerCapture(e.pointerId);
    applyValue(input, e.clientX);
  };

  /** @param {PointerEvent} e */
  const onPointerMove = (e) => {
    if (dragPointerId == null || e.pointerId !== dragPointerId || !dragInput) return;
    e.preventDefault();
    applyValue(dragInput, e.clientX);
  };

  /** @param {PointerEvent} e */
  const onPointerEnd = (e) => {
    if (dragPointerId == null || e.pointerId !== dragPointerId || !dragInput) return;

    const input = dragInput;
    dragInput = null;
    dragPointerId = null;

    try {
      input.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    input.dispatchEvent(new Event('change', { bubbles: true }));
    releaseChrome();
  };

  root.addEventListener('pointerdown', onPointerDown, { capture: true, passive: false });
  root.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
  root.addEventListener('pointerup', onPointerEnd, { capture: true });
  root.addEventListener('pointercancel', onPointerEnd, { capture: true });

  return {
    release: releaseChrome,
    isActive: () => dragInput != null || root.dataset.sliderFocus != null,
  };
}
