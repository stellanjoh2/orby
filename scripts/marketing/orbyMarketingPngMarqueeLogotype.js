/**
 * PNG marquee backdrop — same Lottie logotype as the dropzone hero.
 * Loads when the marquee block nears the viewport; plays only while on screen.
 */
import { prefersReducedMotion } from '../ui/modalReveal.js';

const LOGOTYPE_JSON = './assets/animations/data.json';
const IO_OPTIONS = { root: null, rootMargin: '240px 0px', threshold: 0.05 };

function shouldAnimateLogotype() {
  if (prefersReducedMotion()) return false;
  if (document.documentElement.classList.contains('safari-browser')) return false;
  return true;
}

/**
 * @param {HTMLElement} container
 */
function styleLogotypeMedia(container) {
  const media = container.querySelector('svg, canvas');
  if (!media) return;
  media.style.width = '100%';
  media.style.height = 'auto';
  media.style.display = 'block';
}

/**
 * @param {import('lottie-web').AnimationItem | null | undefined} instance
 */
function freezeLogotype(instance) {
  if (!instance) return;
  instance.pause();
  instance.goToAndStop(0, true);
}

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function initPngMarqueeLogotype(root) {
  const slot = root.querySelector('[data-orby-marketing-png-marquee-logotype]');
  const block = root.querySelector('[data-orby-marketing-png-marquee]');
  if (!slot || !block) return () => {};

  /** @type {import('lottie-web').AnimationItem | null} */
  let animation = null;
  let loadScheduled = false;
  let destroyed = false;

  const syncPlayback = (isVisible) => {
    if (!animation) return;
    if (isVisible && shouldAnimateLogotype()) {
      animation.play();
      return;
    }
    animation.pause();
  };

  const ensureAnimation = () => {
    if (animation || destroyed || loadScheduled) return;
    if (typeof lottie === 'undefined') {
      window.setTimeout(ensureAnimation, 100);
      return;
    }

    loadScheduled = true;
    try {
      animation = lottie.loadAnimation({
        container: slot,
        renderer: 'svg',
        loop: true,
        autoplay: false,
        path: LOGOTYPE_JSON,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
          progressiveLoad: false,
          hideOnTransparent: true,
        },
      });

      animation.addEventListener('DOMLoaded', () => {
        styleLogotypeMedia(slot);
        if (!shouldAnimateLogotype()) {
          freezeLogotype(animation);
        }
      });
    } catch (err) {
      console.error('[orby-marketing] PNG marquee logotype failed to load', err);
      loadScheduled = false;
    }
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.target !== block) return;
      if (entry.isIntersecting) {
        ensureAnimation();
        syncPlayback(true);
      } else {
        syncPlayback(false);
      }
    });
  }, IO_OPTIONS);

  observer.observe(block);

  return () => {
    destroyed = true;
    observer.disconnect();
    animation?.destroy();
    animation = null;
    slot.replaceChildren();
  };
}
