import { mobileHaptic } from './mobileHaptics.js';

const DISMISS_THRESHOLD_PX = 76;
const DISMISS_VELOCITY = 0.55;
const RUBBER_BAND = 0.42;

/**
 * Pull-down to dismiss + rubber-band on the bottom sheet.
 * @param {{
 *   root: HTMLElement,
 *   sheet: HTMLElement,
 *   onDismiss: () => void,
 * }} opts
 */
export function bindMobileSheetDrag({ root, sheet, onDismiss }) {
  /** @type {number | null} */
  let pointerId = null;
  let startY = 0;
  let lastY = 0;
  let lastTime = 0;
  let dragging = false;

  const getActiveScroller = () => {
    const tab = root.dataset.activeTab;
    if (tab === 'fx') {
      return root.querySelector('[data-panel="fx"] .orby-mobile-fx-controls');
    }
    const panel = root.querySelector(`[data-panel="${tab}"]`);
    return panel instanceof HTMLElement ? panel : null;
  };

  /** @param {EventTarget | null} target */
  const canStartDrag = (target) => {
    if (!(target instanceof Element)) return false;
    if (root.dataset.sliderFocus != null) return false;
    if (root.dataset.sheet === 'closed') return false;
    if (target.closest('input, button, textarea, select, label, .orby-mobile-preset, .effect-toggle')) {
      return false;
    }
    if (target.closest('.orby-mobile-sheet__grabber')) return true;
    const scroller = getActiveScroller();
    if (scroller instanceof HTMLElement && scroller.scrollTop > 1) return false;
    return target.closest('.orby-mobile-sheet') != null;
  };

  const clearDragTransform = () => {
    sheet.classList.remove('orby-mobile-sheet--dragging');
    sheet.style.removeProperty('transform');
  };

  const applyDragOffset = (offsetPx) => {
    const y = offsetPx < 0 ? offsetPx * RUBBER_BAND : offsetPx;
    sheet.style.transform = `translate3d(0, ${y}px, 0)`;
  };

  /** @param {PointerEvent} e */
  const onPointerDown = (e) => {
    if (!canStartDrag(e.target)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    dragging = true;
    pointerId = e.pointerId;
    startY = e.clientY;
    lastY = e.clientY;
    lastTime = performance.now();
    sheet.classList.add('orby-mobile-sheet--dragging');
    sheet.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  /** @param {PointerEvent} e */
  const onPointerMove = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    const dy = e.clientY - startY;
    if (dy > 0) {
      const scroller = getActiveScroller();
      if (scroller instanceof HTMLElement && scroller.scrollTop > 0) return;
    }
    applyDragOffset(dy);
    lastY = e.clientY;
    lastTime = performance.now();
  };

  /** @param {PointerEvent} e */
  const onPointerEnd = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;

    const dy = e.clientY - startY;
    const dt = Math.max(1, performance.now() - lastTime);
    const velocity = (e.clientY - lastY) / dt;
    const shouldDismiss = dy > DISMISS_THRESHOLD_PX || velocity > DISMISS_VELOCITY;

    dragging = false;
    pointerId = null;
    clearDragTransform();

    try {
      sheet.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (shouldDismiss && dy > 0) {
      mobileHaptic('soft');
      onDismiss();
    } else if (dy > 8) {
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
      pointerId = null;
      clearDragTransform();
    },
  };
}
