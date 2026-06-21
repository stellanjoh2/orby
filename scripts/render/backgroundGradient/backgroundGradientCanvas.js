import { normalizeBackgroundGradient, sortedBackgroundGradientStops } from './backgroundGradientDefaults.js';

/**
 * CSS-compatible linear gradient angle: 0deg = up, 90deg = right.
 * @param {number} cssAngleDeg
 * @param {number} width
 * @param {number} height
 */
function linearGradientEndpoints(cssAngleDeg, width, height) {
  const rad = ((cssAngleDeg - 90) * Math.PI) / 180;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const len = Math.hypot(width, height) * 0.5;
  return {
    x0: cx - Math.cos(rad) * len,
    y0: cy - Math.sin(rad) * len,
    x1: cx + Math.cos(rad) * len,
    y1: cy + Math.sin(rad) * len,
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {import('./backgroundGradientDefaults.js').BackgroundGradientConfig} config
 * @param {CanvasGradient} gradient
 */
function fillCanvasGradient(ctx, width, height, config, gradient, { invertStops = false } = {}) {
  for (const stop of sortedBackgroundGradientStops(config.stops)) {
    const t = stop.position / 100;
    gradient.addColorStop(invertStops ? 1 - t : t, stop.color);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Draw a multi-stop gradient into a 2D canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {import('./backgroundGradientDefaults.js').BackgroundGradientConfig} config
 */
export function drawBackgroundGradient(ctx, width, height, config) {
  const normalized = normalizeBackgroundGradient(config);
  ctx.clearRect(0, 0, width, height);

  let gradient;
  if (normalized.type === 'radial') {
    const cx = (normalized.centerX / 100) * width;
    const cy = (normalized.centerY / 100) * height;
    const radius = Math.max(width, height) * 0.75;
    gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    // Stop strip is 0% left → 100% right; radial maps 100% to center, 0% to edge.
    fillCanvasGradient(ctx, width, height, normalized, gradient, { invertStops: true });
  } else {
    const { x0, y0, x1, y1 } = linearGradientEndpoints(normalized.angle, width, height);
    gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    fillCanvasGradient(ctx, width, height, normalized, gradient);
  }
}

/**
 * Horizontal stop strip for the gradient editor — maps stop position 0–100% left-to-right
 * regardless of linear angle or radial type (the scene uses {@link drawBackgroundGradient}).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {import('./backgroundGradientDefaults.js').BackgroundGradientConfig} config
 */
export function drawBackgroundGradientStopStrip(ctx, width, height, config) {
  const normalized = normalizeBackgroundGradient(config);
  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  fillCanvasGradient(ctx, width, height, normalized, gradient);
}

/**
 * Sample an approximate RGB hex at a horizontal position (0–1) for new stop placement.
 * @param {import('./backgroundGradientDefaults.js').BackgroundGradientConfig} config
 * @param {number} t01
 * @returns {string}
 */
export function sampleGradientColorAt(config, t01) {
  const normalized = normalizeBackgroundGradient(config);
  const t = Math.min(1, Math.max(0, t01)) * 100;
  const stops = sortedBackgroundGradientStops(normalized.stops);
  if (stops.length === 0) return '#808080';
  if (t <= stops[0].position) return stops[0].color;
  if (t >= stops.at(-1).position) return stops.at(-1).color;

  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a.position && t <= b.position) {
      const span = b.position - a.position || 1;
      const mix = (t - a.position) / span;
      return mixHexColors(a.color, b.color, mix);
    }
  }
  return stops[0].color;
}

function mixHexColors(a, b, t) {
  const parse = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
