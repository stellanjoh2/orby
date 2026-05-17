/**
 * Intro + footer hero PNGs — scroll-linked parallax (moves with scroll, slower than content).
 */
import { prefersReducedMotion } from '../ui/modalReveal.js';

/**
 * @param {HTMLElement} section
 * @param {HTMLElement} asset
 * @param {number} strength Fraction of scroll delta applied (e.g. 0.18 = 18% lag).
 * @returns {() => void}
 */
function bindSectionParallax(section, asset, strength) {
  if (!section || !asset) return () => {};

  let sectionDocTop = 0;

  const updateSectionDocTop = () => {
    sectionDocTop = section.getBoundingClientRect().top + window.scrollY;
  };

  const applyParallax = () => {
    // Scroll down → negative Y → asset drifts up within the section (classic parallax).
    const y = (sectionDocTop - window.scrollY) * strength;
    asset.style.setProperty('--orby-intro-parallax-y', `${y}px`);
  };

  const onResize = () => {
    updateSectionDocTop();
    applyParallax();
  };

  updateSectionDocTop();
  applyParallax();

  document.addEventListener('scroll', applyParallax, { passive: true, capture: true });
  window.addEventListener('resize', onResize, { passive: true });

  return () => {
    document.removeEventListener('scroll', applyParallax, { capture: true });
    window.removeEventListener('resize', onResize);
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
