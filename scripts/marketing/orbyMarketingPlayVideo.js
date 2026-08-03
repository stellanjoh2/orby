/**
 * Trailer play affordance — opens a 16∶9 lightbox (Framerate embed or local full video).
 */
import { gsap, prefersReducedMotion } from './marketingMotion.js';
import { playMarketingVideo } from './orbyMarketingVideo.js';

const HIT_SELECTOR = '[data-orby-marketing-play-video]';
const OPEN_CLASS = 'orby-marketing-video-lightbox-open';
const EMBED_LOADING_CLASS = 'is-embed-loading';
const OPEN_MS = 0.38;
const CLOSE_MS = 0.28;
const BACKDROP_BLUR = '18px';

/** @type {AbortController | null} */
let abortController = null;
/** @type {HTMLElement | null} */
let lightboxEl = null;
/** @type {HTMLVideoElement | null} */
let lightboxVideo = null;
/** @type {HTMLIFrameElement | null} */
let lightboxIframe = null;
/** @type {HTMLElement | null} */
let lightboxFrame = null;
/** @type {HTMLElement | null} */
let lightboxCloseBtn = null;
/** @type {HTMLVideoElement | null} */
let pausedPreview = null;
/** @type {Element | null} */
let lastFocus = null;
/** @type {(() => void) | null} */
let embedLoadHandler = null;
let isOpen = false;
let isAnimating = false;

function ensureLightbox() {
  if (lightboxEl?.isConnected) return lightboxEl;

  const root = document.createElement('div');
  root.className = 'orby-marketing__video-lightbox';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Launch trailer');
  root.innerHTML = `
    <button type="button" class="orby-marketing__video-lightbox-scrim" tabindex="-1" aria-label="Close video"></button>
    <div class="orby-marketing__video-lightbox-frame">
      <button type="button" class="orby-marketing__video-lightbox-close" aria-label="Close video">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
      <video class="orby-marketing__video-lightbox-video" controls playsinline preload="metadata" hidden></video>
      <iframe class="orby-marketing__video-lightbox-iframe" title="Launch trailer" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen hidden></iframe>
    </div>
  `;
  document.body.appendChild(root);

  lightboxEl = root;
  lightboxFrame = root.querySelector('.orby-marketing__video-lightbox-frame');
  lightboxCloseBtn = root.querySelector('.orby-marketing__video-lightbox-close');
  lightboxVideo = root.querySelector('.orby-marketing__video-lightbox-video');
  lightboxIframe = root.querySelector('.orby-marketing__video-lightbox-iframe');
  return root;
}

function lockScroll(locked) {
  document.documentElement.classList.toggle(OPEN_CLASS, locked);
}

function restorePreview() {
  if (pausedPreview instanceof HTMLVideoElement) {
    playMarketingVideo(pausedPreview);
  }
  pausedPreview = null;
}

function stopLightboxVideo() {
  if (!lightboxVideo) return;
  lightboxVideo.pause();
  lightboxVideo.removeAttribute('src');
  lightboxVideo.removeAttribute('poster');
  lightboxVideo.load();
  lightboxVideo.hidden = true;
}

function clearEmbedLoadHandler() {
  if (embedLoadHandler && lightboxIframe) {
    lightboxIframe.removeEventListener('load', embedLoadHandler);
  }
  embedLoadHandler = null;
}

function stopLightboxIframe() {
  if (!lightboxIframe) return;
  clearEmbedLoadHandler();
  lightboxFrame?.classList.remove(EMBED_LOADING_CLASS);
  lightboxIframe.src = 'about:blank';
  lightboxIframe.removeAttribute('src');
  lightboxIframe.hidden = true;
}

function stopLightboxMedia() {
  stopLightboxVideo();
  stopLightboxIframe();
}

