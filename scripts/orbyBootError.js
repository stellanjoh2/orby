/** @type {boolean} */
let bootErrorVisible = false;

/**
 * Full-screen fatal boot error — works before UIManager is ready.
 * @param {{ title?: string, message: string, detail?: string }} options
 */
export function showOrbyBootError({ title = 'Orby could not start', message, detail } = {}) {
  if (bootErrorVisible || typeof document === 'undefined') return;
  bootErrorVisible = true;

  document.documentElement.classList.remove('orby-dropzone-shell-pending');
  document.documentElement.classList.add('orby-boot-failed');

  const existing = document.getElementById('orbyBootError');
  if (existing) {
    existing.hidden = false;
    return;
  }

  const root = document.createElement('div');
  root.id = 'orbyBootError';
  root.className = 'orby-boot-error';
  root.setAttribute('role', 'alertdialog');
  root.setAttribute('aria-modal', 'true');

  const card = document.createElement('div');
  card.className = 'orby-boot-error__card';

  const heading = document.createElement('h2');
  heading.id = 'orbyBootErrorTitle';
  heading.className = 'orby-boot-error__title';
  heading.textContent = title;
  root.setAttribute('aria-labelledby', heading.id);

  const body = document.createElement('p');
  body.className = 'orby-boot-error__message';
  body.textContent = message;

  card.append(heading, body);

  const detailText = typeof detail === 'string' ? detail.trim() : '';
  if (detailText) {
    const detailEl = document.createElement('p');
    detailEl.className = 'orby-boot-error__detail';
    detailEl.textContent = detailText;
    card.appendChild(detailEl);
  }

  const actions = document.createElement('div');
  actions.className = 'orby-boot-error__actions';

  const reloadBtn = document.createElement('button');
  reloadBtn.type = 'button';
  reloadBtn.className = 'accent-action-btn';
  reloadBtn.textContent = 'Reload page';
  reloadBtn.addEventListener('click', () => {
    window.location.reload();
  });

  actions.appendChild(reloadBtn);
  card.appendChild(actions);
  root.appendChild(card);
  document.body.appendChild(root);
}
