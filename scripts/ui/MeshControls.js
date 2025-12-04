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
      const value = this.helpers.applySnapToCenter(event.target, 0, 2, 1.0);
      this.helpers.updateValueLabel('materialBrightness', value, 'decimal');
      this.stateStore.set('material.brightness', value);
      this.eventBus.emit('mesh:material-brightness', value);
    });
    if (this.ui.inputs.materialBrightness) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.materialBrightness);

    this.ui.inputs.materialMetalness?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      const clampedValue = isNaN(value) ? 0.0 : Math.max(0, Math.min(1, value));
      this.helpers.updateValueLabel('materialMetalness', clampedValue, 'decimal');
      this.stateStore.set('material.metalness', clampedValue);
      this.eventBus.emit('mesh:material-metalness', clampedValue);
    });
    if (this.ui.inputs.materialMetalness) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.materialMetalness);

    this.ui.inputs.materialRoughness?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      const clampedValue = isNaN(value) ? 0.5 : Math.max(0, Math.min(1, value));
      this.helpers.updateValueLabel('materialRoughness', clampedValue, 'decimal');
      this.stateStore.set('material.roughness', clampedValue);
      this.eventBus.emit('mesh:material-roughness', clampedValue);
    });
    if (this.ui.inputs.materialRoughness) this.helpers.enableSliderKeyboardStepping(this.ui.inputs.materialRoughness);

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

    // Normals
    this.ui.inputs.showNormals?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('showNormals', enabled);
      this.eventBus.emit('mesh:normals', enabled);
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
    this.ui.inputs.toggleFresnel.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('fresnel.enabled', enabled);
      this.ui.setEffectControlsDisabled(
        ['fresnelColor', 'fresnelRadius', 'fresnelStrength'],
        !enabled,
      );
      emitFresnel();
    });
    this.ui.inputs.fresnelColor.addEventListener('input', (event) => {
      const value = event.target.value;
      this.stateStore.set('fresnel.color', value);
      emitFresnel();
    });
    this.ui.inputs.fresnelRadius.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('fresnelRadius', value, 'decimal');
      this.stateStore.set('fresnel.radius', value);
      emitFresnel();
    });
    this.ui.inputs.fresnelStrength.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('fresnelStrength', value, 'decimal');
      this.stateStore.set('fresnel.strength', value);
      emitFresnel();
    });

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
    if (this.ui.inputs.showNormals) {
      this.ui.inputs.showNormals.checked = state.showNormals;
    }
    if (this.ui.inputs.materialBrightness) {
      const brightness = state.material?.brightness ?? 1.0;
      this.ui.inputs.materialBrightness.value = brightness;
      this.helpers.updateValueLabel('materialBrightness', brightness, 'decimal');
    }
    if (this.ui.inputs.materialMetalness) {
      const metalness = state.material?.metalness ?? 0.0;
      this.ui.inputs.materialMetalness.value = metalness;
      this.helpers.updateValueLabel('materialMetalness', metalness, 'decimal');
    }
    if (this.ui.inputs.materialRoughness) {
      const roughness = state.material?.roughness ?? 0.8;
      this.ui.inputs.materialRoughness.value = roughness;
      this.helpers.updateValueLabel('materialRoughness', roughness, 'decimal');
    }
    if (this.ui.inputs.materialEmissive) {
      const emissive = state.material?.emissive ?? 0.0;
      this.ui.inputs.materialEmissive.value = emissive;
      this.helpers.updateValueLabel('materialEmissive', emissive, 'decimal');
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
    }
    
    // Radio buttons
    this.ui.inputs.autoRotate.forEach((input) => {
      input.checked = parseFloat(input.value) === state.autoRotate;
    });
    this.ui.inputs.shading.forEach((input) => {
      input.checked = input.value === state.shading;
    });

    // When the main shading mode is pure wireframe, the \"Always on\" and
    // \"Only visible faces\" overlay controls would otherwise create a
    // second wireframe layer on top. To keep things coherent, we visually
    // mute and disable those toggles while in wireframe shading mode.
    const inWireframeMode = state.shading === 'wireframe';
    const wireframeSection = document.querySelector('[data-subsection=\"wireframe\"]');
    if (wireframeSection) {
      wireframeSection.classList.toggle('is-muted', inWireframeMode);
    }
    if (this.ui.inputs.wireframeAlwaysOn) {
      this.ui.inputs.wireframeAlwaysOn.disabled = inWireframeMode;
    }
    if (this.ui.inputs.wireframeOnlyVisibleFaces) {
      this.ui.inputs.wireframeOnlyVisibleFaces.disabled = inWireframeMode;
    }
  }
}

