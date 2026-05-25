/**
 * Fire-and-forget anonymous stats beacons. No cookies, no identifiers, no file data.
 * API URL from <meta name="orby-stats-api" content="…"> (injected at build for production).
 */

const ALLOWED_ASSET_FORMATS = new Set([
  'glb',
  'gltf',
  'obj',
  'fbx',
  'stl',
  'usd',
  'usdz',
  'svg',
  'orby',
]);

function statsApiUrl() {
  const meta = document.querySelector('meta[name="orby-stats-api"]');
  const url = meta?.getAttribute('content')?.trim();
  return url || '';
}

/**
 * @param {File | null | undefined} file
 * @returns {string | null}
 */
export function normalizeAssetFormat(file) {
  if (!file?.name || typeof file.name !== 'string') return null;
  const parts = file.name.trim().toLowerCase().split('.');
  if (parts.length < 2) return 'other';
  const ext = parts.pop();
  if (!ext) return 'other';
  return ALLOWED_ASSET_FORMATS.has(ext) ? ext : 'other';
}

/**
 * @param {'page_view' | 'asset_loaded'} event
 * @param {Record<string, string>} [extra]
 */
function postEvent(event, extra = {}) {
  const api = statsApiUrl();
  if (!api) return;

  const payload = JSON.stringify({ event, ...extra });

  fetch(api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
    mode: 'cors',
  }).catch(() => {});
}

/** @param {'page_view' | 'asset_loaded'} event */
export function recordStatsEvent(event) {
  postEvent(event);
}

export function recordPageView() {
  recordStatsEvent('page_view');
}

/** @param {File | null | undefined} [file] */
export function recordAssetLoaded(file) {
  const format = normalizeAssetFormat(file);
  postEvent('asset_loaded', format ? { format } : {});
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => recordPageView(), { once: true });
  } else {
    recordPageView();
  }
}
