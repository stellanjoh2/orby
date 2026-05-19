/**
 * About page — scroll-linked section reveals (GSAP).
 */
import gsap from 'gsap';

const REVEAL_IO = { root: null, rootMargin: '0px 0px -12% 0px', threshold: 0.12 };
const liftY = 18;
const duration = 0.72;
const ease = 'power2.out';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function revealBlock(el) {
  if (!el || el.dataset.legalAboutRevealed === '1') return;
  el.dataset.legalAboutRevealed = '1';
  el.classList.remove('legal-about__block--pending');
  el.classList.add('legal-about__revealed');

  if (prefersReducedMotion()) {
    gsap.set(el, { clearProps: 'opacity,transform,y' });
    return;
  }

  gsap.fromTo(
    el,
    { opacity: 0, y: liftY },
    { opacity: 1, y: 0, duration, ease },
  );
}

function initAboutReveals() {
  const blocks = [...document.querySelectorAll('[data-legal-about-reveal]')];
  if (!blocks.length) return;

  if (prefersReducedMotion()) {
    blocks.forEach((el) => {
      el.classList.remove('legal-about__block--pending');
      el.classList.add('legal-about__revealed');
    });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      revealBlock(entry.target);
      observer.unobserve(entry.target);
    }
  }, REVEAL_IO);

  blocks.forEach((el) => observer.observe(el));
}

initAboutReveals();
