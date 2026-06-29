/**
 * ResetControls - Handles all reset button logic
 * Manages copy/paste scene settings, and local/section reset buttons
 */
import {
  CAMERA_TEMPERATURE_NEUTRAL_K,
  cameraShadowsUiToShader,
  DEFAULT_MATERIAL_BRIGHTNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  getMaterialMrResetDefaults,
  DEFAULT_BACKDROP_METALNESS,
  DEFAULT_BACKDROP_ROUGHNESS,
  effectiveVignetteIntensity,
} from '../constants.js';
import { deepEqual } from '../utils/deepEqual.js';
import { animateModalClose, animateModalOpen } from './modalReveal.js';
import { normalizeCreativeLookPreset } from '../render/CreativeLookMaterials.js';
import { GOBO_UI_DEFAULT } from '../render/GoboProjection.js';
import { DEFAULT_GOBO_SOFTNESS } from '../config/gobos.js';
import { DEFAULT_LIGHTS_SHADOW_SOFTNESS } from '../config/shadowQuality.js';
import {
  emitGodRaysStudioEvents,
  godRaysStateAfterSectionReset,
  godRaysStateForResetCompare,
} from '../GodRaysEffect.js';
import {
  DEFAULT_CAMERA_POSITION,
  defaultCameraDistance,
} from '../camera/cameraDefaults.js';
import { resetSvgExtrudeState } from '../import/extrudeDefaults.js';

/**
 * For each `data-reset` value in the markup, the set of state paths whose
 * values are restored by that reset button. The same paths are read by
 * `updateResetVisibility` to decide whether the section currently differs
 * from defaults — when combined with `_touchedResetTypes` (the user has
 * actually changed something in this section), the reset icon shows.
 *
 * Paths use dot notation (e.g. `material.brightness`). Bare top-level keys
 * (e.g. `clay`) compare the whole subtree.
 *
 * Keep this map in sync with the corresponding `case` blocks in
 * `bindLocalResetButtons`: every path written there should appear here.
 */
const RESET_DIRTY_PATHS = {
  material: ['material.brightness', 'material.metalness', 'material.roughness', 'material.emissive'],
  clay: ['clay'],
  subsurface: ['subsurface'],
  wireframe: ['wireframe'],
  'creative-look': ['creativeLook'],
  hdri: ['hdri', 'hdriStrength', 'hdriBlurriness', 'hdriRotation', 'hdriBackground', 'hdriReceiveShadowsAo', 'lensFlare'],
  'lens-flare': ['lensFlare'],
  'volumetric-scattering': ['godRays'],
  lights: [
    'lights', 'lightsMaster', 'lightsRotation', 'lightsHeight',
    'lightsShadowQuality', 'lightsShadowSoftness', 'lightsShadowColor', 'lightsShadowOpacity',
    'lightsShadowContactOffset', 'lightsShadowNormalBias', 'lightsShadowTwoSided',
  ],
  'lights-shadows': [
    'lightsCastShadows', 'lightsShadowQuality', 'lightsShadowSoftness',
    'lightsShadowColor', 'lightsShadowOpacity', 'lightsShadowContactOffset', 'lightsShadowNormalBias', 'lightsShadowTwoSided',
  ],
  keyLight: ['lights.key', 'gobo'],
  fillLight: ['lights.fill'],
  rimLight: ['lights.rim'],
  ambientLight: ['lights.ambient'],
  base: [
    'groundSolidColor', 'groundY', 'baseScale',
    'baseMetalness', 'baseRoughness', 'baseReflection', 'baseClearcoat',
    'baseSurfacePreset', 'baseSurfaceScale', 'baseSurfaceStrength',
  ],
  'base-glass': [
    'baseGlassSurface', 'baseGlassBrightness', 'baseGlassBlur', 'baseGlassAmount',
    'baseSurfacePreset', 'baseSurfaceScale', 'baseSurfaceStrength',
  ],
  backdrop: [
    'backdropEnabled', 'backdropScale', 'backdropWidth', 'backdropColor',
    'backdropRotation', 'backdropY', 'backdropMetalness', 'backdropRoughness',
    'backdropSurfacePreset', 'backdropSurfaceScale', 'backdropSurfaceStrength',
  ],
  background: ['background', 'backgroundSolidEnabled', 'backgroundGradient', 'backgroundImage'],
  grid: ['groundWireColor', 'groundWireOpacity', 'gridLineWidth', 'gridY', 'gridScale'],
  dof: ['dof'],
  bloom: ['bloom'],
  'anamorphic-bloom': ['lensFlare.anamorphicBloom'],
  'lens-dirt': ['lensDirt'],
  grain: ['grain'],
  aberration: ['aberration'],
  'color-checker': ['colorChecker'],
  'ambient-occlusion': ['ambientOcclusion'],
  fresnel: ['fresnel'],
  lens: ['camera.fov', 'camera.lensFocalMm', 'camera.lensSensorId'],
  isometric: ['camera.isometric'],
  camera: [
    'camera.tilt',
    'camera.worldPosition',
    'camera.distance',
    'camera.autoOrbit', 'camera.handheld',
    'exposure', 'autoExposure',
    'camera.clipPlanes',
    'camera.vignetteEnabled', 'camera.vignette', 'camera.vignetteColor',
    'camera.compositionGridEnabled',
    'camera.compositionGuidesInverted',
    'camera.compositionPortraitCropGuide',
    'camera.cinematicLetterbox219',
  ],
  fisheye: ['fisheye'],
  'color-correction': [
    'camera.contrast', 'camera.temperature', 'camera.tint',
    'camera.highlights', 'camera.shadows', 'camera.saturation',
    'camera.clarity', 'camera.fade', 'camera.sharpness',
  ],
  vignette: ['camera.vignetteEnabled', 'camera.vignette', 'camera.vignetteColor'],
  'tone-curve': ['toneCurve'],
  transform: [
    'scale', 'xOffset', 'yOffset', 'zOffset',
    'rotationX', 'rotationY', 'rotationZ',
  ],
  'svg-extrude': [
    'svgExtrude.depth', 'svgExtrude.normalAngle', 'svgExtrude.hardEdgeAngle',
    'svgExtrude.bevelAmount', 'svgExtrude.detail',
    'svgExtrude.colorDepths', 'svgExtrude.colorOffsets', 'svgExtrude.colorReplacements',
    'svgExtrude.flipDirection', 'svgExtrude.colorOverride',
    'svgExtrude.overrideColor', 'svgExtrude.surfacePreset', 'svgExtrude.surfaceScale', 'svgExtrude.surfaceStrength',
  ],
  advanced: [
    'advanced.reverseNormals', 'advanced.transparencyFix',
    'advanced.glassOpacity', 'advanced.glassReflection',
    'advanced.glassTint', 'advanced.glassBody',
    'advanced.blendSortingMitigation',
    'advanced.flipGlassNormalMapY', 'advanced.glassFrontFacesOnly',
    'advanced.physicalGlassTransmission',
    'advanced.uvChecker', 'advanced.uvCheckerScale', 'advanced.uvCheckerStyle',
    'advanced.normalView', 'advanced.normalViewMode',
    'advanced.stlSmoothShading', 'advanced.stlSmoothingAngle',
  ],
};

/** HDRI section reset — dirty paths plus custom asset keys cleared on reset. */
const HDRI_SECTION_RESET_PATHS = [
  ...RESET_DIRTY_PATHS.hdri,
  'hdriCustomName',
  'hdriCustomAsset',
];

/** Lights block reset — subset of dirty paths (does not touch castShadows / normalBias). */
const LIGHTS_SECTION_RESET_PATHS = [
  'lights',
  'lightsMaster',
  'lightsRotation',
  'lightsHeight',
  'lightsShadowQuality',
  'lightsShadowSoftness',
  'lightsShadowColor',
  'lightsShadowOpacity',
  'lightsShadowContactOffset',
  'lightsShadowTwoSided',
];

/** Tab-level Mesh / Studio / Render reset path lists. */
const MESH_TAB_RESET_PATHS = [
  'shading',
  ...RESET_DIRTY_PATHS.transform,
  'autoRotate',
  'autoRotateDirection',
  'clay',
  'fresnel',
  'subsurface',
  ...RESET_DIRTY_PATHS.advanced,
];

