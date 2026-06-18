import { mobileHaptic } from './mobileHaptics.js';

const DISMISS_THRESHOLD_PX = 64;
const DISMISS_VELOCITY = 0.5;
const RUBBER_BAND = 0.42;
const DRAG_INTENT_PX = 10;

/** Interactive controls — never start a sheet drag from these. */
const DRAG_BLOCK =
  'input, button, textarea, select, .orby-mobile-preset, .effect-toggle, .orby-mobile-color-swatch, .orby-mobile-seg__btn, .orby-mobile-pill-btn';

/**
 * Pull-down to dismiss + rubber-band on the bottom sheet.
 * @param {{
 *   root: HTMLElement,
 *   sheet: HTMLElement,
 *   onDismiss: (dragOffsetPx?: number) => void,
 * }} opts
 */
export function bindMobileSheetDrag({ root, sheet, onDismiss }) {
  /** @type {number | null} */
  let pointerId = null;
  let startY = 0;
  let startX = 0;
  let lastY = 0;
  let lastTime = 0;
  let dragging = false;
  let pending = false;

  const getActiveScroller = () => {
    const tab = root.dataset.activeTab;
    if (tab === 'fx' || tab === 'light' || tab === 'style' || tab === 'filters') {
      return root.querySelector('.orby-mobile-sheet__scroll');
    }
    return null;
  };

  const scrollerAtTop = () => {
    const scroller = getActiveScroller();
    return !(scroller instanceof HTMLElement) || scroller.scrollTop <= 1;
  };

  /** @param {Element} target */
  const isBlockedTarget = (target) => Boolean(target.closest(DRAG_BLOCK));

  /** @param {number} clientY */
  const isInGrabberZone = (clientY) => {
    const grabber = sheet.querySelector('.orby-mobile-sheet__grabber');
    if (!(grabber instanceof HTMLElement)) return false;
    const rect = grabber.getBoundingClientRect();
    return clientY >= rect.top && clientY <= rect.bottom;
  };

  /** @param {EventTarget | null} target @param {number} clientY */
  const canStartDrag = (target, clientY) => {
    if (!(target instanceof Element)) return false;
    if (root.dataset.sliderFocus != null) return false;
    if (root.dataset.sheet === 'closed') return false;
    if (isBlockedTarget(target)) return false;
    if (!scrollerAtTop()) return false;

    if (target.closest('.orby-mobile-sheet__grabber') || isInGrabberZone(clientY)) {
      return true;
    }

    if (
      target.closest('.orby-mobile-sheet__shelf')
      && !target.closest('.orby-mobile-preset, button, a, input')
    ) {
      return true;
    }

    if (target.closest('.orby-mobile-preset-rail__track')) {
      return false;
    }

    return target.closest('.orby-mobile-sheet') != null;
  };

  /** @param {EventTarget | null} target */
  const canDeferDrag = (target) => {
    if (!(target instanceof Element)) return false;
    if (root.dataset.sliderFocus != null) return false;
    if (root.dataset.sheet === 'closed') return false;
    if (!scrollerAtTop()) return false;
    if (isBlockedTarget(target)) return false;
    return target.closest('.orby-mobile-sheet') != null;
  };

  const clearDragTransform = () => {
    sheet.classList.remove('orby-mobile-sheet--dragging');
    sheet.style.removeProperty('transform');
  };

  const beginDrag = () => {
    dragging = true;
    pending = false;
    sheet.classList.add('orby-mobile-sheet--dragging');
  };

  const applyDragOffset = (offsetPx) => {
    const y = offsetPx < 0 ? offsetPx * RUBBER_BAND : offsetPx;
    sheet.style.transform = `translate3d(0, ${y}px, 0)`;
  };

  /** @param {PointerEvent} e */
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    if (canStartDrag(e.target, e.clientY)) {
      dragging = true;
      pending = false;
      pointerId = e.pointerId;
      startY = e.clientY;
      startX = e.clientX;
      lastY = e.clientY;
      lastTime = performance.now();
      beginDrag();
      sheet.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (canDeferDrag(e.target)) {
      pending = true;
      dragging = false;
      pointerId = e.pointerId;
      startY = e.clientY;
      startX = e.clientX;
      lastY = e.clientY;
      lastTime = performance.now();
      sheet.setPointerCapture(e.pointerId);
    }
  };

  /** @param {PointerEvent} e */
  const onPointerMove = (e) => {
    if (e.pointerId !== pointerId) return;

    if (pending && !dragging) {
      const dy = e.clientY - startY;
      const dx = e.clientX - startX;
      if (dy > DRAG_INTENT_PX && dy > Math.abs(dx) * 1.2) {
        beginDrag();
        e.preventDefault();
      } else if (dy < -DRAG_INTENT_PX || Math.abs(dx) > DRAG_INTENT_PX * 2) {
        pending = false;
        pointerId = null;
        try {
          sheet.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      } else {
        return;
      }
    }

    if (!dragging) return;

    const dy = e.clientY - startY;
    if (dy > 0) {
      const scroller = getActiveScroller();
      if (scroller instanceof HTMLElement && scroller.scrollTop > 0) return;
    }
    applyDragOffset(dy);
    lastY = e.clientY;
    lastTime = performance.now();
    e.preventDefault();
  };

  /** @param {PointerEvent} e */
  const onPointerEnd = (e) => {
    if (e.pointerId !== pointerId) return;

    if (pending && !dragging) {
      pending = false;
      pointerId = null;
      try {
        sheet.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    if (!dragging) return;

    const dy = e.clientY - startY;
    const dt = Math.max(1, performance.now() - lastTime);
    const velocity = (e.clientY - lastY) / dt;
    const shouldDismiss = dy > DISMISS_THRESHOLD_PX || velocity > DISMISS_VELOCITY;

    dragging = false;
    pending = false;
    pointerId = null;

    try {
      sheet.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (shouldDismiss && dy > 0) {
      sheet.classList.remove('orby-mobile-sheet--dragging');
      onDismiss(Math.max(0, dy));
      return;
    }

    clearDragTransform();

    if (dy > 8) {
      mobileHaptic('light');
    }
  };

  sheet.addEventListener('pointerdown', onPointerDown);
  sheet.addEventListener('pointermove', onPointerMove);
  sheet.addEventListener('pointerup', onPointerEnd);
  sheet.addEventListener('pointercancel', onPointerEnd);

  return {
    reset() {
      dragging = false;
      pending = false;
      pointerId = null;
      sheet.classList.remove('orby-mobile-sheet--dragging');
    },
  };
}
