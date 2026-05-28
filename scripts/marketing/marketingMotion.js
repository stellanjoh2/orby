/**
 * Homepage marketing — single GSAP entry. Import motion from here in marketing modules.
 * Preload when marketing mounts (see orbyMarketingPage.js) so enhancers share one parse.
 */
import gsap from 'gsap';

export { gsap };
export default gsap;

export function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export {
  wrapWordsForBigMessage,
  BIG_MESSAGE_STAGGER_CLASS,
  MARKETING_GRADIENT_PHRASE_CLASS,
  TEXT_REVEAL_PACE,
} from '../ui/bigMessageHeadlineReveal.js';
