import { registerSceneManifestHandlers } from '../state/controlManifestCore.js';
import { SCENE_CONTROL_MANIFEST } from '../state/sceneControlManifest.js';
import { MODIFIER_IDS } from '../state/defaults/modifierDefaults.js';
import { setPerLightCastShadows } from '../lights/lightCastShadowEffective.js';
import { isOrbySceneFile } from '../import/dispatchImportFile.js';
import { handoffFileToMobileAppIfLanding } from '../orbyMobileHandoff.js';

const MODIFIER_AMOUNT_SLIDER_IDS = new Set(
  MODIFIER_IDS.map((id) => `modifier${id.charAt(0).toUpperCase()}${id.slice(1)}Amount`),
);

/**
 * EventManager - Handles all eventBus event listeners for SceneManager
 * Centralizes all event registration and delegation to SceneManager methods
 */
export class EventManager {
  constructor(sceneManager) {
    this.scene = sceneManager;
  }

  /** @param {import('../SceneManager.js').SceneManager} s */
  async loadOrbySceneFromUserFile(s, file) {
    await s.ui?.ensureStudioUiReady?.();
    const result = await s.ui?.sceneSettingsManager?.loadOrbyFromFile(file);
    if (result?.success) {
      s.ui.syncControls?.(s.stateStore.getState());
    }
    if (result?.message) {
      s.ui.showToast(result.message, 3200, { notification: false });
    }
    return result;
  }

