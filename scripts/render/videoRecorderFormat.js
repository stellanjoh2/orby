/**
 * MediaRecorder mime + file extension — MP4 when supported (Chrome/Brave/Safari),
 * WebM fallback for Firefox and other engines without H.264 recording.
 */

/** @typedef {{ mimeType: string, extension: 'mp4' | 'webm' }} VideoRecorderFormat */

/** @type {VideoRecorderFormat[]} */
export const VIDEO_RECORDER_FORMAT_CANDIDATES = [
  { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4' },
  { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
];

/**
 * @param {(mimeType: string) => boolean} isTypeSupported
 * @returns {VideoRecorderFormat | null}
 */
export function resolveSupportedVideoRecorderFormat(isTypeSupported) {
  if (typeof isTypeSupported !== 'function') return null;
  for (const candidate of VIDEO_RECORDER_FORMAT_CANDIDATES) {
    try {
      if (isTypeSupported(candidate.mimeType)) return candidate;
    } catch (error) {
      // Try next candidate.
    }
  }
  return null;
}

/**
 * @returns {VideoRecorderFormat | null}
 */
export function getSupportedVideoRecorderFormat() {
  if (typeof MediaRecorder === 'undefined') return null;
  return resolveSupportedVideoRecorderFormat((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
  );
}

/** @param {string | null | undefined} mimeType */
export function videoRecorderExtensionForMime(mimeType) {
  if (!mimeType) return 'mp4';
  return mimeType.startsWith('video/webm') ? 'webm' : 'mp4';
}
