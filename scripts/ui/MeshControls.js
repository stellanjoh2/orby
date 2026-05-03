/**
 * MeshControls - Handles all mesh/object-related UI controls
 * Manages shading, materials, transforms, clay, wireframe, fresnel, and export settings
 */
import {
  DEFAULT_MATERIAL_ROUGHNESS,
  MATERIAL_EMISSIVE_SLIDER_MAX,
} from '../constants.js';

export class MeshControls {
  constructor(eventBus, stateStore, uiManager, helpers) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    this.helpers = helpers;
    // Track which Fresnel inputs are currently being interacted with
    this.fresnelInteracting = {
      radius: false,
      strength: false,
      color: false,
    };
    // Track which material inputs are currently being interacted with
    this.materialInteracting = {
      metalness: false,
      roughness: false,
      brightness: false,
      emissive: false,
    };
    this.svgDepthDebounceTimer = null;
    this.svgNormalDebounceTimer = null;
    this.svgColorDebounceTimers = new Map();
  }

  bind() {
    this.eventBus.on('ui:advanced-alpha-visible', (payload) => {
      const visible = !!(payload?.visible ?? payload);
      const wrap = this.ui.inputs.advancedAlphaControls;
      if (wrap) wrap.hidden = !visible;
      this.refreshAdvancedGlassControls(this.stateStore.getState());
    });
    this.eventBus.on('ui:advanced-glass-visible', (payload) => {
      const visible = !!(payload?.visible ?? payload);
      const wrap = this.ui.inputs.advancedGlassControls;
      if (wrap) wrap.hidden = !visible;
      this.refreshAdvancedGlassControls(this.stateStore.getState());
    });

    this._pendingFbxMapSlot = null;
    document.querySelectorAll('[data-fbx-map-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._pendingFbxMapSlot = btn.getAttribute('data-fbx-map-slot');
        this.ui.inputs.fbxMapFileInput?.click();
      });
    });
    this.ui.inputs.fbxMapFileInput?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      const slot = this._pendingFbxMapSlot;
      event.target.value = '';
      if (!file || !slot) return;
      this.eventBus.emit('mesh:fbx-map-slot', { slot, file });
    });
    this.eventBus.on('scene:fbx-map-applied', (payload) => {
      const slot = payload?.slot;
      const name = typeof payload?.name === 'string' ? payload.name : '';
      const label = document.querySelector(`[data-fbx-map-filename="${slot}"]`);
      if (label) {
        const short = name.length > 30 ? `${name.slice(0, 28)}…` : name;
        label.textContent = short || '—';
        label.title = name;
      }
    });
    this.eventBus.on('scene:fbx-map-slots-reset', () => {
      document.querySelectorAll('[data-fbx-map-filename]').forEach((el) => {
        el.textContent = '—';
        el.title = '';
      });
    });

    this.ui.inputs.fbxMapInvertNormalY?.addEventListener('change', (event) => {
      this.eventBus.emit('mesh:fbx-invert-normal-y', !!event.target.checked);
    });

    this.ui.inputs.fbxMapPbrUvChannel?.addEventListener('change', (event) => {
      const raw = parseInt(event?.target?.value, 10);
      const channel = raw === 1 ? 1 : 0;
      this.eventBus.emit('mesh:fbx-pbr-uv-channel', channel);
    });

    // Shading mode
    this.ui.inputs.shading.forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) {
          this.stateStore.set('shading', input.value);
          this.eventBus.emit('mesh:shading', input.value);
        }
      });
    });

    // Material controls
    this.ui.inputs.materialBrightness?.addEventListener('input', (event) => {
      const value = this.helpers.applySnapToCenter(event.target, 0, 5, 1.0);
      this.helpers.updateValueLabel('materialBrightness', value, 'decimal');
      this.stateStore.set('material.brightness', value);
      this.eventBus.emit('mesh:material-brightness', value);
    });
    if (this.ui.inputs.materialBrightness) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.materialBrightness);

    // Global mouseup handler to reset interaction flags (in case mouse is released outside input)
    // Note: This will be combined with the Fresnel handler below
    
    this.ui.inputs.materialMetalness?.addEventListener('mousedown', () => {
      this.materialInteracting.metalness = true;
    });
    this.ui.inputs.materialMetalness?.addEventListener('mouseup', () => {
      this.materialInteracting.metalness = false;
    });
    this.ui.inputs.materialMetalness?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      const clampedValue = isNaN(value) ? 0.0 : Math.max(0, Math.min(1, value));
      this.helpers.updateValueLabel('materialMetalness', clampedValue, 'decimal');
      this.stateStore.set('material.metalness', clampedValue);
      this.eventBus.emit('mesh:material-metalness', clampedValue);
    });
    if (this.ui.inputs.materialMetalness) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.materialMetalness);

    this.ui.inputs.materialRoughness?.addEventListener('mousedown', () => {
      this.materialInteracting.roughness = true;
    });
    this.ui.inputs.materialRoughness?.addEventListener('mouseup', () => {
      this.materialInteracting.roughness = false;
    });
    this.ui.inputs.materialRoughness?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      const clampedValue = isNaN(value) ? 0.5 : Math.max(0, Math.min(1, value));
      this.helpers.updateValueLabel('materialRoughness', clampedValue, 'decimal');
      this.stateStore.set('material.roughness', clampedValue);
      this.eventBus.emit('mesh:material-roughness', clampedValue);
    });
    if (this.ui.inputs.materialRoughness) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.materialRoughness);

    this.ui.inputs.materialEmissive?.addEventListener('mousedown', () => {
      this.materialInteracting.emissive = true;
    });
    this.ui.inputs.materialEmissive?.addEventListener('mouseup', () => {
      this.materialInteracting.emissive = false;
    });
    this.ui.inputs.materialEmissive?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      const clampedValue = isNaN(value)
        ? 0
        : Math.max(0, Math.min(MATERIAL_EMISSIVE_SLIDER_MAX, value));
      this.helpers.updateValueLabel('materialEmissive', clampedValue, 'decimal');
      this.stateStore.set('material.emissive', clampedValue);
      this.eventBus.emit('mesh:material-emissive', clampedValue);
    });
    if (this.ui.inputs.materialEmissive) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.materialEmissive);
    }

    this.ui.inputs.svgExtrudeDepth?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      const clampedValue = Number.isFinite(value) ? Math.max(0.01, Math.min(2.0, value)) : 0.2;
      this.helpers.updateValueLabel('svgExtrudeDepth', clampedValue, 'decimal');
      this.stateStore.set('svgExtrude.depth', clampedValue);
      if (this.svgDepthDebounceTimer) {
        clearTimeout(this.svgDepthDebounceTimer);
      }
      this.svgDepthDebounceTimer = setTimeout(() => {
        this.eventBus.emit('mesh:svg-extrude-depth', clampedValue);
      }, 45);
    });
    if (this.ui.inputs.svgExtrudeDepth) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.svgExtrudeDepth);
    this.ui.inputs.svgExtrudeNormalAngle?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      const clampedValue = Number.isFinite(value) ? Math.max(0, Math.min(180, value)) : 45;
      this.helpers.updateValueLabel('svgExtrudeNormalAngle', clampedValue, 'angle');
      this.stateStore.set('svgExtrude.normalAngle', clampedValue);
      if (this.svgNormalDebounceTimer) {
        clearTimeout(this.svgNormalDebounceTimer);
      }
      this.svgNormalDebounceTimer = setTimeout(() => {
        this.eventBus.emit('mesh:svg-extrude-normal-angle', clampedValue);
      }, 45);
    });
    if (this.ui.inputs.svgExtrudeNormalAngle) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.svgExtrudeNormalAngle);
    this.ui.inputs.svgExtrudeSurfacePreset?.addEventListener('change', (event) => {
      const preset = event?.target?.value || 'none';
      const scale = Number(this.stateStore.getState().svgExtrude?.surfaceScale ?? 1) || 1.0;
      this.stateStore.set('svgExtrude.surfacePreset', preset);
      this.eventBus.emit('mesh:svg-extrude-surface', { preset, scale });
    });
    this.ui.inputs.svgExtrudeSurfaceScale?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      const scale = Number.isFinite(value) ? Math.max(0.2, Math.min(10, value)) : 1.0;
      const preset = this.stateStore.getState().svgExtrude?.surfacePreset ?? 'none';
      this.helpers.updateValueLabel('svgExtrudeSurfaceScale', scale, 'decimal');
      this.stateStore.set('svgExtrude.surfaceScale', scale);
      this.eventBus.emit('mesh:svg-extrude-surface', { preset, scale });
    });
    if (this.ui.inputs.svgExtrudeSurfaceScale) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.svgExtrudeSurfaceScale);
    }
    this.ui.inputs.svgExtrudeFlipDirection?.addEventListener('change', (event) => {
      const enabled = !!event.target.checked;
      this.stateStore.set('svgExtrude.flipDirection', enabled);
      this.eventBus.emit('mesh:svg-extrude-flip-direction', enabled);
    });
    this.ui.inputs.reverseNormals?.addEventListener('change', (event) => {
      const enabled = !!event.target.checked;
      this.stateStore.set('advanced.reverseNormals', enabled);
      this.eventBus.emit('mesh:reverse-normals', enabled);
    });
    this.ui.inputs.transparencyFix?.addEventListener('change', (event) => {
      const value = event.target.value || 'default';
      const allowed = ['default', 'opaqueBlend', 'frontFace', 'opaqueAndFrontFace'];
      const mode = allowed.includes(value) ? value : 'default';
      this.stateStore.set('advanced.transparencyFix', mode);
      this.eventBus.emit('mesh:transparency-fix');
      this.refreshAdvancedGlassControls(this.stateStore.getState());
    });
    this.ui.inputs.blendSortingMitigation?.addEventListener('change', (event) => {
      const enabled = !!event.target.checked;
      this.stateStore.set('advanced.blendSortingMitigation', enabled);
      this.eventBus.emit('mesh:transparency-fix');
    });
    this.ui.inputs.flipGlassNormalMapY?.addEventListener('change', (event) => {
      this.stateStore.set('advanced.flipGlassNormalMapY', !!event.target.checked);
      this.eventBus.emit('mesh:glass-appearance');
    });
    this.ui.inputs.glassFrontFacesOnly?.addEventListener('change', (event) => {
      this.stateStore.set('advanced.glassFrontFacesOnly', !!event.target.checked);
      this.eventBus.emit('mesh:glass-appearance');
    });

    this.ui.inputs.glassOpacity?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0.02, value)) : 0.45;
      this.helpers.updateValueLabel('glassOpacity', clamped, 'decimal');
      this.stateStore.set('advanced.glassOpacity', clamped);
      this.eventBus.emit('mesh:glass-appearance');
    });
    if (this.ui.inputs.glassOpacity) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.glassOpacity);
    }

    this.ui.inputs.glassReflection?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      const clamped = Number.isFinite(value) ? Math.min(4, Math.max(0, value)) : 2;
      this.helpers.updateValueLabel('glassReflection', clamped, 'decimal');
      this.stateStore.set('advanced.glassReflection', clamped);
      this.eventBus.emit('mesh:glass-appearance');
    });
    if (this.ui.inputs.glassReflection) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.glassReflection);
    }
    this.helpers.bindColorInput('glassTint', 'advanced.glassTint', 'mesh:glass-appearance');

    this.ui.inputs.glassBody?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
      this.helpers.updateValueLabel('glassBody', clamped, 'decimal');
      this.stateStore.set('advanced.glassBody', clamped);
      this.eventBus.emit('mesh:glass-appearance');
    });
    if (this.ui.inputs.glassBody) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.glassBody);
    }
    this.ui.inputs.svgExtrudeColorOverride?.addEventListener('change', (event) => {
      const enabled = !!event.target.checked;
      const color = this.ui.inputs.svgExtrudeColor?.value || '#7ed321';
      this.stateStore.set('svgExtrude.colorOverride', enabled);
      this.eventBus.emit('mesh:svg-extrude-color-override', { enabled, color });
    });
    this.ui.inputs.svgExtrudeColor?.addEventListener('input', (event) => {
      const color = event.target.value;
      const enabled = !!(this.stateStore.getState().svgExtrude?.colorOverride);
      this.stateStore.set('svgExtrude.overrideColor', color);
      this.eventBus.emit('mesh:svg-extrude-color-override', { enabled, color });
    });
    this.ui.inputs.svgExtrudeColorDepths?.addEventListener('input', (event) => {
      const input = event.target;
      if (!input || input.tagName !== 'INPUT' || input.type !== 'range') return;
      const color = input.dataset.color;
      const kind = input.dataset.kind || 'depth';
      if (!color) return;
      const value = parseFloat(input.value);
      const clampedValue = kind === 'offset'
        ? (Number.isFinite(value) ? Math.max(-1.0, Math.min(1.0, value)) : 0)
        : (Number.isFinite(value) ? Math.max(0.01, Math.min(1.0, value)) : 0.2);
      const sliderLine = input.closest('.slider-line');
      const output = sliderLine?.querySelector('.value');
      if (output) {
        output.textContent = this.ui.formatSliderValue(clampedValue, 'decimal');
      }
      if (kind === 'offset') {
        const currentOffsets = {
          ...(this.stateStore.getState().svgExtrude?.colorOffsets || {}),
          [color]: clampedValue,
        };
        this.stateStore.set('svgExtrude.colorOffsets', currentOffsets);
      } else {
        const currentDepths = {
          ...(this.stateStore.getState().svgExtrude?.colorDepths || {}),
          [color]: clampedValue,
        };
        this.stateStore.set('svgExtrude.colorDepths', currentDepths);
      }
      const timerKey = `${kind}:${color}`;
      const existingTimer = this.svgColorDebounceTimers.get(timerKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      const timer = setTimeout(() => {
        if (kind === 'offset') {
          this.eventBus.emit('mesh:svg-extrude-color-offset', { color, offset: clampedValue });
        } else {
          this.eventBus.emit('mesh:svg-extrude-color-depth', { color, depth: clampedValue });
        }
        this.svgColorDebounceTimers.delete(timerKey);
      }, 50);
      this.svgColorDebounceTimers.set(timerKey, timer);
    });

    // Transform controls
    this.ui.inputs.scale.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('scale', value, 'multiplier');
      this.stateStore.set('scale', value);
      this.eventBus.emit('mesh:scale', value);
    });
    this.helpers.enableSliderKeyboardStepping(this.ui.inputs.scale);

    this.ui.inputs.xOffset?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('xOffset', value, 'distance');
      this.stateStore.set('xOffset', value);
      this.eventBus.emit('mesh:xOffset', value);
    });
    if (this.ui.inputs.xOffset) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.xOffset);

    this.ui.inputs.yOffset?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('yOffset', value, 'distance');
      this.stateStore.set('yOffset', value);
      this.eventBus.emit('mesh:yOffset', value);
    });
    if (this.ui.inputs.yOffset) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.yOffset);

    this.ui.inputs.zOffset?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('zOffset', value, 'distance');
      this.stateStore.set('zOffset', value);
      this.eventBus.emit('mesh:zOffset', value);
    });
    if (this.ui.inputs.zOffset) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.zOffset);

    this.ui.inputs.rotationX?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('rotationX', value, 'angle');
      this.stateStore.set('rotationX', value);
      this.eventBus.emit('mesh:rotationX', value);
    });
    if (this.ui.inputs.rotationX) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.rotationX);

    this.ui.inputs.rotationY?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('rotationY', value, 'angle');
      this.stateStore.set('rotationY', value);
      this.eventBus.emit('mesh:rotationY', value);
    });
    if (this.ui.inputs.rotationY) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.rotationY);

    this.ui.inputs.rotationZ?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('rotationZ', value, 'angle');
      this.stateStore.set('rotationZ', value);
      this.eventBus.emit('mesh:rotationZ', value);
    });
    if (this.ui.inputs.rotationZ) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.rotationZ);

    // Auto-rotate
    this.ui.inputs.autoRotate.forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) {
          const speed = parseFloat(input.value);
          this.stateStore.set('autoRotate', speed);
          this.eventBus.emit('mesh:auto-rotate', speed);
        }
      });
    });

    // Clay controls
    this.helpers.bindColorInput('clayColor', 'clay.color', 'mesh:clay-color');
    this.ui.inputs.clayNormalMap?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('clay.normalMap', enabled);
      this.eventBus.emit('mesh:clay-normal-map', enabled);
    });

    // Wireframe controls
    this.ui.inputs.wireframeAlwaysOn?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('wireframe.alwaysOn', enabled);
      this.eventBus.emit('mesh:wireframe-always-on', enabled);
    });
    this.helpers.bindColorInput('wireframeColor', 'wireframe.color', 'mesh:wireframe-color');
    this.ui.inputs.wireframeOnlyVisibleFaces?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('wireframe.onlyVisibleFaces', enabled);
      this.eventBus.emit('mesh:wireframe-only-visible-faces', enabled);
    });
    this.ui.inputs.wireframeHideMesh?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('wireframe.hideMesh', enabled);
      this.eventBus.emit('mesh:wireframe-hide-mesh', enabled);
    });

    // Fresnel (moved from bindRenderControls since it's now in Object tab)
    const emitFresnel = () => {
      const state = this.stateStore.getState();
      // Read fresnel state directly, ensuring we get the latest values
      const fresnel = state.fresnel || {};
      this.eventBus.emit('render:fresnel', {
        enabled: fresnel.enabled !== undefined ? fresnel.enabled : false,
        color: fresnel.color || '#ffffff',
        radius: fresnel.radius !== undefined ? fresnel.radius : 0.5,
        strength: fresnel.strength !== undefined ? fresnel.strength : 1.0,
      });
    };
    
    // Add defensive checks to ensure inputs exist before binding
    if (this.ui.inputs.toggleFresnel) {
      this.ui.inputs.toggleFresnel.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        this.stateStore.set('fresnel.enabled', enabled);
        this.ui.setEffectControlsDisabled(
          ['fresnelColor', 'fresnelRadius', 'fresnelStrength'],
          !enabled,
        );
        emitFresnel();
      });
    }
    
    // Global mouseup handler to reset interaction flags (in case mouse is released outside input)
    const handleGlobalMouseUp = () => {
      // Reset material interaction flags
      this.materialInteracting.metalness = false;
      this.materialInteracting.roughness = false;
      this.materialInteracting.brightness = false;
      this.materialInteracting.emissive = false;
      // Reset Fresnel interaction flags
      this.fresnelInteracting.color = false;
      this.fresnelInteracting.radius = false;
      this.fresnelInteracting.strength = false;
    };
    document.addEventListener('mouseup', handleGlobalMouseUp);
    
    if (this.ui.inputs.fresnelColor) {
      this.ui.inputs.fresnelColor.addEventListener('mousedown', () => {
        this.fresnelInteracting.color = true;
      });
      this.ui.inputs.fresnelColor.addEventListener('mouseup', () => {
        this.fresnelInteracting.color = false;
      });
      this.ui.inputs.fresnelColor.addEventListener('input', (event) => {
        const value = event.target.value;
        this.stateStore.set('fresnel.color', value);
        emitFresnel();
      });
    }
    
    if (this.ui.inputs.fresnelRadius) {
      this.ui.inputs.fresnelRadius.addEventListener('mousedown', () => {
        this.fresnelInteracting.radius = true;
      });
      this.ui.inputs.fresnelRadius.addEventListener('mouseup', () => {
        this.fresnelInteracting.radius = false;
      });
      this.ui.inputs.fresnelRadius.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        if (isNaN(value)) return; // Guard against invalid values
        this.helpers.updateValueLabel('fresnelRadius', value, 'decimal');
        this.stateStore.set('fresnel.radius', value);
        emitFresnel();
      });
    }
    
    if (this.ui.inputs.fresnelStrength) {
      this.ui.inputs.fresnelStrength.addEventListener('mousedown', () => {
        this.fresnelInteracting.strength = true;
      });
      this.ui.inputs.fresnelStrength.addEventListener('mouseup', () => {
        this.fresnelInteracting.strength = false;
      });
      this.ui.inputs.fresnelStrength.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        if (isNaN(value)) return; // Guard against invalid values
        this.helpers.updateValueLabel('fresnelStrength', value, 'decimal');
        this.stateStore.set('fresnel.strength', value);
        emitFresnel();
      });
    }

    // Export controls
    document.querySelectorAll('[data-export-transparent]').forEach((button) => {
      button.addEventListener('click', () => {
        const transparent = button.dataset.exportTransparent === 'true';
        this.ui.exportSettings.transparent = transparent;
        document.querySelectorAll('[data-export-transparent]').forEach((btn) => {
          btn.classList.toggle('active', btn === button);
        });
      });
    });

    document.querySelectorAll('[data-export-size]').forEach((button) => {
      button.addEventListener('click', () => {
        const size = parseInt(button.dataset.exportSize, 10);
        this.ui.exportSettings.size = size;
        document.querySelectorAll('[data-export-size]').forEach((btn) => {
          btn.classList.toggle('active', btn === button);
        });
      });
    });
  }

  refreshAdvancedGlassControls(state) {
    const alphaWrap = this.ui.inputs.advancedAlphaControls;
    const alphaSectionVisible = !!(alphaWrap && !alphaWrap.hidden);
    const wrap = this.ui.inputs.advancedGlassControls;
    const visible = alphaSectionVisible && !!(wrap && !wrap.hidden);
    const mode = state.advanced?.transparencyFix ?? 'default';
    const opacityEnabled = visible && mode === 'default';
    /** Alpha-hash toggle lives next to Alpha dropdown, not under glass controls — do not require glass section visible. */
    const blendMitigationEnabled = alphaSectionVisible && mode === 'default';
    if (this.ui.inputs.blendSortingMitigation) {
      this.ui.setControlDisabled('blendSortingMitigation', !blendMitigationEnabled);
    }
    if (this.ui.inputs.flipGlassNormalMapY) {
      this.ui.setControlDisabled('flipGlassNormalMapY', !blendMitigationEnabled);
    }
    if (this.ui.inputs.glassFrontFacesOnly) {
      this.ui.setControlDisabled('glassFrontFacesOnly', !blendMitigationEnabled);
    }
    if (this.ui.inputs.glassOpacity) {
      this.ui.setControlDisabled('glassOpacity', !opacityEnabled);
    }
    if (this.ui.inputs.glassReflection) {
      this.ui.setControlDisabled('glassReflection', !visible);
    }
    if (this.ui.inputs.glassTint) {
      this.ui.setControlDisabled('glassTint', !opacityEnabled);
    }
    if (this.ui.inputs.glassBody) {
      this.ui.setControlDisabled('glassBody', !opacityEnabled);
    }
  }

  sync(state) {
    this.ui.inputs.scale.value = state.scale;
    this.helpers.updateValueLabel('scale', state.scale, 'multiplier');
    this.ui.inputs.yOffset.value = state.yOffset;
    this.helpers.updateValueLabel('yOffset', state.yOffset, 'distance');
    if (this.ui.inputs.rotationX) {
      this.ui.inputs.rotationX.value = state.rotationX ?? 0;
      this.helpers.updateValueLabel('rotationX', state.rotationX ?? 0, 'angle');
    }
    if (this.ui.inputs.rotationY) {
      this.ui.inputs.rotationY.value = state.rotationY ?? 0;
      this.helpers.updateValueLabel('rotationY', state.rotationY ?? 0, 'angle');
    }
    if (this.ui.inputs.rotationZ) {
      this.ui.inputs.rotationZ.value = state.rotationZ ?? 0;
      this.helpers.updateValueLabel('rotationZ', state.rotationZ ?? 0, 'angle');
    }
    if (this.ui.inputs.materialBrightness) {
      const brightness = state.material?.brightness ?? 1.0;
      this.ui.inputs.materialBrightness.value = brightness;
      this.helpers.updateValueLabel('materialBrightness', brightness, 'decimal');
    }
    if (this.ui.inputs.materialMetalness) {
      // Only update if user is not actively interacting
      const isInteracting = this.materialInteracting?.metalness || 
                           document.activeElement === this.ui.inputs.materialMetalness;
      if (!isInteracting) {
        const metalness = state.material?.metalness ?? 0.0;
        this.ui.inputs.materialMetalness.value = metalness;
        this.helpers.updateValueLabel('materialMetalness', metalness, 'decimal');
      }
    }
    if (this.ui.inputs.materialRoughness) {
      // Only update if user is not actively interacting
      const isInteracting = this.materialInteracting?.roughness || 
                           document.activeElement === this.ui.inputs.materialRoughness;
      if (!isInteracting) {
        const roughness = state.material?.roughness ?? DEFAULT_MATERIAL_ROUGHNESS;
        this.ui.inputs.materialRoughness.value = roughness;
        this.helpers.updateValueLabel('materialRoughness', roughness, 'decimal');
      }
    }
    if (this.ui.inputs.materialEmissive) {
      const isInteracting =
        this.materialInteracting?.emissive ||
        document.activeElement === this.ui.inputs.materialEmissive;
      if (!isInteracting) {
        const emissive = state.material?.emissive ?? 0.0;
        this.ui.inputs.materialEmissive.value = emissive;
        this.helpers.updateValueLabel('materialEmissive', emissive, 'decimal');
      }
    }
    if (this.ui.inputs.svgExtrudeDepth) {
      const depth = state.svgExtrude?.depth ?? 0.2;
      this.ui.inputs.svgExtrudeDepth.value = depth;
      this.helpers.updateValueLabel('svgExtrudeDepth', depth, 'decimal');
      this.ui.setControlDisabled('svgExtrudeDepth', !state.svgExtrude?.enabled);
    }
    if (this.ui.inputs.svgExtrudeNormalAngle) {
      const enabled = !!state.svgExtrude?.enabled;
      const normalAngle = state.svgExtrude?.normalAngle ?? 45;
      this.ui.inputs.svgExtrudeNormalAngle.value = normalAngle;
      this.helpers.updateValueLabel('svgExtrudeNormalAngle', normalAngle, 'angle');
      this.ui.setControlDisabled('svgExtrudeNormalAngle', !enabled);
    }
    if (this.ui.inputs.svgExtrudeSurfacePreset) {
      const enabled = !!state.svgExtrude?.enabled;
      const preset = state.svgExtrude?.surfacePreset ?? 'none';
      this.ui.inputs.svgExtrudeSurfacePreset.value = preset;
      this.ui.setControlDisabled('svgExtrudeSurfacePreset', !enabled);
    }
    if (this.ui.inputs.svgExtrudeSurfaceScale) {
      const enabled = !!state.svgExtrude?.enabled;
      const raw = Number(state.svgExtrude?.surfaceScale ?? 1) || 1.0;
      const scale = Math.max(0.2, Math.min(10, raw));
      this.ui.inputs.svgExtrudeSurfaceScale.value = scale;
      this.helpers.updateValueLabel('svgExtrudeSurfaceScale', scale, 'decimal');
      this.ui.setControlDisabled('svgExtrudeSurfaceScale', !enabled);
    }
    if (this.ui.inputs.svgExtrudeFlipDirection) {
      const enabled = !!state.svgExtrude?.enabled;
      this.ui.inputs.svgExtrudeFlipDirection.checked = !!state.svgExtrude?.flipDirection;
      this.ui.setControlDisabled('svgExtrudeFlipDirection', !enabled);
    }
    if (this.ui.inputs.reverseNormals) {
      this.ui.inputs.reverseNormals.checked = !!state.advanced?.reverseNormals;
    }
    if (this.ui.inputs.fbxMapInvertNormalY) {
      const fbxOn = !!state.fbxMapSlots?.enabled;
      this.ui.inputs.fbxMapInvertNormalY.checked = !!state.fbxMapSlots?.invertNormalY;
      this.ui.setControlDisabled('fbxMapInvertNormalY', !fbxOn);
    }
    if (this.ui.inputs.fbxMapPbrUvChannel) {
      const fbxOn = !!state.fbxMapSlots?.enabled;
      this.ui.inputs.fbxMapPbrUvChannel.value = state.fbxMapSlots?.pbrUvChannel === 1 ? '1' : '0';
      this.ui.setControlDisabled('fbxMapPbrUvChannel', !fbxOn);
    }
    if (this.ui.inputs.transparencyFix) {
      const tf = state.advanced?.transparencyFix ?? 'default';
      const allowed = ['default', 'opaqueBlend', 'frontFace', 'opaqueAndFrontFace'];
      this.ui.inputs.transparencyFix.value = allowed.includes(tf) ? tf : 'default';
    }
    if (this.ui.inputs.blendSortingMitigation) {
      /** Default-on when key missing (matches MaterialController `!== false`). */
      this.ui.inputs.blendSortingMitigation.checked =
        state.advanced?.blendSortingMitigation !== false;
    }
    if (this.ui.inputs.flipGlassNormalMapY) {
      this.ui.inputs.flipGlassNormalMapY.checked = !!state.advanced?.flipGlassNormalMapY;
    }
    if (this.ui.inputs.glassFrontFacesOnly) {
      this.ui.inputs.glassFrontFacesOnly.checked = !!state.advanced?.glassFrontFacesOnly;
    }
    if (this.ui.inputs.glassOpacity) {
      const raw = Number(state.advanced?.glassOpacity ?? 0.45);
      const o = Number.isFinite(raw) ? Math.min(1, Math.max(0.02, raw)) : 0.45;
      const active = document.activeElement === this.ui.inputs.glassOpacity;
      if (!active) {
        this.ui.inputs.glassOpacity.value = o;
        this.helpers.updateValueLabel('glassOpacity', o, 'decimal');
      }
    }
    if (this.ui.inputs.glassReflection) {
      const raw = Number(state.advanced?.glassReflection ?? 2);
      const r = Number.isFinite(raw) ? Math.min(4, Math.max(0, raw)) : 2;
      const active = document.activeElement === this.ui.inputs.glassReflection;
      if (!active) {
        this.ui.inputs.glassReflection.value = r;
        this.helpers.updateValueLabel('glassReflection', r, 'decimal');
      }
    }
    if (this.ui.inputs.glassTint) {
      const t = state.advanced?.glassTint ?? '#ffffff';
      const valid = typeof t === 'string' && /^#[0-9A-Fa-f]{6}$/.test(t) ? t : '#ffffff';
      if (document.activeElement !== this.ui.inputs.glassTint) {
        this.ui.inputs.glassTint.value = valid;
      }
    }
    if (this.ui.inputs.glassBody) {
      const raw = Number(state.advanced?.glassBody ?? 0);
      const b = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
      const active = document.activeElement === this.ui.inputs.glassBody;
      if (!active) {
        this.ui.inputs.glassBody.value = b;
        this.helpers.updateValueLabel('glassBody', b, 'decimal');
      }
    }
    this.refreshAdvancedGlassControls(state);
    if (this.ui.inputs.svgExtrudeColorOverride) {
      const enabled = !!state.svgExtrude?.enabled;
      const overrideEnabled = !!state.svgExtrude?.colorOverride;
      this.ui.inputs.svgExtrudeColorOverride.checked = overrideEnabled;
      this.ui.setControlDisabled('svgExtrudeColorOverride', !enabled);
    }
    if (this.ui.inputs.svgExtrudeColor) {
      const enabled = !!state.svgExtrude?.enabled;
      const overrideEnabled = !!state.svgExtrude?.colorOverride;
      const color = state.svgExtrude?.overrideColor ?? '#7ed321';
      this.ui.inputs.svgExtrudeColor.value = color;
      this.ui.setControlDisabled('svgExtrudeColor', !(enabled && overrideEnabled));
    }
    this.renderSvgColorDepthControls(state);
    this.ui.inputs.clayColor.value = state.clay.color;
    if (this.ui.inputs.clayNormalMap) {
      this.ui.inputs.clayNormalMap.checked = state.clay.normalMap !== false;
    }
    if (state.wireframe) {
      if (this.ui.inputs.wireframeColor) {
        this.ui.inputs.wireframeColor.value = state.wireframe.color;
      }
      if (this.ui.inputs.wireframeAlwaysOn) {
        this.ui.inputs.wireframeAlwaysOn.checked = !!state.wireframe.alwaysOn;
      }
      if (this.ui.inputs.wireframeOnlyVisibleFaces) {
        this.ui.inputs.wireframeOnlyVisibleFaces.checked = !!state.wireframe.onlyVisibleFaces;
      }
      if (this.ui.inputs.wireframeHideMesh) {
        this.ui.inputs.wireframeHideMesh.checked = !!state.wireframe.hideMesh;
      }
    }
    
    // Radio buttons
    this.ui.inputs.autoRotate.forEach((input) => {
      input.checked = parseFloat(input.value) === state.autoRotate;
    });
    this.ui.inputs.shading.forEach((input) => {
      input.checked = input.value === state.shading;
    });

    // Wireframe mode now uses the overlay system, so overlay controls are always enabled
    // Users can adjust "Always on" and "Only visible faces" even when in Wireframe mode
  }

  renderSvgColorDepthControls(state) {
    const container = this.ui.inputs.svgExtrudeColorDepths;
    if (!container) return;
    const enabled = !!state.svgExtrude?.enabled;
    const palette = Array.isArray(state.svgExtrude?.availableColors)
      ? state.svgExtrude.availableColors
      : [];
    const overrides = state.svgExtrude?.colorDepths || {};
    const offsets = state.svgExtrude?.colorOffsets || {};
    const globalDepth = Number(state.svgExtrude?.depth ?? 0.2);

    if (!enabled) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    if (palette.length === 0) {
      container.innerHTML = '<div class="svg-extrude-note">Per-color controls appear after importing an SVG with fill colors.</div>';
      container.style.display = '';
      return;
    }

    if (palette.length === 1) {
      container.innerHTML = '<div class="svg-extrude-note">Only one fill color detected, so per-color controls are hidden.</div>';
      container.style.display = '';
      return;
    }
    container.style.display = '';

    const rows = palette
      .map((color, index) => {
        const depth = Number.isFinite(Number(overrides[color]))
          ? Number(overrides[color])
          : globalDepth;
        const safeDepth = Math.max(0.01, Math.min(1.0, depth));
        const offset = Number.isFinite(Number(offsets[color])) ? Number(offsets[color]) : 0;
        const safeOffset = Math.max(-1.0, Math.min(1.0, offset));
        return `
<label class="slider-line">
  <span>
    <span class="color-chip" style="background:${color}; pointer-events:none;" title="${color.toUpperCase()}"></span>
    Depth ${index + 1}
  </span>
  <input type="range" min="0.01" max="1" step="0.005" value="${safeDepth.toFixed(2)}" data-color="${color}" data-kind="depth" aria-label="Per-color depth ${index + 1} (${color.toUpperCase()})" title="Depth for ${color.toUpperCase()}" />
  <span class="value">${this.ui.formatSliderValue(safeDepth, 'decimal')}</span>
</label>
<label class="slider-line">
  <span>
    <span class="color-chip" style="background:${color}; pointer-events:none; opacity:0.6;" title="${color.toUpperCase()}"></span>
    Position ${index + 1}
  </span>
  <input type="range" min="-1" max="1" step="0.005" value="${safeOffset.toFixed(2)}" data-color="${color}" data-kind="offset" aria-label="Per-color position ${index + 1} (${color.toUpperCase()})" title="Position for ${color.toUpperCase()}" />
  <span class="value">${this.ui.formatSliderValue(safeOffset, 'decimal')}</span>
</label>`;
      })
      .join('');

    container.innerHTML = rows;
    const shouldDisable = !enabled;
    container.querySelectorAll('input[type="range"]').forEach((input) => {
      input.disabled = shouldDisable;
      input.classList.toggle('is-disabled-handle', shouldDisable);
    });
  }
}

