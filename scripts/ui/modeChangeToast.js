/** @typedef {'autoRotate' | 'autoOrbit' | 'handheld'} ModeToastKind */

export const MODE_CHANGE_TOAST_DURATION_MS = 2000;

const MODE_PREFIX = {
  autoRotate: 'Auto rotate',
  autoOrbit: 'Auto orbit',
  handheld: 'Handheld',
};

const MODE_LABELS = {
  autoRotate: {
    0: 'Off',
    0.2: 'Normal',
    0.5: 'Fast',
  },
  autoOrbit: {
    off: 'Off',
    slow: 'Slow',
    fast: 'Fast',
  },
  handheld: {
    off: 'Off',
    low: 'Subtle',
    high: 'Strong',
    medium: 'Strong',
  },
};

/**
 * @param {ModeToastKind} kind
 * @param {number | string} rawValue
 * @returns {string | null}
 */
export function formatModeChangeToastMessage(kind, rawValue) {
  const prefix = MODE_PREFIX[kind];
  if (!prefix) return null;

  let value = rawValue;
  if (kind === 'autoRotate') {
    value = Number(value) || 0;
  } else if (kind === 'handheld' && value === 'medium') {
    value = 'high';
  } else {
    value = String(value ?? 'off');
  }

  const label = MODE_LABELS[kind]?.[value];
  if (!label) return null;
  return `${prefix} · ${label}`;
}

/**
 * @param {ModeToastKind} kind
 * @returns {string}
 */
export function modeChangeToastGroupKey(kind) {
  return `mode:${kind}`;
}