function destroyLightboxDom() {
  if (lightboxEl) {
    gsap.killTweensOf([lightboxEl, lightboxFrame].filter(Boolean));
  }
  stopLightboxMedia();
  lockScroll(false);
  restorePreview();
  lightboxEl?.remove();
  lightboxEl = null;
  lightboxVideo = null;
  lightboxIframe = null;
  lightboxFrame = null;
  lightboxCloseBtn = null;
  embedLoadHandler = null;
  lastFocus = null;
  isOpen = false;
  isAnimating = false;
}

/**
 * @param {string} src
 * @param {string} [poster]
 */
function loadLightboxVideo(src, poster) {
  if (!lightboxVideo) return;
  stopLightboxIframe();
  lightboxVideo.hidden = false;
  if (poster) lightboxVideo.poster = poster;
  else lightboxVideo.removeAttribute('poster');
  lightboxVideo.src = src;
  lightboxVideo.currentTime = 0;
  lightboxVideo.muted = false;
  const playAttempt = lightboxVideo.play();
  if (playAttempt && typeof playAttempt.catch === 'function') {
    playAttempt.catch(() => {
      if (!lightboxVideo) return;
      lightboxVideo.muted = true;
      lightboxVideo.play().catch(() => {});
    });
  }
}

/**
 * FrameRate reads `autoplay=1` (+ optional volume fade-in after a user gesture).
 * @param {string} href
 * @returns {string}
 */
function withEmbedAutoplay(href) {
  try {
    const url = new URL(href, window.location.href);
    url.searchParams.set('autoplay', '1');
    url.searchParams.set('autoplay_volume_fadein', '1');
    return url.href;
  } catch {
    const join = href.includes('?') ? '&' : '?';
    return `${href}${join}autoplay=1&autoplay_volume_fadein=1`;
  }
}

/** @param {string} href */
function loadLightboxEmbed(href) {
  if (!lightboxIframe) return;
  stopLightboxVideo();
  clearEmbedLoadHandler();
  // Hide the iframe until Framerate paints — browser blank docs are white,
  // and the black lightbox frame should show through until then.
  lightboxFrame?.classList.add(EMBED_LOADING_CLASS);
  lightboxIframe.hidden = false;
  embedLoadHandler = () => {
    clearEmbedLoadHandler();
    lightboxFrame?.classList.remove(EMBED_LOADING_CLASS);
  };
  lightboxIframe.addEventListener('load', embedLoadHandler);
  lightboxIframe.src = withEmbedAutoplay(href);
}

/** @returns {Promise<void>} */
function animateOpen() {
  if (!lightboxEl || !lightboxFrame) return Promise.resolve();
  gsap.killTweensOf([lightboxEl, lightboxFrame]);

  if (prefersReducedMotion()) {
    gsap.set(lightboxEl, { opacity: 1, '--lightbox-backdrop-blur': BACKDROP_BLUR });
    gsap.set(lightboxFrame, { opacity: 1, scale: 1, y: 0 });
    return Promise.resolve();
  }

  gsap.set(lightboxEl, { opacity: 0, '--lightbox-backdrop-blur': '0px' });
  gsap.set(lightboxFrame, { opacity: 0, scale: 0.94, y: 28 });

  return new Promise((resolve) => {
    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: resolve,
    });
    tl.to(
      lightboxEl,
      { opacity: 1, '--lightbox-backdrop-blur': BACKDROP_BLUR, duration: OPEN_MS * 0.85 },
      0,
    );
    tl.to(lightboxFrame, { opacity: 1, scale: 1, y: 0, duration: OPEN_MS }, 0.04);
  });
}

/** @returns {Promise<void>} */
function animateClose() {
  if (!lightboxEl || !lightboxFrame) return Promise.resolve();
  gsap.killTweensOf([lightboxEl, lightboxFrame]);

  if (prefersReducedMotion()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const tl = gsap.timeline({
      defaults: { ease: 'power3.in' },
      onComplete: resolve,
    });
    tl.to(lightboxFrame, { opacity: 0, scale: 0.96, y: 18, duration: CLOSE_MS }, 0);
    tl.to(
      lightboxEl,
      { opacity: 0, '--lightbox-backdrop-blur': '0px', duration: CLOSE_MS * 0.9 },
      0.04,
    );
  });
}

