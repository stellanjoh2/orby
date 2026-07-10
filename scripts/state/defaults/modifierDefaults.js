/** Object mesh modifier defaults — Bend, Twist, Taper, Skew, FFD. */
export const MODIFIER_IDS = ['bend', 'twist', 'taper', 'skew', 'ffd'];

/** @typedef {{ enabled: boolean, amount: number }} ModifierState */

/** @param {unknown} amount */
export function modifierActiveFromAmount(amount) {
  return (Number(amount) || 0) !== 0;
}

/**
 * @param {Record<string, Partial<ModifierState>> | null | undefined} modifiers
 * @returns {Record<string, ModifierState>}
 */
export function normalizeModifiersState(modifiers) {
  const defaults = createModifierEntryDefaults();
  const normalized = { ...defaults };
  for (const id of MODIFIER_IDS) {
    const amount = Number(modifiers?.[id]?.amount) || 0;
    normalized[id] = {
      amount,
      enabled: modifierActiveFromAmount(amount),
    };
  }
  return normalized;
}

/** @returns {Record<string, ModifierState>} */
export function createModifierEntryDefaults() {
  return {
    bend: { enabled: false, amount: 0 },
    twist: { enabled: false, amount: 0 },
    taper: { enabled: false, amount: 0 },
    skew: { enabled: false, amount: 0 },
    ffd: { enabled: false, amount: 0 },
  };
}

export function createModifierDefaults() {
  return {
    modifiers: createModifierEntryDefaults(),
  };
}

/**
 * @param {Record<string, Partial<ModifierState>> | null | undefined} modifiers
 * @returns {boolean}
 */
export function hasActiveModifiers(modifiers) {
  const normalized = normalizeModifiersState(modifiers);
  return MODIFIER_IDS.some((id) => normalized[id].enabled);
}
