/** @typedef {'autoRotate' | 'autoOrbit' | 'handheld' | 'displayMode' | 'mapPreview'} ModeToastKind */

export const MODE_CHANGE_TOAST_DURATION_MS = 2000;

const MODE_PREFIX = {
  autoRotate: 'Turntable',
  autoOrbit: 'Auto orbit',
  handheld: 'Handheld',
  displayMode: 'Display',
  mapPreview: 'Map preview',
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
  displayMode: {
    shaded: 'Shaded',
    textures: 'Unlit',
    clay: 'Clay',
    wireframe: 'Wireframe',
  },
};

/**
 * @param {ModeToastKind} kind
 * @param {number | string} rawValue
 * @param {{ mapPreviewCleared?: boolean }} [options]
 * @returns {string | null}
 */
export function formatModeChangeToastMessage(kind, rawValue, options = {}) {
  const prefix = MODE_PREFIX[kind];
  if (!prefix) return null;

  if (kind === 'displayMode') {
    const label = MODE_LABELS.displayMode[String(rawValue ?? '')];
    if (!label) return null;
    const base = `${prefix} · ${label}`;
    return options.mapPreviewCleared ? `${base} — map preview ended` : base;
  }

  if (kind === 'mapPreview') {
    if (rawValue === 'cleared') return `${prefix} · Cleared`;
    const label = typeof rawValue === 'string' && rawValue ? rawValue : null;
    if (!label) return null;
    return `${prefix} · ${label}`;
  }

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
