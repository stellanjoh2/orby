import { copyMobileDebugSettings, loadMobileDebugSample } from '../mobileDebugExport.js';
import { ORBY_DEV_BUILD } from '../../../../scripts/orbyDevBuild.js';
import { mobileHaptic } from '../mobileHaptics.js';
import { bindMobileSheetDrag } from '../mobileSheetDrag.js';
import { bindMobileRangeTouch } from '../mobileRangeTouch.js';
import { bindMobileSliderFocus } from '../mobileSliderFocus.js';
import { bindMobileSliderThumbDoubleTapReset } from '../mobileSliderThumbReset.js';
import { createMobileSliderChrome } from '../mobileSliderChrome.js';
import { bindMobileShelfLock } from '../mobileShelfLock.js';

/** @import { MobileTab } from '../mobileTypes.js' */
/** @import { MobileScene } from '../MobileScene.js' */
/** @import { MobileColorPicker } from './MobileColorPicker.js' */
/** @import { MobilePresetRails } from './MobilePresetRails.js' */
/** @import { MobileSheetController } from './MobileSheetController.js' */

const VIEWPORT_DOUBLE_TAP_MS = 320;
const VIEWPORT_DOUBLE_TAP_DIST_PX = 36;

/**
 * @typedef {{
 *   root: HTMLElement,
 *   viewportEl: HTMLElement | null,
 *   sheet: HTMLElement | null,
 *   dock: HTMLElement | null,
 *   scene: MobileScene,
 *   selection: { light: object, style: object, filters: object },
 *   sheetController: MobileSheetController,
 *   colorPicker: MobileColorPicker,
 *   presetRails: MobilePresetRails,
 *   showToast: (message: string) => void,
 * }} MobileChromeBindingsDeps
 */

export class MobileChromeBindings {
  /** @param {MobileChromeBindingsDeps} deps */
  constructor(deps) {
    this.deps = deps;
    const { root } = deps;
    this._exportBtn = root.querySelector('[data-action="export"]');
    this._objectMenuEl = root.querySelector('.orby-mobile-object-menu');
    this._objectBtn = root.querySelector('[data-action="toggle-object"]');
    this._objectPanelEl = root.querySelector('[data-object-panel]');
    /** @type {ReturnType<typeof bindMobileSheetDrag> | null} */
    this._sheetDrag = null;
    /** @type {ReturnType<typeof createMobileSliderChrome> | null} */
    this._sliderChrome = null;
    /** @type {ReturnType<typeof bindMobileSliderFocus> | null} */
    this._sliderFocus = null;
    /** @type {ReturnType<typeof bindMobileRangeTouch> | null} */
    this._rangeTouch = null;
    /** @type {{ time: number, x: number, y: number }} */
    this._lastViewportTap = { time: 0, x: 0, y: 0 };
  }

  getSliderFocus() {
    return this._sliderFocus;
  }

  getRangeTouch() {
    return this._rangeTouch;
  }

  getSheetDrag() {
    return this._sheetDrag;
  }

  bind() {
    this._bindSliderChrome();
    this._bindSheetShell();
    this._bindViewport();
    this._bindActions();
  }

  /** @param {boolean} hidden */
  setOrbitChromeHidden(hidden) {
    const { root } = this.deps;
    if (hidden) {
      root.dataset.orbitChrome = 'hidden';
    } else {
      delete root.dataset.orbitChrome;
    }
  }

