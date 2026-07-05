import { OrbyColorPicker } from './OrbyColorPicker.js';
import {
  isNativeEyeDropperSupported,
  openNativeColorInputPicker,
  openNativeEyeDropper,
} from './nativeEyeDropper.js';

/**
 * Replaces native `<input type="color">` chips with the custom Orby picker popover.
 */
export class OrbyColorPickerController {
  /**
   * @param {{
   *   stateStore: import('../StateStore.js').StateStore,
   *   helpers: import('./UIHelpers.js').UIHelpers,
   * }} deps
   */
  constructor(deps) {
    this.stateStore = deps.stateStore;
    this.helpers = deps.helpers;
    this.picker = new OrbyColorPicker();
    /** @type {HTMLInputElement | null} */
    this._anchor = null;
    this._editing = false;

    this._onAnchorClick = this._onAnchorClick.bind(this);
    this._onPickerInput = this._onPickerInput.bind(this);
    this._onPickerClose = this._onPickerClose.bind(this);
    this._onEyeDropper = this._onEyeDropper.bind(this);

    this.picker.setCallbacks({
      onInput: this._onPickerInput,
      onClose: this._onPickerClose,
      onEyeDropper: this._onEyeDropper,
    });
  }

  attach(root = document) {
    root.addEventListener('click', this._onAnchorClick, true);
    this._observeDynamicChips(root);
  }

  /**
   * Open the picker for a shelf color chip (e.g. viewport light HUD shortcut).
   * @param {HTMLInputElement} input
   * @param {{ clientX?: number, clientY?: number, placement?: 'shelf' | 'viewport-hud', clickTarget?: Element }} [point]
   */
  openForInput(input, point = {}) {
    if (!(input instanceof HTMLInputElement)) return;
    if (input.type !== 'color' || !input.classList.contains('color-chip')) return;
    if (input.disabled || input.classList.contains('is-disabled-handle')) return;

    if (this._anchor && this._anchor !== input) {
      this._commitAnchor();
    }

    this._anchor = input;
    const rect = input.getBoundingClientRect();
    this.picker.open(input, {
      clientX: Number.isFinite(point.clientX) ? point.clientX : rect.left + rect.width / 2,
      clientY: Number.isFinite(point.clientY) ? point.clientY : rect.top + rect.height / 2,
      placement: point.placement === 'viewport-hud' ? 'viewport-hud' : 'shelf',
      clickTarget: point.clickTarget instanceof Element ? point.clickTarget : null,
    });
  }

  /** @param {Event} event */
  _onAnchorClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== 'color') return;
    if (!target.classList.contains('color-chip')) return;
    if (target.disabled || target.classList.contains('is-disabled-handle')) return;

    event.preventDefault();
    event.stopPropagation();

    if (this._anchor && this._anchor !== target) {
      this._commitAnchor();
    }

    this._anchor = target;
    this.picker.open(target, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }

  /** @param {string} hex */
  _onPickerInput(hex) {
    const anchor = this._anchor;
    if (!anchor) return;

    if (!this._editing) {
      this._editing = true;
      this.stateStore.beginDeferredNotify();
      this.helpers.requestViewportRender?.();
    }

    anchor.value = hex;
    anchor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  _onPickerClose() {
    this._commitAnchor();
    this._anchor = null;
  }

  _commitAnchor() {
    const anchor = this._anchor;
    if (!anchor) return;
    anchor.dispatchEvent(new Event('change', { bubbles: true }));
    if (this._editing) {
      this._editing = false;
      this.stateStore.endDeferredNotify();
    }
  }

  async _onEyeDropper() {
    const anchor = this._anchor;
    if (!anchor) return;

    if (isNativeEyeDropperSupported()) {
      try {
        const hex = await openNativeEyeDropper();
        if (!hex) return;
        this.picker.setValue(hex);
        this._onPickerInput(hex);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.warn('[Orby] EyeDropper failed', error);
      }
      return;
    }

    const opened = openNativeColorInputPicker(anchor, {
      onInput: (hex) => {
        this.picker.setValue(hex);
        this._onPickerInput(hex);
      },
    });

    if (!opened) {
      this.helpers.showToast?.(
        'Screen color picker is not supported in this browser. Try Chrome or Edge.',
        4000,
        { notification: false },
      );
    }
  }

  /** @param {ParentNode} root */
  _observeDynamicChips(root) {
    if (typeof MutationObserver === 'undefined') return;
    const shelf = root.querySelector?.('#shelf') ?? root;
    if (!(shelf instanceof Node)) return;

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          node.querySelectorAll?.('input[type="color"].color-chip').forEach((input) => {
            if (input instanceof HTMLInputElement) {
              input.dataset.orbyColorPicker = '1';
            }
          });
          if (
            node instanceof HTMLInputElement &&
            node.type === 'color' &&
            node.classList.contains('color-chip')
          ) {
            node.dataset.orbyColorPicker = '1';
          }
        });
      }
    });

    observer.observe(shelf, { childList: true, subtree: true });
  }
}
