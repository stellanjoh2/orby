/**
 * Marketing section reveals — word stagger on headlines only;
 * body copy (ledes, eyebrows) fades up as a block. Media: preload plate then blur-in.
 */
import {
  gsap,
  prefersReducedMotion,
  wrapWordsForBigMessage,
  BIG_MESSAGE_STAGGER_CLASS,
  TEXT_REVEAL_PACE,
} from './marketingMotion.js';
import {
  addPlaceholderFadeOut,
  clearMarketingMediaFilter,
  setMediaPlaceholderOpacity,
} from './orbyMarketingMediaPlaceholder.js';
import {
  ensureMarketingVideoLoaded,
  getMarketingVideoSrc,
  loadSectionMarketingVideos,
  playMarketingVideo,
} from './orbyMarketingVideo.js';
import {
  prepareShowcaseGalleryCredit,
  restartShowcaseGalleryAutoplay,
} from './orbyMarketingShowcaseGallery.js';
import { killIntroTurntableScrollTriggers } from './orbyMarketingIntroTurntable.js';
import { isMobileLanding } from '../orbyMobileLanding.js';
import {
  shouldUseHeadlineWordStagger,
  shouldUseMediaBlurReveal,
} from './marketingPerformanceTier.js';

const headWordDur = 0.42 * TEXT_REVEAL_PACE;
const headStagger = 0.035 * TEXT_REVEAL_PACE;
const headLiftY = 14;
const blockLiftY = 10;
const blockRevealDur = 0.45 * TEXT_REVEAL_PACE;
const blockOverlap = 0.22 * TEXT_REVEAL_PACE;
const listRevealDur = 0.38 * TEXT_REVEAL_PACE;
const listStagger = 0.08 * TEXT_REVEAL_PACE;
const ctaRevealDur = 0.38 * TEXT_REVEAL_PACE;
const ctaStagger = 0.08 * TEXT_REVEAL_PACE;
const cardRevealDur = 0.45 * TEXT_REVEAL_PACE;
/** Pro cards reveal when each card enters view — not when the section header does. */
const PRO_CARD_REVEAL_IO = { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.14 };

/** @type {WeakMap<HTMLElement, IntersectionObserver>} */
const proCardRevealObservers = new WeakMap();
/**
 * Mega sections (intro hero, lime CTA, …) — large headline + optional lede + CTAs.
 * @see MEGA_REVEAL_IO in orbyMarketingPage.js
 */
const megaRevealDelay = 0;
const megaHeadWordDur = 0.78 * TEXT_REVEAL_PACE;
const megaHeadStagger = 0.082 * TEXT_REVEAL_PACE;
const megaHeadLiftY = 22;
const megaBlockLiftY = 14;
const megaBlockOverlap = 0.36 * TEXT_REVEAL_PACE;
const megaCtaDur = 0.38 * TEXT_REVEAL_PACE;
const megaCtaStagger = 0.08 * TEXT_REVEAL_PACE;
const splitCtaOverlap = 0.12 * TEXT_REVEAL_PACE;
const mediaBlurPx = 14;
const mediaRevealDur = 0.88;
const mediaEase = 'power3.out';
const figureCreditInS = 0.48;
/** Safari can hang without loadeddata/error under content-visibility:auto — never block reveals forever. */
const MARKETING_VIDEO_READY_TIMEOUT_MS = 10_000;

function useInstantMarketingReveal() {
  return prefersReducedMotion() || isMobileLanding();
}

function isSplitSection(sectionEl) {
  return sectionEl?.classList.contains('orby-marketing__section--split');
}

function isFaqSection(sectionEl) {
  return sectionEl?.classList.contains('orby-marketing__section--faq');
}

function isProSection(sectionEl) {
  return sectionEl?.classList.contains('orby-marketing__section--pro');
}

function isRoadmapSection(sectionEl) {
  return sectionEl?.classList.contains('orby-marketing__section--roadmap');
}

/**
 * @param {HTMLElement} maskEl
 * @returns {HTMLImageElement | HTMLVideoElement | null}
 */
function getMaskMedia(maskEl) {
  if (!maskEl) return null;
  const activeShowcase = maskEl.querySelector('.orby-marketing__showcase-img.is-active');
  if (activeShowcase) return activeShowcase;
  return maskEl.querySelector(
    '.orby-marketing__figure-media, .orby-marketing__figure-img, .orby-marketing__figure-video, .orby-marketing__showcase-img, .orby-marketing__pro-card-img, .orby-marketing__pro-card-video, .orby-marketing__video, .orby-marketing__png-marquee-img',
  );
}

/**
 * @param {HTMLImageElement | HTMLVideoElement} el
 * @param {{ decode?: boolean }} [options]
 * @returns {Promise<void>}
 */
