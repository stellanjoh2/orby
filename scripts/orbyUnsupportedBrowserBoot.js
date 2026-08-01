/**
 * Unsupported browser gate — sync head bootstrap.
 * Allows Google Chrome, Brave, and Safari only.
 * Everyone else (Firefox, Edge, Opera, …) gets the VIP waitlist screen.
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
    return isSafari || isChromeOrBrave;
  }

  function getBrowserLabel() {
    var ua = navigator.userAgent || '';
    if (/Firefox|FxiOS/i.test(ua)) return 'Firefox';
    if (/Edg|EdgiOS/i.test(ua)) return 'Microsoft Edge';
    if (/OPR|OPiOS/i.test(ua)) return 'Opera';
    if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
    return 'This browser';
  }

  function mountUnsupportedBrowserGate() {
    if (!document.body || document.getElementById('orby-unsupported-browser-gate')) return;

    var label = getBrowserLabel();
    var gate = document.createElement('div');
    gate.id = 'orby-unsupported-browser-gate';
    gate.className = 'orby-unsupported-browser-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'orby-unsupported-browser-title');
    gate.innerHTML =
      '<div class="orby-unsupported-browser-gate__panel">' +
      '<h1 id="orby-unsupported-browser-title" class="orby-unsupported-browser-gate__title">VIP — coming soon</h1>' +
      '<p class="orby-unsupported-browser-gate__body">' +
      label +
      ' is VIP — support isn\'t ready yet. Orby currently works in <strong>Google Chrome</strong>, <strong>Brave</strong>, and <strong>Safari</strong>. Please switch to one of those browsers to use the site.</p>' +
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
