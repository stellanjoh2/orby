/**
 * PNG marquee backdrop — static site-width logotype.
 * (Lottie data.json includes static orby + orbiting O; mid-orbit reads as a duplicate.)
 */
const LOGOTYPE_SVG = './assets/images/orby-logotype.svg';
const IO_OPTIONS = { root: null, rootMargin: '240px 0px', threshold: 0.05 };

/**
 * @param {HTMLElement} slot
 */
function mountStaticLogotype(slot) {
  slot.replaceChildren();
  const img = document.createElement('img');
  img.src = LOGOTYPE_SVG;
  img.alt = '';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.setAttribute('aria-hidden', 'true');
  slot.appendChild(img);
}

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function initPngMarqueeLogotype(root) {
  const slot = root.querySelector('[data-orby-marketing-png-marquee-logotype]');
  const block = root.querySelector('[data-orby-marketing-png-marquee]');
  if (!slot || !block) return () => {};

  let mounted = false;
  let destroyed = false;

  const ensureLogotype = () => {
    if (mounted || destroyed) return;
    mounted = true;
    mountStaticLogotype(slot);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.target !== block) return;
      if (entry.isIntersecting) ensureLogotype();
    });
  }, IO_OPTIONS);

  observer.observe(block);

  return () => {
    destroyed = true;
    observer.disconnect();
    slot.replaceChildren();
    mounted = false;
  };
}
