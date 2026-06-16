import { isPointerOnSliderThumb } from '../../../scripts/ui/sliderDefaultPaths.js';
import { mobileHaptic } from './mobileHaptics.js';

/** Brief thumb hold — filters scroll brush-pasts without feeling laggy. */
const SLIDER_ARM_HOLD_MS = 80;
const SCROLL_CANCEL_MOVE_PX = 10;
const THUMB_HIT_TOLERANCE_PX = 22;

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
 * Touch: thumb-only + ~80ms hold so scrolling past the track does not retune values.
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
  /** @type {{
   *   input: HTMLInputElement,
   *   id: number,
   *   startX: number,
   *   startY: number,
   *   lastX: number,
   *   timer: ReturnType<typeof setTimeout>,
   * } | null} */
  let pending = null;

  const cancelPending = () => {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending = null;
  };

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
    return null;
  };

  /** @param {HTMLInputElement} input @param {number} clientX */
  const isThumbHit = (input, clientX) =>
    isPointerOnSliderThumb(input, clientX, THUMB_HIT_TOLERANCE_PX);

  /**
   * @param {HTMLInputElement} input
   * @param {number} id
   * @param {number} clientX
   */
  const startDrag = (input, id, clientX) => {
    if (dragInput) return;
    cancelPending();
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
    cancelPending();
    if (!dragInput) return;
    const input = dragInput;
    dragInput = null;
    dragId = null;
    unlockScroll();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    releaseChrome();
  };

  /**
   * @param {HTMLInputElement} input
   * @param {number} id
   * @param {number} clientX
   * @param {number} clientY
   */
  const armDrag = (input, id, clientX, clientY) => {
    if (dragInput || !isThumbHit(input, clientX)) return false;
    cancelPending();
    pending = {
      input,
      id,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      timer: setTimeout(() => {
        if (!pending || pending.id !== id) return;
        const snap = pending;
        pending = null;
        startDrag(snap.input, snap.id, snap.lastX);
      }, SLIDER_ARM_HOLD_MS),
    };
    return true;
  };

  /** @param {number} id @param {number} clientX @param {number} clientY */
  const trackPendingMove = (id, clientX, clientY) => {
    if (!pending || pending.id !== id) return;
    pending.lastX = clientX;
    const dx = clientX - pending.startX;
    const dy = clientY - pending.startY;
    if (Math.abs(dy) > SCROLL_CANCEL_MOVE_PX && Math.abs(dy) > Math.abs(dx)) {
      cancelPending();
    }
  };

  /** @param {TouchEvent} e */
  const onTouchStart = (e) => {
    if (dragInput || pending || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const input =
      resolveRangeInput(e.target)
      ?? resolveRangeInput(document.elementFromPoint(touch.clientX, touch.clientY));
    if (!input || !armDrag(input, touch.identifier, touch.clientX, touch.clientY)) return;

    touchHandled = true;
  };

  /** @param {TouchEvent} e */
  const onTouchMove = (e) => {
    if (pending) {
      const touch = [...e.touches].find((t) => t.identifier === pending?.id);
      if (touch) {
        trackPendingMove(touch.identifier, touch.clientX, touch.clientY);
      }
    }

    if (dragId == null || !dragInput) return;

    const touch = [...e.touches].find((t) => t.identifier === dragId);
    if (!touch) return;

    e.preventDefault();
    applyValue(dragInput, touch.clientX);
  };

  /** @param {TouchEvent} e */
  const onTouchEnd = (e) => {
    for (const touch of e.changedTouches) {
      if (pending?.id === touch.identifier) {
        cancelPending();
      }
      if (dragId == null || touch.identifier !== dragId) continue;
      endDrag();
      return;
    }
  };

  /** @param {PointerEvent} e */
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' || dragInput || pending) return;

    if (touchHandled) {
      touchHandled = false;
      return;
    }

    const input = resolveRangeInput(e.target);
    if (!input || !armDrag(input, e.pointerId, e.clientX, e.clientY)) return;

    e.stopPropagation();
  };

  /** @param {PointerEvent} e */
  const onPointerMove = (e) => {
    if (pending && e.pointerId === pending.id) {
      trackPendingMove(e.pointerId, e.clientX, e.clientY);
    }

    if (dragId == null || e.pointerId !== dragId || !dragInput) return;
    e.preventDefault();
    applyValue(dragInput, e.clientX);
  };

  /** @param {PointerEvent} e */
  const onPointerEnd = (e) => {
    if (pending?.id === e.pointerId) {
      cancelPending();
    }
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

  root.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
  document.addEventListener('touchend', onTouchEnd, { capture: true });
  document.addEventListener('touchcancel', onTouchEnd, { capture: true });

  root.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  document.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
  document.addEventListener('pointerup', onPointerEnd, { capture: true });
  document.addEventListener('pointercancel', onPointerEnd, { capture: true });

  return {
    release: () => {
      touchHandled = false;
      cancelPending();
      dragInput = null;
      dragId = null;
      unlockScroll();
      releaseChrome();
    },
    isActive: () => dragInput != null || pending != null || root.dataset.sliderFocus != null,
  };
};
