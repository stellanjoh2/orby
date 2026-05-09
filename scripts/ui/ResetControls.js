/**
 * ResetControls - Handles all reset button logic
 * Manages copy/paste scene settings, and local/section reset buttons
 */
import {
  CAMERA_TEMPERATURE_NEUTRAL_K,
  DEFAULT_MATERIAL_ROUGHNESS,
  effectiveVignetteIntensity,
} from '../constants.js';
import { deepClone } from '../utils/deepClone.js';
import { deepEqual } from '../utils/deepEqual.js';
import { animateModalClose, animateModalOpen } from './modalReveal.js';
import { normalizeCreativeLookPreset } from '../render/CreativeLookMaterials.js';

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
  hdri: ['hdri', 'hdriStrength', 'hdriBlurriness', 'hdriRotation', 'hdriBackground', 'lensFlare'],
  'lens-flare': ['lensFlare'],
  lights: [
    'lights', 'lightsMaster', 'lightsRotation', 'lightsHeight',
    'lightsShadowQuality', 'lightsShadowSoftness',
    'lightsShadowContactOffset', 'lightsShadowTwoSided',
  ],
  'lights-shadows': [
    'lightsCastShadows', 'lightsShadowQuality', 'lightsShadowSoftness',
    'lightsShadowContactOffset', 'lightsShadowTwoSided',
  ],
  keyLight: ['lights.key'],
  fillLight: ['lights.fill'],
  rimLight: ['lights.rim'],
  ambientLight: ['lights.ambient'],
  podium: [
    'groundSolidColor', 'groundY', 'podiumScale',
    'podiumMetalness', 'podiumRoughness', 'podiumReflection', 'podiumClearcoat',
  ],
  'podium-glass': [
    'podiumGlassSurface', 'podiumGlassBrightness', 'podiumGlassBlur', 'podiumGlassAmount',
  ],
  backdrop: [
    'backdropEnabled', 'backdropScale', 'backdropWidth', 'backdropColor',
    'backdropRotation', 'backdropY', 'backdropTextureEnabled', 'backdropTextureScale',
  ],
  background: ['background'],
  grid: ['groundWireColor', 'groundWireOpacity', 'gridY', 'gridScale'],
  dof: ['dof'],
  bloom: ['bloom'],
  'anamorphic-bloom': ['lensFlare.anamorphicBloom'],
  'lens-dirt': ['lensDirt'],
  grain: ['grain'],
  aberration: ['aberration'],
  'color-checker': ['colorChecker'],
  'ambient-occlusion': ['ambientOcclusion'],
  fresnel: ['fresnel'],
  camera: [
    'camera.fov', 'fisheye', 'camera.tilt', 'camera.handheld',
    'exposure', 'autoExposure',
    'camera.vignetteEnabled', 'camera.vignette', 'camera.vignetteColor',
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
    'svgExtrude.depth', 'svgExtrude.normalAngle',
    'svgExtrude.colorDepths', 'svgExtrude.colorOffsets',
    'svgExtrude.flipDirection', 'svgExtrude.colorOverride',
    'svgExtrude.overrideColor', 'svgExtrude.surfacePreset', 'svgExtrude.surfaceScale',
  ],
  advanced: [
    'advanced.reverseNormals', 'advanced.transparencyFix',
    'advanced.glassOpacity', 'advanced.glassReflection',
    'advanced.glassTint', 'advanced.glassBody',
    'advanced.blendSortingMitigation',
    'advanced.flipGlassNormalMapY', 'advanced.glassFrontFacesOnly',
  ],
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
      if (!this._touchedResetTypes.has(type)) {
        button.classList.remove('is-dirty');
        continue;
      }
      const paths = RESET_DIRTY_PATHS[type];
      let dirty = false;
      if (paths) {
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
      this.helpers.showToast(result.message);
    };
    this.ui.buttons.copySceneButtons?.forEach(button => {
      button.addEventListener('click', copyScene);
    });
    const saveOrby = async () => {
      const result = await this.ui.sceneSettingsManager.saveOrbyToFile();
      this.helpers.showToast(result.message);
    };
    this.ui.buttons.saveOrbyButtons?.forEach((button) => {
      button.addEventListener('click', saveOrby);
    });
    this.ui.buttons.loadOrbyButtons?.forEach((button) => {
      button.addEventListener('click', () => {
        this.ui.buttons.orbyFileInput?.click();
      });
    });
    this.ui.buttons.orbyFileInput?.addEventListener('change', async (event) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      const result = await this.ui.sceneSettingsManager.loadOrbyFromFile(file);
      this.helpers.showToast(result.message);
      event.target.value = '';
    });

    // Paste scene settings — show modal
    this.ui.buttons.loadSceneButtons?.forEach(button => {
      button.addEventListener('click', () => {
        const modal = this.ui.buttons.loadSceneModal;
        const text = this.ui.buttons.loadSceneText;
        if (!modal) return;
        const panel = modal.querySelector('.load-settings-content');
        this.ui.uiSounds?.playShelfShow();
        this.ui.uiSounds?.playNotification();
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
        const result = this.ui.sceneSettingsManager.loadFromText(text);
        if (result.success) {
          this.ui.syncControls(this.stateStore.getState());
        }
        this.helpers.showToast(result.message);
        if (result.success) {
          closeSceneModal();
        }
      }
    });

    // Reset buttons (Mesh, Studio, Render)
    const resetMesh = () => {
      this.ui.uiSounds?.playSelect();
      const defaults = this.stateStore.getDefaults();
      this.stateStore.batch(() => {
      this.stateStore.set('shading', defaults.shading);
      this.stateStore.set('scale', defaults.scale);
      this.stateStore.set('xOffset', defaults.xOffset ?? 0);
      this.stateStore.set('yOffset', defaults.yOffset);
      this.stateStore.set('zOffset', defaults.zOffset ?? 0);
      this.stateStore.set('rotationX', defaults.rotationX ?? 0);
      this.stateStore.set('rotationY', defaults.rotationY ?? 0);
      this.stateStore.set('rotationZ', defaults.rotationZ ?? 0);
      this.stateStore.set('autoRotate', defaults.autoRotate);
      this.stateStore.set('clay', defaults.clay);
      this.stateStore.set('fresnel', defaults.fresnel);
      this.stateStore.set('subsurface', defaults.subsurface);
      this.stateStore.set('svgExtrude.depth', defaults.svgExtrude?.depth ?? 0.2);
      this.stateStore.set('svgExtrude.normalAngle', defaults.svgExtrude?.normalAngle ?? 45);
      this.stateStore.set('svgExtrude.colorDepths', defaults.svgExtrude?.colorDepths ?? {});
      this.stateStore.set('svgExtrude.colorOffsets', defaults.svgExtrude?.colorOffsets ?? {});
      this.stateStore.set('svgExtrude.flipDirection', defaults.svgExtrude?.flipDirection ?? false);
      this.stateStore.set('svgExtrude.colorOverride', defaults.svgExtrude?.colorOverride ?? false);
      this.stateStore.set('svgExtrude.overrideColor', defaults.svgExtrude?.overrideColor ?? '#7ed321');
      this.stateStore.set('svgExtrude.surfacePreset', defaults.svgExtrude?.surfacePreset ?? 'none');
      this.stateStore.set('svgExtrude.surfaceScale', defaults.svgExtrude?.surfaceScale ?? 1.0);
      this.stateStore.set('advanced.reverseNormals', defaults.advanced?.reverseNormals ?? false);
      this.stateStore.set(
        'advanced.transparencyFix',
        defaults.advanced?.transparencyFix ?? 'default',
      );
      this.stateStore.set('advanced.glassOpacity', defaults.advanced?.glassOpacity ?? 0.45);
      this.stateStore.set('advanced.glassReflection', defaults.advanced?.glassReflection ?? 2);
      this.stateStore.set('advanced.glassTint', defaults.advanced?.glassTint ?? '#ffffff');
      this.stateStore.set('advanced.glassBody', defaults.advanced?.glassBody ?? 0);
      this.stateStore.set(
        'advanced.blendSortingMitigation',
        defaults.advanced?.blendSortingMitigation ?? false,
      );
      this.stateStore.set(
        'advanced.flipGlassNormalMapY',
        defaults.advanced?.flipGlassNormalMapY ?? false,
      );
      this.stateStore.set(
        'advanced.glassFrontFacesOnly',
        defaults.advanced?.glassFrontFacesOnly ?? false,
      );
      // Reset material properties
      this.stateStore.set('material.brightness', defaults.material?.brightness ?? 1.0);
      this.stateStore.set('material.metalness', defaults.material?.metalness ?? 0.0);
      this.stateStore.set('material.roughness', defaults.material?.roughness ?? DEFAULT_MATERIAL_ROUGHNESS);
      this.stateStore.set('material.emissive', defaults.material?.emissive ?? 0.0);
      });
      this.eventBus.emit('mesh:shading', defaults.shading);
      this.eventBus.emit('mesh:scale', defaults.scale);
      this.eventBus.emit('mesh:xOffset', defaults.xOffset ?? 0);
      this.eventBus.emit('mesh:yOffset', defaults.yOffset);
      this.eventBus.emit('mesh:zOffset', defaults.zOffset ?? 0);
      this.eventBus.emit('mesh:rotationX', defaults.rotationX ?? 0);
      this.eventBus.emit('mesh:rotationY', defaults.rotationY ?? 0);
      this.eventBus.emit('mesh:rotationZ', defaults.rotationZ ?? 0);
      this.eventBus.emit('mesh:auto-rotate', defaults.autoRotate);
      this.eventBus.emit('mesh:clay-color', defaults.clay.color);
      this.eventBus.emit('mesh:clay-normal-map', defaults.clay.normalMap);
      // Emit material reset events
      this.eventBus.emit('mesh:material-brightness', defaults.material?.brightness ?? 1.0);
      this.eventBus.emit('mesh:material-metalness', defaults.material?.metalness ?? 0.0);
      this.eventBus.emit('mesh:material-roughness', defaults.material?.roughness ?? DEFAULT_MATERIAL_ROUGHNESS);
      this.eventBus.emit('mesh:material-emissive', defaults.material?.emissive ?? 0.0);
      this.eventBus.emit('render:fresnel', defaults.fresnel);
      this.eventBus.emit('mesh:subsurface', defaults.subsurface);
      this.eventBus.emit('mesh:svg-extrude-depth', defaults.svgExtrude?.depth ?? 0.2);
      this.eventBus.emit('mesh:svg-extrude-normal-angle', defaults.svgExtrude?.normalAngle ?? 45);
      this.eventBus.emit('mesh:svg-extrude-color-depths', defaults.svgExtrude?.colorDepths ?? {});
      this.eventBus.emit('mesh:svg-extrude-color-offsets', defaults.svgExtrude?.colorOffsets ?? {});
      this.eventBus.emit('mesh:svg-extrude-flip-direction', defaults.svgExtrude?.flipDirection ?? false);
      this.eventBus.emit('mesh:svg-extrude-color-override', {
        enabled: defaults.svgExtrude?.colorOverride ?? false,
        color: defaults.svgExtrude?.overrideColor ?? '#7ed321',
      });
      this.eventBus.emit('mesh:svg-extrude-surface', {
        preset: defaults.svgExtrude?.surfacePreset ?? 'none',
        scale: defaults.svgExtrude?.surfaceScale ?? 1.0,
      });
      this.eventBus.emit('mesh:reverse-normals', defaults.advanced?.reverseNormals ?? false);
      this.eventBus.emit('mesh:transparency-fix');
      this.eventBus.emit('mesh:glass-appearance');

      this.ui.syncUIFromState();
      this.helpers.showToast('Mesh settings reset');
    };

    const resetStudio = () => {
      this.ui.uiSounds?.playSelect();
      const defaults = this.stateStore.getDefaults();
      this.stateStore.batch(() => {
      this.stateStore.set('hdri', defaults.hdri);
      this.stateStore.set('hdriEnabled', defaults.hdriEnabled);
      this.stateStore.set('hdriStrength', defaults.hdriStrength);
      this.stateStore.set('hdriBlurriness', defaults.hdriBlurriness);
      this.stateStore.set('hdriBackground', defaults.hdriBackground);
      this.stateStore.set('groundSolid', defaults.groundSolid);
      this.stateStore.set('groundWire', defaults.groundWire);
      this.stateStore.set('groundWireOpacity', defaults.groundWireOpacity);
      this.stateStore.set('groundY', defaults.groundY);
      this.stateStore.set('groundSolidColor', defaults.groundSolidColor);
      this.stateStore.set('backdropEnabled', defaults.backdropEnabled ?? false);
      this.stateStore.set('backdropScale', defaults.backdropScale ?? 1);
      this.stateStore.set('backdropWidth', defaults.backdropWidth ?? 1);
      this.stateStore.set('backdropColor', defaults.backdropColor ?? '#808080');
      this.stateStore.set('backdropRotation', defaults.backdropRotation ?? 0);
      this.stateStore.set('backdropY', defaults.backdropY ?? 0);
      this.stateStore.set('backdropTextureEnabled', defaults.backdropTextureEnabled ?? false);
      this.stateStore.set('backdropTextureScale', defaults.backdropTextureScale ?? 1.8);
      this.stateStore.set('groundWireColor', defaults.groundWireColor);
      this.stateStore.set('background', defaults.background);
      this.stateStore.set('lights', defaults.lights);
      this.stateStore.set('lightsEnabled', defaults.lightsEnabled);
      this.stateStore.set('lightsMaster', defaults.lightsMaster);
      this.stateStore.set('lightsRotation', defaults.lightsRotation);
      this.stateStore.set('lightsHeight', defaults.lightsHeight ?? 5);
      this.stateStore.set('lightsAutoRotate', defaults.lightsAutoRotate);
      this.stateStore.set('showLightIndicators', defaults.showLightIndicators ?? false);
      this.stateStore.set('lensFlare', defaults.lensFlare);
      this.stateStore.set('lensFlare.enabled', defaults.lensFlare.enabled);
      this.stateStore.set('lightsCastShadows', defaults.lightsCastShadows);
      this.stateStore.set('lightsShadowQuality', defaults.lightsShadowQuality ?? 'medium');
      this.stateStore.set('lightsShadowSoftness', defaults.lightsShadowSoftness ?? 4);
      this.stateStore.set(
        'lightsShadowContactOffset',
        defaults.lightsShadowContactOffset ?? -0.0001,
      );
      this.stateStore.set(
        'lightsShadowTwoSided',
        defaults.lightsShadowTwoSided ?? false,
      );
      });
      this.ui.setHdriActive(defaults.hdri);
      this.eventBus.emit('studio:hdri', defaults.hdri);
      this.eventBus.emit('studio:hdri-enabled', defaults.hdriEnabled);
      this.ui.toggleHdriControls(defaults.hdriEnabled);
      this.eventBus.emit('studio:hdri-strength', defaults.hdriStrength);
      this.eventBus.emit('studio:hdri-blurriness', defaults.hdriBlurriness);
      this.eventBus.emit('studio:hdri-background', defaults.hdriBackground);
      // Ensure lens flare toggle is fully reset (state + event + UI sync)
      this.eventBus.emit('studio:lens-flare-enabled', defaults.lensFlare.enabled);
      this.eventBus.emit('studio:lens-flare-rotation', defaults.lensFlare.rotation);
      this.eventBus.emit('studio:lens-flare-height', defaults.lensFlare.height);
      this.eventBus.emit('studio:lens-flare-color', defaults.lensFlare.color);
      this.eventBus.emit('studio:lens-flare-quality', defaults.lensFlare.quality);
      this.eventBus.emit('studio:lens-flare-anamorphic-bloom');
      this.eventBus.emit('studio:ground-solid', defaults.groundSolid);
      this.eventBus.emit('studio:ground-wire', defaults.groundWire);
      this.eventBus.emit('studio:ground-wire-opacity', defaults.groundWireOpacity);
      this.eventBus.emit('studio:ground-y', defaults.groundY);
      this.eventBus.emit('studio:ground-solid-color', defaults.groundSolidColor);
      this.eventBus.emit('studio:backdrop-enabled', defaults.backdropEnabled ?? false);
      this.eventBus.emit('studio:backdrop-scale', defaults.backdropScale ?? 1);
      this.eventBus.emit('studio:backdrop-width', defaults.backdropWidth ?? 1);
      this.eventBus.emit('studio:backdrop-color', defaults.backdropColor ?? '#808080');
      this.eventBus.emit('studio:backdrop-rotation', defaults.backdropRotation ?? 0);
      this.eventBus.emit('studio:backdrop-y', defaults.backdropY ?? 0);
      this.eventBus.emit(
        'studio:backdrop-texture-enabled',
        defaults.backdropTextureEnabled ?? false,
      );
      this.eventBus.emit(
        'studio:backdrop-texture-scale',
        defaults.backdropTextureScale ?? 1.8,
      );
      this.eventBus.emit('studio:ground-wire-color', defaults.groundWireColor);
      this.eventBus.emit('scene:background', defaults.background);
      
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
        softness: defaults.lightsShadowSoftness ?? 4,
        contactOffset: defaults.lightsShadowContactOffset ?? -0.0001,
        twoSided: defaults.lightsShadowTwoSided ?? false,
      });
      this.eventBus.emit('lights:show-indicators', defaults.showLightIndicators ?? false);
      
      this.ui.syncUIFromState();
      this.helpers.showToast('Studio settings reset');
    };

    const resetRender = () => {
      this.ui.uiSounds?.playSelect();
      const defaults = this.stateStore.getDefaults();
      this.stateStore.batch(() => {
      this.stateStore.set('dof', defaults.dof);
      this.stateStore.set('bloom', defaults.bloom);
      this.stateStore.set('grain', defaults.grain);
      this.stateStore.set('aberration', defaults.aberration);
      this.stateStore.set('ambientOcclusion', defaults.ambientOcclusion);
      this.stateStore.set('fresnel', defaults.fresnel);
      this.stateStore.set('fisheye', defaults.fisheye);
      this.stateStore.set('camera', defaults.camera);
      this.stateStore.set('exposure', defaults.exposure);
      this.stateStore.set('autoExposure', defaults.autoExposure ?? false);
      this.stateStore.set('antiAliasing', defaults.antiAliasing);
      this.stateStore.set('renderQuality', defaults.renderQuality ?? 'medium');
      this.stateStore.set('svgColorDetail', defaults.svgColorDetail ?? 'high');
      this.stateStore.set('toneCurve', defaults.toneCurve);
      this.stateStore.set('toneMapping', defaults.toneMapping);
      this.stateStore.set('lookFilterPreset', 'none');
      });
      this.eventBus.emit('render:dof', defaults.dof);
      this.ui.setEffectControlsDisabled(['dofFocus', 'dofAperture'], !defaults.dof.enabled);
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
      this.ui.setEffectControlsDisabled(['grainIntensity'], !defaults.grain.enabled);
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
      this.eventBus.emit('render:contrast', defaults.camera.contrast);
      this.eventBus.emit('render:temperature', defaults.camera.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K);
      this.eventBus.emit('render:tint', (defaults.camera.tint ?? 0) / 100);
      this.eventBus.emit('render:highlights', (defaults.camera.highlights ?? 0) / 100);
      this.eventBus.emit('render:shadows', (defaults.camera.shadows ?? 0) / 100);
      this.eventBus.emit('render:saturation', defaults.camera.saturation);
      this.eventBus.emit('render:clarity', defaults.camera.clarity ?? 0);
      this.eventBus.emit('render:fade', defaults.camera.fade ?? 0);
      this.eventBus.emit('render:sharpness', defaults.camera.sharpness ?? 0);
      this.eventBus.emit(
        'render:vignette',
        effectiveVignetteIntensity(defaults.camera, defaults.camera),
      );
      this.eventBus.emit('render:vignette-color', defaults.camera.vignetteColor ?? '#000000');
      this.eventBus.emit('render:anti-aliasing', defaults.antiAliasing);
      this.eventBus.emit('render:tone-curve', defaults.toneCurve);
      this.eventBus.emit('render:tone-mapping', defaults.toneMapping);
      this.eventBus.emit('render:apply-performance');
      
      this.ui.syncUIFromState();
      this.helpers.showToast('FX settings reset');
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
          case 'material':
            this.stateStore.batch(() => {
              this.stateStore.set('material.brightness', defaults.material?.brightness ?? 1.0);
              this.stateStore.set('material.metalness', defaults.material?.metalness ?? 0.0);
              this.stateStore.set('material.roughness', defaults.material?.roughness ?? DEFAULT_MATERIAL_ROUGHNESS);
              this.stateStore.set('material.emissive', defaults.material?.emissive ?? 0.0);
            });
            this.eventBus.emit('mesh:material-brightness', defaults.material?.brightness ?? 1.0);
            this.eventBus.emit('mesh:material-metalness', defaults.material?.metalness ?? 0.0);
            this.eventBus.emit('mesh:material-roughness', defaults.material?.roughness ?? DEFAULT_MATERIAL_ROUGHNESS);
            this.eventBus.emit('mesh:material-emissive', defaults.material?.emissive ?? 0.0);
            this.ui.syncUIFromState();
            break;
            
          case 'clay':
            this.stateStore.set('clay', defaults.clay);
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
            this.stateStore.set('wireframe', defaults.wireframe);
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
            this.eventBus.emit('mesh:wireframe-always-on', defaults.wireframe.alwaysOn);
            this.eventBus.emit('mesh:wireframe-color', defaults.wireframe.color);
            this.eventBus.emit('mesh:wireframe-only-visible-faces', defaults.wireframe.onlyVisibleFaces);
            this.eventBus.emit('mesh:wireframe-hide-mesh', defaults.wireframe.hideMesh);
            this.ui.syncUIFromState();
            break;

          case 'creative-look':
            this.stateStore.set('creativeLook', defaults.creativeLook);
            if (this.ui.inputs.creativeLookEnabled) {
              this.ui.inputs.creativeLookEnabled.checked = !!defaults.creativeLook?.enabled;
            }
            this.ui.setCreativeLookActive(
              normalizeCreativeLookPreset(defaults.creativeLook?.preset),
            );
            this.ui.toggleCreativeLookGrid(!!defaults.creativeLook?.enabled);
            this.eventBus.emit('mesh:creative-look');
            this.ui.syncUIFromState();
            break;
            
          case 'hdri':
            this.stateStore.batch(() => {
              this.stateStore.set('hdri', defaults.hdri);
              this.stateStore.set('hdriStrength', defaults.hdriStrength);
              this.stateStore.set('hdriBlurriness', defaults.hdriBlurriness);
              this.stateStore.set('hdriRotation', defaults.hdriRotation);
              this.stateStore.set('hdriBackground', defaults.hdriBackground);
              this.stateStore.set('lensFlare', defaults.lensFlare);
            });
            this.ui.setHdriActive(defaults.hdri);
            this.eventBus.emit('studio:hdri', defaults.hdri);
            this.eventBus.emit('studio:hdri-strength', defaults.hdriStrength);
            this.eventBus.emit('studio:hdri-blurriness', defaults.hdriBlurriness);
            this.eventBus.emit('studio:hdri-rotation', defaults.hdriRotation);
            this.eventBus.emit('studio:hdri-background', defaults.hdriBackground);
            this.eventBus.emit('studio:lens-flare-enabled', defaults.lensFlare.enabled);
            this.eventBus.emit('studio:lens-flare-rotation', defaults.lensFlare.rotation);
            this.eventBus.emit('studio:lens-flare-height', defaults.lensFlare.height);
            this.eventBus.emit('studio:lens-flare-color', defaults.lensFlare.color);
            this.eventBus.emit('studio:lens-flare-anamorphic-bloom');
            this.ui.syncUIFromState();
            break;
          
          case 'lens-flare':
            this.stateStore.set('lensFlare', defaults.lensFlare);
            this.eventBus.emit('studio:lens-flare-enabled', defaults.lensFlare.enabled);
            this.eventBus.emit('studio:lens-flare-rotation', defaults.lensFlare.rotation);
            this.eventBus.emit('studio:lens-flare-height', defaults.lensFlare.height);
            this.eventBus.emit('studio:lens-flare-color', defaults.lensFlare.color);
            this.eventBus.emit('studio:lens-flare-quality', defaults.lensFlare.quality);
            this.eventBus.emit('studio:lens-flare-anamorphic-bloom');
            this.ui.syncUIFromState();
            break;
            
          case 'lights':
            this.stateStore.batch(() => {
              this.stateStore.set('lights', defaults.lights);
              this.stateStore.set('lightsMaster', defaults.lightsMaster);
              this.stateStore.set('lightsRotation', defaults.lightsRotation);
              this.stateStore.set('lightsHeight', defaults.lightsHeight ?? 5);
              this.stateStore.set(
                'lightsShadowQuality',
                defaults.lightsShadowQuality ?? 'medium',
              );
              this.stateStore.set(
                'lightsShadowSoftness',
                defaults.lightsShadowSoftness ?? 4,
              );
              this.stateStore.set(
                'lightsShadowContactOffset',
                defaults.lightsShadowContactOffset ?? -0.0001,
              );
              this.stateStore.set(
                'lightsShadowTwoSided',
                defaults.lightsShadowTwoSided ?? false,
              );
            });
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
              softness: defaults.lightsShadowSoftness ?? 4,
              contactOffset: defaults.lightsShadowContactOffset ?? -0.0001,
              twoSided: defaults.lightsShadowTwoSided ?? false,
            });
            this.ui.syncUIFromState();
            break;
          case 'lights-shadows':
            {
              const castShadows = defaults.lightsCastShadows ?? true;
              const shadowQuality = defaults.lightsShadowQuality ?? 'medium';
              const shadowSoftness = defaults.lightsShadowSoftness ?? 4;
              const shadowContactOffset = defaults.lightsShadowContactOffset ?? -0.0001;
              const shadowTwoSided = defaults.lightsShadowTwoSided ?? false;
              this.stateStore.batch(() => {
                this.stateStore.set('lightsCastShadows', castShadows);
                this.stateStore.set('lightsShadowQuality', shadowQuality);
                this.stateStore.set('lightsShadowSoftness', shadowSoftness);
                this.stateStore.set('lightsShadowContactOffset', shadowContactOffset);
                this.stateStore.set('lightsShadowTwoSided', shadowTwoSided);
              });
              this.eventBus.emit('lights:shadow-settings', {
                castShadows,
                quality: shadowQuality,
                softness: shadowSoftness,
                contactOffset: shadowContactOffset,
                twoSided: shadowTwoSided,
              });
              this.ui.syncUIFromState();
              break;
            }
          case 'keyLight':
            this.ui.resetIndividualLight('key', defaults.lights.key);
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
            
          case 'podium':
            this.stateStore.batch(() => {
              this.stateStore.set('groundSolidColor', defaults.groundSolidColor);
              this.stateStore.set('groundY', defaults.groundY);
              this.stateStore.set('podiumScale', defaults.podiumScale);
              this.stateStore.set('podiumMetalness', defaults.podiumMetalness);
              this.stateStore.set('podiumRoughness', defaults.podiumRoughness);
              this.stateStore.set('podiumReflection', defaults.podiumReflection);
              this.stateStore.set('podiumClearcoat', defaults.podiumClearcoat);
            });
            this.eventBus.emit('studio:ground-solid-color', defaults.groundSolidColor);
            this.eventBus.emit('studio:podium-scale', defaults.podiumScale);
            this.eventBus.emit('studio:podium-metalness', defaults.podiumMetalness);
            this.eventBus.emit('studio:podium-roughness', defaults.podiumRoughness);
            this.eventBus.emit('studio:podium-reflection', defaults.podiumReflection);
            this.eventBus.emit('studio:podium-clearcoat', defaults.podiumClearcoat);
            this.eventBus.emit('studio:ground-y', defaults.groundY);
            this.ui.syncControls(this.stateStore.getState());
            break;

          case 'podium-glass':
            this.stateStore.batch(() => {
              this.stateStore.set('podiumGlassSurface', defaults.podiumGlassSurface);
              this.stateStore.set('podiumGlassBrightness', defaults.podiumGlassBrightness);
              this.stateStore.set('podiumGlassBlur', defaults.podiumGlassBlur);
              this.stateStore.set('podiumGlassAmount', defaults.podiumGlassAmount);
            });
            this.eventBus.emit('studio:podium-glass-surface', defaults.podiumGlassSurface);
            this.eventBus.emit('studio:podium-glass-brightness', defaults.podiumGlassBrightness);
            this.eventBus.emit('studio:podium-glass-blur', defaults.podiumGlassBlur);
            this.eventBus.emit('studio:podium-glass-amount', defaults.podiumGlassAmount);
            this.ui.syncControls(this.stateStore.getState());
            break;

          case 'backdrop':
            this.stateStore.batch(() => {
              this.stateStore.set('backdropEnabled', defaults.backdropEnabled ?? false);
              this.stateStore.set('backdropScale', defaults.backdropScale ?? 1);
              this.stateStore.set('backdropWidth', defaults.backdropWidth ?? 1);
              this.stateStore.set('backdropColor', defaults.backdropColor ?? '#808080');
              this.stateStore.set('backdropRotation', defaults.backdropRotation ?? 0);
              this.stateStore.set('backdropY', defaults.backdropY ?? 0);
              this.stateStore.set('backdropTextureEnabled', defaults.backdropTextureEnabled ?? false);
              this.stateStore.set('backdropTextureScale', defaults.backdropTextureScale ?? 1.8);
            });
            this.eventBus.emit('studio:backdrop-enabled', defaults.backdropEnabled ?? false);
            this.eventBus.emit('studio:backdrop-scale', defaults.backdropScale ?? 1);
            this.eventBus.emit('studio:backdrop-width', defaults.backdropWidth ?? 1);
            this.eventBus.emit('studio:backdrop-color', defaults.backdropColor ?? '#808080');
            this.eventBus.emit('studio:backdrop-rotation', defaults.backdropRotation ?? 0);
            this.eventBus.emit('studio:backdrop-y', defaults.backdropY ?? 0);
            this.eventBus.emit(
              'studio:backdrop-texture-enabled',
              defaults.backdropTextureEnabled ?? false,
            );
            this.eventBus.emit(
              'studio:backdrop-texture-scale',
              defaults.backdropTextureScale ?? 1.8,
            );
            this.ui.syncControls(this.stateStore.getState());
            break;
            
          case 'background':
            this.stateStore.set('background', defaults.background);
            this.eventBus.emit('scene:background', defaults.background);
            this.ui.syncUIFromState();
            break;
            
          case 'grid':
            this.stateStore.batch(() => {
              this.stateStore.set('groundWireColor', defaults.groundWireColor);
              this.stateStore.set('groundWireOpacity', defaults.groundWireOpacity);
              this.stateStore.set('gridY', defaults.gridY);
              this.stateStore.set('gridScale', defaults.gridScale);
            });
            this.eventBus.emit('studio:ground-wire-color', defaults.groundWireColor);
            this.eventBus.emit('studio:ground-wire-opacity', defaults.groundWireOpacity);
            this.eventBus.emit('studio:grid-y', defaults.gridY);
            this.eventBus.emit('studio:grid-scale', defaults.gridScale);
            this.ui.syncControls(this.stateStore.getState());
            break;
            
          case 'dof':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.set('dof', defaults.dof);
            });
            this.eventBus.emit('render:dof', defaults.dof);
            this.ui.setEffectControlsDisabled(['dofFocus', 'dofAperture'], !defaults.dof.enabled);
            this.ui.syncUIFromState();
            break;
            
          case 'bloom':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.set('bloom', defaults.bloom);
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
            this.stateStore.set('lookFilterPreset', 'custom');
            this.stateStore.set(
              'lensFlare.anamorphicBloom',
              defaults.lensFlare.anamorphicBloom,
            );
            this.eventBus.emit('studio:lens-flare-anamorphic-bloom');
            this.ui.syncUIFromState();
            break;

          case 'lens-dirt':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.set('lensDirt', defaults.lensDirt);
            });
            this.eventBus.emit('render:lens-dirt', defaults.lensDirt);
            this.ui.setEffectControlsDisabled(['lensDirtStrength'], !defaults.lensDirt.enabled);
            this.ui.syncControls(this.stateStore.getState());
            break;
            
          case 'grain':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.set('grain', defaults.grain);
            });
            this.eventBus.emit('render:grain', defaults.grain);
            this.ui.setEffectControlsDisabled(['grainIntensity'], !defaults.grain.enabled);
            this.ui.syncUIFromState();
            break;
            
          case 'aberration':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.set('aberration', defaults.aberration);
            });
            this.eventBus.emit('render:aberration', defaults.aberration);
            this.ui.setEffectControlsDisabled(
              ['aberrationAmount'],
              !defaults.aberration.enabled,
            );
            this.ui.syncUIFromState();
            break;

          case 'color-checker':
            this.stateStore.set('colorChecker', deepClone(defaults.colorChecker));
            this.eventBus.emit('scene:color-checker-reference-shading');
            this.eventBus.emit('scene:color-checker');
            this.ui.syncUIFromState();
            this.helpers.showToast('ColorChecker reset');
            break;

          case 'ambient-occlusion':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.set('ambientOcclusion', defaults.ambientOcclusion);
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
            this.stateStore.set('fresnel', defaults.fresnel);
            this.eventBus.emit('render:fresnel', defaults.fresnel);
            this.ui.setEffectControlsDisabled(['fresnelColor', 'fresnelRadius', 'fresnelStrength'], !defaults.fresnel.enabled);
            this.ui.syncUIFromState();
            break;
            
          case 'camera':
            // Reset basic camera settings (FOV, Tilt, Exposure, Auto Exposure)
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.set('camera.fov', defaults.camera.fov);
              this.stateStore.set('fisheye', defaults.fisheye);
              this.stateStore.set('camera.tilt', defaults.camera.tilt ?? 0);
              this.stateStore.set('camera.handheld', defaults.camera.handheld ?? 'off');
              this.stateStore.set('exposure', defaults.exposure);
              this.stateStore.set('autoExposure', defaults.autoExposure ?? false);
              // Also reset vignette (camera/post-processing effect)
              this.stateStore.set('camera.vignetteEnabled', defaults.camera.vignetteEnabled ?? false);
              this.stateStore.set('camera.vignette', defaults.camera.vignette ?? 0.5);
              this.stateStore.set('camera.vignetteColor', defaults.camera.vignetteColor ?? '#000000');
            });
            // Emit events to update the scene
            this.eventBus.emit('camera:fov', defaults.camera.fov);
            this.eventBus.emit('camera:fisheye');
            this.eventBus.emit('camera:tilt', defaults.camera.tilt ?? 0);
            this.eventBus.emit('camera:handheld', defaults.camera.handheld ?? 'off');
            this.eventBus.emit('scene:exposure', defaults.exposure);
            this.eventBus.emit('camera:auto-exposure', defaults.autoExposure ?? false);
            this.eventBus.emit(
              'render:vignette',
              effectiveVignetteIntensity(defaults.camera, defaults.camera),
            );
            this.eventBus.emit('render:vignette-color', defaults.camera.vignetteColor ?? '#000000');
            // Sync UI to reflect the reset values
            this.ui.syncControls(this.stateStore.getState());
            break;

          case 'fisheye': {
            const feDefault =
              defaults.fisheye ?? {
                enabled: false,
                horizontalFOVDeg: 131,
                strength: 0.37,
                cylindricalRatio: 4,
              };
            this.stateStore.set('fisheye', deepClone(feDefault));
            this.eventBus.emit('camera:fisheye');
            this.eventBus.emit('camera:fov');
            this.ui.syncUIFromState();
            this.helpers.showToast('Fisheye Lens reset');
            break;
          }

          case 'color-correction':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.set('camera.contrast', defaults.camera.contrast);
              this.stateStore.set('camera.temperature', defaults.camera.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K);
              this.stateStore.set('camera.tint', defaults.camera.tint ?? 0);
              this.stateStore.set('camera.highlights', defaults.camera.highlights ?? 0);
              this.stateStore.set('camera.shadows', defaults.camera.shadows ?? 0);
              this.stateStore.set('camera.saturation', defaults.camera.saturation);
              this.stateStore.set('camera.clarity', defaults.camera.clarity ?? 0);
              this.stateStore.set('camera.fade', defaults.camera.fade ?? 0);
              this.stateStore.set('camera.sharpness', defaults.camera.sharpness ?? 0);
            });
            this.eventBus.emit('render:contrast', defaults.camera.contrast);
            this.eventBus.emit('render:temperature', defaults.camera.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K);
            this.eventBus.emit('render:tint', (defaults.camera.tint ?? 0) / 100);
            this.eventBus.emit('render:highlights', (defaults.camera.highlights ?? 0) / 100);
            this.eventBus.emit('render:shadows', (defaults.camera.shadows ?? 0) / 100);
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
              this.stateStore.set('camera.vignetteEnabled', defaults.camera.vignetteEnabled ?? false);
              this.stateStore.set('camera.vignette', defaults.camera.vignette ?? 0.5);
              this.stateStore.set('camera.vignetteColor', defaults.camera.vignetteColor ?? '#000000');
            });
            this.eventBus.emit(
              'render:vignette',
              effectiveVignetteIntensity(defaults.camera, defaults.camera),
            );
            this.eventBus.emit('render:vignette-color', defaults.camera.vignetteColor ?? '#000000');
            this.ui.syncControls(this.stateStore.getState());
            break;

          case 'tone-curve':
            this.stateStore.batch(() => {
              this.stateStore.set('lookFilterPreset', 'custom');
              this.stateStore.set('toneCurve', defaults.toneCurve);
            });
            this.eventBus.emit('render:tone-curve', this.stateStore.getState().toneCurve);
            this.ui.renderControls.toneCurveController?.syncFromState(
              this.stateStore.getState(),
            );
            break;
            
          case 'transform':
            this.stateStore.batch(() => {
              this.stateStore.set('scale', defaults.scale);
              this.stateStore.set('xOffset', defaults.xOffset);
              this.stateStore.set('yOffset', defaults.yOffset);
              this.stateStore.set('zOffset', defaults.zOffset);
              this.stateStore.set('rotationX', defaults.rotationX);
              this.stateStore.set('rotationY', defaults.rotationY);
              this.stateStore.set('rotationZ', defaults.rotationZ);
            });
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
            this.stateStore.batch(() => {
              this.stateStore.set('svgExtrude.depth', defaults.svgExtrude?.depth ?? 0.2);
              this.stateStore.set('svgExtrude.normalAngle', defaults.svgExtrude?.normalAngle ?? 45);
              this.stateStore.set('svgExtrude.colorDepths', defaults.svgExtrude?.colorDepths ?? {});
              this.stateStore.set('svgExtrude.colorOffsets', defaults.svgExtrude?.colorOffsets ?? {});
              this.stateStore.set('svgExtrude.flipDirection', defaults.svgExtrude?.flipDirection ?? false);
              this.stateStore.set('svgExtrude.colorOverride', defaults.svgExtrude?.colorOverride ?? false);
              this.stateStore.set('svgExtrude.overrideColor', defaults.svgExtrude?.overrideColor ?? '#7ed321');
              this.stateStore.set('svgExtrude.surfacePreset', defaults.svgExtrude?.surfacePreset ?? 'none');
              this.stateStore.set('svgExtrude.surfaceScale', defaults.svgExtrude?.surfaceScale ?? 1.0);
            });
            this.eventBus.emit('mesh:svg-extrude-depth', defaults.svgExtrude?.depth ?? 0.2);
            this.eventBus.emit('mesh:svg-extrude-normal-angle', defaults.svgExtrude?.normalAngle ?? 45);
            this.eventBus.emit('mesh:svg-extrude-color-depths', defaults.svgExtrude?.colorDepths ?? {});
            this.eventBus.emit('mesh:svg-extrude-color-offsets', defaults.svgExtrude?.colorOffsets ?? {});
            this.eventBus.emit('mesh:svg-extrude-flip-direction', defaults.svgExtrude?.flipDirection ?? false);
            this.eventBus.emit('mesh:svg-extrude-color-override', {
              enabled: defaults.svgExtrude?.colorOverride ?? false,
              color: defaults.svgExtrude?.overrideColor ?? '#7ed321',
            });
            this.eventBus.emit('mesh:svg-extrude-surface', {
              preset: defaults.svgExtrude?.surfacePreset ?? 'none',
              scale: defaults.svgExtrude?.surfaceScale ?? 1.0,
            });
            this.ui.syncUIFromState();
            this.helpers.showToast('SVG Extrude settings reset');
            break;

          case 'advanced':
            this.stateStore.set('advanced.reverseNormals', defaults.advanced?.reverseNormals ?? false);
            this.stateStore.set(
              'advanced.transparencyFix',
              defaults.advanced?.transparencyFix ?? 'default',
            );
            this.stateStore.set('advanced.glassOpacity', defaults.advanced?.glassOpacity ?? 0.45);
            this.stateStore.set('advanced.glassReflection', defaults.advanced?.glassReflection ?? 2);
            this.stateStore.set('advanced.glassTint', defaults.advanced?.glassTint ?? '#ffffff');
            this.stateStore.set('advanced.glassBody', defaults.advanced?.glassBody ?? 0);
            this.stateStore.set(
              'advanced.blendSortingMitigation',
              defaults.advanced?.blendSortingMitigation ?? false,
            );
            this.stateStore.set(
              'advanced.flipGlassNormalMapY',
              defaults.advanced?.flipGlassNormalMapY ?? false,
            );
            this.stateStore.set(
              'advanced.glassFrontFacesOnly',
              defaults.advanced?.glassFrontFacesOnly ?? false,
            );
            this.eventBus.emit('mesh:reverse-normals', defaults.advanced?.reverseNormals ?? false);
            this.eventBus.emit('mesh:transparency-fix');
            this.eventBus.emit('mesh:glass-appearance');
            this.ui.syncUIFromState();
            break;
        }
        // The user just reset this section; treat it as freshly untouched
        // so its icon stays hidden until they interact with it again.
        this.clearResetTouched(resetType);
        this.updateResetVisibility(this.stateStore.getState());
      });
    });
  }
}

