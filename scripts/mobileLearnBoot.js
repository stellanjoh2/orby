/**
 * Orby Mobile learn — marketing-only boot (no Three.js / studio shell).
 * Served from /mobile/learn/ via apps/mobile/learn/index.html.
 */
import './orbyStatsBeacon.js';
import { ensureMobileLandingClass } from './orbyMobileLanding.js';

function setMobileSplashChromeMetaTags() {
  const ensureContentMeta = (name, content) => {
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };
  ensureContentMeta('theme-color', '#080808');
  ensureContentMeta('apple-mobile-web-app-status-bar-style', 'black');
}

if (ensureMobileLandingClass()) {
  setMobileSplashChromeMetaTags();
}

void import('./marketing/marketingPerformanceTier.js')
  .then((mod) => mod.applyMarketingPerformanceClass())
  .catch(() => {});

void import('./marketing/orbyMarketingPage.js')
  .then((mod) => mod.initOrbyMarketingPage({ lazy: false }))
  .catch((err) => {
    console.warn('[Orby] Mobile learn marketing failed to load', err);
  });
