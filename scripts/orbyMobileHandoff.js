/**
 * Stages a GLB/GLTF on the mobile gate (/mobile) or learn page (/mobile/learn),
 * then opens /mobile/app after pick.
 * IndexedDB bridges the navigation — files never leave the device.
 */
import { isOrbySceneFile } from './import/dispatchImportFile.js';
import { isMobileLanding, isMobileDevice } from './orbyMobileLanding.js';
import { goToOrbyMobile, isOrbyMobileLandingRoute, orbyMobileAppUrl } from './orbyMobileAppRoute.js';
import {
  clearOrbyMobileHandoffSize,
  formatOrbyMobileModelSize,
  isOrbyMobileModelWithinLimit,
  orbyMobileModelTooLargeMessage,
  readOrbyMobileHandoffWaitMs,
  rememberOrbyMobileHandoffSize,
  validateOrbyMobileModelFile,
} from './orbyMobileModelLimits.js';

const DB_NAME = 'orby-mobile-handoff';
const DB_VERSION = 1;
const STORE = 'pending';
const RECORD_KEY = 'model';

export const ORBY_MOBILE_SESSION_KEY = 'orby_mobile_active';
/** Survives iOS tab kills (sessionStorage does not). */
export const ORBY_MOBILE_SESSION_PERSIST_KEY = 'orby_mobile_active_persist';
/** Set before IDB write so /mobile/app can wait for the staged file (iOS navigation race). */
export const ORBY_MOBILE_HANDOFF_PENDING_KEY = 'orby_mobile_handoff_pending';

/**
 * @typedef {{ name: string, type: string, buffer: ArrayBuffer, size: number }} MobileModelHandoff
 */

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

/** @param {object} record */
async function writePendingRecord(record) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
  });
  db.close();
}

async function clearPendingRecord() {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
  });
  db.close();
}

/** @returns {Promise<object | null>} */
async function readPendingRecord() {
  try {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(RECORD_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
    });
    db.close();
    return record;
  } catch {
    return null;
  }
}

/**
 * Copy model bytes out of an IDB record. Never returns live Blob/File handles — iOS
 * invalidates those after navigation ("The object can not be found here.").
 * @param {object | null | undefined} record
 * @returns {MobileModelHandoff | null}
 */
function extractHandoffFromRecord(record) {
  if (!record?.name) return null;

  const type = record.type || 'model/gltf-binary';
  const size = Number.isFinite(record.size) ? record.size : 0;

  try {
    if (record.bytes instanceof Uint8Array && record.bytes.byteLength > 0) {
      const copy = record.bytes.slice();
      return {
        name: record.name,
        type,
        buffer: copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength),
        size: size || copy.byteLength,
      };
    }

    if (record.buffer instanceof ArrayBuffer && record.buffer.byteLength > 0) {
      return {
        name: record.name,
        type,
        buffer: record.buffer.slice(0),
        size: size || record.buffer.byteLength,
      };
    }

    if (ArrayBuffer.isView(record.buffer) && record.buffer.byteLength > 0) {
      const view = /** @type {ArrayBufferView} */ (record.buffer);
      const copy = new Uint8Array(view.byteLength);
      copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
      return {
        name: record.name,
        type,
        buffer: copy.buffer,
        size: size || copy.byteLength,
      };
    }
  } catch {
    return null;
  }

  return null;
}

/** @param {object | null | undefined} record */
function recordHasModelBytes(record) {
  if (extractHandoffFromRecord(record)) return true;
  if (!record?.name) return false;
  // Legacy blob/File rows — present in IDB but must be re-read asynchronously.
  return record.blob instanceof Blob;
}

/**
 * @param {object | null | undefined} record
 * @returns {Promise<MobileModelHandoff | null>}
 */
async function extractHandoffFromRecordAsync(record) {
  const direct = extractHandoffFromRecord(record);
  if (direct) return direct;

  if (!record?.name || !(record.blob instanceof Blob)) return null;

  try {
    const bytes = new Uint8Array(await record.blob.arrayBuffer());
    if (!bytes.byteLength) return null;
    return {
      name: record.name,
      type: record.type || 'model/gltf-binary',
      buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      size: Number.isFinite(record.size) ? record.size : bytes.byteLength,
    };
  } catch {
    return null;
  }
}

export function markMobileHandoffPending() {
  try {
    sessionStorage.setItem(ORBY_MOBILE_HANDOFF_PENDING_KEY, '1');
  } catch {
    /* sessionStorage blocked */
  }
}

export function clearMobileHandoffPending() {
  try {
    sessionStorage.removeItem(ORBY_MOBILE_HANDOFF_PENDING_KEY);
  } catch {
    /* sessionStorage blocked */
  }
  clearOrbyMobileHandoffSize();
}

