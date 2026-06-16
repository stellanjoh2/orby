import { isPointerOnSliderThumb } from '../../../scripts/ui/sliderDefaultPaths.js';
import { mobileHaptic } from './mobileHaptics.js';

const SLIDER_FOCUS_HOLD_MS = 380;
const SLIDER_FOCUS_CANCEL_MOVE_PX = 12;
const SLIDER_FOCUS_DRAG_ENGAGE_PX = 6;
const MOBILE_THUMB_HIT_PX = 14;
const TOUCH_THUMB_HIT_PX = 18;

const finePointerMedia = window.matchMedia('(hover: hover) and (pointer: fine)');
const coarseTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)');

/** Desktop browser / DevTools mobile preview — mouse or fine pointer. */
const isFinePointer = (pointerType) =>
  pointerType === 'mouse' || finePointerMedia.matches;

/**
 * @param {HTMLInputElement} input
 * @param {PointerEvent} e
 */
function shouldStartSliderFocusPending(input, e) {
  const tolerance =
    e.pointerType === 'touch' || e.pointerType === 'pen'
      ? TOUCH_THUMB_HIT_PX
      : MOBILE_THUMB_HIT_PX;
  if (isPointerOnSliderThumb(input, e.clientX, tolerance)) return true;
  if ((e.pointerType === 'touch' || e.pointerType === 'pen') && e.target === input) return true;
  return false;
}

/**
 * Chrome fade while dragging sliders — desktop preview only.
 * Real phones use bindMobileRangeTouch for drag + the same chrome fade.
 * @param {{ root: HTMLElement }} opts
 */
export function bindMobileSliderFocus({ root }) {
  /** @type {HTMLElement | null} */
  let activeRow = null;
  /** @type {HTMLInputElement | null} */
  let activeInput = null;
  /** @type {number | null} */
  let activePointerId = null;
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
  /** @type {{
   *   input: HTMLInputElement,
   *   row: HTMLElement,
   *   pointerId: number,
   *   pointerType: string,
   * } | null} */
  let touchSession = null;

  const cancelPending = () => {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending = null;
  };

  const release = () => {
    cancelPending();
    touchSession = null;
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
    cancelPending();
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

  /**
   * @param {HTMLInputElement} input
   * @param {HTMLElement} row
   * @param {PointerEvent} e
   */
  const startPending = (input, row, e) => {
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
        engage(snap.input, snap.row, snap.pointerId);
      }, SLIDER_FOCUS_HOLD_MS),
    };
  };

  /** @param {PointerEvent} e */
  const onPointerDown = (e) => {
    if (coarseTouchDevice.matches) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!(e.target instanceof Element)) return;

    const row = e.target.closest('.orby-mobile-fx-grade');
    if (!(row instanceof HTMLElement) || !root.contains(row)) return;

    const input = row.querySelector('input[type="range"]');
    if (!(input instanceof HTMLInputElement) || input.disabled) return;

    // Desktop mobile preview — engage immediately (native range + chrome fade).
    if (isFinePointer(e.pointerType)) {
      engage(input, row, e.pointerId);
      return;
    }

    touchSession = {
      input,
      row,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
    };

    if (!shouldStartSliderFocusPending(input, e)) {
      touchSession = null;
      return;
    }

    startPending(input, row, e);
  };

  /** @param {PointerEvent} e */
  const onPointerMove = (e) => {
    if (coarseTouchDevice.matches) return;
    if (!pending || e.pointerId !== pending.pointerId) return;

    const dx = e.clientX - pending.startX;
    const dy = e.clientY - pending.startY;

    if (Math.abs(dx) >= SLIDER_FOCUS_DRAG_ENGAGE_PX && Math.abs(dx) > Math.abs(dy)) {
      const snap = pending;
      cancelPending();
      engage(snap.input, snap.row, snap.pointerId);
      return;
    }

    if (Math.abs(dy) > SLIDER_FOCUS_CANCEL_MOVE_PX && Math.abs(dy) > Math.abs(dx)) {
      cancelPending();
      touchSession = null;
    }
  };

  /** @param {PointerEvent} e */
  const onPointerUp = (e) => {
    if (coarseTouchDevice.matches) return;
    if (pending?.pointerId === e.pointerId) {
      cancelPending();
    }
    if (touchSession?.pointerId === e.pointerId) {
      touchSession = null;
    }
    if (activePointerId == null || e.pointerId !== activePointerId) return;
    release();
  };

  /** @param {PointerEvent} e */
  const onPointerCancel = (e) => {
    if (coarseTouchDevice.matches) return;
    if (pending?.pointerId === e.pointerId) {
      cancelPending();
    }
    if (touchSession?.pointerId === e.pointerId) {
      touchSession = null;
    }
    if (activePointerId == null || e.pointerId !== activePointerId) return;
    release();
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener(
    'input',
    (e) => {
      if (coarseTouchDevice.matches) return;
      if (!(e.target instanceof HTMLInputElement) || e.target.type !== 'range') return;
      if (!root.contains(e.target)) return;
      if (root.dataset.sliderFocus != null && activeInput === e.target) return;

      const row = e.target.closest('.orby-mobile-fx-grade');
      if (!(row instanceof HTMLElement)) return;

      const session = pending ?? touchSession;
      if (!session || session.input !== e.target) return;

      engage(e.target, row, session.pointerId);
    },
    true,
  );
  root.addEventListener(
    'change',
    (e) => {
      if (coarseTouchDevice.matches) return;
      if (!(e.target instanceof HTMLInputElement) || e.target.type !== 'range') return;
      if (activeInput !== e.target) return;
      release();
    },
    true,
  );
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerCancel, true);

  return {
    release,
    isActive: () => root.dataset.sliderFocus != null,
  };
}
