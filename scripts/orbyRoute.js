/** Shared client-side route detection for home vs in-app 404 experience. */

import { ORBY_MOBILE_LEARN_PATH } from './orbyMobileAppRoute.js';

export function getOrbyPathname() {
  return window.location.pathname || '/';
}

function normalizeOrbyPath(pathname) {
  return (pathname || '/').replace(/\/$/, '') || '/';
}

export function isOrbyHomePath(pathname = getOrbyPathname()) {
  const path = normalizeOrbyPath(pathname);
  return (
    path === '/'
    || path === '/index.html'
    || path === ORBY_MOBILE_LEARN_PATH
  );
}

export function isOrbyNotFoundDebug() {
  try {
    return new URLSearchParams(window.location.search).get('orby404Debug') === '1';
  } catch {
    return false;
  }
}

/** True when entry.js should load notFoundPage.js instead of the home-only boot. */
export function isOrbyNotFoundRoute() {
  return !isOrbyHomePath() || isOrbyNotFoundDebug();
}
