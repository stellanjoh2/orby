import { isOrbySceneFile } from '../../../scripts/import/dispatchImportFile.js';
import {
  stageMobileModelHandoff,
  clearMobileHandoffPending,
} from '../../../scripts/orbyMobileHandoff.js';
import { orbyMobileAppUrl, orbyMobileLearnUrl } from '../../../scripts/orbyMobileAppRoute.js';

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

  const root = document.getElementById('orbyMobileGate');
  if (root) root.dataset.state = 'loading';

  try {
    await stageMobileModelHandoff(file);
    navigateToMobileApp();
  } catch (err) {
    console.error('[Orby Mobile] Gate handoff failed', err);
    clearMobileHandoffPending();
    if (root) root.dataset.state = 'ready';
    showToast('Could not open Orby Mobile — try again');
  }
}

function bindLearnLink() {
  const learnLink = document.getElementById('orbyMobileGateLearnLink');
  if (!learnLink) return;

  learnLink.addEventListener('click', (event) => {
    event.preventDefault();
    window.location.assign(`${orbyMobileLearnUrl()}/`);
  });
}

function bindGate() {
  const root = document.getElementById('orbyMobileGate');
  const browseBtn = document.getElementById('orbyMobileGateBrowse');
  const fileInput = document.getElementById('orbyMobileGateFileInput');
  const dropzone = root?.querySelector('.orby-mobile-gate__dropzone');

  bindLearnLink();
  browseBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void handleFile(file);
  });

  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('is-dragover');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) void handleFile(file);
    });
  }

  if (root) root.dataset.state = 'ready';
}

bindGate();
