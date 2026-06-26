import { encodeCanvasToBlob } from '../encodeImageBlob.js';
import {
  imageExportDownloadSuffix,
  normalizeImageExportFormat,
} from '../imageExportFormats.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string | undefined | null} formatId
 * @returns {Promise<Blob>}
 */
export function encodeExportCanvasToBlob(canvas, formatId) {
  return encodeCanvasToBlob(canvas, normalizeImageExportFormat(formatId));
}

/**
 * Encode canvas and trigger download via caller-supplied hook (keeps ImageExporter filename logic).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object | null | undefined} currentFile
 * @param {string | undefined | null} formatId
 * @param {{
 *   transparent?: boolean,
 *   downloadBlob: (blob: Blob, file: object | null | undefined, suffix: string) => void,
 * }} opts
 * @returns {Promise<Blob>}
 */
export async function downloadExportCanvas(canvas, currentFile, formatId, opts) {
  const format = normalizeImageExportFormat(formatId);
  const blob = await encodeExportCanvasToBlob(canvas, format);
  opts.downloadBlob(
    blob,
    currentFile,
    imageExportDownloadSuffix(!!opts.transparent, format),
  );
  return blob;
}
