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

/** Helps mobile browsers/iOS tint the toolbar and status chrome true black (#000). */
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
  ensureContentMeta('theme-color', '#000000');
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
scene.init().catch((error) => {
  console.error('Orby failed to initialize', error);
  ui.showToast('Scene init failed');
});

window.orby = { eventBus, stateStore, ui, scene, gamepad, tooltips };

