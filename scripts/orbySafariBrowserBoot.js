/**
 * Safari browser class — sync head bootstrap (index.html).
 * Applies html.safari-browser before styles.css so marketing/studio Safari
 * fallbacks (blur off, magic-button paths, etc.) apply at first paint.
 *
 * Keep detection in sync with isSafariBrowser() in scripts/browserDetection.js.
 */
(function () {
  var ua = navigator.userAgent;
  var isWebKitSafari = /Safari/i.test(ua) && /Apple Computer/i.test(navigator.vendor || '');
  var excludedShells =
    /Chrome|CriOS|Chromium|Edg|EdgiOS|OPR|OPiOS|Firefox|FxiOS|SamsungBrowser/i.test(ua);
  if (isWebKitSafari && !excludedShells) {
    document.documentElement.classList.add('safari-browser');
  }
})();
