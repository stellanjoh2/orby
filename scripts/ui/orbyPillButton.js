/**
 * Flat lime / ghost pills — home (normal) and fullscreen big-message modals (xl).
 * Keeps labels and variants in sync across thank-you, return-home, and 404 prompts.
 */

/** @param {string} label */
export function formatOrbyPillLabel(label) {
  const t = String(label ?? '').trim();
  if (!t) return '→';
  return /→\s*$/.test(t) ? t : `${t} →`;
}

/** @param {HTMLButtonElement | null} button */
export function setOrbyPillButtonLabel(button, label, { arrow = true } = {}) {
  if (!button) return;
  const t = String(label ?? '').trim();
  button.textContent = arrow ? formatOrbyPillLabel(t) : t;
}

/**
 * @param {HTMLButtonElement | null} button
 * @param {'accent' | 'ghost'} [variant]
 */
export function setOrbyPillButtonVariant(button, variant = 'ghost') {
  if (!button) return;
  button.classList.remove('orby-pill-btn--accent', 'orby-pill-btn--ghost');
  button.classList.add(variant === 'accent' ? 'orby-pill-btn--accent' : 'orby-pill-btn--ghost');
}

/**
 * @param {string} label
 * @param {{ size?: 'normal' | 'xl', variant?: 'accent' | 'ghost', extraClass?: string, attrs?: string }} [options]
 */
export function orbyPillButtonHtml(label, options = {}) {
  const size = options.size === 'xl' ? 'orby-pill-btn--xl' : 'orby-pill-btn--normal';
  const variant =
    options.variant === 'accent' ? 'orby-pill-btn--accent' : 'orby-pill-btn--ghost';
  const extraClass = options.extraClass?.trim() || '';
  const attrs = options.attrs?.trim() || '';
  const classes = ['orby-pill-btn', size, variant, extraClass].filter(Boolean).join(' ');
  return `<button type="button" class="${classes}"${attrs ? ` ${attrs}` : ''}>${formatOrbyPillLabel(label)}</button>`;
}
