/**
 * Safari-safe muted loop autoplay for marketing <video> elements.
 * Safari requires muted/playsInline as properties (not only attributes) and
 * often fails to decode video while a CSS filter is applied.
 *
 * Off-screen sections use content-visibility: auto — eager load() at mount can
 * error in Safari; defer fetch until the clip (or its section) is near viewport.
 */

/** Inline attrs shared by marketing <video> markup. */
export const MARKETING_VIDEO_HTML_ATTRS =
  'autoplay playsinline webkit-playsinline muted loop preload="none"';

/**
 * @param {HTMLVideoElement} video
 * @returns {string}
 */
export function getMarketingVideoSrc(video) {
  if (!(video instanceof HTMLVideoElement)) return '';
  const attr = video.getAttribute('src') || '';
  return attr || video.currentSrc || video.src || '';
}

/**
 * @param {HTMLVideoElement} video
 * @returns {string}
 */
function resolveMarketingVideoUrl(video) {
  const raw = getMarketingVideoSrc(video);
  if (!raw) return '';
  try {
    return new URL(raw, document.baseURI || window.location.href).href;
  } catch {
    return raw;
  }
}

/**
 * @param {HTMLVideoElement} video
 */
export function primeMarketingVideo(video) {
  if (!(video instanceof HTMLVideoElement)) return;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('autoplay', '');
}

/**
 * (Re)start fetch/decode — clears stale errors from early loads under content-visibility:auto.
 * Safari often ignores attribute-only src until the .src property is set in script.
 * @param {HTMLVideoElement} video
 * @param {{ force?: boolean }} [options]
 */
export function ensureMarketingVideoLoaded(video, options = {}) {
  if (!(video instanceof HTMLVideoElement)) return;
  const { force = false } = options;
  primeMarketingVideo(video);

  const src = resolveMarketingVideoUrl(video);
  if (!src) return;

  const bound = video.dataset.orbyMarketingVideoSrc || '';
  if (force || video.error || bound !== src) {
    video.dataset.orbyMarketingVideoSrc = src;
    video.pause();
    try {
      video.currentTime = 0;
    } catch {
      /* ignore */
    }
    video.removeAttribute('src');
    video.src = src;
  }

  if (force || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    video.load();
  }
}

/**
 * Prime clips in a section right before preload/reveal (section is in-view).
 * Double rAF lets content-visibility:visible paint before Safari starts fetch.
 * @param {HTMLElement} section
 */
export function loadSectionMarketingVideos(section) {
  if (!section) return;
  const kick = () => {
    section.querySelectorAll('video').forEach((video) => {
      ensureMarketingVideoLoaded(video);
    });
  };
  kick();
  requestAnimationFrame(() => requestAnimationFrame(kick));
}

/**
 * @param {HTMLVideoElement} video
 */
export function playMarketingVideo(video) {
  if (!(video instanceof HTMLVideoElement)) return;
  primeMarketingVideo(video);

  // Keep poster until we have decoded pixels. Off-screen autoplay can fire
  // `playing` with an empty frame (black box) — especially In Progress at mount.
  const dropPosterWhenPainted = () => {
    if (video.videoWidth > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      video.removeAttribute('poster');
      video.removeEventListener('loadeddata', dropPosterWhenPainted);
      video.removeEventListener('playing', dropPosterWhenPainted);
    }
  };
  video.addEventListener('loadeddata', dropPosterWhenPainted);
  video.addEventListener('playing', dropPosterWhenPainted);

  ensureMarketingVideoLoaded(video);

  const attemptPlay = () => {
    if (video.error) {
      ensureMarketingVideoLoaded(video, { force: true });
    }
    if (video.error) return;
    const result = video.play();
    if (result && typeof result.then === 'function') {
      result.catch(() => {
        ensureMarketingVideoLoaded(video, { force: true });
        window.setTimeout(() => {
          if (!video.error) video.play().catch(() => {});
        }, 120);
      });
    }
  };

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    attemptPlay();
    return;
  }

  let settled = false;
  const detachWaiters = () => {
    video.removeEventListener('loadeddata', onReady);
    video.removeEventListener('canplay', onReady);
    video.removeEventListener('canplaythrough', onReady);
    video.removeEventListener('error', onError);
  };
  const onReady = () => {
    if (settled) return;
    settled = true;
    detachWaiters();
    attemptPlay();
  };
  const onError = () => {
    if (settled) return;
    settled = true;
    detachWaiters();
    ensureMarketingVideoLoaded(video, { force: true });
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      attemptPlay();
      return;
    }
    video.addEventListener('loadeddata', attemptPlay, { once: true });
    video.addEventListener('canplay', attemptPlay, { once: true });
    video.addEventListener('canplaythrough', attemptPlay, { once: true });
  };

  video.addEventListener('loadeddata', onReady);
  video.addEventListener('canplay', onReady);
  video.addEventListener('canplaythrough', onReady);
  video.addEventListener('error', onError);
}

/** @type {WeakMap<HTMLVideoElement, IntersectionObserver>} */
const visibilityPlayObservers = new WeakMap();

/**
 * Retry load/play when the owning section enters the viewport.
 * Observing the section (not the clip) is more reliable under content-visibility:auto.
 * @param {HTMLVideoElement} video
 */
function bindVisibilityPlay(video) {
  if (visibilityPlayObservers.has(video)) return;

  const target = video.closest('.orby-marketing__section') || video;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.12) continue;
        requestAnimationFrame(() => {
          ensureMarketingVideoLoaded(video);
          // Retry when paused OR when we never got pixels (stuck black after early play).
          if (
            video.paused
            || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
            || video.videoWidth === 0
          ) {
            playMarketingVideo(video);
          }
        });
      }
    },
    { root: null, rootMargin: '0px 0px -8% 0px', threshold: [0, 0.12, 0.35] },
  );
  observer.observe(target);
  visibilityPlayObservers.set(video, observer);
}

/**
 * Prime all marketing clips after mount — defer load() until section is in-view.
 * @param {HTMLElement} root
 */
export function initMarketingVideos(root) {
  if (!root) return;
  root.querySelectorAll('video').forEach((video) => {
    primeMarketingVideo(video);
    bindVisibilityPlay(video);
  });
}

/**
 * @param {HTMLElement} root
 */
export function teardownMarketingVideos(root) {
  if (!root) return;
  root.querySelectorAll('video').forEach((video) => {
    const observer = visibilityPlayObservers.get(video);
    observer?.disconnect();
    visibilityPlayObservers.delete(video);
  });
}
