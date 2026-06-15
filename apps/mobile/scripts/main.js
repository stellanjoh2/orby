import { MobileShell } from './MobileShell.js';
import {
  hasMobileAppSession,
  hasMobileHandoffPendingFlag,
  hasPendingMobileModelHandoff,
  waitForMobileModelHandoff,
} from '../../../scripts/orbyMobileHandoff.js';
import { orbyMobileLandingUrl } from '../../../scripts/orbyMobileAppRoute.js';

function urlHasHandoffFlag() {
  try {
    return new URLSearchParams(window.location.search).get('handoff') === '1';
  } catch {
    return false;
  }
}

/** @param {HTMLElement} root */
function showBootError(root) {
  const toast = root.querySelector('.orby-mobile-toast');
  if (!toast) return;
  toast.textContent = 'Orby Mobile failed to start — reload or try again';
  toast.hidden = false;
  toast.classList.add('is-visible');
}

/**
 * Skip the 4s handoff poll when the user already has an active session.
 * Only wait when landing just staged a file (iOS often beats IndexedDB).
 */
async function resolveMobileEntry() {
  if (hasMobileAppSession()) return 'app';

  const expectsHandoff = hasMobileHandoffPendingFlag() || urlHasHandoffFlag();
  if (expectsHandoff) {
    return (await waitForMobileModelHandoff()) ? 'app' : 'landing';
  }

  return (await hasPendingMobileModelHandoff()) ? 'app' : 'landing';
}

async function boot() {
  const root = document.getElementById('orbyMobile');
  if (!root) return;

  root.dataset.boot = 'pending';

  const entry = await resolveMobileEntry();
  if (entry === 'landing') {
    window.location.replace(orbyMobileLandingUrl());
    return;
  }

  root.dataset.boot = 'ready';
  try {
    new MobileShell(root);
  } catch (err) {
    console.error('[Orby Mobile] Boot failed', err);
    root.dataset.boot = 'error';
    showBootError(root);
  }
}

void boot().catch((err) => {
  console.error('[Orby Mobile] Unhandled boot error', err);
  const root = document.getElementById('orbyMobile');
  if (root) {
    root.dataset.boot = 'error';
    showBootError(root);
  }
});
