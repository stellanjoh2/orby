/**
 * Mobile landing detection — ES module facade over orbyMobileLandingBoot.js (index.html head).
 * Subpages without the boot script use the inline fallbacks below (always desktop chrome).
 *
 * Phones → /mobile/ gate. Tablets → desktop site with a “use a desktop computer” modal.
 */

/** @typedef {typeof window.__ORBY_MOBILE_LANDING__} OrbyMobileLandingApi */

export const MOBILE_LANDING_MAX_WIDTH_PX = 768;

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

function isTabletDeviceImpl() {
  if (isForcedMobileLandingDebugImpl()) return false;

  const ua = navigator.userAgent || '';
  if (/iPad/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return true;
  if (/Tablet/i.test(ua)) return true;

  try {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const wide = window.matchMedia(`(min-width: ${MOBILE_LANDING_MAX_WIDTH_PX + 1}px)`).matches;
    if (coarse && wide && navigator.maxTouchPoints > 0) {
      if (/iPhone|iPod/i.test(ua)) return false;
      if (/Android/i.test(ua) && /Mobile/i.test(ua)) return false;
      return true;
    }
  } catch {
    /* matchMedia blocked */
  }

  return false;
}

/** Phones — redirect to /mobile/, not the tablet desktop-only gate. */
function isPhoneDeviceImpl() {
  if (isTabletDeviceImpl()) return false;

  const ua = navigator.userAgent || '';
  if (/iPhone|iPod|Windows Phone/i.test(ua)) return true;
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return true;

  try {
    return window.matchMedia(`(max-width: ${MOBILE_LANDING_MAX_WIDTH_PX}px)`).matches;
  } catch {
    return false;
  }
}

/** @deprecated Prefer {@link isPhoneDevice} — kept for handoff + legacy call sites. */
function isMobileDeviceImpl() {
  return isPhoneDeviceImpl();
}

function isOrbyMobileLearnRouteImpl() {
  try {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    return path === '/mobile/learn';
  } catch {
    return false;
  }
}

function isOrbyMobileLandingRouteImpl() {
  return isOrbyMobileLearnRouteImpl();
}

function shouldShowMobileLandingImpl() {
  return (
    isForcedMobileLandingDebugImpl()
    || isPhoneDeviceImpl()
    || isOrbyMobileLearnRouteImpl()
  );
}

function isMobileLandingImpl() {
  return document.documentElement.classList.contains('mobile-landing');
}

function isLegalSubpageImpl() {
  return document.documentElement.classList.contains('orby-legal-site-nav');
}

function isLegalSubpageMobileViewportImpl() {
  if (!isLegalSubpageImpl()) return false;
  if (isTabletDeviceImpl()) return false;
  try {
    return window.matchMedia(`(max-width: ${MOBILE_LANDING_MAX_WIDTH_PX}px)`).matches;
  } catch {
    return false;
  }
}

function shouldApplyMobileLandingClassesImpl() {
  return (
    shouldShowMobileLandingImpl()
    || isLegalSubpageMobileViewportImpl()
    || isOrbyMobileLearnRouteImpl()
  );
}

function ensureMobileLandingClassImpl() {
  if (!shouldApplyMobileLandingClassesImpl()) {
    if (isLegalSubpageImpl()) {
      document.documentElement.classList.remove('mobile-landing');
    }
    return false;
  }
  document.documentElement.classList.add('mobile-landing');
  if (!isLegalSubpageImpl()) {
    document.documentElement.classList.add('orby-home-scroll');
  }
  return true;
}

/** @param {keyof OrbyMobileLandingApi} method */
function callApi(method) {
  const api = mobileLandingApi();
  if (api && typeof api[method] === 'function') return api[method]();

  switch (method) {
    case 'isForcedMobileLandingDebug':
      return isForcedMobileLandingDebugImpl();
    case 'isPhoneDevice':
      return isPhoneDeviceImpl();
    case 'isTabletDevice':
      return isTabletDeviceImpl();
    case 'isMobileDevice':
      return isMobileDeviceImpl();
    case 'shouldShowMobileLanding':
      return shouldShowMobileLandingImpl();
    case 'isMobileLanding':
      return isMobileLandingImpl();
    case 'isOrbyMobileLandingRoute':
      return isOrbyMobileLandingRouteImpl();
    case 'ensureMobileLandingClass':
      return ensureMobileLandingClassImpl();
    default:
      throw new Error(`[Orby] Unknown mobile landing API method: ${String(method)}`);
  }
}

export function isForcedMobileLandingDebug() {
  return callApi('isForcedMobileLandingDebug');
}

export function isPhoneDevice() {
  return callApi('isPhoneDevice');
}

export function isTabletDevice() {
  return callApi('isTabletDevice');
}

/** @deprecated Prefer {@link isPhoneDevice}. */
export function isMobileDevice() {
  return callApi('isMobileDevice');
}

export function shouldShowMobileLanding() {
  return callApi('shouldShowMobileLanding');
}

export function isMobileLanding() {
  return callApi('isMobileLanding');
}

export function isOrbyMobileLandingRoute() {
  return callApi('isOrbyMobileLandingRoute');
}

/** Idempotent — adds html.mobile-landing and html.orby-home-scroll. */
export function ensureMobileLandingClass() {
  return callApi('ensureMobileLandingClass');
}
