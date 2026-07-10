/** @type {(() => void) | null} */
let teardownTabletDesktopOnlyModal = null;

function ensureTabletDesktopOnlyModal() {
  let modal = document.getElementById('orby-mobile-desktop-only-modal');
  if (modal instanceof HTMLElement) return modal;

  modal = document.createElement('div');
  modal.id = 'orby-mobile-desktop-only-modal';
  modal.className = 'orby-mobile-desktop-only-modal';
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `<div class="orby-mobile-desktop-only-modal__panel" role="dialog" aria-modal="true" aria-labelledby="orby-mobile-desktop-only-title">
      <h2 id="orby-mobile-desktop-only-title" class="orby-mobile-desktop-only-modal__title">Desktop only</h2>
      <p class="orby-mobile-desktop-only-modal__body">Orby isn't available on tablets yet. Please open Orby on a desktop computer to load models and use the studio.</p>
      <button type="button" class="orby-mobile-desktop-only-modal__dismiss">OK</button>
    </div>`;
  document.body.appendChild(modal);

  const dismiss = () => {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('orby-mobile-modal-open');
  };

  const onDismissClick = () => dismiss();
  const onBackdropClick = (event) => {
    if (event.target === modal) dismiss();
  };
  const onKeyDown = (event) => {
    if (event.key === 'Escape' && !modal.hidden) dismiss();
  };

  modal.querySelector('.orby-mobile-desktop-only-modal__dismiss')?.addEventListener('click', onDismissClick);
  modal.addEventListener('click', onBackdropClick);
  document.addEventListener('keydown', onKeyDown);

  teardownTabletDesktopOnlyModal = () => {
    dismiss();
    modal.querySelector('.orby-mobile-desktop-only-modal__dismiss')?.removeEventListener(
      'click',
      onDismissClick,
    );
    modal.removeEventListener('click', onBackdropClick);
    document.removeEventListener('keydown', onKeyDown);
    modal.remove();
    teardownTabletDesktopOnlyModal = null;
  };

  return modal;
}

export function showTabletDesktopOnlyModal() {
  const modal = ensureTabletDesktopOnlyModal();
  modal.hidden = false;
  modal.removeAttribute('aria-hidden');
  document.documentElement.classList.add('orby-mobile-modal-open');
  modal.querySelector('.orby-mobile-desktop-only-modal__dismiss')?.focus();
}

export function teardownTabletDesktopOnlyModalUi() {
  teardownTabletDesktopOnlyModal?.();
}
