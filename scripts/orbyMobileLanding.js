/**
 * Mobile landing detection — ES module facade over orbyMobileLandingBoot.js (index.html head).
 * Subpages without the boot script use the inline fallbacks below (always desktop chrome).
 */

/** @typedef {typeof window.__ORBY_MOBILE_LANDING__} OrbyMobileLandingApi */

export const MOBILE_LANDING_MAX_WIDTH_PX = 768;

const MOBILE_UA_RE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

/** @returns {OrbyMobileLandingApi | null} */
function mobileLandingApi() {
  return typeof window !== 'undefined' ? window.__ORBY_MOBILE_LANDING__ ?? null : null;
}

function isForcedMobileLandingDebugImpl() {
  try {
    if (typeof window !== 'undefined' && window.__ORBY_DEBUG_MOBILE_LANDING__ === true) {
      return true;
    }
    const q = new URLSearchParams(window.location.search);
    if (q.get('orbyMobile') === '1') return true;
    if (q.has('mobileLanding')) return true;
    if (sessionStorage.getItem('orby_mobile_landing') === '1') return true;
  } catch {
    /* sessionStorage / URL blocked */
  }
  return false;
}

function isMobileDeviceImpl() {
  if (MOBILE_UA_RE.test(navigator.userAgent || '')) return true;
  try {
    return window.matchMedia(`(max-width: ${MOBILE_LANDING_MAX_WIDTH_PX}px)`).matches;
  } catch {
    return false;
  }
}

function shouldShowMobileLandingImpl() {
  return isForcedMobileLandingDebugImpl() || isMobileDeviceImpl();
}

function isMobileLandingImpl() {
  return document.documentElement.classList.contains('mobile-landing');
}

function ensureMobileLandingClassImpl() {
  if (!shouldShowMobileLandingImpl()) return false;
  document.documentElement.classList.add('mobile-landing', 'orby-home-scroll');
  return true;
}

/** @param {keyof OrbyMobileLandingApi} method */
function callApi(method) {
  const api = mobileLandingApi();
  if (api && typeof api[method] === 'function') return api[method]();

  switch (method) {
    case 'isForcedMobileLandingDebug':
      return isForcedMobileLandingDebugImpl();
    case 'isMobileDevice':
      return isMobileDeviceImpl();
    case 'shouldShowMobileLanding':
      return shouldShowMobileLandingImpl();
    case 'isMobileLanding':
      return isMobileLandingImpl();
    case 'ensureMobileLandingClass':
      return ensureMobileLandingClassImpl();
    default:
      throw new Error(`[Orby] Unknown mobile landing API method: ${String(method)}`);
  }
}

export function isForcedMobileLandingDebug() {
  return callApi('isForcedMobileLandingDebug');
}

export function isMobileDevice() {
  return callApi('isMobileDevice');
}

export function shouldShowMobileLanding() {
  return callApi('shouldShowMobileLanding');
}

export function isMobileLanding() {
  return callApi('isMobileLanding');
}

/** Idempotent — adds html.mobile-landing and html.orby-home-scroll. */
export function ensureMobileLandingClass() {
  return callApi('ensureMobileLandingClass');
}
