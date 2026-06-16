import { isOrbySceneFile } from '../../../scripts/import/dispatchImportFile.js';
import {
  stageMobileModelHandoff,
  clearMobileHandoffPending,
  takeMobileHandoffErrorMessage,
} from '../../../scripts/orbyMobileHandoff.js';
import { validateOrbyMobileModelFile } from '../../../scripts/orbyMobileModelLimits.js';
import { orbyMobileAppUrl } from '../../../scripts/orbyMobileAppRoute.js';

/** @param {File} file */
function isMobileModelFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'glb' || ext === 'gltf';
}

function navigateToMobileApp() {
  const url = `${orbyMobileAppUrl()}/?handoff=1`;
  window.location.replace(url);
  window.setTimeout(() => {
    try {
      const path = window.location.pathname.replace(/\/$/, '') || '/';
      if (path === '/mobile' || path.endsWith('/index.html')) {
        window.location.assign(url);
      }
    } catch {
      /* ignore */
    }
  }, 150);
}

/** @param {string} message */
function showToast(message) {
  const toast = document.querySelector('.orby-mobile-gate-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => {
      toast.hidden = true;
    }, 220);
  }, 3200);
}

/** @param {File} file */
async function handleFile(file) {
  if (!(file instanceof File)) return;

  if (isOrbySceneFile(file)) {
    showToast('Orby scene files need desktop — use GLB or GLTF on your phone');
    return;
  }

  if (!isMobileModelFile(file)) {
    showToast('Mobile supports GLB / GLTF only');
    return;
  }

  const check = validateOrbyMobileModelFile(file);
  if (!check.ok) {
    showToast(check.message);
    return;
  }

  /** @type {Uint8Array} */
  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (err) {
    console.error('[Orby Mobile] Gate file read failed', err);
    showToast('Could not read file — try again');
    return;
  }

  const root = document.getElementById('orbyMobileGate');
  if (root) root.dataset.state = 'loading';

  try {
    await stageMobileModelHandoff(file, bytes);
    navigateToMobileApp();
  } catch (err) {
    console.error('[Orby Mobile] Gate handoff failed', err);
    clearMobileHandoffPending();
    if (root) root.dataset.state = 'ready';
    showToast(err instanceof Error ? err.message : 'Could not open Orby Mobile — try again');
  }
}

function bindScrollCue() {
  const cue = document.querySelector('.orby-mobile-gate__scroll-cue');
  const learn = document.querySelector('.orby-mobile-gate__learn');
  if (!cue || !learn) return;

  cue.addEventListener('click', () => {
    learn.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const fadeThreshold = 48;
  const update = () => {
    cue.classList.toggle('orby-mobile-gate__scroll-cue--faded', window.scrollY > fadeThreshold);
  };

  window.addEventListener('scroll', update, { passive: true });
  update();
}

function bindGate() {
  const root = document.getElementById('orbyMobileGate');
  const browseBtn = document.getElementById('orbyMobileGateBrowse');
  const fileInput = document.getElementById('orbyMobileGateFileInput');

  bindScrollCue();
  browseBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    // Keep the input value until bytes are read — iOS Files/iCloud invalidates File handles on clear.
    void handleFile(file).finally(() => {
      fileInput.value = '';
    });
  });

  if (root) root.dataset.state = 'ready';

  const handoffError = takeMobileHandoffErrorMessage();
  if (handoffError) showToast(handoffError);
}

bindGate();
