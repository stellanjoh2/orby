import { MOBILE_MATERIAL_SLIDERS } from '../mobileMaterialControls.js';
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
    host.append(this._mkAutoRotateToggle());
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

    const autoRotateInput = root.querySelector('[data-object-auto-rotate]');
    if (autoRotateInput instanceof HTMLInputElement && document.activeElement !== autoRotateInput) {
      autoRotateInput.checked = !!scene?.getAutoRotate?.();
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
}