function whenMediaReady(el, options = {}) {
  const { decode = true } = options;
  if (!el) return Promise.resolve();

  if (el instanceof HTMLVideoElement) {
    ensureMarketingVideoLoaded(el);
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const timer =
        MARKETING_VIDEO_READY_TIMEOUT_MS > 0
          ? window.setTimeout(() => finish(), MARKETING_VIDEO_READY_TIMEOUT_MS)
          : null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer !== null) window.clearTimeout(timer);
        el.removeEventListener('loadeddata', finish);
        el.removeEventListener('canplay', finish);
        el.removeEventListener('error', onError);
        resolve();
      };
      const onError = () => {
        if (settled) return;
        ensureMarketingVideoLoaded(el, { force: true });
        if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          finish();
          return;
        }
        el.addEventListener('loadeddata', finish, { once: true });
        el.addEventListener('canplay', finish, { once: true });
      };
      el.addEventListener('loadeddata', finish, { once: true });
      el.addEventListener('canplay', finish, { once: true });
      el.addEventListener('error', onError, { once: true });
    });
  }

  if (el.complete && el.naturalWidth > 0) {
    if (decode && typeof el.decode === 'function') {
      return el.decode().catch(() => {});
    }
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const finish = () => {
      if (decode && typeof el.decode === 'function') {
        el.decode().then(resolve).catch(resolve);
      } else {
        resolve();
      }
    };
    el.addEventListener('load', finish, { once: true });
    el.addEventListener('error', finish, { once: true });
  });
}

/**
 * @param {Element} el
 */
function shouldPreloadMarketingElement(el) {
  if (el instanceof HTMLImageElement && el.classList.contains('orby-marketing__showcase-img')) {
    const flipMask = el.closest('[data-orby-marketing-gallery-flip]');
    if (flipMask) return Boolean(el.src);
    if (!el.classList.contains('is-active')) return false;
  }
  if (el instanceof HTMLImageElement && el.dataset.orbyMarketingIntroAsset) {
    return false;
  }
  if (el instanceof HTMLImageElement && el.loading === 'lazy') {
    return false;
  }
  if (el instanceof HTMLImageElement) return Boolean(el.src);
  if (el instanceof HTMLVideoElement) {
    return Boolean(getMarketingVideoSrc(el));
  }
  return false;
}

/**
 * @param {HTMLElement} sectionEl
 * @returns {Promise<void>}
 */
export function preloadSectionMedia(sectionEl) {
  if (!sectionEl) return Promise.resolve();
  loadSectionMarketingVideos(sectionEl);
  const isInProgress = sectionEl.classList.contains('orby-marketing__section--in-progress');
  sectionEl.querySelectorAll('video').forEach((video) => {
    // In Progress is warmed at mount while off-screen — load only; play via IO.
    if (!isInProgress) playMarketingVideo(video);
  });
  const media = [
    ...sectionEl.querySelectorAll(
      '.orby-marketing__figure-media, .orby-marketing__figure-img, .orby-marketing__showcase-img.is-active, .orby-marketing__pro-card-img, .orby-marketing__intro-asset:not(.orby-marketing__intro-turntable-wrap)',
    ),
  ].filter((el) => !(el instanceof HTMLVideoElement) && shouldPreloadMarketingElement(el));
  return Promise.all(media.map((el) => whenMediaReady(el, { decode: false })));
}

/**
 * @param {HTMLElement} sectionEl
 */
function clearSectionCompositorHints(sectionEl) {
  sectionEl
    .querySelectorAll(
      '.orby-marketing__figure-media, .orby-marketing__showcase-img, .orby-marketing__pro-card-img, .orby-marketing__png-marquee-img, .orby-marketing__intro-asset, [data-orby-marketing-reveal="text"]',
    )
    .forEach((el) => {
      if (el instanceof HTMLElement) el.style.willChange = 'auto';
    });
  sectionEl.querySelectorAll('.orby-marketing__png-marquee-track').forEach((el) => {
    if (el instanceof HTMLElement) el.style.willChange = 'auto';
  });
}

/** Restart magic-btn rim spin after scroll reveal (content-visibility: auto can leave it paused). */
function resumeMarketingMagicBtnRim(sectionEl) {
  if (prefersReducedMotion()) return;
  const buttons = sectionEl.querySelectorAll(
    '.orby-magic-btn:not(.orby-magic-btn--on-lime):not(.orby-magic-btn--mono)',
  );
  buttons.forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    btn.classList.add('orby-magic-btn--rim-kick');
    void btn.offsetWidth;
    btn.classList.remove('orby-magic-btn--rim-kick');
  });
}

function isMarketingHeadline(el) {
  if (!el) return false;
  return (
    el.classList.contains('orby-marketing__title') ||
    el.classList.contains('orby-marketing__title--intro')
  );
}

function prepareBodyCopy(el, liftY = blockLiftY) {
  if (!el) return;
  gsap.set(el, { opacity: 0, y: liftY });
}

function revealBodyCopy(el, tl, position = 0, options = {}) {
  if (!el) return;
  const liftY = options.liftY ?? blockLiftY;
  tl.fromTo(
    el,
    { opacity: 0, y: liftY },
    {
      opacity: 1,
      y: 0,
      duration: options.duration ?? blockRevealDur,
      ease: options.ease ?? 'power2.out',
    },
    position,
  );
}

function prepareHeadline(el, liftY = headLiftY) {
  if (!el) return;
  if (shouldUseHeadlineWordStagger()) {
    wrapWordsForBigMessage(el);
    const words = [...el.querySelectorAll(`.${BIG_MESSAGE_STAGGER_CLASS}`)];
    gsap.set(el, { opacity: 1 });
    if (words.length) gsap.set(words, { opacity: 0, y: liftY });
    return;
  }
  gsap.set(el, { opacity: 0, y: liftY });
}

