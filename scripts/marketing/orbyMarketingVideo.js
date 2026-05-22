/**
 * Safari-safe muted loop autoplay for marketing <video> elements.
 * Safari requires muted/playsInline as properties (not only attributes) and
 * often fails to decode video while a CSS filter is applied.
 */

/** Inline attrs shared by marketing <video> markup. */
export const MARKETING_VIDEO_HTML_ATTRS =
  'autoplay playsinline muted loop preload="auto"';

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
  video.setAttribute('autoplay', '');
}

/**
 * @param {HTMLVideoElement} video
 */
export function playMarketingVideo(video) {
  if (!(video instanceof HTMLVideoElement)) return;
  primeMarketingVideo(video);

  video.addEventListener(
    'playing',
    () => {
      video.removeAttribute('poster');
    },
    { once: true },
  );

  if (video.error) return;

  const attemptPlay = () => {
    if (video.error) return;
    const result = video.play();
    if (result && typeof result.then === 'function') {
      result.catch(() => {});
    }
  };

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    attemptPlay();
    return;
  }

  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    video.load();
  }

  let settled = false;
  const detachWaiters = () => {
    video.removeEventListener('loadeddata', onReady);
    video.removeEventListener('canplay', onReady);
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
  };

  video.addEventListener('loadeddata', onReady);
  video.addEventListener('canplay', onReady);
  video.addEventListener('error', onError);
}

/** @type {WeakMap<HTMLVideoElement, IntersectionObserver>} */
const visibilityPlayObservers = new WeakMap();

function isSafariBrowser() {
  return document.documentElement.classList.contains('safari-browser');
}

/**
 * Retry play when the clip enters the viewport (Safari often drops play after reveal/scroll).
 * @param {HTMLVideoElement} video
 */
function bindVisibilityPlay(video) {
  if (visibilityPlayObservers.has(video)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.2) continue;
        if (video.paused) playMarketingVideo(video);
      }
    },
    { root: null, threshold: [0, 0.2, 0.5] },
  );
  observer.observe(video);
  visibilityPlayObservers.set(video, observer);
}

/**
 * Prime all marketing clips after mount (early load on Safari).
 * @param {HTMLElement} root
 */
export function initMarketingVideos(root) {
  if (!root) return;
  root.querySelectorAll('video').forEach((video) => {
    primeMarketingVideo(video);
    if (isSafariBrowser() && video.readyState < HTMLMediaElement.HAVE_METADATA) {
      video.load();
    }
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
