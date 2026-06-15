/** Minimal mobile gate — browse GLB, then hand off to the viewer. */
export const ORBY_MOBILE_GATE_PATH = '/mobile';

/** Full mobile marketing scroll experience (opt-in from the gate). */
export const ORBY_MOBILE_LEARN_PATH = '/mobile/learn';

/** @deprecated use ORBY_MOBILE_LEARN_PATH */
export const ORBY_MOBILE_LANDING_PATH = ORBY_MOBILE_LEARN_PATH;

/** Orby Mobile 3D viewer (apps/mobile — separate from desktop studio). */
export const ORBY_MOBILE_APP_PATH = '/mobile/app';

/** @deprecated use ORBY_MOBILE_APP_PATH */
export const ORBY_MOBILE_PATH = ORBY_MOBILE_APP_PATH;

/** @returns {string} */
export function orbyMobileGateUrl() {
  return ORBY_MOBILE_GATE_PATH;
}

/** @returns {string} */
export function orbyMobileLearnUrl() {
  return ORBY_MOBILE_LEARN_PATH;
}

/** @returns {string} */
export function orbyMobileLandingUrl() {
  return ORBY_MOBILE_GATE_PATH;
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

/** True when pathname is `/mobile` (minimal gate), not the viewer at `/mobile/app`. */
export function isOrbyMobileGateRoute() {
  try {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    return path === ORBY_MOBILE_GATE_PATH;
  } catch {
    return false;
  }
}

/** True when pathname is `/mobile/learn` (full marketing). */
export function isOrbyMobileLearnRoute() {
  try {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    return path === ORBY_MOBILE_LEARN_PATH;
  } catch {
    return false;
  }
}

/** True on mobile marketing routes (learn page), not the gate or viewer. */
export function isOrbyMobileLandingRoute() {
  return isOrbyMobileLearnRoute();
}

function normalizeMobilePath(pathname) {
  return (pathname || '/').replace(/\/$/, '') || '/';
}

/**
 * When the SPA shell (index.html / entry.js) is served on mobile static routes,
 * send the browser to the dedicated HTML shells under /mobile/.
 * @param {string} [pathname]
 * @returns {string | null}
 */
export function resolveOrbyStaticMobileRedirect(pathname = typeof window !== 'undefined' ? window.location.pathname : '/') {
  const path = normalizeMobilePath(pathname);
  const search = typeof window !== 'undefined' ? window.location.search || '' : '';
  const hash = typeof window !== 'undefined' ? window.location.hash || '' : '';
  const suffix = `${search}${hash}`;

  if (path === ORBY_MOBILE_GATE_PATH && !pathname.endsWith('/')) {
    return `${ORBY_MOBILE_GATE_PATH}/${suffix}`;
  }
  if (path === ORBY_MOBILE_APP_PATH && !pathname.endsWith('/')) {
    return `${ORBY_MOBILE_APP_PATH}/${suffix}`;
  }
  if (path === ORBY_MOBILE_LEARN_PATH && !pathname.endsWith('/')) {
    return `${ORBY_MOBILE_LEARN_PATH}/${suffix}`;
  }
  return null;
}
