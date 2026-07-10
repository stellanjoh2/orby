import { MobileShell } from './MobileShell.js';
import {
  hasMobileAppSession,
  hasMobileHandoffPendingFlag,
  hasPendingMobileModelHandoff,
  clearMobileHandoffPending,
  markMobileHandoffFailed,
  waitForMobileModelHandoff,
} from '../../../scripts/orbyMobileHandoff.js';
import { orbyMobileLandingUrl } from '../../../scripts/orbyMobileAppRoute.js';
import { ORBY_DEV_BUILD } from '../../../scripts/orbyDevBuild.js';
import { installMobileDebugLogCapture, markMobileDebugLog } from './mobileDebugLog.js';
import { urlHasHandoffFlag } from './mobileHandoffUtils.js';

if (ORBY_DEV_BUILD) {
  installMobileDebugLogCapture();
  markMobileDebugLog('main:module-loaded');
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
  markMobileDebugLog('main:boot-start');

  const entry = await resolveMobileEntry();
  markMobileDebugLog('main:entry-resolved', { entry });
  if (entry === 'landing') {
    if (hasMobileHandoffPendingFlag() || urlHasHandoffFlag()) {
      markMobileHandoffFailed();
      clearMobileHandoffPending();
    }
    window.location.replace(orbyMobileLandingUrl());
    return;
  }

  root.dataset.boot = 'ready';
  try {
    new MobileShell(root);
    markMobileDebugLog('main:shell-constructed');
  } catch (err) {
    console.error('[Orby Mobile] Boot failed', err);
    markMobileDebugLog('main:boot-failed', { message: String(err?.message || err) });
    root.dataset.boot = 'error';
    showBootError(root);
  }
}

void boot().catch((err) => {
  console.error('[Orby Mobile] Unhandled boot error', err);
  markMobileDebugLog('main:boot-unhandled', { message: String(err?.message || err) });
  const root = document.getElementById('orbyMobile');
  if (root) {
    root.dataset.boot = 'error';
    showBootError(root);
  }
});
