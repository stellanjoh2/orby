/** About page — Safari class for magic-button fallbacks; Ritual/1910 image flip. */
const ua = navigator.userAgent;
const isSafari =
  /Safari/i.test(ua) &&
  !/Chrome|CriOS|Chromium|Edg|EdgiOS|OPR|OPiOS|Firefox|FxiOS|SamsungBrowser/i.test(ua);
if (isSafari) document.documentElement.classList.add('safari-browser');

const GALLERY_CYCLE_MS = 750;
const GALLERY_PRELOAD_AHEAD = 2;

/**
 * @param {HTMLImageElement} img
 * @returns {Promise<void>}
 */
function ensureGalleryImageLoaded(img) {
  const pending = img.dataset.src;
  if (pending && !img.getAttribute('src')) {
    img.src = pending;
    img.removeAttribute('data-src');
  }
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      img.removeEventListener('load', done);
      img.removeEventListener('error', done);
      resolve();
    };
    img.addEventListener('load', done);
    img.addEventListener('error', done);
  });
}

/**
 * @param {HTMLImageElement[]} imgs
 * @param {number} fromIndex
 * @param {number} count
 */
function preloadGalleryAhead(imgs, fromIndex, count) {
  const jobs = [];
  for (let i = 0; i <= count; i++) {
    jobs.push(ensureGalleryImageLoaded(imgs[(fromIndex + i) % imgs.length]));
  }
  return Promise.all(jobs);
}

function initAboutGallery() {
  const frame = document.querySelector('[data-about-gallery]');
  if (!frame) return;

  const imgs = [...frame.querySelectorAll('.legal-about__gallery-img')];
  if (imgs.length < 2) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  let index = imgs.findIndex((img) => img.classList.contains('is-active'));
  if (index < 0) index = 0;

  let timer = 0;
  let advancing = false;

  const stop = () => {
    if (timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  };

  const tick = () => {
    if (advancing) return;
    advancing = true;
    const next = (index + 1) % imgs.length;
    preloadGalleryAhead(imgs, next, GALLERY_PRELOAD_AHEAD)
      .then(() => {
        imgs[next].classList.add('is-active');
        imgs[index].classList.remove('is-active');
        index = next;
      })
      .finally(() => {
        advancing = false;
      });
  };

  const start = () => {
    if (timer) return;
    void preloadGalleryAhead(imgs, index, GALLERY_PRELOAD_AHEAD);
    timer = window.setInterval(tick, GALLERY_CYCLE_MS);
  };

  if (!('IntersectionObserver' in window)) {
    start();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) start();
        else stop();
      }
    },
    { root: null, threshold: 0.2 }
  );
  observer.observe(frame);
}

initAboutGallery();
