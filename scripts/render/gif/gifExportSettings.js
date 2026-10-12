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

/** Length presets for GIF only (MP4 / PNG sequence keep 5 / 10 / 15). */
export const GIF_EXPORT_DURATIONS_SEC = [2, 5, 10];

/** @type {ReadonlySet<number>} */
export const GIF_EXPORT_DURATION_SET = new Set(GIF_EXPORT_DURATIONS_SEC);

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
 * @returns {2 | 5 | 10}
 */
export function normalizeGifExportDuration(value) {
  const n = Number(value);
  if (GIF_EXPORT_DURATION_SET.has(n)) return /** @type {2 | 5 | 10} */ (n);
  // Video-only 15s clamps to GIF max.
  if (n === 15) return 10;
  return 5;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isGifExportDuration(value) {
  return GIF_EXPORT_DURATION_SET.has(Number(value));
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

/** GIF-only FPS presets (MP4 / PNG sequence keep 24 / 30 / 60). */
export const GIF_EXPORT_FPS = [10, 15, 25];

/** @type {ReadonlySet<number>} */
export const GIF_EXPORT_FPS_SET = new Set(GIF_EXPORT_FPS);

/**
 * GIF FPS — centisecond-friendly rates; default 15.
 * @param {unknown} value
 * @returns {10 | 15 | 25}
 */
export function normalizeGifExportFps(value) {
  const n = Number(value);
  if (GIF_EXPORT_FPS_SET.has(n)) return /** @type {10 | 15 | 25} */ (n);
  return 15;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isGifExportFps(value) {
  return GIF_EXPORT_FPS_SET.has(Number(value));
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
  const safeFps = Math.max(1, Number(fps) || 15);
  return Math.max(20, Math.round(1000 / safeFps));
}
