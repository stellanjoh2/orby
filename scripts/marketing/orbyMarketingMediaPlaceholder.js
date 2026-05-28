/**
 * Dark lazy-load plate — real DOM layer (Safari-safe); fades with media via GSAP opacity.
 */
import { gsap } from './marketingMotion.js';

const PLACEHOLDER_CLASS = 'orby-marketing__media-ph';

/** @param {Element | null | undefined} el */
export function clearMarketingMediaFilter(el) {
  if (!el) return;
  gsap.set(el, { clearProps: 'filter' });
}

/**
 * @param {HTMLElement} maskEl
 * @returns {HTMLElement | null}
 */
export function ensureMediaPlaceholder(maskEl) {
  if (!maskEl) return null;
  let ph = maskEl.querySelector(`.${PLACEHOLDER_CLASS}`);
  if (ph instanceof HTMLElement) return ph;

  ph = document.createElement('span');
  ph.className = PLACEHOLDER_CLASS;
  ph.setAttribute('aria-hidden', 'true');
  maskEl.insertBefore(ph, maskEl.firstChild);
  return ph;
}

/**
 * @param {HTMLElement} maskEl
 * @returns {HTMLElement[]}
 */
export function getMediaPlaceholderTargets(maskEl) {
  const ph = ensureMediaPlaceholder(maskEl);
  return ph ? [ph] : [];
}

/**
 * @param {HTMLElement} maskEl
 * @param {number} opacity
 */
export function setMediaPlaceholderOpacity(maskEl, opacity) {
  const targets = getMediaPlaceholderTargets(maskEl);
  if (!targets.length) return;
  const visible = opacity > 0;
  gsap.set(targets, {
    opacity,
    visibility: visible ? 'visible' : 'hidden',
    pointerEvents: 'none',
  });
}

/**
 * @param {HTMLElement} maskEl
 * @param {gsap.core.Timeline} tl
 * @param {string | number} position
 * @param {{ duration?: number, ease?: string }} [options]
 */
export function addPlaceholderFadeOut(maskEl, tl, position, options = {}) {
  const targets = getMediaPlaceholderTargets(maskEl);
  if (!targets.length) return;
  const { duration = 1.05, ease = 'power3.out' } = options;
  gsap.set(targets, { opacity: 1, visibility: 'visible' });
  tl.to(
    targets,
    {
      opacity: 0,
      duration,
      ease,
      onComplete: () => {
        gsap.set(targets, { visibility: 'hidden' });
      },
    },
    position,
  );
}

/**
 * @param {HTMLElement} maskEl
 * @param {{ duration?: number, ease?: string }} [options]
 * @returns {gsap.core.Tween | null}
 */
export function tweenPlaceholderFadeOut(maskEl, options = {}) {
  const targets = getMediaPlaceholderTargets(maskEl);
  if (!targets.length) return null;
  const { duration = 0.95, ease = 'power2.inOut' } = options;
  gsap.set(targets, { opacity: 1, visibility: 'visible' });
  return gsap.to(targets, {
    opacity: 0,
    duration,
    ease,
    onComplete: () => {
      gsap.set(targets, { visibility: 'hidden' });
    },
  });
}
