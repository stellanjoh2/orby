/**
 * Intro + footer hero PNGs — scroll-linked parallax (moves with scroll, slower than content).
 */
import { prefersReducedMotion } from '../ui/modalReveal.js';
import { isMarketingReducedEffects } from './marketingPerformanceTier.js';

/**
 * @param {HTMLElement} section
 * @param {HTMLElement} asset
 * @param {number} strength Fraction of scroll delta applied (e.g. 0.18 = 18% lag).
 * @returns {() => void}
 */
function bindSectionParallax(section, asset, strength) {
  if (!section || !asset) return () => {};

  let sectionDocTop = 0;
  let active = false;
  let ticking = false;

  const updateSectionDocTop = () => {
    sectionDocTop = section.getBoundingClientRect().top + window.scrollY;
  };

  const applyParallax = () => {
    if (!active) return;
    let y = (sectionDocTop - window.scrollY) * strength;
    if (section.classList.contains('orby-marketing__section--footer')) {
      y = Math.min(0, y);
    }
    asset.style.setProperty('--orby-intro-parallax-y', `${y}px`);
  };

  const scheduleApply = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      applyParallax();
    });
  };

  const onResize = () => {
    updateSectionDocTop();
    scheduleApply();
  };

  updateSectionDocTop();
  scheduleApply();

  const intersectionObserver =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(
          ([entry]) => {
            active = Boolean(entry?.isIntersecting);
            if (active) {
              updateSectionDocTop();
              scheduleApply();
            }
          },
          { root: null, rootMargin: '120px 0px', threshold: 0 },
        )
      : null;

  intersectionObserver?.observe(section);
  if (!intersectionObserver) active = true;

  document.addEventListener('scroll', scheduleApply, { passive: true, capture: true });
  window.addEventListener('resize', onResize, { passive: true });

  return () => {
    intersectionObserver?.disconnect();
    document.removeEventListener('scroll', scheduleApply, { capture: true });
    window.removeEventListener('resize', onResize);
    asset.style.removeProperty('--orby-intro-parallax-y');
  };
}

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function initIntroFloatParallax(root) {
  if (!root || prefersReducedMotion() || isMarketingReducedEffects()) {
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
