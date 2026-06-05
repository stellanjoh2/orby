/**
 * Shared site nav stylesheets — homepage lazy-loads before marketing CSS; subpages link in HTML.
 */

const SITE_NAV_STYLE_HREFS = [
  './styles/orby-magic-btn.css',
  './styles/marketing/13-scroll-nav.css',
  './styles/orby-ultra-wide-home.css',
  './styles/marketing/14-ultra-wide.css',
  './styles/orby-site-nav.css',
];

/** @type {Promise<void> | null} */
let siteNavStylesPromise = null;

function siteNavStylesPresent() {
  return Boolean(document.querySelector('link[rel="stylesheet"][href*="13-scroll-nav.css"]'));
}

function loadStylesheet(href) {
  const existing = document.querySelector(
    `link[rel="stylesheet"][href="${href}"], link[rel="stylesheet"][href^="${href}?"]`,
  );
  if (existing instanceof HTMLLinkElement) {
    if (existing.sheet) return Promise.resolve();
    return new Promise((resolve) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => resolve(), { once: true });
    });
  }
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-orby-site-nav-css', '');
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    document.head.appendChild(link);
  });
}

/** Lazy-load scroll-nav CSS on the homepage (subpages link it in HTML). */
export function ensureSiteNavStyles() {
  if (siteNavStylesPresent()) return Promise.resolve();
  if (siteNavStylesPromise) return siteNavStylesPromise;
  siteNavStylesPromise = Promise.all(SITE_NAV_STYLE_HREFS.map((href) => loadStylesheet(href))).then(
    () => {},
  );
  return siteNavStylesPromise;
}
