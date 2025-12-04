# Refactoring Plan: UIManager.js & SceneManager.js

## Overview
- **UIManager.js**: 3500+ lines → Split into 6-7 focused modules
- **SceneManager.js**: 1700+ lines → Split into 3-4 focused modules

## Strategy
1. **Feature-based splitting** - Group related functionality together
2. **Maintain existing architecture** - Keep EventBus/StateStore pattern
3. **Composition over inheritance** - UIManager/SceneManager compose smaller modules
4. **Backward compatibility** - Public API remains the same

---

## UIManager.js Refactoring

### Current Structure
- DOM caching (`cacheDom()`)
- Event binding (bindMeshControls, bindStudioControls, bindRenderControls, etc.)
- State syncing (syncMeshControls, syncStudioControls, syncRenderControls)
- UI updates (updateValueLabel, updateTitle, etc.)
- Keyboard shortcuts
- Animation controls
- Reset handlers
- Helper methods

### Proposed Structure

```
scripts/
  ui/
    UIManager.js (core - ~400 lines)
      - Constructor, init, cacheDom
      - Main coordination
      - Public API methods
    
    MeshControls.js (~600 lines)
      - bindMeshControls()
      - syncMeshControls()
      - All mesh/object-related UI logic
    
    StudioControls.js (~700 lines)
      - bindStudioControls()
      - syncStudioControls()
      - HDRI, lights, ground, lens flare controls
    
    RenderControls.js (~800 lines)
      - bindRenderControls()
      - syncRenderControls()
      - Post-processing, camera, export controls
    
    GlobalControls.js (~400 lines)
      - bindGlobalControls()
      - bindKeyboardShortcuts()
      - bindTabs()
      - bindDragAndDrop()
      - Global UI interactions
    
    AnimationControls.js (~200 lines)
      - bindAnimationControls()
      - setAnimationClips()
      - setAnimationPlaying()
      - updateAnimationTime()
    
    ResetControls.js (~300 lines)
      - bindLocalResetButtons()
      - bindCopyButtons()
      - Reset logic for all sections
    
    UIHelpers.js (~400 lines)
      - updateValueLabel()
      - updateSliderFill()
      - setControlDisabled()
      - bindColorInput()
      - applySnapToCenter()
      - enableSliderKeyboardStepping()
      - setBlockMuted()
      - showToast()
      - Utility methods
```

### Implementation Pattern

Each module will:
1. Accept `eventBus`, `stateStore`, and `uiManager` (for accessing DOM/inputs)
2. Export a class with `bind()` and `sync()` methods
3. UIManager instantiates and coordinates them

Example:
```javascript
// ui/MeshControls.js
export class MeshControls {
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
  }
  
  bind() {
    // All bindMeshControls() logic here
  }
  
  sync(state) {
    // All syncMeshControls() logic here
  }
}

// UIManager.js
import { MeshControls } from './ui/MeshControls.js';
// ...
this.meshControls = new MeshControls(this.eventBus, this.stateStore, this);
this.meshControls.bind();
```

---

## SceneManager.js Refactoring

### Current Structure
- Scene/renderer/camera setup
- Model loading
- Transform controls (move/rotate/scale widgets)
- Material management
- Event registration (huge `registerEvents()` method)
- Various setter methods

### Proposed Structure

```
scripts/
  scene/
    SceneManager.js (core - ~500 lines)
      - Constructor, initialization
      - Render loop (animate())
      - Main coordination
      - Public API
    
    EventManager.js (~600 lines)
      - registerEvents()
      - All eventBus.on() listeners
      - Event delegation to appropriate controllers
    
    TransformManager.js (~300 lines)
      - TransformControls setup
      - setScale(), setXOffset(), setYOffset(), setZOffset()
      - setRotationX/Y/Z()
      - _syncTransformFromGizmo()
      - Widget visibility management
    
    ModelManager.js (~400 lines)
      - setModel()
      - clearModel()
      - Model loading coordination
      - Stats updates
```

### Implementation Pattern

```javascript
// scene/EventManager.js
export class EventManager {
  constructor(sceneManager) {
    this.scene = sceneManager;
  }
  
  register() {
    // All eventBus.on() calls here
    // Delegate to scene.sceneManager methods
  }
}

// SceneManager.js
import { EventManager } from './scene/EventManager.js';
// ...
this.eventManager = new EventManager(this);
this.eventManager.register();
```

---

## Migration Strategy

### Phase 1: Extract Helpers (Low Risk)
1. Create `ui/UIHelpers.js` - Extract utility methods
2. Test - Ensure no functionality breaks

### Phase 2: Extract Controls (Medium Risk)
1. Create `ui/MeshControls.js` - Extract mesh controls
2. Update UIManager to use it
3. Test thoroughly
4. Repeat for StudioControls, RenderControls, etc.

### Phase 3: Extract Scene Modules (Medium Risk)
1. Create `scene/EventManager.js` - Extract all event listeners
2. Create `scene/TransformManager.js` - Extract transform logic
3. Create `scene/ModelManager.js` - Extract model loading
4. Update SceneManager to use them
5. Test thoroughly

### Phase 4: Cleanup
1. Remove unused code
2. Update imports
3. Verify all functionality works

---

## Benefits

1. **Maintainability**: Each file has a single, clear responsibility
2. **Testability**: Smaller modules are easier to test
3. **Readability**: Developers can find code faster
4. **Scalability**: Easy to add new features without bloating core files
5. **Collaboration**: Multiple developers can work on different modules

---

## File Size Targets

- **UIManager.js**: ~400 lines (down from 3500+)
- **SceneManager.js**: ~500 lines (down from 1700+)
- **Individual modules**: 200-800 lines each
- **Total lines**: Similar, but better organized

---

## Notes

- Keep all public APIs the same - no breaking changes
- Use composition pattern - modules are instantiated, not extended
- Maintain EventBus/StateStore architecture
- All modules receive necessary dependencies via constructor