function revealHeadline(el, tl, position = 0, options = {}) {
  if (!el) return;
  const liftY = options.liftY ?? headLiftY;
  if (shouldUseHeadlineWordStagger()) {
    wrapWordsForBigMessage(el);
    const words = [...el.querySelectorAll(`.${BIG_MESSAGE_STAGGER_CLASS}`)];
    if (!words.length) return;
    gsap.set(el, { opacity: 1 });
    tl.fromTo(
      words,
      { opacity: 0, y: liftY },
      {
        opacity: 1,
        y: 0,
        duration: options.wordDur ?? headWordDur,
        stagger: options.stagger ?? headStagger,
        ease: options.ease ?? 'power2.out',
      },
      position,
    );
    return;
  }
  tl.fromTo(
    el,
    { opacity: 0, y: liftY },
    {
      opacity: 1,
      y: 0,
      duration: options.wordDur ?? headWordDur,
      ease: options.ease ?? 'power2.out',
    },
    position,
  );
}

function revealBlock(el, tl, position = 0) {
  if (!el) return;
  tl.fromTo(
    el,
    { opacity: 0, y: blockLiftY },
    { opacity: 1, y: 0, duration: blockRevealDur, ease: 'power2.out' },
    position,
  );
}

function revealList(listEl, tl, position) {
  if (!listEl) return;
  const items = [...listEl.querySelectorAll('li')];
  if (!items.length) return;
  tl.fromTo(
    items,
    { opacity: 0, y: 12 },
    {
      opacity: 1,
      y: 0,
      duration: listRevealDur,
      stagger: listStagger,
      ease: mediaEase,
    },
    position,
  );
}

function prepareMediaElement(el) {
  if (!el) return;
  const isVideo = el instanceof HTMLVideoElement;
  if (shouldUseMediaBlurReveal() && !isVideo) {
    gsap.set(el, {
      opacity: 0,
      y: 0,
      scale: 1,
      filter: `blur(${mediaBlurPx}px)`,
      clearProps: 'clipPath',
    });
  } else {
    gsap.set(el, {
      opacity: 0,
      y: 0,
      scale: 1,
      clearProps: 'clipPath,filter',
    });
  }
  el.classList.remove('is-loaded');
}

/** Showcase slides after the first — hidden, no blur (opacity crossfade only). */
function prepareHiddenShowcaseSlide(el) {
  if (!el) return;
  gsap.set(el, { opacity: 0, y: 0, scale: 1, clearProps: 'filter,clipPath' });
  el.classList.remove('is-loaded');
}

/**
 * @param {HTMLElement} root
 */
export function pauseMarketingVideos(root) {
  if (!root) return;
  root.querySelectorAll('video').forEach((video) => {
    video.pause();
    try {
      video.currentTime = 0;
    } catch {
      /* seek unsupported on partial buffers */
    }
  });
}

/**
 * Resume looped clips in sections that already revealed (e.g. return from studio).
 * @param {HTMLElement} root
 */
export function resumeMarketingVideos(root) {
  if (!root) return;
  root.querySelectorAll('.orby-marketing__section[data-orby-marketing-revealed="1"] video').forEach(
    (video) => {
      ensureMarketingVideoLoaded(video);
      playMarketingVideo(video);
    },
  );
}

/**
 * @param {HTMLElement} mask
 */
function prepareFigureCredit(mask) {
  const creditEl = mask?.querySelector('[data-orby-marketing-figure-credit]');
  if (!creditEl) return;
  gsap.set(creditEl, { opacity: 0, y: 12 });
}

/**
 * @param {HTMLElement} mask
 */
function revealFigureCredit(mask) {
  const creditEl = mask?.querySelector('[data-orby-marketing-figure-credit]');
  if (!creditEl) return;
  if (useInstantMarketingReveal()) {
    gsap.set(creditEl, { opacity: 1, y: 0 });
    return;
  }
  gsap.fromTo(
    creditEl,
    { opacity: 0, y: 12 },
    { opacity: 1, y: 0, duration: figureCreditInS, ease: 'power2.out' },
  );
}

/**
 * @param {HTMLElement} maskEl
 * @param {gsap.core.Timeline} tl
 * @param {string | number} position
 */
