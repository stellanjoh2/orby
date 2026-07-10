import {
  findMobileHdri,
  MOBILE_FX,
  findCreativeLook,
} from './mobileCatalog.js';
import { MobileScene } from './MobileScene.js';
import { MobileObjectPanel } from './ui/MobileObjectPanel.js';
import { MobileStylePanel } from './ui/MobileStylePanel.js';
import { MobileFxPanel } from './ui/MobileFxPanel.js';
import { MobileColorPicker } from './ui/MobileColorPicker.js';
import { MobileModelLoader } from './ui/MobileModelLoader.js';
import { MobileHdriControls } from './ui/MobileHdriControls.js';
import { MobilePresetRails } from './ui/MobilePresetRails.js';
import { MobileSheetController } from './ui/MobileSheetController.js';
import { MobileChromeBindings } from './ui/MobileChromeBindings.js';
import { markMobileAppSessionActive } from '../../../scripts/orbyMobileHandoff.js';
import { buildMobileDebugSceneExtra, markMobileDebugLog } from './mobileDebugLog.js';
import { ORBY_DEV_BUILD } from '../../../scripts/orbyDevBuild.js';

/** @import { MobileUiContext } from './mobileUiContext.js' */

export class MobileShell {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.viewportEl = root.querySelector('.orby-mobile-viewport');
    this.sheet = root.querySelector('.orby-mobile-sheet');
    this.dock = root.querySelector('.orby-mobile-dock');
    this.toast = root.querySelector('.orby-mobile-toast');
    /** @type {HTMLElement | null} */
    this._dockIndicatorEl = root.querySelector('.orby-mobile-dock__indicator');

    this.selection = {
      light: findMobileHdri('beach'),
      style: findCreativeLook('none'),
      filters: MOBILE_FX[0],
    };

    this._toastTimer = null;
    /** @type {Set<import('./mobileTypes.js').PresetTab>} */
    this._engagedPresetTabs = new Set();

    try {
      this.scene = new MobileScene(root.querySelector('.orby-mobile-viewport__canvas'));
    } catch (err) {
      console.error('[Orby Mobile] Scene construction failed', err);
      markMobileDebugLog('shell:scene-construct-failed', { message: String(err?.message || err) });
      this.showToast('3D viewer unavailable');
      return;
    }
    if (ORBY_DEV_BUILD && window.__orbyMobileDebugLog) {
      window.__orbyMobileDebugLog.getExtra = () => buildMobileDebugSceneExtra(this.scene);
    }
    markMobileDebugLog('shell:scene-constructed');

    /** @type {MobileUiContext} */
    const panelCtx = {
      root: this.root,
      scene: this.scene,
      selection: this.selection,
      engagedPresetTabs: this._engagedPresetTabs,
      showToast: (message) => this.showToast(message),
      syncSelectionUi: () => {},
      syncPresetSheetState: () => {},
    };

    /** @type {MobileChromeBindings | null} */
    let chrome = null;

    this.sheetController = new MobileSheetController(panelCtx, {
      root: this.root,
      sheet: this.sheet,
      dock: this.dock,
      dockIndicatorEl: this._dockIndicatorEl,
      getSliderFocus: () => chrome?.getSliderFocus() ?? null,
      getRangeTouch: () => chrome?.getRangeTouch() ?? null,
      getSheetDrag: () => chrome?.getSheetDrag() ?? null,
      closeObjectMenu: () => chrome?.setObjectMenuOpen(false),
      onTabOpened: (tab) => {
        if (tab === 'light') {
          this.hdriControls.syncForLightTab();
          this.presetRails.syncSelectionUi();
        } else if (tab === 'style') {
          this.stylePanel.sync();
          this.presetRails.syncSelectionUi();
        } else if (tab === 'filters') {
          this.presetRails.syncSelectionUi();
        }
      },
      onSheetClosed: () => {
        this.presetRails.disengageAll();
        this.hdriControls.syncPanel();
      },
    });
    panelCtx.syncPresetSheetState = () => this.sheetController.syncPresetSheetState();

