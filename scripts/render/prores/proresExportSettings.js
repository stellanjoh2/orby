/**
 * ProRes (.MOV) video-export settings — profiles for opaque + alpha masters.
 */

import { normalizeVideoExportFormat } from '../gif/gifExportSettings.js';

/**
 * Formats that can export with a transparent background.
 * @param {unknown} format
 * @returns {boolean}
 */
export function videoExportSupportsAlpha(format) {
  const f = normalizeVideoExportFormat(format);
  return f === 'png' || f === 'gif' || f === 'mov';
}

/**
 * Map shared Low/Med/High quality UI + transparency to a ProRes profile id.
 * Opaque: LT / Standard / HQ. Alpha: 4444 / 4444 XQ (high).
 *
 * @param {{ transparent?: boolean, qualityPreset?: string }} opts
 * @returns {0 | 1 | 2 | 3 | 4 | 5}
 */
export function proresProfileFromSettings(opts = {}) {
  const quality =
    opts.qualityPreset === 'low' || opts.qualityPreset === 'high'
      ? opts.qualityPreset
      : 'medium';
  if (opts.transparent) {
    return quality === 'high' ? 5 : 4; // P4444XQ : P4444
  }
  if (quality === 'low') return 1; // LT
  if (quality === 'high') return 3; // HQ
  return 2; // STANDARD
}

/**
 * Human label for overlay / toasts (matches ProfileNames in the encoder).
 * @param {number} profile
 * @returns {string}
 */
export function proresProfileLabel(profile) {
  switch (profile) {
    case 0:
      return 'ProRes 422 Proxy';
    case 1:
      return 'ProRes 422 LT';
    case 2:
      return 'ProRes 422';
    case 3:
      return 'ProRes 422 HQ';
    case 4:
      return 'ProRes 4444';
    case 5:
      return 'ProRes 4444 XQ';
    default:
      return 'ProRes';
  }
}
