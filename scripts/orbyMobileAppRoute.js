/** Mobile marketing landing — pick a mesh here first. */
export const ORBY_MOBILE_LANDING_PATH = '/mobile';

/** Orby Mobile 3D viewer (apps/mobile — separate from desktop studio). */
export const ORBY_MOBILE_APP_PATH = '/mobile/app';

/** @deprecated use ORBY_MOBILE_APP_PATH */
export const ORBY_MOBILE_PATH = ORBY_MOBILE_APP_PATH;

/** @returns {string} */
export function orbyMobileLandingUrl() {
  return ORBY_MOBILE_LANDING_PATH;
}

/** @returns {string} */
export function orbyMobileAppUrl() {
  return ORBY_MOBILE_APP_PATH;
}

/** @deprecated use orbyMobileAppUrl */
export function orbyMobileUrl() {
  return orbyMobileAppUrl();
}

/** @param {{ replace?: boolean }} [opts] */
export function goToOrbyMobile(opts = {}) {
  const url = orbyMobileAppUrl();
  if (opts.replace) {
    window.location.replace(url);
  } else {
    window.location.assign(url);
  }
}

/** True when pathname is `/mobile` (landing), not the viewer at `/mobile/app`. */
export function isOrbyMobileLandingRoute() {
  try {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    return path === ORBY_MOBILE_LANDING_PATH;
  } catch {
    return false;
  }
}