    this.colorPicker = new MobileColorPicker(panelCtx, {
      onBeforeOpen: () => chrome?.setObjectMenuOpen(false),
    });
    this.objectPanel = new MobileObjectPanel(panelCtx, { colorPicker: this.colorPicker });
    this.stylePanel = new MobileStylePanel(panelCtx);
    this.fxPanel = new MobileFxPanel(panelCtx);
    this.hdriControls = new MobileHdriControls(panelCtx, { colorPicker: this.colorPicker });
    this.modelLoader = new MobileModelLoader({
      root: this.root,
      scene: this.scene,
      viewportEl: this.viewportEl,
      showToast: (message) => this.showToast(message),
    });

    this.presetRails = new MobilePresetRails(panelCtx, {
      stylePanel: this.stylePanel,
      sheetController: this.sheetController,
      onApplyPreset: (tab, item, changed) => {
        if (tab === 'light') {
          if (item.id === 'none') {
            this.scene.setHdriBackground(false);
          } else {
            void this.scene.setHdri(item.id);
            this.scene.setHdriBackground(true);
          }
          this.hdriControls.syncPanel();
          this.hdriControls.syncBackground();
          this.hdriControls.syncControls();
        }
        if (tab === 'style') {
          const lookId = item.id === 'standard' ? 'none' : item.id;
          if (changed) {
            this.scene.setCreativeLook(lookId);
          }
          this.stylePanel.sync();
        }
        if (tab === 'filters') {
          this.scene.applyLookFilter(item.id);
          this.fxPanel.sync();
        }
      },
    });
    panelCtx.syncSelectionUi = () => this.presetRails.syncSelectionUi();
    this.sheetController.attachPresetRails(this.presetRails);

    chrome = new MobileChromeBindings({
      root: this.root,
      viewportEl: this.viewportEl,
      sheet: this.sheet,
      dock: this.dock,
      scene: this.scene,
      selection: this.selection,
      sheetController: this.sheetController,
      colorPicker: this.colorPicker,
      presetRails: this.presetRails,
      showToast: (message) => this.showToast(message),
    });
    this.chrome = chrome;
    chrome.bind();
    markMobileDebugLog('shell:chrome-bound');

    this.scene.onModelLoaded = () => {
      markMobileAppSessionActive();
      if (this.viewportEl) this.viewportEl.dataset.hasModel = 'true';
      this.modelLoader.showEmptyState(false);
      this.modelLoader.refreshLoadChrome();
      this.scene.setCreativeLook(this.selection.style.id);
      this.objectPanel.sync();
      this.fxPanel.sync();
    };
    this.scene.onError = (message) => this.showToast(message);
    this.scene.onFxStateChanged = () => this.fxPanel.sync();
    this.scene.onCreativeLookStateChanged = () => this.stylePanel.sync();
    this.scene.onBaseStateChanged = () => this.objectPanel.sync();
    this.scene.onOrbitChromeChange = (hidden) => this.chrome.setOrbitChromeHidden(hidden);
    this.scene.onCreativeLookLoading = (loading) => {
      if (loading) this.modelLoader.beginSpinner();
      else this.modelLoader.endSpinner();
    };
    void this.modelLoader.boot();

    this.colorPicker.bind();
    this.hdriControls.bind();

    this.presetRails.render();
    this.objectPanel.render();
    this.fxPanel.render();
    this.stylePanel.render();
    this.chrome.setDebugMenuOpen(false);
    this.chrome.setObjectMenuOpen(false);
    this.modelLoader.bindFileInput();
    this.presetRails.syncSelectionUi();
    this.hdriControls.syncControls();
    this.hdriControls.syncPanel();
    this.hdriControls.syncBackground();
  }

  /** @param {string} message */
  showToast(message) {
    if (!this.toast) return;
    this.toast.textContent = message;
    this.toast.hidden = false;
    this.toast.classList.add('is-visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toast?.classList.remove('is-visible');
      setTimeout(() => {
        if (this.toast) this.toast.hidden = true;
      }, 220);
    }, 1600);
  }
}
