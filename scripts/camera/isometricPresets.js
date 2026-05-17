/**
 * Isometric camera presets — horizontal azimuth (°) and vertical elevation (° from ground).
 */

export const TRUE_ISOMETRIC_ELEVATION_DEG =
  (Math.atan(1 / Math.sqrt(2)) * 180) / Math.PI;

export const ISOMETRIC_PRESETS = [
  {
    id: 'true-isometric',
    title: 'True iso',
    subtitle: '45° / 35.26°',
    horizontalDeg: 45,
    verticalDeg: TRUE_ISOMETRIC_ELEVATION_DEG,
  },
  {
    id: 'dimetric',
    title: 'Dimetric',
    subtitle: '45° / 30° — RTS',
    horizontalDeg: 45,
    verticalDeg: 30,
  },
  {
    id: 'high-oblique',
    title: 'High Oblique',
    subtitle: '45° / 60° — City Builder',
    horizontalDeg: 45,
    verticalDeg: 60,
  },
  {
    id: 'pixel-2-1',
    title: '2:1 pixel',
    subtitle: 'Pixel-perfect',
    horizontalDeg: 45,
    verticalDeg: (Math.atan(0.5) * 180) / Math.PI,
  },
];

export const ISOMETRIC_PRESET_BY_ID = Object.fromEntries(
  ISOMETRIC_PRESETS.map((p) => [p.id, p]),
);

/** Azimuth step for Camera → Isometric → Rotate 45°. */
export const ISOMETRIC_ORBIT_STEP_DEG = 45;

export const DEFAULT_ISOMETRIC_STATE = {
  enabled: false,
  presetId: 'true-isometric',
  horizontalDeg: 45,
  verticalDeg: TRUE_ISOMETRIC_ELEVATION_DEG,
  /** When true, right-drag pans the orbit target while isometric angles stay locked. */
  panUnlocked: false,
};

export function normalizeIsometricState(raw = {}) {
  const base = { ...DEFAULT_ISOMETRIC_STATE };
  const src = raw && typeof raw === 'object' ? raw : {};
  const enabled = !!src.enabled;
  let presetId = src.presetId;
  if (presetId && !ISOMETRIC_PRESET_BY_ID[presetId]) {
    presetId = enabled ? 'true-isometric' : null;
  }
  if (enabled && !presetId) {
    presetId = 'true-isometric';
  }
  const preset = presetId ? ISOMETRIC_PRESET_BY_ID[presetId] : null;

  const horizontalDeg = Number(
    src.horizontalDeg ?? preset?.horizontalDeg ?? base.horizontalDeg,
  );
  const verticalDeg = Number(
    src.verticalDeg ?? preset?.verticalDeg ?? base.verticalDeg,
  );

  const h = Number.isFinite(horizontalDeg) ? horizontalDeg : base.horizontalDeg;
  const v = Number.isFinite(verticalDeg) ? verticalDeg : base.verticalDeg;
  const matchedPreset = enabled ? inferIsometricPresetId(h, v) : null;

  return {
    enabled,
    presetId: enabled
      ? matchedPreset
      : presetId && ISOMETRIC_PRESET_BY_ID[presetId]
        ? presetId
        : null,
    horizontalDeg: h,
    verticalDeg: v,
    panUnlocked: !!src.panUnlocked,
  };
}

/** Advance stored azimuth by one isometric orbit step (degrees). */
export function stepIsometricHorizontalDeg(
  currentDeg,
  stepDeg = ISOMETRIC_ORBIT_STEP_DEG,
) {
  const raw = Number(currentDeg);
  const base = Number.isFinite(raw) ? raw : 0;
  const step = Number(stepDeg);
  if (!Number.isFinite(step)) return base;
  return base + step;
}

export function isometricAnglesMatchPreset(horizontalDeg, verticalDeg, presetId) {
  const preset = presetId ? ISOMETRIC_PRESET_BY_ID[presetId] : null;
  if (!preset) return false;
  const h = Number(horizontalDeg);
  const v = Number(verticalDeg);
  if (!Number.isFinite(h) || !Number.isFinite(v)) return false;
  return (
    Math.abs(h - preset.horizontalDeg) < 0.05 &&
    Math.abs(v - preset.verticalDeg) < 0.05
  );
}

export function inferIsometricPresetId(horizontalDeg, verticalDeg) {
  for (const preset of ISOMETRIC_PRESETS) {
    if (isometricAnglesMatchPreset(horizontalDeg, verticalDeg, preset.id)) {
      return preset.id;
    }
  }
  return null;
}