function revealMedia(maskEl, tl, position = 0) {
  if (!maskEl) return;
  const isPngMarquee = maskEl.hasAttribute('data-orby-marketing-png-marquee');
  const media = getMaskMedia(maskEl);
  if (!media) return;
  const isShowcaseGallery = maskEl.hasAttribute('data-orby-marketing-showcase-gallery');
  const isSimpleGallery = maskEl.hasAttribute('data-orby-marketing-gallery-simple');
  const track = isPngMarquee ? maskEl.querySelector('.orby-marketing__png-marquee-track') : null;
  const logotype = isPngMarquee
    ? maskEl.querySelector('.orby-marketing__png-marquee-logotype')
    : null;

  gsap.set(maskEl, { clearProps: 'clipPath' });

  // Split/showcase videos: do not gate the opacity tween on decode — Safari stalls under
  // content-visibility:auto and leaves the gray placeholder up indefinitely.
  let revealStart = position;
  if (media instanceof HTMLVideoElement) {
    playMarketingVideo(media);
  } else {
    tl.add(() => whenMediaReady(media), position);
    revealStart = '>';
  }
  const revealTarget = isPngMarquee ? [track, logotype].filter(Boolean) : track || media;
  const useBlur =
    !isPngMarquee &&
    !isSimpleGallery &&
    shouldUseMediaBlurReveal() &&
    !(media instanceof HTMLVideoElement);
  tl.fromTo(
    revealTarget,
    isPngMarquee ? { opacity: 0 } : { opacity: 0, ...(useBlur ? { filter: `blur(${mediaBlurPx}px)` } : {}) },
    {
      opacity: 1,
      ...(useBlur ? { filter: 'blur(0px)' } : {}),
      duration: mediaRevealDur,
      ease: mediaEase,
      onStart: () => {
        if (isPngMarquee) {
          maskEl.querySelectorAll('.orby-marketing__png-marquee-img').forEach((img) => {
            img.classList.add('is-loaded');
          });
        } else {
          media.classList.add('is-loaded');
          if (media instanceof HTMLVideoElement) playMarketingVideo(media);
        }
      },
      onComplete: () => {
        if (isPngMarquee && track) {
          gsap.set(track, { clearProps: 'x' });
        }
        if (!isPngMarquee) clearMarketingMediaFilter(media);
        if (isShowcaseGallery) {
          maskEl.querySelectorAll('.orby-marketing__showcase-img').forEach((img) => {
            if (img !== media) prepareHiddenShowcaseSlide(img);
          });
          maskEl.dispatchEvent(
            new CustomEvent('orby-marketing-showcase-slide', { bubbles: true }),
          );
        } else {
          revealFigureCredit(maskEl);
        }
        setMediaPlaceholderOpacity(maskEl, 0);
        if (media instanceof HTMLVideoElement) playMarketingVideo(media);
      },
    },
    revealStart,
  );
  if (!isPngMarquee) {
    addPlaceholderFadeOut(maskEl, tl, revealStart, {
      duration: mediaRevealDur,
      ease: mediaEase,
    });
  }
}

function prepareSplitSection(sectionEl) {
  const eyebrow = sectionEl.querySelector('.orby-marketing__eyebrow');
  const title = sectionEl.querySelector('.orby-marketing__title');
  const lede = sectionEl.querySelector('.orby-marketing__lede');
  const list = sectionEl.querySelector('.orby-marketing__list');

  if (eyebrow) gsap.set(eyebrow, { opacity: 0, y: blockLiftY });

  prepareHeadline(title, headLiftY);
  if (lede) prepareBodyCopy(lede);

  if (list) gsap.set(list.querySelectorAll('li'), { opacity: 0, y: 12 });

  const magicBtn = sectionEl.querySelector('.orby-magic-btn');
  if (magicBtn) gsap.set(magicBtn, { opacity: 0, y: 12 });


  sectionEl.querySelectorAll('[data-orby-marketing-reveal="media"]').forEach(prepareMarketingMask);
}

function prepareMarketingMask(mask) {
  if (mask.hasAttribute('data-orby-marketing-png-marquee')) {
    setMediaPlaceholderOpacity(mask, 0);
    const track = mask.querySelector('.orby-marketing__png-marquee-track');
    const logotype = mask.querySelector('.orby-marketing__png-marquee-logotype');
    if (track) gsap.set(track, { opacity: 0 });
    if (logotype) gsap.set(logotype, { opacity: 0 });
    mask.querySelectorAll('.orby-marketing__png-marquee-img').forEach((img) => {
      gsap.set(img, { opacity: 1, clearProps: 'filter,clipPath' });
    });
    return;
  }
  setMediaPlaceholderOpacity(mask, 1);
  const showcaseImgs = mask.querySelectorAll('.orby-marketing__showcase-img');
  if (showcaseImgs.length) {
    const isSimple = mask.hasAttribute('data-orby-marketing-gallery-simple');
    showcaseImgs.forEach((img) => {
      if (isSimple) prepareHiddenShowcaseSlide(img);
      else if (img.classList.contains('is-active')) prepareMediaElement(img);
      else prepareHiddenShowcaseSlide(img);
    });
    prepareShowcaseGalleryCredit(mask);
    return;
  }
  prepareMediaElement(getMaskMedia(mask));
  prepareFigureCredit(mask);
}

function isMegaMarketingSection(sectionEl) {
  return sectionEl?.classList.contains('orby-marketing__section--mega');
}

function isIntroTurntableSection(sectionEl) {
  return sectionEl?.classList.contains('orby-marketing__section--intro-turntable');
}

function prepareMegaSection(sectionEl) {
  const title = sectionEl.querySelector('.orby-marketing__title--intro');
  const lede = sectionEl.querySelector('.orby-marketing__lede');
  prepareHeadline(title, megaHeadLiftY);
  if (lede?.textContent?.trim()) prepareBodyCopy(lede, megaBlockLiftY);
  const ctas = [...sectionEl.querySelectorAll('.orby-marketing__cta')];
  if (ctas.length) gsap.set(ctas, { opacity: 0, y: 12 });
}

function revealMegaSection(sectionEl, tl) {
  const title = sectionEl.querySelector('.orby-marketing__title--intro');
  const lede = sectionEl.querySelector('.orby-marketing__lede');
  const ledeHasCopy = Boolean(lede?.textContent?.trim());

  revealHeadline(title, tl, megaRevealDelay, {
    wordDur: megaHeadWordDur,
    stagger: megaHeadStagger,
    liftY: megaHeadLiftY,
    ease: 'power3.out',
  });
  if (ledeHasCopy) {
    revealBodyCopy(lede, tl, `>-=${megaBlockOverlap}`, {
      liftY: megaBlockLiftY,
      ease: 'power3.out',
    });
  }

  const ctas = [...sectionEl.querySelectorAll('.orby-marketing__cta')];
  if (ctas.length) {
    const afterCopy = ledeHasCopy ? lede : title;
    tl.fromTo(
      ctas,
      { opacity: 0, y: 12 },
      {
        opacity: 1,
        y: 0,
        duration: megaCtaDur,
        stagger: megaCtaStagger,
        ease: mediaEase,
      },
      afterCopy ? `>-=${megaBlockOverlap}` : megaRevealDelay,
    );
  }
}