  /** @param {boolean} open */
  setObjectMenuOpen(open) {
    const { root } = this.deps;
    const state = open ? 'open' : 'closed';
    if (this._objectMenuEl instanceof HTMLElement) {
      this._objectMenuEl.dataset.objectMenu = state;
    }
    root.dataset.objectMenu = state;
    if (this._objectBtn instanceof HTMLElement) {
      this._objectBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (this._objectPanelEl instanceof HTMLElement) {
      this._objectPanelEl.hidden = !open;
    }
  }

  /** @param {boolean} open */
  setDebugMenuOpen(open) {
    const { root } = this.deps;
    const menu = root.querySelector('.orby-mobile-debug-menu');
    const toggle = root.querySelector('[data-action="toggle-debug"]');
    const items = menu?.querySelector('.orby-mobile-debug-menu__items');
    if (menu instanceof HTMLElement) {
      menu.dataset.debugMenu = open ? 'open' : 'closed';
    }
    if (toggle instanceof HTMLElement) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (items instanceof HTMLElement) {
      items.hidden = !open;
    }
  }

  _bindSliderChrome() {
    const { root } = this.deps;
    this._sliderChrome = createMobileSliderChrome(root);
    this._sliderFocus = bindMobileSliderFocus({ root, chrome: this._sliderChrome });
    this._rangeTouch = bindMobileRangeTouch({ root, chrome: this._sliderChrome });
    bindMobileSliderThumbDoubleTapReset({
      root,
      getCtx: () => ({ selection: this.deps.selection }),
      isDragActive: () => this._rangeTouch?.isActive() ?? false,
    });

    const shelf = root.querySelector('.orby-mobile-sheet__shelf');
    const sheetScroll = root.querySelector('.orby-mobile-sheet__scroll');
    if (shelf instanceof HTMLElement && sheetScroll instanceof HTMLElement) {
      bindMobileShelfLock({ root, shelf, scroll: sheetScroll });
    }
  }

  _bindSheetShell() {
    const { root, sheet, dock, sheetController } = this.deps;

    if (sheet) {
      this._sheetDrag = bindMobileSheetDrag({
        root,
        sheet,
        onDismiss: (dragOffsetPx = 0) => sheetController.closeSheet(dragOffsetPx),
      });
    }

    if (dock instanceof HTMLElement) {
      new ResizeObserver(() => sheetController.syncDockIndicator(false)).observe(dock);
    }

    root.querySelectorAll('[data-open-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = /** @type {MobileTab} */ (btn.getAttribute('data-open-tab'));
        sheetController.openSheet(tab);
      });
    });

    root.querySelector('[data-sheet-dismiss]')?.addEventListener('click', () => {
      sheetController.setSheetState('closed');
    });

    root.querySelector('[data-action="toggle-object"]')?.addEventListener('click', () => {
      const open = this._objectMenuEl?.dataset.objectMenu !== 'open';
      if (open) {
        sheetController.setSheetState('closed');
        this.setDebugMenuOpen(false);
      }
      this.setObjectMenuOpen(open);
      mobileHaptic('light');
    });

    document.addEventListener('pointerdown', (e) => {
      if (root.dataset.sliderFocus != null) return;
      if (this._objectMenuEl?.dataset.objectMenu !== 'open') return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (
        t.closest('.orby-mobile-object-menu')
        || t.closest('[data-object-panel]')
      ) return;
      this.setObjectMenuOpen(false);
    });

    document.addEventListener('pointerdown', (e) => {
      if (root.dataset.sliderFocus != null) return;
      if (sheetController.sheetState === 'closed') return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (
        t.closest('.orby-mobile-sheet')
        || t.closest('.orby-mobile-dock')
        || t.closest('.orby-mobile-top-actions')
        || t.closest('.orby-mobile-debug-menu')
        || t.closest('.orby-mobile-viewport__empty')
      ) return;
      sheetController.setSheetState('closed');
    });
  }

  _bindViewport() {
    const { viewportEl, scene } = this.deps;
    if (!viewportEl) return;

    const isChromeTarget = (el) => {
      if (!(el instanceof Element)) return false;
      return !!el.closest(
        '.orby-mobile-top-actions, .orby-mobile-debug-menu, .orby-mobile-viewport__empty, .orby-mobile-browse-cta',
      );
    };

    viewportEl.addEventListener('pointerup', (e) => {
      if (isChromeTarget(e.target)) return;
      if (!scene) return;

      const now = performance.now();
      const dt = now - this._lastViewportTap.time;
      const dist = Math.hypot(
        e.clientX - this._lastViewportTap.x,
        e.clientY - this._lastViewportTap.y,
      );
      if (dt < VIEWPORT_DOUBLE_TAP_MS && dist < VIEWPORT_DOUBLE_TAP_DIST_PX) {
        scene.resetCamera();
        mobileHaptic('medium');
        this._lastViewportTap = { time: 0, x: 0, y: 0 };
        return;
      }
      this._lastViewportTap = { time: now, x: e.clientX, y: e.clientY };
    });
  }

  _bindActions() {
    const { root, scene, selection, colorPicker, presetRails, showToast } = this.deps;

    presetRails.bindPresetClicks();

    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.closest('.effect-toggle')) {
        mobileHaptic('light');
      }
    });

    if (ORBY_DEV_BUILD) {
      root.querySelector('[data-action="toggle-debug"]')?.addEventListener('click', () => {
        const menu = root.querySelector('.orby-mobile-debug-menu');
        if (!(menu instanceof HTMLElement)) return;
        this.setDebugMenuOpen(menu.dataset.debugMenu !== 'open');
      });

      root.querySelector('[data-action="copy-settings"]')?.addEventListener('click', () => {
        void copyMobileDebugSettings(scene, selection).then((result) => {
          if (result === 'copied') {
            showToast('Settings copied');
          } else {
            showToast('Copy failed');
          }
        });
      });

      root.querySelector('[data-action="load-sample"]')?.addEventListener('click', () => {
        void loadMobileDebugSample(scene).then((result) => {
          if (result === 'loaded') {
            showToast('Loaded sample');
          } else {
            showToast('Sample load failed');
          }
        });
      });
    }

    const exportFailedMessage = ORBY_DEV_BUILD ? 'Export failed — copy debug log' : 'Export failed';

    root.querySelector('[data-action="export"]')?.addEventListener('click', () => {
      this._sliderFocus?.release();
      this._rangeTouch?.release();
      colorPicker.close();
      if (this._exportBtn instanceof HTMLElement) {
        this._exportBtn.dataset.busy = 'true';
        this._exportBtn.setAttribute('aria-busy', 'true');
      }
      void scene.exportImage().then(
        (result) => {
          if (result === 'shared') {
            mobileHaptic('success');
            showToast('Saved to Photos');
          } else if (result === 'downloaded') {
            mobileHaptic('success');
            showToast('Image saved');
          } else if (result === 'no-model') {
            showToast('Load a model first');
          } else if (result === 'busy') {
            /* same export already running — spinner stays on the first tap */
          } else {
            showToast(exportFailedMessage);
          }
        },
        (err) => {
          if (err?.name === 'AbortError') return;
          console.error('[Orby Mobile] Export rejected', err);
          showToast(exportFailedMessage);
        },
      ).finally(() => {
        if (this._exportBtn instanceof HTMLElement) {
          delete this._exportBtn.dataset.busy;
          this._exportBtn.removeAttribute('aria-busy');
        }
      });
    });
  }
}
