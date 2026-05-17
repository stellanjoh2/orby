/**
 * Marketing section reveals — word stagger on headlines; block fade on split body copy;
 * media: preload then smooth fade + slide up (no clip-path wipe).
 */
import gsap from 'gsap';
import {
  wrapWordsForBigMessage,
  BIG_MESSAGE_STAGGER_CLASS,
} from '../ui/bigMessageHeadlineReveal.js';
import { prefersReducedMotion } from '../ui/modalReveal.js';

const headWordDur = 0.42;
const headStagger = 0.035;
const headLiftY = 14;
const blockLiftY = 10;
const blockOverlap = 0.22;
const mediaLiftY = 28;
const mediaRevealDur = 1.05;
const mediaEase = 'power3.out';

function isSplitSection(sectionEl) {
  return sectionEl?.classList.contains('orby-marketing__section--split');
}

/**
 * @param {HTMLElement} maskEl
 * @returns {HTMLImageElement | HTMLVideoElement | null}
 */
function getMaskMedia(maskEl) {
  if (!maskEl) return null;
  return maskEl.querySelector(
    '.orby-marketing__figure-media, .orby-marketing__figure-img, .orby-marketing__showcase-img',
  );
}

/**
 * @param {HTMLImageElement | HTMLVideoElement} el
 * @returns {Promise<void>}
 */