function prepareStandardSection(sectionEl) {
  sectionEl.querySelectorAll('[data-orby-marketing-reveal="text"]').forEach((el) => {
    if (isMarketingHeadline(el)) prepareHeadline(el, headLiftY);
    else prepareBodyCopy(el);
  });

  sectionEl.querySelectorAll('[data-orby-marketing-reveal="media"]').forEach(prepareMarketingMask);

  const list = sectionEl.querySelector('.orby-marketing__list');
  if (list) gsap.set(list.querySelectorAll('li'), { opacity: 0, y: 12 });

  const ctas = [...sectionEl.querySelectorAll('.orby-marketing__cta')];
  if (ctas.length) gsap.set(ctas, { opacity: 0, y: -15 });
}

function prepareProSection(sectionEl) {
  const eyebrow = sectionEl.querySelector('.orby-marketing__eyebrow');
  const title = sectionEl.querySelector('.orby-marketing__title');
  const lede = sectionEl.querySelector('.orby-marketing__pro-lede');

  if (eyebrow) gsap.set(eyebrow, { opacity: 0, y: blockLiftY });

  prepareHeadline(title, headLiftY);
  if (lede) prepareBodyCopy(lede);

  gsap.set(sectionEl.querySelectorAll('[data-orby-marketing-reveal="pro-card"]'), {
    opacity: 0,
    y: blockLiftY,
  });

  sectionEl.querySelectorAll('[data-orby-marketing-gallery-flip]').forEach(prepareMarketingMask);
  sectionEl
    .querySelectorAll('.orby-marketing__pro-card-media:not(.orby-marketing__pro-card-media--flip)')
    .forEach(prepareProCardMedia);
}

function prepareProCardMedia(mediaEl) {
  if (!mediaEl) return;
  setMediaPlaceholderOpacity(mediaEl, 1);
  const media = mediaEl.querySelector('.orby-marketing__pro-card-video, .orby-marketing__pro-card-img');
  if (media) prepareMediaElement(media);
}

/**
 * @param {HTMLElement} cardEl
 * @returns {Promise<void>}
 */
function preloadProCardMedia(cardEl) {
  loadSectionMarketingVideos(cardEl);
  cardEl.querySelectorAll('video').forEach((video) => {
    playMarketingVideo(video);
  });
  const media = [
    ...cardEl.querySelectorAll(
      '.orby-marketing__pro-card-img, .orby-marketing__showcase-img.is-active',
    ),
  ].filter(shouldPreloadMarketingElement);
  return Promise.all(media.map((el) => whenMediaReady(el, { decode: false })));
}

/**
 * @param {HTMLElement} mask
 */
function finishProFlipGalleryReveal(mask, active) {
  if (active) {
    clearMarketingMediaFilter(active);
    active.classList.add('is-loaded');
  }
  setMediaPlaceholderOpacity(mask, 0);
  restartShowcaseGalleryAutoplay(mask);
}

function revealProFlipGallery(mask) {
  const imgs = [...mask.querySelectorAll('.orby-marketing__showcase-img')];
  if (!imgs.length) {
    setMediaPlaceholderOpacity(mask, 0);
    return;
  }
  const activeIndex = Math.max(0, imgs.findIndex((img) => img.classList.contains('is-active')));
  const active = imgs[activeIndex];
  imgs.forEach((img, i) => {
    if (i !== activeIndex) {
      gsap.set(img, { opacity: 0, zIndex: 0, clearProps: 'filter' });
      return;
    }
    gsap.set(img, { zIndex: 1 });
  });
  if (!active) {
    setMediaPlaceholderOpacity(mask, 0);
    return;
  }
  // Simple flip galleries use opacity-only reveals (same as split feature galleries).
  // Blur-in tweens were getting killed by gallery autoplay, leaving filter: blur() stuck.
  const useBlur =
    shouldUseMediaBlurReveal() && !mask.hasAttribute('data-orby-marketing-gallery-simple');
  const revealActive = () => {
    gsap.killTweensOf(active);
    if (useInstantMarketingReveal()) {
      gsap.set(active, { opacity: 1, clearProps: 'filter' });
      finishProFlipGalleryReveal(mask, active);
      return;
    }
    gsap.fromTo(
      active,
      { opacity: 0, ...(useBlur ? { filter: `blur(${mediaBlurPx}px)` } : {}) },
      {
        opacity: 1,
        ...(useBlur ? { filter: 'blur(0px)' } : {}),
        duration: mediaRevealDur,
        ease: mediaEase,
        onComplete: () => finishProFlipGalleryReveal(mask, active),
        onInterrupt: () => finishProFlipGalleryReveal(mask, active),
      },
    );
  };
  void whenMediaReady(active, { decode: false }).then(revealActive);
}

/**
 * @param {HTMLElement} mediaWrap
 * @param {HTMLImageElement | HTMLVideoElement} media
 * @param {gsap.core.Timeline} tl
 * @param {string | number} position
 */
