import {
  MOBILE_HDRI,
  MOBILE_CREATIVE_LOOKS,
  MOBILE_FX,
  mobileAssetUrl,
  findCreativeLook,
  MOBILE_STYLE_NONE,
} from './mobileCatalog.js';
import {
  MOBILE_FX_SLIDER_SECTIONS,
  MOBILE_FX_LENS_ROWS,
  MOBILE_CAMERA_FOV,
  getNestedValue,
  getMobileLensSliderUiValue,
  applyMobileLensSliderValue,
} from './mobileFxControls.js';
import { MobileScene, MOBILE_HDRI_STRENGTH_DEFAULT, MOBILE_HDRI_STRENGTH_MAX } from './MobileScene.js';
import { takeMobileModelHandoff, markMobileAppSessionActive } from '../../../scripts/orbyMobileHandoff.js';

/** Left inset for preset rails — keep in sync with --orby-mobile-preset-rail-inset */
const MOBILE_PRESET_RAIL_INSET = 16;
/** Long-press on Light HDRI spheres opens brightness control. */
const HDRI_BRIGHTNESS_LONG_PRESS_MS = 480;
const HDRI_BRIGHTNESS_MOVE_CANCEL_PX = 14;
/** @typedef {'closed' | 'peek' | 'expanded'} SheetState */
/** @typedef {'light' | 'style' | 'filters' | 'fx'} MobileTab */
/** @typedef {'light' | 'style' | 'filters'} PresetTab */

export class MobileShell {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.viewportEl = root.querySelector('.orby-mobile-viewport');
    this.scene = new MobileScene(root.querySelector('.orby-mobile-viewport__canvas'));
    this.scene.onModelLoaded = () => {
      markMobileAppSessionActive();
      if (this.viewportEl) this.viewportEl.dataset.hasModel = 'true';
      this.scene.setCreativeLook(this.selection.style.id);
    };
    this.scene.onError = (message) => this.showToast(message);
    this.scene.onFxStateChanged = () => this._syncFxControlsUi();
    void this.scene
      .init()
      .then(async () => {
        const file = await takeMobileModelHandoff();
        if (!file) return;
        await this.scene.loadFile(file);
        this.showToast(`Loaded ${file.name}`);
      })
      .catch((err) => {
        console.error('[Orby Mobile] Scene init failed', err);
        this.showToast('Viewer failed to start');
      });
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
    /** @type {PresetTab | null} */
    this._railScrollingTab = null;

    this._hdriBrightnessEl = root.querySelector('[data-hdri-brightness]');
    this._hdriBrightnessInput = root.querySelector('[data-hdri-brightness-input]');
    this._hdriBrightnessValue = root.querySelector('[data-hdri-brightness-value]');
    /** @type {HTMLElement | null} */
    this._hdriBrightnessAnchor = null;
    /** @type {{ timer: ReturnType<typeof setTimeout>, x: number, y: number, btn: HTMLElement } | null} */
    this._hdriPress = null;
    this._hdriLongPressTriggered = false;
    this._suppressPresetClick = false;

