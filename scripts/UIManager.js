import { gsap } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js';

import { HDRI_STRENGTH_UNIT } from './config/hdri.js';
import { CAMERA_TEMPERATURE_NEUTRAL_K } from './constants.js';
import { SceneSettingsManager } from './settings/SceneSettingsManager.js';
import { UIHelpers } from './ui/UIHelpers.js';
import { MeshControls } from './ui/MeshControls.js';
import { StudioControls } from './ui/StudioControls.js';
import { RenderControls } from './ui/RenderControls.js';
import { GlobalControls } from './ui/GlobalControls.js';
import { AnimationControls } from './ui/AnimationControls.js';
import { ResetControls } from './ui/ResetControls.js';
import { StartMenuController } from './ui/StartMenuController.js';

export class UIManager {
  constructor(eventBus, stateStore) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.dom = {};
    this.activeTab = 'mesh';
    this.uiHidden = false;
    this.currentAnimationDuration = 0;
    this.animationPlaying = false;
    this.shelfRevealed = false;
  }

  init() {
    this.cacheDom();
    
    // Initialize helpers
    this.helpers = new UIHelpers(this.eventBus, this.stateStore, this);
    
    // Initialize control modules
    this.startMenuController = new StartMenuController(this.eventBus, this);
    this.meshControls = new MeshControls(this.eventBus, this.stateStore, this);
    this.studioControls = new StudioControls(this.eventBus, this.stateStore, this);
    this.renderControls = new RenderControls(this.eventBus, this.stateStore, this);
    this.globalControls = new GlobalControls(this.eventBus, this.stateStore, this);
    this.animationControls = new AnimationControls(this.eventBus, this.stateStore, this);
    this.resetControls = new ResetControls(this.eventBus, this.stateStore, this);
    
    // Initialize start menu
    this.startMenuController.init();
    
    // Initialize SceneSettingsManager
    this.sceneSettingsManager = new SceneSettingsManager(
      this.eventBus,
      this.stateStore,
      {
        setHdriActive: (hdri) => this.setHdriActive(hdri),
        toggleHdriControls: (enabled) => this.toggleHdriControls(enabled),
        setLightColorControlsDisabled: (disabled) => this.setLightColorControlsDisabled(disabled),
        setLightsRotationDisabled: (disabled) => this.setLightsRotationDisabled(disabled),
        setEffectControlsDisabled: (controls, disabled) => this.setEffectControlsDisabled(controls, disabled),
      }
    );
    
    this.bindEvents();
    this.stateStore.subscribe((state) => this.syncControls(state));
    this.syncControls(this.stateStore.getState());
    // Initialize panel header visibility
    const initialTab = this.activeTab || 'mesh';
    document.querySelectorAll('.panel-header-title').forEach((header) => {
      header.classList.toggle('visible', header.dataset.header === initialTab);
    });
  }

  cacheDom() {
    const q = (sel) => document.querySelector(sel);
    this.dom.canvas = q('#webgl');
    this.dom.topBarTitle = q('#topBarTitle');
    this.dom.topBarAnimation = q('#topBarAnimation');
    this.dom.resetAll = q('#resetAll');
    this.dom.helpButton = q('#helpButton');
    this.dom.helpOverlay = q('#helpOverlay');
    this.dom.closeHelp = q('#closeHelp');
    this.dom.toggleUi = q('#toggleUi');
    this.dom.shelf = q('#shelf');
    this.dom.shelf?.classList.add('is-shelf-hidden');
    this.dom.topBar = document.querySelector('.top-bar');
    this.dom.tabs = document.querySelectorAll('.tab');
    this.dom.panels = document.querySelectorAll('.panel');
    this.dom.toastTemplate = document.querySelector('#toastTemplate');
    this.dom.stats = q('#meshStats');
    this.dom.animationBlock = q('#animationBlock');
    this.dom.animationSelect = q('#animationSelect');
    this.dom.playPause = q('#playPause');
    this.dom.animationScrub = q('#animationScrub');
    this.dom.animationTime = q('#animationTime');

    this.inputs = {
      shading: document.querySelectorAll('input[name="shading"]'),
      scale: q('#scaleControl'),
      xOffset: q('#xOffsetControl'),
      yOffset: q('#yOffsetControl'),
      zOffset: q('#zOffsetControl'),
      rotationX: q('#rotationXControl'),
      rotationY: q('#rotationYControl'),
      rotationZ: q('#rotationZControl'),
      autoRotate: document.querySelectorAll('input[name="autorotate"]'),
      cameraAutoOrbit: document.querySelectorAll('input[name="cameraAutoOrbit"]'),
      showNormals: q('#showNormals'),
      hdriEnabled: q('#hdriEnabled'),
      hdriStrength: q('#hdriStrength'),
      hdriBlurriness: q('#hdriBlurriness'),
      hdriRotation: q('#hdriRotation'),
      hdriBackground: q('#hdriBackground'),
      lensFlareEnabled: q('#lensFlareEnabled'),
      lensFlareRotation: q('#lensFlareRotation'),
      lensFlareHeight: q('#lensFlareHeight'),
      lensFlareColor: q('#lensFlareColor'),
      lensFlareQuality: q('#lensFlareQuality'),
      materialBrightness: q('#materialBrightness'),
      materialMetalness: q('#materialMetalness'),
      materialRoughness: q('#materialRoughness'),
      materialEmissive: q('#materialEmissive'),
      clayColor: q('#clayColor'),
      clayNormalMap: q('#clayNormalMap'),
      wireframeAlwaysOn: q('#wireframeAlwaysOn'),
      wireframeColor: q('#wireframeColor'),
      wireframeOnlyVisibleFaces: q('#wireframeOnlyVisibleFaces'),
      wireframeHideMesh: q('#wireframeHideMesh'),
      groundSolid: q('#groundSolid'),
      groundWire: q('#groundWire'),
      groundSolidColor: q('#groundSolidColor'),
      groundWireColor: q('#groundWireColor'),
      groundWireOpacity: q('#groundWireOpacity'),
      groundY: q('#groundY'),
      podiumSnap: q('#podiumSnap'),
      gridSnap: q('#gridSnap'),
      gridScale: q('#gridScale'),
      podiumScale: q('#podiumScale'),
      gridScale: q('#gridScale'),
      hdriButtons: document.querySelectorAll('[data-hdri]'),
      lightControls: document.querySelectorAll('.light-color-row'),
      lightsEnabled: q('#lightsEnabled'),
      lightsMaster: q('#lightsMaster'),
      lightsRotation: q('#lightsRotation'),
      lightsHeight: q('#lightsHeight'),
      lightsAutoRotate: q('#lightsAutoRotate'),
      showLightIndicators: q('#showLightIndicators'),
      lightsCastShadows: q('#lightsCastShadows'),
      keyLightStrength: q('#keyLightStrength'),
      keyLightHeight: q('#keyLightHeight'),
      keyLightRotate: q('#keyLightRotate'),
      fillLightStrength: q('#fillLightStrength'),
      fillLightHeight: q('#fillLightHeight'),
      fillLightRotate: q('#fillLightRotate'),
      rimLightStrength: q('#rimLightStrength'),
      rimLightHeight: q('#rimLightHeight'),
      rimLightRotate: q('#rimLightRotate'),
      ambientLightStrength: q('#ambientLightStrength'),
      keyLightEnabled: q('#keyLightEnabled'),
      fillLightEnabled: q('#fillLightEnabled'),
      rimLightEnabled: q('#rimLightEnabled'),
      ambientLightEnabled: q('#ambientLightEnabled'),
      keyLightCastShadows: q('#keyLightCastShadows'),
      fillLightCastShadows: q('#fillLightCastShadows'),
      rimLightCastShadows: q('#rimLightCastShadows'),
      dofFocus: q('#dofFocus'),
      dofAperture: q('#dofAperture'),
      toggleDof: q('#toggleDof'),
      bloomThreshold: q('#bloomThreshold'),
      bloomStrength: q('#bloomStrength'),
      bloomRadius: q('#bloomRadius'),
      bloomColor: q('#bloomColor'),
      toggleBloom: q('#toggleBloom'),
      lensDirtEnabled: q('#lensDirtEnabled'),
      lensDirtStrength: q('#lensDirtStrength'),
      grainIntensity: q('#grainIntensity'),
      toggleGrain: q('#toggleGrain'),
      aberrationOffset: q('#aberrationOffset'),
      aberrationStrength: q('#aberrationStrength'),
      toggleAberration: q('#toggleAberration'),
      toggleFresnel: q('#toggleFresnel'),
      fresnelColor: q('#fresnelColor'),
      fresnelRadius: q('#fresnelRadius'),
      fresnelStrength: q('#fresnelStrength'),
      backgroundColor: q('#backgroundColor'),
      cameraFov: q('#cameraFov'),
      cameraTilt: q('#cameraTilt'),
      exposure: q('#exposure'),
      autoExposure: q('#autoExposure'),
      cameraContrast: q('#cameraContrast'),
      cameraTemperature: q('#cameraTemperature'),
      cameraTint: q('#cameraTint'),
      cameraHighlights: q('#cameraHighlights'),
      cameraShadows: q('#cameraShadows'),
      cameraSaturation: q('#cameraSaturation'),
      cameraClarity: q('#cameraClarity'),
      cameraFade: q('#cameraFade'),
      cameraSharpness: q('#cameraSharpness'),
      vignetteIntensity: q('#vignetteIntensity'),
      vignetteColor: q('#vignetteColor'),
      histogramEnabled: q('#histogramEnabled'),
      antiAliasing: q('#antiAliasing'),
      toneMapping: q('#toneMapping'),
    };

    this.buttons = {
      transformReset: q('#transformReset'),
      exportPng: q('#exportPngButton'),
      copySceneButtons: document.querySelectorAll('.copy-scene-settings'),
      loadSceneButtons: document.querySelectorAll('.load-scene-settings'),
      loadSceneModal: q('#loadSceneSettingsModal'),
      loadSceneText: q('#loadSceneSettingsText'),
      applySceneSettings: q('#applySceneSettings'),
      closeLoadSceneSettings: q('#closeLoadSceneSettings'),
      cancelLoadSceneSettings: q('#cancelLoadSceneSettings'),
      resetStudio: q('#resetStudioSettings'),
      resetMesh: q('#resetMeshSettings'),
      resetRender: q('#resetRenderSettings'),
      loadMesh: q('#loadMeshButton'),
    };

    // Export settings state
    this.exportSettings = {
      transparent: true,
      size: 2,
    };

    this.dom.blocks = {};
    this.dom.subsections = {};
    document.querySelectorAll('.panel-block[data-block]').forEach((block) => {
      const key = block.dataset.block;
      if (key) {
        this.dom.blocks[key] = block;
      }
    });
    // Cache subsections for individual muting within merged blocks
    document.querySelectorAll('.subsection[data-subsection]').forEach((subsection) => {
      const key = subsection.dataset.subsection;
      if (key) {
        this.dom.subsections[key] = subsection;
      }
    });
    // Start menu visibility is managed by StartMenuController
  }

  bindEvents() {
    // Bind all control modules
    this.globalControls.bind();
    this.meshControls.bind();
    this.studioControls.bind();
    this.renderControls.bind();
    this.animationControls.bind();
    this.resetControls.bind();
    
    // Setup slider utilities
    this.helpers.setupSliderKeyboardSupport();
    this.helpers.setupSliderFillUpdates();

    // Quick Navigation (Information tab) smooth scrolling
    const infoQuicknavLinks = document.querySelectorAll('.info-quicknav a[href^="#"]');
    infoQuicknavLinks.forEach((link) => {
      link.addEventListener('click', (event) => {
        const href = link.getAttribute('href');
        if (!href) return;
        const target = document.querySelector(href);
        if (!target) return;
    event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }


  // bindMeshControls() - Moved to MeshControls.js

  // bindStudioControls() - Moved to StudioControls.js

  // bindRenderControls() - Moved to RenderControls.js

  // bindGlobalControls() - Moved to GlobalControls.js

  // bindKeyboardShortcuts() - Moved to GlobalControls.js

  // bindAnimationControls() - Moved to AnimationControls.js

  // applyStudioPresetX() - Moved to GlobalControls.js

  // bindCopyButtons() - Moved to ResetControls.js

  // bindLocalResetButtons() - Moved to ResetControls.js

  toggleUi(forceState) {
    const nextState =
      typeof forceState === 'boolean' ? forceState : !this.uiHidden;
    this.uiHidden = nextState;
    document.body.classList.toggle('ui-hidden', this.uiHidden);
    if (this.shelfRevealed && this.dom.shelf) {
      if (this.uiHidden) {
        this.dom.shelf.classList.add('is-shelf-hidden');
      } else {
        requestAnimationFrame(() =>
          this.dom.shelf.classList.remove('is-shelf-hidden'),
        );
      }
    }
    // Update start menu visibility when UI is toggled (refresh with current intended state)
    if (this.startMenuController) {
      this.startMenuController.updateVisibility();
    }
    if (this.uiHidden) {
      document.activeElement?.blur?.();
    }
    if (this.dom.toggleUi) {
      this.dom.toggleUi.textContent = this.uiHidden ? 'V Show UI' : 'V Hide UI';
      this.dom.toggleUi.blur?.();
    }
  }

  // ============================================
  // Unified Utility Methods
  // ============================================

  /**
   * Format slider value with appropriate unit and decimals
   * @param {number} value - The numeric value
   * @param {string} type - Format type: 'angle', 'distance', 'multiplier', 'decimal', 'integer'
   * @param {number} decimals - Optional override for decimal places
   * @returns {string} Formatted string
   */
  formatSliderValue(value, type = 'decimal', decimals = null) {
    if (!Number.isFinite(value)) return '—';
    
    if (type === 'kelvin') {
      const rounded = Math.round(value);
      return `${rounded}K`;
    }

    const formatMap = {
      angle: { decimals: 0, unit: '°' },
      distance: { decimals: 2, unit: 'm' },
      multiplier: { decimals: 2, unit: '×' },
      decimal: { decimals: 2, unit: '' },
      integer: { decimals: 0, unit: '' },
    };
    
    const config = formatMap[type] || formatMap.decimal;
    const dec = decimals !== null ? decimals : config.decimals;
    const formatted = dec === 0 ? Math.round(value).toString() : value.toFixed(dec);
    return config.unit ? `${formatted}${config.unit}` : formatted;
  }

  /**
   * Update value label for a slider
   * @param {string} key - The data-output key
   * @param {string|number} value - The value to display (or formatted string)
   * @param {string} type - Format type if value is number
   * @param {number} decimals - Optional override for decimal places
   */
  updateValueLabel(key, value, type = null, decimals = null) {
    const label = document.querySelector(`[data-output="${key}"]`);
    if (!label) return;
    
    if (typeof value === 'number' && type) {
      label.textContent = this.formatSliderValue(value, type, decimals);
    } else {
      label.textContent = String(value);
    }
  }

  /**
   * Setup global slider fill updates for all range inputs
   * This ensures all sliders get the fill effect automatically
   */
  setupSliderFillUpdates() {
    // Add global listener for all slider inputs
    document.addEventListener('input', (event) => {
      if (event.target.type === 'range') {
        this.updateSliderFill(event.target);
      }
    }, true); // Use capture phase to catch all events
    
    // Initialize fill for all existing sliders
    document.querySelectorAll('input[type="range"]').forEach((slider) => {
      this.updateSliderFill(slider);
    });
  }

  /**
   * Update slider fill effect using CSS variable
   * Calculates fill percentage based on slider value, min, and max
   * Supports both left-to-right fill and center-outward fill for centered sliders
   * @param {HTMLInputElement} slider - The slider input element
   */
  updateSliderFill(slider) {
    if (!slider || slider.type !== 'range') return;
    
    // Skip temperature and tint sliders (they have custom gradients)
    const sliderLine = slider.closest('.slider-line');
    if (sliderLine?.classList.contains('slider-line--temperature') || 
        sliderLine?.classList.contains('slider-line--tint')) {
      return;
    }
    
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const value = parseFloat(slider.value) || 0;
    
    // Detect if this is a centered slider (min < 0 and max > 0)
    const isCentered = min < 0 && max > 0;
    
    if (isCentered) {
      // Center-outward fill: fill from center point outward
      const center = 0;
      const range = max - min;
      const centerPercent = ((center - min) / range) * 100; // Position of center on track
      
      if (value === center) {
        // At center: no fill
        slider.style.setProperty('--slider-fill-start', `${centerPercent}%`);
        slider.style.setProperty('--slider-fill-end', `${centerPercent}%`);
      } else if (value > center) {
        // Positive value: fill from center to value (right side)
        const valuePercent = ((value - min) / range) * 100;
        slider.style.setProperty('--slider-fill-start', `${centerPercent}%`);
        slider.style.setProperty('--slider-fill-end', `${valuePercent}%`);
      } else {
        // Negative value: fill from value to center (left side)
        const valuePercent = ((value - min) / range) * 100;
        slider.style.setProperty('--slider-fill-start', `${valuePercent}%`);
        slider.style.setProperty('--slider-fill-end', `${centerPercent}%`);
      }
    } else {
      // Left-to-right fill: fill from 0% to value percentage
      const range = max - min;
      const fillPercent = range > 0 ? ((value - min) / range) * 100 : 0;
      slider.style.setProperty('--slider-fill-start', '0%');
      slider.style.setProperty('--slider-fill-end', `${fillPercent}%`);
    }
  }

  /**
   * Apply snap-to-center for sliders with center default values
   * @param {HTMLInputElement} slider - The slider input element
   * @param {number} min - Minimum slider value
   * @param {number} max - Maximum slider value
   * @param {number} centerValue - The center/default value to snap to
   * @param {number} thresholdPercent - Threshold as percentage of range (default: 3%)
   * @returns {number} - The value (snapped if within threshold, otherwise original)
   */
  applySnapToCenter(slider, min, max, centerValue, thresholdPercent = 3) {
    if (!slider) return parseFloat(slider.value);
    
    const currentValue = parseFloat(slider.value);
    const range = max - min;
    const threshold = (range * thresholdPercent) / 100;
    const distanceFromCenter = Math.abs(currentValue - centerValue);
    
    // If within threshold, snap to center
    if (distanceFromCenter <= threshold) {
      slider.value = centerValue;
      return centerValue;
    }
    
    return currentValue;
  }

  /**
   * Setup keyboard support for all range inputs
   */
  setupSliderKeyboardSupport() {
    // Find all range inputs and ensure they're focusable
    const allSliders = document.querySelectorAll('input[type="range"]');
    allSliders.forEach((slider) => {
      // Ensure focusable
      if (!slider.hasAttribute('tabindex')) {
        slider.setAttribute('tabindex', '0');
      }
      
      // Ensure focus on click
      slider.addEventListener('click', () => {
        slider.focus();
      }, { passive: true });
    });
  }

  /**
   * Enable keyboard arrow key stepping for a slider
   * @param {HTMLInputElement} slider - The slider input element
   * @deprecated - Keyboard stepping is now handled at document level for all sliders
   */
  enableSliderKeyboardStepping(slider) {
    if (!slider || slider.type !== 'range') return;
    
    // Just ensure slider is focusable - keyboard handling is done at document level
    slider.setAttribute('tabindex', '0');
    
    // Ensure slider gets focus on click
    slider.addEventListener('click', (event) => {
      if (event.target === slider) {
        slider.focus();
      }
    });
  }

  /**
   * Unified method to set control disabled state
   * @param {string|string[]} inputIds - Single ID or array of IDs
   * @param {boolean} disabled - Whether to disable
   * @param {object} options - Additional options
   */
  setControlDisabled(inputIds, disabled, options = {}) {
    const ids = Array.isArray(inputIds) ? inputIds : [inputIds];
    const { applyBlockMute = false, blockKey = null } = options;
    
    ids.forEach((id) => {
      const input = this.inputs[id];
      if (!input) return;
      
      input.disabled = disabled;
      // Use consistent class name
      input.classList.toggle('is-disabled-handle', disabled);
    });
    
    // Optionally apply block muting
    if (applyBlockMute && blockKey) {
      this.setBlockMuted(blockKey, disabled);
    }
  }

  /**
   * Unified color input handler
   * @param {string} inputId - The color input ID
   * @param {string} statePath - StateStore path (e.g., 'clay.color', 'lensFlare.color')
   * @param {string} eventName - Event bus event name
   */
  bindColorInput(inputId, statePath, eventName) {
    const input = this.inputs[inputId];
    if (!input) return;
    
    input.addEventListener('input', (event) => {
      const value = event.target.value;
      this.stateStore.set(statePath, value);
      this.eventBus.emit(eventName, value);
    });
  }

  /**
   * Sync UI from current state (alias for syncControls)
   */
  syncUIFromState() {
    const state = this.stateStore.getState();
    this.syncControls(state);
  }

  setHdriActive(preset) {
    this.inputs.hdriButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.hdri === preset);
    });
  }


  toggleHdriControls(enabled) {
    this.inputs.hdriButtons.forEach((button) => {
      button.disabled = !enabled;
      button.classList.toggle('is-disabled', !enabled);
    });
    // Block muting handled by applyBlockStates via syncControls
    this.inputs.hdriBackground.disabled = !enabled;
      this.inputs.hdriStrength.disabled = !enabled;
      this.inputs.hdriBlurriness.disabled = !enabled;
      if (this.inputs.hdriRotation) {
        this.inputs.hdriRotation.disabled = !enabled;
      }
    if (!enabled) {
      this.inputs.backgroundColor.disabled = false;
    }
    this.updateLensFlareControlsDisabled();
  }

  updateLensFlareControlsDisabled() {
    if (!this.inputs.lensFlareEnabled) return;
    const hdriActive = !!this.inputs.hdriEnabled?.checked;
    const enabled = hdriActive && !!this.inputs.lensFlareEnabled.checked;
    
    // Disable lens flare toggle if HDRI is off
    this.setControlDisabled('lensFlareEnabled', !hdriActive);
    
    // Disable lens flare controls if not enabled
    this.setControlDisabled(
      ['lensFlareRotation', 'lensFlareHeight', 'lensFlareColor', 'lensFlareQuality'],
      !enabled,
    );
    
    // Block muting handled by applyBlockStates via syncControls
  }

  setDropzoneVisible(visible) {
    if (this.startMenuController) {
      this.startMenuController.setVisible(visible);
    }
  }

  revealShelf() {
    if (this.shelfRevealed || !this.dom.shelf) return;
    this.shelfRevealed = true;
    requestAnimationFrame(() => {
      if (!this.uiHidden) {
        this.dom.shelf.classList.remove('is-shelf-hidden');
      }
    });
  }

  showToast(message) {
    const template = this.dom.toastTemplate?.content?.firstElementChild;
    if (!template) return;
    const toast = template.cloneNode(true);
    toast.querySelector('.toast-message').textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  copySettingsToClipboard(message, payload) {
    const text = JSON.stringify(payload, null, 2);
    const write = async () => {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    };
    write()
      .then(() => this.showToast(message))
      .catch(() => this.showToast('Copy failed'));
  }

  loadRenderSettingsFromText(text) {
    try {
      const payload = JSON.parse(text);
      
      // Validate that it looks like FX settings
      const expectedKeys = ['dof', 'bloom', 'grain', 'aberration', 'fresnel', 'exposure', 'background', 'camera'];
      const hasExpectedKeys = expectedKeys.some(key => key in payload);
      
      if (!hasExpectedKeys) {
        this.showToast('Invalid FX settings - missing required fields');
        return;
      }

      // Apply DOF settings
      if (payload.dof) {
        this.stateStore.set('dof', payload.dof);
        this.eventBus.emit('render:dof', payload.dof);
        this.setEffectControlsDisabled(
          ['dofFocus', 'dofAperture'],
          !payload.dof.enabled,
        );
      }

      // Apply Bloom settings
      if (payload.bloom) {
        this.stateStore.set('bloom', payload.bloom);
        this.eventBus.emit('render:bloom', payload.bloom);
        this.setEffectControlsDisabled(
          ['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor'],
          !payload.bloom.enabled,
        );
      }

      // Apply Grain settings
      if (payload.grain) {
        this.stateStore.set('grain', payload.grain);
        this.eventBus.emit('render:grain', payload.grain);
        this.setEffectControlsDisabled(['grainIntensity'], !payload.grain.enabled);
      }

      // Apply Aberration settings
      if (payload.aberration) {
        this.stateStore.set('aberration', payload.aberration);
        this.eventBus.emit('render:aberration', payload.aberration);
        this.setEffectControlsDisabled(
          ['aberrationOffset', 'aberrationStrength'],
          !payload.aberration.enabled,
        );
      }

      // Apply Fresnel settings
      if (payload.fresnel) {
        this.stateStore.set('fresnel', payload.fresnel);
        this.eventBus.emit('render:fresnel', payload.fresnel);
        this.setEffectControlsDisabled(
          ['fresnelColor', 'fresnelRadius', 'fresnelStrength'],
          !payload.fresnel.enabled,
        );
      }

      // Apply Camera settings
      if (payload.camera) {
        if (payload.camera.fov !== undefined) {
          this.stateStore.set('camera.fov', payload.camera.fov);
          this.eventBus.emit('camera:fov', payload.camera.fov);
        }
        if (payload.camera.tilt !== undefined) {
          this.stateStore.set('camera.tilt', payload.camera.tilt);
          this.eventBus.emit('camera:tilt', payload.camera.tilt);
        }
        if (payload.camera.contrast !== undefined) {
          this.stateStore.set('camera.contrast', payload.camera.contrast);
          this.eventBus.emit('render:contrast', payload.camera.contrast);
        }
        if (payload.camera.temperature !== undefined) {
          this.stateStore.set('camera.temperature', payload.camera.temperature);
          this.eventBus.emit('render:temperature', payload.camera.temperature);
        }
        if (payload.camera.tint !== undefined) {
          this.stateStore.set('camera.tint', payload.camera.tint);
          this.eventBus.emit('render:tint', payload.camera.tint / 100);
        }
        if (payload.camera.highlights !== undefined) {
          this.stateStore.set('camera.highlights', payload.camera.highlights);
          this.eventBus.emit('render:highlights', payload.camera.highlights / 100);
        }
        if (payload.camera.shadows !== undefined) {
          this.stateStore.set('camera.shadows', payload.camera.shadows);
          this.eventBus.emit('render:shadows', payload.camera.shadows / 50);
        }
        if (payload.camera.saturation !== undefined) {
          this.stateStore.set('camera.saturation', payload.camera.saturation);
          this.eventBus.emit('render:saturation', payload.camera.saturation);
        }
        if (payload.camera.vignette !== undefined) {
          this.stateStore.set('camera.vignette', payload.camera.vignette);
          this.eventBus.emit('render:vignette', payload.camera.vignette);
        }
        if (payload.camera.vignetteColor !== undefined) {
          this.stateStore.set('camera.vignetteColor', payload.camera.vignetteColor);
          this.eventBus.emit('render:vignette-color', payload.camera.vignetteColor);
        }
      }

      // Apply Exposure
      if (payload.exposure !== undefined) {
        this.stateStore.set('exposure', payload.exposure);
        this.eventBus.emit('scene:exposure', payload.exposure);
      }

      // Apply Auto Exposure
      if (payload.autoExposure !== undefined) {
        this.stateStore.set('autoExposure', payload.autoExposure);
        this.eventBus.emit('camera:auto-exposure', payload.autoExposure);
      }

      // Apply Lens Dirt
      if (payload.lensDirt) {
        this.stateStore.set('lensDirt', payload.lensDirt);
        this.eventBus.emit('render:lens-dirt', payload.lensDirt);
        this.setEffectControlsDisabled(
          ['lensDirtStrength'],
          !payload.lensDirt.enabled,
        );
      }

      // Apply Anti-aliasing
      if (payload.antiAliasing !== undefined) {
        this.stateStore.set('antiAliasing', payload.antiAliasing);
        this.eventBus.emit('render:anti-aliasing', payload.antiAliasing);
      }

      // Apply Tone Mapping
      if (payload.toneMapping !== undefined) {
        this.stateStore.set('toneMapping', payload.toneMapping);
        this.eventBus.emit('render:tone-mapping', payload.toneMapping);
      }

      // Apply Background
      if (payload.background !== undefined) {
        this.stateStore.set('background', payload.background);
        this.eventBus.emit('scene:background', payload.background);
      }

      // Sync UI to reflect loaded values
      this.syncControls(this.stateStore.getState());
      this.showToast('FX settings loaded');
    } catch (error) {
      console.error('Error loading FX settings:', error);
      this.showToast('Failed to load FX settings - invalid JSON');
    }
  }


  updateStats(stats) {
    if (!stats) return;
    const mapping = {
      assetname: stats.assetName ?? '—',
      generator: stats.generator ?? '—',
      version: stats.version ?? '—',
      copyright: stats.copyright ?? '—',
      triangles: stats.triangles?.toLocaleString() ?? '—',
      vertices: stats.vertices?.toLocaleString() ?? '—',
      materials: stats.materials?.toString() ?? '—',
      textures: stats.textures?.toString() ?? '—',
      filesize: stats.fileSize ?? '—',
      bounds: stats.bounds ?? '—',
    };
    Array.from(this.dom.stats.querySelectorAll('div')).forEach((row) => {
      const label = row.querySelector('dt')?.textContent?.toLowerCase();
      const key = label?.replace(/\s/g, '');
      const targetKey =
        {
          assetname: 'assetname',
          generator: 'generator',
          version: 'version',
          copyright: 'copyright',
          triangles: 'triangles',
          vertices: 'vertices',
          materials: 'materials',
          textures: 'textures',
          filesize: 'filesize',
          bounds: 'bounds',
        }[key] ?? key;
      const dd = row.querySelector('dd');
      if (dd && mapping[targetKey] !== undefined) {
        dd.textContent = mapping[targetKey];
      }
    });
  }

  updateTitle(filename) {
    document.title = `Orby — ${filename}`;
    if (this.dom.topBarTitle) {
      this.dom.topBarTitle.textContent = filename;
    }
  }

  updateTopBarDetail(detail) {
    if (this.dom.topBarAnimation) {
      this.dom.topBarAnimation.textContent = detail;
    }
  }

  extractAnimationName(fullName) {
    if (!fullName) return 'Animation';
    
    // Split by pipe if present
    const parts = fullName.split('|');
    
    // Find the most meaningful part (usually the last or middle part that's not common prefixes)
    let namePart = fullName;
    if (parts.length > 1) {
      // Skip common prefixes like "Armature", "baselayer", etc.
      const meaningfulParts = parts.filter(part => {
        const lower = part.toLowerCase();
        return !['armature', 'baselayer', 'mixamo', 'root'].includes(lower);
      });
      namePart = meaningfulParts.length > 0 ? meaningfulParts[meaningfulParts.length - 1] : parts[parts.length - 1];
    }
    
    // Convert underscores to spaces and title case
    return namePart
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase())
      .trim();
  }

  setAnimationClips(clips) {
    this.dom.animationSelect.innerHTML = '';
    if (!clips?.length) {
      this.dom.animationBlock.hidden = true;
      this.animationPlaying = false;
      this.dom.playPause.disabled = true;
      this.dom.animationScrub.disabled = true;
      return;
    }
    clips.forEach((clip, index) => {
      const option = document.createElement('option');
      option.value = index;
      const displayName = this.extractAnimationName(clip.name);
      option.textContent = displayName;
      this.dom.animationSelect.appendChild(option);
    });
    this.dom.animationBlock.hidden = false;
    this.dom.playPause.disabled = false;
    this.dom.animationScrub.disabled = false;
    this.currentAnimationDuration = clips[0].seconds ?? 0;
  }

  setAnimationPlaying(playing) {
    this.animationPlaying = playing;
    this.dom.playPause.textContent = playing ? 'Pause' : 'Play';
  }

  updateAnimationTime(current, duration) {
    if (!duration) return;
    const clamp = Math.max(0, Math.min(current, duration));
    const minutes = Math.floor(clamp / 60)
      .toString()
      .padStart(1, '0');
    const seconds = Math.floor(clamp % 60)
      .toString()
      .padStart(2, '0');
    this.dom.animationTime.textContent = `${minutes}:${seconds}`;
    const progress = duration === 0 ? 0 : clamp / duration;
    this.dom.animationScrub.value = progress;
  }

  syncMeshControls(state) {
    this.inputs.scale.value = state.scale;
    this.updateValueLabel('scale', state.scale, 'multiplier');
    this.inputs.yOffset.value = state.yOffset;
    this.updateValueLabel('yOffset', state.yOffset, 'distance');
    if (this.inputs.rotationX) {
      this.inputs.rotationX.value = state.rotationX ?? 0;
      this.updateValueLabel('rotationX', state.rotationX ?? 0, 'angle');
    }
    if (this.inputs.rotationY) {
      this.inputs.rotationY.value = state.rotationY ?? 0;
      this.updateValueLabel('rotationY', state.rotationY ?? 0, 'angle');
    }
    if (this.inputs.rotationZ) {
      this.inputs.rotationZ.value = state.rotationZ ?? 0;
      this.updateValueLabel('rotationZ', state.rotationZ ?? 0, 'angle');
    }
    if (this.inputs.showNormals) {
      this.inputs.showNormals.checked = state.showNormals;
    }
    // Widget states are managed via keyboard shortcuts (W/E), no UI sync needed
    if (this.inputs.materialBrightness) {
      const brightness = state.material?.brightness ?? 1.0;
      this.inputs.materialBrightness.value = brightness;
      this.updateValueLabel('materialBrightness', brightness, 'decimal');
    }
    if (this.inputs.materialMetalness) {
      const metalness = state.material?.metalness ?? 0.0;
      this.inputs.materialMetalness.value = metalness;
      this.updateValueLabel('materialMetalness', metalness, 'decimal');
    }
    if (this.inputs.materialRoughness) {
      const roughness = state.material?.roughness ?? 0.8;
      this.inputs.materialRoughness.value = roughness;
      this.updateValueLabel('materialRoughness', roughness, 'decimal');
    }
    if (this.inputs.materialEmissive) {
      const emissive = state.material?.emissive ?? 0.0;
      this.inputs.materialEmissive.value = emissive;
      this.updateValueLabel('materialEmissive', emissive, 'decimal');
    }
    this.inputs.clayColor.value = state.clay.color;
    if (this.inputs.clayNormalMap) {
      this.inputs.clayNormalMap.checked = state.clay.normalMap !== false;
    }
    if (state.wireframe) {
      if (this.inputs.wireframeColor) {
        this.inputs.wireframeColor.value = state.wireframe.color;
      }
      if (this.inputs.wireframeAlwaysOn) {
        this.inputs.wireframeAlwaysOn.checked = !!state.wireframe.alwaysOn;
      }
      if (this.inputs.wireframeOnlyVisibleFaces) {
        this.inputs.wireframeOnlyVisibleFaces.checked = !!state.wireframe.onlyVisibleFaces;
      }
    }
    
    // Radio buttons
    this.inputs.autoRotate.forEach((input) => {
      input.checked = parseFloat(input.value) === state.autoRotate;
    });
    // Sync camera auto-orbit
    if (this.inputs.cameraAutoOrbit) {
      const autoOrbitValue = state.camera?.autoOrbit ?? 'off';
      this.inputs.cameraAutoOrbit.forEach((radio) => {
        radio.checked = radio.value === autoOrbitValue;
      });
    }
    this.inputs.shading.forEach((input) => {
      input.checked = input.value === state.shading;
    });
  }

  syncStudioControls(state) {
    this.setHdriActive(state.hdri);
    this.inputs.hdriEnabled.checked = !!state.hdriEnabled;
    this.toggleHdriControls(state.hdriEnabled);
    const normalizedStrength = Math.min(
      3,
      Math.max(0, state.hdriStrength / HDRI_STRENGTH_UNIT),
    );
    this.inputs.hdriStrength.value = normalizedStrength;
    this.updateValueLabel('hdriStrength', normalizedStrength, 'decimal');
    if (this.inputs.hdriBlurriness) {
      const blurriness = state.hdriBlurriness ?? 0;
      this.inputs.hdriBlurriness.value = blurriness;
      this.updateValueLabel('hdriBlurriness', blurriness, 'decimal');
    }
    if (this.inputs.hdriRotation) {
      const rotation = state.hdriRotation ?? 0;
      this.inputs.hdriRotation.value = rotation;
      this.updateValueLabel('hdriRotation', rotation, 'angle');
    }
    this.inputs.hdriBackground.checked = state.hdriBackground;
    // Background color input is always enabled - color is visible when HDRI background is off
    this.inputs.backgroundColor.value = state.background;
    
    // Lens Flare
    if (this.inputs.lensFlareEnabled) {
      this.inputs.lensFlareEnabled.checked = !!state.lensFlare?.enabled;
    }
    if (this.inputs.lensFlareRotation) {
      const rotation = state.lensFlare?.rotation ?? 0;
      this.inputs.lensFlareRotation.value = rotation;
      this.updateValueLabel('lensFlareRotation', rotation, 'angle');
    }
    if (this.inputs.lensFlareHeight) {
      const height = Math.min(
        90,
        Math.max(0, state.lensFlare?.height ?? 0),
      );
      this.inputs.lensFlareHeight.value = height;
      this.updateValueLabel('lensFlareHeight', height, 'angle');
    }
    if (this.inputs.lensFlareColor && state.lensFlare?.color) {
      this.inputs.lensFlareColor.value = state.lensFlare.color;
    }
    if (this.inputs.lensFlareQuality) {
      this.inputs.lensFlareQuality.value = state.lensFlare?.quality ?? 'maximum';
    }
    this.updateLensFlareControlsDisabled();
    
    // Ground/Podium
    this.inputs.groundSolid.checked = state.groundSolid;
    this.inputs.groundWire.checked = state.groundWire;
    this.inputs.groundSolidColor.value = state.groundSolidColor;
    this.inputs.groundWireColor.value = state.groundWireColor;
    this.inputs.groundWireOpacity.value = state.groundWireOpacity;
    this.updateValueLabel('groundWireOpacity', state.groundWireOpacity, 'decimal');
    this.inputs.groundY.value = state.groundY;
    this.updateValueLabel('groundY', state.groundY, 'distance');
    if (this.inputs.podiumScale) {
      this.inputs.podiumScale.value = state.podiumScale ?? 1;
      this.updateValueLabel('podiumScale', state.podiumScale ?? 1, 'decimal');
    }
    if (this.inputs.gridScale) {
      this.inputs.gridScale.value = state.gridScale ?? 1;
      this.updateValueLabel('gridScale', state.gridScale ?? 1, 'decimal');
    }
    
    // Lights
    if (this.inputs.lightsRotation) {
      this.inputs.lightsRotation.value = state.lightsRotation ?? 0;
      this.updateValueLabel('lightsRotation', state.lightsRotation ?? 0, 'angle');
    }
    if (this.inputs.lightsHeight) {
      const heightValue = state.lightsHeight ?? 5;
      this.inputs.lightsHeight.value = heightValue;
      this.updateValueLabel('lightsHeight', heightValue, 'decimal');
    }
    if (this.inputs.lightsMaster) {
      const masterValue = state.lightsMaster ?? 1;
      this.inputs.lightsMaster.value = masterValue;
      this.updateValueLabel('lightsMaster', masterValue, 'decimal');
    }
    if (this.inputs.showLightIndicators) {
      this.inputs.showLightIndicators.checked = !!state.showLightIndicators;
    }
    if (this.inputs.lightsAutoRotate) {
      this.inputs.lightsAutoRotate.checked = !!state.lightsAutoRotate;
      this.setLightsRotationDisabled(!!state.lightsAutoRotate);
    }
    if (this.inputs.lightsCastShadows) {
      this.inputs.lightsCastShadows.checked = !!state.lightsCastShadows;
    }
    if (this.inputs.lightsEnabled) {
      this.inputs.lightsEnabled.checked = !!state.lightsEnabled;
    }
    // Update slider states based on master and individual light enabled states
    this.updateLightSliderStates();
    this.inputs.lightControls.forEach((control) => {
      const lightId = control.dataset.light;
      const colorInput = control.querySelector('input[type="color"]');
      if (colorInput && state.lights[lightId]) {
        colorInput.value = state.lights[lightId].color;
      }
    });
    // Sync individual light controls - show BASE values (0-5), global is a multiplier
    if (this.inputs.keyLightStrength && state.lights?.key) {
      const baseIntensity = state.lights.key.intensity ?? 1.28;
      this.inputs.keyLightStrength.value = baseIntensity;
      this.updateValueLabel('keyLightStrength', baseIntensity, 'decimal');
    }
    if (this.inputs.keyLightHeight && state.lights?.key) {
      this.inputs.keyLightHeight.value = state.lights.key.height ?? 5;
      this.updateValueLabel('keyLightHeight', state.lights.key.height ?? 5, 'decimal');
    }
    if (this.inputs.keyLightRotate && state.lights?.key) {
      this.inputs.keyLightRotate.value = state.lights.key.rotate ?? 0;
      this.updateValueLabel('keyLightRotate', state.lights.key.rotate ?? 0, 'angle');
    }
    if (this.inputs.fillLightStrength && state.lights?.fill) {
      const baseIntensity = state.lights.fill.intensity ?? 0.8;
      this.inputs.fillLightStrength.value = baseIntensity;
      this.updateValueLabel('fillLightStrength', baseIntensity, 'decimal');
    }
    if (this.inputs.fillLightHeight && state.lights?.fill) {
      this.inputs.fillLightHeight.value = state.lights.fill.height ?? 3;
      this.updateValueLabel('fillLightHeight', state.lights.fill.height ?? 3, 'decimal');
    }
    if (this.inputs.fillLightRotate && state.lights?.fill) {
      this.inputs.fillLightRotate.value = state.lights.fill.rotate ?? 0;
      this.updateValueLabel('fillLightRotate', state.lights.fill.rotate ?? 0, 'angle');
    }
    if (this.inputs.rimLightStrength && state.lights?.rim) {
      const baseIntensity = state.lights.rim.intensity ?? 0.96;
      this.inputs.rimLightStrength.value = baseIntensity;
      this.updateValueLabel('rimLightStrength', baseIntensity, 'decimal');
    }
    if (this.inputs.rimLightHeight && state.lights?.rim) {
      this.inputs.rimLightHeight.value = state.lights.rim.height ?? 4;
      this.updateValueLabel('rimLightHeight', state.lights.rim.height ?? 4, 'decimal');
    }
    if (this.inputs.rimLightRotate && state.lights?.rim) {
      this.inputs.rimLightRotate.value = state.lights.rim.rotate ?? 0;
      this.updateValueLabel('rimLightRotate', state.lights.rim.rotate ?? 0, 'angle');
    }
    if (this.inputs.ambientLightStrength && state.lights?.ambient) {
      const baseIntensity = state.lights.ambient.intensity ?? 0.48;
      this.inputs.ambientLightStrength.value = baseIntensity;
      this.updateValueLabel('ambientLightStrength', baseIntensity, 'decimal');
    }
    // Sync individual light enabled states
    if (this.inputs.keyLightEnabled && state.lights?.key) {
      this.inputs.keyLightEnabled.checked = state.lights.key.enabled !== false;
    }
    if (this.inputs.fillLightEnabled && state.lights?.fill) {
      this.inputs.fillLightEnabled.checked = state.lights.fill.enabled !== false;
    }
    if (this.inputs.rimLightEnabled && state.lights?.rim) {
      this.inputs.rimLightEnabled.checked = state.lights.rim.enabled !== false;
    }
    if (this.inputs.ambientLightEnabled && state.lights?.ambient) {
      this.inputs.ambientLightEnabled.checked = state.lights.ambient.enabled !== false;
    }
    // Sync cast shadows
    if (this.inputs.keyLightCastShadows && state.lights?.key) {
      this.inputs.keyLightCastShadows.checked = state.lights.key.castShadows !== false;
    }
    if (this.inputs.fillLightCastShadows && state.lights?.fill) {
      this.inputs.fillLightCastShadows.checked = state.lights.fill.castShadows !== false;
    }
    if (this.inputs.rimLightCastShadows && state.lights?.rim) {
      this.inputs.rimLightCastShadows.checked = state.lights.rim.castShadows !== false;
    }
    
    // HDRI buttons
    this.inputs.hdriButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.hdri === state.hdri);
    });
  }

  syncRenderControls(state) {
    // DOF
    this.inputs.dofFocus.value = state.dof.focus;
    this.updateValueLabel('dofFocus', state.dof.focus, 'distance');
    this.inputs.dofAperture.value = state.dof.aperture;
    this.updateValueLabel('dofAperture', state.dof.aperture, 'decimal', 3);
    this.inputs.toggleDof.checked = !!state.dof.enabled;
    this.setEffectControlsDisabled(
      ['dofFocus', 'dofAperture'],
      !state.dof.enabled,
    );
    
    // Bloom
    this.inputs.bloomThreshold.value = state.bloom.threshold;
    this.updateValueLabel('bloomThreshold', state.bloom.threshold, 'decimal');
    this.inputs.bloomStrength.value = state.bloom.strength;
    this.updateValueLabel('bloomStrength', state.bloom.strength, 'decimal');
    this.inputs.bloomRadius.value = state.bloom.radius;
    this.updateValueLabel('bloomRadius', state.bloom.radius, 'decimal');
    if (this.inputs.bloomColor && state.bloom.color) {
      this.inputs.bloomColor.value = state.bloom.color;
    }
    this.inputs.toggleBloom.checked = !!state.bloom.enabled;
    this.setEffectControlsDisabled(
      ['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor'],
      !state.bloom.enabled,
    );

    if (this.inputs.lensDirtStrength && state.lensDirt) {
      this.inputs.lensDirtStrength.value = state.lensDirt.strength;
      this.updateValueLabel('lensDirtStrength', state.lensDirt.strength, 'decimal');
    }
    if (this.inputs.lensDirtEnabled) {
      const enabled = !!state.lensDirt?.enabled;
      this.inputs.lensDirtEnabled.checked = enabled;
      this.setEffectControlsDisabled(['lensDirtStrength'], !enabled);
    }
    if (this.inputs.autoExposure) {
      const enabled = !!state.autoExposure;
      this.inputs.autoExposure.checked = enabled;
      this.setEffectControlsDisabled(['exposure'], enabled);
    }
    
    // Grain
    this.inputs.grainIntensity.value = (state.grain.intensity / 0.15).toFixed(2);
    this.updateValueLabel('grainIntensity', state.grain.intensity / 0.15, 'decimal');
    this.inputs.toggleGrain.checked = !!state.grain.enabled;
    this.setEffectControlsDisabled(['grainIntensity'], !state.grain.enabled);
    
    // Aberration
    this.inputs.aberrationOffset.value = state.aberration.offset;
    this.updateValueLabel('aberrationOffset', state.aberration.offset, 'decimal', 3);
    this.inputs.aberrationStrength.value = state.aberration.strength;
    this.updateValueLabel('aberrationStrength', state.aberration.strength, 'decimal');
    this.inputs.toggleAberration.checked = !!state.aberration.enabled;
    this.setEffectControlsDisabled(
      ['aberrationOffset', 'aberrationStrength'],
      !state.aberration.enabled,
    );
    
    // Fresnel
    this.inputs.toggleFresnel.checked = !!state.fresnel.enabled;
    this.inputs.fresnelColor.value = state.fresnel.color;
    this.inputs.fresnelRadius.value = state.fresnel.radius;
    this.updateValueLabel('fresnelRadius', state.fresnel.radius, 'decimal');
    this.inputs.fresnelStrength.value = state.fresnel.strength;
    this.updateValueLabel('fresnelStrength', state.fresnel.strength, 'decimal');
    this.setEffectControlsDisabled(
      ['fresnelColor', 'fresnelRadius', 'fresnelStrength'],
      !state.fresnel.enabled,
    );
    
    // Camera & Exposure
    this.inputs.cameraFov.value = state.camera.fov;
    this.updateValueLabel('cameraFov', state.camera.fov, 'angle');
    if (this.inputs.cameraTilt) {
      this.inputs.cameraTilt.value = state.camera.tilt ?? 0;
      this.updateValueLabel('cameraTilt', state.camera.tilt ?? 0, 'angle');
    }
    this.inputs.exposure.value = state.exposure;
    this.updateValueLabel('exposure', state.exposure, 'decimal');
    if (this.inputs.cameraContrast) {
      const contrast = state.camera?.contrast ?? 1.0;
      this.inputs.cameraContrast.value = contrast;
      this.updateValueLabel('cameraContrast', contrast, 'decimal');
    }
    if (this.inputs.cameraTemperature) {
      const temp = state.camera?.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K;
      this.inputs.cameraTemperature.value = temp;
      this.updateValueLabel('cameraTemperature', temp, 'kelvin');
    }
    if (this.inputs.cameraTint) {
      const tint = state.camera?.tint ?? 0;
      this.inputs.cameraTint.value = tint;
      this.updateValueLabel('cameraTint', tint, 'integer');
    }
    if (this.inputs.cameraHighlights) {
      const highlights = state.camera?.highlights ?? 0;
      this.inputs.cameraHighlights.value = highlights;
      this.updateValueLabel('cameraHighlights', highlights, 'integer');
    }
    if (this.inputs.cameraShadows) {
      const shadows = state.camera?.shadows ?? 0;
      this.inputs.cameraShadows.value = shadows;
      this.updateValueLabel('cameraShadows', shadows, 'integer');
    }
    if (this.inputs.cameraSaturation) {
      const saturation = state.camera?.saturation ?? 1.0;
      this.inputs.cameraSaturation.value = saturation;
      this.updateValueLabel('cameraSaturation', saturation, 'decimal');
    }
    if (this.inputs.cameraClarity) {
      const clarity = state.camera?.clarity ?? 0;
      this.inputs.cameraClarity.value = clarity;
      this.updateValueLabel('cameraClarity', clarity, 'integer');
    }
    if (this.inputs.cameraFade) {
      const fade = state.camera?.fade ?? 0;
      this.inputs.cameraFade.value = fade;
      this.updateValueLabel('cameraFade', fade, 'integer');
    }
    if (this.inputs.cameraSharpness) {
      const sharpness = state.camera?.sharpness ?? 0;
      this.inputs.cameraSharpness.value = sharpness;
      this.updateValueLabel('cameraSharpness', sharpness, 'integer');
    }
    if (this.inputs.vignetteIntensity) {
      const vignette = state.camera?.vignette ?? 0;
      this.inputs.vignetteIntensity.value = vignette;
      this.updateValueLabel('vignetteIntensity', vignette, 'decimal');
    }
    if (this.inputs.vignetteColor) {
      const vignetteColor = state.camera?.vignetteColor ?? '#000000';
      this.inputs.vignetteColor.value = vignetteColor;
    }
    if (this.inputs.antiAliasing) {
      this.inputs.antiAliasing.value = state.antiAliasing ?? 'none';
    }
    if (this.inputs.toneMapping) {
      this.inputs.toneMapping.value = state.toneMapping ?? 'aces-filmic';
    }
  }

  syncControls(state) {
    this.meshControls.sync(state);
    this.studioControls.sync(state);
    this.renderControls.sync(state);
    this.applyBlockStates(state);
    // Update slider fills after syncing all controls
    // Use requestAnimationFrame to ensure DOM has updated before calculating fills
    requestAnimationFrame(() => {
      document.querySelectorAll('input[type="range"]').forEach((slider) => {
        this.helpers.updateSliderFill(slider);
      });
    });
  }

  setEffectControlsDisabled(ids, disabled) {
    this.setControlDisabled(ids, disabled);
  }

  setLightsRotationDisabled(disabled) {
    this.setControlDisabled('lightsRotation', disabled);
  }

  resetIndividualLight(lightId, defaults) {
    if (!defaults) return;
    this.stateStore.set(`lights.${lightId}`, defaults);
    Object.keys(defaults).forEach((property) => {
      this.eventBus.emit('lights:update', {
        lightId,
        property,
        value: defaults[property],
      });
    });
    this.syncUIFromState();
  }

  setLightsRotation(value) {
    if (!this.inputs.lightsRotation) return;
    const normalized = ((value % 360) + 360) % 360;
    this.inputs.lightsRotation.value = normalized;
    this.updateValueLabel('lightsRotation', normalized, 'angle');
  }

  setBlockMuted(blockKey, muted) {
    // First try to find a subsection (for merged blocks)
    const subsection = this.dom?.subsections?.[blockKey];
    if (subsection) {
      subsection.classList.toggle('is-muted', muted);
      return;
    }
    // Fall back to regular block
    const block = this.dom?.blocks?.[blockKey];
    if (!block) {
      // Silently fail - block might not exist yet or key might be wrong
      return;
    }
    // Only toggle the class - don't affect other blocks
    block.classList.toggle('is-muted', muted);
  }

  applyBlockStates(state) {
    // Use the latest state to ensure accuracy
    const currentState = state || this.stateStore.getState();
    
    // Apply muting based on current state - each block is independent
    // Each block is evaluated independently based on its own state property
    // This ensures only the correct block is muted when its toggle is changed
    
    // HDRI block - only muted if hdriEnabled is false
    this.setBlockMuted('hdri', !currentState.hdriEnabled);
    
    // Lens flare block - requires both HDRI and lens flare to be enabled
    const lensEnabled = !!currentState.hdriEnabled && !!currentState.lensFlare?.enabled;
    this.setBlockMuted('lens-flare', !lensEnabled);
    
    // Lights block - only muted if lightsEnabled is false
    this.setBlockMuted('lights', !currentState.lightsEnabled);
    
    // Podium block - only muted if groundSolid is false
    this.setBlockMuted('podium', !currentState.groundSolid);
    
    // Grid block - only muted if groundWire is false
    this.setBlockMuted('grid', !currentState.groundWire);
    
    // DOF block - only muted if dof.enabled is false
    this.setBlockMuted('dof', !currentState.dof?.enabled);
    
    // Bloom block - only muted if bloom.enabled is false
    this.setBlockMuted('bloom', !currentState.bloom?.enabled);

    // Lens dirt block - only muted if lens dirt disabled
    this.setBlockMuted('lens-dirt', !currentState.lensDirt?.enabled);
    
    // Grain block - only muted if grain.enabled is false
    this.setBlockMuted('grain', !currentState.grain?.enabled);
    
    // Aberration block - only muted if aberration.enabled is false
    this.setBlockMuted('aberration', !currentState.aberration?.enabled);
    
    // Fresnel block - only muted if fresnel.enabled is false
    this.setBlockMuted('fresnel', !currentState.fresnel?.enabled);
  }

  setLightColorControlsDisabled(disabled) {
    this.inputs.lightControls.forEach((control) => {
      const input = control.querySelector('input[type="color"]');
      if (!input) return;
      input.disabled = disabled;
      input.classList.toggle('is-disabled-handle', disabled);
    });
    // Disable all light sliders (global, master, and individual)
    this.setControlDisabled([
      'lightsRotation', // Global Rotate
      'lightsHeight',   // Global Height
      'lightsMaster',   // Global Strength
      // Individual light sliders (strength, height, rotate)
      'keyLightStrength',
      'keyLightHeight',
      'keyLightRotate',
      'fillLightStrength',
      'fillLightHeight',
      'fillLightRotate',
      'rimLightStrength',
      'rimLightHeight',
      'rimLightRotate',
      'ambientLightStrength',
    ], disabled);
  }

  updateLightSliderStates() {
    // Update slider states based on master switch and individual light enabled states
    const state = this.stateStore.getState();
    const masterEnabled = state.lightsEnabled;
    
    // Global sliders are enabled if master is on
    this.setControlDisabled('lightsRotation', !masterEnabled);
    this.setControlDisabled('lightsHeight', !masterEnabled);
    this.setControlDisabled('lightsMaster', !masterEnabled);
    
    // Individual light sliders are enabled only if master is on AND that specific light is enabled
    const lightIds = ['key', 'fill', 'rim', 'ambient'];
    lightIds.forEach((lightId) => {
      const lightEnabled = state.lights?.[lightId]?.enabled !== false;
      const slidersEnabled = masterEnabled && lightEnabled;
      
      // Apply muted state to subsection (for gray thumbs)
      const subsectionKey = lightId === 'ambient' ? 'ambientLight' : `${lightId}Light`;
      this.setBlockMuted(subsectionKey, !slidersEnabled);
      
      if (lightId === 'ambient') {
        // Ambient only has strength
        this.setControlDisabled('ambientLightStrength', !slidersEnabled);
      } else {
        // Directional lights have strength, height, rotate, and distance
        this.setControlDisabled(`${lightId}LightStrength`, !slidersEnabled);
        this.setControlDisabled(`${lightId}LightHeight`, !slidersEnabled);
        this.setControlDisabled(`${lightId}LightRotate`, !slidersEnabled);
      }
    });
    
    // Color controls are enabled if master is on
    this.inputs.lightControls.forEach((control) => {
      const input = control.querySelector('input[type="color"]');
      if (!input) return;
      input.disabled = !masterEnabled;
      input.classList.toggle('is-disabled-handle', !masterEnabled);
    });
  }

  bindHdriLightsRotation() {
    if (!this.dom.canvas) return;

    let isRotating = false;
    let startX = 0;
    let startHdriRotation = 0;
    let startLightsRotation = 0;
    // Rotation sensitivity: pixels to degrees (1 pixel = 0.5 degrees)
    const rotationSensitivity = 0.5;

    const handleMouseDown = (event) => {
      // Check for Alt (Windows/Linux) or Option (Mac) + left mouse button
      // Note: Option key on Mac triggers altKey, not metaKey
      if (event.altKey && event.button === 0) {
        event.preventDefault();
        isRotating = true;
        startX = event.clientX;
        startHdriRotation = this.stateStore.getState().hdriRotation ?? 0;
        startLightsRotation = this.stateStore.getState().lightsRotation ?? 0;
        this.dom.canvas.style.cursor = 'grab';
        // Lock camera orbit controls during HDRI rotation
        this.eventBus.emit('camera:lock-orbit');
      }
    };

    const handleMouseMove = (event) => {
      if (!isRotating) return;
      event.preventDefault();

      const deltaX = event.clientX - startX;
      const rotationDelta = deltaX * rotationSensitivity;

      // Calculate new rotations
      let newHdriRotation = startHdriRotation + rotationDelta;
      let newLightsRotation = startLightsRotation + rotationDelta;

      // Normalize to 0-360 range
      newHdriRotation = ((newHdriRotation % 360) + 360) % 360;
      newLightsRotation = ((newLightsRotation % 360) + 360) % 360;

      // Update state and emit events
      this.stateStore.set('hdriRotation', newHdriRotation);
      this.stateStore.set('lightsRotation', newLightsRotation);
      this.eventBus.emit('studio:hdri-rotation', newHdriRotation);
      this.eventBus.emit('lights:rotate', newLightsRotation);

      // Update UI controls
      if (this.inputs.hdriRotation) {
        this.inputs.hdriRotation.value = newHdriRotation;
        this.updateValueLabel('hdriRotation', newHdriRotation, 'angle');
      }
      if (this.inputs.lightsRotation) {
        this.inputs.lightsRotation.value = newLightsRotation;
        this.updateValueLabel('lightsRotation', newLightsRotation, 'angle');
      }
    };

    const handleMouseUp = (event) => {
      if (isRotating) {
        event.preventDefault();
        isRotating = false;
        this.dom.canvas.style.cursor = '';
        // Unlock camera orbit controls
        this.eventBus.emit('camera:unlock-orbit');
      }
    };

    // Add event listeners
    this.dom.canvas.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Also handle when mouse leaves canvas while dragging
    this.dom.canvas.addEventListener('mouseleave', () => {
      if (isRotating) {
        isRotating = false;
        this.dom.canvas.style.cursor = '';
        // Unlock camera orbit controls
        this.eventBus.emit('camera:unlock-orbit');
      }
    });
  }

  updateExposureDisplay(value) {
    if (!this.inputs.exposure) return;
    // Update slider value (as number) and label, even when slider is disabled
    this.inputs.exposure.value = value;
    this.updateValueLabel('exposure', parseFloat(value), 'decimal');
  }
}

