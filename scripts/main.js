import { EventBus } from './EventBus.js';
import { StateStore } from './StateStore.js';
import { UIManager } from './UIManager.js';
import { SceneManager } from './SceneManager.js';
import { GamepadController } from './input/GamepadController.js';

// Detect mobile devices
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
}

// Show mobile warning if on mobile
if (isMobileDevice()) {
  const mobileWarning = document.getElementById('mobileWarning');
  if (mobileWarning) {
    mobileWarning.style.display = 'block';
  }
}

const eventBus = new EventBus();
const stateStore = new StateStore();
const ui = new UIManager(eventBus, stateStore);
const scene = new SceneManager(eventBus, stateStore, ui);
const gamepad = new GamepadController({
  cameraController: scene.cameraController,
  stateStore,
  eventBus,
  uiManager: ui,
  sceneManager: scene,
});

ui.init();
scene
  .init()
  .then(() => {
    // Font Awesome icons are loaded via CDN - no initialization needed
    // Icon sizes are controlled via CSS
    console.info('Orby ready');
  })
  .catch((error) => {
    console.error('Orby failed to initialize', error);
    ui.showToast('Scene init failed');
  });

window.orby = { eventBus, stateStore, ui, scene, gamepad };

