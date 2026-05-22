/**
 * Marketing section reveals — word stagger on headlines and body copy (ledes);
 * media: preload plate then blur-in inside the 16∶9 mask (no slide-up).
 */
import gsap from 'gsap';
import {
  wrapWordsForBigMessage,
  BIG_MESSAGE_STAGGER_CLASS,
  TEXT_REVEAL_PACE,
} from '../ui/bigMessageHeadlineReveal.js';
import { prefersReducedMotion } from '../ui/modalReveal.js';
import {
  addPlaceholderFadeOut,
  clearMarketingMediaFilter,
  setMediaPlaceholderOpacity,
} from './orbyMarketingMediaPlaceholder.js';
import { playMarketingVideo } from './orbyMarketingVideo.js';
import { prepareShowcaseGalleryCredit } from './orbyMarketingShowcaseGallery.js';
import { killIntroTurntableScrollTriggers } from './orbyMarketingIntroTurntable.js';
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
/**
 * Mega sections (intro hero, lime footer, …) — large headline + optional lede + CTAs.
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

function isSplitSection(sectionEl) {
  return sectionEl?.classList.contains('orby-marketing__section--split');
}

function isFaqSection(sectionEl) {
  return sectionEl?.classList.contains('orby-marketing__section--faq');
}

function isProSection(sectionEl) {
  return sectionEl?.classList.contains('orby-marketing__section--pro');
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
    '.orby-marketing__figure-media, .orby-marketing__figure-img, .orby-marketing__showcase-img, .orby-marketing__pro-card-img, .orby-marketing__png-marquee-img',
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
    if (el.readyState >= 2) return Promise.resolve();
    if (el.readyState < 1) el.load();
    return new Promise((resolve) => {
      const finish = () => resolve();
      el.addEventListener('loadeddata', finish, { once: true });
      el.addEventListener('error', finish, { once: true });
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
  if (
    el instanceof HTMLImageElement &&
    el.classList.contains('orby-marketing__showcase-img') &&
    !el.classList.contains('is-active')
  ) {
    return false;
  }
  if (el instanceof HTMLImageElement && el.dataset.orbyMarketingIntroAsset) {
    return false;
  }
  if (el instanceof HTMLImageElement && el.loading === 'lazy') {
    return false;
  }
  if (el instanceof HTMLImageElement) return Boolean(el.src);
  if (el instanceof HTMLVideoElement) {
    return Boolean(el.currentSrc || el.src);
  }
  return false;
}

/**
 * @param {HTMLElement} sectionEl
 * @returns {Promise<void>}
 */