const STUDIO_TAB_RESET_PATHS = [
  'hdri',
  'hdriEnabled',
  'hdriStrength',
  'hdriBlurriness',
  'hdriBackground',
  'hdriReceiveShadowsAo',
  'groundSolid',
  'groundWire',
  'groundWireOpacity',
  'groundY',
  'groundSolidColor',
  ...RESET_DIRTY_PATHS.backdrop,
  'groundWireColor',
  ...RESET_DIRTY_PATHS.background,
  'lights',
  'lightsEnabled',
  'lightsMaster',
  'lightsRotation',
  'lightsHeight',
  'lightsAutoRotate',
  'showLightIndicators',
  'lensFlare',
  'godRays',
  'lightsCastShadows',
  'lightsShadowQuality',
  'lightsShadowSoftness',
  'lightsShadowColor',
  'lightsShadowOpacity',
  'lightsShadowContactOffset',
  'lightsShadowNormalBias',
  'lightsShadowTwoSided',
];

const RENDER_TAB_RESET_PATHS = [
  ...RESET_DIRTY_PATHS.dof,
  ...RESET_DIRTY_PATHS.bloom,
  ...RESET_DIRTY_PATHS.grain,
  ...RESET_DIRTY_PATHS.aberration,
  ...RESET_DIRTY_PATHS['ambient-occlusion'],
  ...RESET_DIRTY_PATHS.fresnel,
  ...RESET_DIRTY_PATHS.fisheye,
  'camera',
  'exposure',
  'autoExposure',
  'antiAliasing',
  'renderQuality',
  'svgColorDetail',
  ...RESET_DIRTY_PATHS['tone-curve'],
  'toneMapping',
];

/**
 * Sections whose dirty state should compare normalized values (legacy keys, etc.).
 * @type {Record<string, (state: object, defaults: object) => boolean>}
 */
const RESET_DIRTY_NORMALIZERS = {
  'volumetric-scattering': (state, defaults) => {
    const defGod = defaults?.godRays ?? {};
    return !deepEqual(
      godRaysStateForResetCompare(getAtPath(state, 'godRays'), defGod),
      godRaysStateForResetCompare(defGod, defGod),
    );
  },
};

function getAtPath(obj, path) {
  if (!path) return obj;
  const segments = path.split('.');
  let current = obj;
  for (const seg of segments) {
    if (current == null) return undefined;
    current = current[seg];
  }
  return current;
}

/** Toast copy for `[data-reset]` block buttons (shown after each section reset). */
const BLOCK_RESET_TOASTS = {
  material: 'Material reset',
  clay: 'Clay reset',
  wireframe: 'Wireframe reset',
  'creative-look': 'Creative look reset',
  hdri: 'HDRI reset',
  'lens-flare': 'Lens flare reset',
  'volumetric-scattering': 'Light Rays reset',
  lights: 'Lights reset',
  'lights-shadows': 'Shadows reset',
  keyLight: 'Key light reset',
  fillLight: 'Fill light reset',
  rimLight: 'Rim light reset',
  ambientLight: 'Ambient light reset',
  base: 'Base reset',
  'base-glass': 'Base glass reset',
  backdrop: 'Backdrop reset',
  background: 'Background color and gradient reset',
  grid: 'Grid reset',
  dof: 'Depth of field reset',
  bloom: 'Bloom reset',
  'anamorphic-bloom': 'Anamorphic bloom reset',
  'lens-dirt': 'Lens dirt reset',
  grain: 'Grain reset',
  aberration: 'Chromatic aberration reset',
  'color-checker': 'ColorChecker reset',
  'ambient-occlusion': 'Ambient occlusion reset',
  fresnel: 'Fresnel reset',
  lens: 'Lens reset',
  camera: 'Camera reset',
  isometric: 'Isometric camera reset',
  fisheye: 'Fisheye lens reset',
  'color-correction': 'Color correction reset',
  vignette: 'Vignette reset',
  'tone-curve': 'Tone curve reset',
  transform: 'Transform reset',
  'svg-extrude': 'SVG Extrude settings reset',
  advanced: 'Advanced reset',
};

