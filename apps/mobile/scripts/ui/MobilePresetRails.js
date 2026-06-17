import {
  MOBILE_HDRI,
  MOBILE_FX,
  MOBILE_STYLE_RAIL,
  mobileAssetUrl,
  isMobileClearPreset,
} from '../mobileCatalog.js';
import { mobileHaptic } from '../mobileHaptics.js';

/** @import { PresetTab } from '../mobileTypes.js' */
/** @import { MobileUiContext } from '../mobileUiContext.js' */
/** @import { MobileStylePanel } from './MobileStylePanel.js' */
/** @import { MobileSheetController } from './MobileSheetController.js' */

/**
 * @typedef {{
 *   onApplyPreset: (tab: PresetTab, item: { id: string }, changed: boolean) => void,
 *   stylePanel: MobileStylePanel,
 *   sheetController: MobileSheetController,
 * }} MobilePresetRailsDeps
 */

export class MobilePresetRails {
  /**
   * @param {MobileUiContext} ctx
   * @param {MobilePresetRailsDeps} deps
   */
  constructor(ctx, deps) {
    this.ctx = ctx;
    this.deps = deps;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._enterTimer = null;
  }

  render() {
    const { root } = this.ctx;
    for (const tab of /** @type {const} */ (['light', 'style', 'filters'])) {
      const track = root.querySelector(`[data-rail-track="${tab}"]`);
      if (!track) continue;
      const catalog = this._catalogForTab(tab);
      track.replaceChildren(...catalog.map((item) => this._mkPresetButton(tab, item)));
    }
  }

  bindPresetClicks() {
    this.ctx.root.addEventListener('click', (e) => {
      const pick = e.target.closest('.orby-mobile-preset');
      if (!pick) return;
      const rail = pick.closest('[data-rail]');
      const tab = rail?.getAttribute('data-rail');
      if (tab === 'light' || tab === 'style' || tab === 'filters') {
        this.select(/** @type {PresetTab} */ (tab), pick);
        const attr = this._dataAttrForTab(/** @type {PresetTab} */ (tab));
        const pickId = pick.getAttribute(attr);
        const isClearPick =
          (tab === 'style' && (pickId === 'none' || pickId === 'standard')) ||
          (tab === 'filters' && pickId === 'none');
        if (!isClearPick) {
          this.scrollPresetIntoView(/** @type {PresetTab} */ (tab), pick, 'smooth');
        }
      }
    });
  }

  /** @param {PresetTab} tab @param {HTMLElement} pick */
  select(tab, pick) {
    const { selection, engagedPresetTabs } = this.ctx;
    const catalog = this._catalogForTab(tab);
    const attr = this._dataAttrForTab(tab);
    const id = pick.getAttribute(attr);
    const item = catalog.find((x) => x.id === id);
    if (!item) return;
    const changed = selection[tab].id !== id;

    if (tab === 'light') {
      engagedPresetTabs.add('light');
    }
    if (tab === 'style') {
      if (item.id === 'none' || item.id === 'standard') {
        engagedPresetTabs.delete('style');
        this.resetRailScroll('style');
      } else {
        engagedPresetTabs.add('style');
      }
    }
    if (tab === 'filters') {
      if (item.id === 'none') {
        engagedPresetTabs.delete('filters');
        this.resetRailScroll('filters');
      } else {
        engagedPresetTabs.add('filters');
      }
    }

    selection[tab] = item;
    this.deps.onApplyPreset(tab, item, changed);
    this.syncSelectionUi();
    this.deps.sheetController.syncPresetSheetState();
    if (changed) {
      mobileHaptic('selection');
    }
  }

  syncSelectionUi() {
    const { root, selection } = this.ctx;
    for (const tab of /** @type {const} */ (['light', 'style', 'filters'])) {
      const attr = this._dataAttrForTab(tab);
      const id = selection[tab].id;
      const showSelected = this._shouldShowRailSelection(tab);
      root.querySelectorAll(`[${attr}]`).forEach((el) => {
        const on = showSelected && el.getAttribute(attr) === id;
        el.classList.toggle('is-selected', on);
        el.setAttribute('aria-current', on ? 'true' : 'false');
      });

      const dockBtn = root.querySelector(`[data-open-tab="${tab}"]`);
      const thumb = dockBtn?.querySelector('[data-dock-thumb] img');
      if (thumb instanceof HTMLImageElement && showSelected) {
        thumb.src = mobileAssetUrl(selection[tab].thumb);
      }
    }
    this.deps.stylePanel.sync();
  }

