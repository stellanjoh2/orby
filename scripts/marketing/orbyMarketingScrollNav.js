/**
 * Fixed top nav — marketing homepage (scroll-up reveal) and subpages (always visible).
 */
import { MARKETING_SECTIONS } from './orbyMarketingContent.js';
import { renderSiteNav } from './orbyMarketingTemplates.js';

/** Hide when near the top unless the user already revealed the nav by scrolling up. */
const HIDE_NEAR_TOP_Y = 48;
/** Page position — must be past hero seam before scroll-up can count toward reveal. */
const REVEAL_MIN_SCROLL_Y = 200;
/** Cumulative scroll-up (px) in one gesture before reveal fires — ignores 1–2px trackpad noise. */
const REVEAL_SCROLL_UP_ACCUM = 72;
const SCROLL_DELTA = 0.5;
const SHOW_DELAY_MS = 80;
/** Ignore reveal/hide toggles briefly after the scroll direction flips (fast up/down slams). */
const DIRECTION_SETTLE_MS = 170;
/** After animating out, hold off reveal so the bar does not bounce back in. */
const HIDE_COOLDOWN_MS = 300;
/** After reveal, hold off hide so a quick reversal does not snap the bar shut. */
const SHOW_COOLDOWN_MS = 240;

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
  siteNavStylesPromise = (async () => {
    for (const href of SITE_NAV_STYLE_HREFS) {
      await loadStylesheet(href);
    }
  })();
  return siteNavStylesPromise;
}

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

  const run = () => {
    if (destroyed) return;
    controller = initSiteNavNow({ section, onScrollTop, mode, base });
  };

  if (siteNavStylesPresent()) {
    run();
  } else {
    void ensureSiteNavStyles().then(run);
  }

  return {
    get nav() {
      return controller?.nav ?? null;
    },
    setHomeActive(active) {
      controller?.setHomeActive(active);
    },
    destroy() {
      destroyed = true;
      controller?.destroy();
    },
  };
}

/**
 * @param {{
 *   section: import('./orbyMarketingContent.js').MarketingSection;
 *   onScrollTop?: () => void;
 *   mode?: 'home' | 'subpage';
 *   base?: string;
 * }} options
 */
function initSiteNavNow(options) {
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

  let homeActive = true;
  let lastY = window.scrollY;
  let scrollUpAccum = 0;
  let showTimer = null;
  let ticking = false;
  /** @type {-1 | 0 | 1} -1 up, 1 down */
  let scrollDirection = 0;
  let directionChangedAt = 0;
  let lastHiddenAt = 0;
  let lastShownAt = 0;
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

  if (mode === 'subpage') {
    nav.classList.add('orby-marketing-scroll-nav--visible');
    nav.removeAttribute('aria-hidden');
  } else {
    setVisible(false);
  }

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
    if (!isNavVisible()) return;
    lastHiddenAt = performance.now();
    setVisible(false);
  };

  const scheduleShow = () => {
    if (showTimer != null || isNavVisible()) return;
    showTimer = window.setTimeout(() => {
      showTimer = null;
      scrollUpAccum = 0;
      lastShownAt = performance.now();
      setVisible(true);
    }, SHOW_DELAY_MS);
  };

  const readScrollY = () =>
    window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;

  const markDirection = (nextDirection) => {
    if (scrollDirection === nextDirection) return;
    scrollDirection = nextDirection;
    directionChangedAt = performance.now();
    scrollUpAccum = 0;
    if (showTimer != null) {
      window.clearTimeout(showTimer);
      showTimer = null;
    }
  };

  const directionIsSettled = () =>
    performance.now() - directionChangedAt >= DIRECTION_SETTLE_MS;

  const update = () => {
    ticking = false;
    if (!homeActive) return;

    const y = readScrollY();
    const delta = y - lastY;
    lastY = y;
    const now = performance.now();

    if (y < HIDE_NEAR_TOP_Y) {
      if (isNavVisible()) return;
      hide();
      return;
    }

    if (delta > SCROLL_DELTA) {
      markDirection(1);
      if (now - lastShownAt < SHOW_COOLDOWN_MS) return;
      hide();
      return;
    }

    if (delta < -SCROLL_DELTA) {
      markDirection(-1);
      if (!directionIsSettled()) return;
      if (now - lastHiddenAt < HIDE_COOLDOWN_MS) return;
      if (y < REVEAL_MIN_SCROLL_Y || isNavVisible()) return;

      scrollUpAccum += -delta;
      if (scrollUpAccum >= REVEAL_SCROLL_UP_ACCUM) {
        scheduleShow();
      }
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
        scrollUpAccum = 0;
        scrollDirection = 0;
        directionChangedAt = 0;
        lastHiddenAt = 0;
        lastShownAt = 0;
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
