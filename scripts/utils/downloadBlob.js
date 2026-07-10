/**
 * Blob download helper — delayed object-URL revoke for Safari.
 * Safari can produce truncated/corrupt saves when revokeObjectURL runs before
 * the download finishes (see VideoExporter comment; same issue affects PNG/GLB/.orby).
 */

export const BLOB_DOWNLOAD_REVOKE_DELAY_MS = 60_000;

/**
 * @param {Blob} blob
 * @param {string} fileName
 * @param {{ revokeDelayMs?: number }} [options]
 */
export function downloadBlob(blob, fileName, options = {}) {
  const { revokeDelayMs = BLOB_DOWNLOAD_REVOKE_DELAY_MS } = options;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, revokeDelayMs);
}
