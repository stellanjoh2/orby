/**
 * Homepage marketing one-pager — mounted below the dropzone hero.
 * Kept separate from the studio runtime: lazy DOM, lazy CSS, no Three.js coupling.
 * `html.orby-marketing-reduced` is set from main.js via marketingPerformanceTier.js.
 */

import {
  MARKETING_ROOT_ID,
  MARKETING_SCROLL_CUE_ARIA_LABEL,
  SCROLL_CLASS,
  STYLES_HREF,
} from './orbyMarketingConstants.js';
import {
  bindMarketingCopyEmail,
  unbindMarketingCopyEmail,
} from './orbyMarketingCopyEmail.js';
import { buildMarketingMarkup } from './orbyMarketingTemplates.js';

/** Mega sections (intro + footer) — fire when the block is actually on screen */
const MEGA_REVEAL_IO = { root: null, rootMargin: '0px 0px -22% 0px', threshold: 0.32 };
const DEFAULT_REVEAL_IO = { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.08 };

function isMegaRevealSection(section) {
  return section.classList.contains('orby-marketing__section--mega');
}

let sectionsCache = null;

function shouldSkipMarketing() {
  if (document.documentElement.classList.contains('mobile-landing')) return true;
  const path = window.location.pathname || '/';
  return path !== '/' && path !== '/index.html';
}

function isDropzoneHome() {
  return document.body.classList.contains('dropzone-visible');
}

async function loadSections() {
  if (sectionsCache) return sectionsCache;
  const mod = await import('./orbyMarketingContent.js');
  sectionsCache = mod.MARKETING_SECTIONS;
  return sectionsCache;
}

function ensureStylesheet() {
  if (document.querySelector('link[data-orby-marketing-css]')) return;
  const version = document.querySelector('meta[name="orby-version"]')?.getAttribute('content');
  const href =
    version && version !== 'dev'
      ? `${STYLES_HREF}?v=${encodeURIComponent(version)}`
      : STYLES_HREF;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute('data-orby-marketing-css', '');
  document.head.appendChild(link);
}

function setScrollMode(enabled) {
  document.documentElement.classList.toggle(SCROLL_CLASS, enabled);
}

