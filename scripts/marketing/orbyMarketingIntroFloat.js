/**
 * Intro hero side PNGs — subtle scroll parallax on the decorative bears.
 */
import { prefersReducedMotion } from '../ui/modalReveal.js';

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function initIntroFloatParallax(root) {
  const section = root?.querySelector('.orby-marketing__section--intro');
  const left = section?.querySelector('[data-orby-marketing-intro-asset="left"]');
  if (!section || !left || prefersReducedMotion()) {
    return () => {};
  }

  let raf = 0;
  const PARALLAX_STRENGTH = 0.22;

  const update = () => {
    raf = 0;
    const rect = section.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    // Section center vs viewport center — opposite drift reads as depth on scroll
    const centerDelta = rect.top + rect.height * 0.5 - vh * 0.5;
    const parallaxY = `${-centerDelta * PARALLAX_STRENGTH}px`;
    left.style.setProperty('--orby-intro-parallax-y', parallaxY);
  };

  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };

  document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();

  return () => {
    document.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('resize', onScroll);
    if (raf) cancelAnimationFrame(raf);
    left.style.removeProperty('--orby-intro-parallax-y');
  };
}