  /** @param {PresetTab} tab */
  playEnter(tab) {
    const rail = this.ctx.root.querySelector(`[data-rail="${tab}"]`);
    if (!(rail instanceof HTMLElement)) return;
    clearTimeout(this._enterTimer ?? undefined);
    rail.classList.remove('is-entering');
    requestAnimationFrame(() => {
      rail.classList.add('is-entering');
      this._enterTimer = setTimeout(() => {
        rail.classList.remove('is-entering');
        this._enterTimer = null;
      }, 380);
    });
  }

  /** @param {PresetTab} tab */
  syncRailScroll(tab) {
    if (this._shouldShowRailSelection(tab)) {
      this._scrollRailToSelection(tab);
      return;
    }
    this.resetRailScroll(tab);
  }

  /** @param {PresetTab} tab */
  resetRailScroll(tab) {
    const track = this.ctx.root.querySelector(`[data-rail-track="${tab}"]`);
    if (track instanceof HTMLElement) track.scrollLeft = 0;
  }

  /** Collapse secondary controls; reopening a tab starts at preset rails only. */
  disengageAll() {
    this.ctx.engagedPresetTabs.clear();
    this.syncSelectionUi();
    for (const tab of /** @type {const} */ (['light', 'style', 'filters'])) {
      this.resetRailScroll(tab);
    }
  }

  /** @param {PresetTab} tab @param {HTMLElement} el @param {ScrollBehavior} [behavior] */
  scrollPresetIntoView(tab, el, behavior = 'auto') {
    if (!(el instanceof HTMLElement)) return;
    this._snapRailPresetToCenter(el, behavior);
  }

  /** @param {PresetTab} tab */
  _catalogForTab(tab) {
    if (tab === 'light') return MOBILE_HDRI;
    if (tab === 'style') return MOBILE_STYLE_RAIL;
    if (tab === 'filters') return MOBILE_FX;
    return [];
  }

  /** @param {PresetTab} tab */
  _dataAttrForTab(tab) {
    if (tab === 'light') return 'data-hdri';
    if (tab === 'style') return 'data-creative-look';
    return 'data-filter';
  }

  /** Whether the rail should highlight the current scene selection (green ring + dock thumb). */
  _shouldShowRailSelection(tab) {
    const { selection } = this.ctx;
    const id = selection[tab].id;
    if (tab === 'style' && (id === 'none' || id === 'standard')) return false;
    if (tab === 'filters' && id === 'none') return false;
    return true;
  }

  /** @param {PresetTab} tab @param {{ id: string, label: string, thumb: string }} item */
  _mkPresetButton(tab, item) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'orby-mobile-preset';
    btn.setAttribute(this._dataAttrForTab(tab), item.id);

    if (isMobileClearPreset(item.id)) {
      const clearLabel =
        tab === 'style' ? 'Clear shader' : tab === 'filters' ? 'Clear filter' : item.label;
      btn.classList.add('orby-mobile-preset--clear');
      btn.setAttribute('aria-label', clearLabel);
      btn.innerHTML = `
        <span class="orby-mobile-preset__thumb">
          <span class="orby-mobile-preset__clear-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </span>
        </span>
        <span class="orby-mobile-preset__name">${item.label}</span>
      `;
      return btn;
    }

    btn.setAttribute('aria-label', item.label);
    btn.innerHTML = `
      <span class="orby-mobile-preset__thumb">
        <img src="${mobileAssetUrl(item.thumb)}" alt="" width="100" height="100" decoding="async" />
      </span>
      <span class="orby-mobile-preset__name">${item.label}</span>
    `;
    return btn;
  }

  /**
   * @param {HTMLElement} el
   * @param {ScrollBehavior} [behavior]
   */
  _snapRailPresetToCenter(el, behavior = 'smooth') {
    const track = el.parentElement;
    if (!(track instanceof HTMLElement)) return;

    const trackRect = track.getBoundingClientRect();
    const anchorX = trackRect.left + trackRect.width / 2;
    const elRect = el.getBoundingClientRect();
    const elCenter = elRect.left + elRect.width / 2;
    if (Math.abs(elCenter - anchorX) < 3) return;

    el.scrollIntoView({ behavior, inline: 'center', block: 'nearest' });
  }

  /** @param {PresetTab} tab */
  _scrollRailToSelection(tab) {
    const { root, selection } = this.ctx;
    const id = selection[tab].id;
    const attr = this._dataAttrForTab(tab);
    const el = root.querySelector(`[data-rail-track="${tab}"] [${attr}="${CSS.escape(id)}"]`);
    if (el instanceof HTMLElement) {
      this.scrollPresetIntoView(tab, el, 'auto');
    }
  }
}
