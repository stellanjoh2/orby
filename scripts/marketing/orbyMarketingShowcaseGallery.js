/**
 * Auto-cycling showcase gallery, dot nav, arrow keys, and lower-third credits.
 */
import gsap from 'gsap';
import { prefersReducedMotion } from '../ui/modalReveal.js';
import {
  escapeMarketingHtml,
  formatMarketingImageCreditHtml,
} from './orbyMarketingImageCredit.js';
import { getShowcaseCycleMs } from './marketingPerformanceTier.js';
import {
  getMediaPlaceholderTargets,
  setMediaPlaceholderOpacity,
  tweenPlaceholderFadeOut,
} from './orbyMarketingMediaPlaceholder.js';

const FADE_S = 0.95;
const CREDIT_IN_S = 0.48;
/** Split feature galleries — auto-advance only, no dots/keys. */
const SPLIT_GALLERY_CYCLE_MS = 5000;
/** Set on the gallery mask while arrow keys should drive slides (see GlobalControls). */
const SHOWCASE_KEYS_ATTR = 'data-orby-marketing-showcase-keys';

/** @type {WeakMap<HTMLElement, ReturnType<typeof createGalleryController>>} */
const controllers = new WeakMap();

/**
 * @param {HTMLImageElement} img
 * @returns {string}
 */
function getSlideCreditHtml(img) {
  const raw = img.dataset.imageCredit?.trim();
  if (raw) {
    try {
      const credit = JSON.parse(raw);
      return formatMarketingImageCreditHtml(credit);
    } catch {
      /* invalid JSON — fall through */
    }
  }
  const text = img.dataset.credit?.trim() || '';
  return text ? escapeMarketingHtml(text) : '';
}

/**
 * @param {HTMLImageElement} el
 * @returns {Promise<void>}
 */
