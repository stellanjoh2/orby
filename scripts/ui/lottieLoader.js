/**
 * Defer lottie-web until a logotype animation is needed.
 */
const LOTTIE_SRC =
  'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js';

/** @type {Promise<typeof lottie> | null} */
let loadPromise = null;

/**
 * @returns {Promise<typeof lottie>}
 */
export function ensureLottie() {
  if (typeof globalThis.lottie !== 'undefined') {
    return Promise.resolve(globalThis.lottie);
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-orby-lottie]');
    if (existing) {
      existing.addEventListener('load', () => resolve(globalThis.lottie), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = LOTTIE_SRC;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'no-referrer';
    script.setAttribute('data-orby-lottie', '');
    script.onload = () => resolve(globalThis.lottie);
    script.onerror = () => reject(new Error('lottie-web failed to load'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