export function hasMobileHandoffPendingFlag() {
  try {
    return sessionStorage.getItem(ORBY_MOBILE_HANDOFF_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * @param {File} file
 * @returns {Promise<void>}
 */
export async function stageMobileModelHandoff(file) {
  const check = validateOrbyMobileModelFile(file);
  if (!check.ok) {
    throw new Error(check.message);
  }

  markMobileHandoffPending();
  rememberOrbyMobileHandoffSize(file.size);

  // Uint8Array survives IDB + navigation on iOS; File/Blob handles do not.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const record = {
    name: file.name,
    type: file.type || 'model/gltf-binary',
    bytes,
    size: file.size,
    stagedAt: Date.now(),
  };
  await writePendingRecord(record);

  const verify = extractHandoffFromRecord(await readPendingRecord());
  if (!verify?.buffer?.byteLength) {
    await clearPendingRecord();
    clearMobileHandoffPending();
    throw new Error('Handoff staging failed on this device — try again');
  }
}

/** @returns {Promise<boolean>} */
async function hasStagedMobileModelRecord() {
  try {
    const record = await readPendingRecord();
    return recordHasModelBytes(record);
  } catch {
    return false;
  }
}

/** @returns {Promise<boolean>} */
export async function hasPendingMobileModelHandoff() {
  return hasStagedMobileModelRecord();
}

/**
 * Poll until the landing page finishes staging (navigation often beats IDB on mobile Safari).
 * @param {number} [maxMs]
 */
export async function waitForMobileModelHandoff(maxMs = readOrbyMobileHandoffWaitMs()) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await hasStagedMobileModelRecord()) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
  return hasStagedMobileModelRecord();
}

/** @returns {Promise<MobileModelHandoff | null>} */
export async function takeMobileModelHandoff() {
  try {
    const record = await readPendingRecord();
    if (!recordHasModelBytes(record)) {
      clearMobileHandoffPending();
      return null;
    }

    const handoff = await extractHandoffFromRecordAsync(record);
    if (!handoff?.buffer?.byteLength) {
      await clearPendingRecord();
      clearMobileHandoffPending();
      return null;
    }

    await clearPendingRecord();
    clearMobileHandoffPending();
    return handoff;
  } catch (err) {
    console.error('[Orby Mobile] Handoff read failed', err);
    try {
      await clearPendingRecord();
    } catch {
      /* ignore */
    }
    clearMobileHandoffPending();
    return null;
  }
}

export function markMobileAppSessionActive() {
  try {
    sessionStorage.setItem(ORBY_MOBILE_SESSION_KEY, '1');
  } catch {
    /* sessionStorage blocked */
  }
  try {
    localStorage.setItem(ORBY_MOBILE_SESSION_PERSIST_KEY, String(Date.now()));
  } catch {
    /* localStorage blocked */
  }
}

export function clearMobileAppSession() {
  try {
    sessionStorage.removeItem(ORBY_MOBILE_SESSION_KEY);
  } catch {
    /* sessionStorage blocked */
  }
  try {
    localStorage.removeItem(ORBY_MOBILE_SESSION_PERSIST_KEY);
  } catch {
    /* localStorage blocked */
  }
}

export function hasMobileAppSession() {
  try {
    if (sessionStorage.getItem(ORBY_MOBILE_SESSION_KEY) === '1') return true;
  } catch {
    /* sessionStorage blocked */
  }
  try {
    return Boolean(localStorage.getItem(ORBY_MOBILE_SESSION_PERSIST_KEY));
  } catch {
    return false;
  }
}

function isMobileModelFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'glb' || ext === 'gltf';
}

function shouldHandoffFileFromLanding() {
  return isMobileLanding() || isOrbyMobileLandingRoute() || isMobileDevice();
}

function showLandingToast(message) {
  window.orby?.ui?.showToast?.(message, 3200, { notification: false });
}

function navigateToMobileApp() {
  const url = `${orbyMobileAppUrl()}/?handoff=1`;
  window.location.replace(url);
  // iOS file-picker callbacks may block replace after await — retry with assign.
  window.setTimeout(() => {
    try {
      const path = window.location.pathname.replace(/\/$/, '') || '/';
      if (path === '/mobile' || path === '/mobile/learn' || path === '/' || path.endsWith('/index.html')) {
        window.location.assign(url);
      }
    } catch {
      /* ignore */
    }
  }, 150);
}

/**
 * On mobile landing: stage the picked file and open Orby Mobile viewer (skip desktop studio).
 * @param {File} file
 * @returns {Promise<boolean>} true when handled (caller should not load in desktop studio)
 */
export async function handoffFileToMobileAppIfLanding(file) {
  if (!shouldHandoffFileFromLanding() || !(file instanceof File)) return false;

  if (isOrbySceneFile(file)) {
    showLandingToast('Orby scene files need desktop — use GLB or GLTF on your phone');
    return true;
  }

  if (!isMobileModelFile(file)) {
    showLandingToast('Mobile supports GLB / GLTF only');
    return true;
  }

  if (!isOrbyMobileModelWithinLimit(file.size)) {
    showLandingToast(orbyMobileModelTooLargeMessage(file.size));
    return true;
  }

  try {
    await stageMobileModelHandoff(file);
    navigateToMobileApp();
    return true;
  } catch (err) {
    console.error('[Orby] Mobile handoff failed', err);
    clearMobileHandoffPending();
    const message = err instanceof Error && err.message.includes('too large')
      ? err.message
      : `Could not open Orby Mobile — ${formatOrbyMobileModelSize(file.size)} may be too heavy for this device`;
    showLandingToast(message);
    return true;
  }
}