function whenImageReady(el) {
  if (!el) return Promise.resolve();
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
 * @param {EventTarget | null} target
 */
function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

/**
 * @param {HTMLElement} mask
 */
function createGalleryController(mask) {
  const isSimpleGallery = mask.hasAttribute('data-orby-marketing-gallery-simple');
  const imgs = [...mask.querySelectorAll('.orby-marketing__showcase-img')];
  const creditEl = mask.querySelector('[data-orby-marketing-showcase-credit]');
  const dotButtons = isSimpleGallery
    ? []
    : [...mask.querySelectorAll('[data-orby-marketing-showcase-dot]')];
  let index = Math.max(
    0,
    imgs.findIndex((img) => img.classList.contains('is-active')),
  );
  if (index < 0) index = 0;
  let timer = null;
  let tweening = false;
  let creditTween = null;
  let keyboardEnabled = false;
  let intersectionObserver = null;
  let visibilityObserver = null;
  let visible = false;

  const updateDots = (activeIndex) => {
    if (!dotButtons.length) return;
    dotButtons.forEach((btn, i) => {
      const active = i === activeIndex;
      btn.classList.toggle('is-active', active);
      if (active) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
  };

  if (dotButtons.length) updateDots(index);

  /**
   * @param {number} slideIndex
   */
  const mountStaticCredit = async (slideIndex = 0) => {
    const img = imgs[slideIndex];
    if (!creditEl || !img) return;
    const html = getSlideCreditHtml(img);
    if (!html) {
      creditEl.hidden = true;
      gsap.set(creditEl, { opacity: 0 });
      return;
    }
    await whenImageReady(img);
    creditEl.innerHTML = html;
    creditEl.hidden = false;
    gsap.set(creditEl, { opacity: 1, y: 0 });
  };

  const hideCredit = () => {
    if (isSimpleGallery) return Promise.resolve();
    if (!creditEl) return Promise.resolve();
    creditTween?.kill();
    if (prefersReducedMotion()) {
      gsap.set(creditEl, { opacity: 0, y: 8 });
      creditEl.hidden = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      gsap.to(creditEl, {
        opacity: 0,
        y: 8,
        duration: 0.22,
        ease: 'power2.in',
        onComplete: () => {
          creditEl.hidden = true;
          resolve();
        },
      });
    });
  };

  /**
   * @param {number} slideIndex
   * @param {{ hideFirst?: boolean }} [options]
   */
  const revealCredit = async (slideIndex, options = {}) => {
    if (isSimpleGallery) return;
    const img = imgs[slideIndex];
    if (!creditEl || !img) return;

    const html = getSlideCreditHtml(img);
    if (!html) {
      creditEl.hidden = true;
      gsap.set(creditEl, { opacity: 0 });
      return;
    }

    if (options.hideFirst) {
      await hideCredit();
    }

    await whenImageReady(img);

    creditEl.innerHTML = html;
    creditEl.hidden = false;
    creditTween?.kill();

    if (prefersReducedMotion()) {
      gsap.set(creditEl, { opacity: 1, y: 0 });
      return;
    }

    creditTween = gsap.fromTo(
      creditEl,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: CREDIT_IN_S, ease: 'power2.out' },
    );
  };

  const setActive = (nextIndex, animate) => {
    const current = imgs[index];
    const next = imgs[nextIndex];
    if (!next || nextIndex === index) return;

    const applyClasses = () => {
      imgs.forEach((img, i) => {
        img.classList.toggle('is-active', i === nextIndex);
      });
      updateDots(nextIndex);
    };

    if (!animate || prefersReducedMotion()) {
      gsap.set(imgs, { opacity: (i) => (i === nextIndex ? 1 : 0) });
      applyClasses();
      setMediaPlaceholderOpacity(mask, 0);
      index = nextIndex;
      tweening = false;
      if (!isSimpleGallery) void revealCredit(nextIndex);
      return;
    }

    const needsPlaceholder =
      !next.complete || next.naturalWidth === 0;
    if (needsPlaceholder) {
      setMediaPlaceholderOpacity(mask, 1);
    }

    tweening = true;
    gsap.killTweensOf(imgs);
    gsap.killTweensOf(getMediaPlaceholderTargets(mask));
    if (!isSimpleGallery) void hideCredit();
    gsap.to(current, {
      opacity: 0,
      duration: FADE_S,
      ease: 'power2.inOut',
    });
    gsap.to(next, {
      opacity: 1,
      duration: FADE_S,
      ease: 'power2.inOut',
      onStart: applyClasses,
      onComplete: () => {
        index = nextIndex;
        tweening = false;
        setMediaPlaceholderOpacity(mask, 0);
        if (!isSimpleGallery) void revealCredit(nextIndex);
      },
    });
    if (needsPlaceholder) {
      tweenPlaceholderFadeOut(mask, { duration: FADE_S, ease: 'power2.inOut' });
    }
  };

  const goTo = (targetIndex) => {
    if (imgs.length < 2 || tweening) return;
    const wrapped =
      ((targetIndex % imgs.length) + imgs.length) % imgs.length;
    if (wrapped === index) return;
    setActive(wrapped, true);
    restartAutoplay();
  };

  const goRelative = (delta) => {
    goTo(index + delta);
  };

  const tick = () => {
    if (tweening) return;
    setActive((index + 1) % imgs.length, true);
  };

  const start = () => {
    stop();
    if (imgs.length < 2 || prefersReducedMotion() || !visible) return;
    const cycleMs = isSimpleGallery ? SPLIT_GALLERY_CYCLE_MS : getShowcaseCycleMs();
    timer = window.setInterval(tick, cycleMs);
  };

  const stop = () => {
    if (timer != null) {
      window.clearInterval(timer);
      timer = null;
    }
  };

  const restartAutoplay = () => {
    stop();
    start();
  };

  const onKeyDown = (event) => {
    if (!keyboardEnabled || imgs.length < 2) return;
    if (event.defaultPrevented || isEditableTarget(event.target)) return;
    const isPrev =
      event.key === 'ArrowLeft' || event.code === 'ArrowLeft';
    const isNext =
      event.key === 'ArrowRight' || event.code === 'ArrowRight';
    if (isPrev) {
      event.preventDefault();
      goRelative(-1);
    } else if (isNext) {
      event.preventDefault();
      goRelative(1);
    }
  };

  const onDotClick = (event) => {
    const btn = event.target.closest('[data-orby-marketing-showcase-dot]');
    if (!btn || !mask.contains(btn)) return;
    const slideIndex = Number(btn.dataset.slideIndex);
    if (!Number.isFinite(slideIndex)) return;
    goTo(slideIndex);
  };

  const setKeyboardEnabled = (enabled) => {
    keyboardEnabled = enabled;
    if (enabled) mask.setAttribute(SHOWCASE_KEYS_ATTR, '');
    else mask.removeAttribute(SHOWCASE_KEYS_ATTR);
  };

  const bindInteraction = () => {
    if (imgs.length < 2) return;

    if (!isSimpleGallery) {
      mask.addEventListener('click', onDotClick);
      window.addEventListener('keydown', onKeyDown);
      intersectionObserver = new IntersectionObserver(
        ([entry]) => {
          setKeyboardEnabled(Boolean(entry?.isIntersecting));
        },
        { threshold: 0.35 },
      );
      intersectionObserver.observe(mask);
    }

    visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        if (visible) restartAutoplay();
        else stop();
      },
      { threshold: 0.2 },
    );
    visibilityObserver.observe(mask);
    const rect = mask.getBoundingClientRect();
    visible = rect.bottom > 0 && rect.top < window.innerHeight;
    if (visible) restartAutoplay();
  };

  const unbindInteraction = () => {
    if (!isSimpleGallery) {
      mask.removeEventListener('click', onDotClick);
      window.removeEventListener('keydown', onKeyDown);
    }
    intersectionObserver?.disconnect();
    intersectionObserver = null;
    visibilityObserver?.disconnect();
    visibilityObserver = null;
    visible = false;
    setKeyboardEnabled(false);
  };

  const onSlideRevealed = () => {
    if (isSimpleGallery) void mountStaticCredit(index);
    else void revealCredit(index);
  };

  mask.addEventListener('orby-marketing-showcase-slide', onSlideRevealed);
  bindInteraction();

  return {
    start,
    stop,
    restartAutoplay,
    onSlideRevealed,
    prepareCredit() {
      if (!creditEl) return;
      creditTween?.kill();
      creditEl.hidden = true;
      creditEl.innerHTML = '';
      gsap.set(creditEl, { opacity: 0, y: 12 });
    },
    destroy() {
      stop();
      unbindInteraction();
      creditTween?.kill();
      gsap.killTweensOf(imgs);
      mask.removeEventListener('orby-marketing-showcase-slide', onSlideRevealed);
    },
  };
}

