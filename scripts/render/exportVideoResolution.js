/** Landscape (16∶9) vs portrait (9∶16) video export framing. */

export const EXPORT_VIDEO_ASPECT_LANDSCAPE = '16:9';
export const EXPORT_VIDEO_ASPECT_PORTRAIT = '9:16';

const LANDSCAPE_SIZES = {
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '2160p': { width: 3840, height: 2160 },
};

const PORTRAIT_SIZES = {
  '1080p': { width: 1080, height: 1920 },
  '1440p': { width: 1440, height: 2560 },
  '2160p': { width: 2160, height: 3840 },
};

/**
 * @param {unknown} value
 * @returns {'16:9' | '9:16'}
 */
export function normalizeExportVideoAspectRatio(value) {
  return value === EXPORT_VIDEO_ASPECT_PORTRAIT
    ? EXPORT_VIDEO_ASPECT_PORTRAIT
    : EXPORT_VIDEO_ASPECT_LANDSCAPE;
}

/**
 * @param {unknown} value
 * @returns {'1080p' | '1440p' | '2160p'}
 */
export function normalizeExportVideoResolution(value) {
  return value === '1440p' || value === '2160p' ? value : '1080p';
}

/**
 * @param {unknown} aspectRatio
 * @returns {boolean}
 */
export function isPortraitExportVideoAspect(aspectRatio) {
  return normalizeExportVideoAspectRatio(aspectRatio) === EXPORT_VIDEO_ASPECT_PORTRAIT;
}

/**
 * @param {unknown} resolution
 * @param {unknown} [aspectRatio]
 * @returns {{ width: number, height: number }}
 */
export function getExportVideoResolutionSize(resolution, aspectRatio = EXPORT_VIDEO_ASPECT_LANDSCAPE) {
  const res = normalizeExportVideoResolution(resolution);
  const table = isPortraitExportVideoAspect(aspectRatio) ? PORTRAIT_SIZES : LANDSCAPE_SIZES;
  return { ...table[res] };
}

/**
 * @param {unknown} resolution
 * @param {unknown} [aspectRatio]
 * @returns {string}
 */
export function getExportVideoResolutionPixelLabel(resolution, aspectRatio = EXPORT_VIDEO_ASPECT_LANDSCAPE) {
  const { width, height } = getExportVideoResolutionSize(resolution, aspectRatio);
  return `${width} × ${height}`;
}

/**
 * @param {unknown} resolution
 * @param {unknown} [aspectRatio]
 * @returns {string}
 */
export function getExportVideoResolutionSummaryLabel(resolution, aspectRatio = EXPORT_VIDEO_ASPECT_LANDSCAPE) {
  const res = normalizeExportVideoResolution(resolution);
  const pixels = getExportVideoResolutionPixelLabel(res, aspectRatio);
  const aspect = normalizeExportVideoAspectRatio(aspectRatio);
  return `${res} (${pixels}, ${aspect})`;
}

/**
 * @param {unknown} aspectRatio
 * @returns {string}
 */
export function exportVideoAspectSequenceSuffix(aspectRatio) {
  return isPortraitExportVideoAspect(aspectRatio) ? '_916' : '';
}
