import { MOBILE_MATERIAL_SLIDERS } from '../mobileMaterialControls.js';
import { MOBILE_BASE_SCALE } from '../mobileObjectBaseControls.js';
import { updateMobileSliderFill } from '../mobileSliderHelpers.js';

/** @import { MobileUiContext } from '../mobileUiContext.js' */

export class MobileObjectPanel {
  /** @param {MobileUiContext} ctx */
  constructor(ctx) {
    this.ctx = ctx;
  }

  render() {
    const host = this.ctx.root.querySelector('[data-object-controls]');
    if (!host) return;

    host.replaceChildren();
    host.append(...MOBILE_MATERIAL_SLIDERS.map((def) => this._mkMaterialSlider(def)));
    host.append(this._mkBaseScaleSlider());
    host.append(this._mkBaseGlassToggle());
    host.append(this._mkAutoRotateToggle());
    host.append(this._mkAmbientOcclusionToggle());
    this.sync();
  }

  sync() {
    const { root, scene } = this.ctx;
    const material = scene?.getMaterialSettings?.() ?? {};

    for (const def of MOBILE_MATERIAL_SLIDERS) {
      const el = root.querySelector(`[data-material-path="${def.path}"]`);
      if (!(el instanceof HTMLInputElement)) continue;
      if (document.activeElement === el) continue;
      const value = material[def.path];
      if (typeof value !== 'number') continue;
      el.value = String(value);
      updateMobileSliderFill(el);
      const output = root.querySelector(`[data-material-value="${def.path}"]`);
      if (output instanceof HTMLElement) {
        output.textContent = def.format(value);
      }
    }

    const baseScale = scene?.getBaseScale?.() ?? MOBILE_BASE_SCALE.defaultValue;
    const baseOn = baseScale > 0;

    const baseScaleInput = root.querySelector('[data-object-base-scale]');
    if (baseScaleInput instanceof HTMLInputElement && document.activeElement !== baseScaleInput) {
      baseScaleInput.value = String(baseScale);
      updateMobileSliderFill(baseScaleInput);
      const output = root.querySelector('[data-object-base-scale-value]');
      if (output instanceof HTMLElement) {
        output.textContent = MOBILE_BASE_SCALE.format(baseScale);
      }
    }

    const baseGlassRow = root.querySelector('[data-object-base-glass-row]');
    if (baseGlassRow instanceof HTMLElement) {
      baseGlassRow.classList.toggle('is-muted', !baseOn);
    }

    const baseGlassInput = root.querySelector('[data-object-base-glass]');
    if (baseGlassInput instanceof HTMLInputElement) {
      if (document.activeElement !== baseGlassInput) {
        baseGlassInput.checked = !!scene?.getBaseGlassSurface?.();
      }
      baseGlassInput.disabled = !baseOn;
    }

    const autoRotateInput = root.querySelector('[data-object-auto-rotate]');
    if (autoRotateInput instanceof HTMLInputElement && document.activeElement !== autoRotateInput) {
      autoRotateInput.checked = !!scene?.getAutoRotate?.();
    }

    const aoInput = root.querySelector('[data-object-ambient-occlusion]');
    if (aoInput instanceof HTMLInputElement && document.activeElement !== aoInput) {
      aoInput.checked = !!scene?.getAmbientOcclusion?.()?.enabled;
    }
  }

  /** @param {typeof MOBILE_MATERIAL_SLIDERS[number]} def */
  _mkMaterialSlider(def) {
    const { scene } = this.ctx;
    const row = document.createElement('label');
    row.className = 'orby-mobile-fx-grade slider-line';
    const initial = def.defaultValue ?? def.min;
    row.innerHTML = `
      <span class="orby-mobile-fx-grade__label slider-line-label">${def.label}</span>
      <input type="range" data-material-path="${def.path}" min="${def.min}" max="${def.max}" step="${def.step}" value="${initial}" />
      <span class="orby-mobile-fx-grade__value" data-material-value="${def.path}"></span>
    `;
    const input = row.querySelector('input');
    const output = row.querySelector('[data-material-value]');
    input?.addEventListener('input', () => {
      const value = Number(input.value);
      if (output) output.textContent = def.format(value);
      updateMobileSliderFill(input);
      scene.setMaterialValue(def.path, value);
    });
    if (input instanceof HTMLInputElement) updateMobileSliderFill(input);
    return row;
  }

  _mkBaseScaleSlider() {
    const { scene } = this.ctx;
    const def = MOBILE_BASE_SCALE;
    const row = document.createElement('label');
    row.className = 'orby-mobile-fx-grade slider-line';
    row.innerHTML = `
      <span class="orby-mobile-fx-grade__label slider-line-label">${def.label}</span>
      <input type="range" data-object-base-scale min="${def.min}" max="${def.max}" step="${def.step}" value="${def.defaultValue}" />
      <span class="orby-mobile-fx-grade__value" data-object-base-scale-value></span>
    `;
    const input = row.querySelector('input');
    const output = row.querySelector('[data-object-base-scale-value]');
    input?.addEventListener('input', () => {
      if (!(input instanceof HTMLInputElement)) return;
      const value = Number(input.value);
      if (output) output.textContent = def.format(value);
      updateMobileSliderFill(input);
      scene.setBaseScale(value);
    });
    if (input instanceof HTMLInputElement) updateMobileSliderFill(input);
    return row;
  }

  _mkBaseGlassToggle() {
    const { scene } = this.ctx;
    const row = document.createElement('div');
    row.className = 'orby-mobile-fx-toggle';
    row.dataset.objectBaseGlassRow = '';
    row.innerHTML = `
      <span class="orby-mobile-fx-toggle__label">Base glass</span>
      <label class="effect-toggle">
        <input type="checkbox" data-object-base-glass />
        <span class="effect-indicator" aria-hidden="true"></span>
        <span class="orby-mobile-sr-only">Base glass</span>
      </label>
    `;
    const input = row.querySelector('[data-object-base-glass]');
    input?.addEventListener('change', () => {
      if (!(input instanceof HTMLInputElement)) return;
      scene.setBaseGlassSurface(input.checked);
    });
    return row;
  }

  _mkAutoRotateToggle() {
    const { scene } = this.ctx;
    const row = document.createElement('div');
    row.className = 'orby-mobile-fx-toggle';
    row.innerHTML = `
      <span class="orby-mobile-fx-toggle__label">Auto-rotate</span>
      <label class="effect-toggle">
        <input type="checkbox" data-object-auto-rotate />
        <span class="effect-indicator" aria-hidden="true"></span>
        <span class="orby-mobile-sr-only">Auto-rotate object</span>
      </label>
    `;
    const input = row.querySelector('[data-object-auto-rotate]');
    input?.addEventListener('change', () => {
      if (!(input instanceof HTMLInputElement)) return;
      scene.setAutoRotate(input.checked);
    });
    return row;
  }

  _mkAmbientOcclusionToggle() {
    const { scene } = this.ctx;
    const row = document.createElement('div');
    row.className = 'orby-mobile-fx-toggle';
    row.innerHTML = `
      <span class="orby-mobile-fx-toggle__label">Ambient occlusion</span>
      <label class="effect-toggle">
        <input type="checkbox" data-object-ambient-occlusion />
        <span class="effect-indicator" aria-hidden="true"></span>
        <span class="orby-mobile-sr-only">Ambient occlusion</span>
      </label>
    `;
    const input = row.querySelector('[data-object-ambient-occlusion]');
    input?.addEventListener('change', () => {
      if (!(input instanceof HTMLInputElement)) return;
      scene.setAmbientOcclusionEnabled(input.checked);
    });
    return row;
  }
}
