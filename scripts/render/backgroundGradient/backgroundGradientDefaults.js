import { ORBY_BLACK } from '../../constants.js';

/** @typedef {{ color: string, position: number }} BackgroundGradientStop */
/** @typedef {{ enabled: boolean, type: 'linear' | 'radial', angle: number, centerX: number, centerY: number, stops: BackgroundGradientStop[] }} BackgroundGradientConfig */

export const MAX_BACKGROUND_GRADIENT_STOPS = 3;

export const DEFAULT_BACKGROUND_GRADIENT = Object.freeze({
  enabled: false,
  type: 'linear',
  angle: 180,
  centerX: 50,
  centerY: 50,
  stops: Object.freeze([
    { color: ORBY_BLACK, position: 0 },
    { color: '#c4ff00', position: 100 },
  ]),
});

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function normalizeHex(color, fallback = ORBY_BLACK) {
  const raw = String(color ?? '').trim();
  if (HEX_RE.test(raw)) return raw.toLowerCase();
  if (raw.startsWith('#') && raw.length === 4) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

function normalizeStop(stop, index, fallbackColor) {
  const color = normalizeHex(stop?.color, fallbackColor);
  const position = Number.isFinite(Number(stop?.position))
    ? Math.min(100, Math.max(0, Number(stop.position)))
    : index === 0
      ? 0
      : 100;
  return { color, position };
}

/**
 * @param {BackgroundGradientStop[]} stops
 * @returns {BackgroundGradientStop[]}
 */
export function sortedBackgroundGradientStops(stops) {
  return [...stops].sort((a, b) => a.position - b.position);
}

/**
 * @param {Partial<BackgroundGradientConfig> | null | undefined} config
 * @returns {BackgroundGradientConfig}
 */
export function normalizeBackgroundGradient(config) {
  const base = DEFAULT_BACKGROUND_GRADIENT;
  const type = config?.type === 'radial' ? 'radial' : 'linear';
  const angle = Number.isFinite(Number(config?.angle))
    ? ((Number(config.angle) % 360) + 360) % 360
    : base.angle;
  const centerX = Number.isFinite(Number(config?.centerX))
    ? Math.min(100, Math.max(0, Number(config.centerX)))
    : base.centerX;
  const centerY = Number.isFinite(Number(config?.centerY))
    ? Math.min(100, Math.max(0, Number(config.centerY)))
    : base.centerY;

  const rawStops = Array.isArray(config?.stops) ? config.stops : base.stops;
  let stops = rawStops
    .map((stop, index) => normalizeStop(stop, index, base.stops[0].color));

  if (stops.length > MAX_BACKGROUND_GRADIENT_STOPS) {
    stops = sortedBackgroundGradientStops(stops).slice(0, MAX_BACKGROUND_GRADIENT_STOPS);
  }

  if (stops.length < 2) {
    return {
      enabled: !!config?.enabled,
      type,
      angle,
      centerX,
      centerY,
      stops: base.stops.map((stop) => ({ ...stop })),
    };
  }

  return {
    enabled: !!config?.enabled,
    type,
    angle,
    centerX,
    centerY,
    stops,
  };
}

/**
 * @param {BackgroundGradientConfig} config
 * @returns {string}
 */
export function getBackgroundGradientFallbackColor(config) {
  const normalized = normalizeBackgroundGradient(config);
  const stops = sortedBackgroundGradientStops(normalized.stops);
  return stops[0]?.color ?? ORBY_BLACK;
}
