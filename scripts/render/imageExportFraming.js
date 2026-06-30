/** @typedef {'crop' | 'full'} TransparentFraming */

/** @param {unknown} value @returns {TransparentFraming} */
export function normalizeTransparentFraming(value) {
  return value === 'full' ? 'full' : 'crop';
}

/** @param {TransparentFraming | unknown} framing */
export function isTransparentCropToAsset(framing) {
  return normalizeTransparentFraming(framing) === 'crop';
}

/** @param {TransparentFraming | unknown} framing */
export function transparentFramingSummaryLabel(framing) {
  return isTransparentCropToAsset(framing) ? 'Crop to asset' : 'Full frame';
}
