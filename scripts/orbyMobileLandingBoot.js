/**
 * Mobile landing — sync head bootstrap (index.html).
 * Applies html.mobile-landing before first paint; modules read window.__ORBY_MOBILE_LANDING__.
 *
 * Keep detection logic in sync with fallbacks in orbyMobileLanding.js (subpages without this script).
 *
 * Debug on desktop: ?orbyMobile=1, ?mobileLanding, sessionStorage orby_mobile_landing=1,
 * or window.__ORBY_DEBUG_MOBILE_LANDING__ = true before reload.
 */
(function (global) {
  var MOBILE_LANDING_MAX_WIDTH_PX = 768;
  var MOBILE_UA_RE =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

  function isForcedMobileLandingDebug() {
    try {
      if (global.__ORBY_DEBUG_MOBILE_LANDING__ === true) return true;
    } catch (e) {}
    try {
      if (global.sessionStorage && global.sessionStorage.getItem('orby_mobile_landing') === '1') {
        return true;
      }
    } catch (e) {}
    try {
      var q =
        typeof global.location !== 'undefined'
          ? new URLSearchParams(global.location.search)
          : null;
      if (q && (q.get('orbyMobile') === '1' || q.has('mobileLanding'))) return true;
    } catch (e) {}
    return false;
  }

  function isMobileDevice() {
    try {
      var ua = typeof global.navigator !== 'undefined' ? global.navigator.userAgent || '' : '';
      if (MOBILE_UA_RE.test(ua)) return true;
    } catch (e) {}
    try {
      if (
        global.matchMedia &&
        global.matchMedia('(max-width: ' + MOBILE_LANDING_MAX_WIDTH_PX + 'px)').matches
      ) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function shouldShowMobileLanding() {
    return isForcedMobileLandingDebug() || isMobileDevice();
  }

  function isMobileLanding() {
    return (
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('mobile-landing')
    );
  }

  function ensureMobileLandingClass() {
    if (typeof document === 'undefined' || !shouldShowMobileLanding()) return false;
    document.documentElement.classList.add('mobile-landing');
    return true;
  }

  function applyMobileLandingBootClasses() {
    if (typeof document === 'undefined' || !shouldShowMobileLanding()) return false;
    document.documentElement.classList.add('mobile-landing', 'orby-home-scroll');
    return true;
  }

  global.__ORBY_MOBILE_LANDING__ = {
    MOBILE_LANDING_MAX_WIDTH_PX: MOBILE_LANDING_MAX_WIDTH_PX,
    isForcedMobileLandingDebug: isForcedMobileLandingDebug,
    isMobileDevice: isMobileDevice,
    shouldShowMobileLanding: shouldShowMobileLanding,
    isMobileLanding: isMobileLanding,
    ensureMobileLandingClass: ensureMobileLandingClass,
    applyMobileLandingBootClasses: applyMobileLandingBootClasses,
  };

  applyMobileLandingBootClasses();
})(typeof window !== 'undefined' ? window : {});
