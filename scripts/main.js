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
import { ensureShelfPanelsStitched } from './stitchIndexHtmlClient.js';
import { UndoStateController } from './state/UndoStateController.js';
import { showOrbyBootError } from './orbyBootError.js';
import { ORBY_DEV_BUILD } from './orbyDevBuild.js';
import { isTabletDevice } from './orbyMobileLanding.js';
import { blockTabletStudioAccess } from './orbyTabletGate.js';
import { isSafariBrowser, isSupportedOrbyBrowser } from './browserDetection.js';

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
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('browse') === '1') {
      q.delete('browse');
      const next = q.toString();
      const url = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash}`;
      window.history.replaceState(null, '', url);
      requestAnimationFrame(() => {
        document.getElementById('browseButton')?.click();
      });
    }
  } catch {
    /* URL blocked */
  }
}

// Idempotent; head boot scripts run before styles.css.
if (isSafariBrowser()) {
  document.documentElement.classList.add('safari-browser');
}

if (
  (typeof window !== 'undefined' && window.__ORBY_UNSUPPORTED_BROWSER__ === true) ||
  !isSupportedOrbyBrowser()
) {
  window.__ORBY_UNSUPPORTED_BROWSER__ = true;
  document.documentElement.classList.add('orby-unsupported-browser');
}

/** Dev preview: ?uiCrop=1 — keep screenshot UI on the right (see html.orby-marketing-ui-crop). */
function syncMarketingUiCropPreview() {
  if (!ORBY_DEV_BUILD) return;
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

async function boot() {
  try {
    await ensureShelfPanelsStitched();
  } catch (err) {
    console.error('[Orby] Shelf panel stitch failed', err);
    showOrbyBootError({
      title: 'Studio could not load',
      message:
        'Orby could not load the shelf panels needed for the studio. Try refreshing the page. ' +
        'If you are running locally, use npm run dev or the built site from npm run build.',
      detail: err?.message,
    });
    throw err;
  }

  const eventBus = new EventBus();
  const stateStore = new StateStore();
  const ui = new UIManager(eventBus, stateStore);
  ui.initShell();

  if (isTabletDevice()) {
    document.documentElement.classList.add('orby-tablet-blocked');
    blockTabletStudioAccess();
  }

  const tooltips = new TooltipController();
  const scene = new SceneManager(eventBus, stateStore, ui);
  scene.setTooltipController(tooltips);

  const undoState = new UndoStateController(eventBus, stateStore, {
    showToast: (message, duration, options) => ui.showToast(message, duration, options),
    syncControls: (state) => ui.syncControls(state),
    restoreFontExtrudeSettings: (fontExtrude) =>
      ui.fontExtrudeUI?.restoreFromSettings?.(fontExtrude),
  });
  undoState.bind();

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

  // WebGL studio boots on first model load (see SceneManager.ensureStudioReady).

  window.orby = {
    eventBus,
    stateStore,
    ui,
    scene,
    tooltips,
    undoState,
    undo: () => undoState.undo(),
    ensureGamepad,
    get gamepad() {
      return gamepad;
    },
  };

  if (ORBY_DEV_BUILD && !isMobileLanding()) {
    window.orby.dev = {};

    void import('./dev/DevToolsModal.js')
      .then(({ DevToolsModal, wireDevBakeButton }) => {
        const devToolsModal = new DevToolsModal(ui);
        devToolsModal.mount();
        window.orby.dev.toolsModal = devToolsModal;

        const wireBakeButtons = () => {
          wireDevBakeButton(
            document.getElementById('creativeLookBakeThumbsBtn'),
            window.orby.dev.bakeCreativeLookThumbnails,
            () => ({}),
            ui,
          );
          wireDevBakeButton(
            document.getElementById('creativeLookBakeCurrentThumbBtn'),
            window.orby.dev.bakeCreativeLookThumbnails,
            () => {
              const preset = window.orby?.stateStore?.getState?.()?.creativeLook?.preset;
              if (!preset) {
                throw new Error('No Shader Lab preset selected — pick a look first.');
              }
              return { presets: [preset] };
            },
            ui,
          );
          wireDevBakeButton(
            document.getElementById('lookFilterBakeThumbsBtn'),
            window.orby.dev.bakeLookFilterThumbnails,
            () => ({}),
            ui,
          );
          wireDevBakeButton(
            document.getElementById('lookFilterBakeCurrentThumbBtn'),
            window.orby.dev.bakeLookFilterThumbnails,
            () => {
              const preset = window.orby?.stateStore?.getState?.()?.lookFilterPreset;
              if (!preset || preset === 'custom') {
                throw new Error('No Look Filter preset selected — pick None, Studio, Noir, etc.');
              }
              return { presets: [preset] };
            },
            ui,
          );
        };

        return Promise.all([
          import('./dev/bakeCreativeLookThumbnails.js'),
          import('./dev/bakeLookFilterThumbnails.js'),
          import('./dev/exportDimensionSpotChecks.js'),
        ]).then(([creativeLookMod, lookFilterMod, spotChecksMod]) => {
          window.orby.dev.bakeCreativeLookThumbnails = creativeLookMod.bakeCreativeLookThumbnails;
          window.orby.dev.bakeLookFilterThumbnails = lookFilterMod.bakeLookFilterThumbnails;
          window.orby.dev.runExportDimensionSpotChecks = (opts) =>
            spotChecksMod.runExportDimensionSpotChecks(scene, opts);
          window.orby.dev.logCaptureSizeMatrix = () => spotChecksMod.logCaptureSizeMatrix(scene);
          wireBakeButtons();
        });
      })
      .catch((err) => {
        console.warn('[Orby dev] Dev tools modal failed to load', err);
      });
  }

  /** Dev: ?exportOverlayDebug=1 — open PNG export overlay on the dropzone for layout QA */
  try {
    const q = new URLSearchParams(window.location.search);
    if (ORBY_DEV_BUILD && q.get('exportOverlayDebug') === '1' && !isMobileLanding()) {
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
}

if (typeof window !== 'undefined' && window.__ORBY_UNSUPPORTED_BROWSER__ === true) {
  // Unsupported browser gate — orbyUnsupportedBrowserBoot.js mounts the dialog.
} else {
  boot().catch((err) => {
    console.error('[Orby] Boot failed', err);
    showOrbyBootError({
      title: 'Orby could not start',
      message:
        'Orby failed to start. Try refreshing the page. If this keeps happening, try another browser or check your connection.',
      detail: err?.message,
    });
  });
}

