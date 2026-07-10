/**
 * Homepage marketing one-pager — mounted below the dropzone hero.
 * Kept separate from the studio runtime: idle-mounted DOM/CSS, no Three.js coupling.
 * `html.orby-marketing-reduced` is set from main.js via marketingPerformanceTier.js.
 * `html.orby-marketing-ui-crop` (?uiCrop=1) is toggled from main.js at boot.
 */

import {
  MARKETING_ROOT_ID,
  MARKETING_SCROLL_CUE_ARIA_LABEL,
  SCROLL_CLASS,
  STYLES_HREF,
} from './orbyMarketingConstants.js';
import { isMobileLanding } from '../orbyMobileLanding.js';
import { isOrbyHomePath } from '../orbyRoute.js';
import { isOrbyMobileLearnRoute, orbyMobileGateUrl } from '../orbyMobileAppRoute.js';
import {
  bindMarketingCopyEmail,
  unbindMarketingCopyEmail,
} from './orbyMarketingCopyEmail.js';
import { buildMarketingMarkup } from './orbyMarketingTemplates.js';
import { ensureSiteNavStyles } from './orbySiteNavStyles.js';
import { subscribeMarketingScroll } from './orbyMarketingScrollDispatcher.js';
import { blockTabletStudioAccess } from '../orbyTabletGate.js';
import { teardownTabletDesktopOnlyModalUi } from '../ui/orbyTabletDesktopOnlyModal.js';

/** Mega sections (intro + CTA) — fire when the block is actually on screen */
const MEGA_REVEAL_IO = { root: null, rootMargin: '0px 0px -22% 0px', threshold: 0.32 };
const DEFAULT_REVEAL_IO = { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.08 };

function isMegaRevealSection(section) {
  return section.classList.contains('orby-marketing__section--mega');
}

let sectionsCache = null;

function shouldSkipMarketing() {
  return !isOrbyHomePath();
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

/** Mobile landing hides roadmap in CSS — omit markup and reveal work entirely. */
function sectionsForMarkup(sections) {
  if (!isMobileLanding()) return sections;
  return sections.filter((section) => section.type !== 'roadmap');
}

/** @returns {Promise<void>} */
function ensureStylesheet() {
  const existing = document.querySelector('link[data-orby-marketing-css]');
  if (existing instanceof HTMLLinkElement) {
    if (existing.sheet) return Promise.resolve();
    return new Promise((resolve) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => resolve(), { once: true });
    });
  }
  const version = document.querySelector('meta[name="orby-version"]')?.getAttribute('content');
  const href =
    version && version !== 'dev'
      ? `${STYLES_HREF}?v=${encodeURIComponent(version)}`
      : `${STYLES_HREF}?dev=${Date.now()}`;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute('data-orby-marketing-css', '');
  return new Promise((resolve) => {
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    document.head.appendChild(link);
  });
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

function navigateMobileLearnBrowse() {
  window.location.assign(`${orbyMobileGateUrl()}/`);
}

