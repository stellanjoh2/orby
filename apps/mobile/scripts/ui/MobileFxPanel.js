import { MOBILE_FX } from '../mobileCatalog.js';
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
} from '../mobileFxControls.js';
import { updateMobileSliderFill } from '../mobileSliderHelpers.js';
import { createMobilePanelResetBtn } from './mobilePanelHelpers.js';

/** @import { MobileUiContext } from '../mobileUiContext.js' */

export class MobileFxPanel {
  /** @param {MobileUiContext} ctx */
  constructor(ctx) {
    this.ctx = ctx;
  }

  render() {
    const host = this.ctx.root.querySelector('[data-fx-controls]');
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

    const resetBtn = createMobilePanelResetBtn('Reset grade', () => this.resetGrade());
    host.append(resetBtn);

    this.sync();
  }

  resetGrade() {
    const { scene, selection, engagedPresetTabs, showToast, syncSelectionUi } = this.ctx;
    scene.resetFx();
    selection.filters = MOBILE_FX.find((x) => x.id === 'none') ?? MOBILE_FX[0];
    engagedPresetTabs.delete('filters');
    this.sync();
    syncSelectionUi();
    showToast('Grade reset');
  }

  sync() {
    const { root, scene } = this.ctx;
    const snap = scene.getFxSnapshot();
    const state = snap.state ?? {};

    root.querySelectorAll('[data-fx-path]').forEach((el) => {
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
        updateMobileSliderFill(el);
        const output = root.querySelector(`[data-fx-value="${path}"]`);
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
      const el = root.querySelector(`[data-fx-lens="${row.sliderPath}"]`);
      if (!(el instanceof HTMLInputElement)) continue;
      const value = getMobileLensSliderUiValue(state, row);
      el.value = String(value);
      updateMobileSliderFill(el);
      const output = root.querySelector(`[data-fx-lens-value="${row.sliderPath}"]`);
      if (output instanceof HTMLElement) {
        output.textContent = row.format(value);
      }
    }

    for (const def of MOBILE_FX_BLOOM_SLIDERS) {
      const el = root.querySelector(`[data-fx-bloom="${def.path}"]`);
      if (!(el instanceof HTMLInputElement)) continue;
      const value = def.path === 'bloom.strength'
        ? getMobileBloomIntensityUiValue(state)
        : Number(getNestedValue(state, def.path) ?? def.defaultValue ?? def.min);
      el.value = String(value);
      updateMobileSliderFill(el);
      const output = root.querySelector(`[data-fx-bloom-value="${def.path}"]`);
      if (output instanceof HTMLElement) {
        output.textContent = def.format(value);
      }
    }
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
      updateMobileSliderFill(input);
      this._onManualAdjust(def.path, value);
    });
    if (input instanceof HTMLInputElement) updateMobileSliderFill(input);
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
      if (input instanceof HTMLInputElement) updateMobileSliderFill(input);
      this._onBloomAdjust(def.path, value);
    });
    if (input instanceof HTMLInputElement) updateMobileSliderFill(input);
    return row;
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
      if (input instanceof HTMLInputElement) updateMobileSliderFill(input);
      this._onLensAdjust(row, value);
    });
    if (input instanceof HTMLInputElement) updateMobileSliderFill(input);
    return el;
  }

  /** @param {string} path @param {number} value */
  _onBloomAdjust(path, value) {
    const { scene, selection, engagedPresetTabs, syncSelectionUi } = this.ctx;
    applyMobileBloomSliderValue(scene, path, value);
    selection.filters = MOBILE_FX.find((x) => x.id === 'none') ?? MOBILE_FX[0];
    engagedPresetTabs.delete('filters');
    syncSelectionUi();
  }

  /** @param {typeof MOBILE_FX_LENS_ROWS[number]} row @param {number} value */
  _onLensAdjust(row, value) {
    const { scene, selection, engagedPresetTabs, syncSelectionUi } = this.ctx;
    applyMobileLensSliderValue(scene, row, value);
    selection.filters = MOBILE_FX.find((x) => x.id === 'none') ?? MOBILE_FX[0];
    engagedPresetTabs.delete('filters');
    syncSelectionUi();
  }

  /** @param {string} path @param {number | boolean} value @param {{ preservePreset?: boolean }} [opts] */
  _onManualAdjust(path, value, opts) {
    const { scene, selection, engagedPresetTabs, syncSelectionUi } = this.ctx;
    scene.setFxValue(path, value);
    if (!opts?.preservePreset) {
      selection.filters = MOBILE_FX.find((x) => x.id === 'none') ?? MOBILE_FX[0];
      engagedPresetTabs.delete('filters');
      syncSelectionUi();
    }
  }
}
