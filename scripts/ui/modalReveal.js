import gsap from 'gsap';

export function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Prevents stacking close timelines (killing a tween skips its onComplete). */
const modalCloseInProgress = new WeakSet();

const MODAL_CONTENT_OPEN_DURATION = 0.42;
const MODAL_BACKDROP_REVEAL_DURATION = 0.22;
const MODAL_CONTENT_OPEN_DELAY_WITH_BACKDROP = 0.07;
const MODAL_BACKDROP_BLUR_TARGET = '8px';
/** Drop shadow on popup chrome — pair with `rgba(..., calc(strength * var(--popup-chrome-shadow-alpha)))` in CSS */
const POPUP_CHROME_SHADOW_VAR = '--popup-chrome-shadow-alpha';
const POPUP_CHROME_SHADOW_FADE_IN_DURATION = 0.5;
const POPUP_CHROME_SHADOW_FADE_OUT_DURATION = 0.26;
const POPUP_CONTENT_CLEAR_PROPS = `clipPath,transform,${POPUP_CHROME_SHADOW_VAR}`;

/**
 * Instantly hide a modal and clear GSAP state (e.g. dismiss / recovery when animation was interrupted).
 */
export function snapModalHidden(modal, panel = null) {
  if (!modal) return;
  const content = panel ?? modal.querySelector('.load-settings-content');
  modalCloseInProgress.delete(modal);
  const kill = content ? [modal, content] : [modal];
  gsap.killTweensOf(kill);
  modal.style.display = 'none';
  if (content) gsap.set(content, { clearProps: POPUP_CONTENT_CLEAR_PROPS });
  gsap.set(modal, { clearProps: 'clipPath,transform,--modal-backdrop-blur' });
}

/**
 * Full-viewport wipe + content lift. Uses clip-path and y only (no opacity on the overlay).
 * @param {HTMLElement | null} modal
 * @param {HTMLElement | null} [panel]
 * @param {{ revealBackdrop?: boolean }} [options] When false, skips the clip-path wipe; backdrop blur eases in with the panel instead.
 * @returns {Promise<void>}
 */
export function animateModalOpen(modal, panel = null, options = {}) {
  if (!modal) return Promise.resolve();
  const revealBackdrop = options.revealBackdrop !== false;
  modalCloseInProgress.delete(modal);
  const content = panel ?? modal.querySelector('.load-settings-content');
  if (!content) {
    modal.style.display = 'flex';
    return Promise.resolve();
  }

  if (prefersReducedMotion()) {
    gsap.killTweensOf([modal, content]);
    modal.style.display = 'flex';
    gsap.set([modal, content], { clearProps: `clipPath,transform,${POPUP_CHROME_SHADOW_VAR}` });
    return Promise.resolve();
  }

  gsap.killTweensOf([modal, content]);
  modal.style.display = 'flex';
  gsap.set(modal, { clipPath: revealBackdrop ? 'inset(0 0 100% 0)' : 'inset(0 0 0%)' });
  if (!revealBackdrop) {
    gsap.set(modal, { '--modal-backdrop-blur': '0px' });
  }
  gsap.set(content, {
    y: 40,
    clipPath: 'inset(0 0 100% 0)',
    [POPUP_CHROME_SHADOW_VAR]: 0,
  });

  return new Promise((resolve) => {
    const contentStart = revealBackdrop ? MODAL_CONTENT_OPEN_DELAY_WITH_BACKDROP : 0;
    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        gsap.set(modal, { clearProps: 'clipPath,--modal-backdrop-blur' });
        gsap.set(content, { clearProps: POPUP_CONTENT_CLEAR_PROPS });
        resolve();
      },
    });
    if (revealBackdrop) {
      tl.to(
        modal,
        { clipPath: 'inset(0 0 0%)', duration: MODAL_BACKDROP_REVEAL_DURATION, ease: 'power2.out' },
        0,
      );
    } else {
      tl.to(
        modal,
        {
          '--modal-backdrop-blur': MODAL_BACKDROP_BLUR_TARGET,
          duration: MODAL_CONTENT_OPEN_DURATION,
          ease: 'power3.out',
        },
        0,
      );
    }
    tl.to(
      content,
      { y: 0, clipPath: 'inset(0 0 0%)', duration: MODAL_CONTENT_OPEN_DURATION },
      contentStart,
    );
    tl.to(
      content,
      {
        [POPUP_CHROME_SHADOW_VAR]: 1,
        duration: POPUP_CHROME_SHADOW_FADE_IN_DURATION,
        ease: 'power2.out',
      },
      contentStart,
    );
  });
}

/**
 * @param {HTMLElement | null} modal
 * @param {HTMLElement | null} [panel]
 * @param {() => void} [afterHidden]
 * @param {boolean} [preserveViewportBackdrop] If true, only wipes the panel; modal root stays full-screen (keeps dim scrim during close — e.g. bug report → thank-you).
 * @param {{ revealBackdrop?: boolean }} [options] When false, fades backdrop blur out with the panel instead of a clip-path wipe.
 */
export function animateModalClose(modal, panel = null, afterHidden, preserveViewportBackdrop = false, options = {}) {
  if (!modal) {
    afterHidden?.();
    return;
  }
  const revealBackdrop = options.revealBackdrop !== false;
  const content = panel ?? modal.querySelector('.load-settings-content');

  const finish = () => {
    modalCloseInProgress.delete(modal);
    modal.style.display = 'none';
    if (content) gsap.set(content, { clearProps: POPUP_CONTENT_CLEAR_PROPS });
    gsap.set(modal, { clearProps: 'clipPath,transform,--modal-backdrop-blur' });
    afterHidden?.();
  };

  if (!content || modal.style.display === 'none') {
    finish();
    return;
  }

  if (modalCloseInProgress.has(modal)) return;
  modalCloseInProgress.add(modal);

  if (prefersReducedMotion()) {
    gsap.killTweensOf([modal, content]);
    finish();
    return;
  }

  gsap.killTweensOf([modal, content]);
  gsap.set(modal, { clipPath: 'inset(0 0 0%)' });
  gsap.set(content, { y: 0, clipPath: 'inset(0 0 0%)' });

  const tl = gsap.timeline({
    defaults: { ease: 'power3.in' },
    onComplete: finish,
  });
  tl.to(
    content,
    {
      y: 32,
      clipPath: 'inset(100% 0 0 0)',
      [POPUP_CHROME_SHADOW_VAR]: 0,
      duration: POPUP_CHROME_SHADOW_FADE_OUT_DURATION,
    },
    0,
  );
  if (!preserveViewportBackdrop) {
    if (revealBackdrop) {
      tl.to(modal, { clipPath: 'inset(0 0 100% 0)', duration: MODAL_BACKDROP_REVEAL_DURATION }, 0.05);
    } else {
      tl.to(
        modal,
        {
          '--modal-backdrop-blur': '0px',
          duration: MODAL_CONTENT_OPEN_DURATION,
          ease: 'power3.in',
        },
        0,
      );
    }
  }
}
