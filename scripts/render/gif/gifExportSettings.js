/**
 * GIF video-export limits (Mozayk-style: gifski quality, capped size / FPS).
 */

/** gifski quality 1–100. High enough for soft edges and post FX (Mozayk uses 90). */
export const GIF_QUALITY_DEFAULT = 90;

const GIF_QUALITY_BY_PRESET = {
  low: 70,
  medium: GIF_QUALITY_DEFAULT,
  high: 100,
};

/** Landscape pixel sizes for GIF (opaque + transparent). Max 1080p. */
const GIF_SIZES = {
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
};

/** @type {ReadonlySet<string>} */
export const GIF_EXPORT_RESOLUTIONS = new Set(['480p', '720p', '1080p']);

/**
 * @param {unknown} format
 * @returns {'mp4' | 'png' | 'gif'}
 */
export function normalizeVideoExportFormat(format) {
  if (format === 'png' || format === 'gif') return format;
  return 'mp4';
}

/**
 * @param {unknown} value
 * @returns {'480p' | '720p' | '1080p'}
 */
export function normalizeGifExportResolution(value) {
  if (value === '480p' || value === '720p' || value === '1080p') return value;
  // Higher video presets clamp to GIF max.
  if (value === '1440p' || value === '2160p') return '1080p';
  return '720p';
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isGifExportResolution(value) {
  return GIF_EXPORT_RESOLUTIONS.has(String(value));
}

/**
 * @param {unknown} resolution
 * @returns {{ width: number, height: number }}
 */
export function getGifExportResolutionSize(resolution) {
  const key = normalizeGifExportResolution(resolution);
  return { ...GIF_SIZES[key] };
}

/**
 * @param {unknown} resolution
 * @returns {string}
 */
export function getGifExportResolutionPixelLabel(resolution) {
  const { width, height } = getGifExportResolutionSize(resolution);
  return `${width} × ${height}`;
}

/**
 * GIF FPS — same as video except 60 is clamped (file size / encode cost).
 * @param {unknown} value
 * @returns {24 | 30}
 */
export function normalizeGifExportFps(value) {
  return value === 24 ? 24 : 30;
}

/**
 * Map shared Low/Med/High quality UI to gifski 1–100.
 * @param {unknown} preset
 * @returns {number}
 */
export function gifskiQualityFromPreset(preset) {
  if (preset === 'low' || preset === 'high') return GIF_QUALITY_BY_PRESET[preset];
  return GIF_QUALITY_BY_PRESET.medium;
}

/**
 * Frame delay in milliseconds for gifski `frameDurations`.
 * @param {number} fps
 * @returns {number}
 */
export function gifFrameDelayMs(fps) {
  const safeFps = Math.max(1, Number(fps) || 30);
  return Math.max(20, Math.round(1000 / safeFps));
}
