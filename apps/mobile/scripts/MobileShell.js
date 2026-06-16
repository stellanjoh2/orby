import {
  MOBILE_HDRI,
  MOBILE_FX,
  MOBILE_STYLE_RAIL,
  mobileAssetUrl,
  findCreativeLook,
} from './mobileCatalog.js';
import {
  MOBILE_FX_SLIDER_SECTIONS,
  MOBILE_FX_LENS_ROWS,
  MOBILE_FX_BLOOM_SLIDERS,
  MOBILE_CAMERA_FOV,
  getNestedValue,
  getMobileLensSliderUiValue,
  getMobileBloomIntensityUiValue,
  applyMobileLensSliderValue,
  applyMobileBloomSliderValue,
} from './mobileFxControls.js';
import {
  MOBILE_STYLE_SLIDERS,
  isMobileStyleSliderDisabled,
  isMobileStyleSliderHidden,
  mobileStyleSliderBounds,
  resolveMobileStyleSliderValue,
} from './mobileStyleControls.js';
import { MobileScene, MOBILE_HDRI_STRENGTH_DEFAULT, MOBILE_HDRI_STRENGTH_MAX } from './MobileScene.js';
import { takeMobileModelHandoff, markMobileAppSessionActive, waitForMobileModelHandoff, hasMobileHandoffPendingFlag } from '../../../scripts/orbyMobileHandoff.js';
import { readOrbyMobileHandoffWaitMs, validateOrbyMobileModelFile } from '../../../scripts/orbyMobileModelLimits.js';
import { copyMobileDebugSettings, loadMobileDebugSample } from './mobileDebugExport.js';
import { buildMobileDebugSceneExtra, markMobileDebugLog } from './mobileDebugLog.js';
import { normalizeBackgroundGradient } from '../../../scripts/render/backgroundGradient/backgroundGradientDefaults.js';
import { mobileHaptic } from './mobileHaptics.js';
import { bindMobileSheetDrag } from './mobileSheetDrag.js';
import { bindMobileRangeTouch } from './mobileRangeTouch.js';
import { bindMobileSliderFocus } from './mobileSliderFocus.js';
import { MobileHsvColorPicker } from './MobileHsvColorPicker.js';
import { ORBY_BLACK } from '../../../scripts/constants.js';

function urlHasHandoffFlag() {
  try {
    return new URLSearchParams(window.location.search).get('handoff') === '1';
  } catch {
    return false;
  }
}

const VIEWPORT_DOUBLE_TAP_MS = 320;
const VIEWPORT_DOUBLE_TAP_DIST_PX = 36;
const VIEWPORT_COMPARE_HOLD_MS = 380;
const VIEWPORT_COMPARE_MOVE_PX = 14;

/** @typedef {'closed' | 'peek' | 'expanded'} SheetState */
/** @typedef {'light' | 'style' | 'filters' | 'fx'} MobileTab */
/** @typedef {'light' | 'style' | 'filters'} PresetTab */

export class MobileShell {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.viewportEl = root.querySelector('.orby-mobile-viewport');
    this.sheet = root.querySelector('.orby-mobile-sheet');
    this.dock = root.querySelector('.orby-mobile-dock');
    this.toast = root.querySelector('.orby-mobile-toast');
    this.fileInput =
      document.getElementById('orbyMobileFileInput') ??
      root.querySelector('#orbyMobileFileInput');

    /** @type {SheetState} */
    this.sheetState = 'closed';
    /** @type {MobileTab} */
    this.activeTab = 'light';

    this.selection = {
      light: MOBILE_HDRI.find((h) => h.id === 'beach') ?? MOBILE_HDRI[0],
      style: findCreativeLook('none'),
      filters: MOBILE_FX[0],
    };

    this._toastTimer = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._railScrollTimer = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._railScrollEndTimer = null;
    /** @type {PresetTab | null} */
    this._railScrollingTab = null;
    this._suppressRailLeadingSelection = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._railSuppressTimer = null;
    /** @type {Set<PresetTab>} */
    this._engagedPresetTabs = new Set();
    /** @type {HTMLElement | null} */
    this._hdriControlsEl = null;
    /** @type {ReturnType<typeof bindMobileSheetDrag> | null} */
    this._sheetDrag = null;
    /** @type {ReturnType<typeof bindMobileSliderFocus> | null} */
    this._sliderFocus = null;
    /** @type {ReturnType<typeof bindMobileRangeTouch> | null} */
    this._rangeTouch = null;
    /** @type {{ time: number, x: number, y: number }} */
    this._lastViewportTap = { time: 0, x: 0, y: 0 };
    /** @type {{ id: number, x: number, y: number } | null} */
    this._comparePointer = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._compareHoldTimer = null;
    this._compareActive = false;
    this._exportBtn = root.querySelector('[data-action="export"]');

    this._bindChrome();

    markMobileDebugLog('shell:chrome-bound');

    try {
      this.scene = new MobileScene(root.querySelector('.orby-mobile-viewport__canvas'));
    } catch (err) {
      console.error('[Orby Mobile] Scene construction failed', err);
      markMobileDebugLog('shell:scene-construct-failed', { message: String(err?.message || err) });
      this.showToast('3D viewer unavailable');
      return;
    }
    if (window.__orbyMobileDebugLog) {
      window.__orbyMobileDebugLog.getExtra = () => buildMobileDebugSceneExtra(this.scene);
    }
    markMobileDebugLog('shell:scene-constructed');
    this.scene.onModelLoaded = () => {
      markMobileAppSessionActive();
      if (this.viewportEl) this.viewportEl.dataset.hasModel = 'true';
      this._showEmptyState(false);
      this.scene.setCreativeLook(this.selection.style.id);
    };
    this.scene.onError = (message) => this.showToast(message);
    this.scene.onFxStateChanged = () => this._syncFxControlsUi();
    this.scene.onCreativeLookStateChanged = () => this._syncStyleControlsUi();
    this.scene.onOrbitChromeChange = (hidden) => this._setOrbitChromeHidden(hidden);
    void this._bootScene();