export class ResetControls {
  constructor(eventBus, stateStore, uiManager, helpers) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    this.helpers = helpers;
    /** Reset types whose section the user has interacted with this session. */
    this._touchedResetTypes = new Set();
    /** Per reset button: { type, scope, button }. `scope` is the DOM ancestor
     *  whose descendants count as "this section's controls" for touch
     *  detection. We resolve it once at bind time. */
    this._resetScopes = [];
  }

  bind() {
    this.bindCopyButtons();
    this.bindLocalResetButtons();
    this.bindResetVisibility();
  }

  /**
   * Reset icons are hidden by default. They appear once the user actually
   * interacts with a control inside that section — sliders, color pickers,
   * checkboxes, dropdowns, or `<button>` clicks like "Snap to Mesh".
   * Reveal toggles (row before a foldout), section headline toggles, and
   * `<details>` expand/collapse do not count.
   *
   * Comparing state against `getDefaults()` directly is not enough because
   * the app does plenty of automatic startup normalization (HDRI mood
   * tinting Bloom, model-bottom alignment moving Grid/Podium/Backdrop Y,
   * etc.) before the user touches anything. Those automatic mutations
   * should not light up reset icons.
   *
   * Per-section "touched" tracking sidesteps all of that timing: the icon
   * stays hidden until the user explicitly changes something in that
   * section, regardless of what happens to state in the meantime.
   */
  bindResetVisibility() {
    this._resetButtons = Array.from(document.querySelectorAll('[data-reset]'));
    this._resetScopes = this._resetButtons
      .map((button) => {
        const type = (button.dataset.reset ?? '').trim();
        if (!type) return null;
        // Closest container that holds this section's controls. Subsections
        // are most specific; fall back to a `[data-block]` panel block (used
        // by the top-level Lights reset which lives directly under
        // `.panel-block.lights`); finally the panel block itself.
        const scope =
          button.closest('[data-subsection]') ||
          button.closest('[data-block]') ||
          button.closest('.panel-block') ||
          button.parentElement;
        return { type, scope, button };
      })
      .filter(Boolean);

    // Defaults are immutable in StateStore; cache once instead of cloning
    // them on every state change (slider drags fire many notifications/sec).
    this._cachedDefaults = this.stateStore.getDefaults();

    const isRevealOnlyFoldoutToggle = (el) => {
      const input =
        el instanceof HTMLInputElement
          ? el
          : el.closest?.('.effect-toggle input[type="checkbox"], .effect-toggle input[type="radio"]');
      if (!(input instanceof HTMLInputElement)) return false;
      const row = input.closest('.slider-line');
      return !!row?.matches(':has(+ .effect-foldout)');
    };

    const markTouched = (target) => {
      if (!(target instanceof Element)) return false;
      // Clicks/inputs on the reset button itself don't count as touching
      // the section — that's the user undoing changes, not making new ones.
      if (target.closest('[data-reset]')) return false;
      // Anything inside `.block-title` is a meta-control of the section
      // (the title text, the reset button, or the master enable toggle that
      // mutes/unmutes the whole section). Flipping the master toggle should
      // not count as a "change" the user can undo with reset — the section's
      // settings haven't actually moved away from defaults yet.
      if (target.closest('.block-title')) return false;
      // Row toggle immediately before a foldout (e.g. Advanced → UV Checker) —
      // reveals nested controls only; inner sliders/selects mark the section.
      if (isRevealOnlyFoldoutToggle(target)) return false;
      // `<details>` / Rare Fixes — expand/collapse is not a setting change.
      if (target.closest('summary')) return false;
      for (const { type, scope } of this._resetScopes) {
        if (scope?.contains(target)) {
          this._touchedResetTypes.add(type);
        }
      }
      // No need to update visibility here — the bound input/click handler
      // will trigger a `stateStore.set`, which fires our subscriber below
      // and re-evaluates with fresh state.
    };

    const handleControlChange = (event) => markTouched(event.target);
    document.addEventListener('input', handleControlChange, true);
    document.addEventListener('change', handleControlChange, true);

    // Some controls are plain buttons (e.g. "Snap to Mesh") that don't fire
    // input/change. Pick those up via click — but ignore the reset button
    // itself, which is excluded by `markTouched`.
    const handleClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('summary')) return;
      const button = target.closest('button');
      if (!button) return;
      markTouched(button);
    };
    document.addEventListener('click', handleClick, true);

    this.stateStore.subscribe((state) => this.updateResetVisibility(state));

    /** Canvas/pointer editors (e.g. tone curve) don't emit input/change; mark section touched explicitly. */
    this.eventBus.on('ui:reset-section-touched', (type) => {
      const t = typeof type === 'string' ? type.trim() : '';
      if (!t) return;
      this._touchedResetTypes.add(t);
      this.updateResetVisibility(this.stateStore.getState());
    });

    this.updateResetVisibility(this.stateStore.getState());
  }

  /**
   * Mark a section as untouched so its reset icon hides again. Called after
   * the user clicks a section's reset button — the section is now back at
   * defaults and should behave like a fresh, untouched section.
   */
  clearResetTouched(type) {
    if (!type) return;
    this._touchedResetTypes.delete(type);
  }

  updateResetVisibility(state) {
    if (!this._resetButtons || this._resetButtons.length === 0) return;
    // Lazy fallback if visibility is asked for before bindResetVisibility ran.
    const defaults = this._cachedDefaults ?? this.stateStore.getDefaults();
    for (const button of this._resetButtons) {
      const type = (button.dataset.reset ?? '').trim();
      // Transform: show whenever values differ from defaults. Gizmo drags and
      // programmatic slider sync do not fire input/change on panel controls.
      const requiresTouch = type !== 'transform';
      if (requiresTouch && !this._touchedResetTypes.has(type)) {
        button.classList.remove('is-dirty');
        continue;
      }
      const normalizeDirty = RESET_DIRTY_NORMALIZERS[type];
      const paths = RESET_DIRTY_PATHS[type];
      let dirty = false;
      if (normalizeDirty) {
        dirty = normalizeDirty(state, defaults);
      } else if (paths) {
        for (const path of paths) {
          if (!deepEqual(getAtPath(state, path), getAtPath(defaults, path))) {
            dirty = true;
            break;
          }
        }
      } else {
        dirty = true;
      }
      button.classList.toggle('is-dirty', dirty);
    }
  }

  bindCopyButtons() {
    // Copy Scene Settings
    const copyScene = async () => {
      const result = await this.ui.sceneSettingsManager.copyToClipboard();
      this.helpers.showToast(result.message, 3200, { notification: false });
    };
    this.ui.buttons.copySceneButtons?.forEach(button => {
      button.addEventListener('click', copyScene);
    });
    const saveOrby = async () => {
      const result = await this.ui.sceneSettingsManager.saveOrbyToFile();
      this.helpers.showToast(result.message, 3200, { notification: false });
    };
    this.ui.buttons.saveOrbyButtons?.forEach((button) => {
      button.addEventListener('click', saveOrby);
    });
    this.ui.buttons.loadOrbyButtons?.forEach((button) => {
      button.addEventListener('click', () => {
        this.ui.buttons.fileInput?.click();
      });
    });

    // Paste scene settings — show modal
    this.ui.buttons.loadSceneButtons?.forEach(button => {
      button.addEventListener('click', () => {
        const modal = this.ui.buttons.loadSceneModal;
        const text = this.ui.buttons.loadSceneText;
        if (!modal) return;
        const panel = modal.querySelector('.load-settings-content');
        this.ui.uiSounds?.playShelfShow();
        void animateModalOpen(modal, panel).then(async () => {
          if (!text) return;
          text.focus();
          // Only auto-prefill when clipboard-read is already granted. Calling readText() on
          // a 'prompt' state shows the permission prompt; if dismissed several times Chromium
          // auto-blocks the permission and logs a ClipboardReadWrite warning to the console.
          // Cmd-V into the focused textarea still works in every case.
          try {
            const perm = await navigator.permissions?.query?.({ name: 'clipboard-read' });
            if (perm?.state !== 'granted') return;
            const clip = await navigator.clipboard?.readText?.();
            if (typeof clip === 'string' && this.ui.buttons.loadSceneText) {
              this.ui.buttons.loadSceneText.value = clip;
            }
          } catch (_e) {
            // Permissions API unsupported, query rejected, or read failed — skip silently.
          }
        });
      });
    });

    // Close scene modal
    const closeSceneModal = () => {
      const modal = this.ui.buttons.loadSceneModal;
      if (!modal) return;
      const panel = modal.querySelector('.load-settings-content');
      animateModalClose(modal, panel, () => {
        if (this.ui.buttons.loadSceneText) {
          this.ui.buttons.loadSceneText.value = '';
        }
      });
    };

    this.ui.buttons.closeLoadSceneSettings?.addEventListener('click', closeSceneModal);
    this.ui.buttons.cancelLoadSceneSettings?.addEventListener('click', closeSceneModal);
    
    this.ui.buttons.loadSceneModal?.addEventListener('click', (event) => {
      if (event.target === this.ui.buttons.loadSceneModal) {
        closeSceneModal();
      }
    });

    // Apply scene settings
    this.ui.buttons.applySceneSettings?.addEventListener('click', () => {
      const text = this.ui.buttons.loadSceneText?.value?.trim();
      if (text) {
        void this.ui.sceneSettingsManager.loadFromText(text).then((result) => {
          if (result.success) {
            this.ui.syncControls(this.stateStore.getState());
          }
          this.helpers.showToast(result.message, 3200, { notification: false });
          if (result.success) {
            closeSceneModal();
          }
        });
      }
    });

    // Reset buttons (Mesh, Studio, Render)
    const resetMesh = () => {
      this.ui.uiSounds?.playSelect();
      const defaults = this.stateStore.getDefaults();
      this.stateStore.batch(() => {
        this.stateStore.resetSlice(MESH_TAB_RESET_PATHS);
        const mrDefaults = getMaterialMrResetDefaults(
          !!this.stateStore.getState().material?.importUsesAuthoredPbr,
        );
        this.stateStore.set('material.brightness', defaults.material?.brightness ?? mrDefaults.brightness);
        this.stateStore.set('material.metalness', defaults.material?.metalness ?? mrDefaults.metalness);
        this.stateStore.set('material.roughness', defaults.material?.roughness ?? mrDefaults.roughness);
        this.stateStore.set('material.emissive', defaults.material?.emissive ?? 0.0);
      });
      this.eventBus.emit('scene:batch-apply-start');
      try {
      this.eventBus.emit('mesh:shading', defaults.shading);
      this.eventBus.emit('mesh:scale', defaults.scale);
      this.eventBus.emit('mesh:xOffset', defaults.xOffset ?? 0);
      this.eventBus.emit('mesh:yOffset', defaults.yOffset);
      this.eventBus.emit('mesh:zOffset', defaults.zOffset ?? 0);
      this.eventBus.emit('mesh:rotationX', defaults.rotationX ?? 0);
      this.eventBus.emit('mesh:rotationY', defaults.rotationY ?? 0);
      this.eventBus.emit('mesh:rotationZ', defaults.rotationZ ?? 0);
      this.eventBus.emit('mesh:auto-rotate', defaults.autoRotate);
      this.eventBus.emit('mesh:auto-rotate-direction', defaults.autoRotateDirection ?? 'forward');
      this.eventBus.emit('mesh:clay-color', defaults.clay.color);
      this.eventBus.emit('mesh:clay-normal-map', defaults.clay.normalMap);
      // Emit material reset events
      {
        const mrDefaults = getMaterialMrResetDefaults(
          !!this.stateStore.getState().material?.importUsesAuthoredPbr,
        );
        this.eventBus.emit('mesh:material-brightness', defaults.material?.brightness ?? mrDefaults.brightness);
        this.eventBus.emit('mesh:material-metalness', defaults.material?.metalness ?? mrDefaults.metalness);
        this.eventBus.emit('mesh:material-roughness', defaults.material?.roughness ?? mrDefaults.roughness);
        this.eventBus.emit('mesh:material-emissive', defaults.material?.emissive ?? 0.0);
      }
      this.eventBus.emit('render:fresnel', defaults.fresnel);
      this.eventBus.emit('mesh:subsurface', defaults.subsurface);
      resetSvgExtrudeState(this.stateStore, this.eventBus, defaults);
      this.eventBus.emit('mesh:reverse-normals', defaults.advanced?.reverseNormals ?? false);
      this.eventBus.emit('mesh:transparency-fix');
      this.eventBus.emit('mesh:glass-appearance');
      this.eventBus.emit('mesh:uv-checker', defaults.advanced?.uvChecker ?? false);
      this.eventBus.emit(
        'mesh:uv-checker-scale',
        defaults.advanced?.uvCheckerScale ?? 5,
      );
      this.eventBus.emit(
        'mesh:uv-checker-style',
        defaults.advanced?.uvCheckerStyle ?? 'orby',
      );
      this.eventBus.emit('mesh:normal-view', defaults.advanced?.normalView ?? false);
      this.eventBus.emit(
        'mesh:normal-view-mode',
        defaults.advanced?.normalViewMode ?? 'geometry',
      );
      this.eventBus.emit('mesh:stl-smoothing');
      this.eventBus.emit('mesh:recenter-pivot', { showToast: false });

      this.ui.syncUIFromState();
      this.helpers.showToast('Mesh settings reset', 3200, { notification: false });
      } finally {
        this.eventBus.emit('scene:batch-apply-end');
      }
    };

    const resetStudio = () => {
      this.ui.uiSounds?.playSelect();
      const defaults = this.stateStore.getDefaults();
      if (this.stateStore.getState().lensFlare?.keyLightConnected) {
        this.eventBus.emit('studio:lens-flare-key-light-connected', false);
      }
      this.stateStore.resetSlice(STUDIO_TAB_RESET_PATHS);
      this.ui.setHdriActive(defaults.hdri);
      this.eventBus.emit('studio:hdri', defaults.hdri);
      this.eventBus.emit('studio:hdri-enabled', defaults.hdriEnabled);
      this.ui.toggleHdriControls(defaults.hdriEnabled);
      this.eventBus.emit('studio:hdri-strength', defaults.hdriStrength);
      this.eventBus.emit('studio:hdri-blurriness', defaults.hdriBlurriness);
      this.eventBus.emit('studio:hdri-background', defaults.hdriBackground);
      this.eventBus.emit('studio:hdri-receive-shadows-ao', defaults.hdriReceiveShadowsAo);
      this.ui.updateHdriReceiveShadowsAoDisabled?.();
      // Ensure lens flare toggle is fully reset (state + event + UI sync)
      this.eventBus.emit('studio:lens-flare-enabled', defaults.lensFlare.enabled);
      this.eventBus.emit('studio:lens-flare-rotation', defaults.lensFlare.rotation);
      this.eventBus.emit('studio:lens-flare-height', defaults.lensFlare.height);
      this.eventBus.emit('studio:lens-flare-color', defaults.lensFlare.color);
      this.eventBus.emit('studio:lens-flare-quality', defaults.lensFlare.quality);
      this.eventBus.emit(
        'studio:lens-flare-spin-during-orbit',
        !!defaults.lensFlare.spinDuringOrbit,
      );
      this.eventBus.emit('studio:lens-flare-halo', defaults.lensFlare.haloIntensity);
      this.eventBus.emit('studio:lens-flare-streak-length', defaults.lensFlare.streakLength);
      this.eventBus.emit('studio:lens-flare-sun-disc-scale', defaults.lensFlare.sunDiscScale);
      this.eventBus.emit('studio:lens-flare-sun-disc-blur', defaults.lensFlare.sunDiscBlur);
      this.eventBus.emit('studio:lens-flare-sun-disc-color', defaults.lensFlare.sunDiscColor);
      this.eventBus.emit('studio:lens-flare-disc-glow-intensity', defaults.lensFlare.discGlowIntensity);
      this.eventBus.emit('studio:lens-flare-disc-glow-size', defaults.lensFlare.discGlowSize);
      this.eventBus.emit('studio:lens-flare-disc-glow-color', defaults.lensFlare.discGlowColor);
      this.eventBus.emit('studio:lens-flare-anamorphic-bloom');
      emitGodRaysStudioEvents(this.eventBus, defaults.godRays, defaults.godRays);
      this.eventBus.emit('studio:ground-solid', defaults.groundSolid);
      this.eventBus.emit('studio:ground-wire', defaults.groundWire);
      this.eventBus.emit('studio:ground-wire-opacity', defaults.groundWireOpacity);
      this.eventBus.emit('studio:ground-y', defaults.groundY);
      this.eventBus.emit('studio:ground-solid-color', defaults.groundSolidColor);
      this.eventBus.emit('studio:backdrop-enabled', defaults.backdropEnabled ?? false);
      this.eventBus.emit('studio:backdrop-scale', defaults.backdropScale ?? 1);
      this.eventBus.emit('studio:backdrop-width', defaults.backdropWidth ?? 2);
      this.eventBus.emit('studio:backdrop-color', defaults.backdropColor ?? '#808080');
      this.eventBus.emit('studio:backdrop-rotation', defaults.backdropRotation ?? 0);
      this.eventBus.emit('studio:backdrop-y', defaults.backdropY ?? 0);
      this.eventBus.emit('studio:backdrop-metalness', defaults.backdropMetalness ?? DEFAULT_BACKDROP_METALNESS);
      this.eventBus.emit('studio:backdrop-roughness', defaults.backdropRoughness ?? DEFAULT_BACKDROP_ROUGHNESS);
      this.eventBus.emit('studio:backdrop-surface', {
        preset: defaults.backdropSurfacePreset ?? 'none',
        scale: defaults.backdropSurfaceScale ?? 1,
        strength: defaults.backdropSurfaceStrength ?? 1,
      });
      this.eventBus.emit('studio:ground-wire-color', defaults.groundWireColor);
      this.eventBus.emit('scene:background', defaults.background);
      this.eventBus.emit('scene:background-solid-enabled', defaults.backgroundSolidEnabled);
      this.eventBus.emit('scene:background-gradient', defaults.backgroundGradient);
      this.eventBus.emit('scene:background-image', defaults.backgroundImage);
      window.orby?.scene?.backgroundImageController?.setImage?.(null);

      Object.keys(defaults.lights).forEach((lightId) => {
        const light = defaults.lights[lightId];
        this.eventBus.emit('lights:update', { lightId, property: 'color', value: light.color });
        this.eventBus.emit('lights:update', { lightId, property: 'intensity', value: light.intensity });
      });
      this.eventBus.emit('lights:master', defaults.lightsMaster);
      this.eventBus.emit('lights:enabled', defaults.lightsEnabled);
      this.eventBus.emit('lights:rotate', defaults.lightsRotation);
      this.eventBus.emit('lights:height', defaults.lightsHeight ?? 5);
      this.eventBus.emit('lights:auto-rotate', defaults.lightsAutoRotate);
      this.ui.setLightsRotationDisabled(defaults.lightsAutoRotate);
      this.eventBus.emit('lights:shadow-settings', {
        castShadows: defaults.lightsCastShadows,
        quality: defaults.lightsShadowQuality ?? 'medium',
        softness: defaults.lightsShadowSoftness ?? DEFAULT_LIGHTS_SHADOW_SOFTNESS,
        color: defaults.lightsShadowColor ?? '#080808',
        opacity: defaults.lightsShadowOpacity ?? 0.25,
        contactOffset: defaults.lightsShadowContactOffset ?? -0.0005,
        normalBias: defaults.lightsShadowNormalBias ?? 0.01,
        twoSided: defaults.lightsShadowTwoSided ?? false,
      });
      this.eventBus.emit('lights:show-indicators', defaults.showLightIndicators ?? false);
      
      this.ui.syncUIFromState();
      this.helpers.showToast('Studio settings reset', 3200, { notification: false });
    };

    const resetRender = () => {
      this.ui.uiSounds?.playSelect();
      const defaults = this.stateStore.getDefaults();
      this.stateStore.batch(() => {
        this.stateStore.set('lookFilterPreset', 'none');
        this.stateStore.resetSlice(RENDER_TAB_RESET_PATHS);
      });
      this.eventBus.emit('scene:batch-apply-start');
      try {
      this.eventBus.emit('render:dof', defaults.dof);
      this.ui.renderControls?.syncDofUiState?.(defaults.dof);
      this.eventBus.emit('render:bloom', defaults.bloom);
      this.ui.setEffectControlsDisabled(
        [
          'bloomThreshold',
          'bloomStrength',
          'bloomRadius',
          'bloomColor',
          'bloomQuality',
        ],
        !defaults.bloom.enabled,
      );
      this.eventBus.emit('render:grain', defaults.grain);
      this.ui.setEffectControlsDisabled(['grainIntensity', 'grainScale'], !defaults.grain.enabled);
      this.eventBus.emit('render:aberration', defaults.aberration);
      this.ui.setEffectControlsDisabled(
        ['aberrationAmount'],
        !defaults.aberration.enabled,
      );
      this.eventBus.emit('render:ambient-occlusion', defaults.ambientOcclusion);
      this.ui.setEffectControlsDisabled(
        [
          'ambientOcclusionIntensity',
          'ambientOcclusionRadius',
          'ambientOcclusionColor',
          'ambientOcclusionQuality',
        ],
        !defaults.ambientOcclusion.enabled,
      );
      this.eventBus.emit('render:fresnel', defaults.fresnel);
      this.ui.setEffectControlsDisabled(['fresnelColor', 'fresnelRadius', 'fresnelStrength'], !defaults.fresnel.enabled);
      this.eventBus.emit('camera:fov', defaults.camera.fov);
      this.eventBus.emit('camera:fisheye');
      this.eventBus.emit('camera:tilt', defaults.camera.tilt ?? 0);
      this.eventBus.emit('camera:handheld', defaults.camera.handheld ?? 'off');
      this.eventBus.emit('scene:exposure', defaults.exposure);
      this.eventBus.emit('camera:auto-exposure', defaults.autoExposure ?? false);
      this.eventBus.emit('camera:clip-planes');
      this.eventBus.emit('render:contrast', defaults.camera.contrast);
      this.eventBus.emit('render:temperature', defaults.camera.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K);
      this.eventBus.emit('render:tint', (defaults.camera.tint ?? 0) / 100);
      this.eventBus.emit('render:highlights', (defaults.camera.highlights ?? 0) / 100);
      this.eventBus.emit(
        'render:shadows',
        cameraShadowsUiToShader(defaults.camera.shadows ?? 0),
      );
      this.eventBus.emit('render:saturation', defaults.camera.saturation);
      this.eventBus.emit('render:clarity', defaults.camera.clarity ?? 0);
      this.eventBus.emit('render:fade', defaults.camera.fade ?? 0);
      this.eventBus.emit('render:sharpness', defaults.camera.sharpness ?? 0);
      this.eventBus.emit(
        'render:vignette',
        effectiveVignetteIntensity(defaults.camera, defaults.camera),
      );
      this.eventBus.emit('render:vignette-color', defaults.camera.vignetteColor ?? '#080808');
      this.eventBus.emit('render:anti-aliasing', defaults.antiAliasing);
      this.eventBus.emit('render:tone-curve', defaults.toneCurve);
      this.eventBus.emit('render:tone-mapping', defaults.toneMapping);
      this.eventBus.emit('render:apply-performance');
      this.eventBus.emit(
        'camera:composition-grid',
        !!(defaults.camera.compositionGridEnabled ?? false),
      );
      this.eventBus.emit(
        'camera:composition-guides-inverted',
        !!(defaults.camera.compositionGuidesInverted ?? false),
      );
      this.eventBus.emit(
        'camera:composition-portrait-crop-guide',
        !!(defaults.camera.compositionPortraitCropGuide ?? false),
      );
      this.eventBus.emit(
        'camera:cinematic-letterbox-219',
        !!(defaults.camera.cinematicLetterbox219 ?? false),
      );

      this.ui.syncUIFromState();
      this.helpers.showToast('FX settings reset', 3200, { notification: false });
      } finally {
        this.eventBus.emit('scene:batch-apply-end');
      }
    };

    this.ui.buttons.resetMesh?.addEventListener('click', resetMesh);
    this.ui.buttons.resetStudio?.addEventListener('click', resetStudio);
    this.ui.buttons.resetRender?.addEventListener('click', resetRender);
  }

  bindLocalResetButtons() {
    document.querySelectorAll('[data-reset]').forEach((button) => {
      button.addEventListener('click', () => {
        this.ui.uiSounds?.playSelect();
        const defaults = this.stateStore.getDefaults();
        const resetType = (button.dataset.reset ?? '').trim();

        switch (resetType) {
          case 'material': {
            const mrDefaults = getMaterialMrResetDefaults(
              !!this.stateStore.getState().material?.importUsesAuthoredPbr,
            );
            this.stateStore.batch(() => {
              this.stateStore.set('material.brightness', defaults.material?.brightness ?? mrDefaults.brightness);
              this.stateStore.set('material.metalness', defaults.material?.metalness ?? mrDefaults.metalness);
              this.stateStore.set('material.roughness', defaults.material?.roughness ?? mrDefaults.roughness);
              this.stateStore.set('material.emissive', defaults.material?.emissive ?? 0.0);
            });
            this.eventBus.emit('mesh:material-brightness', defaults.material?.brightness ?? mrDefaults.brightness);
            this.eventBus.emit('mesh:material-metalness', defaults.material?.metalness ?? mrDefaults.metalness);
            this.eventBus.emit('mesh:material-roughness', defaults.material?.roughness ?? mrDefaults.roughness);
            this.eventBus.emit('mesh:material-emissive', defaults.material?.emissive ?? 0.0);
            this.ui.syncUIFromState();
            break;
          }
            
          case 'clay':
            this.stateStore.resetSlice(RESET_DIRTY_PATHS.clay);
            this.eventBus.emit('mesh:clay-color', defaults.clay.color);
            this.ui.syncUIFromState();
            break;

          /* Subsurface block reset — UI disabled (SUBSURFACE_FEATURE_ENABLED).
          case 'subsurface':
            this.stateStore.set('subsurface', defaults.subsurface);
            this.eventBus.emit('mesh:subsurface', defaults.subsurface);
            this.ui.syncUIFromState();
            break;
          */
            
          case 'wireframe':
            this.stateStore.resetSlice(RESET_DIRTY_PATHS.wireframe);
            if (this.ui.inputs.wireframeColor) {
              this.ui.inputs.wireframeColor.value = defaults.wireframe.color;
            }
            if (this.ui.inputs.wireframeAlwaysOn) {
              this.ui.inputs.wireframeAlwaysOn.checked = defaults.wireframe.alwaysOn;
            }
            if (this.ui.inputs.wireframeOnlyVisibleFaces) {
              this.ui.inputs.wireframeOnlyVisibleFaces.checked = defaults.wireframe.onlyVisibleFaces;
            }
            if (this.ui.inputs.wireframeHideMesh) {
              this.ui.inputs.wireframeHideMesh.checked = defaults.wireframe.hideMesh;
            }
            if (this.ui.inputs.wireframeThickness) {
              this.ui.inputs.wireframeThickness.value =
                defaults.wireframe.thickness ?? 1;
              this.helpers.updateValueLabel(
                'wireframeThickness',
                defaults.wireframe.thickness ?? 1,
                'decimal',
              );
            }
            if (this.ui.inputs.wireframeOpacity) {
              this.ui.inputs.wireframeOpacity.value =
                defaults.wireframe.opacity ?? 1;
              this.helpers.updateValueLabel(
                'wireframeOpacity',
                defaults.wireframe.opacity ?? 1,
                'decimal',
              );
            }
            this.eventBus.emit('mesh:wireframe-always-on', defaults.wireframe.alwaysOn);
            this.eventBus.emit('mesh:wireframe-color', defaults.wireframe.color);
            this.eventBus.emit('mesh:wireframe-only-visible-faces', defaults.wireframe.onlyVisibleFaces);
            this.eventBus.emit('mesh:wireframe-hide-mesh', defaults.wireframe.hideMesh);
            this.eventBus.emit('mesh:wireframe-thickness', defaults.wireframe.thickness ?? 1);
            this.eventBus.emit('mesh:wireframe-opacity', defaults.wireframe.opacity ?? 1);
            this.ui.syncUIFromState();
            break;

          case 'creative-look':
            this.stateStore.set('creativeLook', defaults.creativeLook);
            this.stateStore.set('creativeLookSectionOpen', false);
            if (this.ui.inputs.creativeLookEnabled) {
              this.ui.inputs.creativeLookEnabled.checked = false;
            }
            this.ui.setCreativeLookActive(null);
            this.ui.toggleCreativeLookGrid(false);
            this.eventBus.emit('mesh:creative-look');
            this.ui.syncUIFromState();
            break;
            
          case 'hdri':
            this.eventBus.emit('studio:hdri-clear-custom');
            if (this.stateStore.getState().lensFlare?.keyLightConnected) {
              this.eventBus.emit('studio:lens-flare-key-light-connected', false);
            }
            this.stateStore.resetSlice(HDRI_SECTION_RESET_PATHS);
            this.ui.setHdriActive(defaults.hdri);
            this.eventBus.emit('studio:hdri', defaults.hdri);
            this.eventBus.emit('studio:hdri-strength', defaults.hdriStrength);
            this.eventBus.emit('studio:hdri-blurriness', defaults.hdriBlurriness);
            this.eventBus.emit('studio:hdri-rotation', defaults.hdriRotation);
            this.eventBus.emit('studio:hdri-background', defaults.hdriBackground);
            this.eventBus.emit('studio:hdri-receive-shadows-ao', defaults.hdriReceiveShadowsAo);
            this.eventBus.emit('studio:lens-flare-enabled', defaults.lensFlare.enabled);
            this.eventBus.emit('studio:lens-flare-rotation', defaults.lensFlare.rotation);
            this.eventBus.emit('studio:lens-flare-height', defaults.lensFlare.height);
            this.eventBus.emit('studio:lens-flare-color', defaults.lensFlare.color);
            this.eventBus.emit('studio:lens-flare-halo', defaults.lensFlare.haloIntensity);
            this.eventBus.emit('studio:lens-flare-streak-length', defaults.lensFlare.streakLength);
            this.eventBus.emit('studio:lens-flare-sun-disc-scale', defaults.lensFlare.sunDiscScale);
            this.eventBus.emit('studio:lens-flare-sun-disc-blur', defaults.lensFlare.sunDiscBlur);
            this.eventBus.emit('studio:lens-flare-sun-disc-color', defaults.lensFlare.sunDiscColor);
            this.eventBus.emit('studio:lens-flare-disc-glow-intensity', defaults.lensFlare.discGlowIntensity);
      this.eventBus.emit('studio:lens-flare-disc-glow-size', defaults.lensFlare.discGlowSize);
            this.eventBus.emit('studio:lens-flare-disc-glow-color', defaults.lensFlare.discGlowColor);
            this.eventBus.emit('studio:lens-flare-anamorphic-bloom');
            this.ui.syncUIFromState();
            break;
          
          case 'lens-flare':
            if (this.stateStore.getState().lensFlare?.keyLightConnected) {
              this.eventBus.emit('studio:lens-flare-key-light-connected', false);
            }
            this.stateStore.resetSlice(RESET_DIRTY_PATHS['lens-flare']);
            this.eventBus.emit('studio:lens-flare-enabled', defaults.lensFlare.enabled);
            this.eventBus.emit('studio:lens-flare-rotation', defaults.lensFlare.rotation);
            this.eventBus.emit('studio:lens-flare-height', defaults.lensFlare.height);
            this.eventBus.emit('studio:lens-flare-color', defaults.lensFlare.color);
            this.eventBus.emit('studio:lens-flare-quality', defaults.lensFlare.quality);
      this.eventBus.emit(
        'studio:lens-flare-spin-during-orbit',
        !!defaults.lensFlare.spinDuringOrbit,
      );
            this.eventBus.emit('studio:lens-flare-halo', defaults.lensFlare.haloIntensity);
            this.eventBus.emit('studio:lens-flare-streak-length', defaults.lensFlare.streakLength);
            this.eventBus.emit('studio:lens-flare-sun-disc-scale', defaults.lensFlare.sunDiscScale);
            this.eventBus.emit('studio:lens-flare-sun-disc-blur', defaults.lensFlare.sunDiscBlur);
            this.eventBus.emit('studio:lens-flare-sun-disc-color', defaults.lensFlare.sunDiscColor);
            this.eventBus.emit('studio:lens-flare-disc-glow-intensity', defaults.lensFlare.discGlowIntensity);
      this.eventBus.emit('studio:lens-flare-disc-glow-size', defaults.lensFlare.discGlowSize);
            this.eventBus.emit('studio:lens-flare-disc-glow-color', defaults.lensFlare.discGlowColor);
            this.eventBus.emit('studio:lens-flare-anamorphic-bloom');
            this.ui.syncUIFromState();
            break;

          case 'volumetric-scattering': {
            const currentGodRays = this.stateStore.getState().godRays ?? {};
            const resetGodRays = godRaysStateAfterSectionReset(
              currentGodRays,
              defaults.godRays,
            );
            this.stateStore.set('godRays', resetGodRays);
            emitGodRaysStudioEvents(this.eventBus, resetGodRays, defaults.godRays);
            this.ui.syncUIFromState();
            break;
          }
            
          case 'lights':
            this.stateStore.resetSlice(LIGHTS_SECTION_RESET_PATHS);
            Object.keys(defaults.lights).forEach((lightId) => {
              const light = defaults.lights[lightId];
              this.eventBus.emit('lights:update', { lightId, property: 'color', value: light.color });
              this.eventBus.emit('lights:update', { lightId, property: 'intensity', value: light.intensity });
              if (light.height !== undefined) {
                this.eventBus.emit('lights:update', { lightId, property: 'height', value: light.height });
              }
              if (light.rotate !== undefined) {
                this.eventBus.emit('lights:update', { lightId, property: 'rotate', value: light.rotate });
              }
            });
            this.eventBus.emit('lights:master', defaults.lightsMaster);
            this.eventBus.emit('lights:rotate', defaults.lightsRotation);
            this.eventBus.emit('lights:height', defaults.lightsHeight ?? 5);
            this.eventBus.emit('lights:shadow-settings', {
              quality: defaults.lightsShadowQuality ?? 'medium',
              softness: defaults.lightsShadowSoftness ?? DEFAULT_LIGHTS_SHADOW_SOFTNESS,
              color: defaults.lightsShadowColor ?? '#080808',
              opacity: defaults.lightsShadowOpacity ?? 0.25,
              contactOffset: defaults.lightsShadowContactOffset ?? -0.0005,
              twoSided: defaults.lightsShadowTwoSided ?? false,
            });
            this.ui.syncUIFromState();
            break;
          case 'lights-shadows':
            {
              const castShadows = defaults.lightsCastShadows ?? false;
              const shadowQuality = defaults.lightsShadowQuality ?? 'medium';
              const shadowSoftness = defaults.lightsShadowSoftness ?? DEFAULT_LIGHTS_SHADOW_SOFTNESS;
              const shadowColor = defaults.lightsShadowColor ?? '#080808';
              const shadowOpacity = defaults.lightsShadowOpacity ?? 0.25;
              const shadowContactOffset = defaults.lightsShadowContactOffset ?? -0.0005;
              const shadowNormalBias = defaults.lightsShadowNormalBias ?? 0.01;
              const shadowTwoSided = defaults.lightsShadowTwoSided ?? false;
              this.stateStore.resetSlice(RESET_DIRTY_PATHS['lights-shadows']);
              this.eventBus.emit('lights:shadow-settings', {
                castShadows,
                quality: shadowQuality,
                softness: shadowSoftness,
                color: shadowColor,
                opacity: shadowOpacity,
                contactOffset: shadowContactOffset,
                normalBias: shadowNormalBias,
                twoSided: shadowTwoSided,
              });
              this.ui.syncUIFromState();
              break;
            }
          case 'keyLight':
            this.ui.resetIndividualLight('key', defaults.lights.key);
            this.stateStore.resetSlice(['gobo']);
            this.eventBus.emit('lights:gobo-enabled', defaults.gobo?.enabled ?? false);
            this.eventBus.emit('lights:gobo-texture', defaults.gobo?.texture ?? 'palm');
            this.eventBus.emit('lights:gobo-softness', defaults.gobo?.softness ?? DEFAULT_GOBO_SOFTNESS);
            this.eventBus.emit('lights:gobo-scale', defaults.gobo?.scale ?? GOBO_UI_DEFAULT);
            this.eventBus.emit('lights:gobo-rotation', defaults.gobo?.rotation ?? 0);
            this.ui.syncControls(this.stateStore.getState());
            break;
          case 'fillLight':
            this.ui.resetIndividualLight('fill', defaults.lights.fill);
            break;
          case 'rimLight':
            this.ui.resetIndividualLight('rim', defaults.lights.rim);
            break;
          case 'ambientLight':
            this.ui.resetIndividualLight('ambient', defaults.lights.ambient);
            break;
            
          case 'base':
            this.stateStore.resetSlice(RESET_DIRTY_PATHS.base);
            this.eventBus.emit('studio:ground-solid-color', defaults.groundSolidColor);
            this.eventBus.emit('studio:base-scale', defaults.baseScale);
            this.eventBus.emit('studio:base-metalness', defaults.baseMetalness);
            this.eventBus.emit('studio:base-roughness', defaults.baseRoughness);
            this.eventBus.emit('studio:base-reflection', defaults.baseReflection);
            this.eventBus.emit('studio:base-clearcoat', defaults.baseClearcoat);
            this.eventBus.emit('studio:base-surface', {
              preset: defaults.baseSurfacePreset ?? 'none',
              scale: defaults.baseSurfaceScale ?? 1,
              strength: defaults.baseSurfaceStrength ?? 1,
            });
            this.eventBus.emit('studio:ground-y', defaults.groundY);
            this.ui.syncControls(this.stateStore.getState());
            break;

          case 'base-glass':
            this.stateStore.resetSlice(RESET_DIRTY_PATHS['base-glass']);
            this.eventBus.emit('studio:base-glass-surface', defaults.baseGlassSurface);
            this.eventBus.emit('studio:base-glass-brightness', defaults.baseGlassBrightness);
            this.eventBus.emit('studio:base-glass-blur', defaults.baseGlassBlur);
            this.eventBus.emit('studio:base-glass-amount', defaults.baseGlassAmount);
            this.eventBus.emit('studio:base-surface', {
              preset: defaults.baseSurfacePreset ?? 'none',
              scale: defaults.baseSurfaceScale ?? 1,
              strength: defaults.baseSurfaceStrength ?? 1,
            });
            this.ui.syncControls(this.stateStore.getState());
            break;

          case 'backdrop':
            this.stateStore.resetSlice(RESET_DIRTY_PATHS.backdrop);
            this.eventBus.emit('studio:backdrop-enabled', defaults.backdropEnabled ?? false);
            this.eventBus.emit('studio:backdrop-scale', defaults.backdropScale ?? 1);
            this.eventBus.emit('studio:backdrop-width', defaults.backdropWidth ?? 2);
            this.eventBus.emit('studio:backdrop-color', defaults.backdropColor ?? '#808080');
            this.eventBus.emit('studio:backdrop-rotation', defaults.backdropRotation ?? 0);
            this.eventBus.emit('studio:backdrop-y', defaults.backdropY ?? 0);
            this.eventBus.emit('studio:backdrop-metalness', defaults.backdropMetalness ?? DEFAULT_BACKDROP_METALNESS);
            this.eventBus.emit('studio:backdrop-roughness', defaults.backdropRoughness ?? DEFAULT_BACKDROP_ROUGHNESS);
            this.eventBus.emit('studio:backdrop-surface', {
              preset: defaults.backdropSurfacePreset ?? 'none',
              scale: defaults.backdropSurfaceScale ?? 1,
              strength: defaults.backdropSurfaceStrength ?? 1,
            });
            this.ui.syncControls(this.stateStore.getState());
            break;
            
          case 'background':
            this.stateStore.resetSlice(RESET_DIRTY_PATHS.background);
            this.eventBus.emit('scene:background', defaults.background);
            this.eventBus.emit('scene:background-solid-enabled', defaults.backgroundSolidEnabled);
            this.eventBus.emit('scene:background-gradient', defaults.backgroundGradient);
            this.eventBus.emit('scene:background-image', defaults.backgroundImage);
            window.orby?.scene?.backgroundImageController?.setImage?.(null);
            this.ui.syncUIFromState();
            break;
            
          case 'grid':
            this.stateStore.resetSlice(RESET_DIRTY_PATHS.grid);
            this.eventBus.emit('studio:ground-wire-color', defaults.groundWireColor);
            this.eventBus.emit('studio:ground-wire-opacity', defaults.groundWireOpacity);
            this.eventBus.emit('studio:grid-line-width', defaults.gridLineWidth);
            this.eventBus.emit('studio:grid-y', defaults.gridY);
            this.eventBus.emit('studio:grid-scale', defaults.gridScale);
            this.ui.syncControls(this.stateStore.getState());
            break;
            
          case 'dof':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.resetSlice(RESET_DIRTY_PATHS.dof);
            });
            this.eventBus.emit('render:dof', defaults.dof);
            this.ui.renderControls?.syncDofUiState?.(defaults.dof);
            this.ui.syncUIFromState();
            break;
            
          case 'bloom':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.resetSlice(RESET_DIRTY_PATHS.bloom);
            });
            this.eventBus.emit('render:bloom', defaults.bloom);
            this.ui.setEffectControlsDisabled(
              [
                'bloomThreshold',
                'bloomStrength',
                'bloomRadius',
                'bloomColor',
                'bloomQuality',
              ],
              !defaults.bloom.enabled,
            );
            this.ui.syncUIFromState();
            break;

          case 'anamorphic-bloom':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.resetSlice(RESET_DIRTY_PATHS['anamorphic-bloom']);
            });
            this.eventBus.emit('studio:lens-flare-anamorphic-bloom');
            this.ui.syncUIFromState();
            break;

          case 'lens-dirt':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.resetSlice(RESET_DIRTY_PATHS['lens-dirt']);
            });
            this.eventBus.emit('render:lens-dirt', defaults.lensDirt);
            this.ui.setEffectControlsDisabled(['lensDirtStrength', 'lensDirtTintColor'], !defaults.lensDirt.enabled);
            this.ui.syncControls(this.stateStore.getState());
            break;
            
          case 'grain':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.resetSlice(RESET_DIRTY_PATHS.grain);
            });
            this.eventBus.emit('render:grain', defaults.grain);
            this.ui.setEffectControlsDisabled(['grainIntensity', 'grainScale'], !defaults.grain.enabled);
            this.ui.syncUIFromState();
            break;
            
          case 'aberration':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.resetSlice(RESET_DIRTY_PATHS.aberration);
            });
            this.eventBus.emit('render:aberration', defaults.aberration);
            this.ui.setEffectControlsDisabled(
              ['aberrationAmount'],
              !defaults.aberration.enabled,
            );
            this.ui.syncUIFromState();
            break;

          case 'color-checker':
            this.stateStore.resetSlice(RESET_DIRTY_PATHS['color-checker']);
            this.eventBus.emit('scene:color-checker-reference-shading');
            this.eventBus.emit('scene:color-checker');
            this.ui.syncUIFromState();
            break;

          case 'ambient-occlusion':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.resetSlice(RESET_DIRTY_PATHS['ambient-occlusion']);
            });
            this.eventBus.emit('render:ambient-occlusion', defaults.ambientOcclusion);
            this.ui.setEffectControlsDisabled(
              [
                'ambientOcclusionIntensity',
                'ambientOcclusionRadius',
                'ambientOcclusionColor',
                'ambientOcclusionQuality',
              ],
              !defaults.ambientOcclusion.enabled,
            );
            this.ui.syncUIFromState();
            break;

          case 'fresnel':
            this.stateStore.resetSlice(RESET_DIRTY_PATHS.fresnel);
            this.eventBus.emit('render:fresnel', defaults.fresnel);
            this.ui.setEffectControlsDisabled(['fresnelColor', 'fresnelRadius', 'fresnelStrength'], !defaults.fresnel.enabled);
            this.ui.syncUIFromState();
            break;
            
          case 'lens':
            this.stateStore.resetSlice(RESET_DIRTY_PATHS.lens);
            this.eventBus.emit('camera:fov', defaults.camera.fov);
            this.ui.lensControls?.sync(this.stateStore.getState());
            this.ui.syncUIFromState();
            break;

          case 'camera':
            // Reset basic camera settings (Tilt, Exposure, Auto Exposure, orbit, vignette)
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.set('camera.tilt', defaults.camera.tilt ?? 0);
              this.stateStore.set(
                'camera.worldPosition',
                { ...DEFAULT_CAMERA_POSITION },
              );
              this.stateStore.set('camera.distance', defaultCameraDistance());
              this.stateStore.set('camera.viewPreset', null);
              this.stateStore.set('camera.autoOrbit', defaults.camera.autoOrbit ?? 'off');
              this.stateStore.set('camera.handheld', defaults.camera.handheld ?? 'off');
              this.stateStore.set('exposure', defaults.exposure);
              this.stateStore.set('autoExposure', defaults.autoExposure ?? false);
              // Also reset vignette (camera/post-processing effect)
              this.stateStore.set('camera.vignetteEnabled', defaults.camera.vignetteEnabled ?? false);
              this.stateStore.set('camera.vignette', defaults.camera.vignette ?? 0.5);
              this.stateStore.set('camera.vignetteColor', defaults.camera.vignetteColor ?? '#080808');
              this.stateStore.set(
                'camera.compositionGridEnabled',
                defaults.camera.compositionGridEnabled ?? false,
              );
              this.stateStore.set(
                'camera.compositionGuidesInverted',
                defaults.camera.compositionGuidesInverted ?? false,
              );
              this.stateStore.set(
                'camera.compositionPortraitCropGuide',
                defaults.camera.compositionPortraitCropGuide ?? false,
              );
              this.stateStore.set(
                'camera.cinematicLetterbox219',
                defaults.camera.cinematicLetterbox219 ?? false,
              );
            });
            // Emit events to update the scene
            this.eventBus.emit('scene:batch-apply-start');
            try {
            this.eventBus.emit('camera:tilt', defaults.camera.tilt ?? 0);
            this.eventBus.emit('camera:reset');
            this.eventBus.emit('camera:auto-orbit', defaults.camera.autoOrbit ?? 'off');
            this.eventBus.emit('camera:handheld', defaults.camera.handheld ?? 'off');
            this.eventBus.emit('scene:exposure', defaults.exposure);
            this.eventBus.emit('camera:auto-exposure', defaults.autoExposure ?? false);
            this.eventBus.emit('camera:clip-planes');
            this.eventBus.emit(
              'render:vignette',
              effectiveVignetteIntensity(defaults.camera, defaults.camera),
            );
            this.eventBus.emit('render:vignette-color', defaults.camera.vignetteColor ?? '#080808');
            this.eventBus.emit(
              'camera:composition-grid',
              !!(defaults.camera.compositionGridEnabled ?? false),
            );
            this.eventBus.emit(
              'camera:composition-guides-inverted',
              !!(defaults.camera.compositionGuidesInverted ?? false),
            );
            this.eventBus.emit(
              'camera:composition-portrait-crop-guide',
              !!(defaults.camera.compositionPortraitCropGuide ?? false),
            );
            this.eventBus.emit(
              'camera:cinematic-letterbox-219',
              !!(defaults.camera.cinematicLetterbox219 ?? false),
            );
            // Sync UI to reflect the reset values
            this.ui.syncControls(this.stateStore.getState());
            } finally {
              this.eventBus.emit('scene:batch-apply-end');
            }
            break;

          case 'isometric': {
            const isoDefault = defaults.camera?.isometric ?? {
              enabled: false,
              presetId: 'true-isometric',
              horizontalDeg: 45,
              verticalDeg: 35.264,
              panUnlocked: false,
            };
            this.stateStore.resetSlice(RESET_DIRTY_PATHS.isometric);
            this.eventBus.emit('camera:isometric', isoDefault);
            this.ui.isometricControls?.sync(this.stateStore.getState());
            this.ui.syncUIFromState();
            break;
          }

          case 'fisheye': {
            const feDefault =
              defaults.fisheye ?? {
                enabled: false,
                horizontalFOVDeg: 131,
                strength: 0.37,
                cylindricalRatio: 4,
              };
            this.stateStore.resetSlice(RESET_DIRTY_PATHS.fisheye);
            this.eventBus.emit('camera:fisheye');
            this.eventBus.emit('camera:fov');
            this.ui.syncUIFromState();
            break;
          }

          case 'color-correction':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.resetSlice(RESET_DIRTY_PATHS['color-correction']);
            });
            this.eventBus.emit('render:contrast', defaults.camera.contrast);
            this.eventBus.emit('render:temperature', defaults.camera.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K);
            this.eventBus.emit('render:tint', (defaults.camera.tint ?? 0) / 100);
            this.eventBus.emit('render:highlights', (defaults.camera.highlights ?? 0) / 100);
            this.eventBus.emit(
              'render:shadows',
              cameraShadowsUiToShader(defaults.camera.shadows ?? 0),
            );
            this.eventBus.emit('render:saturation', defaults.camera.saturation);
            this.eventBus.emit('render:clarity', defaults.camera.clarity ?? 0);
            this.eventBus.emit('render:fade', defaults.camera.fade ?? 0);
            this.eventBus.emit('render:sharpness', defaults.camera.sharpness ?? 0);
            // Ensure state is fully updated and DOM has time to update before syncing UI
            requestAnimationFrame(() => {
              this.ui.syncControls(this.stateStore.getState());
            });
            break;

          case 'vignette':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.resetSlice(RESET_DIRTY_PATHS.vignette);
            });
            this.eventBus.emit(
              'render:vignette',
              effectiveVignetteIntensity(defaults.camera, defaults.camera),
            );
            this.eventBus.emit('render:vignette-color', defaults.camera.vignetteColor ?? '#080808');
            this.ui.syncControls(this.stateStore.getState());
            break;

          case 'tone-curve':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.resetSlice(RESET_DIRTY_PATHS['tone-curve']);
            });
            this.eventBus.emit('render:tone-curve', this.stateStore.getState().toneCurve);
            this.ui.renderControls.toneCurveController?.syncFromState(
              this.stateStore.getState(),
            );
            break;
            
          case 'transform':
            this.stateStore.resetSlice(RESET_DIRTY_PATHS.transform);
            this.eventBus.emit('mesh:scale', defaults.scale);
            this.eventBus.emit('mesh:xOffset', defaults.xOffset);
            this.eventBus.emit('mesh:yOffset', defaults.yOffset);
            this.eventBus.emit('mesh:zOffset', defaults.zOffset);
            this.eventBus.emit('mesh:rotationX', defaults.rotationX);
            this.eventBus.emit('mesh:rotationY', defaults.rotationY);
            this.eventBus.emit('mesh:rotationZ', defaults.rotationZ);
            this.eventBus.emit('mesh:reset-transform');
            this.ui.syncUIFromState();
            break;

          case 'svg-extrude':
            resetSvgExtrudeState(this.stateStore, this.eventBus, defaults);
            this.ui.syncUIFromState();
            break;

          case 'advanced':
            this.stateStore.resetSlice(RESET_DIRTY_PATHS.advanced);
            this.eventBus.emit('mesh:reverse-normals', defaults.advanced?.reverseNormals ?? false);
            this.eventBus.emit('mesh:transparency-fix');
            this.eventBus.emit('mesh:glass-appearance');
            this.eventBus.emit('mesh:uv-checker', defaults.advanced?.uvChecker ?? false);
            this.eventBus.emit(
              'mesh:uv-checker-scale',
              defaults.advanced?.uvCheckerScale ?? 5,
            );
            this.eventBus.emit(
              'mesh:uv-checker-style',
              defaults.advanced?.uvCheckerStyle ?? 'orby',
            );
            this.eventBus.emit('mesh:normal-view', defaults.advanced?.normalView ?? false);
            this.eventBus.emit(
              'mesh:normal-view-mode',
              defaults.advanced?.normalViewMode ?? 'geometry',
            );
            this.eventBus.emit('mesh:stl-smoothing');
            this.eventBus.emit('mesh:recenter-pivot', { showToast: false });
            this.ui.syncUIFromState();
            break;
        }

        const resetToast = BLOCK_RESET_TOASTS[resetType];
        if (resetToast) {
          this.helpers.showToast(resetToast, 3200, { notification: false });
        }

        // The user just reset this section; treat it as freshly untouched
        // so its icon stays hidden until they interact with it again.
        this.clearResetTouched(resetType);
        this.updateResetVisibility(this.stateStore.getState());
      });
    });
  }
}