function whenMediaReady(el) {
  if (!el) return Promise.resolve();

  if (el instanceof HTMLVideoElement) {
    if (el.readyState >= 2) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => resolve();
      el.addEventListener('loadeddata', finish, { once: true });
      el.addEventListener('error', finish, { once: true });
    });
  }

  if (el.complete && el.naturalWidth > 0) {
    if (typeof el.decode === 'function') {
      return el.decode().catch(() => {});
    }
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const finish = () => {
      if (typeof el.decode === 'function') {
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
 * @param {HTMLElement} root
 * @returns {Promise<void>}
 */
export function preloadMarketingImages(root) {
  if (!root) return Promise.resolve();
  const media = [
    ...root.querySelectorAll(
      '.orby-marketing__figure-media, .orby-marketing__figure-img, .orby-marketing__showcase-img, .orby-marketing__intro-asset',
    ),
  ].filter((el) => {
    if (el instanceof HTMLImageElement) return Boolean(el.src);
    if (el instanceof HTMLVideoElement) return Boolean(el.src);
    return false;
  });
  return Promise.all(media.map((el) => whenMediaReady(el))).then(() => {});
}

function revealHeadline(el, tl, position = 0) {
  if (!el) return;
  wrapWordsForBigMessage(el);
  const words = [...el.querySelectorAll(`.${BIG_MESSAGE_STAGGER_CLASS}`)];
  if (!words.length) return;
  gsap.set(el, { opacity: 1 });
  tl.fromTo(
    words,
    { opacity: 0, y: headLiftY },
    {
      opacity: 1,
      y: 0,
      duration: headWordDur,
      stagger: headStagger,
      ease: 'power2.out',
    },
    position,
  );
}

function revealBlock(el, tl, position = 0) {
  if (!el) return;
  tl.fromTo(
    el,
    { opacity: 0, y: blockLiftY },
    { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' },
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
      duration: 0.38,
      stagger: 0.08,
      ease: mediaEase,
    },
    position,
  );
}

function prepareMediaElement(el) {
  if (!el) return;
  gsap.set(el, { opacity: 0, y: mediaLiftY, scale: 1, clearProps: 'clipPath' });
  el.classList.remove('is-loaded');
}

export function playMarketingVideo(video) {
  if (!(video instanceof HTMLVideoElement)) return;
  const run = () => {
    video.play().catch(() => {});
  };
  if (video.readyState >= 2) {
    run();
  } else {
    video.addEventListener('loadeddata', run, { once: true });
  }
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
 * @param {HTMLElement} maskEl
 * @param {gsap.core.Timeline} tl
 * @param {string | number} position
 */
function revealMedia(maskEl, tl, position = 0) {
  if (!maskEl) return;
  const media = getMaskMedia(maskEl);
  if (!media) return;

  gsap.set(maskEl, { clearProps: 'clipPath' });

  tl.add(() => whenMediaReady(media), position);
  tl.fromTo(
    media,
    { opacity: 0, y: mediaLiftY },
    {
      opacity: 1,
      y: 0,
      duration: mediaRevealDur,
      ease: mediaEase,
      onStart: () => {
        media.classList.add('is-loaded');
        if (media instanceof HTMLVideoElement) playMarketingVideo(media);
      },
    },
    '>',
  );
}

function prepareSplitSection(sectionEl) {
  const eyebrow = sectionEl.querySelector('.orby-marketing__eyebrow');
  const title = sectionEl.querySelector('.orby-marketing__title');
  const lede = sectionEl.querySelector('.orby-marketing__lede');
  const list = sectionEl.querySelector('.orby-marketing__list');

  if (eyebrow) gsap.set(eyebrow, { opacity: 0, y: blockLiftY });
  if (lede) gsap.set(lede, { opacity: 0, y: blockLiftY });

  if (title) {
    wrapWordsForBigMessage(title);
    const words = [...title.querySelectorAll(`.${BIG_MESSAGE_STAGGER_CLASS}`)];
    gsap.set(title, { opacity: 1 });
    if (words.length) gsap.set(words, { opacity: 0, y: headLiftY });
  }

  if (list) gsap.set(list.querySelectorAll('li'), { opacity: 0, y: 12 });

  sectionEl.querySelectorAll('[data-orby-marketing-reveal="media"]').forEach((mask) => {
    prepareMediaElement(getMaskMedia(mask));
  });
}

function prepareStandardSection(sectionEl) {
  sectionEl.querySelectorAll('[data-orby-marketing-reveal="text"]').forEach((el) => {
    wrapWordsForBigMessage(el);
    const words = [...el.querySelectorAll(`.${BIG_MESSAGE_STAGGER_CLASS}`)];
    if (words.length) {
      gsap.set(el, { opacity: 1 });
      gsap.set(words, { opacity: 0, y: headLiftY });
    }
  });

  sectionEl.querySelectorAll('[data-orby-marketing-reveal="media"]').forEach((mask) => {
    prepareMediaElement(getMaskMedia(mask));
  });

  const list = sectionEl.querySelector('.orby-marketing__list');
  if (list) gsap.set(list.querySelectorAll('li'), { opacity: 0, y: 12 });

  const cta = sectionEl.querySelector('.orby-marketing__cta');
  if (cta) gsap.set(cta, { opacity: 0, y: -15 });
}

function prepareSection(sectionEl) {
  if (isSplitSection(sectionEl)) {
    prepareSplitSection(sectionEl);
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
  revealBlock(lede, tl, `>-=${blockOverlap}`);
  if (list) revealList(list, tl, `>-=${blockOverlap}`);

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

  const cta = sectionEl.querySelector('.orby-marketing__cta');
  if (cta) {
    tl.fromTo(
      cta,
      { opacity: 0, y: -15 },
      { opacity: 1, y: 0, duration: 0.38, ease: mediaEase },
      '>-=0.12',
    );
  }
}

/**
 * @param {HTMLElement} sectionEl
 */
export function revealMarketingSection(sectionEl) {
  if (!sectionEl || sectionEl.dataset.orbyMarketingRevealed === '1') return;
  sectionEl.dataset.orbyMarketingRevealed = '1';

  if (prefersReducedMotion()) {
    sectionEl.classList.remove('orby-marketing__section--pending');
    sectionEl.classList.add('orby-marketing__section--revealed');
    sectionEl
      .querySelectorAll('.orby-marketing__figure-media, .orby-marketing__showcase-img')
      .forEach((el) => {
        el.classList.add('is-loaded');
        if (el instanceof HTMLVideoElement) playMarketingVideo(el);
      });
    gsap.set(sectionEl.querySelectorAll('*'), { clearProps: 'opacity,transform,clipPath,y,x,scale' });
    return;
  }

  const tl = gsap.timeline({
    defaults: { ease: 'power2.out' },
    onComplete: () => {
      sectionEl.classList.remove('orby-marketing__section--pending');
      sectionEl.classList.add('orby-marketing__section--revealed');
    },
  });

  if (isSplitSection(sectionEl)) {
    revealSplitSection(sectionEl, tl);
  } else {
    revealStandardSection(sectionEl, tl);
  }
}

/**
 * @param {HTMLElement} root
 */
export function prepareMarketingSections(root) {
  if (!root || prefersReducedMotion()) return;
  root.querySelectorAll('.orby-marketing__section').forEach(prepareSection);
}

/** Stop in-flight GSAP when leaving the home page (studio session). */
export function cancelAllMarketingMotion(root) {
  if (!root) return;
  gsap.killTweensOf(root.querySelectorAll('*'));
}
