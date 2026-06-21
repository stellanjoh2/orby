import { APP_BACKGROUND } from '../../constants.js';

/** @typedef {'cover' | 'contain' | 'fill'} BackgroundImageFit */
/** @typedef {{ name?: string, type?: string, dataBase64?: string }} BackgroundImageAsset */
/** @typedef {{ enabled: boolean, fit: BackgroundImageFit, asset: BackgroundImageAsset | null }} BackgroundImageConfig */

export const BACKGROUND_IMAGE_ACCEPT =
  '.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,image/*';

/** Longest edge for the working copy — enough for crisp viewport bg, not full 5K+ uploads. */
export const MAX_BACKGROUND_IMAGE_SOURCE_EDGE = 2048;

/** Longest edge for cover/contain composite canvas (GPU upload size). */
export const MAX_BACKGROUND_IMAGE_COMPOSITE_EDGE = 2048;

export const DEFAULT_BACKGROUND_IMAGE = Object.freeze({
  enabled: false,
  fit: 'cover',
  asset: null,
});

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
