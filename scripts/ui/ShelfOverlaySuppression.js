/**
 * Ref-counted hide of the settings shelf while full-screen overlays are up
 * (same `is-shelf-hidden` treatment as V). Used by bug report, fullscreen prompts, etc.
 *
 * Expects `ui` with: `dom.shelf`, `shelfRevealed`, `uiHidden`.
 */
export class ShelfOverlaySuppression {
  /**
   * @param {{ dom: { shelf?: HTMLElement | null }, shelfRevealed: boolean, uiHidden: boolean }} ui
   */
  constructor(ui) {
    this._ui = ui;
    this._depth = 0;
    this._restorePending = false;
    this._restoreRafId = null;
  }

  begin() {
    const shelf = this._ui.dom.shelf;
    if (!shelf) return;

    if (this._restoreRafId != null) {
      cancelAnimationFrame(this._restoreRafId);
      this._restoreRafId = null;
    }

    if (this._depth === 0) {
      const notHidden = !shelf.classList.contains('is-shelf-hidden');
      const chromeWantsShelf = this._ui.shelfRevealed && !this._ui.uiHidden;
      const visible = chromeWantsShelf && notHidden;
      const chainedOverlay = chromeWantsShelf && !notHidden;
      this._restorePending = visible || chainedOverlay;
      if (visible) {
        shelf.classList.add('is-shelf-hidden');
      }
    }
    this._depth++;
  }

  end() {
    if (this._depth <= 0) return;
    this._depth--;
    if (this._depth > 0) return;

    const wantedRestore = this._restorePending;
    this._restorePending = false;
    const shelf = this._ui.dom.shelf;
    if (!wantedRestore || !shelf) return;
    const onStartScreen =
      typeof document !== 'undefined' && document.body.classList.contains('dropzone-visible');
    if (onStartScreen) return;
    this._restoreRafId = requestAnimationFrame(() => {
      this._restoreRafId = null;
      if (!this._ui.uiHidden && this._ui.shelfRevealed && this._ui.dom.shelf) {
        this._ui.dom.shelf.classList.remove('is-shelf-hidden');
      }
    });
  }
}