function revealProCardMedia(mediaWrap, media, tl, position) {
  const useBlur = shouldUseMediaBlurReveal() && !(media instanceof HTMLVideoElement);
  if (media instanceof HTMLVideoElement) {
    playMarketingVideo(media);
  } else {
    tl.add(() => whenMediaReady(media), position);
  }
  tl.fromTo(
    media,
    { opacity: 0, ...(useBlur ? { filter: `blur(${mediaBlurPx}px)` } : {}) },
    {
      opacity: 1,
      ...(useBlur ? { filter: 'blur(0px)' } : {}),
      duration: mediaRevealDur,
      ease: mediaEase,
      onStart: () => {
        media.classList.add('is-loaded');
        if (media instanceof HTMLVideoElement) playMarketingVideo(media);
      },
      onComplete: () => {
        clearMarketingMediaFilter(media);
        setMediaPlaceholderOpacity(mediaWrap, 0);
      },
    },
    media instanceof HTMLVideoElement ? position : `${position}+=0`,
  );
}

/**
 * @param {HTMLElement} cardEl
 */
function revealProCard(cardEl) {
  if (!cardEl || cardEl.dataset.orbyMarketingProCardRevealed === '1') return;
  cardEl.dataset.orbyMarketingProCardRevealed = '1';

  const mediaWrap = cardEl.querySelector('.orby-marketing__pro-card-media');
  const isFlip = mediaWrap?.hasAttribute('data-orby-marketing-gallery-flip');
  const media = isFlip
    ? null
    : mediaWrap?.querySelector('.orby-marketing__pro-card-video, .orby-marketing__pro-card-img');

  const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
  tl.fromTo(
    cardEl,
    { opacity: 0, y: blockLiftY },
    { opacity: 1, y: 0, duration: cardRevealDur, ease: mediaEase },
  );

  if (isFlip && mediaWrap) {
    tl.add(() => revealProFlipGallery(mediaWrap), `-=${blockOverlap}`);
  } else if (media && mediaWrap) {
    revealProCardMedia(mediaWrap, media, tl, `-=${blockOverlap}`);
  } else if (mediaWrap) {
    tl.add(() => setMediaPlaceholderOpacity(mediaWrap, 0), `-=${blockOverlap}`);
  }
}

function disconnectProCardReveals(sectionEl) {
  const observer = proCardRevealObservers.get(sectionEl);
  observer?.disconnect();
  proCardRevealObservers.delete(sectionEl);
}

/**
 * @param {HTMLElement} sectionEl
 */
function scheduleProCardReveals(sectionEl) {
  disconnectProCardReveals(sectionEl);
  const cards = [...sectionEl.querySelectorAll('[data-orby-marketing-reveal="pro-card"]')].filter(
    (card) => card.dataset.orbyMarketingProCardRevealed !== '1',
  );
  if (!cards.length) return;

  if (useInstantMarketingReveal()) {
    cards.forEach((card) => {
      revealProCard(card);
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const card = entry.target;
        observer.unobserve(card);
        void preloadProCardMedia(card).then(() => revealProCard(card));
      }
    },
    PRO_CARD_REVEAL_IO,
  );

  cards.forEach((card) => observer.observe(card));
  proCardRevealObservers.set(sectionEl, observer);
}

/** Pro-card flip galleries — fade the active slide when the card lands. */
function revealProFlipGalleries(sectionEl) {
  sectionEl.querySelectorAll('[data-orby-marketing-gallery-flip]').forEach(revealProFlipGallery);
}

function revealProSection(sectionEl, tl) {
  const eyebrow = sectionEl.querySelector('.orby-marketing__eyebrow');
  const title = sectionEl.querySelector('.orby-marketing__title');
  const lede = sectionEl.querySelector('.orby-marketing__pro-lede');

  revealBlock(eyebrow, tl, 0);
  revealHeadline(title, tl, `>-=${blockOverlap}`);
  if (lede) revealBodyCopy(lede, tl, `>-=${blockOverlap}`);
  scheduleProCardReveals(sectionEl);
}

function prepareRoadmapSection(sectionEl) {
  const eyebrow = sectionEl.querySelector('.orby-marketing__eyebrow');
  const title = sectionEl.querySelector('.orby-marketing__title');
  const lede = sectionEl.querySelector('.orby-marketing__roadmap-lede');

  if (eyebrow) gsap.set(eyebrow, { opacity: 0, y: blockLiftY });

  prepareHeadline(title, headLiftY);
  if (lede) prepareBodyCopy(lede);

  gsap.set(sectionEl.querySelectorAll('[data-orby-marketing-reveal="roadmap-bar"]'), {
    opacity: 0,
    y: blockLiftY,
  });
}

function revealRoadmapSection(sectionEl, tl) {
  const eyebrow = sectionEl.querySelector('.orby-marketing__eyebrow');
  const title = sectionEl.querySelector('.orby-marketing__title');
  const lede = sectionEl.querySelector('.orby-marketing__roadmap-lede');

  revealBlock(eyebrow, tl, 0);
  revealHeadline(title, tl, `>-=${blockOverlap}`);
  if (lede) revealBodyCopy(lede, tl, `>-=${blockOverlap}`);

  const bars = [...sectionEl.querySelectorAll('[data-orby-marketing-reveal="roadmap-bar"]')];
  if (bars.length) {
    tl.fromTo(
      bars,
      { opacity: 0, y: blockLiftY },
      {
        opacity: 1,
        y: 0,
        duration: cardRevealDur,
        stagger: 0.04 * TEXT_REVEAL_PACE,
        ease: mediaEase,
      },
      lede || title ? `>-=${blockOverlap}` : 0,
    );
  }
}

