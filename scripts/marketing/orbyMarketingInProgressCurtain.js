/**
 * In Progress — enable interaction when the white panel is on screen.
 * Lime CTA → In Progress is normal document scroll (no fixed endcap / clip sync).
 */
import { prefersReducedMotion } from '../ui/modalReveal.js';

/**
 * @param {HTMLElement} root
 */
export function initInProgressCurtainReveal(root) {
  const stage = root?.querySelector('[data-orby-marketing-in-progress-reveal]');
  const section = stage?.querySelector('.orby-marketing__section--in-progress');
  if (!stage || !section) return () => {};

  if (prefersReducedMotion()) {
    stage.classList.add('is-revealed');
    return () => stage.classList.remove('is-revealed');
  }

  if (typeof IntersectionObserver !== 'function') {
    stage.classList.add('is-revealed');
    return () => stage.classList.remove('is-revealed');
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      stage.classList.toggle('is-revealed', entry.isIntersecting);
    },
    { root: null, rootMargin: '0px', threshold: 0.12 },
  );
  observer.observe(section);

  return () => {
    observer.disconnect();
    stage.classList.remove('is-revealed');
  };
}
