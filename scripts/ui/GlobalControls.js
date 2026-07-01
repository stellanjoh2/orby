/**
 * GlobalControls - Handles global UI interactions
 * Manages keyboard shortcuts, tabs, drag & drop, help overlay, and UI visibility
 */
import { gsap } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js';
import { HDRI_CUSTOM_ID, HDRI_PRESET_ORDER, HDRI_STRENGTH_UNIT } from '../config/hdri.js';
import { revealShelfPanelHeadline } from './panelHeadlineReveal.js';
import { applyWireframeOnlyVisibleOnEnter } from './wireframeEnterDefaults.js';
import { ensureInfoPanelProseLoaded } from './loadInfoPanelProse.js';

export class GlobalControls {
  constructor(eventBus, stateStore, uiManager, helpers) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    this.helpers = helpers;
  }

  bind() {
    this.bindResetAll();
    this.bindHelpOverlay();
    this.bindToggleUi();
    this.bindKeyboardShortcuts();
    this.bindTabs();
    this.bindSegmentedSelectSounds();
    this.bindExportOptionSelectSounds();
    this.bindEffectToggleSounds();
  }

  bindResetAll() {
    this.ui.dom.resetAll?.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      const snapshot = this.stateStore.reset();
      this.ui.syncControls(snapshot);
      this.eventBus.emit('app:reset');
      this.helpers.showToast('All settings reset', 3200, { notification: false });
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
        this.helpers.flushRangeSliderInteractionState?.();
        const previousTab = this.ui.activeTab;
        if (previousTab === 'export' && target !== 'export') {
          const keepPausedPreview =
            window.orby?.scene?.exportMovementPreview?.isActive?.()
            && this.ui.exportPreviewControls?.isExportPreviewPaused?.();
          if (!keepPausedPreview) {
            this.eventBus.emit('export:movement-preview-stop');
          }
        }
        this.ui.uiSounds?.playSelect();
        this.ui.activeTab = target;
        if (target === 'info') {
          void ensureInfoPanelProseLoaded();
        }
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
        this.ui.syncExportVideoPreviewDock?.();
        this.ui.syncExportPreviewBanner?.();
        revealShelfPanelHeadline(
          document.querySelector(`.panel-header-title[data-header="${target}"]`),
        );
        if (target === 'studio') {
          requestAnimationFrame(() => {
            this.ui.backgroundGradientControls?.refreshPreview?.();
          });
        }
      });
    });
  }

  /** Segmented controls (e.g. Turntable, Auto Orbit, Handheld) — randomized tap sounds. */
  bindSegmentedSelectSounds() {
    const shelf = this.ui.dom.shelf;
    if (!shelf) return;
    shelf.querySelectorAll('.segmented input[type="radio"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        this.ui.uiSounds?.playSelect();
      });
    });
  }

  /**
   * Export panel mutually-exclusive buttons (`.export-option-btn`) — same randomized taps as tabs.
   * Capture phase runs before MeshControls toggles `active`, so we only fire when switching option.
   */
  bindExportOptionSelectSounds() {
    const shelf = this.ui.dom.shelf;
    if (!shelf) return;
    shelf.addEventListener(
      'click',
      (e) => {
        const btn = e.target instanceof Element ? e.target.closest('.export-option-btn') : null;
        if (!btn || !shelf.contains(btn)) return;
        if (btn.disabled || btn.classList.contains('is-disabled')) return;
        if (btn.classList.contains('active')) return;
        this.ui.uiSounds?.playSelect();
      },
      true,
    );
  }

  /**
   * `.effect-toggle` checkboxes (lights on/off, HDRI toggle, FX toggles, …) — SND toggle on/off.
   * Skips podium / glass (shelf up/down sounds) and the “UI sounds” preference itself.
   */
  bindEffectToggleSounds() {
    const shelf = this.ui.dom.shelf;
    if (!shelf) return;
    const skipIds = new Set([
      'groundSolid',
      'baseGlassSurface',
      'uiSoundsEnabled',
      'backdropEnabled',
    ]);
    shelf.addEventListener('change', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.type !== 'checkbox') return;
      if (!t.closest('.effect-toggle') || !shelf.contains(t)) return;
      if (skipIds.has(t.id)) return;
      this.ui.uiSounds?.playEffectToggle(t.checked);
    });
  }

  bindKeyboardShortcuts() {
    const { hasHelpOverlay, hideHelp } = this.bindHelpOverlay();

    // Handle arrow keys for range inputs at document level (includes ↑/↓ for granular tweaks)
    document.addEventListener('keydown', (event) => {
      const key = event.key;
      const code = event.code;
      // Include numpad codes: Num Lock on/off still uses Numpad4 etc.; key may be "4" or "ArrowLeft".
      const isDecrease =
        key === 'ArrowLeft'
        || code === 'ArrowLeft'
        || key === 'ArrowDown'
        || code === 'ArrowDown'
        || code === 'Numpad4'
        || code === 'Numpad2';
      const isIncrease =
        key === 'ArrowRight'
        || code === 'ArrowRight'
        || key === 'ArrowUp'
        || code === 'ArrowUp'
        || code === 'Numpad6'
        || code === 'Numpad8';

      if (!isDecrease && !isIncrease) return;
      
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
        // Normal arrows: one increment per the slider’s configured step (e.g. ±1, ±0.01).
        // Shift+arrows: same logic but step ×10 for faster coarse adjustments.
        const baseStep = parseFloat(slider.step) || 0.01;
        const step = event.shiftKey ? baseStep * 10 : baseStep;
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        
        let newValue;
        if (isDecrease) {
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
          if (window.orby?.scene?.exportMovementPreview?.isActive?.()) {
            event.preventDefault();
            this.eventBus.emit('export:movement-preview-stop', { silent: false });
            return;
          }
          if (this.ui.bugReport?.isOpen?.()) {
            event.preventDefault();
            this.ui.bugReport.close();
            return;
          }
          if (hasHelpOverlay && hideHelp && this.ui.dom.helpOverlay && !this.ui.dom.helpOverlay.hidden) {
            event.preventDefault();
            hideHelp();
          }
        }
        return;
      }

      // Range sliders are adjusted by the capture listener above. This bubble listener used to run
      // afterward anyway (stopImmediatePropagation does not skip other phases) and ArrowLeft/Right
      // were treated as animation scrub + preventDefault — blocking normal arrow stepping.
      if (target.tagName === 'INPUT' && target.type === 'range') {
        if (event.key === 'Escape') {
          if (window.orby?.scene?.exportMovementPreview?.isActive?.()) {
            event.preventDefault();
            this.eventBus.emit('export:movement-preview-stop', { silent: false });
            return;
          }
          if (this.ui.bugReport?.isOpen?.()) {
            event.preventDefault();
            this.ui.bugReport.close();
            return;
          }
          if (hasHelpOverlay && hideHelp && this.ui.dom.helpOverlay && !this.ui.dom.helpOverlay.hidden) {
            event.preventDefault();
            hideHelp();
          }
        }
        return;
      }

      if (event.key === 'Escape' && window.orby?.scene?.exportMovementPreview?.isActive?.()) {
        event.preventDefault();
        this.eventBus.emit('export:movement-preview-stop', { silent: false });
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

      // Transform tools: W translate, E rotate, R scale (Blender-style), Q select / exit tool
      if (key === 'w') {
        event.preventDefault();
        this.stateStore.set('rotateWidgetEnabled', false);
        this.stateStore.set('scaleWidgetEnabled', false);
        this.stateStore.set('moveWidgetEnabled', true);
        this.eventBus.emit('mesh:rotate-widget-enabled', false);
        this.eventBus.emit('mesh:scale-widget-enabled', false);
        this.eventBus.emit('mesh:move-widget-enabled', true);
      }

      if (key === 'e') {
        event.preventDefault();
        this.stateStore.set('moveWidgetEnabled', false);
        this.stateStore.set('scaleWidgetEnabled', false);
        this.stateStore.set('rotateWidgetEnabled', true);
        this.eventBus.emit('mesh:move-widget-enabled', false);
        this.eventBus.emit('mesh:scale-widget-enabled', false);
        this.eventBus.emit('mesh:rotate-widget-enabled', true);
      }

      if (key === 'r' && !isCtrl && !isShift) {
        event.preventDefault();
        this.stateStore.set('moveWidgetEnabled', false);
        this.stateStore.set('rotateWidgetEnabled', false);
        this.stateStore.set('scaleWidgetEnabled', true);
        this.eventBus.emit('mesh:move-widget-enabled', false);
        this.eventBus.emit('mesh:rotate-widget-enabled', false);
        this.eventBus.emit('mesh:scale-widget-enabled', true);
      }

      if (key === 'q' && !isCtrl && !isShift) {
        event.preventDefault();
        this.stateStore.set('moveWidgetEnabled', false);
        this.stateStore.set('rotateWidgetEnabled', false);
        this.stateStore.set('scaleWidgetEnabled', false);
        this.eventBus.emit('mesh:move-widget-enabled', false);
        this.eventBus.emit('mesh:rotate-widget-enabled', false);
        this.eventBus.emit('mesh:scale-widget-enabled', false);
      }

      // Display modes: 1/2/3/4 (supports top row and numpad keys)
      const displayModeByCode = {
        Numpad1: '1',
        Numpad2: '2',
        Numpad3: '3',
        Numpad4: '4',
      };
      const displayModeKey = displayModeByCode[event.code] ?? key;
      if (
        displayModeKey === '1'
        || displayModeKey === '2'
        || displayModeKey === '3'
        || displayModeKey === '4'
      ) {
        event.preventDefault();
        // Match UI order:
        // 1: Shaded, 2: Unlit, 3: Clay, 4: Wireframe
        const modes = ['shaded', 'textures', 'clay', 'wireframe'];
        const modeIndex = parseInt(displayModeKey) - 1;
        if (modes[modeIndex]) {
          const prev = this.stateStore.getState().shading;
          const next = modes[modeIndex];
          if (next !== prev) this.ui.uiSounds?.playSelect();
          this.stateStore.set('shading', next);
          applyWireframeOnlyVisibleOnEnter(prev, next, this.stateStore, this.eventBus, this.ui);
          this.eventBus.emit('mesh:shading', next);
          const radio = document.querySelector(`input[name="shading"][value="${next}"]`);
          if (radio) radio.checked = true;
        }
      }

      // Space - Cycle through camera auto-orbit speeds
      if (key === ' ') {
        event.preventDefault();
        const state = this.stateStore.getState();
        if (state.camera?.isometric?.enabled) return;
        const currentMode = state.camera?.autoOrbit ?? 'off';
        const modes = ['off', 'slow', 'fast'];
        const currentIndex = modes.indexOf(currentMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        const nextMode = modes[nextIndex];
        
        // Update state
        if (!state.camera) {
          this.stateStore.set('camera', { autoOrbit: nextMode });
        } else {
          this.stateStore.set('camera.autoOrbit', nextMode);
        }
        
        // Emit event
        this.eventBus.emit('camera:auto-orbit', nextMode);
        
        // Sync UI radio buttons
        const radio = document.querySelector(`input[name="cameraAutoOrbit"][value="${nextMode}"]`);
        if (radio) radio.checked = true;
      }

      // Arrow keys — scrub animation only when the scrub control is live. Do not
      // preventDefault otherwise (marketing showcase gallery listens on window).
      if (key === 'arrowleft' || key === 'arrowright') {
        if (
          document.querySelector(
            '[data-orby-marketing-showcase-gallery][data-orby-marketing-showcase-keys]',
          )
        ) {
          return;
        }
        const scrub = this.ui.dom.animationScrub;
        if (!scrub || scrub.disabled) return;
        event.preventDefault();
        const current = parseFloat(scrub.value) || 0;
        const step = 0.01;
        const newValue =
          key === 'arrowleft'
            ? Math.max(0, current - step)
            : Math.min(1, current + step);
        scrub.value = String(newValue);
        this.eventBus.emit('animation:scrub', newValue);
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

      // L - Toggle 3-point lighting (delegate to shelf handler — syncs key/fill/rim/ambient)
      if (key === 'l') {
        event.preventDefault();
        const input = this.ui.inputs.lightsEnabled;
        if (!input) return;
        input.checked = !input.checked;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // O - Toggle watermark overlay (Orby logo / custom + credit)
      if (key === 'o') {
        event.preventDefault();
        if (this.ui.watermark) {
          this.ui.watermark.toggle();
        }
      }

      // V - Toggle UI visibility
      if (key === 'v') {
        event.preventDefault();
        this.ui.toggleUi();
      }

      // Tab - Cycle through tabs
      if (key === 'tab' && !isCtrl) {
        event.preventDefault();
        this.helpers.flushRangeSliderInteractionState?.();
        const tabs = ['mesh', 'studio', 'render', 'export', 'info'];
        const currentIndex = tabs.indexOf(this.ui.activeTab);
        const nextIndex = isShift
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : (currentIndex + 1) % tabs.length;
        const nextTab = tabs[nextIndex];
        const tabButton = document.querySelector(`[data-tab="${nextTab}"]`);
        if (tabButton) {
          tabButton.click();
        }
      }

      // Esc - Close modals/overlays
      if (key === 'escape') {
        if (this.ui.bugReport?.isOpen?.()) {
          event.preventDefault();
          this.ui.bugReport.close();
          return;
        }
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

      // A - Cycle mesh turntable speeds
      if (key === 'a') {
        event.preventDefault();
        const current = this.stateStore.getState().autoRotate;
        const speeds = [0, 0.2, 0.5];
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
        const next = !current;
        if (next) this.ui.uiSounds?.playShelfShow();
        else this.ui.uiSounds?.playShelfHide();
        this.stateStore.set('groundSolid', next);
        this.eventBus.emit('studio:ground-solid', next);
        if (this.ui.inputs.groundSolid) {
          this.ui.inputs.groundSolid.checked = next;
        }
      }

      // B - Toggle render backdrop (same as Render Backdrop control)
      if (key === 'b') {
        event.preventDefault();
        const current = this.stateStore.getState().hdriBackground;
        const next = !current;
        this.stateStore.set('hdriBackground', next);
        this.eventBus.emit('studio:hdri-background', next);
        this.ui.syncHdriBackgroundCheckboxes?.(next);
        this.ui.updateHdriBackgroundFallbackVisibility?.();
      }

      // X - Cycle through wireframe modes
      if (key === 'x') {
        event.preventDefault();
        const state = this.stateStore.getState();
        const wireframe = state.wireframe || {};
        const currentAlwaysOn = wireframe.alwaysOn || false;
        const currentOnlyVisible = wireframe.onlyVisibleFaces || false;
        const currentHideMesh = wireframe.hideMesh || false;
        
        // Cycle through modes:
        // 1. Off (all false)
        // 2. Only visible faces
        // 3. Always on + only visible faces
        // 4. Hide mesh
        let nextAlwaysOn = false;
        let nextOnlyVisible = false;
        let nextHideMesh = false;
        
        if (!currentAlwaysOn && !currentOnlyVisible && !currentHideMesh) {
          // State 0 -> State 1: Only visible faces
          nextOnlyVisible = true;
        } else if (currentOnlyVisible && !currentAlwaysOn && !currentHideMesh) {
          // State 1 -> State 2: Always on + only visible faces
          nextAlwaysOn = true;
          nextOnlyVisible = true;
        } else if (currentAlwaysOn && currentOnlyVisible && !currentHideMesh) {
          // State 2 -> State 3: Hide mesh
          nextHideMesh = true;
        } else {
          // State 3 -> State 0: All off
          // (next values already false)
        }
        
        // Update state
        this.stateStore.set('wireframe.alwaysOn', nextAlwaysOn);
        this.stateStore.set('wireframe.onlyVisibleFaces', nextOnlyVisible);
        this.stateStore.set('wireframe.hideMesh', nextHideMesh);
        
        // Emit events
        this.eventBus.emit('mesh:wireframe-always-on', nextAlwaysOn);
        this.eventBus.emit('mesh:wireframe-only-visible-faces', nextOnlyVisible);
        this.eventBus.emit('mesh:wireframe-hide-mesh', nextHideMesh);
        
        // Sync UI
        if (this.ui.inputs.wireframeAlwaysOn) {
          this.ui.inputs.wireframeAlwaysOn.checked = nextAlwaysOn;
        }
        if (this.ui.inputs.wireframeOnlyVisibleFaces) {
          this.ui.inputs.wireframeOnlyVisibleFaces.checked = nextOnlyVisible;
        }
        if (this.ui.inputs.wireframeHideMesh) {
          this.ui.inputs.wireframeHideMesh.checked = nextHideMesh;
        }
      }

      // [ / ] - Cycle through HDRI presets
      if (key === '[' || key === ']') {
        event.preventDefault();
        const state = this.stateStore.getState();
        const cyclePresets = HDRI_PRESET_ORDER.filter(
          (id) => id !== HDRI_CUSTOM_ID || state.hdriCustomName,
        );
        if (!cyclePresets.length) return;
        const currentPreset = state.hdri || cyclePresets[0];
        let currentIndex = cyclePresets.indexOf(currentPreset);
        if (currentIndex === -1) {
          currentIndex = 0;
        }
        const direction = key === '[' ? -1 : 1;
        const nextIndex = (currentIndex + direction + cyclePresets.length) % cyclePresets.length;
        const nextPreset = cyclePresets[nextIndex];
        this.stateStore.set('hdri', nextPreset);
        if (nextPreset !== HDRI_CUSTOM_ID) {
          this.stateStore.set('hdriCustomName', null);
          this.stateStore.set('hdriCustomAsset', null);
        }
        this.eventBus.emit('studio:hdri', nextPreset);
        this.ui.setHdriActive(nextPreset);
      }
    });
  }

  applyStudioPresetX() {
    this.stateStore.set('hdri', 'beach');
    this.ui.setHdriActive('beach');
    this.eventBus.emit('studio:hdri', 'beach');
    this.stateStore.set('hdriBackground', true);
    this.eventBus.emit('studio:hdri-background', true);
    this.ui.syncHdriBackgroundCheckboxes?.(true);
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
    if (this.ui.inputs.lightsEnabled) {
      this.ui.inputs.lightsEnabled.checked = false;
      this.ui.inputs.lightsEnabled.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      this.stateStore.set('lightsEnabled', false);
      this.eventBus.emit('lights:enabled', false);
    }
    this.stateStore.set('aberration.enabled', false);
    this.eventBus.emit('render:aberration', this.stateStore.getState().aberration);
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
    this.ui.syncUIFromState();
  }

}

