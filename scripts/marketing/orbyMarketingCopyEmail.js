/**
 * Footer “Contact” copy-to-clipboard — studio toast when available, marketing fallback otherwise.
 */
import { MARKETING_ROOT_ID } from './orbyMarketingConstants.js';

const MARKETING_COPY_TOAST_CLASS = 'orby-marketing__copy-toast';
const MARKETING_COPY_TOAST_MESSAGE = 'Contact email copied to clipboard';
let marketingCopyToastHideTimer = null;
let marketingCopyToastRemoveTimer = null;
/** @type {Array<{ btn: HTMLElement; handler: (event: Event) => void }>} */
let marketingCopyBoundButtons = [];

function clearMarketingCopyToastTimers() {
  if (marketingCopyToastHideTimer != null) {
    window.clearTimeout(marketingCopyToastHideTimer);
    marketingCopyToastHideTimer = null;
  }
  if (marketingCopyToastRemoveTimer != null) {
    window.clearTimeout(marketingCopyToastRemoveTimer);
    marketingCopyToastRemoveTimer = null;
  }
}

function showMarketingCopyToast(message) {
  document.querySelector(`.${MARKETING_COPY_TOAST_CLASS}`)?.remove();
  clearMarketingCopyToastTimers();

  const toast = document.createElement('div');
  toast.className = MARKETING_COPY_TOAST_CLASS;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('is-visible'));
  });

  marketingCopyToastHideTimer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
    marketingCopyToastHideTimer = null;
    marketingCopyToastRemoveTimer = window.setTimeout(() => {
      toast.remove();
      marketingCopyToastRemoveTimer = null;
    }, 320);
  }, 2200);
}

/** @param {string} message @param {{ caution?: boolean }} [options] */
function notifyMarketingCopy(message, options = {}) {
  const ui = window.orby?.ui;
  if (typeof ui?.showToast === 'function') {
    ui.showToast(message, 2600, {
      caution: options.caution === true,
      notification: options.caution !== true,
    });
    return;
  }
  showMarketingCopyToast(message);
}

function copyTextFallback(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}

async function copyMarketingEmail(email) {
  const value = String(email || '').trim();
  if (!value) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else if (!copyTextFallback(value)) {
      throw new Error('clipboard unavailable');
    }
    notifyMarketingCopy(MARKETING_COPY_TOAST_MESSAGE);
  } catch {
    notifyMarketingCopy('Could not copy email', { caution: true });
  }
}

/** @param {HTMLElement | null | undefined} [root] */
export function bindMarketingCopyEmail(root) {
  unbindMarketingCopyEmail();

  const marketingRoot = root ?? document.getElementById(MARKETING_ROOT_ID);
  const copyButtons = new Set();
  marketingRoot?.querySelectorAll('[data-orby-marketing-copy-email]').forEach((el) => copyButtons.add(el));
  document
    .querySelectorAll('[data-orby-marketing-scroll-nav] [data-orby-marketing-copy-email]')
    .forEach((el) => copyButtons.add(el));
  if (!copyButtons.size) return;

  copyButtons.forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    const handler = (event) => {
      event.preventDefault();
      event.stopPropagation();
      void copyMarketingEmail(btn.getAttribute('data-orby-marketing-copy-email') || '');
    };
    btn.addEventListener('click', handler);
    marketingCopyBoundButtons.push({ btn, handler });
  });
}

export function unbindMarketingCopyEmail() {
  for (const { btn, handler } of marketingCopyBoundButtons) {
    btn.removeEventListener('click', handler);
  }
  marketingCopyBoundButtons = [];
  document.querySelector(`.${MARKETING_COPY_TOAST_CLASS}`)?.remove();
  clearMarketingCopyToastTimers();
}
