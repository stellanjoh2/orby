/** About page — Safari class for magic-button fallbacks (no scroll animations). */
const ua = navigator.userAgent;
const isSafari =
  /Safari/i.test(ua) &&
  !/Chrome|CriOS|Chromium|Edg|EdgiOS|OPR|OPiOS|Firefox|FxiOS|SamsungBrowser/i.test(ua);
if (isSafari) document.documentElement.classList.add('safari-browser');
