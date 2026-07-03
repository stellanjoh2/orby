/**
 * Drag a floating panel by its header chrome (not only the grip icon).
 * @param {HTMLElement | null | undefined} header
 * @param {(event: PointerEvent) => void} onDragStart
 * @param {string} [blockSelector] elements that should not start a drag
 */
export function bindFloatingPanelHeaderDrag(
  header,
  onDragStart,
  blockSelector = '.close-btn, .map-preview-panel__tab',
) {
  if (!header) return;

  header.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(blockSelector)) return;
    onDragStart(event);
  });
}

/**
 * @param {HTMLElement | null | undefined} panel
 * @param {boolean} dragging
 */
export function setFloatingPanelDragging(panel, dragging) {
  panel?.classList.toggle('is-panel-dragging', dragging);
}
