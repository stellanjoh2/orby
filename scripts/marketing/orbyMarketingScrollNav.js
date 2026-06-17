/**
 * Fixed top nav — marketing homepage (scroll-up reveal) and subpages (always visible).
 */
import { MARKETING_SECTIONS } from './orbyMarketingContent.js';
import { ensureMobileLandingClass, isMobileLanding } from '../orbyMobileLanding.js';
import { isOrbyMobileLearnRoute, orbyMobileGateUrl } from '../orbyMobileAppRoute.js';
import { ensureSiteNavStyles } from './orbySiteNavStyles.js';
import { renderSiteNav } from './orbyMarketingTemplates.js';
import { subscribeMarketingScroll } from './orbyMarketingScrollDispatcher.js';

/** Hero strip — nav stays hidden while the dropzone headline is in view. */
const HIDE_NEAR_TOP_Y = 48;
const SCROLL_DELTA = 0.5;
const SHOW_DELAY_MS = 60;

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
 * @param {string} base
 */
function resolveHomeHref(base) {
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}index.html`;
}

/**
 * @param {HTMLElement} nav
 */
function syncSubpageNavOffset(nav) {
  const height = Math.ceil(nav.getBoundingClientRect().height || 0);
  const extra = 108;
  document.documentElement.style.setProperty('--orby-legal-nav-offset', `${height + extra}px`);
}

function syncSubpageScale() {
  /* Ultra-wide tokens live in orby-site-nav.css on html.orby-legal-site-nav — keep in sync on resize. */
  const vw = Math.max(window.innerWidth || 0, 0);
  const t = Math.max(0, Math.min(1, (vw - 2560) / 1280));
  const typeScale = 1 + 0.375 * t;
  const maxWidth = 896 + 544 * t;
  const ultraWideFactor = 1 + 0.5 * t;
  const root = document.documentElement;
  root.style.setProperty('--legal-ultra-scale', typeScale.toFixed(4));
  root.style.setProperty('--legal-max', `${maxWidth.toFixed(2)}px`);
  root.style.setProperty('--orby-ultra-wide-factor', ultraWideFactor.toFixed(4));
  root.style.setProperty('--orby-ultra-wide-max-factor', '1.5');
  root.style.setProperty('--orby-home-full-width', '2560px');
  root.style.setProperty('--orby-marketing-split-media-ref-width', '2560px');
}

function scheduleSubpageNavOffsetSync(nav) {
  syncSubpageNavOffset(nav);
  document.fonts?.ready?.then(() => {
    syncSubpageNavOffset(nav);
  });
}

function isMobileNavContext() {
  if (isMobileLanding()) return true;
  if (!document.documentElement.classList.contains('orby-legal-site-nav')) return false;
  try {
    return window.matchMedia('(max-width: 768px)').matches;
  } catch {
    return false;
  }
}

function initMobileNavMenu(nav) {
  if (!isMobileNavContext()) {
    return () => {};
  }

  const toggle = nav.querySelector('[data-orby-marketing-nav-toggle]');
  const menu = nav.querySelector('[data-orby-marketing-nav-menu]');
  if (!(toggle instanceof HTMLButtonElement) || !(menu instanceof HTMLElement)) {
    return () => {};
  }

  menu.setAttribute('aria-hidden', 'true');
  menu.inert = true;

  const close = () => {
    nav.classList.remove('orby-marketing-scroll-nav--menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    menu.setAttribute('aria-hidden', 'true');
    menu.inert = true;
    document.documentElement.classList.remove('orby-nav-menu-open');
  };

  const open = () => {
    nav.classList.add('orby-marketing-scroll-nav--menu-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    menu.setAttribute('aria-hidden', 'false');
    menu.inert = false;
    document.documentElement.classList.add('orby-nav-menu-open');
  };

  const onToggleClick = (event) => {
    event.preventDefault();
    if (nav.classList.contains('orby-marketing-scroll-nav--menu-open')) close();
    else open();
  };

  const onMenuClick = (event) => {
    if (
      event.target.closest(
        '.orby-marketing-scroll-nav__link, .orby-marketing-scroll-nav__contact, .orby-marketing-scroll-nav__menu-social-link',
      )
    ) {
      close();
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') close();
  };

  toggle.addEventListener('click', onToggleClick);
  menu.addEventListener('click', onMenuClick);
  document.addEventListener('keydown', onKeyDown);

  return () => {
    close();
    toggle.removeEventListener('click', onToggleClick);
    menu.removeEventListener('click', onMenuClick);
    document.removeEventListener('keydown', onKeyDown);
  };
}

/**
 * @param {{
 *   section: import('./orbyMarketingContent.js').MarketingSection | undefined;
 *   onScrollTop?: () => void;
 *   mode?: 'home' | 'subpage';
 *   base?: string;
 * }} options
 */
export function initSiteNav(options) {
  const {
    section,
    onScrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' }),
    mode = 'home',
    base = './',
  } = options;
  if (!section) {
    return {
      nav: null,
      setHomeActive() {},
      destroy() {},
    };
  }

  /** @type {ReturnType<typeof initSiteNav> | null} */
  let controller = null;
  let destroyed = false;
  let pendingHomeActive = true;

  const run = () => {
    if (destroyed || controller) return;
    controller = initSiteNavNow({ section, onScrollTop, mode, base, homeActive: pendingHomeActive });
  };

  // Attach scroll logic immediately — CSS can load in parallel.
  run();
  void ensureSiteNavStyles();

  return {
    get nav() {
      return controller?.nav ?? null;
    },
    setHomeActive(active) {
      pendingHomeActive = active;
      controller?.setHomeActive(active);
    },
    destroy() {
      destroyed = true;
      controller?.destroy();
      controller = null;
    },
  };
}

/**
 * @param {{
 *   section: import('./orbyMarketingContent.js').MarketingSection;
 *   onScrollTop?: () => void;
 *   mode?: 'home' | 'subpage';
 *   base?: string;
 *   homeActive?: boolean;
 * }} options
 */
function initSiteNavNow(options) {
  const {
    section,
    onScrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' }),
    mode = 'home',
    base = './',
    homeActive: initialHomeActive = true,
  } = options;
  if (!section) {
    return {
      nav: null,
      setHomeActive() {},
      destroy() {},
    };
  }

  let nav = document.querySelector('[data-orby-marketing-scroll-nav]');
  let navCreated = false;
  if (!(nav instanceof HTMLElement)) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderSiteNav(section, base);
    nav = wrapper.firstElementChild;
    if (!(nav instanceof HTMLElement)) {
      return {
        nav: null,
        setHomeActive() {},
        destroy() {},
      };
    }
    navCreated = true;
    document.body.appendChild(nav);
  }

  let homeActive = initialHomeActive;
  let showTimer = null;
  let ticking = false;
  /** @type {(() => void) | null} */
  let onSubpageResize = null;
  /** @type {(() => void) | null} */
  let unsubscribeScroll = null;

  const setVisible = (visible) => {
    nav.classList.toggle('orby-marketing-scroll-nav--visible', visible);
    if (visible) {
      nav.removeAttribute('aria-hidden');
    } else {
      nav.setAttribute('aria-hidden', 'true');
    }
  };

  const isNavVisible = () => nav.classList.contains('orby-marketing-scroll-nav--visible');

  /** @type {(() => void) | null} */
  let teardownMobileNavMenu = null;

  const isMobileHome = mode === 'home' && isMobileLanding();

  if (mode === 'subpage') {
    nav.classList.add('orby-marketing-scroll-nav--visible');
    nav.removeAttribute('aria-hidden');
  } else if (isMobileHome) {
    nav.classList.add('orby-marketing-scroll-nav--visible', 'orby-marketing-scroll-nav--mobile-fixed');
    nav.removeAttribute('aria-hidden');
  } else {
    setVisible(false);
  }

  if (mode === 'subpage') {
    ensureMobileLandingClass();
  }
  teardownMobileNavMenu = initMobileNavMenu(nav);

  const homeHref = resolveHomeHref(base);
  if (mode === 'subpage') {
    markActiveSiteNavLink(nav);
    document.documentElement.classList.add('orby-legal-site-nav');
    scheduleSubpageNavOffsetSync(nav);
  }

  nav.addEventListener('click', (event) => {
    const browseBtn = event.target.closest('[data-orby-marketing-browse]');
    if (browseBtn) {
      event.preventDefault();
      if (isOrbyMobileLearnRoute()) {
        window.location.assign(`${orbyMobileGateUrl()}/`);
        return;
      }
      if (mode === 'subpage' && isMobileLanding()) {
        window.location.assign('/?browse=1');
        return;
      }
      document.getElementById('browseButton')?.click();
      return;
    }
    const topBtn = event.target.closest('[data-orby-marketing-scroll-top]');
    if (topBtn) {
      event.preventDefault();
      if (mode === 'subpage') {
        window.location.assign(homeHref);
      } else {
        onScrollTop();
      }
    }
  });

  function readScrollY() {
    return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  let lastY = readScrollY();

  const hide = () => {
    if (isMobileHome) return;
    if (showTimer != null) {
      window.clearTimeout(showTimer);
      showTimer = null;
    }
    if (!isNavVisible()) return;
    setVisible(false);
  };

  const scheduleShow = () => {
    if (showTimer != null || isNavVisible()) return;
    showTimer = window.setTimeout(() => {
      showTimer = null;
      setVisible(true);
    }, SHOW_DELAY_MS);
  };

  const update = () => {
    if (!homeActive || isMobileHome) return;

    const y = readScrollY();
    const delta = y - lastY;
    lastY = y;

    if (y <= HIDE_NEAR_TOP_Y) {
      hide();
      return;
    }

    if (delta > SCROLL_DELTA) {
      hide();
      return;
    }

    if (delta < -SCROLL_DELTA) {
      scheduleShow();
    }
  };

  if (mode === 'home' && !isMobileHome) {
    unsubscribeScroll = subscribeMarketingScroll(update);
    setVisible(false);
  } else if (mode === 'subpage') {
    onSubpageResize = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        scheduleSubpageNavOffsetSync(nav);
        syncSubpageScale();
      });
    };
    window.addEventListener('resize', onSubpageResize, { passive: true });
    window.addEventListener('orientationchange', onSubpageResize, { passive: true });
  }

  return {
    nav,
    setHomeActive(active) {
      homeActive = active;
      if (active) {
        nav.removeAttribute('hidden');
        lastY = readScrollY();
        if (lastY <= HIDE_NEAR_TOP_Y && !isMobileHome) hide();
      } else {
        hide();
        nav.setAttribute('hidden', '');
      }
    },
    destroy() {
      hide();
      teardownMobileNavMenu?.();
      teardownMobileNavMenu = null;
      unsubscribeScroll?.();
      unsubscribeScroll = null;
      if (onSubpageResize) {
        window.removeEventListener('resize', onSubpageResize);
        window.removeEventListener('orientationchange', onSubpageResize);
      }
      if (navCreated) nav.remove();
    },
  };
}

/**
 * Backward-compatible alias for homepage nav setup.
 * @param {{
 *   section: import('./orbyMarketingContent.js').MarketingSection | undefined;
 *   onScrollTop: () => void;
 * }} options
 */
export function initMarketingScrollNav(options) {
  return initSiteNav({ ...options, mode: 'home' });
}

if (document.body.classList.contains('legal-doc')) {
  const section = MARKETING_SECTIONS.find((entry) => entry.type === 'cta');
  const base = document.documentElement.dataset.orbySiteBase?.trim() || '../';
  initSiteNav({ section, mode: 'subpage', base });
}
