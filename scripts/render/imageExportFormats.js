/** @typedef {'png' | 'jpeg' | 'webp'} ImageExportFormatId */

/** @type {Record<ImageExportFormatId, { id: ImageExportFormatId, label: string, mime: string, ext: string, supportsAlpha: boolean, defaultQuality?: number, downloadSuffix: { opaque: string, transparent: string } }>} */
export const IMAGE_EXPORT_FORMATS = {
  png: {
    id: 'png',
    label: 'PNG',
    mime: 'image/png',
    ext: 'png',
    supportsAlpha: true,
    downloadSuffix: { opaque: 'orby.png', transparent: 'transparent.png' },
  },
  jpeg: {
    id: 'jpeg',
    label: 'JPEG',
    mime: 'image/jpeg',
    ext: 'jpg',
    supportsAlpha: false,
    defaultQuality: 0.92,
    downloadSuffix: { opaque: 'orby.jpg', transparent: 'orby.jpg' },
  },
  webp: {
    id: 'webp',
    label: 'WebP',
    mime: 'image/webp',
    ext: 'webp',
    supportsAlpha: true,
    defaultQuality: 0.92,
    downloadSuffix: { opaque: 'orby.webp', transparent: 'transparent.webp' },
  },
};

/** PNG first — default dropdown order. */
export const IMAGE_EXPORT_FORMAT_ORDER = ['png', 'jpeg', 'webp'];

export const DEFAULT_IMAGE_EXPORT_FORMAT = 'png';

/**
 * @param {string | undefined | null} id
 * @returns {ImageExportFormatId}
 */
export function normalizeImageExportFormat(id) {
  return id && id in IMAGE_EXPORT_FORMATS ? /** @type {ImageExportFormatId} */ (id) : DEFAULT_IMAGE_EXPORT_FORMAT;
}

/**
 * @param {string | undefined | null} id
 */
export function getImageExportFormat(id) {
  return IMAGE_EXPORT_FORMATS[normalizeImageExportFormat(id)];
}

/**
 * @param {boolean} transparent
 * @param {string | undefined | null} formatId
 */
export function imageExportDownloadSuffix(transparent, formatId) {
  const format = getImageExportFormat(formatId);
  return transparent ? format.downloadSuffix.transparent : format.downloadSuffix.opaque;
}
