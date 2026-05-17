/**
 * Lime lazy-load plate — fades out in sync with media reveal (GSAP --orby-media-ph-opacity).
 */
import gsap from 'gsap';

/**
 * @param {HTMLElement} maskEl
 * @returns {HTMLElement[]}
 */
export function getMediaPlaceholderTargets(maskEl) {
  return maskEl ? [maskEl] : [];
}

/**
 * @param {HTMLElement} maskEl
 * @param {number} opacity
 */
export function setMediaPlaceholderOpacity(maskEl, opacity) {
  const targets = getMediaPlaceholderTargets(maskEl);
  if (!targets.length) return;
  gsap.set(targets, { '--orby-media-ph-opacity': opacity });
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
  tl.fromTo(
    targets,
    { '--orby-media-ph-opacity': 1 },
    { '--orby-media-ph-opacity': 0, duration, ease },
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
  return gsap.fromTo(
    targets,
    { '--orby-media-ph-opacity': 1 },
    { '--orby-media-ph-opacity': 0, duration, ease },
  );
}