  /**
   * Register all event listeners
   * All events delegate to SceneManager methods
   */
  register() {
    const { eventBus, scene } = this;
    const s = scene; // Shorthand for readability

    registerSceneManifestHandlers(eventBus, s, SCENE_CONTROL_MANIFEST);

    eventBus.on('ui:range-scrub-end', (slider) => {
      if (!slider?.id || !MODIFIER_AMOUNT_SLIDER_IDS.has(slider.id)) return;
      s.syncModifiersSceneAfterScrub();
    });

    // ── Complex handlers (multi-step, async, or conditional) ────────────────

    eventBus.on('mesh:shading', (mode) => {
      const hadMapPreview = !!s.materialController?.mapInspectPreview?.activeSlot;
      s.setShading(mode);
      s.setSceneGeometryWireframe(false);
      if (s._suppressModeChangeToasts === 0) {
        s.ui?.showModeChangeToast?.('displayMode', mode, { mapPreviewCleared: hadMapPreview });
      }
    });

    /* Subsurface events — enable with SUBSURFACE_FEATURE_ENABLED in MaterialController.js.
    eventBus.on('mesh:subsurface-translucency', (value) => {
      s.setSubsurfaceSettings({ translucency: value });
    });
    eventBus.on('mesh:subsurface-scatter-tint', (value) => {
      s.setSubsurfaceSettings({ scatterTint: value });
    });
    eventBus.on('mesh:subsurface', (settings) => {
      if (settings && typeof settings === 'object') {
        s.setSubsurfaceSettings(settings);
      }
    });
    */

    eventBus.on('mesh:creative-look', () => {
      const cl = s.stateStore.getState().creativeLook ?? {
        enabled: false,
        preset: 'neon-edge',
        pauseShaderAnimations: false,
        shaderAnimationSpeed: 0.4,
        patternScale: 1,
        masterHue: 0,
        intensity: 1,
        liftCrush: 0,
      };
      void s.applyCreativeLookFromState(cl, { skipStateStore: true });
    });

    // Camera events
    eventBus.on('camera:pose-changed', (pose) => {
      if (!pose?.position) return;
      s.ui?.renderControls?.syncCameraWorldPose?.(pose);
      if (pose.persist === false) return;
      s.stateStore.batch(() => {
        s.stateStore.set('camera.worldPosition', { ...pose.position });
        s.stateStore.set('camera.distance', pose.distance);
      });
    });
    eventBus.on('camera:get-state', () => {
      const state = {
        position: {
          x: s.camera.position.x,
          y: s.camera.position.y,
          z: s.camera.position.z,
        },
        target: {
          x: s.controls.target.x,
          y: s.controls.target.y,
          z: s.controls.target.z,
        },
      };
      eventBus.emit('camera:state', state);
    });
    eventBus.on('camera:set-state', (state) => {
      const cc = s.cameraController;
      cc?._cancelFocusAnimation?.();
      cc?._unlockOrbitSolve?.();
      if (state.position) {
        s.camera.position.set(state.position.x, state.position.y, state.position.z);
      }
      if (state.target) {
        s.controls.target.set(state.target.x, state.target.y, state.target.z);
      }
      cc?._updateOrbitControls?.();
      if (cc && !cc.isIsometricModeActive?.()) {
        cc._applyTilt?.();
      }
      cc?._lockOrbitSolve?.();
      cc?.emitPoseChanged?.({ persist: false });
    });
    eventBus.on('camera:lock-orbit', () => {
      if (s.controls) {
        s.controls.enableRotate = false;
        s.controls.enablePan = false;
      }
    });
    eventBus.on('camera:unlock-orbit', () => {
      if (s.controls) {
        s.controls.enableRotate = true;
        s.controls.enablePan = true;
      }
    });

    // Lights events
    eventBus.on('lights:update', ({ lightId, property, value }) => {
      if (
        lightId === 'key'
        && (property === 'height' || property === 'rotate')
        && !s._applyingKeyLightFromLensFlare
        && s.stateStore.getState().lensFlare?.keyLightConnected
      ) {
        s.setLensFlareKeyLightConnected(false);
      }
      if (property === 'castShadows') {
        setPerLightCastShadows(s, lightId, value === true);
        return;
      } else {
        s.lightsController?.updateLightProperty(lightId, property, value);
        if (property === 'enabled' && lightId !== 'ambient') {
          s._syncEffectiveCastShadows();
        }
      }
      if (
        lightId === 'key'
        && (property === 'height' || property === 'rotate')
        && s.goboProjection?.enabled
      ) {
        s.goboProjection.syncUniformsOnScene(s._getGoboSceneTargets());
      }
    });
    eventBus.on('lights:gobo-enabled', (enabled) => {
      void s.setGoboEnabled(enabled);
    });
    eventBus.on('lights:gobo-texture', (textureId) => {
      void s.setGoboTexture(textureId);
    });

    // File loading events (.orby scenes are restored via SceneSettingsManager)
    eventBus.on('file:selected', async (payload) => {
      let file;
      const loadOpts = {};
      if (payload instanceof File) {
        file = payload;
      } else if (payload && typeof payload === 'object') {
        file = payload.file;
        if (payload.suppressSuccessToastSound) loadOpts.suppressSuccessToastSound = true;
      }
      if (!(file instanceof File)) return;

      if (isOrbySceneFile(file)) {
        await this.loadOrbySceneFromUserFile(s, file);
        return;
      }

      if (await handoffFileToMobileAppIfLanding(file)) return;

      s.loadFile(file, loadOpts);
    });
    eventBus.on('file:bundle', async (bundle) => {
      if (Array.isArray(bundle) && bundle.length === 1) {
        const entry = bundle[0];
        const file = entry instanceof File ? entry : entry?.file;
        if (file instanceof File) {
          if (isOrbySceneFile(file)) {
            await this.loadOrbySceneFromUserFile(s, file);
            return;
          }
          if (await handoffFileToMobileAppIfLanding(file)) return;
        }
      }
      s.loadFileBundle(bundle);
    });
    eventBus.on('file:reload', async () => {
      if (s.currentFile) {
        await s.loadFile(s.currentFile, { silent: true });
      } else {
        s.ui.showToast('No model to reload');
      }
    });
    eventBus.on('scene:get-current-file', () => {
      eventBus.emit('scene:current-file', { file: s.currentFile || null });
    });

    // Export events
    eventBus.on('scene:batch-apply-start', () => {
      s._suppressModeChangeToasts += 1;
    });
    eventBus.on('scene:batch-apply-end', () => {
      s._suppressModeChangeToasts = Math.max(0, s._suppressModeChangeToasts - 1);
    });
    eventBus.on('export:video-preview-scrub', (payload) => {
      const { t, ...settings } = payload || {};
      s.scrubExportVideoPreview(t, settings);
    });
    eventBus.on('export:video-preview-play-toggle', (payload) =>
      s.toggleExportVideoPreviewPlay(payload),
    );
    eventBus.on('export:video-preview-reset', (payload) =>
      s.resetExportVideoPreview(payload),
    );
    eventBus.on('export:video-preview-settings-changed', (payload) =>
      s.syncExportVideoPreviewSettings(payload),
    );
    eventBus.on('export:movement-preview-stop', (payload = {}) => {
      if (!s.exportMovementPreview?.isActive?.()) return;
      s.exportMovementPreview.stop({ silent: payload?.silent ?? true });
      if (typeof payload.toast === 'string' && payload.toast) {
        s.ui?.showToast?.(payload.toast, 2800, { notification: false });
      }
    });

    // App events
    eventBus.on('app:reset', () => {
      if (s.isStudioReady) {
        void s.applyStateSnapshot(s.stateStore.getState());
      }
    });
    eventBus.on('scene:orby-import-start', () => {
      s._skipGroundGridAutoAlignOnNextModelLoad = true;
      s._skipCameraFlightOnNextModelLoad = true;
    });
    eventBus.on('scene:settings-restored', () => {
      if (s.isStudioReady) {
        void s.applyStateSnapshot(s.stateStore.getState());
      }
      s._refreshImportSmoothingUi();
    });
  }

  /**
   * Get eventBus from scene manager
   */
  get eventBus() {
    return this.scene.eventBus;
  }
}
