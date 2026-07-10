import {
  MODIFIER_IDS,
  modifierActiveFromAmount,
  normalizeModifiersState,
} from '../state/defaults/modifierDefaults.js';
import { isShapeLibraryModel } from '../shapeLibrary/shapeLibraryCatalog.js';

/**
 * Object tab — mesh modifier amount sliders (Shape Library only). Non-zero amount = active.
 */
export class ModifierControls {
  /**
   * @param {import('../EventBus.js').EventBus} eventBus
   * @param {import('../StateStore.js').StateStore} stateStore
   * @param {import('../UIManager.js').UIManager} ui
   * @param {import('./UIHelpers.js').UIHelpers} helpers
   */
  constructor(eventBus, stateStore, ui, helpers) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = ui;
    this.helpers = helpers;
    this.subsection = document.querySelector('[data-subsection="modifiers"]');
    this.amountInputs = {};
    for (const id of MODIFIER_IDS) {
      this.amountInputs[id] = document.getElementById(`modifier${capitalize(id)}Amount`);
    }
  }

  bind() {
    for (const id of MODIFIER_IDS) {
      const input = this.amountInputs[id];
      if (!input) continue;
      input.addEventListener('input', (event) => {
        if (!this._isEligible()) return;
        const raw = parseFloat(event.target.value);
        const amount = Number.isFinite(raw) ? Math.round(raw) : 0;
        const enabled = modifierActiveFromAmount(amount);
        this.helpers.updateValueLabel(`modifier${capitalize(id)}Amount`, amount, 'signedInteger');
        this.stateStore.batch(() => {
          this.stateStore.set(`modifiers.${id}.amount`, amount);
          this.stateStore.set(`modifiers.${id}.enabled`, enabled);
        });
        this.eventBus.emit('mesh:modifier-amount', { id, amount });
        this.eventBus.emit('ui:reset-section-touched', 'modifiers');
      });
      this.helpers.enableSliderKeyboardStepping(input);
    }

    this.sync(this.stateStore.getState());
  }

  /** @returns {boolean} */
  _isEligible() {
    return isShapeLibraryModel(window.orby?.scene?.currentModel);
  }

  /**
   * @param {object} state
   */
  sync(state) {
    const eligible = this._isEligible();
    if (this.subsection) this.subsection.hidden = !eligible;
    if (!eligible) return;

    const modifiers = normalizeModifiersState(state?.modifiers);
    for (const id of MODIFIER_IDS) {
      const mod = modifiers[id] ?? { enabled: false, amount: 0 };
      const input = this.amountInputs[id];
      if (input) {
        const amount = Number(mod.amount) || 0;
        input.value = String(amount);
        this.helpers.updateValueLabel(`modifier${capitalize(id)}Amount`, amount, 'signedInteger');
        this.helpers.updateSliderFill(input);
      }
    }
  }
}

/** @param {string} id */
function capitalize(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}
