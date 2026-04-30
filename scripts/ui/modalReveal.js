import gsap from 'gsap';

/** Prevents stacking close timelines (killing a tween skips its onComplete). */
const modalCloseInProgress = new WeakSet();

function reducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Full-viewport wipe + content lift. Uses clip-path and y only (no opacity on the overlay).
 * @param {HTMLElement | null} modal
 * @param {HTMLElement | null} [panel]
 * @returns {Promise<void>}
 */
export function animateModalOpen(modal, panel = null) {
  if (!modal) return Promise.resolve();
  modalCloseInProgress.delete(modal);
  const content = panel ?? modal.querySelector('.load-settings-content');
  if (!content) {
    modal.style.display = 'flex';
    return Promise.resolve();
  }

  if (reducedMotion()) {
    gsap.killTweensOf([modal, content]);
    modal.style.display = 'flex';
    gsap.set([modal, content], { clearProps: 'clipPath,transform' });
    return Promise.resolve();
  }

  gsap.killTweensOf([modal, content]);
  modal.style.display = 'flex';
  gsap.set(modal, { clipPath: 'inset(0 0 100% 0)' });
  gsap.set(content, { y: 40, clipPath: 'inset(0 0 100% 0)' });

  return new Promise((resolve) => {
    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        gsap.set(modal, { clearProps: 'clipPath' });
        gsap.set(content, { clearProps: 'clipPath,transform' });
        resolve();
      },
    });
    tl.to(modal, { clipPath: 'inset(0 0 0%)', duration: 0.22, ease: 'power2.out' }, 0).to(
      content,
      { y: 0, clipPath: 'inset(0 0 0%)', duration: 0.42 },
      0.07,
    );
  });
}

/**
 * @param {HTMLElement | null} modal
 * @param {HTMLElement | null} [panel]
 * @param {() => void} [afterHidden]
 */
export function animateModalClose(modal, panel = null, afterHidden) {
  if (!modal) {
    afterHidden?.();
    return;
  }
  const content = panel ?? modal.querySelector('.load-settings-content');

  const finish = () => {
    modalCloseInProgress.delete(modal);
    modal.style.display = 'none';
    if (content) gsap.set(content, { clearProps: 'clipPath,transform' });
    gsap.set(modal, { clearProps: 'clipPath,transform' });
    afterHidden?.();
  };

  if (!content || modal.style.display === 'none') {
    finish();
    return;
  }

  if (modalCloseInProgress.has(modal)) return;
  modalCloseInProgress.add(modal);

  if (reducedMotion()) {
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
  tl.to(content, { y: 32, clipPath: 'inset(100% 0 0 0)', duration: 0.26 }, 0).to(
    modal,
    { clipPath: 'inset(0 0 100% 0)', duration: 0.22 },
    0.05,
  );
}