function prepareFaqSection(sectionEl) {
  sectionEl.querySelectorAll('[data-orby-marketing-reveal="text"]').forEach((el) => {
    if (isMarketingHeadline(el)) prepareHeadline(el, headLiftY);
    else prepareBodyCopy(el);
  });
  gsap.set(sectionEl.querySelectorAll('[data-orby-marketing-reveal="faq-item"]'), {
    opacity: 0,
    y: blockLiftY,
  });
}

function revealFaqSection(sectionEl, tl) {
  const eyebrow = sectionEl.querySelector('.orby-marketing__eyebrow');
  const title = sectionEl.querySelector('.orby-marketing__title');
  const lede = sectionEl.querySelector('.orby-marketing__faq-lede');

  revealBlock(eyebrow, tl, 0);
  if (lede) revealBodyCopy(lede, tl, `>-=${blockOverlap}`);
  revealHeadline(title, tl, `>-=${blockOverlap}`);

  const items = [...sectionEl.querySelectorAll('[data-orby-marketing-reveal="faq-item"]')];
  if (items.length) {
    tl.fromTo(
      items,
      { opacity: 0, y: blockLiftY },
      {
        opacity: 1,
        y: 0,
        duration: cardRevealDur,
        stagger: 0.07 * TEXT_REVEAL_PACE,
        ease: mediaEase,
      },
      title || lede ? `>-=${blockOverlap}` : 0,
    );
  }
}

function prepareSection(sectionEl) {
  if (isMegaMarketingSection(sectionEl)) {
    prepareMegaSection(sectionEl);
    return;
  }
  if (isSplitSection(sectionEl)) {
    prepareSplitSection(sectionEl);
    return;
  }
  if (isProSection(sectionEl)) {
    prepareProSection(sectionEl);
    return;
  }
  if (isRoadmapSection(sectionEl)) {
    prepareRoadmapSection(sectionEl);
    return;
  }
  if (isFaqSection(sectionEl)) {
    prepareFaqSection(sectionEl);
    return;
  }
  prepareStandardSection(sectionEl);
}

function revealSplitSection(sectionEl, tl) {
  const eyebrow = sectionEl.querySelector('.orby-marketing__eyebrow');
  const title = sectionEl.querySelector('.orby-marketing__title');
  const lede = sectionEl.querySelector('.orby-marketing__lede');
  const list = sectionEl.querySelector('.orby-marketing__list');

  revealBlock(eyebrow, tl, 0);
  revealHeadline(title, tl, `>-=${blockOverlap}`);
  if (lede) revealBodyCopy(lede, tl, `>-=${blockOverlap}`);
  if (list) revealList(list, tl, `>-=${blockOverlap}`);

  const magicBtn = sectionEl.querySelector('.orby-magic-btn');
  if (magicBtn) {
    tl.fromTo(
      magicBtn,
      { opacity: 0, y: 12 },
      {
        opacity: 1,
        y: 0,
        duration: ctaRevealDur,
        ease: mediaEase,
      },
      list ? `>-=${splitCtaOverlap}` : lede ? `>-=${blockOverlap}` : 0,
    );
  }

  const media = sectionEl.querySelector('[data-orby-marketing-reveal="media"]');
  if (media) revealMedia(media, tl, `-=${0.35}`);
}

function revealStandardSection(sectionEl, tl) {
  const textBlocks = [...sectionEl.querySelectorAll('[data-orby-marketing-reveal="text"]')];
  for (let i = 0; i < textBlocks.length; i++) {
    const position = i === 0 ? 0 : `>-=${blockOverlap}`;
    if (isMarketingHeadline(textBlocks[i])) {
      revealHeadline(textBlocks[i], tl, position);
    } else {
      revealBodyCopy(textBlocks[i], tl, position);
    }
  }

  const list = sectionEl.querySelector('.orby-marketing__list');
  if (list) revealList(list, tl, textBlocks.length ? `>-=${blockOverlap}` : 0);

  const media = sectionEl.querySelector('[data-orby-marketing-reveal="media"]');
  if (media) {
    const mediaOverlap = textBlocks.length || list ? 0.35 : 0;
    revealMedia(media, tl, mediaOverlap > 0 ? `-=${mediaOverlap}` : 0);
  }

  const ctas = [...sectionEl.querySelectorAll('.orby-marketing__cta')];
  if (ctas.length) {
    tl.fromTo(
      ctas,
      { opacity: 0, y: -15 },
      {
        opacity: 1,
        y: 0,
        duration: ctaRevealDur,
        stagger: ctaStagger,
        ease: mediaEase,
      },
      `>-=${splitCtaOverlap}`,
    );
  }
}

/**
 * In Progress — no scroll-in stagger; content stays vertically centered under the lime CTA.
 * @param {HTMLElement} sectionEl
 */
