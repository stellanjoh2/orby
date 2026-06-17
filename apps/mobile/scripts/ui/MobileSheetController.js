import { mobileHaptic } from '../mobileHaptics.js';

/** @import { SheetState, MobileTab, PresetTab } from '../mobileTypes.js' */
/** @import { MobileUiContext } from '../mobileUiContext.js' */
/** @import { MobilePresetRails } from './MobilePresetRails.js' */

/**
 * @typedef {{
 *   root: HTMLElement,
 *   sheet: HTMLElement | null,
 *   dock: HTMLElement | null,
 *   dockIndicatorEl: HTMLElement | null,
 *   getSliderFocus: () => { release?: () => void } | null,
 *   getRangeTouch: () => { release?: () => void } | null,
 *   getSheetDrag: () => { reset?: () => void } | null,
 *   closeObjectMenu: () => void,
 *   onTabOpened: (tab: MobileTab) => void,
 * }} MobileSheetControllerDeps
 */

export class MobileSheetController {
  /**
   * @param {MobileUiContext} ctx
   * @param {MobileSheetControllerDeps} deps
   */
  constructor(ctx, deps) {
    this.ctx = ctx;
    this.deps = deps;
    /** @type {MobilePresetRails | null} */
    this.presetRails = null;

    /** @type {SheetState} */
    this.sheetState = 'closed';
    /** @type {MobileTab} */
    this.activeTab = 'light';
    /** @type {MobileTab | null} */
    this._dockIndicatorTab = null;
  }

  /** @param {MobilePresetRails} presetRails */
  attachPresetRails(presetRails) {
    this.presetRails = presetRails;
  }

  /** @param {MobileTab} tab */
  openSheet(tab) {
    this.deps.closeObjectMenu();

    const sameTabOpen =
      this.sheetState !== 'closed' && this.activeTab === tab;

    if (sameTabOpen) {
      this.setSheetState('closed');
      return;
    }

    this.setActiveTab(tab);
    this.resetSheetScroll(tab);
    this.deps.onTabOpened(tab);

    if (tab === 'fx') {
      this.setSheetState('expanded');
    } else if (this.sheetState === 'closed') {
      this.setSheetState(
        this.presetTabShowsExpandedSheet(tab) ? 'expanded' : 'peek',
      );
    } else {
      this.syncPresetSheetState();
    }

    if (tab === 'light' || tab === 'style' || tab === 'filters') {
      this.presetRails?.playEnter(/** @type {PresetTab} */ (tab));
      requestAnimationFrame(() => {
        this.presetRails?.syncRailScroll(/** @type {PresetTab} */ (tab));
      });
    }
  }

  /** @param {SheetState} state */
  setSheetState(state) {
    const { root } = this.ctx;
    const stateChanged = this.sheetState !== state;
    if (stateChanged) {
      this.deps.getSliderFocus()?.release?.();
      this.deps.getRangeTouch()?.release?.();
    }
    const wasOpen = this.sheetState !== 'closed';
    this.sheetState = state;
    root.dataset.sheet = state;
    this.deps.getSheetDrag()?.reset?.();
    this.syncDockTabState();
    const scrim = root.querySelector('.orby-mobile-scrim');
    if (scrim instanceof HTMLElement) {
      scrim.hidden = state === 'closed';
    }
    if (!wasOpen && state !== 'closed') {
      mobileHaptic('light');
    } else if (wasOpen && state === 'closed') {
      mobileHaptic('soft');
    }
  }

  /** @param {MobileTab} tab */
  setActiveTab(tab) {
    const { root } = this.ctx;
    this.activeTab = tab;
    root.dataset.activeTab = tab;
    root.querySelectorAll('[data-panel]').forEach((panel) => {
      panel.hidden = panel.getAttribute('data-panel') !== tab;
    });
    this.syncDockTabState();
  }

  syncPresetSheetState() {
    if (this.sheetState === 'closed') return;
    const tab = this.activeTab;
    const next = /** @type {SheetState} */ (
      this.presetTabShowsExpandedSheet(tab) ? 'expanded' : 'peek'
    );
    if (this.sheetState === next) return;
    this.setSheetState(next);
  }