/**
 * @param {HTMLElement} mask
 */
export function prepareShowcaseGalleryCredit(mask) {
  const controller = controllers.get(mask) ?? createGalleryController(mask);
  controllers.set(mask, controller);
  controller.prepareCredit();
}

/**
 * @param {HTMLElement} mask
 * @returns {() => void}
 */
function initGalleryMask(mask) {
  const controller = controllers.get(mask) ?? createGalleryController(mask);
  controllers.set(mask, controller);
  controller.prepareCredit();

  const imgs = mask.querySelectorAll('.orby-marketing__showcase-img');
  if (!imgs.length) return () => controller.destroy();

  const section = mask.closest('.orby-marketing__section');
  if (section?.dataset.orbyMarketingRevealed === '1') {
    controller.start();
  } else if (section) {
    const observer = new MutationObserver(() => {
      if (section.dataset.orbyMarketingRevealed === '1') {
        observer.disconnect();
        controller.start();
      }
    });
    observer.observe(section, {
      attributes: true,
      attributeFilter: ['data-orby-marketing-revealed'],
    });
  }

  return () => controller.destroy();
}

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function initShowcaseGallery(root) {
  const masks = [...(root?.querySelectorAll('[data-orby-marketing-showcase-gallery]') ?? [])];
  if (!masks.length) return () => {};

  const cleanups = masks.map((mask) => initGalleryMask(mask));
  return () => {
    cleanups.forEach((fn) => fn());
  };
}