async function closeLightbox() {
  if (!isOpen || !lightboxEl || isAnimating) return;
  isAnimating = true;
  const focusReturn = lastFocus;
  try {
    await animateClose();
  } finally {
    stopLightboxMedia();
    if (lightboxEl) lightboxEl.hidden = true;
    lockScroll(false);
    isOpen = false;
    isAnimating = false;
    restorePreview();
    lastFocus = null;
    if (focusReturn instanceof HTMLElement) {
      focusReturn.focus({ preventScroll: true });
    }
  }
}

/**
 * @param {{ src?: string, href?: string, poster?: string, trigger?: HTMLElement | null }} options
 */
async function openLightbox(options) {
  const { src = '', href = '', poster = '', trigger = null } = options;
  if ((!src && !href) || isAnimating) return;
  if (isOpen) await closeLightbox();

  const root = ensureLightbox();
  lastFocus = trigger || document.activeElement;
  isAnimating = true;
  isOpen = true;
  lockScroll(true);
  root.hidden = false;
  if (href) loadLightboxEmbed(href);
  else loadLightboxVideo(src, poster);
  try {
    await animateOpen();
    lightboxCloseBtn?.focus({ preventScroll: true });
  } finally {
    isAnimating = false;
  }
}

/** @param {HTMLElement} hit */
function resolvePlaySource(hit) {
  const src = hit.getAttribute('data-play-src')?.trim() || '';
  if (src) return src;
  const preview = hit
    .closest('.orby-marketing__figure-mask')
    ?.querySelector('video.orby-marketing__figure-video');
  if (preview instanceof HTMLVideoElement && preview.currentSrc) return preview.currentSrc;
  if (preview instanceof HTMLVideoElement) {
    return preview.getAttribute('src') || '';
  }
  return '';
}

/** @param {HTMLElement} hit */
function resolvePoster(hit) {
  const preview = hit
    .closest('.orby-marketing__figure-mask')
    ?.querySelector('video.orby-marketing__figure-video');
  if (preview instanceof HTMLVideoElement) {
    return preview.getAttribute('poster') || '';
  }
  return '';
}

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function initMarketingPlayVideo(root) {
  abortController?.abort();
  destroyLightboxDom();
  const ac = new AbortController();
  abortController = ac;
  const { signal } = ac;

  ensureLightbox();

  const onClick = (event) => {
    const hit = event.target instanceof Element ? event.target.closest(HIT_SELECTOR) : null;
    if (!(hit instanceof HTMLElement) || !root.contains(hit)) return;
    event.preventDefault();

    const href = hit.getAttribute('data-play-href')?.trim() || '';
    const src = href ? '' : resolvePlaySource(hit);
    if (!href && !src) return;

    const preview = hit
      .closest('.orby-marketing__figure-mask')
      ?.querySelector('video.orby-marketing__figure-video');
    if (preview instanceof HTMLVideoElement) {
      preview.pause();
      pausedPreview = preview;
    }

    void openLightbox({
      href,
      src,
      poster: href ? '' : resolvePoster(hit),
      trigger: hit,
    });
  };

  const onKeyDown = (event) => {
    if (event.key !== 'Escape' || !isOpen) return;
    event.preventDefault();
    void closeLightbox();
  };

  const onLightboxClick = (event) => {
    if (!lightboxEl || !isOpen) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      target.closest('.orby-marketing__video-lightbox-close') ||
      target.classList.contains('orby-marketing__video-lightbox-scrim')
    ) {
      event.preventDefault();
      void closeLightbox();
    }
  };

  root.addEventListener('click', onClick, { signal });
  document.addEventListener('keydown', onKeyDown, { signal });
  lightboxEl?.addEventListener('click', onLightboxClick, { signal });

  return () => {
    ac.abort();
    if (abortController === ac) abortController = null;
    destroyLightboxDom();
  };
}
