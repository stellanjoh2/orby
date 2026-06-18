import { isShelfLockZone } from './mobileShelfLock.js';

/**
 * Engage shared slider chrome on mouse pointer down. Touch uses bindMobileRangeTouch.
 * Touch value drag in the bottom sheet still uses bindMobileRangeTouch + the same chrome.
 * @param {{ root: HTMLElement, chrome: ReturnType<typeof import('./mobileSliderChrome.js').createMobileSliderChrome> }} opts
 */
export function bindMobileSliderFocus({ root, chrome }) {
  /** @type {number | null} */
  let activePointerId = null;

  const release = () => {
    activePointerId = null;
    chrome.release();
  };

  /** @param {PointerEvent} e */
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    if (!(e.target instanceof Element)) return;

    const row = e.target.closest('.orby-mobile-fx-grade');
    if (!(row instanceof HTMLElement) || !root.contains(row)) return;

    const input = row.querySelector('input[type="range"]');
    if (!(input instanceof HTMLInputElement) || input.disabled) return;
    if (isShelfLockZone(root, e.clientX, e.clientY)) return;

    // Touch uses bindMobileRangeTouch (thumb hold → chrome.engage). Immediate engage
    // on pointerdown steals vertical pans meant to scroll the object panel.
    if (e.pointerType !== 'mouse') return;

    activePointerId = e.pointerId;
    chrome.engage(input);
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
      if (chrome.getActiveInput() !== e.target) return;
      release();
    },
    true,
  );
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerUp, true);

  return {
    release,
    isActive: () => chrome.isActive(),
  };
}
