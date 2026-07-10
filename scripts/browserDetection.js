/**
 * Shared browser detection — keep head boot scripts (orbySafariBrowserBoot.js,
 * orbyUnsupportedBrowserBoot.js) in sync with these helpers.
 */

/**
 * Sync-safe support check for head boot IIFEs.
 * @param {string} userAgent
 * @param {string} [vendor]
 * @returns {boolean}
 */
export function detectSupportedOrbyBrowser(userAgent, vendor = '') {
  const ua = userAgent || '';
  const isWebKitSafari = /Safari/i.test(ua) && /Apple Computer/i.test(vendor);
  const excludedSafariShells =
    /Chrome|CriOS|Chromium|Edg|EdgiOS|OPR|OPiOS|Firefox|FxiOS|SamsungBrowser/i.test(ua);
  const isSafari = isWebKitSafari && !excludedSafariShells;
  const isChromeOrBrave =
    /Chrome|CriOS/i.test(ua) &&
    !/Edg|EdgiOS|OPR|OPiOS|Firefox|FxiOS|SamsungBrowser/i.test(ua);
  return isSafari || isChromeOrBrave;
}

/** @returns {boolean} */
export function isSafariBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isWebKitSafari = /Safari/i.test(ua) && /Apple Computer/i.test(navigator.vendor || '');
  const excludedShells =
    /Chrome|CriOS|Chromium|Edg|EdgiOS|OPR|OPiOS|Firefox|FxiOS|SamsungBrowser/i.test(ua);
  return isWebKitSafari && !excludedShells;
}

/** Google Chrome or Brave (Chromium shells that are not Edge/Opera/Firefox/Samsung). */
export function isChromeOrBraveBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (!/Chrome|CriOS/i.test(ua)) return false;
  return !/Edg|EdgiOS|OPR|OPiOS|Firefox|FxiOS|SamsungBrowser/i.test(ua);
}

/** @returns {boolean} */
export function isSupportedOrbyBrowser() {
  if (typeof navigator === 'undefined') return false;
  return detectSupportedOrbyBrowser(navigator.userAgent, navigator.vendor || '');
}

/** @returns {boolean} */
export function isFirefoxBrowser() {
  if (typeof navigator === 'undefined') return false;
  return /Firefox|FxiOS/i.test(navigator.userAgent);
}

/** @returns {boolean} */
export function isChromiumBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Chrome|CriOS|Chromium|Edg|EdgiOS|OPR|OPiOS|SamsungBrowser/i.test(ua);
}

/**
 * Short label for unsupported-browser messaging.
 * @returns {string}
 */
export function getUnsupportedBrowserLabel() {
  if (typeof navigator === 'undefined') return 'This browser';
  const ua = navigator.userAgent;
  if (/Firefox|FxiOS/i.test(ua)) return 'Firefox';
  if (/Edg|EdgiOS/i.test(ua)) return 'Microsoft Edge';
  if (/OPR|OPiOS/i.test(ua)) return 'Opera';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  return 'This browser';
}
