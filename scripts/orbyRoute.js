/** Shared client-side route detection for home vs in-app 404 experience. */

export function getOrbyPathname() {
  return window.location.pathname || '/';
}

export function isOrbyHomePath(pathname = getOrbyPathname()) {
  const path = pathname || '/';
  return path === '/' || path === '/index.html';
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
