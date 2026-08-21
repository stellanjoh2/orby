import { APP_BACKGROUND } from '../../constants.js';

/** @typedef {'cover' | 'contain' | 'fill'} BackgroundImageFit */
/** @typedef {{ name?: string, type?: string, dataBase64?: string }} BackgroundImageAsset */
/** @typedef {{ enabled: boolean, fit: BackgroundImageFit, blur: number, asset: BackgroundImageAsset | null }} BackgroundImageConfig */

export const BACKGROUND_IMAGE_ACCEPT =
  '.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,image/*';

/** Longest edge for the working copy — enough for crisp viewport bg, not full 5K+ uploads. */
export const MAX_BACKGROUND_IMAGE_SOURCE_EDGE = 2048;

/** Longest edge for cover/contain composite canvas (GPU upload size). */
export const MAX_BACKGROUND_IMAGE_COMPOSITE_EDGE = 2048;

/** Blur slider 0–1 maps to this fraction of the image's longest edge (CSS canvas blur). */
export const BACKGROUND_IMAGE_BLUR_MAX_RADIUS_FRACTION = 0.08;

export const DEFAULT_BACKGROUND_IMAGE = Object.freeze({
  enabled: false,
  fit: 'cover',
  blur: 0,
  asset: null,
});

/**
 * @param {unknown} value
 * @returns {number}
 */
export function clampBackgroundImageBlur(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * @param {number} blur
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
export function backgroundImageBlurRadiusPx(blur, width, height) {
  const amount = clampBackgroundImageBlur(blur);
  if (amount <= 0) return 0;
  const edge = Math.max(Number(width) || 0, Number(height) || 0, 1);
  return amount * edge * BACKGROUND_IMAGE_BLUR_MAX_RADIUS_FRACTION;
}

/**
 * @param {Partial<BackgroundImageConfig> | null | undefined} config
 * @returns {BackgroundImageConfig}
 */
export function normalizeBackgroundImage(config) {
  const base = DEFAULT_BACKGROUND_IMAGE;
  const fit =
    config?.fit === 'contain' || config?.fit === 'fill' ? config.fit : 'cover';
  const asset =
    config?.asset?.dataBase64
      ? {
          name: String(config.asset.name ?? 'background.jpg'),
          type: String(config.asset.type ?? ''),
          dataBase64: String(config.asset.dataBase64),
        }
      : null;

  return {
    enabled: !!config?.enabled,
    fit,
    blur: clampBackgroundImageBlur(config?.blur ?? base.blur),
    asset,
  };
}

/**
 * @param {BackgroundImageConfig} config
 * @returns {string}
 */
export function getBackgroundImageFallbackColor(config) {
  void config;
  return APP_BACKGROUND;
}
