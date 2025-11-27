import { EventBus } from './EventBus.js';
import { StateStore } from './StateStore.js';
import { UIManager } from './UIManager.js';
import { SceneManager } from './SceneManager.js';
import { GamepadController } from './input/GamepadController.js';

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
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
      
      // Force icon sizes after Lucide creates them
      const resizeIcons = () => {
        // Tab icons - 20px
        document.querySelectorAll('.tab i[data-lucide] svg').forEach((svg) => {
          svg.setAttribute('width', '20');
          svg.setAttribute('height', '20');
          svg.style.width = '20px';
          svg.style.height = '20px';
        });
        
        // Accent action button icons - 14px
        document.querySelectorAll('.accent-action-btn i[data-lucide] svg').forEach((svg) => {
          svg.setAttribute('width', '14');
          svg.setAttribute('height', '14');
          svg.style.width = '14px';
          svg.style.height = '14px';
        });
      };
      
      // Resize immediately and after a short delay
      resizeIcons();
      setTimeout(resizeIcons, 100);
      
      // Watch for dynamically added icons
      const shelf = document.getElementById('shelf');
      if (shelf) {
        const observer = new MutationObserver(() => {
          resizeIcons();
        });
        observer.observe(shelf, { childList: true, subtree: true });
      }
    }
    console.info('Orby ready');
  })
  .catch((error) => {
    console.error('Orby failed to initialize', error);
    ui.showToast('Scene init failed');
  });

window.orby = { eventBus, stateStore, ui, scene, gamepad };

