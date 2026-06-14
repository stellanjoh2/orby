import { getImageExportFormat, normalizeImageExportFormat } from './imageExportFormats.js';

/**
 * Encode a canvas to a downloadable Blob for the given raster format.
 * @param {HTMLCanvasElement} canvas
 * @param {string | undefined | null} formatId
 * @returns {Promise<Blob>}
 */
export function encodeCanvasToBlob(canvas, formatId) {
  const format = getImageExportFormat(formatId);
  const mime = format.mime;
  const quality = format.defaultQuality;

  return new Promise((resolve, reject) => {
    const onBlob = (blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error(`${format.label} encode failed`));
    };

    if (mime === 'image/png') {
      canvas.toBlob(onBlob, mime);
    } else {
      canvas.toBlob(onBlob, mime, quality ?? 0.92);
    }
  });
}

/**
 * @param {string | undefined | null} formatId
 * @returns {Promise<boolean>}
 */
export async function probeImageFormatEncode(formatId) {
  const format = getImageExportFormat(formatId);
  if (format.mime === 'image/png') return true;

  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 2, 2);

  try {
    await encodeCanvasToBlob(canvas, normalizeImageExportFormat(formatId));
    return true;
  } catch {
    return false;
  }
}