export function showInProgressStatic(sectionEl) {
  if (!sectionEl || sectionEl.dataset.orbyMarketingRevealed === '1') return;
  sectionEl.dataset.orbyMarketingRevealed = '1';
  sectionEl.classList.remove('orby-marketing__section--pending');
  sectionEl.classList.add('orby-marketing__section--revealed');

  sectionEl
    .querySelectorAll(
      '.orby-marketing__figure-media, .orby-marketing__showcase-img, .orby-marketing__pro-card-img, .orby-marketing__pro-card-video, .orby-marketing__png-marquee-img',
    )
    .forEach((el) => {
      el.classList.add('is-loaded');
      // Do not play here — section is usually off-screen at mount. Early play can
      // strip the poster and leave a black plate; IntersectionObserver starts play.
      if (el instanceof HTMLVideoElement) {
        ensureMarketingVideoLoaded(el);
      }
    });

  sectionEl.querySelectorAll('[data-orby-marketing-reveal="media"]').forEach((mask) => {
    setMediaPlaceholderOpacity(mask, 0);
    const creditEl = mask.querySelector('[data-orby-marketing-figure-credit]');
    if (creditEl) gsap.set(creditEl, { opacity: 1, y: 0 });
  });

  gsap.set(sectionEl.querySelectorAll('*'), {
    clearProps: 'opacity,transform,clipPath,y,x,scale,filter',
  });
}

/**
 * @param {HTMLElement} sectionEl
 */
export function revealMarketingSection(sectionEl) {
  if (!sectionEl || sectionEl.dataset.orbyMarketingRevealed === '1') return;
  if (sectionEl.classList.contains('orby-marketing__section--in-progress')) {
    showInProgressStatic(sectionEl);
    return;
  }
  sectionEl.dataset.orbyMarketingRevealed = '1';

  if (useInstantMarketingReveal()) {
    sectionEl.classList.remove('orby-marketing__section--pending');
    sectionEl.classList.add('orby-marketing__section--revealed');
    sectionEl
      .querySelectorAll(
        '.orby-marketing__figure-media, .orby-marketing__showcase-img, .orby-marketing__pro-card-img, .orby-marketing__pro-card-video, .orby-marketing__png-marquee-img',
      )
      .forEach((el) => {
        el.classList.add('is-loaded');
        if (el instanceof HTMLVideoElement) playMarketingVideo(el);
      });
    sectionEl
      .querySelectorAll('[data-orby-marketing-reveal="media"]')
      .forEach((mask) => {
        setMediaPlaceholderOpacity(mask, 0);
        if (mask.hasAttribute('data-orby-marketing-png-marquee')) {
          const track = mask.querySelector('.orby-marketing__png-marquee-track');
          const logotype = mask.querySelector('.orby-marketing__png-marquee-logotype');
          if (track) gsap.set(track, { opacity: 1 });
          if (logotype) gsap.set(logotype, { opacity: 1 });
        }
        if (mask.hasAttribute('data-orby-marketing-showcase-gallery')) {
          mask.dispatchEvent(
            new CustomEvent('orby-marketing-showcase-slide', { bubbles: true }),
          );
        } else {
          revealFigureCredit(mask);
        }
      });
    if (isProSection(sectionEl)) {
      sectionEl.querySelectorAll('[data-orby-marketing-reveal="pro-card"]').forEach((card) => {
        card.dataset.orbyMarketingProCardRevealed = '1';
      });
      sectionEl.querySelectorAll('.orby-marketing__pro-card-media').forEach((mediaWrap) => {
        setMediaPlaceholderOpacity(mediaWrap, 0);
      });
      revealProFlipGalleries(sectionEl);
    }
    const clearTargets = isIntroTurntableSection(sectionEl)
      ? sectionEl.querySelectorAll('*:not(.orby-marketing__intro-turntable-wrap):not(.orby-marketing__intro-turntable-canvas):not(.orby-marketing__intro-turntable-poster)')
      : sectionEl.querySelectorAll('*');
    gsap.set(clearTargets, { clearProps: 'opacity,transform,clipPath,y,x,scale,filter' });
    return;
  }

  const tl = gsap.timeline({
    defaults: { ease: 'power2.out' },
    onComplete: () => {
      sectionEl.classList.remove('orby-marketing__section--pending');
      sectionEl.classList.add('orby-marketing__section--revealed');
      clearSectionCompositorHints(sectionEl);
      resumeMarketingMagicBtnRim(sectionEl);
    },
  });

  if (isMegaMarketingSection(sectionEl)) {
    revealMegaSection(sectionEl, tl);
  } else if (isSplitSection(sectionEl)) {
    revealSplitSection(sectionEl, tl);
  } else if (isProSection(sectionEl)) {
    revealProSection(sectionEl, tl);
  } else if (isRoadmapSection(sectionEl)) {
    revealRoadmapSection(sectionEl, tl);
  } else if (isFaqSection(sectionEl)) {
    revealFaqSection(sectionEl, tl);
  } else {
    revealStandardSection(sectionEl, tl);
  }
}

/**
 * @param {HTMLElement} root
 */
export function prepareMarketingSections(root) {
  if (!root || useInstantMarketingReveal()) return;
  root.querySelectorAll('.orby-marketing__section').forEach((section) => {
    if (section.classList.contains('orby-marketing__section--in-progress')) return;
    prepareSection(section);
  });
}

/** Stop in-flight GSAP when leaving the home page (studio session). */
export function cancelAllMarketingMotion(root) {
  if (!root) return;
  root.querySelectorAll('.orby-marketing__section--pro').forEach(disconnectProCardReveals);
  gsap.killTweensOf(
    root.querySelectorAll(
      '*:not(.orby-marketing__intro-turntable-wrap):not(.orby-marketing__intro-turntable-canvas):not(.orby-marketing__intro-turntable-poster)',
    ),
  );
  killIntroTurntableScrollTriggers(root);
}