  /** @param {MobileTab} tab */
  presetTabShowsExpandedSheet(tab) {
    const { selection, engagedPresetTabs } = this.ctx;
    if (tab === 'fx') return true;
    if (tab === 'light') return engagedPresetTabs.has('light');
    if (tab === 'style') {
      return (
        engagedPresetTabs.has('style') &&
        selection.style.id !== 'none' &&
        selection.style.id !== 'standard'
      );
    }
    return false;
  }

  /** @param {MobileTab} tab */
  resetSheetScroll(tab) {
    const scroll = this.ctx.root.querySelector('.orby-mobile-sheet__scroll');
    if (scroll instanceof HTMLElement) scroll.scrollTop = 0;
  }

  syncDockTabState() {
    const { root } = this.ctx;
    const prevIndicatorTab = this._dockIndicatorTab;
    root.querySelectorAll('[data-open-tab]').forEach((btn) => {
      const dockTab = btn.getAttribute('data-open-tab');
      const expanded = this.sheetState !== 'closed' && dockTab === this.activeTab;
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      btn.classList.toggle('is-active', expanded);
    });
    const animateTravel =
      this.sheetState !== 'closed' &&
      prevIndicatorTab != null &&
      prevIndicatorTab !== this.activeTab;
    this.syncDockIndicator(animateTravel);
  }

  /** @param {MobileTab} tab @returns {HTMLElement | null} */
  _dockIndicatorAnchor(tab) {
    const dock = this.deps.dock;
    const btn = dock?.querySelector(`[data-open-tab="${tab}"]`);
    if (!(btn instanceof HTMLElement)) return null;
    const anchor = btn.querySelector('.orby-mobile-dock__thumb, .orby-mobile-dock__icon');
    return anchor instanceof HTMLElement ? anchor : null;
  }

  /**
   * @param {HTMLElement} dock
   * @param {HTMLElement} anchor
   */
  _dockIndicatorPosition(dock, anchor) {
    const dockRect = dock.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const dockStyle = getComputedStyle(dock);
    const originX = dockRect.left + parseFloat(dockStyle.borderLeftWidth || '0');
    const originY = dockRect.top + parseFloat(dockStyle.borderTopWidth || '0');
    const ring = 2;
    const anchorSize = Math.min(anchorRect.width, anchorRect.height);
    const size = anchorSize + ring * 2;
    const cx = anchorRect.left + anchorRect.width / 2 - originX;
    const cy = anchorRect.top + anchorRect.height / 2 - originY;
    return { cx, cy, size };
  }

  /** @param {boolean} [animate] */
  syncDockIndicator(animate = false) {
    const indicator = this.deps.dockIndicatorEl;
    const dock = this.deps.dock;
    if (!(indicator instanceof HTMLElement) || !(dock instanceof HTMLElement)) return;

    const dockTab = this.activeTab;
    const show = this.sheetState !== 'closed';

    if (!show) {
      indicator.hidden = true;
      indicator.classList.remove('is-visible', 'is-traveling', 'is-entering');
      this._dockIndicatorTab = null;
      return;
    }

    const anchor = this._dockIndicatorAnchor(dockTab);
    if (!anchor) return;

    const { cx, cy, size } = this._dockIndicatorPosition(dock, anchor);

    /** @param {number} scale */
    const applyPosition = (scale) => {
      indicator.style.width = `${size}px`;
      indicator.style.height = `${size}px`;
      indicator.style.left = `${cx}px`;
      indicator.style.top = `${cy}px`;
      indicator.style.transform = `translate(-50%, -50%) scale(${scale})`;
    };

    if (
      !animate &&
      this._dockIndicatorTab === dockTab &&
      indicator.classList.contains('is-visible') &&
      !indicator.hidden
    ) {
      applyPosition(1);
      return;
    }

    indicator.hidden = false;

    const shouldTravel =
      animate && this._dockIndicatorTab != null && this._dockIndicatorTab !== dockTab;
    const shouldEnter = !shouldTravel && this._dockIndicatorTab == null;

    indicator.classList.remove('is-traveling', 'is-entering');
    if (shouldTravel) {
      indicator.classList.add('is-traveling', 'is-visible');
      requestAnimationFrame(() => {
        applyPosition(1);
      });
    } else if (shouldEnter) {
      applyPosition(0.82);
      indicator.classList.add('is-entering', 'is-visible');
      requestAnimationFrame(() => {
        applyPosition(1);
      });
    } else {
      applyPosition(1);
      indicator.classList.add('is-visible');
    }

    this._dockIndicatorTab = dockTab;
  }
}
