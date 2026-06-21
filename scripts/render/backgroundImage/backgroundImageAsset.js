import { arrayBufferToBase64 } from '../../utils/binaryAsset.js';
import { getImageSourceSize } from './backgroundImageCanvas.js';

const PERSIST_JPEG_QUALITY = 0.88;

/**
 * Persist a downscaled viewport image as JPEG — not the original 5K upload.
 * Keeps scene JSON small and avoids holding tens of MB of base64 in memory.
 *
 * @param {CanvasImageSource} source
 * @param {string} originalName
 * @returns {Promise<{ name: string, type: string, dataBase64: string }>}
 */
export async function encodeBackgroundImageAsset(source, originalName = 'background.jpg') {
  const { width, height } = getImageSourceSize(source);
  if (!width || !height) {
    throw new Error('Background image has no dimensions');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(source, 0, 0, width, height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('JPEG encode failed'))),
      'image/jpeg',
      PERSIST_JPEG_QUALITY,
    );
  });

  const buffer = await blob.arrayBuffer();
  const baseName = String(originalName || 'background').replace(/\.[^/.]+$/, '');
  return {
    name: `${baseName}.jpg`,
    type: 'image/jpeg',
    dataBase64: arrayBufferToBase64(buffer),
  };
}
