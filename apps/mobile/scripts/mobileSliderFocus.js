import { isPointerOnSliderThumb } from '../../../scripts/ui/sliderDefaultPaths.js';
import { mobileHaptic } from './mobileHaptics.js';

const SLIDER_FOCUS_HOLD_MS = 380;
const SLIDER_FOCUS_CANCEL_MOVE_PX = 12;
const SLIDER_FOCUS_DRAG_ENGAGE_PX = 6;
const MOBILE_THUMB_HIT_PX = 14;

const finePointerMedia = window.matchMedia('(hover: hover) and (pointer: fine)');

/** Touch-first chrome hide — skip on desktop mouse so native range dragging stays intact. */
const shouldHandleSliderFocus = (pointerType) => {
  if (pointerType === 'mouse') return false;
  if (finePointerMedia.matches) return false;
  return true;
};

/**
 * While dragging a range slider thumb, fade chrome and keep the active control in place.
 * @param {{ root: HTMLElement }} opts
 */
export function bindMobileSliderFocus({ root }) {
  /** @type {HTMLElement | null} */
  let activeRow = null;
  /** @type {HTMLInputElement | null} */
  let activeInput = null;
  /** @type {number | null} */
  let activePointerId = null;
  /** @type {number | null} */
  let activeTouchId = null;
  /** @type {{
   *   input: HTMLInputElement,
   *   row: HTMLElement,
   *   pointerId: number,
   *   pointerType: string,
   *   startX: number,
   *   startY: number,
   *   timer: ReturnType<typeof setTimeout>,
   * } | null} */
  let pending = null;

  const cancelPending = () => {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending = null;
  };

  const release = () => {
    cancelPending();
    if (!activeRow) return;
    activeRow.classList.remove('is-slider-focus');
    activeRow = null;
    activeInput = null;
    activePointerId = null;
    activeTouchId = null;
    delete root.dataset.sliderFocus;
  };

  /**
   * @param {HTMLInputElement} input
   * @param {HTMLElement} row
   * @param {number} pointerId
   * @param {string} pointerType
   */
  const engage = (input, row, pointerId, pointerType) => {
    if (activeRow !== row) {
      activeRow?.classList.remove('is-slider-focus');
    }
    activeInput = input;
    activeRow = row;
    activePointerId = pointerId;
    activeTouchId = pointerType === 'mouse' ? null : pointerId;
    root.dataset.sliderFocus = 'true';
    row.classList.add('is-slider-focus');
    mobileHaptic('soft');
  };

  /**
   * @param {HTMLInputElement} input
   * @param {HTMLElement} row
   * @param {PointerEvent} e
   */
  const startPending = (input, row, e) => {
    if (!isPointerOnSliderThumb(input, e.clientX, MOBILE_THUMB_HIT_PX)) return;

    cancelPending();
    pending = {
      input,
      row,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      timer: setTimeout(() => {
        if (!pending) return;
        const snap = pending;
        pending = null;
        engage(snap.input, snap.row, snap.pointerId, snap.pointerType);
      }, SLIDER_FOCUS_HOLD_MS),
    };
  };

  /** @param {PointerEvent} e */
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!shouldHandleSliderFocus(e.pointerType)) return;
    if (!(e.target instanceof Element)) return;

    const row = e.target.closest('.orby-mobile-fx-grade');
    if (!(row instanceof HTMLElement) || !root.contains(row)) return;

    const input = row.querySelector('input[type="range"]');
    if (!(input instanceof HTMLInputElement) || input.disabled) return;

    startPending(input, row, e);
  };

  /** @param {PointerEvent} e */
  const onPointerMove = (e) => {
    if (!pending || e.pointerId !== pending.pointerId) return;

    const dx = e.clientX - pending.startX;
    const dy = e.clientY - pending.startY;
    if (Math.hypot(dx, dy) > SLIDER_FOCUS_CANCEL_MOVE_PX) {
      cancelPending();
      return;
    }

    if (
      Math.abs(dx) >= SLIDER_FOCUS_DRAG_ENGAGE_PX
      && Math.abs(dx) > Math.abs(dy)
    ) {
      const snap = pending;
      cancelPending();
      engage(snap.input, snap.row, snap.pointerId, snap.pointerType);
    }
  };

  /** @param {PointerEvent} e */
  const onPointerUp = (e) => {
    if (pending?.pointerId === e.pointerId) {
      cancelPending();
    }
    if (activePointerId == null || e.pointerId !== activePointerId) return;
    // iOS cancels pointer events when native range drag starts; touchend releases instead.
    if (activeTouchId != null) return;
    release();
  };

  /** @param {PointerEvent} e */
  const onPointerCancel = (e) => {
    if (pending?.pointerId === e.pointerId) {
      cancelPending();
    }
    if (activePointerId == null || e.pointerId !== activePointerId) return;
    if (activeTouchId != null) return;
    release();
  };

  /** @param {TouchEvent} e */
  const onTouchEnd = (e) => {
    for (const touch of e.changedTouches) {
      if (pending?.pointerId === touch.identifier) {
        cancelPending();
      }
      if (activeTouchId == null || touch.identifier !== activeTouchId) continue;
      release();
      return;
    }
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerCancel, true);
  document.addEventListener('touchend', onTouchEnd, true);
  document.addEventListener('touchcancel', onTouchEnd, true);

  return {
    release,
    isActive: () => root.dataset.sliderFocus != null,
  };
};
