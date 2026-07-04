import { bindInfoPanelNavLinks, initInfoPanelNavGuard, initInfoSections } from './infoSections.js';

/** Fetched HTML fragment — see partials/info-panel-prose.html */
const PROSE_URL = './partials/info-panel-prose.html';

/** @type {Promise<boolean> | null} */
let loadPromise = null;

/**
 * Inject Information tab prose (shortcuts, FAQ, etc.) on first need.
 * Bug report, UI sounds, logotype, and version footer stay in index.html.
 * @returns {Promise<boolean>}
 */
export function ensureInfoPanelProseLoaded() {
  const mount = document.getElementById('infoPanelProseMount');
  const panel = mount?.closest('.panel[data-panel="info"]');
  if (!panel) return Promise.resolve(false);
  bindInfoPanelNavLinks(panel);
  initInfoPanelNavGuard();
  if (panel.dataset.infoProseLoaded === '1') return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = fetch(PROSE_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then((html) => {
      if (!mount.isConnected) return true;
      const template = document.createElement('template');
      template.innerHTML = html;
      mount.replaceWith(template.content);
      panel.dataset.infoProseLoaded = '1';
      initInfoSections();
      return true;
    })
    .catch((err) => {
      console.warn('[Orby] Failed to load info panel prose', err);
      mount?.removeAttribute('aria-busy');
      loadPromise = null;
      return false;
    });

  return loadPromise;
}