    this._renderPresetRails();
    this._renderFxControls();
    this._bind();
    this._syncSelectionUi();
  }

  /** @param {MobileTab} tab */
  _catalogForTab(tab) {
    if (tab === 'light') return MOBILE_HDRI;
    if (tab === 'style') {
      return [
        MOBILE_STYLE_NONE,
        ...MOBILE_CREATIVE_LOOKS.filter((x) => x.id !== 'none'),
      ];
    }
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
        <img src="${mobileAssetUrl(item.thumb)}" alt="" width="72" height="72" decoding="async" />
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

  _renderFxControls() {
    const host = this.root.querySelector('[data-fx-controls]');
    if (!host) return;

    host.replaceChildren();

    for (const section of MOBILE_FX_SLIDER_SECTIONS) {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'orby-mobile-fx-section';
      sectionEl.innerHTML = `<p class="orby-mobile-fx-section__label">${section.label}</p>`;
      const list = document.createElement('div');
      list.className = 'orby-mobile-fx-section__sliders';
      list.append(...section.sliders.map((def) => this._mkFxSlider(def)));
      sectionEl.append(list);
      host.append(sectionEl);
    }

    const lensSection = document.createElement('div');
    lensSection.className = 'orby-mobile-fx-section';
    lensSection.innerHTML = '<p class="orby-mobile-fx-section__label">Lens</p>';
    const lensList = document.createElement('div');
    lensList.className = 'orby-mobile-fx-section__lens';
    lensList.append(...MOBILE_FX_LENS_ROWS.map((row) => this._mkFxLensSlider(row)));
    lensSection.append(lensList);
    host.append(lensSection);

    const camSection = document.createElement('div');
    camSection.className = 'orby-mobile-fx-section';
    camSection.innerHTML = '<p class="orby-mobile-fx-section__label">Camera</p>';
    const camList = document.createElement('div');
    camList.className = 'orby-mobile-fx-section__camera';

    camList.append(this._mkFxSlider({ ...MOBILE_CAMERA_FOV, path: 'fov' }));

    const letterboxRow = this._mkFxSwitchRow('21∶9 letterbox', {
      inputAttrs: 'data-fx-camera="letterbox"',
      onChange: (e) => {
        const on = /** @type {HTMLInputElement} */ (e.target).checked;
        this.scene.setCinematicLetterbox(on);
        this.showToast(on ? 'Letterbox on' : 'Letterbox off');
      },
    });
    camList.append(letterboxRow);

    const orbitWrap = document.createElement('div');
    orbitWrap.className = 'orby-mobile-fx-orbit';
    orbitWrap.innerHTML = '<span class="orby-mobile-fx-orbit__label">Auto-orbit</span>';
    const orbitGroup = document.createElement('div');
    orbitGroup.className = 'orby-mobile-fx-orbit__group';
    orbitGroup.setAttribute('role', 'group');
    orbitGroup.setAttribute('aria-label', 'Auto-orbit speed');
    for (const mode of /** @type {const} */ (['off', 'slow', 'fast'])) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'orby-mobile-fx-orbit__btn';
      btn.dataset.fxOrbit = mode;
      btn.textContent = mode === 'off' ? 'Off' : mode === 'slow' ? 'Slow' : 'Fast';
      btn.addEventListener('click', () => {
        this.scene.setAutoOrbit(mode);
        this._syncOrbitUi(mode);
        this.showToast(mode === 'off' ? 'Orbit off' : `Orbit ${mode}`);
      });
      orbitGroup.append(btn);
    }
    orbitWrap.append(orbitGroup);
    camList.append(orbitWrap);

    const resetCamBtn = document.createElement('button');
    resetCamBtn.type = 'button';
    resetCamBtn.className = 'orby-mobile-fx-reset-cam';
    resetCamBtn.textContent = 'Reset camera framing';
    resetCamBtn.addEventListener('click', () => {
      this.scene.resetCamera();
      this.showToast('Camera reset');
    });
    camList.append(resetCamBtn);

    camSection.append(camList);
    host.append(camSection);

    this._syncFxControlsUi();
  }

  /** @param {{ path: string, label: string, min: number, max: number, step: number, format: (v: number) => string, defaultValue?: number }} def */
  _mkFxSlider(def) {
    const row = document.createElement('label');
    row.className = 'orby-mobile-fx-grade';
    const initial = def.defaultValue ?? def.min;
    row.innerHTML = `
      <span class="orby-mobile-fx-grade__label">${def.label}</span>
      <input type="range" data-fx-path="${def.path}" min="${def.min}" max="${def.max}" step="${def.step}" value="${initial}" />
      <span class="orby-mobile-fx-grade__value" data-fx-value="${def.path}"></span>
    `;
    const input = row.querySelector('input');
    const output = row.querySelector('[data-fx-value]');
    input?.addEventListener('input', () => {
      const value = Number(input.value);
      if (output) output.textContent = def.format(value);
      this._onFxManualAdjust(def.path, value);
    });
    return row;
  }

  /** @param {string} label @param {{ inputAttrs?: string, extraClass?: string, onChange: (e: Event) => void }} opts */
  _mkFxSwitchRow(label, { inputAttrs = '', extraClass = '', onChange }) {
    const row = document.createElement('div');
    row.className = `orby-mobile-fx-toggle${extraClass ? ` ${extraClass}` : ''}`;
    row.innerHTML = `
      <span class="orby-mobile-fx-toggle__label">${label}</span>
      <label class="effect-toggle">
        <input type="checkbox" ${inputAttrs} />
        <span class="effect-indicator" aria-hidden="true"></span>
      </label>
    `;
    row.querySelector('input')?.addEventListener('change', onChange);
    return row;
  }

  /** @param {typeof MOBILE_FX_LENS_ROWS[number]} row */
  _mkFxLensSlider(row) {
    const el = document.createElement('label');
    el.className = 'orby-mobile-fx-grade';
    el.innerHTML = `
      <span class="orby-mobile-fx-grade__label">${row.label}</span>
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
      this._onFxLensAdjust(row, value);
    });
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

  _syncOrbitUi(mode) {
    this.root.querySelectorAll('[data-fx-orbit]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-fx-orbit') === mode);
    });
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
      const output = this.root.querySelector(`[data-fx-lens-value="${row.sliderPath}"]`);
      if (output instanceof HTMLElement) {
        output.textContent = row.format(value);
      }
    }

    const letterbox = this.root.querySelector('[data-fx-camera="letterbox"]');
    if (letterbox instanceof HTMLInputElement) {
      letterbox.checked = snap.letterbox;
    }
    this._syncOrbitUi(snap.autoOrbit);
  }

  /** @deprecated */
  _syncFxGradeUi() {
    this._syncFxControlsUi();
  }

  _bind() {
    this.root.querySelectorAll('[data-open-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = /** @type {MobileTab} */ (btn.getAttribute('data-open-tab'));
        this.openSheet(tab);
      });
    });

    this.root.querySelector('[data-sheet-dismiss]')?.addEventListener('click', () => {
      this.setSheetState('closed');
    });

    this.root.addEventListener('click', (e) => {
      if (this._suppressPresetClick) {
        this._suppressPresetClick = false;
        return;
      }
      const pick = e.target.closest('.orby-mobile-preset');
      if (!pick) return;
      const panel = pick.closest('[data-panel]');
      const tab = panel?.getAttribute('data-panel');
      if (tab === 'light' || tab === 'style' || tab === 'filters') {
        this._select(/** @type {PresetTab} */ (tab), pick);
        this._scrollPresetIntoView(/** @type {PresetTab} */ (tab), pick, 'smooth');
      }
    });

    this._bindHdriLongPress();

    for (const tab of /** @type {const} */ (['light', 'style', 'filters'])) {
      const track = this.root.querySelector(`[data-rail-track="${tab}"]`);
      track?.addEventListener('scroll', () => this._onPresetRailScroll(tab), { passive: true });
    }

    this.root.querySelector('[data-action="export"]')?.addEventListener('click', () => {
      void this.scene.exportImage().then(
        (result) => {
          if (result === 'shared') {
            this.showToast('Saved to Photos');
          } else if (result === 'downloaded') {
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
      );
    });

    this.fileInput?.addEventListener('change', () => {
      const file = this.fileInput?.files?.[0];
      if (!file) return;
      void this.scene.loadFile(file).then(() => {
        this.showToast(`Loaded ${file.name}`);
      });
      if (this.fileInput) this.fileInput.value = '';
    });


    this.root.querySelector('[data-action="reset-fx"]')?.addEventListener('click', () => {
      this.scene.resetFx();
      this.selection.filters = MOBILE_FX.find((x) => x.id === 'none') ?? MOBILE_FX[0];
      this._syncFxControlsUi();
      this._syncSelectionUi();
      this.showToast('Grade reset');
    });

    document.addEventListener('pointerdown', (e) => {
      if (this.sheetState === 'closed') return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('.orby-mobile-sheet') || t.closest('.orby-mobile-dock')) return;
      this._dismissHdriBrightness();
      this.setSheetState('closed');
    });
  }

  _bindHdriLongPress() {
    const track = this.root.querySelector('[data-rail-track="light"]');
    if (!track) return;

    track.addEventListener('pointerdown', (e) => this._onHdriPresetPointerDown(e));
    track.addEventListener('pointermove', (e) => this._onHdriPresetPointerMove(e));
    track.addEventListener('pointerup', (e) => this._onHdriPresetPointerUp(e));
    track.addEventListener('pointercancel', (e) => this._onHdriPresetPointerUp(e));

    this._hdriBrightnessInput?.addEventListener('input', () => {
      const value = Number(this._hdriBrightnessInput?.value ?? MOBILE_HDRI_STRENGTH_DEFAULT);
      if (this._hdriBrightnessValue instanceof HTMLElement) {
        this._hdriBrightnessValue.textContent = value.toFixed(1);
      }
      this.scene.setHdriStrength(value);
    });

    this._hdriBrightnessInput?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
  }

  /** @param {PointerEvent} e */
  _onHdriPresetPointerDown(e) {
    if (e.button !== 0) return;
    const btn = e.target.closest('.orby-mobile-preset[data-hdri]');
    if (!(btn instanceof HTMLElement)) return;

    this._clearHdriPressTimer();
    this._hdriPress = {
      timer: setTimeout(() => {
        this._hdriLongPressTriggered = true;
        this._hdriPress = null;
        this._openHdriBrightness(btn);
      }, HDRI_BRIGHTNESS_LONG_PRESS_MS),
      x: e.clientX,
      y: e.clientY,
      btn,
    };
    btn.setPointerCapture?.(e.pointerId);
  }

  /** @param {PointerEvent} e */
  _onHdriPresetPointerMove(e) {
    if (!this._hdriPress) return;
    const dx = e.clientX - this._hdriPress.x;
    const dy = e.clientY - this._hdriPress.y;
    if (Math.hypot(dx, dy) > HDRI_BRIGHTNESS_MOVE_CANCEL_PX) {
      this._clearHdriPressTimer();
    }
  }

  /** @param {PointerEvent} e */
  _onHdriPresetPointerUp(e) {
    const triggered = this._hdriLongPressTriggered;
    if (this._hdriPress) {
      const btn = this._hdriPress.btn;
      this._clearHdriPressTimer();
      btn.releasePointerCapture?.(e.pointerId);
    }
    if (triggered) {
      this._suppressPresetClick = true;
      this._hdriLongPressTriggered = false;
    }
  }

  _clearHdriPressTimer() {
    if (!this._hdriPress) return;
    clearTimeout(this._hdriPress.timer);
    this._hdriPress = null;
  }

  /** @param {HTMLElement} btn */
  _openHdriBrightness(btn) {
    this._suppressPresetClick = true;
    navigator.vibrate?.(12);

    const id = btn.getAttribute('data-hdri');
    if (id && id !== this.selection.light.id) {
      this._select('light', btn);
    }

    this._hdriBrightnessAnchor = btn;
    this._syncHdriBrightnessUi();
    this._positionHdriBrightness(btn);

    if (this._hdriBrightnessEl instanceof HTMLElement) {
      this._hdriBrightnessEl.hidden = false;
      this._hdriBrightnessEl.classList.add('is-visible');
    }

    btn.classList.add('is-brightness-open');
    this.root.querySelectorAll('.orby-mobile-preset[data-hdri]').forEach((el) => {
      if (el !== btn) el.classList.remove('is-brightness-open');
    });
  }

  _dismissHdriBrightness() {
    if (this._hdriBrightnessEl instanceof HTMLElement) {
      this._hdriBrightnessEl.hidden = true;
      this._hdriBrightnessEl.classList.remove('is-visible');
    }
    this._hdriBrightnessAnchor = null;
    this.root.querySelectorAll('.orby-mobile-preset.is-brightness-open').forEach((el) => {
      el.classList.remove('is-brightness-open');
    });
  }

  _syncHdriBrightnessUi() {
    const strength = this.scene.getHdriStrength();
    if (this._hdriBrightnessInput instanceof HTMLInputElement) {
      this._hdriBrightnessInput.min = '0';
      this._hdriBrightnessInput.max = String(MOBILE_HDRI_STRENGTH_MAX);
      this._hdriBrightnessInput.value = String(strength);
    }
    if (this._hdriBrightnessValue instanceof HTMLElement) {
      this._hdriBrightnessValue.textContent = strength.toFixed(1);
    }
  }

  /** @param {HTMLElement} anchor */
  _positionHdriBrightness(anchor) {
    if (!(this._hdriBrightnessEl instanceof HTMLElement)) return;
    const rect = anchor.getBoundingClientRect();
    const popW = this._hdriBrightnessEl.offsetWidth || 220;
    const left = Math.min(
      Math.max(12, rect.left + rect.width / 2 - popW / 2),
      window.innerWidth - popW - 12,
    );
    const bottom = window.innerHeight - rect.top + 10;
    this._hdriBrightnessEl.style.left = `${left}px`;
    this._hdriBrightnessEl.style.bottom = `${bottom}px`;
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
    if (tab === 'fx') {
      this.setSheetState('expanded');
      return;
    }
    this.setSheetState('peek');
    requestAnimationFrame(() => {
      this._scrollRailToSelection(/** @type {PresetTab} */ (tab));
    });
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
      this._dismissHdriBrightness();
    }
    this.sheetState = state;
    this.root.dataset.sheet = state;
    this._syncDockTabState();
    const scrim = this.root.querySelector('.orby-mobile-scrim');
    if (scrim instanceof HTMLElement) {
      scrim.hidden = state === 'closed';
    }
  }

  /** @param {PresetTab} tab @param {HTMLElement} pick */
  _select(tab, pick) {
    const catalog = this._catalogForTab(tab);
    const attr = this._dataAttrForTab(tab);
    const id = pick.getAttribute(attr);
    const item = catalog.find((x) => x.id === id);
    if (!item) return;

    this.selection[tab] = item;

    if (tab === 'light') {
      if (this._hdriBrightnessEl && !this._hdriBrightnessEl.hidden) {
        this._dismissHdriBrightness();
      }
      void this.scene.setHdri(item.id);
    }
    if (tab === 'style') {
      const lookId = item.id === 'standard' ? 'none' : item.id;
      this.scene.setCreativeLook(lookId);
    }
    if (tab === 'filters') {
      this.scene.applyLookFilter(item.id);
      this._syncFxControlsUi();
    }

    this._syncSelectionUi();
  }

  /** @param {PresetTab} tab @param {HTMLElement} el @param {ScrollBehavior} [behavior] */
  _scrollPresetIntoView(tab, el, behavior = 'auto') {
    const track = this.root.querySelector(`[data-rail-track="${tab}"]`);
    if (!(track instanceof HTMLElement) || !(el instanceof HTMLElement)) return;
    const trackRect = track.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const anchorX = trackRect.left + MOBILE_PRESET_RAIL_INSET;
    const delta = elRect.left - anchorX;
    track.scrollTo({ left: track.scrollLeft + delta, behavior });
  }

  /** @param {PresetTab} tab */
  _scrollRailToSelection(tab) {
    const id = this.selection[tab].id;
    const attr = this._dataAttrForTab(tab);
    const el = this.root.querySelector(`[data-rail-track="${tab}"] [${attr}="${CSS.escape(id)}"]`);
    if (el instanceof HTMLElement) {
      this._scrollPresetIntoView(tab, el, 'auto');
    }
  }

  /** @param {PresetTab} tab */
  _onPresetRailScroll(tab) {
    if (this.activeTab !== tab || this.sheetState === 'closed') return;
    this._railScrollingTab = tab;
    clearTimeout(this._railScrollTimer);
    this._railScrollTimer = setTimeout(() => {
      this._railScrollTimer = null;
      if (this._railScrollingTab !== tab) return;
      this._applyRailLeadingSelection(tab);
    }, 90);
  }

  /** @param {PresetTab} tab */
  _applyRailLeadingSelection(tab) {
    const track = this.root.querySelector(`[data-rail-track="${tab}"]`);
    if (!(track instanceof HTMLElement)) return;
    const leading = this._getRailLeadingPreset(track);
    if (!leading) return;
    const currentId = this.selection[tab].id;
    const attr = this._dataAttrForTab(tab);
    const nextId = leading.getAttribute(attr);
    if (!nextId || nextId === currentId) return;
    this._select(tab, leading);
  }

  /** @param {HTMLElement} track */
  _getRailLeadingPreset(track) {
    const trackRect = track.getBoundingClientRect();
    const anchorX = trackRect.left + MOBILE_PRESET_RAIL_INSET;
    let best = null;
    let bestDist = Infinity;
    for (const child of track.children) {
      if (!(child instanceof HTMLElement)) continue;
      const rect = child.getBoundingClientRect();
      const dist = Math.abs(rect.left - anchorX);
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
    }
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
