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
scene
  .init()
  .then(() => {
    // Font Awesome icons are loaded via CDN - no initialization needed
    // Icon sizes are controlled via CSS
    console.info('Orby ready');

    // Setup fullscreen toggle button
    const fullscreenButton = document.getElementById('fullscreenToggle');
    if (fullscreenButton) {
      const isFullscreen = () =>
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement;

      const requestFullscreen = (element) => {
        if (element.requestFullscreen) element.requestFullscreen();
        else if (element.webkitRequestFullscreen) element.webkitRequestFullscreen();
        else if (element.mozRequestFullScreen) element.mozRequestFullScreen();
        else if (element.msRequestFullscreen) element.msRequestFullscreen();
      };

      const exitFullscreen = () => {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
      };

      const updateFullscreenIcon = () => {
        const icon = fullscreenButton.querySelector('i');
        const active = !!isFullscreen();
        fullscreenButton.classList.toggle('is-active', active);
        if (icon) {
          icon.classList.toggle('fa-expand', !active);
          icon.classList.toggle('fa-compress', active);
        }
      };

      fullscreenButton.addEventListener('click', () => {
        if (!isFullscreen()) {
          // Request fullscreen on the whole document for true fullscreen
          requestFullscreen(document.documentElement);
        } else {
          exitFullscreen();
        }
      });

      document.addEventListener('fullscreenchange', updateFullscreenIcon);
      document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);
      document.addEventListener('mozfullscreenchange', updateFullscreenIcon);
      document.addEventListener('MSFullscreenChange', updateFullscreenIcon);
    }
  })
  .catch((error) => {
    console.error('Orby failed to initialize', error);
    ui.showToast('Scene init failed');
  });

window.orby = { eventBus, stateStore, ui, scene, gamepad, tooltips };

