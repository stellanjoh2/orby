import { resolveRenderQualityTier } from '../constants.js';
import { isOrbySceneFile } from '../import/dispatchImportFile.js';
import { handoffFileToMobileAppIfLanding } from '../orbyMobileHandoff.js';
import { registerSceneManifestHandlers } from '../state/controlManifestCore.js';
import { SCENE_CONTROL_MANIFEST } from '../state/sceneControlManifest.js';

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
   * Show/hide a transform gizmo and attach/detach from model root.
   * @param {*} s - SceneManager instance (`register` shorthand)
   * @param {*} control - TransformControls instance or null
   * @param {boolean} enabled
   */
  setTransformWidgetEnabled(s, control, enabled) {
    if (!control) return;
    control.visible = enabled;
    if (enabled && s.currentModel && s.modelRoot) {
      control.attach(s.modelRoot);
    } else if (!enabled) {
      control.detach();
    }
  }

  /**
   * Register all event listeners
   * All events delegate to SceneManager methods
   */
  register() {
    const { eventBus, scene } = this;
    const s = scene; // Shorthand for readability

    registerSceneManifestHandlers(eventBus, s, SCENE_CONTROL_MANIFEST);

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

    eventBus.on('mesh:fbx-map-slot', (payload) => {
      void s.applyFbxMapSlot(payload);
    });
    eventBus.on('mesh:fbx-map-clear', (payload) => {
      s.clearFbxMapSlot(payload);
    });
    eventBus.on('mesh:fbx-material-tuning', (payload) => {
      const key = payload?.materialKey ?? '';
      const patch = payload?.patch ?? {};
      s.setFbxMaterialTuning(key, patch);
    });
    eventBus.on('mesh:fbx-apply-tuning-all', (payload) => {
      const key = payload?.materialKey ?? '';
      s.applyFbxTuningToAllMaterials(key);
    });
    eventBus.on('mesh:fbx-rescan-folder', () => {
      void s.rescanFbxMapSlotTextures();
    });
    eventBus.on('mesh:fbx-restore-tuning', () => {
      s.materialController?.applyFbxMapSlotsTuningFromState?.();
      s.eventBus.emit('scene:fbx-tuning-changed');
    });
    eventBus.on('mesh:fbx-active-material', (payload) => {
      const key = payload?.materialKey ?? payload;
      s.setFbxActiveMaterial(typeof key === 'string' ? key : '');
    });

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
    eventBus.on('mesh:creative-look-live', () => {
      s.materialController?.syncCreativeLookLiveFromStore?.();
    });
    eventBus.on('mesh:reset-transform', () => {
      s.transformController?.setRotationY(0);
    });

    // Transform widget visibility
    eventBus.on('mesh:move-widget-enabled', (enabled) => {
      this.setTransformWidgetEnabled(s, s.transformControlsTranslate, enabled);
    });
    eventBus.on('mesh:rotate-widget-enabled', (enabled) => {
      this.setTransformWidgetEnabled(s, s.transformControlsRotate, enabled);
    });
    eventBus.on('mesh:scale-widget-enabled', (enabled) => {
      this.setTransformWidgetEnabled(s, s.transformControlsScale, enabled);
    });

    // Camera events
    eventBus.on('camera:fov', () => {
      s.syncPerspectiveCameraFovAndLens();
    });
    eventBus.on('camera:fisheye', () => {
      s.syncPerspectiveCameraFovAndLens();
    });
    eventBus.on('camera:focus', () => {
      if (s.currentModel) {
        s.cameraController?.focusOnObjectAnimated(s.currentModel, 1.0);
      }
    });
    eventBus.on('camera:reset', () => {
      s.cameraController?.resetWorldPose?.();
    });
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
      s.cameraController?._cancelFocusAnimation?.();
      if (state.position) {
        s.camera.position.set(state.position.x, state.position.y, state.position.z);
      }
      if (state.target) {
        s.controls.target.set(state.target.x, state.target.y, state.target.z);
        s.controls.update();
      }
      s.cameraController?.emitPoseChanged?.();
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

    // Render/Post-processing events (complex / one-off — manifest handles slice settings)
    eventBus.on('dof:reset-smooth-focus', (focus) => {
      s.dofAutofocus?.resetSmoothFocus?.(focus);
    });
    eventBus.on('render:anti-aliasing', (value) => {
      if (s.fxaaPass) {
        const state = s.stateStore.getState();
        const tier = resolveRenderQualityTier(state.renderQuality);
        s.fxaaPass.enabled = !tier.forceFxaaOff && value === 'fxaa';
      }
    });
    eventBus.on('render:apply-performance', () => {
      s.applyRenderQualitySettings();
    });
    eventBus.on('camera:composition-grid', (payload) => {
      let enabled;
      let animate = false;
      if (
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        Object.prototype.hasOwnProperty.call(payload, 'enabled')
      ) {
        enabled = !!payload.enabled;
        animate = !!payload.animate;
      } else {
        enabled = !!payload;
      }
      s.setCompositionGridOverlayVisible(enabled, { animate });
    });
    eventBus.on('camera:composition-portrait-crop-guide', (enabled) => {
      const gridOn = !!s.stateStore?.getState?.()?.camera?.compositionGridEnabled;
      s.setCompositionPortraitCropGuideVisible(!!enabled && gridOn);
    });
    eventBus.on('camera:cinematic-letterbox-219', (payload) => {
      let enabled;
      let animate = false;
      if (
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        Object.prototype.hasOwnProperty.call(payload, 'enabled')
      ) {
        enabled = !!payload.enabled;
        animate = !!payload.animate;
      } else {
        enabled = !!payload;
      }
      s.setCinematicLetterbox219Visible(enabled, { animate });
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
        s._syncEffectiveCastShadows();
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

    // Scene/Background events
    eventBus.on('scene:background-image', (config) => {
      s.backgroundImageController?.setConfig(config);
      if (!config?.asset?.dataBase64) {
        s.backgroundImageController?.setImage(null);
      }
    });
    eventBus.on('scene:exposure', (value) => {
      s.autoExposureController?.setManualExposure(value);
      s.ui?.updateExposureDisplay?.(value);
      s.lensDirtController?.updateExposureFactor();
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

    // Animation events
    eventBus.on('animation:toggle', () => s.animationController.togglePlayback());
    eventBus.on('animation:clip-mode', (mode) => {
      s.animationController.setClipPlaybackMode(mode);
      s.stateStore.set('animation.clipPlaybackMode', mode === 'cycle' ? 'cycle' : 'loop');
    });
    eventBus.on('animation:display-fps', (fps) => {
      const next = s.ui.syncAnimationDisplayFps(fps);
      s.stateStore.set('animation.displayFps', next);
    });
    eventBus.on('animation:time-reference', (enabled) => {
      s.ui.syncAnimationTimeReference(!!enabled);
      s.stateStore.set('animation.timeReferenceEnabled', !!enabled);
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
      if (s.exportMovementPreview?.isActive?.()) {
        s.exportMovementPreview.stop({ silent: payload?.silent ?? true });
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
    eventBus.on('scene:color-checker', () => {
      s.applyColorCheckerFromState(s.stateStore.getState());
    });
    eventBus.on('scene:color-checker-reference-shading', () => {
      s.applyColorCheckerReferenceShading();
    });
  }

  /**
   * Get eventBus from scene manager
   */
  get eventBus() {
    return this.scene.eventBus;
  }
}
