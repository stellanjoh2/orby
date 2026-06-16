import { isPointerOnSliderThumb } from '../../../scripts/ui/sliderDefaultPaths.js';
import { mobileHaptic } from './mobileHaptics.js';

const SLIDER_FOCUS_HOLD_MS = 380;
const SLIDER_FOCUS_CANCEL_MOVE_PX = 12;
const SLIDER_FOCUS_DRAG_ENGAGE_PX = 6;
const MOBILE_THUMB_HIT_PX = 14;
const TOUCH_THUMB_HIT_PX = 18;
/** Defer touch release so `change` can fire after iOS native range drag. */
const TOUCH_RELEASE_DELAY_MS = 64;

const finePointerMedia = window.matchMedia('(hover: hover) and (pointer: fine)');

/** Desktop browser preview — mouse or fine pointer; not a real phone touch surface. */
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
  // Direct touch on the track — thumb intent, not sheet scroll.
  if ((e.pointerType === 'touch' || e.pointerType === 'pen') && e.target === input) return true;
  return false;
}

/**
 * While dragging a range slider thumb, fade chrome and keep the active control in place.
 * Desktop preview: engage immediately on pointer down (mouse).
 * Real touch: thumb hit + hold, or horizontal drag before scroll steals the gesture.
 * @param {{ root: HTMLElement }} opts
 */
export function bindMobileSliderFocus({ root }) {
  /** @type {HTMLElement | null} */
  let activeRow = null;
  /** @type {HTMLInputElement | null} */
  let activeInput = null;
  /** @type {number | null} */
  let activePointerId = null;
  /** @type {string | null} */
  let activePointerType = null;
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
  /** @type {ReturnType<typeof setTimeout> | null} */
  let touchReleaseTimer = null;

  const clearTouchReleaseTimer = () => {
    if (touchReleaseTimer == null) return;
    clearTimeout(touchReleaseTimer);
    touchReleaseTimer = null;
  };

  const cancelPending = () => {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending = null;
  };

  const release = () => {
    cancelPending();
    clearTouchReleaseTimer();
    touchSession = null;
    if (!activeRow) return;
    activeRow.classList.remove('is-slider-focus');
    activeRow = null;
    activeInput = null;
    activePointerId = null;
    activePointerType = null;
    delete root.dataset.sliderFocus;
  };

  /**
   * @param {HTMLInputElement} input
   * @param {HTMLElement} row
   * @param {number} pointerId
   * @param {string} pointerType
   */
  const engage = (input, row, pointerId, pointerType) => {
    cancelPending();
    clearTouchReleaseTimer();
    if (activeRow !== row) {
      activeRow?.classList.remove('is-slider-focus');
    }
    activeInput = input;
    activeRow = row;
    activePointerId = pointerId;
    activePointerType = pointerType;
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
        engage(snap.input, snap.row, snap.pointerId, snap.pointerType);
      }, SLIDER_FOCUS_HOLD_MS),
    };
  };

  const scheduleTouchRelease = () => {
    clearTouchReleaseTimer();
    touchReleaseTimer = setTimeout(() => {
      touchReleaseTimer = null;
      if (activePointerType === 'mouse') return;
      release();
    }, TOUCH_RELEASE_DELAY_MS);
  };

  /** @param {PointerEvent} e */
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!(e.target instanceof Element)) return;

    const row = e.target.closest('.orby-mobile-fx-grade');
    if (!(row instanceof HTMLElement) || !root.contains(row)) return;

    const input = row.querySelector('input[type="range"]');
    if (!(input instanceof HTMLInputElement) || input.disabled) return;

    clearTouchReleaseTimer();

    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      touchSession = {
        input,
        row,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
      };
    } else {
      touchSession = null;
    }

    // Desktop mobile preview — engage immediately (matches mouse review UX).
    if (isFinePointer(e.pointerType)) {
      engage(input, row, e.pointerId, e.pointerType);
      return;
    }

    if (!shouldStartSliderFocusPending(input, e)) {
      touchSession = null;
      return;
    }

    startPending(input, row, e);
  };

  /** @param {PointerEvent} e */
  const onPointerMove = (e) => {
    if (!pending || e.pointerId !== pending.pointerId) return;

    const dx = e.clientX - pending.startX;
    const dy = e.clientY - pending.startY;

    // Engage horizontal thumb drags before scroll-cancel eats the gesture on phones.
    if (Math.abs(dx) >= SLIDER_FOCUS_DRAG_ENGAGE_PX && Math.abs(dx) > Math.abs(dy)) {
      const snap = pending;
      cancelPending();
      engage(snap.input, snap.row, snap.pointerId, snap.pointerType);
      return;
    }

    if (Math.abs(dy) > SLIDER_FOCUS_CANCEL_MOVE_PX && Math.abs(dy) > Math.abs(dx)) {
      cancelPending();
      touchSession = null;
    }
  };

  /** @param {PointerEvent} e */
  const onPointerUp = (e) => {
    if (pending?.pointerId === e.pointerId) {
      cancelPending();
    }
    if (touchSession?.pointerId === e.pointerId) {
      touchSession = null;
    }
    if (activePointerId == null || e.pointerId !== activePointerId) return;

    if (e.pointerType === 'mouse') {
      release();
      return;
    }

    // iOS fires an early pointerup when the native range control takes over — wait for change.
    scheduleTouchRelease();
  };

  /** @param {PointerEvent} e */
  const onPointerCancel = (e) => {
    if (pending?.pointerId === e.pointerId) {
      cancelPending();
    }
    if (touchSession?.pointerId === e.pointerId) {
      touchSession = null;
    }
    if (activePointerId == null || e.pointerId !== activePointerId) return;
    if (e.pointerType === 'mouse') {
      release();
      return;
    }
    scheduleTouchRelease();
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener(
    'input',
    (e) => {
      if (!(e.target instanceof HTMLInputElement) || e.target.type !== 'range') return;
      if (!root.contains(e.target)) return;

      const row = e.target.closest('.orby-mobile-fx-grade');
      if (!(row instanceof HTMLElement)) return;

      clearTouchReleaseTimer();

      if (root.dataset.sliderFocus != null && activeInput === e.target) return;

      const session = pending ?? touchSession;
      if (!session || session.input !== e.target) return;

      engage(e.target, row, session.pointerId, session.pointerType);
    },
    true,
  );
  root.addEventListener(
    'change',
    (e) => {
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
