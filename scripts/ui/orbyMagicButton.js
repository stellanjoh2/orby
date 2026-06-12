/**
 * Shared “magic pill” CTA markup — dropzone hero + marketing (dark backgrounds).
 */

export const ORBY_MAGIC_BTN_ARROW_SVG = `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 8h9M9 4.5L12.5 8 9 11.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * Marketing magic-pill labels — sentence case (first word capitalized, rest lower).
 * @param {string} label
 */
export function formatMarketingButtonLabel(label) {
  const t = String(label ?? '').trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/**
 * @param {string} label — already escaped when emitted from marketing templates
 * @param {{ extraClass?: string, attrs?: string }} [options]
 */
export function orbyMagicButtonHtml(label, options = {}) {
  const extraClass = options.extraClass?.trim() || '';
  const attrs = options.attrs?.trim() || '';
  const classes = ['orby-magic-btn', extraClass].filter(Boolean).join(' ');
  return `<span class="orby-magic-btn-host"><button type="button" class="${classes}"${attrs ? ` ${attrs}` : ''}>
        <span class="orby-magic-btn__fill" aria-hidden="true"></span>
        <span class="orby-magic-btn__inner">
          <span class="orby-magic-btn__label">${label}</span>
          <span class="orby-magic-btn__arrow" aria-hidden="true">${ORBY_MAGIC_BTN_ARROW_SVG}</span>
        </span>
      </button></span>`;
}

/**
 * Magic pill link — dropzone scale, rotating stroke, no glow (B/W on light surfaces).
 * @param {string} label — already escaped
 * @param {string} href — already escaped
 * @param {{ extraClass?: string, attrs?: string }} [options]
 */
export function orbyMagicButtonMonoLinkHtml(label, href, options = {}) {
  const extraClass = options.extraClass?.trim() || '';
  const attrs = options.attrs?.trim() || '';
  const classes = ['orby-magic-btn', 'orby-magic-btn--mono', extraClass].filter(Boolean).join(' ');
  return `<span class="orby-magic-btn-host orby-magic-btn-host--mono"><a class="${classes}" href="${href}"${attrs ? ` ${attrs}` : ''}>
        <span class="orby-magic-btn__fill" aria-hidden="true"></span>
        <span class="orby-magic-btn__inner">
          <span class="orby-magic-btn__label">${label}</span>
          <span class="orby-magic-btn__arrow" aria-hidden="true">${ORBY_MAGIC_BTN_ARROW_SVG}</span>
        </span>
      </a></span>`;
}

/**
 * Flat inverted pill for lime marketing surfaces — same footprint as `.orby-magic-btn`, no glow.
 * @param {string} label
 * @param {{ extraClass?: string, attrs?: string, variant?: 'solid' | 'outline' }} [options]
 */
/**
 * @param {HTMLButtonElement | null} button
 * @param {string} label
 */
export function setOrbyMagicButtonLabel(button, label) {
  if (!button) return;
  const text = formatMarketingButtonLabel(label);
  const el = button.querySelector('.orby-magic-btn__label');
  if (el) el.textContent = text;
  else button.textContent = text;
}

const ORBY_MAGIC_BTN_FILL_HTML = '<span class="orby-magic-btn__fill" aria-hidden="true"></span>';

/**
 * Toggle an existing magic pill between animated glow (dropzone) and flat dialog styles.
 * @param {HTMLButtonElement | null} button
 * @param {'glow' | 'dialog-ghost'} [variant]
 */
export function setOrbyMagicButtonVariant(button, variant = 'dialog-ghost') {
  if (!button) return;
  button.classList.remove(
    'orby-magic-btn--dialog',
    'orby-magic-btn--dialog-ghost',
    'orby-magic-btn--dialog-accent',
    'orby-magic-btn--on-lime',
    'orby-magic-btn--solid-lime',
    'orby-magic-btn--outline-lime',
  );
  if (variant === 'glow') {
    button.classList.add('dropzone-btn');
    if (!button.querySelector('.orby-magic-btn__fill')) {
      button.insertAdjacentHTML('afterbegin', ORBY_MAGIC_BTN_FILL_HTML);
    }
    return;
  }
  button.classList.remove('dropzone-btn');
  button.classList.add('orby-magic-btn--dialog', 'orby-magic-btn--dialog-ghost');
  if (!button.querySelector('.orby-magic-btn__fill')) {
    button.insertAdjacentHTML('afterbegin', ORBY_MAGIC_BTN_FILL_HTML);
  }
}

/**
 * Flat dialog pills on dark scrims — keeps existing ghost / lime accent colors, no glow.
 * @param {string} label
 * @param {{ extraClass?: string, attrs?: string, variant?: 'ghost' | 'accent' }} [options]
 */
export function orbyMagicButtonDialogHtml(label, options = {}) {
  const extraClass = options.extraClass?.trim() || '';
  const attrs = options.attrs?.trim() || '';
  const variant = options.variant === 'accent' ? 'accent' : 'ghost';
  const classes = [
    'orby-magic-btn',
    'orby-magic-btn--dialog',
    variant === 'accent' ? 'orby-magic-btn--dialog-accent' : 'orby-magic-btn--dialog-ghost',
    extraClass,
  ]
    .filter(Boolean)
    .join(' ');
  const fill =
    variant === 'accent'
      ? ''
      : '<span class="orby-magic-btn__fill" aria-hidden="true"></span>\n        ';
  return `<button type="button" class="${classes}"${attrs ? ` ${attrs}` : ''}>
        ${fill}<span class="orby-magic-btn__inner">
          <span class="orby-magic-btn__label">${label}</span>
          <span class="orby-magic-btn__arrow" aria-hidden="true">${ORBY_MAGIC_BTN_ARROW_SVG}</span>
        </span>
      </button>`;
}

export function orbyMagicButtonOnLimeHtml(label, options = {}) {
  const extraClass = options.extraClass?.trim() || '';
  const attrs = options.attrs?.trim() || '';
  const variant = options.variant === 'outline' ? 'outline' : 'solid';
  const classes = [
    'orby-magic-btn',
    'orby-magic-btn--on-lime',
    variant === 'outline' ? 'orby-magic-btn--outline-lime' : 'orby-magic-btn--solid-lime',
    extraClass,
  ]
    .filter(Boolean)
    .join(' ');
  const ring =
    variant === 'outline'
      ? '<span class="orby-magic-btn__ring" aria-hidden="true"></span>\n        '
      : '';
  return `<button type="button" class="${classes}"${attrs ? ` ${attrs}` : ''}>
        ${ring}<span class="orby-magic-btn__inner">
          <span class="orby-magic-btn__label">${label}</span>
          <span class="orby-magic-btn__arrow" aria-hidden="true">${ORBY_MAGIC_BTN_ARROW_SVG}</span>
        </span>
      </button>`;
}
