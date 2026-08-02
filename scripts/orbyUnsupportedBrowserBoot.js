/**
 * Unsupported browser gate — sync head bootstrap.
 * Allows Google Chrome, Brave, and Safari only.
 * On Orby Mobile routes, also allows iOS Apple WebKit in-app browsers (e.g. X),
 * which often omit "Safari" from the UA.
 * Everyone else (Firefox, Edge, Opera, …) gets the unsupported-browser screen.
 *
 * Bypass: ?orbyBrowser=1 or window.__ORBY_DEBUG_BROWSER_GATE__ = true
 *
 * Keep detection in sync with detectSupportedOrbyBrowser() in scripts/browserDetection.js.
 */
(function () {
  function shouldBypassBrowserGate() {
    if (typeof window !== 'undefined' && window.__ORBY_DEBUG_BROWSER_GATE__ === true) {
      return true;
    }
    try {
      var q = new URLSearchParams(location.search);
      if (q.get('orbyBrowser') === '1') return true;
    } catch (e) {}
    return false;
  }

  function isOrbyMobilePath() {
    try {
      var path = (location.pathname || '/').replace(/\/$/, '') || '/';
      return path === '/mobile' || path.indexOf('/mobile/') === 0;
    } catch (e) {
      return false;
    }
  }

  function isIosAppleWebKitBrowser(ua, vendor) {
    if (!/iPhone|iPod|iPad/i.test(ua)) return false;
    if (!/AppleWebKit/i.test(ua) || !/Apple Computer/i.test(vendor)) return false;
    return !/Chrome|CriOS|Chromium|Edg|EdgiOS|OPR|OPiOS|Firefox|FxiOS|SamsungBrowser/i.test(
      ua,
    );
  }

  function isSupportedBrowser() {
    var ua = navigator.userAgent || '';
    var vendor = navigator.vendor || '';
    var isWebKitSafari = /Safari/i.test(ua) && /Apple Computer/i.test(vendor);
    var excludedSafariShells =
      /Chrome|CriOS|Chromium|Edg|EdgiOS|OPR|OPiOS|Firefox|FxiOS|SamsungBrowser/i.test(ua);
    var isSafari = isWebKitSafari && !excludedSafariShells;
    var isChromeOrBrave =
      /Chrome|CriOS/i.test(ua) &&
      !/Edg|EdgiOS|OPR|OPiOS|Firefox|FxiOS|SamsungBrowser/i.test(ua);
    if (isSafari || isChromeOrBrave) return true;
    // Orby Mobile: allow iOS in-app WebKit (X, etc.) without a Safari UA token.
    if (isOrbyMobilePath() && isIosAppleWebKitBrowser(ua, vendor)) return true;
    return false;
  }

  function mountUnsupportedBrowserGate() {
    if (!document.body || document.getElementById('orby-unsupported-browser-gate')) return;

    var gate = document.createElement('div');
    gate.id = 'orby-unsupported-browser-gate';
    gate.className = 'orby-unsupported-browser-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'orby-unsupported-browser-title');
    gate.innerHTML =
      '<div class="orby-unsupported-browser-gate__panel">' +
      '<h1 id="orby-unsupported-browser-title" class="orby-unsupported-browser-gate__title">Browser not supported</h1>' +
      '<p class="orby-unsupported-browser-gate__body">' +
      'Orby currently works in <strong>Google Chrome</strong>, <strong>Brave</strong>, and <strong>Safari</strong>. Please open this site in one of those browsers.</p>' +
      '</div>';
    document.body.appendChild(gate);
    document.documentElement.classList.add('orby-browser-gate-open');
  }

  if (shouldBypassBrowserGate() || isSupportedBrowser()) return;

  document.documentElement.classList.add('orby-unsupported-browser');
  window.__ORBY_UNSUPPORTED_BROWSER__ = true;

  if (document.body) mountUnsupportedBrowserGate();
  else document.addEventListener('DOMContentLoaded', mountUnsupportedBrowserGate);
})();
