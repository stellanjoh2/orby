import './orbyStatsBeacon.js';
import { EventBus } from './EventBus.js';
import { StateStore } from './StateStore.js';
import { UIManager } from './UIManager.js';
import { SceneManager } from './SceneManager.js';
import { GamepadController } from './input/GamepadController.js';
import { TooltipController } from './ui/TooltipController.js';
import {
  ensureMobileLandingClass,
  isForcedMobileLandingDebug,
  isMobileDevice,
  isMobileLanding,
} from './orbyMobileLanding.js';

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

// Head boot (orbyMobileLandingBoot.js) applies html.mobile-landing before first paint.
if (ensureMobileLandingClass()) {
  if (isForcedMobileLandingDebug() && !isMobileDevice()) {
    console.info(
      '[Orby] Mobile landing UI forced for debugging. Remove ?orbyMobile=1, clear sessionStorage orby_mobile_landing, or unset __ORBY_DEBUG_MOBILE_LANDING__.',
    );
  }
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

/** Gamepad poll loop — deferred until first studio entrance (see UIManager.ensureStudioUiReady). */
let gamepad = null;
function ensureGamepad() {
  if (gamepad) return gamepad;
  gamepad = new GamepadController({
    cameraController: scene.cameraController,
    stateStore,
    eventBus,
    uiManager: ui,
    sceneManager: scene,
  });
  return gamepad;
}

ui.initShell();
// WebGL studio boots on first model load (see SceneManager.ensureStudioReady).

window.orby = { eventBus, stateStore, ui, scene, tooltips, ensureGamepad, get gamepad() { return gamepad; } };

/** Dev: ?exportOverlayDebug=1 — open PNG export overlay on the dropzone for layout QA */
try {
  const q = new URLSearchParams(window.location.search);
  if (q.get('exportOverlayDebug') === '1' && !isMobileLanding()) {
    requestAnimationFrame(async () => {
      await ui.ensureStudioUiReady();
      ui.toggleOfflineExportOverlayPreview?.();
    });
  }
} catch {
  /* URL blocked */
}

{
  const mobileLanding = isMobileLanding();
  const bootMarketing = () => {
    import('./marketing/orbyMarketingPage.js')
      .then((mod) =>
        mod.initOrbyMarketingPage(mobileLanding ? { lazy: false } : undefined),
      )
      .catch((err) => {
        console.warn('[Orby] Marketing page module failed to load', err);
      });
  };
  if (mobileLanding) {
    bootMarketing();
  } else {
    const scheduleMarketing =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback.bind(window)
        : (cb) => window.setTimeout(cb, 1600);
    scheduleMarketing(bootMarketing);
  }
}

