/**
 * In Progress — fixed white endcap behind scrolling lime CTA (no second lime curtain).
 */
import { prefersReducedMotion } from '../ui/modalReveal.js';

const SCROLL_OPTS = { passive: true };
/** In Progress interactive once lime CTA has cleared the top by this much (vh). */
const REVEAL_LEAD_VH = 0.03;

/**
 * @param {HTMLElement} root
 */
export function initInProgressCurtainReveal(root) {
  const stage = root?.querySelector('[data-orby-marketing-in-progress-reveal]');
  const ctaSection = root?.querySelector('.orby-marketing__section--cta');
  if (!stage || !ctaSection) return () => {};

  const section = stage.querySelector('.orby-marketing__section--in-progress');
  if (!section) return () => {};

  if (prefersReducedMotion()) {
    stage.classList.add('is-endcap-active', 'is-revealed');
    return () => {
      stage.classList.remove('is-endcap-active', 'is-revealed');
    };
  }

  let raf = 0;
  let endcapOn = false;
  let scrollBound = false;
  /** @type {IntersectionObserver | null} */
  let proximityObserver = null;

  const sync = () => {
    raf = 0;
    const { top } = ctaSection.getBoundingClientRect();
    const vh = window.innerHeight;
    const revealPx = vh * REVEAL_LEAD_VH;

    /*
     * On: lime top flush with viewport (scroll down into handoff).
     * Off: as soon as lime drops below top (scroll back up) — no 3vh linger (white band).
     */
    if (!endcapOn && top <= 0) endcapOn = true;
    else if (endcapOn && top > 0) endcapOn = false;

    stage.classList.toggle('is-endcap-active', endcapOn);
    stage.classList.toggle('is-revealed', endcapOn && top <= -revealPx);
  };

  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(sync);
  };

  const bindScrollSync = () => {
    if (scrollBound) return;
    scrollBound = true;
    window.addEventListener('scroll', onScroll, SCROLL_OPTS);
    sync();
  };

  const unbindScrollSync = () => {
    if (!scrollBound) return;
    scrollBound = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener('scroll', onScroll, SCROLL_OPTS);
    endcapOn = false;
    stage.classList.remove('is-endcap-active', 'is-revealed');
  };

  window.addEventListener('resize', onScroll, SCROLL_OPTS);

  if (typeof IntersectionObserver === 'function') {
    proximityObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries.find((e) => e.target === ctaSection);
        if (!entry) return;
        if (entry.isIntersecting) bindScrollSync();
        else unbindScrollSync();
      },
      { root: null, rootMargin: '40% 0px', threshold: 0 },
    );
    proximityObserver.observe(ctaSection);
  } else {
    bindScrollSync();
  }

  return () => {
    proximityObserver?.disconnect();
    proximityObserver = null;
    unbindScrollSync();
    window.removeEventListener('resize', onScroll, SCROLL_OPTS);
    endcapOn = false;
    stage.classList.remove('is-endcap-active', 'is-revealed');
  };
}
