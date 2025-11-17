import { EventBus } from './EventBus.js';
import { StateStore } from './StateStore.js';
import { UIManager } from './UIManager.js';
import { SceneManager } from './SceneManager.js';

const eventBus = new EventBus();
const stateStore = new StateStore();
const ui = new UIManager(eventBus, stateStore);
const scene = new SceneManager(eventBus, stateStore, ui);

ui.init();
scene
  .init()
  .then(() => {
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    console.info('MeshGL ready');
  })
  .catch((error) => {
    console.error('MeshGL failed to initialize', error);
    ui.showToast('Scene init failed');
  });

window.meshgl = { eventBus, stateStore, ui, scene };

