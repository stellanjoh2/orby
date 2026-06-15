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

  function isOrbyMobileLearnRoute() {
    try {
      var path =
        typeof global.location !== 'undefined'
          ? (global.location.pathname || '/').replace(/\/$/, '') || '/'
          : '/';
      return path === '/mobile/learn';
    } catch (e) {
      return false;
    }
  }

  function isOrbyMobileLandingRoute() {
    return isOrbyMobileLearnRoute();
  }

  function ensureOrbyMobileLandingBaseHref() {
    if (!isOrbyMobileLearnRoute()) return;
    try {
      var base = document.querySelector('base');
      if (!base) {
        base = document.createElement('base');
        document.head.insertBefore(base, document.head.firstChild);
      }
      base.setAttribute('href', '/');
    } catch (e) {}
  }

  function clearMobileAppSessionOnLanding() {
    if (!isOrbyMobileLearnRoute()) return;
    try {
      if (global.sessionStorage) {
        global.sessionStorage.removeItem('orby_mobile_active');
      }
      if (global.localStorage) {
        global.localStorage.removeItem('orby_mobile_active_persist');
      }
    } catch (e) {}
  }

  function shouldShowMobileLanding() {
    return isForcedMobileLandingDebug() || isMobileDevice() || isOrbyMobileLearnRoute();
  }

  function isMobileLanding() {
    return (
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('mobile-landing')
    );
  }

  function isLegalSubpage() {
    try {
      return (
        typeof document !== 'undefined' &&
        document.documentElement.classList.contains('orby-legal-site-nav')
      );
    } catch (e) {
      return false;
    }
  }

  function isLegalSubpageMobileViewport() {
    if (!isLegalSubpage()) return false;
    try {
      return (
        window.matchMedia &&
        window.matchMedia('(max-width: ' + MOBILE_LANDING_MAX_WIDTH_PX + 'px)').matches
      );
    } catch (e) {
      return false;
    }
  }

  function shouldApplyMobileLandingClasses() {
    return (
      shouldShowMobileLanding() ||
      isLegalSubpageMobileViewport() ||
      isOrbyMobileLearnRoute()
    );
  }

  function applyMobileLandingClasses() {
    if (typeof document === 'undefined' || !shouldApplyMobileLandingClasses()) {
      if (typeof document !== 'undefined' && isLegalSubpage()) {
        document.documentElement.classList.remove('mobile-landing');
      }
      return false;
    }
    document.documentElement.classList.add('mobile-landing');
    if (!isLegalSubpage()) {
      document.documentElement.classList.add('orby-home-scroll');
    }
    return true;
  }

  function ensureMobileLandingClass() {
    return applyMobileLandingClasses();
  }

  function applyMobileLandingBootClasses() {
    return applyMobileLandingClasses();
  }

  global.__ORBY_MOBILE_LANDING__ = {
    MOBILE_LANDING_MAX_WIDTH_PX: MOBILE_LANDING_MAX_WIDTH_PX,
    isForcedMobileLandingDebug: isForcedMobileLandingDebug,
    isMobileDevice: isMobileDevice,
    isOrbyMobileLearnRoute: isOrbyMobileLearnRoute,
    isOrbyMobileLandingRoute: isOrbyMobileLandingRoute,
    shouldShowMobileLanding: shouldShowMobileLanding,
    isMobileLanding: isMobileLanding,
    ensureMobileLandingClass: ensureMobileLandingClass,
    applyMobileLandingBootClasses: applyMobileLandingBootClasses,
  };

  ensureOrbyMobileLandingBaseHref();
  clearMobileAppSessionOnLanding();
  applyMobileLandingBootClasses();

  function syncLegalSubpageMobileLanding() {
    applyMobileLandingClasses();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', syncLegalSubpageMobileLanding, {
        once: true,
      });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('load', syncLegalSubpageMobileLanding, { once: true });
    }
  }

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    var legalMobileMql = window.matchMedia('(max-width: ' + MOBILE_LANDING_MAX_WIDTH_PX + 'px)');
    var onLegalMobileChange = function () {
      syncLegalSubpageMobileLanding();
    };
    syncLegalSubpageMobileLanding();
    if (typeof legalMobileMql.addEventListener === 'function') {
      legalMobileMql.addEventListener('change', onLegalMobileChange);
    } else if (typeof legalMobileMql.addListener === 'function') {
      legalMobileMql.addListener(onLegalMobileChange);
    }
  }

  function preloadMobileStylesheet(href, attr) {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].href && links[i].href.indexOf(href) !== -1) return;
    }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(attr, '');
    document.head.appendChild(link);
  }

  function resolveAssetBase() {
    try {
      var script = document.currentScript;
      var src = script && (script.getAttribute('src') || script.src || '');
      if (src) {
        var base = src.replace(/scripts\/orbyMobileLandingBoot\.js(?:\?.*)?$/, '');
        if (base && base !== src) return base;
      }
    } catch (e) {}
    return './';
  }

  function preloadMobileScrollNavStyles() {
    if (!shouldApplyMobileLandingClasses()) return;
    var base = resolveAssetBase();
    preloadMobileStylesheet(
      base + 'styles/marketing/13-scroll-nav.css',
      'data-orby-mobile-scroll-nav-css',
    );
    preloadMobileStylesheet(
      base + 'styles/orby-mobile-landing-shell.css',
      'data-orby-mobile-shell-css',
    );
    preloadMobileStylesheet(
      base + 'styles/marketing/15-mobile.css',
      'data-orby-mobile-marketing-css',
    );
    preloadMobileStylesheet(
      base + 'styles/marketing/15-subpage-mobile-nav.css',
      'data-orby-mobile-subpage-nav-css',
    );
  }

  preloadMobileScrollNavStyles();
})(typeof window !== 'undefined' ? window : {});
