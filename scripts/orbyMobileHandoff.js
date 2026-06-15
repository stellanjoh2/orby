/**
 * Stages a GLB/GLTF on the mobile gate (/mobile) or learn page (/mobile/learn),
 * then opens /mobile/app after pick.
 * IndexedDB bridges the navigation — files never leave the device.
 */
import { isOrbySceneFile } from './import/dispatchImportFile.js';
import { isMobileLanding, isMobileDevice } from './orbyMobileLanding.js';
import { goToOrbyMobile, isOrbyMobileLandingRoute, orbyMobileAppUrl } from './orbyMobileAppRoute.js';

const DB_NAME = 'orby-mobile-handoff';
const DB_VERSION = 1;
const STORE = 'pending';
const RECORD_KEY = 'model';

export const ORBY_MOBILE_SESSION_KEY = 'orby_mobile_active';
/** Survives iOS tab kills (sessionStorage does not). */
export const ORBY_MOBILE_SESSION_PERSIST_KEY = 'orby_mobile_active_persist';
/** Set before IDB write so /mobile/app can wait for the staged file (iOS navigation race). */
export const ORBY_MOBILE_HANDOFF_PENDING_KEY = 'orby_mobile_handoff_pending';

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

/** @returns {Promise<object | null>} */
async function readPendingRecord() {
  const db = await openDb();
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(RECORD_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
  });
  db.close();
  return record;
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
  markMobileHandoffPending();
  const buffer = await file.arrayBuffer();
  const record = {
    name: file.name,
    type: file.type || 'model/gltf-binary',
    buffer,
    stagedAt: Date.now(),
  };
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
  });
  db.close();
}

/** @returns {Promise<boolean>} */
async function hasStagedMobileModelRecord() {
  try {
    const record = await readPendingRecord();
    return Boolean(record?.buffer && record?.name);
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
export async function waitForMobileModelHandoff(maxMs = 4000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await hasStagedMobileModelRecord()) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
  return hasStagedMobileModelRecord();
}

/** @returns {Promise<File | null>} */
export async function takeMobileModelHandoff() {
  const record = await readPendingRecord();
  if (!record?.buffer || !record.name) {
    clearMobileHandoffPending();
    return null;
  }

  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
  });
  db.close();
  clearMobileHandoffPending();

  const blob = new Blob([record.buffer], {
    type: record.type || 'model/gltf-binary',
  });
  return new File([blob], record.name, { type: blob.type });
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

  try {
    await stageMobileModelHandoff(file);
    navigateToMobileApp();
    return true;
  } catch (err) {
    console.error('[Orby] Mobile handoff failed', err);
    clearMobileHandoffPending();
    showLandingToast('Could not open Orby Mobile — try again');
    return true;
  }
}
