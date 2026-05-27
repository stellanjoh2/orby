/**
 * Marketing top nav on standalone legal / docs pages (privacy, about, support, …).
 */
import { MARKETING_SECTIONS } from './orbyMarketingContent.js';
import { renderLegalSiteNav } from './orbyMarketingTemplates.js';

/**
 * @param {string} pathname
 */
function normalizeSitePath(pathname) {
  let path = pathname.replace(/\/index\.html$/i, '/');
  if (!path.endsWith('/')) path += '/';
  return path;
}

/**
 * @param {HTMLElement} nav
 */
function markActiveSiteNavLink(nav) {
  const current = normalizeSitePath(window.location.pathname);
  nav.querySelectorAll('.orby-marketing-scroll-nav__link').forEach((el) => {
    if (!(el instanceof HTMLAnchorElement)) return;
    const href = el.getAttribute('href');
    if (!href) return;
    let linkPath;
    try {
      linkPath = normalizeSitePath(new URL(href, window.location.href).pathname);
    } catch {
      return;
    }
    if (linkPath === current) {
      el.setAttribute('aria-current', 'page');
    } else {
      el.removeAttribute('aria-current');
    }
  });
}

/**
 * @param {{ section?: import('./orbyMarketingContent.js').MarketingSection, base?: string }} [options]
 */
export function initLegalSiteNav(options = {}) {
  if (!document.body.classList.contains('legal-doc')) return null;

  const section =
    options.section ?? MARKETING_SECTIONS.find((entry) => entry.type === 'cta');
  if (!section) return null;

  const base =
    options.base?.trim() ||
    document.documentElement.dataset.orbySiteBase?.trim() ||
    '../';

  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderLegalSiteNav(section, base);
  const nav = wrapper.firstElementChild;
  if (!(nav instanceof HTMLElement)) return null;

  document.documentElement.classList.add('orby-legal-site-nav');
  document.body.prepend(nav);
  markActiveSiteNavLink(nav);

  nav.addEventListener('click', (event) => {
    const browseBtn = event.target.closest('[data-orby-legal-browse]');
    if (!(browseBtn instanceof HTMLElement)) return;
    const href = browseBtn.dataset.orbyLegalBrowse?.trim();
    if (!href) return;
    event.preventDefault();
    window.location.assign(href);
  });

  return nav;
}

if (document.body.classList.contains('legal-doc')) {
  initLegalSiteNav();
}
