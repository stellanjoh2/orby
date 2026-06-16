import { mobileHaptic } from './mobileHaptics.js';

/** Ignore the first touchend iOS fires when it takes over native range dragging. */
const TOUCH_END_GRACE_MS = 450;

/**
 * While dragging a range slider, fade chrome and keep the active control in place.
 * Engages immediately on slider interaction (same feel as mouse review in a desktop browser).
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
  /** @type {number} */
  let touchEngageAt = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let touchReleaseTimer = null;

  const clearTouchReleaseTimer = () => {
    if (touchReleaseTimer == null) return;
    clearTimeout(touchReleaseTimer);
    touchReleaseTimer = null;
  };

  const release = () => {
    clearTouchReleaseTimer();
    if (!activeRow) return;
    activeRow.classList.remove('is-slider-focus');
    activeRow = null;
    activeInput = null;
    activePointerId = null;
    activeTouchId = null;
    touchEngageAt = 0;
    delete root.dataset.sliderFocus;
  };

  /**
   * @param {HTMLInputElement} input
   * @param {HTMLElement} row
   * @param {number} pointerId
   * @param {string} pointerType
   */
  const engage = (input, row, pointerId, pointerType) => {
    if (activeInput === input && root.dataset.sliderFocus != null) return;
    clearTouchReleaseTimer();
    if (activeRow !== row) {
      activeRow?.classList.remove('is-slider-focus');
    }
    activeInput = input;
    activeRow = row;
    activePointerId = pointerId;
    activeTouchId = pointerType === 'mouse' ? null : pointerId;
    touchEngageAt = activeTouchId != null ? performance.now() : 0;
    root.dataset.sliderFocus = 'true';
    row.classList.add('is-slider-focus');
    mobileHaptic('soft');
  };

  /**
   * @param {EventTarget | null} target
   * @returns {{ input: HTMLInputElement, row: HTMLElement } | null}
   */
  const resolveSlider = (target) => {
    if (!(target instanceof Element)) return null;
    const row = target.closest('.orby-mobile-fx-grade');
    if (!(row instanceof HTMLElement) || !root.contains(row)) return null;
    const input = row.querySelector('input[type="range"]');
    if (!(input instanceof HTMLInputElement) || input.disabled) return null;
    return { input, row };
  };

  /**
   * @param {HTMLInputElement} input
   * @param {HTMLElement} row
   * @param {number} pointerId
   * @param {string} pointerType
   */
  const engageSlider = (input, row, pointerId, pointerType) => {
    engage(input, row, pointerId, pointerType);
  };

  const scheduleTouchRelease = () => {
    clearTouchReleaseTimer();
    touchReleaseTimer = setTimeout(() => {
      touchReleaseTimer = null;
      if (activeTouchId == null) return;
      release();
    }, 40);
  };

  /** @param {PointerEvent} e */
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const hit = resolveSlider(e.target);
    if (!hit) return;
    engageSlider(hit.input, hit.row, e.pointerId, e.pointerType);
  };

  /** @param {TouchEvent} e */
  const onTouchStart = (e) => {
    for (const touch of e.changedTouches) {
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const hit = resolveSlider(el);
      if (!hit) continue;
      engageSlider(hit.input, hit.row, touch.identifier, 'touch');
    }
  };

  /** @param {Event} e */
  const onInput = (e) => {
    if (!(e.target instanceof HTMLInputElement) || e.target.type !== 'range') return;
    if (!root.contains(e.target)) return;
    clearTouchReleaseTimer();
    if (root.dataset.sliderFocus != null && activeInput === e.target) return;
    const row = e.target.closest('.orby-mobile-fx-grade');
    if (!(row instanceof HTMLElement)) return;
    const pointerId = activeTouchId ?? activePointerId ?? 0;
    const pointerType = activeTouchId != null ? 'touch' : 'mouse';
    engageSlider(e.target, row, pointerId, pointerType);
  };

  /** @param {Event} e */
  const onChange = (e) => {
    if (!(e.target instanceof HTMLInputElement) || e.target.type !== 'range') return;
    if (activeInput !== e.target) return;
    release();
  };

  /** @param {FocusEvent} e */
  const onBlur = (e) => {
    if (!(e.target instanceof HTMLInputElement) || e.target.type !== 'range') return;
    if (activeInput !== e.target) return;
    release();
  };

  /** @param {PointerEvent} e */
  const onPointerUp = (e) => {
    if (activePointerId == null || e.pointerId !== activePointerId) return;
    if (activeTouchId != null) return;
    release();
  };

  /** @param {PointerEvent} e */
  const onPointerCancel = (e) => {
    if (activePointerId == null || e.pointerId !== activePointerId) return;
    if (activeTouchId != null) return;
    release();
  };

  /** @param {TouchEvent} e */
  const onTouchEnd = (e) => {
    for (const touch of e.changedTouches) {
      if (activeTouchId == null || touch.identifier !== activeTouchId) continue;
      // iOS hands native range drags to the browser and fires an early touchend.
      if (performance.now() - touchEngageAt < TOUCH_END_GRACE_MS) return;
      scheduleTouchRelease();
      return;
    }
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  root.addEventListener('input', onInput, true);
  root.addEventListener('change', onChange, true);
  root.addEventListener('blur', onBlur, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerCancel, true);
  document.addEventListener('touchend', onTouchEnd, true);
  document.addEventListener('touchcancel', onTouchEnd, true);

  return {
    release,
    isActive: () => root.dataset.sliderFocus != null,
  };
}