    this._hdriBrightnessInput = root.querySelector('[data-hdri-brightness-input]');
    this._hdriBrightnessValue = root.querySelector('[data-hdri-brightness-value]');
    this._hdriBlurInput = root.querySelector('[data-hdri-blur-input]');
    this._hdriBlurValue = root.querySelector('[data-hdri-blur-value]');
    this._hdriBackgroundInput = root.querySelector('[data-hdri-background-input]');
    this._hdriControlsEl = root.querySelector('.orby-mobile-hdri-controls');
    this._bgControls = root.querySelector('[data-bg-controls]');
    this._bgSolidColorRow = root.querySelector('[data-bg-solid-color-row]');
    this._bgColorSwatch = root.querySelector('[data-bg-color-open]');
    this._bgGradientEnabled = root.querySelector('[data-bg-gradient-enabled]');
    this._bgGradientPanel = root.querySelector('[data-bg-gradient-panel]');
    this._bgGradientTypeButtons = Array.from(root.querySelectorAll('[data-bg-gradient-type]'));
    this._bgGradientSwatches = Array.from(root.querySelectorAll('[data-bg-gradient-color]'));
    this._colorPickerLayer = root.querySelector('[data-color-picker-layer]');
    this._colorPickerHost = root.querySelector('[data-color-picker-host]');
    this._colorPickerDone = root.querySelector('[data-color-picker-done]');
    /** @type {'solid' | 0 | 1 | null} */
    this._colorPickerTarget = null;
    this._bgGradientAngle = root.querySelector('[data-bg-gradient-angle]');
    this._bgGradientAngleValue = root.querySelector('[data-bg-gradient-angle-value]');
    this._bgGradientAngleRow = root.querySelector('[data-bg-gradient-angle-row]');
    this._bgGradientCenterRows = root.querySelector('[data-bg-gradient-center-rows]');
    this._bgGradientCenterX = root.querySelector('[data-bg-gradient-center-x]');
    this._bgGradientCenterXValue = root.querySelector('[data-bg-gradient-center-x-value]');
    this._bgGradientCenterY = root.querySelector('[data-bg-gradient-center-y]');
    this._bgGradientCenterYValue = root.querySelector('[data-bg-gradient-center-y-value]');

    this._initBackgroundColorPickers();

