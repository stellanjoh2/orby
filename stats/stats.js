/**
 * Orby — public statistics page (anonymous aggregate counters).
 */

import { gsap, prefersReducedMotion } from '../scripts/marketing/marketingMotion.js';

const COUNT_UP_DURATION_S = 2;

const apiMeta = document.querySelector('meta[name="orby-stats-api"]');
const apiUrl = apiMeta?.getAttribute('content')?.trim() || '';

const pageEl = document.getElementById('statsPageViews');
const assetEl = document.getElementById('statsAssetsLoaded');
const metaEl = document.getElementById('statsMeta');
const formatsListEl = document.getElementById('statsFormatsList');

const PLACEHOLDER_TOP_FORMATS = ['glb', 'gltf', 'obj', 'fbx', 'svg'].map((format) => ({
  format,
  count: 0,
}));

const FORMAT_LABELS = {
  glb: 'GLB',
  gltf: 'glTF',
  obj: 'OBJ',
  fbx: 'FBX',
  stl: 'STL',
  usd: 'USD',
  usdz: 'USDZ',
  svg: 'SVG',
  orby: 'ORBY',
  other: 'Other',
};

function formatCount(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
  return new Intl.NumberFormat('en-US').format(value);
}

function parseCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function animateCount(el, endValue, { delay = 0 } = {}) {
  if (!el) return;
  const target = parseCount(endValue);
  if (prefersReducedMotion() || target === 0) {
    el.textContent = formatCount(target);
    return;
  }

  const counter = { value: 0 };
  gsap.to(counter, {
    value: target,
    duration: COUNT_UP_DURATION_S,
    delay,
    ease: 'power2.out',
    snap: { value: 1 },
    onUpdate: () => {
      el.textContent = formatCount(Math.round(counter.value));
    },
  });
}

function formatLabel(format) {
  return FORMAT_LABELS[format] ?? String(format || '').toUpperCase();
}

function renderTopFormats(rows, { animate = false } = {}) {
  if (!formatsListEl) return;
  formatsListEl.replaceChildren();

  rows.forEach((row, index) => {
    const item = document.createElement('li');
    item.className = 'legal-stats__formats-item';

    const rank = document.createElement('span');
    rank.className = 'legal-stats__formats-rank';
    rank.textContent = String(index + 1);

    const name = document.createElement('span');
    name.className = 'legal-stats__formats-name';
    name.textContent = formatLabel(row.format);

    const count = document.createElement('span');
    count.className = 'legal-stats__formats-count';
    if (animate) {
      animateCount(count, row.count, { delay: index * 0.08 });
    } else {
      count.textContent = formatCount(row.count);
    }

    item.append(rank, name, count);
    formatsListEl.append(item);
  });
}

function setPlaceholderCounts() {
  if (pageEl) pageEl.textContent = '0';
  if (assetEl) assetEl.textContent = '0';
  renderTopFormats(PLACEHOLDER_TOP_FORMATS);
}

async function loadStats() {
  if (!apiUrl) {
    setPlaceholderCounts();
    if (metaEl) metaEl.textContent = 'Counts unavailable in this environment';
    return;
  }

  try {
    const res = await fetch(apiUrl, { method: 'GET', mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.configured) {
      setPlaceholderCounts();
      if (metaEl) metaEl.textContent = 'Counts unavailable in this environment';
      return;
    }
    animateCount(pageEl, data.pageViews);
    animateCount(assetEl, data.assetsLoaded, { delay: 0.08 });
    const topFormats =
      Array.isArray(data.topFormats) && data.topFormats.length > 0
        ? data.topFormats.slice(0, 5)
        : PLACEHOLDER_TOP_FORMATS;
    renderTopFormats(topFormats, { animate: true });
    if (metaEl) metaEl.textContent = 'All time · Counts update as people use Orby';
  } catch {
    setPlaceholderCounts();
    if (metaEl) metaEl.textContent = 'Could not load counts right now';
  }
}

loadStats();
