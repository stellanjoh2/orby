/** Soft cap for GLB/GLTF on Orby Mobile — above this iOS often OOMs during handoff + parse. */
export const ORBY_MOBILE_MAX_MODEL_BYTES = 80 * 1024 * 1024;

export const ORBY_MOBILE_HANDOFF_SIZE_KEY = 'orby_mobile_handoff_size';

/** @param {number} bytes */
export function formatOrbyMobileModelSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${Math.round(bytes)} B`;
}

/** @param {number} sizeBytes */
export function isOrbyMobileModelWithinLimit(sizeBytes) {
  return Number.isFinite(sizeBytes) && sizeBytes > 0 && sizeBytes <= ORBY_MOBILE_MAX_MODEL_BYTES;
}

/** @param {number} sizeBytes */
export function orbyMobileModelTooLargeMessage(sizeBytes) {
  return `Model is too large for mobile (${formatOrbyMobileModelSize(sizeBytes)}). Export a GLB under ${formatOrbyMobileModelSize(ORBY_MOBILE_MAX_MODEL_BYTES)} on desktop.`;
}

/**
 * Poll window for IndexedDB staging — large files need more time on device storage.
 * @param {number} sizeBytes
 */
export function estimateOrbyMobileHandoffWaitMs(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return 4000;
  const mb = sizeBytes / (1024 * 1024);
  const ms = Math.ceil(mb) * 1500 + 4000;
  return Math.min(45000, Math.max(4000, ms));
}

/** @returns {number} */
export function readOrbyMobileHandoffWaitMs() {
  try {
    const raw = sessionStorage.getItem(ORBY_MOBILE_HANDOFF_SIZE_KEY);
    const size = raw ? Number(raw) : 0;
    if (size > 0) return estimateOrbyMobileHandoffWaitMs(size);
  } catch {
    /* sessionStorage blocked */
  }
  return 4000;
}

/** @param {number} sizeBytes */
export function rememberOrbyMobileHandoffSize(sizeBytes) {
  try {
    sessionStorage.setItem(ORBY_MOBILE_HANDOFF_SIZE_KEY, String(sizeBytes));
  } catch {
    /* sessionStorage blocked */
  }
}

export function clearOrbyMobileHandoffSize() {
  try {
    sessionStorage.removeItem(ORBY_MOBILE_HANDOFF_SIZE_KEY);
  } catch {
    /* sessionStorage blocked */
  }
}

/**
 * @param {File} file
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateOrbyMobileModelFile(file) {
  if (!(file instanceof File)) {
    return { ok: false, message: 'No model file selected' };
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext !== 'glb' && ext !== 'gltf') {
    return { ok: false, message: 'Mobile supports GLB / GLTF only' };
  }
  if (!isOrbyMobileModelWithinLimit(file.size)) {
    return { ok: false, message: orbyMobileModelTooLargeMessage(file.size) };
  }
  return { ok: true };
}