export function preloadSectionMedia(sectionEl) {
  if (!sectionEl) return Promise.resolve();
  const media = [
    ...sectionEl.querySelectorAll(
      '.orby-marketing__figure-media, .orby-marketing__figure-img, .orby-marketing__showcase-img.is-active, .orby-marketing__pro-card-img, .orby-marketing__intro-asset:not(.orby-marketing__intro-turntable-wrap)',
    ),
  ].filter(shouldPreloadMarketingElement);
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
  if (prefersReducedMotion()) {
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

  if (media instanceof HTMLVideoElement) playMarketingVideo(media);

  tl.add(() => whenMediaReady(media), position);
  const revealStart = '>';
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
  if (lede) prepareHeadline(lede, headLiftY);

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
  if (lede?.textContent?.trim()) prepareHeadline(lede, megaBlockLiftY);
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
    revealHeadline(lede, tl, `>-=${megaBlockOverlap}`, {
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
  sectionEl
    .querySelectorAll('[data-orby-marketing-reveal="text"]')
    .forEach((el) => prepareHeadline(el, headLiftY));

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
  if (lede) prepareHeadline(lede, headLiftY);

  gsap.set(sectionEl.querySelectorAll('[data-orby-marketing-reveal="pro-card"]'), {
    opacity: 0,
    y: blockLiftY,
  });
}

function revealProSection(sectionEl, tl) {
  const eyebrow = sectionEl.querySelector('.orby-marketing__eyebrow');
  const title = sectionEl.querySelector('.orby-marketing__title');
  const lede = sectionEl.querySelector('.orby-marketing__pro-lede');

  revealBlock(eyebrow, tl, 0);
  revealHeadline(title, tl, `>-=${blockOverlap}`);
  if (lede) revealHeadline(lede, tl, `>-=${blockOverlap}`);

  const cards = [...sectionEl.querySelectorAll('[data-orby-marketing-reveal="pro-card"]')];
  if (cards.length) {
    tl.fromTo(
      cards,
      { opacity: 0, y: blockLiftY },
      {
        opacity: 1,
        y: 0,
        duration: cardRevealDur,
        stagger: 0.09 * TEXT_REVEAL_PACE,
        ease: mediaEase,
      },
      lede || title ? `>-=${blockOverlap}` : 0,
    );
  }
}

function prepareFaqSection(sectionEl) {
  sectionEl
    .querySelectorAll('[data-orby-marketing-reveal="text"]')
    .forEach((el) => prepareHeadline(el, headLiftY));
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
  if (lede) revealHeadline(lede, tl, `>-=${blockOverlap}`);
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
  if (lede) revealHeadline(lede, tl, `>-=${blockOverlap}`);
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
    revealHeadline(textBlocks[i], tl, i === 0 ? 0 : `>-=${blockOverlap}`);
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
 * rfrct — no scroll-in stagger; content stays vertically centered under the lime curtain.
 * @param {HTMLElement} sectionEl
 */
export function showRefrctTeaserStatic(sectionEl) {
  if (!sectionEl || sectionEl.dataset.orbyMarketingRevealed === '1') return;
  sectionEl.dataset.orbyMarketingRevealed = '1';
  sectionEl.classList.remove('orby-marketing__section--pending');
  sectionEl.classList.add(
    'orby-marketing__section--revealed',
    'orby-marketing__section--refrct-ready',
  );

  sectionEl
    .querySelectorAll(
      '.orby-marketing__figure-media, .orby-marketing__showcase-img, .orby-marketing__pro-card-img, .orby-marketing__png-marquee-img',
    )
    .forEach((el) => {
      el.classList.add('is-loaded');
      if (el instanceof HTMLVideoElement) playMarketingVideo(el);
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
  if (sectionEl.classList.contains('orby-marketing__section--refrct-teaser')) {
    showRefrctTeaserStatic(sectionEl);
    return;
  }
  sectionEl.dataset.orbyMarketingRevealed = '1';

  if (prefersReducedMotion()) {
    sectionEl.classList.remove('orby-marketing__section--pending');
    sectionEl.classList.add('orby-marketing__section--revealed');
    sectionEl
      .querySelectorAll(
        '.orby-marketing__figure-media, .orby-marketing__showcase-img, .orby-marketing__pro-card-img, .orby-marketing__png-marquee-img',
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
    },
  });

  if (isMegaMarketingSection(sectionEl)) {
    revealMegaSection(sectionEl, tl);
  } else if (isSplitSection(sectionEl)) {
    revealSplitSection(sectionEl, tl);
  } else if (isProSection(sectionEl)) {
    revealProSection(sectionEl, tl);
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
  if (!root || prefersReducedMotion()) return;
  root.querySelectorAll('.orby-marketing__section').forEach((section) => {
    if (section.classList.contains('orby-marketing__section--refrct-teaser')) return;
    prepareSection(section);
  });
}

/** Stop in-flight GSAP when leaving the home page (studio session). */
export function cancelAllMarketingMotion(root) {
  if (!root) return;
  gsap.killTweensOf(
    root.querySelectorAll(
      '*:not(.orby-marketing__intro-turntable-wrap):not(.orby-marketing__intro-turntable-canvas):not(.orby-marketing__intro-turntable-poster)',
    ),
  );
  killIntroTurntableScrollTriggers(root);
  void import('./orbyMarketingRefrctCurtain.js').then((mod) => {
    mod.killRefrctCurtainScrollTriggers(root);
  });
}
