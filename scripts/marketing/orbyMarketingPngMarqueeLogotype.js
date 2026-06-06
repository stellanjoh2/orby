/**
 * PNG marquee backdrop — static site-width logotype.
 * (Lottie data.json includes static orby + orbiting O; mid-orbit reads as a duplicate.)
 */
const IO_OPTIONS = { root: null, rootMargin: '240px 0px', threshold: 0.05 };

/**
 * @param {HTMLElement} slot
 */
function mountStaticLogotype(slot) {
  if (slot.querySelector('.orby-marketing__png-marquee-logotype-mark')) return;
  slot.replaceChildren();
  const mark = document.createElement('span');
  mark.className = 'orby-marketing__png-marquee-logotype-mark';
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', 'Orby');
  slot.appendChild(mark);
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

  if (block.getBoundingClientRect().bottom >= 0 && block.getBoundingClientRect().top <= window.innerHeight) {
    ensureLogotype();
  }

  return () => {
    destroyed = true;
    observer.disconnect();
    slot.replaceChildren();
    mounted = false;
  };
}
