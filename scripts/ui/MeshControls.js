/**
 * MeshControls - Handles all mesh/object-related UI controls
 * Manages shading, materials, transforms, clay, wireframe, fresnel, and export settings
 */
import { UIHelpers } from './UIHelpers.js';

export class MeshControls {
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    this.helpers = new UIHelpers(eventBus, stateStore, uiManager);
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
  }

  bind() {
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
      const value = this.helpers.applySnapToCenter(event.target, 0, 3, 1.0);
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
      }, 60);
    });
    if (this.ui.inputs.svgExtrudeDepth) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.svgExtrudeDepth);
    this.ui.inputs.svgExtrudeBevelWidth?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      const clampedValue = Number.isFinite(value) ? Math.max(0, Math.min(0.15, value)) : 0.02;
      this.helpers.updateValueLabel('svgExtrudeBevelWidth', clampedValue, 'decimal', 3);
      this.stateStore.set('svgExtrude.bevelWidth', clampedValue);
      this.eventBus.emit('mesh:svg-extrude-bevel-width', clampedValue);
    });
    if (this.ui.inputs.svgExtrudeBevelWidth) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.svgExtrudeBevelWidth);
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
      }, 60);
    });
    if (this.ui.inputs.svgExtrudeNormalAngle) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.svgExtrudeNormalAngle);
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
        const roughness = state.material?.roughness ?? 0.8;
        this.ui.inputs.materialRoughness.value = roughness;
        this.helpers.updateValueLabel('materialRoughness', roughness, 'decimal');
      }
    }
    if (this.ui.inputs.materialEmissive) {
      const emissive = state.material?.emissive ?? 0.0;
      this.ui.inputs.materialEmissive.value = emissive;
      this.helpers.updateValueLabel('materialEmissive', emissive, 'decimal');
    }
    if (this.ui.inputs.svgExtrudeDepth) {
      const depth = state.svgExtrude?.depth ?? 0.2;
      this.ui.inputs.svgExtrudeDepth.value = depth;
      this.helpers.updateValueLabel('svgExtrudeDepth', depth, 'decimal');
      this.ui.setControlDisabled('svgExtrudeDepth', !state.svgExtrude?.enabled);
    }
    if (this.ui.inputs.svgExtrudeBevelWidth) {
      const enabled = !!state.svgExtrude?.enabled;
      const bevelWidth = state.svgExtrude?.bevelWidth ?? 0.02;
      this.ui.inputs.svgExtrudeBevelWidth.value = bevelWidth;
      this.helpers.updateValueLabel('svgExtrudeBevelWidth', bevelWidth, 'decimal', 3);
      this.ui.setControlDisabled('svgExtrudeBevelWidth', !enabled);
    }
    if (this.ui.inputs.svgExtrudeNormalAngle) {
      const enabled = !!state.svgExtrude?.enabled;
      const normalAngle = state.svgExtrude?.normalAngle ?? 45;
      this.ui.inputs.svgExtrudeNormalAngle.value = normalAngle;
      this.helpers.updateValueLabel('svgExtrudeNormalAngle', normalAngle, 'angle');
      this.ui.setControlDisabled('svgExtrudeNormalAngle', !enabled);
    }
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
}

