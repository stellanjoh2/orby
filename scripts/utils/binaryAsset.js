/**
 * Encode/decode binary assets (fonts, HDRIs, meshes) for scene JSON / .orby files.
 */

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * @param {{ name?: string, type?: string, dataBase64?: string } | null | undefined} asset
 * @param {string} [fallbackName]
 * @returns {File | null}
 */
export function fileFromEmbeddedAsset(asset, fallbackName = 'asset.bin') {
  if (!asset?.dataBase64) return null;
  const bytes = base64ToUint8Array(asset.dataBase64);
  return new File([bytes], asset.name || fallbackName, {
    type: asset.type || 'application/octet-stream',
    lastModified: Date.now(),
  });
}
