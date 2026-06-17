/** Touches on preset rail / controls pass through; fade zone scrolls the sheet instead. */
const SHELF_INTERACTIVE =
  '.orby-mobile-preset-rail, .orby-mobile-preset, button, a, input, select, textarea, label, [role="button"]';

/**
 * True when coordinates fall in the pinned preset shelf (sliders underneath are locked).
 * @param {HTMLElement} root
 * @param {number} clientX
 * @param {number} clientY
 */
export function isShelfLockZone(root, clientX, clientY) {
  if (root.dataset.activeTab === 'fx') return false;
  const sheet = root.dataset.sheet;
  if (sheet !== 'peek' && sheet !== 'expanded') return false;

  const shelf = root.querySelector('.orby-mobile-sheet__shelf');
  if (!(shelf instanceof HTMLElement)) return false;
  if (getComputedStyle(shelf).display === 'none') return false;

  const rect = shelf.getBoundingClientRect();
  return (
    clientY >= rect.top
    && clientY <= rect.bottom
    && clientX >= rect.left
    && clientX <= rect.right
  );
}

/**
 * Shelf fade captures touches so sliders behind spheres cannot be grabbed.
 * Vertical pans in the fade zone scroll the controls column above.
 * @param {{ root: HTMLElement, shelf: HTMLElement, scroll: HTMLElement }} opts
 */
export function bindMobileShelfLock({ root, shelf, scroll }) {
  /** @type {{ id: number, y: number, scrollTop: number } | null} */
  let pan = null;

  const isActive = () => {
    const sheet = root.dataset.sheet;
    return sheet === 'peek' || sheet === 'expanded';
  };

  /** @param {EventTarget | null} target */
  const isInteractiveShelfTarget = (target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest(SHELF_INTERACTIVE));
  };

  /** @param {TouchEvent} e */
  const onTouchStart = (e) => {
    if (!isActive() || root.dataset.activeTab === 'fx') return;
    if (isInteractiveShelfTarget(e.target)) return;
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    pan = {
      id: touch.identifier,
      y: touch.clientY,
      scrollTop: scroll.scrollTop,
    };
  };

  /** @param {TouchEvent} e */
  const onTouchMove = (e) => {
    if (!pan) return;
    const touch = [...e.touches].find((t) => t.identifier === pan?.id);
    if (!touch) return;

    const dy = pan.y - touch.clientY;
    scroll.scrollTop = pan.scrollTop + dy;
    if (Math.abs(dy) > 1) e.preventDefault();
  };

  /** @param {TouchEvent} e */
  const onTouchEnd = (e) => {
    if (!pan) return;
    if ([...e.changedTouches].some((t) => t.identifier === pan?.id)) {
      pan = null;
    }
  };

  shelf.addEventListener('touchstart', onTouchStart, { passive: true });
  shelf.addEventListener('touchmove', onTouchMove, { passive: false });
  shelf.addEventListener('touchend', onTouchEnd, { passive: true });
  shelf.addEventListener('touchcancel', onTouchEnd, { passive: true });
}
