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
  const sections = stage
    ? [...stage.querySelectorAll('.orby-marketing__section--in-progress')]
    : [];
  if (!stage || !sections.length) return () => {};

  if (prefersReducedMotion()) {
    stage.classList.add('is-revealed');
    return () => stage.classList.remove('is-revealed');
  }

  if (typeof IntersectionObserver !== 'function') {
    stage.classList.add('is-revealed');
    return () => stage.classList.remove('is-revealed');
  }

  const visible = new Set();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      stage.classList.toggle('is-revealed', visible.size > 0);
    },
    { root: null, rootMargin: '0px', threshold: 0.12 },
  );
  sections.forEach((section) => observer.observe(section));

  return () => {
    observer.disconnect();
    visible.clear();
    stage.classList.remove('is-revealed');
  };
}