async function scrollToMarketing(scheduleMount) {
  await scheduleMount();
  const root = document.getElementById(MARKETING_ROOT_ID);
  if (!root) return;
  root.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindMarketingInteractions(root) {
  root.addEventListener('click', (event) => {
    const browseBtn = event.target.closest('[data-orby-marketing-browse]');
    if (browseBtn) {
      event.preventDefault();
      document.getElementById('browseButton')?.click();
      return;
    }
    const sampleBtn = event.target.closest('[data-orby-marketing-load-sample]');
    if (sampleBtn) {
      event.preventDefault();
      document.getElementById('loadTestLink')?.click();
      return;
    }
    const topBtn = event.target.closest('[data-orby-marketing-scroll-top]');
    if (topBtn) {
      event.preventDefault();
      scrollToTop();
    }
  });
}

function createScrollCue(onExplore) {
  const cue = document.createElement('button');
  cue.type = 'button';
  cue.className = 'orby-marketing-scroll-cue';
  cue.setAttribute('data-orby-marketing-scroll-cue', '');
  cue.setAttribute('aria-label', MARKETING_SCROLL_CUE_ARIA_LABEL);
  cue.innerHTML = '<span class="orby-marketing-scroll-cue__icon" aria-hidden="true"></span>';
  cue.addEventListener('click', () => {
    onExplore();
  });
  document.body.appendChild(cue);
  return cue;
}

/** Fade the scroll cue out quickly once the user scrolls down. */
function bindScrollCueFade(cue) {
  const fadeStart = 1;
  const fadeEnd = 48;
  let ticking = false;

  const update = () => {
    ticking = false;
    if (!cue || cue.hidden) return;
    const y = window.scrollY;
    if (y <= fadeStart) {
      cue.classList.remove('orby-marketing-scroll-cue--hidden');
      cue.style.removeProperty('opacity');
      cue.style.removeProperty('pointer-events');
      return;
    }
    const t = Math.min(1, (y - fadeStart) / (fadeEnd - fadeStart));
    cue.classList.toggle('orby-marketing-scroll-cue--hidden', t >= 1);
    cue.style.opacity = String(1 - t);
    if (t >= 1) cue.style.pointerEvents = 'none';
    else cue.style.removeProperty('pointer-events');
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  update();
  return () => window.removeEventListener('scroll', onScroll);
}

/**
 * @param {{ lazy?: boolean }} [options]
 */
export function initOrbyMarketingPage(options = {}) {
  if (shouldSkipMarketing()) {
    return { destroy() {} };
  }

  const lazy = options.lazy !== false;
  let root = null;
  let scrollCue = null;
  let teardownScrollCueFade = null;
  let mountPromise = null;
  let bodyObserver = null;
  let revealObserver = null;
  let megaRevealObserver = null;
  let revealModule = null;
  /** @type {(() => void) | null} */
  let teardownIntroTurntable = null;
  let teardownShowcaseGallery = null;
  /** @type {(() => void) | null} */
  let teardownPngMarqueeLogotype = null;
  /** @type {(() => void) | null} */
  let teardownPngMarqueePerf = null;
  /** @type {Comment | null} Placeholder when #orby-marketing is detached during studio. */
  let marketingAnchor = null;
  let destroyed = false;

  function releaseEnhancements() {
    teardownIntroTurntable?.();
    teardownIntroTurntable = null;
    teardownShowcaseGallery?.();
    teardownShowcaseGallery = null;
    teardownPngMarqueeLogotype?.();
    teardownPngMarqueeLogotype = null;
    teardownPngMarqueePerf?.();
    teardownPngMarqueePerf = null;
  }

  function disconnectRevealObservers() {
    revealObserver?.disconnect();
    revealObserver = null;
    megaRevealObserver?.disconnect();
    megaRevealObserver = null;
  }

  function attachRevealObserver() {
    if (!root || revealObserver || !revealModule) return;
    const onReveal = (observer, entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const section = entry.target;
        void revealModule.preloadSectionMedia(section).then(() => {
          revealModule.revealMarketingSection(section);
        });
        observer.unobserve(section);
      }
    };
    megaRevealObserver = new IntersectionObserver(
      (entries) => onReveal(megaRevealObserver, entries),
      MEGA_REVEAL_IO,
    );
    revealObserver = new IntersectionObserver(
      (entries) => onReveal(revealObserver, entries),
      DEFAULT_REVEAL_IO,
    );
    root.querySelectorAll('.orby-marketing__section').forEach((section) => {
      if (section.dataset.orbyMarketingRevealed === '1') return;
      const observer = isMegaRevealSection(section) ? megaRevealObserver : revealObserver;
      observer.observe(section);
    });
  }

  function detachMarketingFromDom() {
    if (!root?.parentElement || marketingAnchor) return;
    marketingAnchor = document.createComment('orby-marketing-anchor');
    root.parentElement.replaceChild(marketingAnchor, root);
  }

  function attachMarketingToDom() {
    if (!root || !marketingAnchor?.parentElement) return;
    marketingAnchor.parentElement.replaceChild(root, marketingAnchor);
    marketingAnchor = null;
  }

  function syncMarketingMedia(home) {
    if (!root) return;
    if (home) {
      revealModule?.resumeMarketingVideos?.(root);
      attachRevealObserver();
    } else {
      revealModule?.pauseMarketingVideos?.(root);
      disconnectRevealObservers();
    }
  }

  /** Each enhancer loads on its own — one failure must not block intro turntable, etc. */
  async function attachMarketingEnhancements() {
    if (!root || destroyed) return;

    releaseEnhancements();

    try {
      const introTurntable = await import('./orbyMarketingIntroTurntable.js');
      teardownIntroTurntable = introTurntable.initIntroTurntable(root);
      introTurntable.refreshIntroTurntableScrollTriggers();
    } catch (err) {
      console.error('[orby-marketing] intro turntable failed to init', err);
    }

    try {
      const showcaseGallery = await import('./orbyMarketingShowcaseGallery.js');
      teardownShowcaseGallery = showcaseGallery.initShowcaseGallery(root);
    } catch (err) {
      console.error('[orby-marketing] showcase gallery failed to init', err);
    }

    try {
      const pngLogotype = await import('./orbyMarketingPngMarqueeLogotype.js');
      teardownPngMarqueeLogotype = pngLogotype.initPngMarqueeLogotype(root);
    } catch (err) {
      console.error('[orby-marketing] PNG marquee logotype failed to init', err);
    }

    try {
      const pngMarquee = await import('./orbyMarketingPngMarquee.js');
      teardownPngMarqueePerf = pngMarquee.initPngMarqueePerformance(root);
    } catch (err) {
      console.error('[orby-marketing] PNG marquee performance hooks failed', err);
    }
  }

  function suspendForStudio() {
    if (!root) return;
    releaseEnhancements();
    revealModule?.cancelAllMarketingMotion?.(root);
    syncMarketingMedia(false);
    root.hidden = true;
    root.classList.add('orby-marketing--suspended');
    detachMarketingFromDom();
  }

  function resumeForHome() {
    attachMarketingToDom();
    if (!root) return;
    root.hidden = false;
    root.classList.remove('orby-marketing--suspended');
    setScrollMode(true);
    if (
      !teardownIntroTurntable ||
      !teardownShowcaseGallery ||
      !teardownPngMarqueeLogotype ||
      !teardownPngMarqueePerf
    ) {
      void attachMarketingEnhancements();
    }
    syncMarketingMedia(true);
  }

  function syncHomeState() {
    if (destroyed) return;
    const home = isDropzoneHome();
    if (scrollCue) {
      scrollCue.hidden = !home;
    }
    if (!root) {
      if (home) setScrollMode(true);
      return;
    }
    if (home) {
      resumeForHome();
    } else {
      setScrollMode(false);
      suspendForStudio();
    }
  }

  async function mount() {
    if (destroyed || root) return;
    ensureStylesheet();
    const [sections, reveals] = await Promise.all([
      loadSections(),
      import('./orbyMarketingReveals.js'),
    ]);
    revealModule = reveals;
    const app = document.getElementById('app');
    if (!app) return;

    root = document.createElement('div');
    root.id = MARKETING_ROOT_ID;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'About Orby');
    root.innerHTML = buildMarketingMarkup(sections);
    app.appendChild(root);
    bindMarketingInteractions(root);
    bindMarketingCopyEmail(root);

    root.querySelectorAll('.orby-marketing__section').forEach((section) => {
      section.classList.add('orby-marketing__section--pending');
    });
    reveals.prepareMarketingSections(root);
    attachRevealObserver();

    await attachMarketingEnhancements();

    syncHomeState();
  }

  function scheduleMount() {
    if (root) return Promise.resolve();
    if (mountPromise) return mountPromise;
    if (destroyed) return Promise.resolve();
    mountPromise = mount().finally(() => {
      mountPromise = null;
    });
    return mountPromise;
  }

  function onFirstScrollIntent() {
    if (!lazy || root) return;
    scheduleMount();
  }

  bodyObserver = new MutationObserver(syncHomeState);
  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener(
    'wheel',
    (event) => {
      if (!isDropzoneHome() || event.deltaY <= 0) return;
      onFirstScrollIntent();
    },
    { passive: true },
  );

  window.addEventListener(
    'touchmove',
    () => {
      if (!isDropzoneHome()) return;
      onFirstScrollIntent();
    },
    { passive: true, once: true },
  );

  scrollCue = createScrollCue(() => {
    scrollToMarketing(scheduleMount);
  });
  teardownScrollCueFade = bindScrollCueFade(scrollCue);
  if (lazy) {
    const runMount = () => {
      if (!destroyed && isDropzoneHome()) scheduleMount();
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(runMount, { timeout: 400 });
    } else {
      setTimeout(runMount, 200);
    }
  } else {
    scheduleMount();
  }

  syncHomeState();

  return {
    destroy() {
      destroyed = true;
      unbindMarketingCopyEmail();
      void import('./orbyMarketingIntroTurntable.js').then((mod) => {
        mod.clearIntroTurntablePreload();
      });
      releaseEnhancements();
      bodyObserver?.disconnect();
      disconnectRevealObservers();
      teardownScrollCueFade?.();
      teardownScrollCueFade = null;
      scrollCue?.remove();
      attachMarketingToDom();
      root?.remove();
      root = null;
      marketingAnchor = null;
      scrollCue = null;
      revealModule = null;
      setScrollMode(false);
    },
  };
}
