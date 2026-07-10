/**
 * System font access — Local Font Access API (Chromium) or Safari directory pick.
 */

/** @returns {boolean} */
export function hasQueryLocalFonts() {
  return typeof window !== 'undefined' && 'queryLocalFonts' in window;
}

/** Desktop Safari (not Chromium/Firefox shells, not iOS). */
export function isSafariDesktop() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isWebKitSafari = /Safari/i.test(ua) && /Apple Computer/i.test(navigator.vendor || '');
  const excludedShells =
    /Chrome|CriOS|Chromium|Edg|EdgiOS|OPR|OPiOS|Firefox|FxiOS|SamsungBrowser/i.test(ua);
  return isWebKitSafari && !excludedShells && !/iPhone|iPad|iPod/i.test(ua);
}

/** Safari macOS can enumerate fonts via `<input webkitdirectory>`. */
export function supportsSafariDirectoryFontPick() {
  if (!isSafariDesktop()) return false;
  const input = document.createElement('input');
  return 'webkitdirectory' in input;
}

/** Type Creator "Allow system fonts" — Chromium LFA or Safari directory flow. */
export function supportsSystemFontAccess() {
  return hasQueryLocalFonts() || supportsSafariDirectoryFontPick();
}
