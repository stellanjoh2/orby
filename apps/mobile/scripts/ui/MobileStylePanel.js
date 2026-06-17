import {
  MOBILE_STYLE_SLIDERS,
  isMobileStyleSliderMuted,
  mobileStyleSliderBounds,
  resolveMobileStyleSliderValue,
} from '../mobileStyleControls.js';
import { updateMobileSliderFill } from '../mobileSliderHelpers.js';
import { createMobilePanelResetBtn } from './mobilePanelHelpers.js';

/** @import { MobileUiContext } from '../mobileUiContext.js' */

export class MobileStylePanel {
  /** @param {MobileUiContext} ctx */
  constructor(ctx) {
    this.ctx = ctx;
  }

  render() {
    const host = this.ctx.root.querySelector('[data-style-controls]');
    if (!host) return;

    host.replaceChildren();

    for (const def of MOBILE_STYLE_SLIDERS) {
      host.append(this._mkStyleSlider(def));
    }
    const resetBtn = createMobilePanelResetBtn('Reset shaders', () => this.resetSliders());
    resetBtn.dataset.styleReset = '';
    host.append(resetBtn);
  }

  resetSliders() {
    const { scene, showToast } = this.ctx;
    if (!scene.resetCreativeLookSliders()) return;
    this.sync();
    showToast('Shaders reset');
  }

  sync() {
    const { root, scene, selection, engagedPresetTabs, syncPresetSheetState } = this.ctx;
    const host = root.querySelector('[data-style-controls]');
    const styleActive =
      engagedPresetTabs.has('style') &&
      selection.style.id !== 'none' &&
      selection.style.id !== 'standard';
    root.dataset.stylePanel = styleActive ? 'controls' : 'presets-only';
    if (host instanceof HTMLElement) {
      host.hidden = !styleActive;
      host.classList.toggle('is-visible', styleActive);
    }

    const preset = styleActive ? selection.style.id : null;
    const cl = scene.getCreativeLookSettings();

    for (const def of MOBILE_STYLE_SLIDERS) {
      const row = host?.querySelector(`[data-style-path="${def.path}"]`)?.closest('.orby-mobile-fx-grade');
      const input = host?.querySelector(`[data-style-path="${def.path}"]`);
      const output = host?.querySelector(`[data-style-value="${def.path}"]`);
      if (!(input instanceof HTMLInputElement)) continue;

      const muted = isMobileStyleSliderMuted(preset, def.path);
      if (row instanceof HTMLElement) {
        row.hidden = muted;
      }
      if (muted) continue;

      const bounds = mobileStyleSliderBounds(preset, def.path);
      input.min = String(bounds.min);
      input.max = String(bounds.max);
      input.step = String(bounds.step);

      const value = resolveMobileStyleSliderValue(preset, def.path, cl[def.path]);
      input.value = String(value);
      input.disabled = !styleActive;
      if (output instanceof HTMLElement) {
        output.textContent = def.format(value);
      }
      updateMobileSliderFill(input);
    }

    const resetBtn = host?.querySelector('[data-style-reset]');
    if (resetBtn instanceof HTMLButtonElement) {
      resetBtn.disabled = !styleActive;
    }

    syncPresetSheetState();
  }

  /** @param {typeof MOBILE_STYLE_SLIDERS[number]} def */
  _mkStyleSlider(def) {
    const { scene } = this.ctx;
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
      updateMobileSliderFill(input);
      scene.setCreativeLookValue(def.path, value);
    });
    if (input instanceof HTMLInputElement) updateMobileSliderFill(input);
    return row;
  }
}
