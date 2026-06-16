import { mobileHaptic } from './mobileHaptics.js';

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

/** @param {HTMLInputElement} input */
function scrollContainerFor(input) {
  return input.closest(
    '.orby-mobile-fx-controls, .orby-mobile-panel[data-panel="light"], .orby-mobile-panel--style',
  );
}

/**
 * iOS Safari often fails to drag custom-styled `<input type="range">` inside
 * overflow scrollers. Drive values from touch/pointer events instead of native range drag.
 * @param {{ root: HTMLElement }} opts
 */
export function bindMobileRangeTouch({ root }) {
  /** @type {HTMLInputElement | null} */
  let dragInput = null;
  /** @type {number | null} */
  let dragId = null;
  /** @type {HTMLElement | null} */
  let lockedScroller = null;
  /** @type {string | null} */
  let lockedOverflow = null;
  /** Set when touchstart already opened a drag — skip duplicate pointerdown on iOS. */
  let touchHandled = false;

  const releaseChrome = () => {
    root.querySelectorAll('.is-slider-focus').forEach((row) => {
      row.classList.remove('is-slider-focus');
    });
    delete root.dataset.sliderFocus;
  };

  const unlockScroll = () => {
    if (!(lockedScroller instanceof HTMLElement)) return;
    lockedScroller.style.overflow = lockedOverflow ?? '';
    lockedScroller = null;
    lockedOverflow = null;
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

  /**
   * @param {HTMLInputElement} input
   * @param {number} id
   * @param {number} clientX
   */
  const startDrag = (input, id, clientX) => {
    if (dragInput) return;
    dragInput = input;
    dragId = id;
    engageChrome(input);

    const scroller = scrollContainerFor(input);
    if (scroller instanceof HTMLElement) {
      lockedScroller = scroller;
      lockedOverflow = scroller.style.overflow || '';
      scroller.style.overflow = 'hidden';
    }

    applyValue(input, clientX);
  };

  const endDrag = () => {
    if (!dragInput) return;
    const input = dragInput;
    dragInput = null;
    dragId = null;
    unlockScroll();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    releaseChrome();
  };

  /** @param {TouchEvent} e */
  const onTouchStart = (e) => {
    if (dragInput || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const input =
      resolveRangeInput(e.target)
      ?? resolveRangeInput(document.elementFromPoint(touch.clientX, touch.clientY));
    if (!input) return;

    e.preventDefault();
    e.stopPropagation();
    touchHandled = true;
    startDrag(input, touch.identifier, touch.clientX);
  };

  /** @param {TouchEvent} e */
  const onTouchMove = (e) => {
    if (dragId == null || !dragInput) return;

    const touch = [...e.touches].find((t) => t.identifier === dragId);
    if (!touch) return;

    e.preventDefault();
    applyValue(dragInput, touch.clientX);
  };

  /** @param {TouchEvent} e */
  const onTouchEnd = (e) => {
    if (dragId == null) return;
    for (const touch of e.changedTouches) {
      if (touch.identifier !== dragId) continue;
      endDrag();
      return;
    }
  };

  /** @param {PointerEvent} e */
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' || dragInput) return;

    if (touchHandled) {
      touchHandled = false;
      return;
    }

    const input = resolveRangeInput(e.target);
    if (!input) return;

    e.preventDefault();
    e.stopPropagation();

    startDrag(input, e.pointerId, e.clientX);

    try {
      input.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  /** @param {PointerEvent} e */
  const onPointerMove = (e) => {
    if (dragId == null || e.pointerId !== dragId || !dragInput) return;
    e.preventDefault();
    applyValue(dragInput, e.clientX);
  };

  /** @param {PointerEvent} e */
  const onPointerEnd = (e) => {
    if (dragId == null || e.pointerId !== dragId) return;

    if (dragInput) {
      try {
        dragInput.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }

    endDrag();
  };

  root.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
  document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
  document.addEventListener('touchend', onTouchEnd, { capture: true });
  document.addEventListener('touchcancel', onTouchEnd, { capture: true });

  root.addEventListener('pointerdown', onPointerDown, { capture: true, passive: false });
  document.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
  document.addEventListener('pointerup', onPointerEnd, { capture: true });
  document.addEventListener('pointercancel', onPointerEnd, { capture: true });

  return {
    release: () => {
      touchHandled = false;
      dragInput = null;
      dragId = null;
      unlockScroll();
      releaseChrome();
    },
    isActive: () => dragInput != null || root.dataset.sliderFocus != null,
  };
}
