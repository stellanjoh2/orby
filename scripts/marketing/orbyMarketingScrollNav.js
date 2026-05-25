/**
 * Scroll-up reveal strip — fixed top nav on the marketing homepage.
 */
import { renderMarketingScrollNav } from './orbyMarketingTemplates.js';

/** Hide when near the top of the page (dropzone / hero). */
const HIDE_NEAR_TOP_Y = 48;
/** Page position — must be past hero seam before scroll-up can count toward reveal. */
const REVEAL_MIN_SCROLL_Y = 200;
/** Cumulative scroll-up (px) in one gesture before reveal fires — ignores 1–2px trackpad noise. */
const REVEAL_SCROLL_UP_ACCUM = 72;
const SCROLL_DELTA = 0.5;
const SHOW_DELAY_MS = 80;

/**
 * @param {{
 *   section: import('./orbyMarketingContent.js').MarketingSection | undefined;
 *   onScrollTop: () => void;
 * }} options
 */
export function initMarketingScrollNav(options) {
  const { section, onScrollTop } = options;
  if (!section) {
    return {
      nav: null,
      setHomeActive() {},
      destroy() {},
    };
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderMarketingScrollNav(section);
  const nav = wrapper.firstElementChild;
  if (!(nav instanceof HTMLElement)) {
    return {
      nav: null,
      setHomeActive() {},
      destroy() {},
    };
  }

  document.body.appendChild(nav);

  nav.addEventListener('click', (event) => {
    const browseBtn = event.target.closest('[data-orby-marketing-browse]');
    if (browseBtn) {
      event.preventDefault();
      document.getElementById('browseButton')?.click();
      return;
    }
    const topBtn = event.target.closest('[data-orby-marketing-scroll-top]');
    if (topBtn) {
      event.preventDefault();
      onScrollTop();
    }
  });

  let homeActive = true;
  let lastY = window.scrollY;
  let scrollUpAccum = 0;
  let showTimer = null;
  let ticking = false;

  const isNavVisible = () => nav.classList.contains('orby-marketing-scroll-nav--visible');

  const setVisible = (visible) => {
    nav.classList.toggle('orby-marketing-scroll-nav--visible', visible);
    if (visible) {
      nav.removeAttribute('aria-hidden');
    } else {
      nav.setAttribute('aria-hidden', 'true');
    }
  };

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

  window.addEventListener('scroll', onScroll, { passive: true });
  hide();

  return {
    nav,
    setHomeActive(active) {
      homeActive = active;
      if (active) {
        nav.removeAttribute('hidden');
        lastY = readScrollY();
        scrollUpAccum = 0;
      } else {
        hide();
        nav.setAttribute('hidden', '');
      }
    },
    destroy() {
      hide();
      window.removeEventListener('scroll', onScroll);
      nav.remove();
    },
  };
}