    this._renderPresetRails();
    this._renderFxControls();
    this._renderStyleControls();
    this._setDebugMenuOpen(false);
    this._bindSceneControls();
    this._syncSelectionUi();
    this._syncHdriControlsUi();
    this._syncHdriPanelUi();
    this._syncHdriBackgroundUi();
    this._bindViewportInteractions();
  }

  async _bootScene() {
    this.viewportEl?.setAttribute('data-loading', 'true');
    markMobileDebugLog('shell:scene-init-start');
    try {
      await this.scene.init();
      markMobileDebugLog('shell:scene-init-done');
      const expectsHandoff = hasMobileHandoffPendingFlag() || urlHasHandoffFlag();
      if (expectsHandoff) {
        const handoffWaitMs = readOrbyMobileHandoffWaitMs();
        await waitForMobileModelHandoff(handoffWaitMs);
        const file = await takeMobileModelHandoff();
        if (file) {
          await this.scene.loadFile(file);
          markMobileDebugLog('shell:model-loaded', { name: file.name, size: file.size, source: 'handoff' });
          this.showToast(`Loaded ${file.name}`);
          return;
        }
        markMobileDebugLog('shell:handoff-missing', { waitMs: handoffWaitMs });
        this.showToast('Model didn\'t transfer — load a sample or pick again');
      } else {
        const file = await takeMobileModelHandoff();
        if (file) {
          await this.scene.loadFile(file);
          markMobileDebugLog('shell:model-loaded', { name: file.name, source: 'handoff' });
          this.showToast(`Loaded ${file.name}`);
          return;
        }
      }
      if (!this.scene.currentModel) {
        markMobileDebugLog('shell:no-model');
        this._showEmptyState(true);
      }
    } catch (err) {
      console.error('[Orby Mobile] Scene init failed', err);
      markMobileDebugLog('shell:scene-init-failed', { message: String(err?.message || err) });
      this.showToast('Viewer failed to start');
    } finally {
      this.viewportEl?.removeAttribute('data-loading');
    }
  }

  /** @param {boolean} visible */
  _showEmptyState(visible) {
    if (!this.viewportEl) return;
    if (!this._emptyEl) {
      const empty = document.createElement('div');
      empty.className = 'orby-mobile-viewport__empty';
      empty.innerHTML = `
        <span class="orby-magic-btn-host orby-mobile-browse-host">
          <button type="button" class="orby-mobile-browse-cta orby-magic-btn" aria-label="Load GLB model">
            <span class="orby-magic-btn__fill" aria-hidden="true"></span>
            <span class="orby-magic-btn__inner">
              <span class="orby-magic-btn__label">Load .glb</span>
              <span class="orby-magic-btn__arrow" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M3.5 8h9M9 4.5L12.5 8 9 11.5"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
            </span>
          </button>
        </span>
      `;
      empty.querySelector('button')?.addEventListener('click', () => {
        this.fileInput?.click();
      });
      this.viewportEl.append(empty);
      this._emptyEl = empty;
    }
    this._emptyEl.hidden = !visible;
    if (visible) {
      this.viewportEl.removeAttribute('data-has-model');
    } else if (this.scene?.currentModel) {
      this.viewportEl.dataset.hasModel = 'true';
    }
  }

  /** @param {MobileTab} tab */
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

  /** @param {PresetTab} tab @param {{ id: string, label: string, thumb: string }} item */
  _mkPresetButton(tab, item) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'orby-mobile-preset';
    btn.setAttribute(this._dataAttrForTab(tab), item.id);
    btn.setAttribute('aria-label', item.label);
    btn.innerHTML = `
      <span class="orby-mobile-preset__thumb">
        <img src="${mobileAssetUrl(item.thumb)}" alt="" width="100" height="100" decoding="async" />
      </span>
      <span class="orby-mobile-preset__name">${item.label}</span>
    `;
    return btn;
  }

  _renderPresetRails() {
    for (const tab of /** @type {const} */ (['light', 'style', 'filters'])) {
      const track = this.root.querySelector(`[data-rail-track="${tab}"]`);
      if (!track) continue;
      const catalog = this._catalogForTab(tab);
      track.replaceChildren(...catalog.map((item) => this._mkPresetButton(tab, item)));
    }
  }

  _resetFxGrade() {
    this.scene.resetFx();
    this.selection.filters = MOBILE_FX.find((x) => x.id === 'none') ?? MOBILE_FX[0];
    this._syncFxControlsUi();
    this._syncSelectionUi();
    this.showToast('Grade reset');
  }

  _renderFxControls() {
    const host = this.root.querySelector('[data-fx-controls]');
    if (!host) return;

    host.replaceChildren();

    for (let i = 0; i < MOBILE_FX_SLIDER_SECTIONS.length; i++) {
      const section = MOBILE_FX_SLIDER_SECTIONS[i];
      const sectionEl = document.createElement('div');
      sectionEl.className = 'orby-mobile-fx-section';
      const list = document.createElement('div');
      list.className = 'orby-mobile-fx-section__sliders';
      list.append(...section.sliders.map((def) => this._mkFxSlider(def)));
      sectionEl.append(list);
      host.append(sectionEl);
    }

    const lensSection = document.createElement('div');
    lensSection.className = 'orby-mobile-fx-section';
    const lensList = document.createElement('div');
    lensList.className = 'orby-mobile-fx-section__lens';
    lensList.append(...MOBILE_FX_LENS_ROWS.map((row) => this._mkFxLensSlider(row)));
    lensSection.append(lensList);
    host.append(lensSection);

    const bloomSection = document.createElement('div');
    bloomSection.className = 'orby-mobile-fx-section';
    const bloomList = document.createElement('div');
    bloomList.className = 'orby-mobile-fx-section__bloom';
    bloomList.append(...MOBILE_FX_BLOOM_SLIDERS.map((def) => this._mkFxBloomSlider(def)));
    bloomSection.append(bloomList);
    host.append(bloomSection);

    const camSection = document.createElement('div');
    camSection.className = 'orby-mobile-fx-section';
    const camList = document.createElement('div');
    camList.className = 'orby-mobile-fx-section__camera';
    camList.append(this._mkFxSlider({ ...MOBILE_CAMERA_FOV, path: 'fov' }));
    camSection.append(camList);
    host.append(camSection);

    const resetBtn = this._mkPanelResetBtn('Reset grade', () => this._resetFxGrade());
    host.append(resetBtn);

    this._syncFxControlsUi();
  }

  _renderStyleControls() {
    const host = this.root.querySelector('[data-style-controls]');
    if (!host) return;

    host.replaceChildren();

    for (const def of MOBILE_STYLE_SLIDERS) {
      host.append(this._mkStyleSlider(def));
    }
    const resetBtn = this._mkPanelResetBtn('Reset shaders', () => this._resetStyleSliders());
    resetBtn.dataset.styleReset = '';
    host.append(resetBtn);
  }

  /** @param {string} label @param {() => void} onClick */
  _mkPanelResetBtn(label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'orby-mobile-pill-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  _resetStyleSliders() {
    if (!this.scene.resetCreativeLookSliders()) return;
    this._syncStyleControlsUi();
    this.showToast('Shaders reset');
  }

  /** @param {typeof MOBILE_STYLE_SLIDERS[number]} def */
  _mkStyleSlider(def) {
    const row = document.createElement('label');
    row.className = 'orby-mobile-fx-grade slider-line';
    row.dataset.stylePath = def.path;
    row.innerHTML = `
      <span class="orby-mobile-fx-grade__label slider-line-label">${def.label}</span>
      <input type="range" data-style-path="${def.path}" min="${def.min}" max="${def.max}" step="${def.step}" value="${def.defaultValue ?? def.min}" />
      <span class="orby-mobile-fx-grade__value" data-style-value="${def.path}"></span>
    `;
    const input = row.querySelector('input');
    const output = row.querySelector('[data-style-value]');
    input?.addEventListener('input', () => {
      const value = Number(input.value);
      if (output) output.textContent = def.format(value);
      this._updateSliderFill(input);
      this.scene.setCreativeLookValue(def.path, value);
    });
    if (input instanceof HTMLInputElement) this._updateSliderFill(input);
    return row;
  }

  _syncStyleControlsUi() {
    const host = this.root.querySelector('[data-style-controls]');
    const styleActive =
      this._engagedPresetTabs.has('style') &&
      this.selection.style.id !== 'none' &&
      this.selection.style.id !== 'standard';
    this.root.dataset.stylePanel = styleActive ? 'controls' : 'presets-only';
    if (host instanceof HTMLElement) {
      host.hidden = !styleActive;
      host.classList.toggle('is-visible', styleActive);
    }

    const preset = styleActive ? this.selection.style.id : null;
    const cl = this.scene.getCreativeLookSettings();

    for (const def of MOBILE_STYLE_SLIDERS) {
      const row = host?.querySelector(`[data-style-path="${def.path}"]`)?.closest('.orby-mobile-fx-grade');
      const input = host?.querySelector(`[data-style-path="${def.path}"]`);
      const output = host?.querySelector(`[data-style-value="${def.path}"]`);
      if (!(input instanceof HTMLInputElement)) continue;

      const hidden = isMobileStyleSliderHidden(preset, def.path);
      if (row instanceof HTMLElement) {
        row.hidden = hidden;
      }
      if (hidden) continue;

      const bounds = mobileStyleSliderBounds(preset, def.path);
      input.min = String(bounds.min);
      input.max = String(bounds.max);
      input.step = String(bounds.step);

      const value = resolveMobileStyleSliderValue(preset, def.path, cl[def.path]);
      input.value = String(value);
      input.disabled = !styleActive || isMobileStyleSliderDisabled(preset, def.path);
      if (output instanceof HTMLElement) {
        output.textContent = def.format(value);
      }
      this._updateSliderFill(input);
    }

    const resetBtn = host?.querySelector('[data-style-reset]');
    if (resetBtn instanceof HTMLButtonElement) {
      resetBtn.disabled = !styleActive;
    }

    this._syncStyleSheetState();
  }

  _syncStyleSheetState() {
    if (this.activeTab !== 'style' || this.sheetState === 'closed') return;
    const hasLook =
      this._engagedPresetTabs.has('style') &&
      this.selection.style.id !== 'none' &&
      this.selection.style.id !== 'standard';
    const next = /** @type {SheetState} */ (hasLook ? 'expanded' : 'peek');
    if (this.sheetState === next) return;
    this.setSheetState(next);
  }

  _syncHdriPanelUi() {
    const engaged = this._engagedPresetTabs.has('light');
    this.root.dataset.hdriPanel = engaged ? 'controls' : 'presets-only';
    if (this._hdriControlsEl instanceof HTMLElement) {
      this._hdriControlsEl.hidden = !engaged;
      this._hdriControlsEl.classList.toggle('is-visible', engaged);
    }
    this._syncHdriSheetState();
  }

  _syncHdriSheetState() {
    if (this.activeTab !== 'light' || this.sheetState === 'closed') return;
    if (!this._engagedPresetTabs.has('light')) {
      if (this.sheetState !== 'peek') this.setSheetState('peek');
      return;
    }
    if (this.sheetState !== 'peek') this.setSheetState('peek');
  }

  /** @param {HTMLInputElement} slider */
  _updateSliderFill(slider) {
    if (!slider || slider.type !== 'range') return;
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const value = parseFloat(slider.value) || 0;
    const isCentered = min < 0 && max > 0;
    if (isCentered) {
      const center = 0;
      const range = max - min;
      const centerPercent = ((center - min) / range) * 100;
      if (value === center) {
        slider.style.setProperty('--slider-fill-start', `${centerPercent}%`);
        slider.style.setProperty('--slider-fill-end', `${centerPercent}%`);
      } else if (value > center) {
        const valuePercent = ((value - min) / range) * 100;
        slider.style.setProperty('--slider-fill-start', `${centerPercent}%`);
        slider.style.setProperty('--slider-fill-end', `${valuePercent}%`);
      } else {
        const valuePercent = ((value - min) / range) * 100;
        slider.style.setProperty('--slider-fill-start', `${valuePercent}%`);
        slider.style.setProperty('--slider-fill-end', `${centerPercent}%`);
      }
      return;
    }
    const range = max - min;
    const fillPercent = range > 0 ? ((value - min) / range) * 100 : 0;
    slider.style.setProperty('--slider-fill-start', '0%');
    slider.style.setProperty('--slider-fill-end', `${fillPercent}%`);
  }

  /** @param {{ path: string, label: string, min: number, max: number, step: number, format: (v: number) => string, defaultValue?: number }} def */
  _mkFxSlider(def) {
    const row = document.createElement('label');
    row.className = 'orby-mobile-fx-grade slider-line';
    const initial = def.defaultValue ?? def.min;
    row.innerHTML = `
      <span class="orby-mobile-fx-grade__label slider-line-label">${def.label}</span>
      <input type="range" data-fx-path="${def.path}" min="${def.min}" max="${def.max}" step="${def.step}" value="${initial}" />
      <span class="orby-mobile-fx-grade__value" data-fx-value="${def.path}"></span>
    `;
    const input = row.querySelector('input');
    const output = row.querySelector('[data-fx-value]');
    input?.addEventListener('input', () => {
      const value = Number(input.value);
      if (output) output.textContent = def.format(value);
      this._updateSliderFill(input);
      this._onFxManualAdjust(def.path, value);
    });
    if (input instanceof HTMLInputElement) this._updateSliderFill(input);
    return row;
  }

  /** @param {typeof MOBILE_FX_BLOOM_SLIDERS[number]} def */
  _mkFxBloomSlider(def) {
    const row = document.createElement('label');
    row.className = 'orby-mobile-fx-grade slider-line';
    const initial = def.defaultValue ?? def.min;
    row.innerHTML = `
      <span class="orby-mobile-fx-grade__label slider-line-label">${def.label}</span>
      <input type="range" data-fx-bloom="${def.path}" min="${def.min}" max="${def.max}" step="${def.step}" value="${initial}" />
      <span class="orby-mobile-fx-grade__value" data-fx-bloom-value="${def.path}"></span>
    `;
    const input = row.querySelector('input');
    const output = row.querySelector('[data-fx-bloom-value]');
    input?.addEventListener('input', () => {
      const value = Number(input.value);
      if (output) output.textContent = def.format(value);
      if (input instanceof HTMLInputElement) this._updateSliderFill(input);
      this._onBloomAdjust(def.path, value);
    });
    if (input instanceof HTMLInputElement) this._updateSliderFill(input);
    return row;
  }

  /** @param {string} path @param {number} value */
  _onBloomAdjust(path, value) {
    applyMobileBloomSliderValue(this.scene, path, value);
    this.selection.filters = MOBILE_FX.find((x) => x.id === 'none') ?? MOBILE_FX[0];
    this._syncSelectionUi();
  }

  /** @param {typeof MOBILE_FX_LENS_ROWS[number]} row */
  _mkFxLensSlider(row) {
    const el = document.createElement('label');
    el.className = 'orby-mobile-fx-grade slider-line';
    el.innerHTML = `
      <span class="orby-mobile-fx-grade__label slider-line-label">${row.label}</span>
      <input
        type="range"
        data-fx-lens="${row.sliderPath}"
        min="${row.min}"
        max="${row.max}"
        step="${row.step}"
        value="${row.min}"
      />
      <span class="orby-mobile-fx-grade__value" data-fx-lens-value="${row.sliderPath}"></span>
    `;
    const input = el.querySelector('input');
    const output = el.querySelector('[data-fx-lens-value]');
    input?.addEventListener('input', () => {
      const value = Number(input.value);
      if (output) output.textContent = row.format(value);
      if (input instanceof HTMLInputElement) this._updateSliderFill(input);
      this._onFxLensAdjust(row, value);
    });
    if (input instanceof HTMLInputElement) this._updateSliderFill(input);
    return el;
  }

  /** @param {typeof MOBILE_FX_LENS_ROWS[number]} row @param {number} value */
  _onFxLensAdjust(row, value) {
    applyMobileLensSliderValue(this.scene, row, value);
    this.selection.filters = MOBILE_FX.find((x) => x.id === 'none') ?? MOBILE_FX[0];
    this._syncSelectionUi();
  }

  /** @param {string} path @param {number | boolean} value @param {{ preservePreset?: boolean }} [opts] */
  _onFxManualAdjust(path, value, opts) {
    this.scene.setFxValue(path, value);
    if (!opts?.preservePreset) {
      this.selection.filters = MOBILE_FX.find((x) => x.id === 'none') ?? MOBILE_FX[0];
      this._syncSelectionUi();
    }
  }

  _syncFxControlsUi() {
    const snap = this.scene.getFxSnapshot();
    const state = snap.state ?? {};

    this.root.querySelectorAll('[data-fx-path]').forEach((el) => {
      if (!(el instanceof HTMLInputElement)) return;
      const path = el.getAttribute('data-fx-path');
      if (!path) return;
      let value;
      if (path === 'fov') {
        value = snap.fov;
      } else {
        value = getNestedValue(state, path);
      }
      if (typeof value === 'number') {
        el.value = String(value);
        this._updateSliderFill(el);
        const output = this.root.querySelector(`[data-fx-value="${path}"]`);
        if (output instanceof HTMLElement) {
          if (path === 'camera.temperature') {
            output.textContent = `${Math.round(value)}K`;
          } else if (path === 'fov') {
            output.textContent = `${Math.round(value)}°`;
          } else if (
            path === 'camera.tint'
            || path === 'camera.highlights'
            || path === 'camera.shadows'
            || path === 'camera.clarity'
            || path === 'camera.fade'
            || path === 'camera.sharpness'
          ) {
            output.textContent = String(Math.round(value));
          } else if (path.includes('amount') || path.includes('intensity')) {
            output.textContent = value.toFixed(path.includes('aberration') ? 4 : 3);
          } else {
            output.textContent = value.toFixed(2);
          }
        }
      }
    });

    for (const row of MOBILE_FX_LENS_ROWS) {
      const el = this.root.querySelector(`[data-fx-lens="${row.sliderPath}"]`);
      if (!(el instanceof HTMLInputElement)) continue;
      const value = getMobileLensSliderUiValue(state, row);
      el.value = String(value);
      this._updateSliderFill(el);
      const output = this.root.querySelector(`[data-fx-lens-value="${row.sliderPath}"]`);
      if (output instanceof HTMLElement) {
        output.textContent = row.format(value);
      }
    }

    for (const def of MOBILE_FX_BLOOM_SLIDERS) {
      const el = this.root.querySelector(`[data-fx-bloom="${def.path}"]`);
      if (!(el instanceof HTMLInputElement)) continue;
      const value = def.path === 'bloom.strength'
        ? getMobileBloomIntensityUiValue(state)
        : Number(getNestedValue(state, def.path) ?? def.defaultValue ?? def.min);
      el.value = String(value);
      this._updateSliderFill(el);
      const output = this.root.querySelector(`[data-fx-bloom-value="${def.path}"]`);
      if (output instanceof HTMLElement) {
        output.textContent = def.format(value);
      }
    }
  }

  /** @deprecated */
  _syncFxGradeUi() {
    this._syncFxControlsUi();
  }

  _bindChrome() {
    this._sliderFocus = bindMobileSliderFocus({ root: this.root });
    this._rangeTouch = bindMobileRangeTouch({ root: this.root });

    if (this.sheet) {
      this._sheetDrag = bindMobileSheetDrag({
        root: this.root,
        sheet: this.sheet,
        onDismiss: () => this.setSheetState('closed'),
      });
    }

    this.root.querySelectorAll('[data-open-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = /** @type {MobileTab} */ (btn.getAttribute('data-open-tab'));
        this.openSheet(tab);
      });
    });

    this.root.querySelector('[data-sheet-dismiss]')?.addEventListener('click', () => {
      this.setSheetState('closed');
    });

    document.addEventListener('pointerdown', (e) => {
      if (this.root.dataset.sliderFocus != null) return;
      if (this.sheetState === 'closed') return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('.orby-mobile-sheet') || t.closest('.orby-mobile-dock') || t.closest('.orby-mobile-export-btn') || t.closest('.orby-mobile-debug-menu') || t.closest('.orby-mobile-viewport__empty')) return;
      this.setSheetState('closed');
    });
  }

  _bindViewportInteractions() {
    if (!this.viewportEl) return;

    const isChromeTarget = (el) => {
      if (!(el instanceof Element)) return false;
      return !!el.closest(
        '.orby-mobile-export-btn, .orby-mobile-debug-menu, .orby-mobile-viewport__empty, .orby-mobile-browse-cta',
      );
    };

    this.viewportEl.addEventListener('pointerdown', (e) => {
      if (isChromeTarget(e.target)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      this._comparePointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      clearTimeout(this._compareHoldTimer);
      this._compareHoldTimer = setTimeout(() => {
        this._compareHoldTimer = null;
        if (!this._comparePointer || !this.scene) return;
        this._compareActive = true;
        this.scene.setCompareHeld(true);
        this.viewportEl?.setAttribute('data-compare', 'true');
        mobileHaptic('soft');
      }, VIEWPORT_COMPARE_HOLD_MS);
    });

    this.viewportEl.addEventListener('pointermove', (e) => {
      if (!this._comparePointer || e.pointerId !== this._comparePointer.id) return;
      if (this._compareActive) return;
      const dx = e.clientX - this._comparePointer.x;
      const dy = e.clientY - this._comparePointer.y;
      if (Math.hypot(dx, dy) > VIEWPORT_COMPARE_MOVE_PX) {
        clearTimeout(this._compareHoldTimer);
        this._compareHoldTimer = null;
        this._comparePointer = null;
      }
    });

    const endCompare = () => {
      clearTimeout(this._compareHoldTimer);
      this._compareHoldTimer = null;
      if (this._compareActive && this.scene) {
        this.scene.setCompareHeld(false);
        this.viewportEl?.removeAttribute('data-compare');
      }
      this._compareActive = false;
      this._comparePointer = null;
    };

    this.viewportEl.addEventListener('pointerup', (e) => {
      if (isChromeTarget(e.target)) return;

      if (!this._compareActive) {
        const now = performance.now();
        const dt = now - this._lastViewportTap.time;
        const dist = Math.hypot(
          e.clientX - this._lastViewportTap.x,
          e.clientY - this._lastViewportTap.y,
        );
        if (dt < VIEWPORT_DOUBLE_TAP_MS && dist < VIEWPORT_DOUBLE_TAP_DIST_PX && this.scene) {
          this.scene.resetCamera();
          mobileHaptic('medium');
          this._lastViewportTap = { time: 0, x: 0, y: 0 };
          endCompare();
          return;
        }
        this._lastViewportTap = { time: now, x: e.clientX, y: e.clientY };
      }

      endCompare();
    });

    this.viewportEl.addEventListener('pointercancel', endCompare);
  }

  _bindSceneControls() {
    this.root.addEventListener('click', (e) => {
      const pick = e.target.closest('.orby-mobile-preset');
      if (!pick) return;
      const panel = pick.closest('[data-panel]');
      const tab = panel?.getAttribute('data-panel');
      if (tab === 'light' || tab === 'style' || tab === 'filters') {
        this._select(/** @type {PresetTab} */ (tab), pick);
        this._scrollPresetIntoView(/** @type {PresetTab} */ (tab), pick, 'smooth');
        this._updateRailCenterHighlight(/** @type {PresetTab} */ (tab));
      }
    });

    this._bindHdriControls();
    this._bindHdriBackgroundControls();

    this.root.addEventListener('change', (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.closest('.effect-toggle')) {
        mobileHaptic('light');
      }
    });

    // Center-snap carousel — live preview while scrolling, magnetic settle on release.
    for (const tab of /** @type {const} */ (['light', 'style', 'filters'])) {
      const track = this.root.querySelector(`[data-rail-track="${tab}"]`);
      track?.addEventListener('scroll', () => this._onPresetRailScroll(tab), { passive: true });
      track?.addEventListener('scrollend', () => this._onPresetRailScrollEnd(tab), { passive: true });
    }

    this.root.querySelector('[data-action="toggle-debug"]')?.addEventListener('click', (e) => {
      const menu = this.root.querySelector('.orby-mobile-debug-menu');
      if (!(menu instanceof HTMLElement)) return;
      this._setDebugMenuOpen(menu.dataset.debugMenu !== 'open');
    });

    this.root.querySelector('[data-action="copy-settings"]')?.addEventListener('click', () => {
      void copyMobileDebugSettings(this.scene, this.selection).then((result) => {
        if (result === 'copied') {
          this.showToast('Settings copied');
        } else {
          this.showToast('Copy failed');
        }
      });
    });

    this.root.querySelector('[data-action="load-sample"]')?.addEventListener('click', () => {
      void loadMobileDebugSample(this.scene).then((result) => {
        if (result === 'loaded') {
          this.showToast('Loaded sample');
        } else {
          this.showToast('Sample load failed');
        }
      });
    });

    this.root.querySelector('[data-action="export"]')?.addEventListener('click', () => {
      if (this._exportBtn instanceof HTMLElement) {
        this._exportBtn.dataset.busy = 'true';
        this._exportBtn.setAttribute('aria-busy', 'true');
      }
      void this.scene.exportImage().then(
        (result) => {
          if (result === 'shared') {
            mobileHaptic('success');
            this.showToast('Saved to Photos');
          } else if (result === 'downloaded') {
            mobileHaptic('success');
            this.showToast('Image saved');
          } else if (result === 'no-model') {
            this.showToast('Load a model first');
          } else {
            this.showToast('Export failed');
          }
        },
        (err) => {
          if (err?.name === 'AbortError') return;
          this.showToast('Export failed');
        },
      ).finally(() => {
        if (this._exportBtn instanceof HTMLElement) {
          delete this._exportBtn.dataset.busy;
          this._exportBtn.removeAttribute('aria-busy');
        }
      });
    });

    this.fileInput?.addEventListener('change', () => {
      const file = this.fileInput?.files?.[0];
      if (!file) return;

      const check = validateOrbyMobileModelFile(file);
      if (!check.ok) {
        this.showToast(check.message);
        if (this.fileInput) this.fileInput.value = '';
        return;
      }

      this.viewportEl?.setAttribute('data-loading', 'true');
      void this.scene.loadFile(file).then(() => {
        this.showToast(`Loaded ${file.name}`);
        mobileHaptic('success');
      }).catch((err) => {
        console.error('[Orby Mobile] Model load failed', err);
        markMobileDebugLog('shell:model-load-failed', { name: file.name, size: file.size, message: String(err?.message || err) });
        this.showToast(err instanceof Error ? err.message : 'Could not load model');
      }).finally(() => {
        this.viewportEl?.removeAttribute('data-loading');
      });
      if (this.fileInput) this.fileInput.value = '';
    });
  }

  _initBackgroundColorPickers() {
    if (!(this._colorPickerHost instanceof HTMLElement)) return;

    this._colorPicker = new MobileHsvColorPicker(this._colorPickerHost, {
      ariaLabel: 'Background color',
      defaultValue: ORBY_BLACK,
      onInput: (color) => this._applyColorPickerValue(color),
    });

    this._bgColorSwatch?.addEventListener('click', () => {
      this._openColorPicker('solid');
    });

    this._bgGradientSwatches.forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.getAttribute('data-bg-gradient-color'));
        if (index !== 0 && index !== 1) return;
        this._openColorPicker(/** @type {0 | 1} */ (index));
      });
    });

    this._colorPickerDone?.addEventListener('click', () => {
      this._closeColorPicker();
    });
  }

  /** @param {'solid' | 0 | 1} target */
  _openColorPicker(target) {
    if (!this._colorPicker) return;

    let color = ORBY_BLACK;
    if (target === 'solid') {
      color = this.scene.getBackgroundColor();
    } else {
      const stops = normalizeBackgroundGradient(this.scene.getBackgroundGradient()).stops;
      color = stops[target]?.color ?? ORBY_BLACK;
    }

    this._colorPickerTarget = target;
    this._colorPicker.setValue(color);
    this._colorPicker.setDisabled(false);
    if (this._colorPickerLayer instanceof HTMLElement) {
      this._colorPickerLayer.hidden = false;
    }
    this.root.dataset.colorPicker = 'open';
    requestAnimationFrame(() => {
      this._colorPicker?.resize();
    });
    mobileHaptic('light');
  }

  _closeColorPicker() {
    if (this._colorPickerTarget == null) return;
    this._colorPickerTarget = null;
    delete this.root.dataset.colorPicker;
    if (this._colorPickerLayer instanceof HTMLElement) {
      this._colorPickerLayer.hidden = true;
    }
    mobileHaptic('soft');
  }

  /** @param {string} color */
  _applyColorPickerValue(color) {
    if (!color || this._colorPickerTarget == null) return;

    if (this._colorPickerTarget === 'solid') {
      this.scene.setBackgroundColor(color);
      this._syncColorSwatch(this._bgColorSwatch, color);
      return;
    }

    const gradient = normalizeBackgroundGradient(this.scene.getBackgroundGradient());
    const stops = [...gradient.stops];
    const index = this._colorPickerTarget;
    if (!stops[index]) return;
    stops[index] = { ...stops[index], color };
    this.scene.setBackgroundGradient({ stops });
    const swatch = this._bgGradientSwatches.find(
      (button) => Number(button.getAttribute('data-bg-gradient-color')) === index,
    );
    this._syncColorSwatch(swatch, color);
  }

  /** @param {Element | null | undefined} button @param {string} color */
  _syncColorSwatch(button, color) {
    if (!(button instanceof HTMLElement) || !color) return;
    button.style.backgroundColor = color;
    button.dataset.color = color;
  }

  _bindHdriBackgroundControls() {
    this._hdriBackgroundInput?.addEventListener('change', () => {
      const enabled = !!this._hdriBackgroundInput?.checked;
      this.scene.setHdriBackground(enabled);
      this._syncHdriBackgroundUi();
    });

    this._bgGradientEnabled?.addEventListener('change', () => {
      const enabled = !!this._bgGradientEnabled?.checked;
      this.scene.setBackgroundGradient({ enabled });
      this._syncHdriBackgroundUi();
    });

    this._bgGradientTypeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const type = button.getAttribute('data-bg-gradient-type');
        if (type !== 'linear' && type !== 'radial') return;
        this.scene.setBackgroundGradient({ type });
        this._syncHdriBackgroundUi();
      });
    });

    this._bgGradientAngle?.addEventListener('input', () => {
      const angle = Number(this._bgGradientAngle?.value ?? 180);
      if (this._bgGradientAngle instanceof HTMLInputElement) {
        this._updateSliderFill(this._bgGradientAngle);
      }
      if (this._bgGradientAngleValue instanceof HTMLElement) {
        this._bgGradientAngleValue.textContent = `${Math.round(angle)}°`;
      }
      this.scene.setBackgroundGradient({ angle });
    });

    this._bgGradientCenterX?.addEventListener('input', () => {
      const centerX = Number(this._bgGradientCenterX?.value ?? 50);
      if (this._bgGradientCenterX instanceof HTMLInputElement) {
        this._updateSliderFill(this._bgGradientCenterX);
      }
      if (this._bgGradientCenterXValue instanceof HTMLElement) {
        this._bgGradientCenterXValue.textContent = `${Math.round(centerX)}%`;
      }
      this.scene.setBackgroundGradient({ centerX });
    });

    this._bgGradientCenterY?.addEventListener('input', () => {
      const centerY = Number(this._bgGradientCenterY?.value ?? 50);
      if (this._bgGradientCenterY instanceof HTMLInputElement) {
        this._updateSliderFill(this._bgGradientCenterY);
      }
      if (this._bgGradientCenterYValue instanceof HTMLElement) {
        this._bgGradientCenterYValue.textContent = `${Math.round(centerY)}%`;
      }
      this.scene.setBackgroundGradient({ centerY });
    });
  }

  _syncHdriBackgroundUi() {
    const backdropOn = this.scene.getHdriBackgroundEnabled();
    this.root.dataset.hdriBackdrop = backdropOn ? 'on' : 'off';
    const gradient = normalizeBackgroundGradient(this.scene.getBackgroundGradient());
    const bgColor = this.scene.getBackgroundColor();

    if (this._hdriBackgroundInput instanceof HTMLInputElement) {
      this._hdriBackgroundInput.checked = backdropOn;
    }
    if (this._bgControls instanceof HTMLElement) {
      this._bgControls.hidden = backdropOn;
    }
    if (this._bgSolidColorRow instanceof HTMLElement) {
      this._bgSolidColorRow.hidden = gradient.enabled;
    }
    this._syncColorSwatch(this._bgColorSwatch, bgColor);

    if (this._bgGradientEnabled instanceof HTMLInputElement) {
      this._bgGradientEnabled.checked = gradient.enabled;
    }
    if (this._bgGradientPanel instanceof HTMLElement) {
      this._bgGradientPanel.hidden = !gradient.enabled;
    }

    this._bgGradientTypeButtons.forEach((button) => {
      const type = button.getAttribute('data-bg-gradient-type');
      button.classList.toggle('is-active', type === gradient.type);
    });

    const stops = gradient.stops;
    this._bgGradientSwatches.forEach((button) => {
      const index = Number(button.getAttribute('data-bg-gradient-color'));
      this._syncColorSwatch(button, stops[index]?.color);
    });

    if (this._bgGradientAngle instanceof HTMLInputElement) {
      this._bgGradientAngle.value = String(gradient.angle);
      this._updateSliderFill(this._bgGradientAngle);
    }
    if (this._bgGradientAngleValue instanceof HTMLElement) {
      this._bgGradientAngleValue.textContent = `${Math.round(gradient.angle)}°`;
    }
    if (this._bgGradientAngleRow instanceof HTMLElement) {
      this._bgGradientAngleRow.hidden = gradient.type !== 'linear';
    }
    if (this._bgGradientCenterRows instanceof HTMLElement) {
      this._bgGradientCenterRows.hidden = gradient.type !== 'radial';
    }
    if (this._bgGradientCenterX instanceof HTMLInputElement) {
      this._bgGradientCenterX.value = String(gradient.centerX);
      this._updateSliderFill(this._bgGradientCenterX);
    }
    if (this._bgGradientCenterXValue instanceof HTMLElement) {
      this._bgGradientCenterXValue.textContent = `${Math.round(gradient.centerX)}%`;
    }
    if (this._bgGradientCenterY instanceof HTMLInputElement) {
      this._bgGradientCenterY.value = String(gradient.centerY);
      this._updateSliderFill(this._bgGradientCenterY);
    }
    if (this._bgGradientCenterYValue instanceof HTMLElement) {
      this._bgGradientCenterYValue.textContent = `${Math.round(gradient.centerY)}%`;
    }
    this._syncHdriSheetState();
  }

  _bindHdriControls() {
    this._hdriBrightnessInput?.addEventListener('input', () => {
      const value = Number(this._hdriBrightnessInput?.value ?? MOBILE_HDRI_STRENGTH_DEFAULT);
      if (this._hdriBrightnessInput instanceof HTMLInputElement) {
        this._updateSliderFill(this._hdriBrightnessInput);
      }
      if (this._hdriBrightnessValue instanceof HTMLElement) {
        this._hdriBrightnessValue.textContent = value.toFixed(1);
      }
      this.scene.setHdriStrength(value);
    });

    this._hdriBlurInput?.addEventListener('input', () => {
      const value = Number(this._hdriBlurInput?.value ?? 0);
      if (this._hdriBlurInput instanceof HTMLInputElement) {
        this._updateSliderFill(this._hdriBlurInput);
      }
      if (this._hdriBlurValue instanceof HTMLElement) {
        this._hdriBlurValue.textContent = value.toFixed(2);
      }
      this.scene.setHdriBlurriness(value);
    });
  }

  _syncHdriSelectionFromScene() {
    const presetId = this.scene.getHdriPresetId();
    const item = MOBILE_HDRI.find((h) => h.id === presetId) ?? MOBILE_HDRI[0];
    this.selection.light = item;
  }

  _syncHdriControlsUi() {
    const strength = this.scene.getHdriStrength();
    const blur = this.scene.getHdriBlurriness();

    if (this._hdriBrightnessInput instanceof HTMLInputElement) {
      this._hdriBrightnessInput.min = '0';
      this._hdriBrightnessInput.max = String(MOBILE_HDRI_STRENGTH_MAX);
      this._hdriBrightnessInput.value = String(strength);
      this._updateSliderFill(this._hdriBrightnessInput);
    }
    if (this._hdriBrightnessValue instanceof HTMLElement) {
      this._hdriBrightnessValue.textContent = strength.toFixed(1);
    }

    if (this._hdriBlurInput instanceof HTMLInputElement) {
      this._hdriBlurInput.value = String(blur);
      this._updateSliderFill(this._hdriBlurInput);
    }
    if (this._hdriBlurValue instanceof HTMLElement) {
      this._hdriBlurValue.textContent = blur.toFixed(2);
    }
  }

  /** @param {MobileTab} tab */
  openSheet(tab) {
    const sameTabOpen =
      this.sheetState !== 'closed' && this.activeTab === tab;

    if (sameTabOpen) {
      this.setSheetState('closed');
      return;
    }

    this.setActiveTab(tab);
    this._resetSheetScroll(tab);
    if (tab === 'fx') {
      this.setSheetState('expanded');
      return;
    }
    if (tab === 'light') {
      this._syncHdriSelectionFromScene();
      this._syncHdriControlsUi();
      this._syncHdriPanelUi();
      this._syncHdriBackgroundUi();
      this._syncSelectionUi();
      this.setSheetState('peek');
      requestAnimationFrame(() => {
        this._scrollRailToSelection('light');
      });
      return;
    }
    if (tab === 'style') {
      this._syncStyleControlsUi();
      this.setSheetState('peek');
      this._syncStyleSheetState();
      requestAnimationFrame(() => {
        this._syncStyleRailScroll();
      });
      return;
    }
    this.setSheetState('peek');
    requestAnimationFrame(() => {
      this._scrollRailToSelection(/** @type {PresetTab} */ (tab));
    });
  }

  /** @param {PresetTab} tab */
  _resetRailScroll(tab) {
    const track = this.root.querySelector(`[data-rail-track="${tab}"]`);
    if (track instanceof HTMLElement) track.scrollLeft = 0;
  }

  _syncStyleRailScroll() {
    const id = this.selection.style.id;
    if (id === 'none' || id === 'standard') {
      this._resetRailScroll('style');
      return;
    }
    this._scrollRailToSelection('style');
  }

  /** @param {MobileTab} tab */
  _resetSheetScroll(tab) {
    if (tab === 'fx') {
      const el = this.root.querySelector('[data-panel="fx"] .orby-mobile-fx-controls');
      if (el instanceof HTMLElement) el.scrollTop = 0;
      return;
    }
    const panel = this.root.querySelector(`[data-panel="${tab}"]`);
    if (panel instanceof HTMLElement) panel.scrollTop = 0;
  }

  /** @param {MobileTab} tab */
  setActiveTab(tab) {
    this.activeTab = tab;
    this.root.dataset.activeTab = tab;
    this.root.querySelectorAll('[data-panel]').forEach((panel) => {
      panel.hidden = panel.getAttribute('data-panel') !== tab;
    });
    this._syncDockTabState();
  }

  _syncDockTabState() {
    this.root.querySelectorAll('[data-open-tab]').forEach((btn) => {
      const dockTab = btn.getAttribute('data-open-tab');
      const expanded = this.sheetState !== 'closed' && dockTab === this.activeTab;
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      btn.classList.toggle('is-active', expanded);
    });
  }

  /** @param {SheetState} state */
  setSheetState(state) {
    if (state === 'closed') {
      this._engagedPresetTabs.clear();
    }
    const stateChanged = this.sheetState !== state;
    if (stateChanged) {
      this._sliderFocus?.release();
      this._rangeTouch?.release();
    }
    const wasOpen = this.sheetState !== 'closed';
    this.sheetState = state;
    this.root.dataset.sheet = state;
    this._sheetDrag?.reset();
    this._syncDockTabState();
    const scrim = this.root.querySelector('.orby-mobile-scrim');
    if (scrim instanceof HTMLElement) {
      scrim.hidden = state === 'closed';
    }
    if (!wasOpen && state !== 'closed') {
      mobileHaptic('light');
    } else if (wasOpen && state === 'closed') {
      mobileHaptic('soft');
    }
  }

  /** @param {boolean} hidden */
  _setOrbitChromeHidden(hidden) {
    if (hidden) {
      this.root.dataset.orbitChrome = 'hidden';
    } else {
      delete this.root.dataset.orbitChrome;
    }
  }

  /** @param {boolean} open */
  _setDebugMenuOpen(open) {
    const menu = this.root.querySelector('.orby-mobile-debug-menu');
    const toggle = this.root.querySelector('[data-action="toggle-debug"]');
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

  /** @param {PresetTab} tab @param {HTMLElement} pick */
  _select(tab, pick) {
    const catalog = this._catalogForTab(tab);
    const attr = this._dataAttrForTab(tab);
    const id = pick.getAttribute(attr);
    const item = catalog.find((x) => x.id === id);
    if (!item) return;
    const changed = this.selection[tab].id !== id;

    if (tab === 'light') {
      this._engagedPresetTabs.add('light');
    }
    if (tab === 'style') {
      if (item.id === 'none' || item.id === 'standard') {
        this._engagedPresetTabs.delete('style');
      } else {
        this._engagedPresetTabs.add('style');
      }
    }

    this.selection[tab] = item;

    if (tab === 'light') {
      void this.scene.setHdri(item.id);
      this._syncHdriPanelUi();
    }
    if (tab === 'style') {
      const lookId = item.id === 'standard' ? 'none' : item.id;
      this.scene.setCreativeLook(lookId);
      this._syncStyleControlsUi();
    }
    if (tab === 'filters') {
      this.scene.applyLookFilter(item.id);
      this._syncFxControlsUi();
    }

    this._syncSelectionUi();
    if (changed) {
      mobileHaptic('selection');
    }
  }

  /** @param {PresetTab} tab @param {HTMLElement} el @param {ScrollBehavior} [behavior] */
  _scrollPresetIntoView(tab, el, behavior = 'auto') {
    if (!(el instanceof HTMLElement)) return;
    this._snapRailPresetToCenter(el, behavior);
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

    this._suppressRailLeadingSelection = true;
    clearTimeout(this._railSuppressTimer);
    el.scrollIntoView({ behavior, inline: 'center', block: 'nearest' });
    const ms = behavior === 'smooth' ? 360 : 120;
    this._railSuppressTimer = setTimeout(() => {
      this._suppressRailLeadingSelection = false;
      this._railSuppressTimer = null;
    }, ms);
  }

  /** @param {PresetTab} tab */
  _updateRailCenterHighlight(tab) {
    const track = this.root.querySelector(`[data-rail-track="${tab}"]`);
    if (!(track instanceof HTMLElement)) return;
    const centered = this._getRailCenteredPreset(track);
    track.querySelectorAll('.orby-mobile-preset').forEach((el) => {
      if (el instanceof HTMLElement) {
        el.classList.toggle('is-rail-center', el === centered);
      }
    });
  }

  /** @param {PresetTab} tab */
  _onPresetRailScroll(tab) {
    if (this.activeTab !== tab || this.sheetState === 'closed') return;
    this._railScrollingTab = tab;
    this._updateRailCenterHighlight(tab);
    clearTimeout(this._railScrollTimer);
    this._railScrollTimer = setTimeout(() => {
      this._railScrollTimer = null;
      if (this._railScrollingTab !== tab || this._suppressRailLeadingSelection) return;
      this._applyRailCenteredSelection(tab);
    }, 90);
    clearTimeout(this._railScrollEndTimer);
    this._railScrollEndTimer = setTimeout(() => {
      this._railScrollEndTimer = null;
      this._finishRailScroll(tab);
    }, 140);
  }

  /** @param {PresetTab} tab */
  _onPresetRailScrollEnd(tab) {
    if (this.activeTab !== tab || this.sheetState === 'closed') return;
    clearTimeout(this._railScrollTimer);
    clearTimeout(this._railScrollEndTimer);
    this._railScrollTimer = null;
    this._railScrollEndTimer = null;
    this._finishRailScroll(tab);
  }

  /** @param {PresetTab} tab */
  _finishRailScroll(tab) {
    const track = this.root.querySelector(`[data-rail-track="${tab}"]`);
    if (!(track instanceof HTMLElement)) return;
    const centered = this._getRailCenteredPreset(track);
    if (!(centered instanceof HTMLElement)) return;

    this._snapRailPresetToCenter(centered, 'smooth');
    this._updateRailCenterHighlight(tab);

    if (this._suppressRailLeadingSelection) return;
    this._applyRailCenteredSelection(tab);
  }

  /** @param {PresetTab} tab */
  _applyRailCenteredSelection(tab) {
    const track = this.root.querySelector(`[data-rail-track="${tab}"]`);
    if (!(track instanceof HTMLElement)) return;
    const centered = this._getRailCenteredPreset(track);
    if (!(centered instanceof HTMLElement)) return;
    const currentId = this.selection[tab].id;
    const attr = this._dataAttrForTab(tab);
    const nextId = centered.getAttribute(attr);
    if (!nextId || nextId === currentId) return;
    this._select(tab, centered);
  }

  /** @param {PresetTab} tab */
  _scrollRailToSelection(tab) {
    const id = this.selection[tab].id;
    const attr = this._dataAttrForTab(tab);
    const el = this.root.querySelector(`[data-rail-track="${tab}"] [${attr}="${CSS.escape(id)}"]`);
    if (el instanceof HTMLElement) {
      this._scrollPresetIntoView(tab, el, 'auto');
      this._updateRailCenterHighlight(tab);
    }
  }

  /** @param {HTMLElement} track */
  _getRailCenterX(track) {
    const trackRect = track.getBoundingClientRect();
    return trackRect.left + trackRect.width / 2;
  }

  /** @param {HTMLElement} track */
  _getRailCenteredPreset(track) {
    const anchorX = this._getRailCenterX(track);
    let best = null;
    let bestDist = Infinity;
    for (const child of track.children) {
      if (!(child instanceof HTMLElement)) continue;
      const rect = child.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const dist = Math.abs(center - anchorX);
      if (dist < bestDist) {
        bestDist = dist;
        best = child;
      }
    }
    return best;
  }

  _syncSelectionUi() {
    for (const tab of /** @type {const} */ (['light', 'style', 'filters'])) {
      const attr = this._dataAttrForTab(tab);
      const id = this.selection[tab].id;
      this.root.querySelectorAll(`[${attr}]`).forEach((el) => {
        const on = el.getAttribute(attr) === id;
        el.classList.toggle('is-selected', on);
        el.setAttribute('aria-current', on ? 'true' : 'false');
      });

      const dockBtn = this.root.querySelector(`[data-open-tab="${tab}"]`);
      const thumb = dockBtn?.querySelector('[data-dock-thumb] img');
      if (thumb instanceof HTMLImageElement) {
        thumb.src = mobileAssetUrl(this.selection[tab].thumb);
      }

      if (tab === this.activeTab && this.sheetState !== 'closed') {
        this._updateRailCenterHighlight(tab);
      }
    }
    this._syncStyleControlsUi();
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
