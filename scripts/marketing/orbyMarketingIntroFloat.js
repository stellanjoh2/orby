/**
 * Intro + footer hero PNGs — subtle scroll parallax on the decorative bears.
 */
import { prefersReducedMotion } from '../ui/modalReveal.js';

/**
 * @param {HTMLElement} section
 * @param {HTMLElement} asset
 * @param {number} strength
 * @returns {() => void}
 */
function bindSectionParallax(section, asset, strength) {
  if (!section || !asset) return () => {};

  let raf = 0;

  const update = () => {
    raf = 0;
    const rect = section.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const centerDelta = rect.top + rect.height * 0.5 - vh * 0.5;
    const parallaxY = `${-centerDelta * strength}px`;
    asset.style.setProperty('--orby-intro-parallax-y', parallaxY);
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
    asset.style.removeProperty('--orby-intro-parallax-y');
  };
}

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function initIntroFloatParallax(root) {
  if (!root || prefersReducedMotion()) {
    return () => {};
  }

  const PARALLAX_STRENGTH = 0.22;
  const intro = root.querySelector('.orby-marketing__section--intro');
  const footer = root.querySelector('.orby-marketing__section--footer');
  const introAsset = intro?.querySelector('[data-orby-marketing-intro-asset="left"]');
  const footerAsset = footer?.querySelector('[data-orby-marketing-intro-asset="right"]');

  const teardownIntro = bindSectionParallax(intro, introAsset, PARALLAX_STRENGTH);
  const teardownFooter = bindSectionParallax(footer, footerAsset, PARALLAX_STRENGTH);

  return () => {
    teardownIntro();
    teardownFooter();
  };
}
