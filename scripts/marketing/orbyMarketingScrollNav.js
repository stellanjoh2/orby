/**
 * Fixed top nav — marketing homepage (scroll-up reveal) and subpages (always visible).
 */
import { MARKETING_SECTIONS } from './orbyMarketingContent.js';
import { renderSiteNav } from './orbyMarketingTemplates.js';

/** Hide when near the top of the page (dropzone / hero). */
const HIDE_NEAR_TOP_Y = 48;
/** Page position — must be past hero seam before scroll-up can count toward reveal. */
const REVEAL_MIN_SCROLL_Y = 200;
/** Cumulative scroll-up (px) in one gesture before reveal fires — ignores 1–2px trackpad noise. */
const REVEAL_SCROLL_UP_ACCUM = 72;
const SCROLL_DELTA = 0.5;
const SHOW_DELAY_MS = 80;

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
  const cssMax = Math.max(window.innerWidth || 0, window.innerHeight || 0);
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const widthForRamp = cssMax >= 2300 ? cssMax : cssMax * dpr;
  const t = Math.max(0, Math.min(1, (widthForRamp - 2560) / 1280));
  const typeScale = 1 + 0.375 * t;
  const maxWidth = 896 + 544 * t;
  const ultraWideFactor = 1 + 0.5 * t;
  document.documentElement.style.setProperty('--legal-ultra-scale', typeScale.toFixed(4));
  document.documentElement.style.setProperty('--legal-max', `${maxWidth.toFixed(2)}px`);
  document.documentElement.style.setProperty('--orby-ultra-wide-factor', ultraWideFactor.toFixed(4));
  document.documentElement.style.setProperty('--orby-ultra-wide-max-factor', '1.5');
  document.documentElement.style.setProperty('--orby-home-full-width', '2560px');
  document.documentElement.style.setProperty('--orby-marketing-split-media-ref-width', '2560px');
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

  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderSiteNav(section, base);
  const nav = wrapper.firstElementChild;
  if (!(nav instanceof HTMLElement)) {
    return {
      nav: null,
      setHomeActive() {},
      destroy() {},
    };
  }

  let homeActive = true;
  let lastY = window.scrollY;
  let scrollUpAccum = 0;
  let showTimer = null;
  let ticking = false;
  /** @type {(() => void) | null} */
  let onSubpageResize = null;

  const setVisible = (visible) => {
    nav.classList.toggle('orby-marketing-scroll-nav--visible', visible);
    if (visible) {
      nav.removeAttribute('aria-hidden');
    } else {
      nav.setAttribute('aria-hidden', 'true');
    }
  };

  const isNavVisible = () => nav.classList.contains('orby-marketing-scroll-nav--visible');

  setVisible(false);
  if (mode === 'subpage') {
    nav.classList.add('orby-marketing-scroll-nav--visible');
  }
  document.body.appendChild(nav);

  const homeHref = resolveHomeHref(base);
  if (mode === 'subpage') {
    markActiveSiteNavLink(nav);
    document.documentElement.classList.add('orby-legal-site-nav');
    syncSubpageNavOffset(nav);
    syncSubpageScale();
  }

  nav.addEventListener('click', (event) => {
    const browseBtn = event.target.closest('[data-orby-marketing-browse]');
    if (browseBtn) {
      event.preventDefault();
      if (mode === 'subpage') {
        window.location.assign(homeHref);
      } else {
        document.getElementById('browseButton')?.click();
      }
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

  const hide = () => {
    if (showTimer != null) {
      window.clearTimeout(showTimer);
      showTimer = null;
    }
    scrollUpAccum = 0;
    setVisible(false);
  };

  const scheduleShow = () => {
    if (showTimer != null || isNavVisible()) return;
    showTimer = window.setTimeout(() => {
      showTimer = null;
      scrollUpAccum = 0;
      setVisible(true);
    }, SHOW_DELAY_MS);
  };

  const readScrollY = () =>
    window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;

  const update = () => {
    ticking = false;
    if (!homeActive) return;

    const y = readScrollY();
    const delta = y - lastY;
    lastY = y;

    if (y < HIDE_NEAR_TOP_Y) {
      hide();
      return;
    }

    if (delta > SCROLL_DELTA) {
      hide();
      return;
    }

    if (delta < -SCROLL_DELTA && y >= REVEAL_MIN_SCROLL_Y && !isNavVisible()) {
      scrollUpAccum += -delta;
      if (scrollUpAccum >= REVEAL_SCROLL_UP_ACCUM) {
        scheduleShow();
      }
      return;
    }

    if (Math.abs(delta) <= SCROLL_DELTA) {
      return;
    }
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  if (mode === 'home') {
    window.addEventListener('scroll', onScroll, { passive: true });
    hide();
  } else {
    onSubpageResize = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        syncSubpageNavOffset(nav);
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
        scrollUpAccum = 0;
        if (lastY < HIDE_NEAR_TOP_Y) hide();
      } else {
        hide();
        nav.setAttribute('hidden', '');
      }
    },
    destroy() {
      hide();
      window.removeEventListener('scroll', onScroll);
      if (onSubpageResize) {
        window.removeEventListener('resize', onSubpageResize);
        window.removeEventListener('orientationchange', onSubpageResize);
      }
      nav.remove();
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
