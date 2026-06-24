/**
 * MeshControls - Handles all mesh/object-related UI controls
 * Manages shading, materials, transforms, clay, wireframe, fresnel, and export settings
 */
import {
  DEFAULT_MATERIAL_BRIGHTNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_WIREFRAME_LINE_WIDTH,
  MATERIAL_EMISSIVE_SLIDER_MAX,
  getMaterialMrResetDefaults,
  ORBY_BLACK,
} from '../constants.js';
import { applyWireframeOnlyVisibleOnEnter } from './wireframeEnterDefaults.js';
import {
  CREATIVE_LOOK_PRESETS,
  creativeLookFixedIntensity,
  creativeLookDefaultIntensity,
  creativeLookDefaultPatternScale,
  creativeLookFixedPatternScale,
  creativeLookPatternScaleBounds,
  normalizeCreativeLookPatternScale,
  creativeLookPresetLocksIntensity,
  creativeLookPresetLocksMasterHue,
  creativeLookPresetLocksPatternScale,
  creativeLookPresetUsesShaderAnimation,
  isDitherPixelCreativeLookPreset,
  shouldResetDitherPresetTuning,
  normalizeCreativeLookPreset,
  resolveCreativeLookPresetChoice,
} from '../render/CreativeLookMaterials.js';
import { isVoxelCreativeLookPreset } from '../render/creativeLookVoxelArt.js';
import { isFontExtrudeRevealModel } from '../scene/FontTextRevealController.js';
import {
  CREATIVE_LOOK_ALL_PRESET_SLIDER_IDS,
  creativeLookPresetHidesPatternScale,
  getCreativeLookPresetSliderDefs,
} from '../render/creativeLookPresetSliders.js';
import {
  normalizeCreativeLookSketchRasterSize,
  normalizeCreativeLookSketchStrokeWidth,
  resolveCreativeLookSketchParams,
} from '../render/creativeLookSketchArt.js';
import {
  creativeLookInkControlsVisible,
  normalizeCreativeLookStrokeColor,
  resolveCreativeLookInkParams,
} from '../render/creativeLookInkArt.js';
import {
  bindSvgExtrudeControls,
  bindExtrudeBevelControls,
  syncSvgExtrudeControls,
  renderSvgColorDepthControls,
} from './svgExtrudeControlsShared.js';
import { normalizeExportSubtleSpinDegrees, normalizeExportHdriRotationDegrees } from '../render/exportVideoMovements.js';
import { IMPORT_MESH_SMOOTHING_ENABLED } from '../import/stlNormalSmoothing.js';
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
    this.svgExtrudeTimers = {
      depth: null,
      normal: null,
      bevel: null,
      colorDebounce: new Map(),
      meshPending: {},
    };
    this.stlSmoothingDebounceTimer = null;
  }

  resolveImportSmoothingControlsVisible() {
    if (!IMPORT_MESH_SMOOTHING_ENABLED) return false;
    const scene = window.orby?.scene;
    return !!(scene?.currentModel && !scene?.isSvgExtrudeModel);
  }

  syncImportSmoothingControlsVisible(visible) {
    const wrap = this.ui.inputs.stlSmoothingControls;
    if (wrap) wrap.hidden = !visible;
  }

  _svgExtrudeCtx() {
    return {
      inputs: {
        depth: this.ui.inputs.svgExtrudeDepth,
        depthOutputKey: 'svgExtrudeDepth',
        bevelAmount: this.ui.inputs.svgExtrudeBevelAmount,
        bevelAmountOutputKey: 'svgExtrudeBevelAmount',
        detail: this.ui.inputs.svgExtrudeDetail,
        normalAngle: this.ui.inputs.svgExtrudeNormalAngle,
        normalAngleOutputKey: 'svgExtrudeNormalAngle',
        hardEdgeAngle: this.ui.inputs.svgExtrudeHardEdgeAngle,
        hardEdgeAngleOutputKey: 'svgExtrudeHardEdgeAngle',
        surfacePreset: this.ui.inputs.svgExtrudeSurfacePreset,
        surfaceScale: this.ui.inputs.svgExtrudeSurfaceScale,
        surfaceScaleOutputKey: 'svgExtrudeSurfaceScale',
        surfaceStrength: this.ui.inputs.svgExtrudeSurfaceStrength,
        surfaceStrengthOutputKey: 'svgExtrudeSurfaceStrength',
        flipDirection: this.ui.inputs.svgExtrudeFlipDirection,
        colorOverride: this.ui.inputs.svgExtrudeColorOverride,
        overrideColor: this.ui.inputs.svgExtrudeColor,
        colorDepths: this.ui.inputs.svgExtrudeColorDepths,
      },
      stateStore: this.stateStore,
      eventBus: this.eventBus,
      ui: this.ui,
      helpers: this.helpers,
      timers: this.svgExtrudeTimers,
    };
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
    this.eventBus.on('ui:stl-smoothing-visible', () => {
      this.syncImportSmoothingControlsVisible(this.resolveImportSmoothingControlsVisible());
      this.ui.syncUIFromState();
    });
    this.eventBus.on('ui:center-pivot-enabled', (payload) => {
      const enabled = !!(payload?.enabled ?? payload);
      if (this.ui.inputs.centerPivot) {
        this.ui.inputs.centerPivot.disabled = !enabled;
      }
    });

    // Shading mode
    this.ui.inputs.shading.forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) {
          const prev = this.stateStore.getState().shading;
          if (input.value !== prev) this.ui.uiSounds?.playSelect();
          this.stateStore.set('shading', input.value);
          applyWireframeOnlyVisibleOnEnter(
            prev,
            input.value,
            this.stateStore,
            this.eventBus,
            this.ui,
          );
          this.eventBus.emit('mesh:shading', input.value);
        }
      });
    });

    // Material controls
    this.ui.inputs.materialBrightness?.addEventListener('input', (event) => {
      const parsed = parseFloat(event.target.value);
      const value = Number.isFinite(parsed)
        ? Math.max(0, Math.min(5, parsed))
        : DEFAULT_MATERIAL_BRIGHTNESS;
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

    bindSvgExtrudeControls(this._svgExtrudeCtx());
    bindExtrudeBevelControls(this._svgExtrudeCtx());
    this.ui.inputs.reverseNormals?.addEventListener('change', (event) => {
      const enabled = !!event.target.checked;
      this.stateStore.set('advanced.reverseNormals', enabled);
      this.eventBus.emit('mesh:reverse-normals', enabled);
    });
    this.ui.inputs.centerPivot?.addEventListener('change', (event) => {
      const enabled = !!event.target.checked;
      this.stateStore.set('advanced.centerPivot', enabled);
      this.eventBus.emit('mesh:center-pivot', enabled);
    });
    this.ui.inputs.stlSmoothShading?.addEventListener('change', (event) => {
      const enabled = !!event.target.checked;
      this.stateStore.set('advanced.stlSmoothShading', enabled);
      this.eventBus.emit('mesh:stl-smoothing');
    });
    this.ui.inputs.stlSmoothingAngle?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      const clampedValue = Number.isFinite(value) ? Math.max(0, Math.min(180, value)) : 40;
      this.helpers.updateValueLabel('stlSmoothingAngle', clampedValue, 'angle');
      this.stateStore.set('advanced.stlSmoothingAngle', clampedValue);
      if (this.stlSmoothingDebounceTimer) {
        clearTimeout(this.stlSmoothingDebounceTimer);
      }
      this.stlSmoothingDebounceTimer = setTimeout(() => {
        this.eventBus.emit('mesh:stl-smoothing');
      }, 45);
    });
    if (this.ui.inputs.stlSmoothingAngle) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.stlSmoothingAngle);
    }
    this.ui.inputs.uvChecker?.addEventListener('change', (event) => {
      const enabled = !!event.target.checked;
      const normalViewWasOn = enabled && !!this.stateStore.getState().advanced?.normalView;
      this.stateStore.batch(() => {
        this.stateStore.set('advanced.uvChecker', enabled);
        if (normalViewWasOn) {
          this.stateStore.set('advanced.normalView', false);
        }
      });
      if (normalViewWasOn) {
        this.eventBus.emit('mesh:normal-view', false);
      }
      this.eventBus.emit('mesh:uv-checker', enabled);
    });
    this.ui.inputs.uvCheckerStyle?.addEventListener('change', (event) => {
      const allowed = ['orby', 'classic', 'monochrome'];
      const value = event.target.value === 'vibrant' ? 'classic' : event.target.value;
      const style = allowed.includes(value) ? value : 'orby';
      this.stateStore.set('advanced.uvCheckerStyle', style);
      this.eventBus.emit('mesh:uv-checker-style', style);
    });
    this.ui.inputs.uvCheckerScale?.addEventListener('input', (event) => {
      const raw = parseFloat(event.target.value);
      const scale = Number.isFinite(raw) ? Math.max(0, Math.min(10, raw)) : 5;
      this.helpers.updateValueLabel('uvCheckerScale', scale, 'decimal');
      this.stateStore.set('advanced.uvCheckerScale', scale);
      this.eventBus.emit('mesh:uv-checker-scale', scale);
    });
    if (this.ui.inputs.uvCheckerScale) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.uvCheckerScale);
    }
    this.ui.inputs.normalView?.addEventListener('change', (event) => {
      const enabled = !!event.target.checked;
      const uvCheckerWasOn = enabled && !!this.stateStore.getState().advanced?.uvChecker;
      this.stateStore.batch(() => {
        this.stateStore.set('advanced.normalView', enabled);
        if (uvCheckerWasOn) {
          this.stateStore.set('advanced.uvChecker', false);
        }
      });
      if (uvCheckerWasOn) {
        this.eventBus.emit('mesh:uv-checker', false);
      }
      this.eventBus.emit('mesh:normal-view', enabled);
    });
    this.ui.inputs.normalViewMode?.addEventListener('change', (event) => {
      const allowed = ['geometry', 'tangent'];
      const mode = allowed.includes(event.target.value) ? event.target.value : 'geometry';
      this.stateStore.set('advanced.normalViewMode', mode);
      this.eventBus.emit('mesh:normal-view-mode', mode);
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

    // Turntable (mesh auto-rotate)
    this.ui.inputs.autoRotate.forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) {
          const speed = parseFloat(input.value);
          this.stateStore.set('autoRotate', speed);
          this.eventBus.emit('mesh:auto-rotate', speed);
        }
      });
    });
    this.ui.inputs.autoRotateDirection?.addEventListener('change', (event) => {
      const direction = event.target.value === 'reverse' ? 'reverse' : 'forward';
      this.stateStore.set('autoRotateDirection', direction);
      this.eventBus.emit('mesh:auto-rotate-direction', direction);
    });

    // Clay controls
    this.helpers.bindColorInput('clayColor', 'clay.color', 'mesh:clay-color');
    this.ui.inputs.clayNormalMap?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('clay.normalMap', enabled);
      this.eventBus.emit('mesh:clay-normal-map', enabled);
    });

    /* Subsurface UI — enable with SUBSURFACE_FEATURE_ENABLED in MaterialController.js + uncomment index.html subsection.
    const emitSubsurface = () => {
      this.eventBus.emit('mesh:subsurface', this.stateStore.getState().subsurface ?? {});
    };
    if (this.ui.inputs.toggleSubsurface) {
      this.ui.inputs.toggleSubsurface.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        this.stateStore.set('subsurface.enabled', enabled);
        if (enabled) {
          const tr = Number(this.stateStore.getState().subsurface?.translucency ?? 0);
          if (!Number.isFinite(tr) || tr < 0.04) {
            this.stateStore.set('subsurface.translucency', 0.55);
            if (this.ui.inputs.subsurfaceTranslucency) {
              this.ui.inputs.subsurfaceTranslucency.value = '0.55';
              this.helpers.updateValueLabel('subsurfaceTranslucency', 0.55, 'decimal');
            }
          }
        }
        this.ui.setEffectControlsDisabled(
          ['subsurfaceTranslucency', 'subsurfaceScatterTint'],
          !enabled,
        );
        emitSubsurface();
      });
    }
    this.ui.inputs.subsurfaceTranslucency?.addEventListener('input', (event) => {
      const raw = parseFloat(event.target.value);
      const value = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
      this.helpers.updateValueLabel('subsurfaceTranslucency', value, 'decimal');
      this.stateStore.set('subsurface.translucency', value);
      this.eventBus.emit('mesh:subsurface-translucency', value);
    });
    if (this.ui.inputs.subsurfaceTranslucency) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.subsurfaceTranslucency);
    }
    this.helpers.bindColorInput(
      'subsurfaceScatterTint',
      'subsurface.scatterTint',
      'mesh:subsurface-scatter-tint',
    );
    */

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
    this.ui.inputs.wireframeThickness?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      if (!Number.isFinite(value)) return;
      this.helpers.updateValueLabel('wireframeThickness', value, 'decimal');
      this.stateStore.set('wireframe.thickness', value);
      this.eventBus.emit('mesh:wireframe-thickness', value);
    });
    if (this.ui.inputs.wireframeThickness) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.wireframeThickness);
    }

    const updateCreativeLookFoldout = (open) => {
      const container = document.querySelector('#creativeLookSectionContainer');
      if (!container) return;
      container.classList.toggle('creative-look-foldout--collapsed', !open);
      container.classList.toggle('creative-look-foldout--expanded', open);
    };
    const syncRenderBackdropForShaderLab = () => {
      window.orby?.scene?.syncCreativeLookTransmissionBackdrop?.();
    };
    const isShaderLabSectionOpen = (state) =>
      !!state.creativeLookSectionOpen || !!state.creativeLook?.enabled;

    updateCreativeLookFoldout(isShaderLabSectionOpen(this.stateStore.getState()));

    this.ui.inputs.creativeLookEnabled?.addEventListener('change', (event) => {
      const open = event.target.checked;
      const shaderWasActive = !!this.stateStore.getState().creativeLook?.enabled;

      if (open) {
        const chosen = resolveCreativeLookPresetChoice(
          this.stateStore.getState().creativeLook?.preset,
        );
        this.stateStore.batch(() => {
          this.stateStore.set('creativeLookSectionOpen', true);
          if (chosen) {
            this.stateStore.set('creativeLook.enabled', true);
          }
        });
        updateCreativeLookFoldout(true);
        this.ui.toggleCreativeLookGrid(true);
        this.ui.setCreativeLookActive(chosen);
        if (chosen) {
          syncRenderBackdropForShaderLab();
          this.eventBus.emit('mesh:creative-look');
        }
        return;
      }

      // Shader Lab replaces mesh materials with ShaderMaterials and is mutually exclusive with the
      // UV checker overlay (which assumes the originals are intact). Force the overlay off when closing.
      const uvCheckerWasOn = shaderWasActive && !!this.stateStore.getState().advanced?.uvChecker;
      const normalViewWasOn = shaderWasActive && !!this.stateStore.getState().advanced?.normalView;
      this.stateStore.batch(() => {
        this.stateStore.set('creativeLookSectionOpen', false);
        if (shaderWasActive) {
          this.stateStore.set('creativeLook.enabled', false);
        }
        if (uvCheckerWasOn) {
          this.stateStore.set('advanced.uvChecker', false);
        }
        if (normalViewWasOn) {
          this.stateStore.set('advanced.normalView', false);
        }
      });
      updateCreativeLookFoldout(false);
      this.ui.toggleCreativeLookGrid(false);
      if (uvCheckerWasOn) {
        this.eventBus.emit('mesh:uv-checker', false);
      }
      if (normalViewWasOn) {
        this.eventBus.emit('mesh:normal-view', false);
      }
      if (shaderWasActive) {
        this.eventBus.emit('mesh:creative-look');
      }
    });
    this.ui.inputs.creativeLookShaderAnimationSpeed?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      if (!Number.isFinite(value)) return;
      this.helpers.updateValueLabel('creativeLookShaderAnimationSpeed', value, 'decimal');
      this.stateStore.set('creativeLook.shaderAnimationSpeed', value);
    });
    if (this.ui.inputs.creativeLookShaderAnimationSpeed) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.creativeLookShaderAnimationSpeed);
    }
    this.ui.inputs.creativeLookPatternScale?.addEventListener('input', (event) => {
      const preset = normalizeCreativeLookPreset(
        this.stateStore.getState().creativeLook?.preset,
      );
      const fixedScale = creativeLookFixedPatternScale(preset);
      if (fixedScale != null) return;
      const value = parseFloat(event.target.value);
      if (!Number.isFinite(value)) return;
      const scale = normalizeCreativeLookPatternScale(preset, value);
      this.helpers.updateValueLabel('creativeLookPatternScale', scale, 'multiplier');
      this.stateStore.set('creativeLook.patternScale', scale);
      this.eventBus.emit('mesh:creative-look-live');
    });
    if (this.ui.inputs.creativeLookPatternScale) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.creativeLookPatternScale);
    }
    this._bindCreativeLookPresetSliders();
    this._bindCreativeLookInkControls();
    this.ui.inputs.creativeLookMasterHue?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      if (!Number.isFinite(value)) return;
      const hue = Math.min(180, Math.max(-180, Math.round(value)));
      this.helpers.updateValueLabel('creativeLookMasterHue', hue, 'angle');
      this.stateStore.set('creativeLook.masterHue', hue);
      this.eventBus.emit('mesh:creative-look-live');
    });
    if (this.ui.inputs.creativeLookMasterHue) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.creativeLookMasterHue);
    }
    this.ui.inputs.creativeLookIntensity?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      if (!Number.isFinite(value)) return;
      const intensity = Math.min(2, Math.max(0, Math.round(value * 100) / 100));
      this.helpers.updateValueLabel('creativeLookIntensity', intensity);
      this.stateStore.set('creativeLook.intensity', intensity);
      this.eventBus.emit('mesh:creative-look-live');
    });
    if (this.ui.inputs.creativeLookIntensity) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.creativeLookIntensity);
    }
    this.ui.inputs.creativeLookLiftCrush?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      if (!Number.isFinite(value)) return;
      const liftCrush = Math.min(1, Math.max(-1, Math.round(value * 100) / 100));
      this.helpers.updateValueLabel('creativeLookLiftCrush', liftCrush, 'signedDecimal');
      this.stateStore.set('creativeLook.liftCrush', liftCrush);
      this.eventBus.emit('mesh:creative-look-live');
    });
    if (this.ui.inputs.creativeLookLiftCrush) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.creativeLookLiftCrush);
    }
    this.ui.inputs.creativeLookPauseAnimations?.addEventListener('click', () => {
      const cl = this.stateStore.getState().creativeLook || {};
      const next = !cl.pauseShaderAnimations;
      this.stateStore.set('creativeLook.pauseShaderAnimations', next);
    });
    this.ui.inputs.creativeLookBloomEnabled?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('creativeLook.viewportBloom', enabled);
      // Viewport bloom is read from state each frame — do not emit mesh:creative-look here;
      // that re-runs syncCreativeLookTransmissionBackdrop and turns HDRI Render Backdrop back on.
      const mc = window.orby?.scene?.materialController;
      if (mc?.creativeLookSettings) {
        mc.creativeLookSettings.viewportBloom = enabled;
      }
    });
    this.ui.inputs.creativeLookButtons?.forEach?.((button) => {
      button.addEventListener('click', () => {
        const preset = button.dataset.creativeLook;
        if (!CREATIVE_LOOK_PRESETS.includes(preset)) return;
        if (button.disabled) return;
        if (
          preset === 'voxel-hd' &&
          isFontExtrudeRevealModel(window.orby?.scene?.currentModel)
        ) {
          return;
        }
        const state = this.stateStore.getState().creativeLook || {};
        const prev = resolveCreativeLookPresetChoice(state.preset);
        if (preset !== prev) this.ui.uiSounds?.playSelect();
        const resetDitherTuning = shouldResetDitherPresetTuning(prev, preset);
        // See `creativeLookEnabled` handler — Shader Lab and UV Checker overlay are mutually
        // exclusive. Disable the overlay before the shader takes over.
        const uvCheckerWasOn = !!this.stateStore.getState().advanced?.uvChecker;
        const normalViewWasOn = !!this.stateStore.getState().advanced?.normalView;
        this.stateStore.batch(() => {
          this.stateStore.set('creativeLook.preset', preset);
          this.stateStore.set('creativeLook.enabled', true);
          this.stateStore.set('creativeLookSectionOpen', true);
          const fixedScale = creativeLookFixedPatternScale(preset);
          if (fixedScale != null) {
            this.stateStore.set('creativeLook.patternScale', fixedScale);
          } else if (resetDitherTuning) {
            this.stateStore.set('creativeLook.patternScale', creativeLookDefaultPatternScale(preset));
          } else {
            const defaultScale = creativeLookDefaultPatternScale(preset);
            if (defaultScale != null) {
              this.stateStore.set('creativeLook.patternScale', defaultScale);
            } else {
              const currentScale = Number(state.patternScale);
              if (Number.isFinite(currentScale)) {
                this.stateStore.set(
                  'creativeLook.patternScale',
                  normalizeCreativeLookPatternScale(preset, currentScale),
                );
              }
            }
          }
          const fixedIntensity = creativeLookFixedIntensity(preset);
          if (fixedIntensity != null) {
            this.stateStore.set('creativeLook.intensity', fixedIntensity);
          } else if (
            resetDitherTuning
            || normalizeCreativeLookPreset(preset) === 'scanline-hologram'
            || normalizeCreativeLookPreset(preset) === 'vectrex'
            || normalizeCreativeLookPreset(preset) === 'wire-pulse'
            || normalizeCreativeLookPreset(preset) === 'vertex-points'
            || normalizeCreativeLookPreset(preset) === 'dust-field'
            || isDitherPixelCreativeLookPreset(preset)
          ) {
            this.stateStore.set(
              'creativeLook.intensity',
              creativeLookDefaultIntensity(preset),
            );
          }
          if (
            normalizeCreativeLookPreset(preset) === 'sketch'
            || normalizeCreativeLookPreset(preset) === 'sketch-colour'
          ) {
            const fb = Number.isFinite(Number(state.patternScale))
              ? Number(state.patternScale)
              : 1;
            this.stateStore.set('creativeLook.presetParams', {
              ...(state.presetParams ?? {}),
              sketch: {
                strokeWidth: fb,
                rasterSize: fb,
                ...(state.presetParams?.sketch ?? {}),
              },
            });
          }
          if (uvCheckerWasOn) {
            this.stateStore.set('advanced.uvChecker', false);
          }
          if (normalViewWasOn) {
            this.stateStore.set('advanced.normalView', false);
          }
        });
        updateCreativeLookFoldout(true);
        syncRenderBackdropForShaderLab();
        if (this.ui.inputs.creativeLookEnabled) {
          this.ui.inputs.creativeLookEnabled.checked = true;
        }
        this.ui.setCreativeLookActive(preset);
        this.ui.toggleCreativeLookGrid(true);
        if (uvCheckerWasOn) {
          this.eventBus.emit('mesh:uv-checker', false);
        }
        if (normalViewWasOn) {
          this.eventBus.emit('mesh:normal-view', false);
        }
        this.eventBus.emit('mesh:creative-look');
      });
    });

    this.eventBus.on('font:generated', () => {
      this._syncCreativeLookVoxelHdAvailability();
    });
    this.eventBus.on('scene:model-load-complete', () => {
      this._syncCreativeLookVoxelHdAvailability();
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
    document.querySelectorAll('[data-export-image-format]').forEach((button) => {
      button.addEventListener('click', () => {
        const format = button.dataset.exportImageFormat;
        if (!format) return;
        this.ui.exportSettings.format = format;
        document.querySelectorAll('[data-export-image-format]').forEach((btn) => {
          btn.classList.toggle('active', btn === button);
        });
        this.ui.syncImageExportUi();
      });
    });

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

    this.ui.buttons.exportImage?.addEventListener('click', () => {
      this.eventBus.emit('export:image', {
        format: this.ui.exportSettings.format,
        transparent: this.ui.exportSettings.transparent,
        size: this.ui.exportSettings.size,
      });
    });

    this.ui.syncImageExportUi();

    const updatePngTransparentUi = () => {
      const wrap = this.ui.inputs.exportPngTransparentSettings;
      if (!wrap) return;
      const enabled = this.ui.exportSettings.video?.format === 'png';
      wrap.classList.toggle('is-muted', !enabled);
      wrap.querySelectorAll('[data-video-mov-transparent]').forEach((el) => {
        if ('disabled' in el) el.disabled = !enabled;
        if (el.classList) el.classList.toggle('is-disabled', !enabled);
      });
      this.ui.syncExportPngFolderUi();
    };
    const updateMp4Ui = () => {
      const wrap = this.ui.inputs.exportMp4Settings;
      if (!wrap) return;
      const f = this.ui.exportSettings.video?.format;
      const showCompression = f === 'mp4';
      wrap.hidden = !showCompression;
      wrap.classList.toggle('is-muted', !showCompression);
      wrap.querySelectorAll('[data-video-mp4-quality]').forEach((btn) => {
        if ('disabled' in btn) btn.disabled = !showCompression;
        btn.classList.toggle('is-disabled', !showCompression);
      });
    };

    const notifyExportPreviewSettingsChanged = () => {
      this.eventBus.emit('export:video-preview-settings-changed', {
        ...(this.ui.exportSettings.video || {}),
      });
    };

    const syncExportMovementSlidersUi = () => {
      const video = this.ui.exportSettings.video;
      const zoomActive = !!(video?.zoomIn || video?.zoomOut);
      const tiltActive = !!(video?.tiltLeft || video?.tiltRight);
      const wrap = this.ui.inputs.exportMovementSliders;
      if (wrap) {
        wrap.classList.toggle('is-muted', !zoomActive && !tiltActive);
      }
      if (this.ui.inputs.exportZoomDistanceSettings) {
        this.ui.inputs.exportZoomDistanceSettings.classList.toggle('is-muted', !zoomActive);
      }
      if (this.ui.inputs.exportTiltAngleSettings) {
        this.ui.inputs.exportTiltAngleSettings.classList.toggle('is-muted', !tiltActive);
      }
      this.ui.setControlDisabled('exportZoomDistance', !zoomActive);
      this.ui.setControlDisabled('exportTiltAngle', !tiltActive);
    };

    const syncExportMovementButtons = () => {
      const video = this.ui.exportSettings.video || {};
      document.querySelectorAll('[data-video-movement]').forEach((btn) => {
        const key = btn.dataset.videoMovement;
        let active = false;
        if (key === 'turntable') active = !!video.turntable;
        else if (key === 'orbit') active = !!video.orbit;
        else if (key === 'zoom-in') active = !!video.zoomIn;
        else if (key === 'zoom-out') active = !!video.zoomOut;
        else if (key === 'tilt-left') active = !!video.tiltLeft;
        else if (key === 'tilt-right') active = !!video.tiltRight;
        btn.classList.toggle('active', active);
      });
      syncExportMovementSlidersUi();
    };

    document.querySelectorAll('[data-video-movement]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const key = button.dataset.videoMovement;
        const video = this.ui.exportSettings.video;
        if (key === 'turntable') {
          video.turntable = !video.turntable;
        } else if (key === 'orbit') {
          video.orbit = !video.orbit;
        } else if (key === 'zoom-in') {
          video.zoomIn = !video.zoomIn;
          if (video.zoomIn) video.zoomOut = false;
        } else if (key === 'zoom-out') {
          video.zoomOut = !video.zoomOut;
          if (video.zoomOut) video.zoomIn = false;
        } else if (key === 'tilt-left') {
          video.tiltLeft = !video.tiltLeft;
          if (video.tiltLeft) video.tiltRight = false;
        } else if (key === 'tilt-right') {
          video.tiltRight = !video.tiltRight;
          if (video.tiltRight) video.tiltLeft = false;
        }
        syncExportMovementButtons();
        notifyExportPreviewSettingsChanged();
      });
    });

    if (this.ui.inputs.exportZoomDistance) {
      this.ui.inputs.exportZoomDistance.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        if (!Number.isFinite(value)) return;
        this.ui.exportSettings.video.zoomDistance = value;
        this.helpers.updateValueLabel('exportZoomDistance', value, 'distance');
        notifyExportPreviewSettingsChanged();
      });
      this.helpers.updateValueLabel(
        'exportZoomDistance',
        this.ui.exportSettings.video.zoomDistance ?? 1.5,
        'distance',
      );
    }

    if (this.ui.inputs.exportTiltAngle) {
      this.ui.inputs.exportTiltAngle.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        if (!Number.isFinite(value)) return;
        this.ui.exportSettings.video.tiltAngle = value;
        this.helpers.updateValueLabel('exportTiltAngle', value, 'angle');
        notifyExportPreviewSettingsChanged();
      });
      this.helpers.updateValueLabel(
        'exportTiltAngle',
        this.ui.exportSettings.video.tiltAngle ?? 15,
        'angle',
      );
    }

    if (this.ui.inputs.exportFovOffset) {
      this.ui.inputs.exportFovOffset.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        if (!Number.isFinite(value)) return;
        this.ui.exportSettings.video.fovOffset = value;
        this.helpers.updateValueLabel('exportFovOffset', value, 'signedAngle');
        notifyExportPreviewSettingsChanged();
      });
      this.helpers.updateValueLabel(
        'exportFovOffset',
        this.ui.exportSettings.video.fovOffset ?? 0,
        'signedAngle',
      );
    }

    if (this.ui.inputs.exportPitchOffset) {
      this.ui.inputs.exportPitchOffset.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        if (!Number.isFinite(value)) return;
        this.ui.exportSettings.video.pitchOffset = value;
        this.helpers.updateValueLabel('exportPitchOffset', value, 'signedAngle');
        notifyExportPreviewSettingsChanged();
      });
      this.helpers.updateValueLabel(
        'exportPitchOffset',
        this.ui.exportSettings.video.pitchOffset ?? 0,
        'signedAngle',
      );
    }

    if (this.ui.inputs.exportMeshAnimationsEmbed) {
      this.ui.inputs.exportMeshAnimationsEmbed.addEventListener('change', (event) => {
        this.ui.exportSettings.video.meshAnimationsInclude = !!event.target.checked;
        this.ui.syncExportMeshAnimationsUi();
        notifyExportPreviewSettingsChanged();
      });
    }

    if (this.ui.inputs.exportMeshAnimationSelect) {
      this.ui.inputs.exportMeshAnimationSelect.addEventListener('change', (event) => {
        const index = parseInt(event.target.value, 10);
        if (!Number.isFinite(index)) return;
        this.ui.exportSettings.video.meshAnimationClipIndex = index;
        notifyExportPreviewSettingsChanged();
      });
    }

    syncExportMovementButtons();
    this.ui.syncExportMeshAnimationsUi();

    document.querySelectorAll('[data-video-format]').forEach((button) => {
      button.addEventListener('click', () => {
        const format = button.dataset.videoFormat;
        if (format !== 'mp4' && format !== 'png') return;
        this.ui.exportSettings.video.format = format;
        document.querySelectorAll('[data-video-format]').forEach((btn) => {
          btn.classList.toggle('active', btn === button);
        });
        updatePngTransparentUi();
        updateMp4Ui();
      });
    });

    document.querySelectorAll('[data-video-duration]').forEach((button) => {
      button.addEventListener('click', () => {
        const duration = parseInt(button.dataset.videoDuration, 10);
        if (!Number.isFinite(duration)) return;
        this.ui.exportSettings.video.durationSec = duration;
        document.querySelectorAll('[data-video-duration]').forEach((btn) => {
          btn.classList.toggle('active', btn === button);
        });
        notifyExportPreviewSettingsChanged();
      });
    });

    document.querySelectorAll('[data-video-fps]').forEach((button) => {
      button.addEventListener('click', () => {
        const fps = parseInt(button.dataset.videoFps, 10);
        if (fps !== 24 && fps !== 30 && fps !== 60) return;
        this.ui.exportSettings.video.fps = fps;
        document.querySelectorAll('[data-video-fps]').forEach((btn) => {
          btn.classList.toggle('active', btn === button);
        });
        notifyExportPreviewSettingsChanged();
      });
    });

    const syncExportSpinUi = () => {
      const video = this.ui.exportSettings.video || {};
      const fullSpins = video.spins === 0 || video.spins === 2 ? video.spins : 1;
      const subtleEnabled = fullSpins === 0;
      const subtleDegrees = normalizeExportSubtleSpinDegrees(video.subtleSpinDegrees);
      const spinDirection = video.spinDirection === 'reverse' ? 'reverse' : 'forward';
      const hdriDegrees = normalizeExportHdriRotationDegrees(video.hdriRotationDegrees);

      document.querySelectorAll('[data-video-spins]').forEach((btn) => {
        const spins = parseInt(btn.dataset.videoSpins, 10);
        btn.classList.toggle('active', spins === fullSpins);
      });

      const subtleWrap = document.getElementById('exportSubtleSpinsGroup');
      if (subtleWrap) {
        subtleWrap.classList.toggle('is-muted', !subtleEnabled);
      }
      document.querySelectorAll('[data-video-subtle-spins]').forEach((btn) => {
        const degrees = normalizeExportSubtleSpinDegrees(parseFloat(btn.dataset.videoSubtleSpins));
        btn.classList.toggle('active', subtleEnabled && degrees === subtleDegrees);
        if ('disabled' in btn) btn.disabled = !subtleEnabled;
        btn.classList.toggle('is-disabled', !subtleEnabled);
      });

      document.querySelectorAll('[data-video-spin-direction]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.videoSpinDirection === spinDirection);
      });

      document.querySelectorAll('[data-video-hdri-rotation]').forEach((btn) => {
        const degrees = normalizeExportHdriRotationDegrees(parseFloat(btn.dataset.videoHdriRotation));
        btn.classList.toggle('active', degrees > 0 && degrees === hdriDegrees);
      });
    };

    document.querySelectorAll('[data-video-spins]').forEach((button) => {
      button.addEventListener('click', () => {
        const spins = parseInt(button.dataset.videoSpins, 10);
        if (spins !== 0 && spins !== 1 && spins !== 2) return;
        this.ui.exportSettings.video.spins = spins;
        syncExportSpinUi();
        notifyExportPreviewSettingsChanged();
      });
    });

    document.querySelectorAll('[data-video-subtle-spins]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const degrees = parseFloat(button.dataset.videoSubtleSpins);
        const normalized = normalizeExportSubtleSpinDegrees(degrees);
        if (!normalized) return;
        const video = this.ui.exportSettings.video;
        const current = normalizeExportSubtleSpinDegrees(video.subtleSpinDegrees);
        video.subtleSpinDegrees = current === normalized ? 0 : normalized;
        syncExportSpinUi();
        notifyExportPreviewSettingsChanged();
      });
    });

    document.querySelectorAll('[data-video-spin-direction]').forEach((button) => {
      button.addEventListener('click', () => {
        const direction = button.dataset.videoSpinDirection;
        if (direction !== 'forward' && direction !== 'reverse') return;
        this.ui.exportSettings.video.spinDirection = direction;
        syncExportSpinUi();
        notifyExportPreviewSettingsChanged();
      });
    });

    document.querySelectorAll('[data-video-hdri-rotation]').forEach((button) => {
      button.addEventListener('click', () => {
        const degrees = parseFloat(button.dataset.videoHdriRotation);
        const normalized = normalizeExportHdriRotationDegrees(degrees);
        if (!normalized) return;
        const video = this.ui.exportSettings.video;
        const current = normalizeExportHdriRotationDegrees(video.hdriRotationDegrees);
        video.hdriRotationDegrees = current === normalized ? 0 : normalized;
        syncExportSpinUi();
        notifyExportPreviewSettingsChanged();
      });
    });

    syncExportSpinUi();

    document.querySelectorAll('[data-video-resolution]').forEach((button) => {
      button.addEventListener('click', () => {
        const resolution = button.dataset.videoResolution;
        if (
          resolution !== '1080p'
          && resolution !== '1440p'
          && resolution !== '2160p'
        ) return;
        this.ui.exportSettings.video.resolution = resolution;
        document.querySelectorAll('[data-video-resolution]').forEach((btn) => {
          btn.classList.toggle('active', btn === button);
        });
      });
    });

    document.querySelectorAll('[data-video-mov-transparent]').forEach((button) => {
      button.addEventListener('click', () => {
        const transparent = button.dataset.videoMovTransparent === 'true';
        this.ui.exportSettings.video.movTransparent = transparent;
        document.querySelectorAll('[data-video-mov-transparent]').forEach((btn) => {
          btn.classList.toggle('active', btn === button);
        });
      });
    });

    document.querySelectorAll('[data-video-mp4-quality]').forEach((button) => {
      button.addEventListener('click', () => {
        const quality = button.dataset.videoMp4Quality;
        if (quality !== 'low' && quality !== 'medium' && quality !== 'high') return;
        this.ui.exportSettings.video.mp4Quality = quality;
        document.querySelectorAll('[data-video-mp4-quality]').forEach((btn) => {
          btn.classList.toggle('active', btn === button);
        });
      });
    });

    this.ui.buttons.exportPngFolderChoose?.addEventListener('click', () => {
      if (this.ui.exportSettings.video?.format !== 'png') return;
      this.ui.pickPngExportDirectory();
    });

    updatePngTransparentUi();
    updateMp4Ui();
    this.ui.syncExportPngFolderUi();
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

  syncTransformSliders(values) {
    if (!values) return;
    if (this.ui.inputs.scale) {
      this.ui.inputs.scale.value = values.scale;
      this.helpers.updateValueLabel('scale', values.scale, 'multiplier');
    }
    if (this.ui.inputs.xOffset) {
      this.ui.inputs.xOffset.value = values.xOffset;
      this.helpers.updateValueLabel('xOffset', values.xOffset, 'distance');
    }
    if (this.ui.inputs.yOffset) {
      this.ui.inputs.yOffset.value = values.yOffset;
      this.helpers.updateValueLabel('yOffset', values.yOffset, 'distance');
    }
    if (this.ui.inputs.zOffset) {
      this.ui.inputs.zOffset.value = values.zOffset;
      this.helpers.updateValueLabel('zOffset', values.zOffset, 'distance');
    }
    if (this.ui.inputs.rotationX) {
      this.ui.inputs.rotationX.value = values.rotationX;
      this.helpers.updateValueLabel('rotationX', values.rotationX, 'angle');
    }
    if (this.ui.inputs.rotationY) {
      this.ui.inputs.rotationY.value = values.rotationY;
      this.helpers.updateValueLabel('rotationY', values.rotationY, 'angle');
    }
    if (this.ui.inputs.rotationZ) {
      this.ui.inputs.rotationZ.value = values.rotationZ;
      this.helpers.updateValueLabel('rotationZ', values.rotationZ, 'angle');
    }
  }

  _syncMaterialRangeSlider(input, outputKey, value) {
    if (!input) return;
    if (this.helpers.syncRangeFromState(input, value)) {
      this.helpers.updateValueLabel(outputKey, value, 'decimal');
    } else if (!this.helpers.shouldSkipRangeSyncWrite(input)) {
      this.helpers.updateValueLabel(outputKey, value, 'decimal');
    }
  }

  sync(state) {
    this.syncTransformSliders({
      scale: state.scale,
      xOffset: state.xOffset ?? 0,
      yOffset: state.yOffset,
      zOffset: state.zOffset ?? 0,
      rotationX: state.rotationX ?? 0,
      rotationY: state.rotationY ?? 0,
      rotationZ: state.rotationZ ?? 0,
    });
    if (this.ui.inputs.materialBrightness) {
      const mrDefaults = getMaterialMrResetDefaults(!!state.material?.importUsesAuthoredPbr);
      const brightness = state.material?.brightness ?? mrDefaults.brightness;
      this._syncMaterialRangeSlider(
        this.ui.inputs.materialBrightness,
        'materialBrightness',
        brightness,
      );
    }
    if (this.ui.inputs.materialMetalness) {
      const mrDefaults = getMaterialMrResetDefaults(!!state.material?.importUsesAuthoredPbr);
      const metalness = state.material?.metalness ?? mrDefaults.metalness;
      this._syncMaterialRangeSlider(
        this.ui.inputs.materialMetalness,
        'materialMetalness',
        metalness,
      );
    }
    if (this.ui.inputs.materialRoughness) {
      const mrDefaults = getMaterialMrResetDefaults(!!state.material?.importUsesAuthoredPbr);
      const roughness = state.material?.roughness ?? mrDefaults.roughness;
      this._syncMaterialRangeSlider(
        this.ui.inputs.materialRoughness,
        'materialRoughness',
        roughness,
      );
    }
    if (this.ui.inputs.materialEmissive) {
      const emissive = state.material?.emissive ?? 0.0;
      this._syncMaterialRangeSlider(
        this.ui.inputs.materialEmissive,
        'materialEmissive',
        emissive,
      );
    }
    this.ui.syncMaterialMrMapTooltips?.(
      !!state.material?.importUsesAuthoredPbr,
      !!state.material?.importHasMrMaps,
    );
    syncSvgExtrudeControls(this._svgExtrudeCtx(), state, { requireEnabled: true });
    if (this.ui.inputs.reverseNormals) {
      this.ui.inputs.reverseNormals.checked = !!state.advanced?.reverseNormals;
    }
    if (this.ui.inputs.centerPivot) {
      this.ui.inputs.centerPivot.checked = !!state.advanced?.centerPivot;
    }
    const stlControlsVisible = this.resolveImportSmoothingControlsVisible();
    this.syncImportSmoothingControlsVisible(stlControlsVisible);
    if (this.ui.inputs.stlSmoothShading) {
      const smoothOn = !!state.advanced?.stlSmoothShading;
      this.ui.inputs.stlSmoothShading.checked = smoothOn;
      this.ui.setControlDisabled('stlSmoothShading', !stlControlsVisible);
    }
    if (this.ui.inputs.stlSmoothingAngle) {
      const rawAngle = Number(state.advanced?.stlSmoothingAngle ?? 40);
      const angle = Number.isFinite(rawAngle) ? Math.max(0, Math.min(180, rawAngle)) : 40;
      const smoothOn = !!state.advanced?.stlSmoothShading;
      const angleActive = document.activeElement === this.ui.inputs.stlSmoothingAngle;
      if (!angleActive) {
        this.ui.inputs.stlSmoothingAngle.value = angle;
        this.helpers.updateValueLabel('stlSmoothingAngle', angle, 'angle');
      }
      this.ui.setControlDisabled('stlSmoothingAngle', !stlControlsVisible || !smoothOn);
    }
    if (this.ui.inputs.uvChecker) {
      this.ui.inputs.uvChecker.checked = !!state.advanced?.uvChecker;
    }
    if (this.ui.inputs.normalView) {
      this.ui.inputs.normalView.checked = !!state.advanced?.normalView;
    }
    if (this.ui.inputs.normalViewMode) {
      const allowed = ['geometry', 'tangent'];
      const mode = state.advanced?.normalViewMode;
      this.ui.inputs.normalViewMode.value = allowed.includes(mode) ? mode : 'geometry';
      this.ui.setControlDisabled('normalViewMode', !state.advanced?.normalView);
    }
    if (this.ui.inputs.uvCheckerStyle) {
      const allowed = ['orby', 'classic', 'monochrome'];
      const raw = state.advanced?.uvCheckerStyle;
      const mapped = raw === 'vibrant' ? 'classic' : raw;
      this.ui.inputs.uvCheckerStyle.value = allowed.includes(mapped) ? mapped : 'orby';
      this.ui.setControlDisabled('uvCheckerStyle', !state.advanced?.uvChecker);
    }
    if (this.ui.inputs.uvCheckerScale) {
      const rawUv = Number(state.advanced?.uvCheckerScale ?? 5);
      const uvScale = Number.isFinite(rawUv) ? Math.max(0, Math.min(10, rawUv)) : 5;
      const active = document.activeElement === this.ui.inputs.uvCheckerScale;
      if (!active) {
        this.ui.inputs.uvCheckerScale.value = uvScale;
        this.helpers.updateValueLabel('uvCheckerScale', uvScale, 'decimal');
      }
      this.ui.setControlDisabled('uvCheckerScale', !state.advanced?.uvChecker);
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
      const t = state.advanced?.glassTint ?? ORBY_BLACK;
      const valid = typeof t === 'string' && /^#[0-9A-Fa-f]{6}$/.test(t) ? t : ORBY_BLACK;
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
    this.renderSvgColorDepthControls(state);
    this.ui.inputs.clayColor.value = state.clay.color;
    if (this.ui.inputs.clayNormalMap) {
      this.ui.inputs.clayNormalMap.checked = state.clay.normalMap !== false;
    }
    /* Subsurface UI sync — pair with MeshControls binding block above.
    if (this.ui.inputs.toggleSubsurface) {
      this.ui.inputs.toggleSubsurface.checked = !!state.subsurface?.enabled;
    }
    if (this.ui.inputs.subsurfaceTranslucency) {
      const tr = Math.min(1, Math.max(0, Number(state.subsurface?.translucency ?? 0)));
      const trSafe = Number.isFinite(tr) ? tr : 0;
      const active = document.activeElement === this.ui.inputs.subsurfaceTranslucency;
      if (!active) {
        this.ui.inputs.subsurfaceTranslucency.value = trSafe;
        this.helpers.updateValueLabel('subsurfaceTranslucency', trSafe, 'decimal');
      }
    }
    if (this.ui.inputs.subsurfaceScatterTint) {
      const st = state.subsurface?.scatterTint ?? '#ffd4b8';
      const valid =
        typeof st === 'string' && /^#[0-9A-Fa-f]{6}$/.test(st) ? st : '#ffd4b8';
      if (document.activeElement !== this.ui.inputs.subsurfaceScatterTint) {
        this.ui.inputs.subsurfaceScatterTint.value = valid;
      }
    }
    this.ui.setEffectControlsDisabled(
      ['subsurfaceTranslucency', 'subsurfaceScatterTint'],
      !state.subsurface?.enabled,
    );
    */
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
      if (this.ui.inputs.wireframeThickness) {
        this.ui.inputs.wireframeThickness.value =
          state.wireframe.thickness ?? DEFAULT_WIREFRAME_LINE_WIDTH;
        this.helpers.updateValueLabel(
          'wireframeThickness',
          state.wireframe.thickness ?? DEFAULT_WIREFRAME_LINE_WIDTH,
          'decimal',
        );
      }
    }

    {
      const sectionOpen =
        !!state.creativeLookSectionOpen || !!state.creativeLook?.enabled;
      const container = document.querySelector('#creativeLookSectionContainer');
      if (container) {
        container.classList.toggle('creative-look-foldout--collapsed', !sectionOpen);
        container.classList.toggle('creative-look-foldout--expanded', sectionOpen);
      }
    }

    if (this.ui.inputs.creativeLookEnabled) {
      this.ui.inputs.creativeLookEnabled.checked =
        !!state.creativeLookSectionOpen || !!state.creativeLook?.enabled;
    }
    const chosenPreset = resolveCreativeLookPresetChoice(state.creativeLook?.preset);
    const sectionOpen =
      !!state.creativeLookSectionOpen || !!state.creativeLook?.enabled;
    const clPreset = chosenPreset ?? normalizeCreativeLookPreset(null);
    const shaderAnimSupported = creativeLookPresetUsesShaderAnimation(clPreset);
    if (this.ui.inputs.creativeLookPauseAnimations) {
      const paused = !!state.creativeLook?.pauseShaderAnimations;
      this.ui.inputs.creativeLookPauseAnimations.classList.toggle('active', paused);
      this.ui.inputs.creativeLookPauseAnimations.textContent = paused
        ? 'Resume shader animations'
        : 'Pause shader animations';
      this.ui.setControlDisabled(
        'creativeLookPauseAnimations',
        !state.creativeLook?.enabled || !shaderAnimSupported,
      );
    }
    if (this.ui.inputs.creativeLookBloomEnabled) {
      const activeEl = document.activeElement;
      if (activeEl !== this.ui.inputs.creativeLookBloomEnabled) {
        this.ui.inputs.creativeLookBloomEnabled.checked = !!state.creativeLook?.viewportBloom;
      }
      this.ui.setControlDisabled(
        'creativeLookBloomEnabled',
        !state.creativeLook?.enabled,
      );
    }
    if (this.ui.inputs.creativeLookShaderAnimationSpeed) {
      const rawSp = Number(state.creativeLook?.shaderAnimationSpeed);
      const sp = Number.isFinite(rawSp) ? Math.min(2, Math.max(0, rawSp)) : 0.4;
      const active =
        document.activeElement === this.ui.inputs.creativeLookShaderAnimationSpeed;
      if (!active) {
        this.ui.inputs.creativeLookShaderAnimationSpeed.value = sp;
        this.helpers.updateValueLabel('creativeLookShaderAnimationSpeed', sp, 'decimal');
      }
      this.ui.setControlDisabled(
        'creativeLookShaderAnimationSpeed',
        !state.creativeLook?.enabled || !shaderAnimSupported,
      );
    }
    if (this.ui.inputs.creativeLookPatternScale) {
      const scaleLocked = creativeLookPresetLocksPatternScale(clPreset);
      const hidesScale = creativeLookPresetHidesPatternScale(clPreset);
      const patternScaleRow = document.getElementById('creativeLookPatternScaleRow');
      if (patternScaleRow) {
        patternScaleRow.hidden = hidesScale;
      }
      const rawScale = Number(state.creativeLook?.patternScale);
      const { min: scaleMin, max: scaleMax } = creativeLookPatternScaleBounds(clPreset);
      this.ui.inputs.creativeLookPatternScale.min = String(scaleMin);
      this.ui.inputs.creativeLookPatternScale.max = String(scaleMax);
      const patternScale = scaleLocked
        ? (creativeLookFixedPatternScale(clPreset) ?? 1)
        : normalizeCreativeLookPatternScale(clPreset, rawScale);
      const active =
        document.activeElement === this.ui.inputs.creativeLookPatternScale;
      if (!active) {
        this.ui.inputs.creativeLookPatternScale.value = patternScale;
        this.helpers.updateValueLabel(
          'creativeLookPatternScale',
          patternScale,
          'multiplier',
        );
      }
      this.ui.setControlDisabled(
        'creativeLookPatternScale',
        !state.creativeLook?.enabled || scaleLocked || hidesScale,
      );
    }
    this._syncCreativeLookPresetSliders(state, clPreset);
    this._syncCreativeLookInkControls(state, clPreset);
    if (this.ui.inputs.creativeLookMasterHue) {
      const hueLocked = creativeLookPresetLocksMasterHue(clPreset);
      const rawHue = Number(state.creativeLook?.masterHue);
      const masterHue = Number.isFinite(rawHue)
        ? Math.min(180, Math.max(-180, Math.round(rawHue)))
        : 0;
      const active = document.activeElement === this.ui.inputs.creativeLookMasterHue;
      if (!active) {
        this.ui.inputs.creativeLookMasterHue.value = masterHue;
        this.helpers.updateValueLabel('creativeLookMasterHue', masterHue, 'angle');
      }
      this.ui.setControlDisabled(
        'creativeLookMasterHue',
        !state.creativeLook?.enabled || hueLocked,
      );
    }
    if (this.ui.inputs.creativeLookIntensity) {
      const intensityLocked = creativeLookPresetLocksIntensity(clPreset);
      const rawIntensity = Number(state.creativeLook?.intensity);
      const intensity = intensityLocked
        ? (creativeLookFixedIntensity(clPreset) ?? 1)
        : Number.isFinite(rawIntensity)
          ? Math.min(2, Math.max(0, Math.round(rawIntensity * 100) / 100))
          : 1;
      const active = document.activeElement === this.ui.inputs.creativeLookIntensity;
      if (!active) {
        this.ui.inputs.creativeLookIntensity.value = intensity;
        this.helpers.updateValueLabel('creativeLookIntensity', intensity);
      }
      this.ui.setControlDisabled(
        'creativeLookIntensity',
        !state.creativeLook?.enabled || intensityLocked,
      );
    }
    if (this.ui.inputs.creativeLookLiftCrush) {
      const rawLiftCrush = Number(state.creativeLook?.liftCrush);
      const liftCrush = Number.isFinite(rawLiftCrush)
        ? Math.min(1, Math.max(-1, Math.round(rawLiftCrush * 100) / 100))
        : 0;
      const active = document.activeElement === this.ui.inputs.creativeLookLiftCrush;
      if (!active) {
        this.ui.inputs.creativeLookLiftCrush.value = liftCrush;
        this.helpers.updateValueLabel('creativeLookLiftCrush', liftCrush, 'signedDecimal');
      }
      this.ui.setControlDisabled('creativeLookLiftCrush', !state.creativeLook?.enabled);
    }
    this.ui.setCreativeLookActive?.(
      sectionOpen && chosenPreset ? chosenPreset : null,
    );
    this.ui.toggleCreativeLookGrid?.(
      !!state.creativeLookSectionOpen || !!state.creativeLook?.enabled,
    );
    this._syncCreativeLookVoxelHdAvailability(state);

    // Radio buttons
    this.ui.inputs.autoRotate.forEach((input) => {
      input.checked = parseFloat(input.value) === state.autoRotate;
    });
    if (this.ui.inputs.autoRotateDirection) {
      this.ui.inputs.autoRotateDirection.value =
        state.autoRotateDirection === 'reverse' ? 'reverse' : 'forward';
    }
    this.ui.inputs.shading.forEach((input) => {
      input.checked = input.value === state.shading;
    });

    // Wireframe mode now uses the overlay system, so overlay controls are always enabled
    // Users can adjust "Always on" and "Only visible faces" even when in Wireframe mode
  }

  /** Block Voxel HD on generated text; exit the preset if it was active. */
  _syncCreativeLookVoxelHdAvailability(state = this.stateStore.getState()) {
    const model = window.orby?.scene?.currentModel ?? null;
    const blocked = isFontExtrudeRevealModel(model);
    this.ui.setCreativeLookVoxelHdBlocked?.(blocked);
    if (
      blocked &&
      state.creativeLook?.enabled &&
      isVoxelCreativeLookPreset(normalizeCreativeLookPreset(state.creativeLook.preset))
    ) {
      this.stateStore.set('creativeLook.enabled', false);
      this.ui.setCreativeLookActive?.(null);
      this.eventBus.emit('mesh:creative-look');
    }
  }

  _bindCreativeLookPresetSliders() {
    const bindOne = (inputId, stateKey, normalize, formatValue) => {
      const input = this.ui.inputs[inputId];
      if (!input) return;
      input.addEventListener('input', (event) => {
        const preset = normalizeCreativeLookPreset(
          this.stateStore.getState().creativeLook?.preset,
        );
        if (preset !== 'sketch' && preset !== 'sketch-colour') return;
        const value = parseFloat(event.target.value);
        if (!Number.isFinite(value)) return;
        const clamped = normalize(value);
        const customLabel = formatValue?.(clamped);
        if (customLabel != null) {
          this.helpers.updateValueLabel(inputId, customLabel);
        } else {
          this.helpers.updateValueLabel(inputId, clamped, 'multiplier');
        }
        this.stateStore.set(`creativeLook.presetParams.sketch.${stateKey}`, clamped);
        this.eventBus.emit('mesh:creative-look');
      });
      this.helpers.enableSliderKeyboardStepping(input);
    };
    bindOne(
      'creativeLookSketchStrokeWidth',
      'strokeWidth',
      normalizeCreativeLookSketchStrokeWidth,
    );
    bindOne(
      'creativeLookSketchRasterSize',
      'rasterSize',
      normalizeCreativeLookSketchRasterSize,
      (value) => (value <= 0 ? 'Off' : null),
    );
  }

  _bindCreativeLookInkControls() {
    const color = this.ui.inputs.creativeLookInkStrokeColor;
    color?.addEventListener('input', (event) => {
      const preset = normalizeCreativeLookPreset(
        this.stateStore.getState().creativeLook?.preset,
      );
      if (!creativeLookInkControlsVisible(preset)) return;
      this.stateStore.set(
        'creativeLook.presetParams.ink.strokeColor',
        normalizeCreativeLookStrokeColor(event.target.value),
      );
      this.eventBus.emit('mesh:creative-look');
    });
  }

  _syncCreativeLookInkControls(state, clPreset) {
    const enabled = !!state.creativeLook?.enabled;
    const inkVisible = creativeLookInkControlsVisible(clPreset, enabled);

    document
      .querySelectorAll('.creative-look-preset-ink[data-ink-control="strokeColor"]')
      .forEach((row) => {
        row.hidden = !inkVisible;
      });

    if (!inkVisible) return;

    const ink = resolveCreativeLookInkParams(state.creativeLook?.presetParams, clPreset);
    const colorInput = this.ui.inputs.creativeLookInkStrokeColor;
    if (colorInput && document.activeElement !== colorInput) {
      colorInput.value = ink.strokeColor;
    }
    this.ui.setControlDisabled('creativeLookInkStrokeColor', !enabled);
  }

  _syncCreativeLookPresetSliders(state, clPreset) {
    const defs = getCreativeLookPresetSliderDefs(clPreset);
    const enabled = !!state.creativeLook?.enabled;
    const visibleIds = new Set(defs.map((def) => def.id));
    const root = document.getElementById('creativeLookPresetSliders');
    const inkVisible = creativeLookInkControlsVisible(clPreset, enabled);
    if (root) {
      root.hidden = visibleIds.size === 0 && !inkVisible;
    }
    for (const sliderId of CREATIVE_LOOK_ALL_PRESET_SLIDER_IDS) {
      const row = document.querySelector(
        `.creative-look-preset-slider[data-slider-id="${sliderId}"]`,
      );
      if (row) {
        row.hidden = !enabled || !visibleIds.has(sliderId);
      }
    }
    if (defs.length === 0) return;

    const sketchParams = resolveCreativeLookSketchParams(
      state.creativeLook?.presetParams,
      state.creativeLook?.patternScale,
    );
    for (const def of defs) {
      const input = this.ui.inputs[def.id];
      if (!input) continue;
      input.min = String(def.min);
      input.max = String(def.max);
      const value = def.stateKey === 'strokeWidth'
        ? sketchParams.strokeWidth
        : sketchParams.rasterSize;
      const active = document.activeElement === input;
      if (!active) {
        input.value = value;
        if (def.stateKey === 'rasterSize' && value <= 0) {
          this.helpers.updateValueLabel(def.id, 'Off');
        } else {
          this.helpers.updateValueLabel(def.id, value, def.format ?? 'multiplier');
        }
      }
      this.ui.setControlDisabled(def.id, !enabled);
    }
  }

  renderSvgColorDepthControls(state) {
    renderSvgColorDepthControls(this.ui.inputs.svgExtrudeColorDepths, state, this.ui);
  }
}