function bindMarketingInteractions(root) {
  root.addEventListener('click', (event) => {
    const browseBtn = event.target.closest('[data-orby-marketing-browse]');
    if (browseBtn) {
      event.preventDefault();
      if (isOrbyMobileLearnRoute()) {
        navigateMobileLearnBrowse();
        return;
      }
      if (blockTabletStudioAccess()) return;
      document.getElementById('browseButton')?.click();
      return;
    }
    const sampleBtn = event.target.closest('[data-orby-marketing-load-sample]');
    if (sampleBtn) {
      event.preventDefault();
      if (blockTabletStudioAccess()) return;
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
  cue.innerHTML =
    '<span class="orby-marketing-scroll-cue__label">Learn More</span><span class="orby-marketing-scroll-cue__icon" aria-hidden="true"></span>';
  cue.addEventListener('click', () => {
    onExplore();
  });
  document.body.appendChild(cue);
  return cue;
}

/** Fade the scroll cue out quickly once the user scrolls down. */
function bindScrollCueFade(cue) {
  const fadeThreshold = 48;

  const update = () => {
    if (!cue || cue.hidden) return;
    document.documentElement.classList.toggle(
      'orby-scroll-cue-faded',
      window.scrollY > fadeThreshold,
    );
  };

  const unsubscribe = subscribeMarketingScroll(update);
  update();
  return () => {
    unsubscribe();
    document.documentElement.classList.remove('orby-scroll-cue-faded');
  };
}

/**
 * @param {{ lazy?: boolean }} [options] — `lazy: true` (default) mounts on idle; `false` mounts immediately.
 */
export function initOrbyMarketingPage(options = {}) {
  if (shouldSkipMarketing()) {
    return { destroy() {} };
  }

  const mobile = isMobileLanding();
  const lazy = options.lazy !== false && !mobile;
  // Enable document scroll + scroll-nav CSS visibility before idle mount.
  if (!mobile) {
    setScrollMode(true);
  }
  let root = null;
  let scrollCue = null;
  let teardownScrollCueFade = null;
  /** @type {ReturnType<import('./orbyMarketingScrollNav.js').initMarketingScrollNav> | null} */
  let scrollNav = null;
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
  /** @type {(() => void) | null} */
  let teardownInProgressCurtain = null;
  /** @type {Comment | null} Placeholder when #orby-marketing is detached during studio. */
  let marketingAnchor = null;
  let destroyed = false;

  function releaseDeferredEnhancements() {
    teardownIntroTurntable?.();
    teardownIntroTurntable = null;
    teardownPngMarqueeLogotype?.();
    teardownPngMarqueeLogotype = null;
    teardownPngMarqueePerf?.();
    teardownPngMarqueePerf = null;
    teardownInProgressCurtain?.();
    teardownInProgressCurtain = null;
    if (!isMobileLanding()) {
      void import('./orbyMarketingIntroTurntable.js')
        .then((mod) => {
          mod.clearIntroTurntablePreload();
        })
        .catch(() => {});
    }
  }

  function releaseEnhancements() {
    releaseDeferredEnhancements();
    teardownShowcaseGallery?.();
    teardownShowcaseGallery = null;
  }

  /** @type {Promise<void> | null} */
  let deferredEnhancementsPromise = null;

  async function attachShowcaseGallery() {
    if (!root || destroyed || teardownShowcaseGallery) return;
    try {
      const showcaseGallery = await import('./orbyMarketingShowcaseGallery.js');
      teardownShowcaseGallery = showcaseGallery.initShowcaseGallery(root);
    } catch (err) {
      console.error('[orby-marketing] showcase gallery failed to init', err);
    }
  }

  /** Turntable, marquee, curtain — idle only; showcase mounts with the page. */
  async function attachDeferredEnhancements() {
    if (!root || destroyed) return;
    if (deferredEnhancementsPromise) return deferredEnhancementsPromise;

    deferredEnhancementsPromise = (async () => {
      releaseDeferredEnhancements();

      try {
        if (!isMobileLanding()) {
          const introTurntable = await import('./orbyMarketingIntroTurntable.js');
          teardownIntroTurntable = introTurntable.initIntroTurntable(root);
          introTurntable.refreshIntroTurntableScrollTriggers();
        }
      } catch (err) {
        console.error('[orby-marketing] intro turntable failed to init', err);
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

      if (!isMobileLanding()) {
        try {
          const inProgressCurtain = await import('./orbyMarketingInProgressCurtain.js');
          teardownInProgressCurtain = inProgressCurtain.initInProgressCurtainReveal(root);
        } catch (err) {
          console.error('[orby-marketing] In Progress curtain reveal failed to init', err);
        }
      }
    })().finally(() => {
      deferredEnhancementsPromise = null;
    });

    return deferredEnhancementsPromise;
  }

  async function attachAllEnhancements() {
    await attachShowcaseGallery();
    await attachDeferredEnhancements();
  }

  function disconnectRevealObservers() {
    revealObserver?.disconnect();
    revealObserver = null;
    megaRevealObserver?.disconnect();
    megaRevealObserver = null;
  }

  function attachRevealObserver() {
    if (!root || revealObserver || !revealModule) return;
    if (isMobileLanding()) {
      root.querySelectorAll('.orby-marketing__section').forEach((section) => {
        if (section.dataset.orbyMarketingRevealed === '1') return;
        if (section.classList.contains('orby-marketing__section--in-progress')) return;
        section.classList.add('orby-marketing__section--in-view');
        void revealModule.preloadSectionMedia(section).then(() => {
          revealModule.revealMarketingSection(section);
        });
      });
      return;
    }
    const onReveal = (observer, entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const section = entry.target;
        section.classList.add('orby-marketing__section--in-view');
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
      if (section.classList.contains('orby-marketing__section--in-progress')) return;
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
    await attachAllEnhancements();
  }

  function scheduleDeferredEnhancements() {
    const run = () => {
      if (destroyed || !root) return;
      void attachDeferredEnhancements();
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 1200 });
    } else {
      setTimeout(run, 200);
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
    const wasSuspended = root.classList.contains('orby-marketing--suspended');
    root.hidden = false;
    root.classList.remove('orby-marketing--suspended');
    setScrollMode(true);
    if (wasSuspended) {
      void attachAllEnhancements();
    }
    syncMarketingMedia(true);
  }

  function syncHomeState() {
    if (destroyed) return;
    const home =
      isDropzoneHome() ||
      isMobileLanding() ||
      document.documentElement.classList.contains(SCROLL_CLASS);
    if (scrollCue) {
      scrollCue.hidden = !home || isMobileLanding();
    }
    scrollNav?.setHomeActive(home);
    if (!root) {
      if (home || isMobileLanding()) setScrollMode(true);
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
    await ensureSiteNavStyles();
    await ensureStylesheet();
    const [, sections, reveals] = await Promise.all([
      import('./marketingMotion.js'),
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
    root.innerHTML = buildMarketingMarkup(sectionsForMarkup(sections));
    app.appendChild(root);
    bindMarketingInteractions(root);
    bindMarketingCopyEmail(root);

    root.querySelectorAll('.orby-marketing__section').forEach((section) => {
      section.classList.add('orby-marketing__section--pending');
    });
    reveals.prepareMarketingSections(root);

    const inProgressSection = root.querySelector('.orby-marketing__section--in-progress');
    if (inProgressSection) {
      reveals.showInProgressStatic(inProgressSection);
      void reveals.preloadSectionMedia(inProgressSection);
    }

    const marketingVideo = await import('./orbyMarketingVideo.js');
    marketingVideo.initMarketingVideos(root);

    await attachShowcaseGallery();

    attachRevealObserver();
    syncHomeState();

    scheduleDeferredEnhancements();
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

  /** @type {import('./orbyMarketingContent.js').MarketingSection[] | null} */
  let sectionsForNav = null;

  function ensureScrollNav() {
    if (scrollNav) return;
    const boot = (sections) => {
      if (scrollNav || !sections) return;
      sectionsForNav = sections;
      const ctaSection = sections.find((s) => s.type === 'cta');
      void import('./orbyMarketingScrollNav.js').then((scrollNavMod) => {
        if (destroyed || scrollNav) return;
        scrollNav = scrollNavMod.initMarketingScrollNav({
          section: ctaSection,
          onScrollTop: scrollToTop,
        });
        bindMarketingCopyEmail(root);
        syncHomeState();
      });
    };
    if (sectionsForNav) {
      boot(sectionsForNav);
      return;
    }
    void loadSections().then(boot);
  }

  /** @type {Promise<void> | undefined} */
  let sectionsPrimed;

  function primeSections() {
    if (sectionsPrimed) return sectionsPrimed;
    sectionsPrimed = loadSections().then((sections) => {
      if (destroyed) return;
      sectionsForNav = sections;
    });
    return sectionsPrimed;
  }

  function bootMarketingChrome() {
    if (destroyed) return;
    setScrollMode(true);
    scheduleMount();
  }

  void primeSections();
  // Wire scroll-up nav reveal as soon as marketing boots — do not wait for mount idle.
  ensureScrollNav();

  bodyObserver = new MutationObserver(syncHomeState);
  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  if (!mobile) {
    scrollCue = createScrollCue(() => {
      ensureScrollNav();
      scrollToMarketing(scheduleMount);
    });
    teardownScrollCueFade = bindScrollCueFade(scrollCue);
  }

  const startBoot = () => {
    void primeSections().then(() => bootMarketingChrome());
  };

  if (lazy) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(startBoot, { timeout: 2500 });
    } else {
      setTimeout(startBoot, 800);
    }
  } else {
    startBoot();
  }

  syncHomeState();

  return {
    destroy() {
      destroyed = true;
      unbindMarketingCopyEmail();
      teardownTabletDesktopOnlyModalUi();
      if (!isMobileLanding()) {
        void import('./orbyMarketingIntroTurntable.js').then((mod) => {
          mod.clearIntroTurntablePreload();
        });
      }
      releaseEnhancements();
      if (root) {
        void import('./orbyMarketingVideo.js').then((mod) => mod.teardownMarketingVideos(root));
      }
      bodyObserver?.disconnect();
      disconnectRevealObservers();
      teardownScrollCueFade?.();
      teardownScrollCueFade = null;
      scrollCue?.remove();
      scrollNav?.destroy();
      scrollNav = null;
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
