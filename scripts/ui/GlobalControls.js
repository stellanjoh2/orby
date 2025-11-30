/**
 * GlobalControls - Handles global UI interactions
 * Manages keyboard shortcuts, tabs, drag & drop, help overlay, and UI visibility
 */
import { gsap } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js';
import { HDRI_STRENGTH_UNIT } from '../config/hdri.js';
import { UIHelpers } from './UIHelpers.js';

export class GlobalControls {
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    this.helpers = new UIHelpers(eventBus, stateStore, uiManager);
  }

  bind() {
    this.bindResetAll();
    this.bindHelpOverlay();
    this.bindToggleUi();
    this.bindKeyboardShortcuts();
    this.bindTabs();
    this.bindDragAndDrop();
    this.bindHdriLightsRotation();
  }

  bindResetAll() {
    this.ui.dom.resetAll?.addEventListener('click', () => {
      const snapshot = this.stateStore.reset();
      this.ui.syncControls(snapshot);
      this.eventBus.emit('app:reset');
      this.helpers.showToast('All settings reset');
    });
  }

  bindHelpOverlay() {
    let hideHelp = null;
    const hasHelpOverlay = this.ui.dom.helpOverlay !== null && this.ui.dom.closeHelp !== null;
    
    if (this.ui.dom.helpButton) {
      if (hasHelpOverlay) {
        hideHelp = () => {
          this.ui.dom.helpOverlay.hidden = true;
        };
        this.ui.dom.helpButton.addEventListener('click', () => {
          this.ui.dom.helpOverlay.hidden = false;
          gsap.fromTo(
            this.ui.dom.helpOverlay.querySelector('.help-card'),
            { scale: 0.95, autoAlpha: 0 },
            { scale: 1, autoAlpha: 1, duration: 0.25, ease: 'power2.out' },
          );
        });
        this.ui.dom.closeHelp.addEventListener('click', hideHelp);
        this.ui.dom.helpOverlay.addEventListener('click', (event) => {
          if (event.target === this.ui.dom.helpOverlay) {
            hideHelp();
          }
        });
      } else {
        this.ui.dom.helpButton.addEventListener('click', () => {
          this.helpers.showToast('Quick tour coming soon');
        });
      }
    }
    
    return { hasHelpOverlay, hideHelp };
  }

  bindToggleUi() {
    this.ui.dom.toggleUi?.addEventListener('click', () => this.ui.toggleUi());
  }

  bindTabs() {
    this.ui.dom.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        if (target === this.ui.activeTab) return;
        this.ui.activeTab = target;
        this.ui.dom.tabs.forEach((button) => {
          const isActive = button.dataset.tab === target;
          button.classList.toggle('active', isActive);
          button.setAttribute('aria-selected', isActive);
        });
        this.ui.dom.panels.forEach((panel) => {
          const visible = panel.dataset.panel === target;
          panel.classList.toggle('visible', visible);
          if (visible) {
            gsap.fromTo(
              panel,
              { autoAlpha: 0 },
              { autoAlpha: 1, duration: 0.25, ease: 'power2.out' },
            );
          } else {
            gsap.set(panel, { clearProps: 'opacity' });
          }
        });
        document.querySelectorAll('.panel-header-title').forEach((header) => {
          header.classList.toggle('visible', header.dataset.header === target);
        });
      });
    });
  }

  bindDragAndDrop() {
    const emitFile = (file) => {
      if (!file) return;
      this.eventBus.emit('file:selected', file);
    };
    
    ['dragenter', 'dragover'].forEach((event) => {
      this.ui.dom.dropzone.addEventListener(event, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.ui.dom.dropzone.classList.add('drag-active');
      });
    });
    
    ['dragleave', 'dragend', 'drop'].forEach((event) => {
      this.ui.dom.dropzone.addEventListener(event, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.ui.dom.dropzone.classList.remove('drag-active');
      });
    });
    
    this.ui.dom.dropzone.addEventListener('drop', (event) => {
      this.handleDropEvent(event, emitFile);
    });
    
    this.ui.dom.browseButton.addEventListener('click', () => this.ui.dom.fileInput.click());
    
    this.ui.dom.fileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      emitFile(file);
      this.ui.dom.fileInput.value = '';
    });
    
    this.ui.buttons.loadMesh?.addEventListener('click', () => {
      this.ui.dom.fileInput.click();
    });

    window.addEventListener('drop', (event) => this.handleDropEvent(event, emitFile), { passive: false });
  }

  handleDropEvent(event, emitFile) {
    event.preventDefault();
    event.stopPropagation();

    const entries = this.extractEntries(event.dataTransfer);
    if (entries.length) {
      this.collectFilesFromEntries(entries).then((files) => {
        if (files.length === 1) {
          emitFile(files[0].file);
        } else if (files.length > 1) {
          this.eventBus.emit('file:bundle', files);
        }
      });
      return;
    }

    const fileList = event.dataTransfer?.files;
    if (fileList && fileList.length) {
      if (fileList.length === 1) {
        emitFile(fileList[0]);
      } else {
        const files = Array.from(fileList).map((file) => ({
          file,
          path: file.webkitRelativePath || file.name,
        }));
        this.eventBus.emit('file:bundle', files);
      }
    }
  }

  extractEntries(dataTransfer) {
    const items = dataTransfer?.items;
    if (!items) return [];
    const entries = [];
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
    return entries;
  }

  async collectFilesFromEntries(entries) {
    const files = [];
    const traverse = (entry, path = '') =>
      new Promise((resolve) => {
        if (entry.isFile) {
          entry.file((file) => {
            files.push({ file, path: `${path}${file.name}` });
            resolve();
          });
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          reader.readEntries(async (entriesList) => {
            for (const child of entriesList) {
              await traverse(child, `${path}${entry.name}/`);
            }
            resolve();
          });
        } else {
          resolve();
        }
      });
    for (const entry of entries) {
      await traverse(entry);
    }
    return files;
  }

  bindKeyboardShortcuts() {
    const { hasHelpOverlay, hideHelp } = this.bindHelpOverlay();
    const HDRI_PRESETS = ['noir-studio', 'luminous-sky', 'sunset-cove', 'steel-lab', 'cyberpunk'];

    // Handle arrow keys for range inputs at document level
    document.addEventListener('keydown', (event) => {
      const key = event.key;
      const code = event.code;
      const isLeft = key === 'ArrowLeft' || code === 'ArrowLeft';
      const isRight = key === 'ArrowRight' || code === 'ArrowRight';
      
      if (!isLeft && !isRight) return;
      
      const target = event.target;
      const activeElement = document.activeElement;
      const slider = (target && target.tagName === 'INPUT' && target.type === 'range') 
        ? target 
        : (activeElement && activeElement.tagName === 'INPUT' && activeElement.type === 'range')
          ? activeElement
          : null;
      
      if (slider) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        const currentValue = parseFloat(slider.value) || 0;
        const step = parseFloat(slider.step) || 0.01;
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        
        let newValue;
        if (isLeft) {
          newValue = Math.max(min, currentValue - step);
        } else {
          newValue = Math.min(max, currentValue + step);
        }
        
        if (Math.abs(newValue - currentValue) > 0.0001) {
          slider.value = String(newValue);
          const inputEvent = new Event('input', { bubbles: true, cancelable: true });
          slider.dispatchEvent(inputEvent);
          if (document.activeElement !== slider) {
            slider.focus();
          }
        }
        
        return false;
      }
    }, true);

    document.addEventListener('keydown', (event) => {
      const target = event.target;
      
      if (
        (target.tagName === 'INPUT' && target.type !== 'range') ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        if (event.key === 'Escape') {
          if (hasHelpOverlay && hideHelp && this.ui.dom.helpOverlay && !this.ui.dom.helpOverlay.hidden) {
            event.preventDefault();
            hideHelp();
          }
        }
        return;
      }

      const key = event.key.toLowerCase();
      const isShift = event.shiftKey;
      const isCtrl = event.ctrlKey || event.metaKey;

      // Essential shortcuts
      if (key === 'f') {
        event.preventDefault();
        this.eventBus.emit('camera:focus');
      }

      // W - Toggle Move widget
      if (key === 'w') {
        event.preventDefault();
        const currentMove = this.stateStore.getState().moveWidgetEnabled ?? false;
        const newMoveState = !currentMove;
        if (newMoveState) {
          this.stateStore.set('rotateWidgetEnabled', false);
          this.stateStore.set('scaleWidgetEnabled', false);
          this.eventBus.emit('mesh:rotate-widget-enabled', false);
          this.eventBus.emit('mesh:scale-widget-enabled', false);
        }
        this.stateStore.set('moveWidgetEnabled', newMoveState);
        this.eventBus.emit('mesh:move-widget-enabled', newMoveState);
      }

      // E - Toggle Rotate widget
      if (key === 'e') {
        event.preventDefault();
        const currentRotate = this.stateStore.getState().rotateWidgetEnabled ?? false;
        const newRotateState = !currentRotate;
        if (newRotateState) {
          this.stateStore.set('moveWidgetEnabled', false);
          this.stateStore.set('scaleWidgetEnabled', false);
          this.eventBus.emit('mesh:move-widget-enabled', false);
          this.eventBus.emit('mesh:scale-widget-enabled', false);
        }
        this.stateStore.set('rotateWidgetEnabled', newRotateState);
        this.eventBus.emit('mesh:rotate-widget-enabled', newRotateState);
      }

      // Q - Toggle Scale widget
      if (key === 'q' && !isCtrl && !isShift) {
        event.preventDefault();
        const currentScale = this.stateStore.getState().scaleWidgetEnabled ?? false;
        const newScaleState = !currentScale;
        if (newScaleState) {
          this.stateStore.set('moveWidgetEnabled', false);
          this.stateStore.set('rotateWidgetEnabled', false);
          this.eventBus.emit('mesh:move-widget-enabled', false);
          this.eventBus.emit('mesh:rotate-widget-enabled', false);
        }
        this.stateStore.set('scaleWidgetEnabled', newScaleState);
        this.eventBus.emit('mesh:scale-widget-enabled', newScaleState);
      }

      // Display modes: 1/2/3/4
      if (key === '1' || key === '2' || key === '3' || key === '4') {
        event.preventDefault();
        const modes = ['shaded', 'wireframe', 'clay', 'textures'];
        const modeIndex = parseInt(key) - 1;
        if (modes[modeIndex]) {
          this.stateStore.set('shading', modes[modeIndex]);
          this.eventBus.emit('mesh:shading', modes[modeIndex]);
          const radio = document.querySelector(`input[name="shading"][value="${modes[modeIndex]}"]`);
          if (radio) radio.checked = true;
        }
      }

      // Space - Play/Pause animation
      if (key === ' ') {
        event.preventDefault();
        if (this.ui.dom.playPause && !this.ui.dom.playPause.disabled) {
          this.eventBus.emit('animation:toggle');
        }
      }

      // Arrow keys - Scrub animation
      if (key === 'arrowleft') {
        event.preventDefault();
        if (this.ui.dom.animationScrub && !this.ui.dom.animationScrub.disabled) {
          const current = parseFloat(this.ui.dom.animationScrub.value) || 0;
          const step = 0.01;
          const newValue = Math.max(0, current - step);
          this.ui.dom.animationScrub.value = newValue;
          this.eventBus.emit('animation:scrub', newValue);
        }
      }

      if (key === 'arrowright') {
        event.preventDefault();
        if (this.ui.dom.animationScrub && !this.ui.dom.animationScrub.disabled) {
          const current = parseFloat(this.ui.dom.animationScrub.value) || 0;
          const step = 0.01;
          const newValue = Math.min(1, current + step);
          this.ui.dom.animationScrub.value = newValue;
          this.eventBus.emit('animation:scrub', newValue);
        }
      }

      // G - Toggle grid
      if (key === 'g') {
        event.preventDefault();
        const current = this.stateStore.getState().groundWire;
        this.stateStore.set('groundWire', !current);
        this.eventBus.emit('studio:ground-wire', !current);
        if (this.ui.inputs.groundWire) {
          this.ui.inputs.groundWire.checked = !current;
        }
      }

      // L - Toggle 3-point lighting
      if (key === 'l') {
        event.preventDefault();
        const current = this.stateStore.getState().lightsEnabled;
        this.stateStore.set('lightsEnabled', !current);
        this.eventBus.emit('lights:enabled', !current);
        if (this.ui.inputs.lightsEnabled) {
          this.ui.inputs.lightsEnabled.checked = !current;
        }
      }

      // H/V - Toggle UI visibility
      if (key === 'h' || key === 'v') {
        event.preventDefault();
        this.ui.toggleUi();
      }

      // Tab - Cycle through tabs
      if (key === 'tab' && !isCtrl) {
        event.preventDefault();
        const tabs = ['mesh', 'studio', 'render', 'info'];
        const currentIndex = tabs.indexOf(this.ui.activeTab);
        const nextIndex = isShift
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : (currentIndex + 1) % tabs.length;
        const nextTab = tabs[nextIndex];
        this.ui.activeTab = nextTab;
        const tabButton = document.querySelector(`[data-tab="${nextTab}"]`);
        if (tabButton) {
          tabButton.click();
        }
      }

      // Esc - Close modals/overlays
      if (key === 'escape') {
        if (hasHelpOverlay && hideHelp && this.ui.dom.helpOverlay && !this.ui.dom.helpOverlay.hidden) {
          event.preventDefault();
          hideHelp();
        }
      }

      // S - Reset scale to 1
      if (key === 's') {
        event.preventDefault();
        this.stateStore.set('scale', 1);
        this.eventBus.emit('mesh:scale', 1);
        if (this.ui.inputs.scale) {
          this.ui.inputs.scale.value = 1;
          this.helpers.updateValueLabel('scale', 1, 'multiplier');
        }
      }

      // Y - Reset position offsets
      if (key === 'y') {
        event.preventDefault();
        this.stateStore.set('xOffset', 0);
        this.stateStore.set('yOffset', 0);
        this.stateStore.set('zOffset', 0);
        this.eventBus.emit('mesh:xOffset', 0);
        this.eventBus.emit('mesh:yOffset', 0);
        this.eventBus.emit('mesh:zOffset', 0);
        if (this.ui.inputs.xOffset) {
          this.ui.inputs.xOffset.value = 0;
          this.helpers.updateValueLabel('xOffset', 0, 'distance');
        }
        if (this.ui.inputs.yOffset) {
          this.ui.inputs.yOffset.value = 0;
          this.helpers.updateValueLabel('yOffset', 0, 'distance');
        }
        if (this.ui.inputs.zOffset) {
          this.ui.inputs.zOffset.value = 0;
          this.helpers.updateValueLabel('zOffset', 0, 'distance');
        }
      }

      // 0 - Reset transform
      if (key === '0') {
        event.preventDefault();
        this.stateStore.set('scale', 1);
        this.stateStore.set('xOffset', 0);
        this.stateStore.set('yOffset', 0);
        this.stateStore.set('zOffset', 0);
        this.stateStore.set('rotationX', 0);
        this.stateStore.set('rotationY', 0);
        this.stateStore.set('rotationZ', 0);
        this.eventBus.emit('mesh:scale', 1);
        this.eventBus.emit('mesh:xOffset', 0);
        this.eventBus.emit('mesh:yOffset', 0);
        this.eventBus.emit('mesh:zOffset', 0);
        this.eventBus.emit('mesh:rotationX', 0);
        this.eventBus.emit('mesh:rotationY', 0);
        this.eventBus.emit('mesh:rotationZ', 0);
        if (this.ui.inputs.scale) {
          this.ui.inputs.scale.value = 1;
          this.helpers.updateValueLabel('scale', 1, 'multiplier');
        }
        if (this.ui.inputs.xOffset) {
          this.ui.inputs.xOffset.value = 0;
          this.helpers.updateValueLabel('xOffset', 0, 'distance');
        }
        if (this.ui.inputs.yOffset) {
          this.ui.inputs.yOffset.value = 0;
          this.helpers.updateValueLabel('yOffset', 0, 'distance');
        }
        if (this.ui.inputs.zOffset) {
          this.ui.inputs.zOffset.value = 0;
          this.helpers.updateValueLabel('zOffset', 0, 'distance');
        }
        if (this.ui.inputs.rotationX) {
          this.ui.inputs.rotationX.value = 0;
          this.helpers.updateValueLabel('rotationX', 0, 'angle');
        }
        if (this.ui.inputs.rotationY) {
          this.ui.inputs.rotationY.value = 0;
          this.helpers.updateValueLabel('rotationY', 0, 'angle');
        }
        if (this.ui.inputs.rotationZ) {
          this.ui.inputs.rotationZ.value = 0;
          this.helpers.updateValueLabel('rotationZ', 0, 'angle');
        }
      }

      // A - Toggle auto-rotate
      if (key === 'a') {
        event.preventDefault();
        const current = this.stateStore.getState().autoRotate;
        const speeds = [0, 0.2, 0.5, 1];
        const currentIndex = speeds.indexOf(current);
        const nextIndex = (currentIndex + 1) % speeds.length;
        const newSpeed = speeds[nextIndex];
        this.stateStore.set('autoRotate', newSpeed);
        this.eventBus.emit('mesh:auto-rotate', newSpeed);
        const radio = document.querySelector(`input[name="autorotate"][value="${newSpeed}"]`);
        if (radio) radio.checked = true;
      }

      // P - Toggle podium
      if (key === 'p') {
        event.preventDefault();
        const current = this.stateStore.getState().groundSolid;
        this.stateStore.set('groundSolid', !current);
        this.eventBus.emit('studio:ground-solid', !current);
        if (this.ui.inputs.groundSolid) {
          this.ui.inputs.groundSolid.checked = !current;
        }
      }

      // B - Toggle HDRI background
      if (key === 'b') {
        event.preventDefault();
        const current = this.stateStore.getState().hdriBackground;
        this.stateStore.set('hdriBackground', !current);
        this.eventBus.emit('studio:hdri-background', !current);
        if (this.ui.inputs.hdriBackground) {
          this.ui.inputs.hdriBackground.checked = !current;
        }
      }

      // X - Apply studio preset
      if (key === 'x') {
        event.preventDefault();
        this.applyStudioPresetX();
      }

      // [ / ] - Cycle through HDRI presets
      if (key === '[' || key === ']') {
        event.preventDefault();
        const state = this.stateStore.getState();
        const currentPreset = state.hdri || 'noir-studio';
        let currentIndex = HDRI_PRESETS.indexOf(currentPreset);
        if (currentIndex === -1) {
          currentIndex = 0;
        }
        const direction = key === '[' ? -1 : 1;
        const nextIndex = (currentIndex + direction + HDRI_PRESETS.length) % HDRI_PRESETS.length;
        const nextPreset = HDRI_PRESETS[nextIndex];
        this.stateStore.set('hdri', nextPreset);
        this.eventBus.emit('studio:hdri', nextPreset);
        this.ui.setHdriActive(nextPreset);
      }
    });
  }

  applyStudioPresetX() {
    this.stateStore.set('hdri', 'meadow');
    this.ui.setHdriActive('meadow');
    this.eventBus.emit('studio:hdri', 'meadow');
    this.stateStore.set('hdriBackground', true);
    this.eventBus.emit('studio:hdri-background', true);
    if (this.ui.inputs.hdriBackground) {
      this.ui.inputs.hdriBackground.checked = true;
    }
    this.stateStore.set('exposure', 2);
    this.eventBus.emit('scene:exposure', 2);
    if (this.ui.inputs.exposure) {
      this.ui.inputs.exposure.value = 2;
      this.helpers.updateValueLabel('exposure', 2, 'decimal');
    }
    const hdriSliderValue = 2.5;
    const hdriIntensity = hdriSliderValue * HDRI_STRENGTH_UNIT;
    this.stateStore.set('hdriStrength', hdriIntensity);
    this.eventBus.emit('studio:hdri-strength', hdriIntensity);
    if (this.ui.inputs.hdriStrength) {
      this.ui.inputs.hdriStrength.value = hdriSliderValue;
      this.helpers.updateValueLabel('hdriStrength', hdriSliderValue, 'decimal');
    }
    this.stateStore.set('lightsEnabled', false);
    this.eventBus.emit('lights:enabled', false);
    if (this.ui.inputs.lightsEnabled) {
      this.ui.inputs.lightsEnabled.checked = false;
    }
    this.stateStore.set('aberration.enabled', false);
    this.eventBus.emit('render:aberration', {
      enabled: false,
      offset: this.stateStore.getState().aberration.offset,
      strength: this.stateStore.getState().aberration.strength,
    });
    if (this.ui.inputs.toggleAberration) {
      this.ui.inputs.toggleAberration.checked = false;
    }
    this.stateStore.set('grain.enabled', false);
    this.eventBus.emit('render:grain', {
      enabled: false,
      intensity: this.stateStore.getState().grain.intensity,
      color: this.stateStore.getState().grain.color,
    });
    if (this.ui.inputs.toggleGrain) {
      this.ui.inputs.toggleGrain.checked = false;
    }
    this.stateStore.set('antiAliasing', 'fxaa');
    this.eventBus.emit('render:anti-aliasing', 'fxaa');
    if (this.ui.inputs.antiAliasing) {
      this.ui.inputs.antiAliasing.value = 'fxaa';
    }
  }

  bindHdriLightsRotation() {
    if (!this.ui.dom.canvas) return;

    let isRotating = false;
    let startX = 0;
    let startHdriRotation = 0;
    let startLightsRotation = 0;
    const rotationSensitivity = 0.5;

    const handleMouseDown = (event) => {
      if (event.altKey && event.button === 0) {
        event.preventDefault();
        isRotating = true;
        startX = event.clientX;
        startHdriRotation = this.stateStore.getState().hdriRotation ?? 0;
        startLightsRotation = this.stateStore.getState().lightsRotation ?? 0;
        this.ui.dom.canvas.style.cursor = 'grab';
        this.eventBus.emit('camera:lock-orbit');
      }
    };

    const handleMouseMove = (event) => {
      if (!isRotating) return;
      event.preventDefault();

      const deltaX = event.clientX - startX;
      const rotationDelta = deltaX * rotationSensitivity;

      let newHdriRotation = startHdriRotation + rotationDelta;
      let newLightsRotation = startLightsRotation + rotationDelta;

      newHdriRotation = ((newHdriRotation % 360) + 360) % 360;
      newLightsRotation = ((newLightsRotation % 360) + 360) % 360;

      this.stateStore.set('hdriRotation', newHdriRotation);
      this.stateStore.set('lightsRotation', newLightsRotation);
      this.eventBus.emit('studio:hdri-rotation', newHdriRotation);
      this.eventBus.emit('lights:rotate', newLightsRotation);

      if (this.ui.inputs.hdriRotation) {
        this.ui.inputs.hdriRotation.value = newHdriRotation;
        this.helpers.updateValueLabel('hdriRotation', newHdriRotation, 'angle');
      }
      if (this.ui.inputs.lightsRotation) {
        this.ui.inputs.lightsRotation.value = newLightsRotation;
        this.helpers.updateValueLabel('lightsRotation', newLightsRotation, 'angle');
      }
    };

    const handleMouseUp = (event) => {
      if (isRotating) {
        event.preventDefault();
        isRotating = false;
        this.ui.dom.canvas.style.cursor = '';
        this.eventBus.emit('camera:unlock-orbit');
      }
    };

    this.ui.dom.canvas.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    this.ui.dom.canvas.addEventListener('mouseleave', () => {
      if (isRotating) {
        isRotating = false;
        this.ui.dom.canvas.style.cursor = '';
        this.eventBus.emit('camera:unlock-orbit');
      }
    });
  }
}

