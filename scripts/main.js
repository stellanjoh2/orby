import { EventBus } from './EventBus.js';
import { StateStore } from './StateStore.js';
import { UIManager } from './UIManager.js';
import { SceneManager } from './SceneManager.js';
import { GamepadController } from './input/GamepadController.js';
import { TooltipController } from './ui/TooltipController.js';

// Detect mobile devices
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
}

/**
 * Debug the mobile splash on a desktop browser without emulating UA.
 * Options (any one):
 * - URL query: ?orbyMobile=1
 * - sessionStorage (Application tab → Session storage): key orby_mobile_landing = 1
 * - Console before reload: window.__ORBY_DEBUG_MOBILE_LANDING__ = true
 */
function isForcedMobileLandingDebug() {
  try {
    if (typeof window !== 'undefined' && window.__ORBY_DEBUG_MOBILE_LANDING__ === true) {
      return true;
    }
    const q = new URLSearchParams(window.location.search);
    if (q.get('orbyMobile') === '1') return true;
    if (q.has('mobileLanding')) return true;
    if (sessionStorage.getItem('orby_mobile_landing') === '1') return true;
  } catch {
    /* sessionStorage / URL blocked */
  }
  return false;
}

function shouldShowMobileLanding() {
  return isForcedMobileLandingDebug() || isMobileDevice();
}

/**
 * Safari has heavier repaint/compositing cost for large animated blur layers.
 * Detect Safari (desktop+iOS) but exclude Chromium/Gecko shells.
 */
function isSafariBrowser() {
  const ua = navigator.userAgent;
  const isWebKitSafari = /Safari/i.test(ua) && /Apple Computer/i.test(navigator.vendor || '');
  const excludedShells =
    /Chrome|CriOS|Chromium|Edg|EdgiOS|OPR|OPiOS|Firefox|FxiOS|SamsungBrowser/i.test(ua);
  return isWebKitSafari && !excludedShells;
}

/** Helps mobile browsers/iOS tint the toolbar and status chrome (--orby-black). */
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

// Show mobile warning if on mobile; CSS (html.mobile-landing) hides the rest of the UI
if (shouldShowMobileLanding()) {
  if (isForcedMobileLandingDebug() && !isMobileDevice()) {
    console.info(
      '[Orby] Mobile landing UI forced for debugging. Remove ?orbyMobile=1, clear sessionStorage orby_mobile_landing, or unset __ORBY_DEBUG_MOBILE_LANDING__.',
    );
  }
  document.documentElement.classList.add('mobile-landing');
  setMobileSplashChromeMetaTags();
}

if (isSafariBrowser()) {
  document.documentElement.classList.add('safari-browser');
}

/** Dev preview: ?uiCrop=1 — keep screenshot UI on the right (see html.orby-marketing-ui-crop). */
function syncMarketingUiCropPreview() {
  try {
    const q = new URLSearchParams(window.location.search);
    document.documentElement.classList.toggle(
      'orby-marketing-ui-crop',
      q.get('uiCrop') === '1' || q.get('uiCrop') === 'visible',
    );
  } catch {
    /* URL blocked */
  }
}
syncMarketingUiCropPreview();

void import('./marketing/marketingPerformanceTier.js')
  .then((mod) => mod.applyMarketingPerformanceClass())
  .catch(() => {});

const eventBus = new EventBus();
const stateStore = new StateStore();
const ui = new UIManager(eventBus, stateStore);
const tooltips = new TooltipController();
const scene = new SceneManager(eventBus, stateStore, ui);
const gamepad = new GamepadController({
  cameraController: scene.cameraController,
  stateStore,
  eventBus,
  uiManager: ui,
  sceneManager: scene,
});

ui.init();
// WebGL studio boots on first model load (see SceneManager.ensureStudioReady).

window.orby = { eventBus, stateStore, ui, scene, gamepad, tooltips };

if (!document.documentElement.classList.contains('mobile-landing')) {
  const scheduleMarketing =
    typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback.bind(window)
      : (cb) => window.setTimeout(cb, 1600);
  scheduleMarketing(() => {
    import('./marketing/orbyMarketingPage.js')
      .then((mod) => mod.initOrbyMarketingPage())
      .catch((err) => {
        console.warn('[Orby] Marketing page module failed to load', err);
      });
  });
}

