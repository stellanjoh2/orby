import { resolveRenderQualityTier } from '../constants.js';
import { isOrbySceneFile } from '../import/dispatchImportFile.js';
import { handoffFileToMobileAppIfLanding } from '../orbyMobileHandoff.js';

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

    // Mesh/Transform events
    eventBus.on('mesh:scale', (value) => s.setScale(value));
    eventBus.on('mesh:xOffset', (value) => s.setXOffset(value));
    eventBus.on('mesh:yOffset', (value) => s.setYOffset(value));
    eventBus.on('mesh:zOffset', (value) => s.setZOffset(value));
    eventBus.on('mesh:rotationX', (value) => s.setRotationX(value));
    eventBus.on('mesh:rotationY', (value) => s.setRotationY(value));
    eventBus.on('mesh:rotationZ', (value) => s.setRotationZ(value));
    eventBus.on('mesh:shading', (mode) => {
      const hadMapPreview = !!s.materialController?.mapInspectPreview?.activeSlot;
      s.setShading(mode);
      s.setSceneGeometryWireframe(false);
      if (s._suppressModeChangeToasts === 0) {
        s.ui?.showModeChangeToast?.('displayMode', mode, { mapPreviewCleared: hadMapPreview });
      }
    });
    eventBus.on('mesh:auto-rotate', (speed) => {
      s.setAutoRotateSpeed(speed);
    });
    eventBus.on('mesh:clay-color', (value) => {
      s.setClaySettings({ color: value });
    });
    eventBus.on('mesh:material-brightness', (brightness) => {
      s.materialController?.setMaterialBrightness(brightness);
    });
    eventBus.on('mesh:material-metalness', (metalness) => {
      s.materialController?.setMaterialMetalness(metalness);
    });
    eventBus.on('mesh:material-roughness', (roughness) => {
      s.materialController?.setMaterialRoughness(roughness);
    });
    eventBus.on('mesh:material-emissive', (emissive) => {
      s.materialController?.setMaterialEmissive(emissive);
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
    eventBus.on('mesh:map-inspect-preview', (slot) => s.setMapInspectPreview(slot));
    eventBus.on('mesh:map-inspect-clear', () => s.clearMapInspectPreview());
    eventBus.on('mesh:svg-extrude-depth', (depth) => s.setSvgExtrudeDepth(depth));
    eventBus.on('mesh:svg-extrude-normal-angle', (angle) => s.setSvgExtrudeNormalAngle(angle));
    eventBus.on('mesh:svg-extrude-bevel', (payload) => s.setSvgExtrudeBevel(payload ?? {}));
    eventBus.on('mesh:svg-extrude-detail', (detail) => s.setSvgExtrudeDetail(detail));
    eventBus.on('mesh:svg-extrude-color-depths', (payload) => s.setSvgExtrudeColorDepths(payload));
    eventBus.on('mesh:svg-extrude-color-depth', (payload) => s.setSvgExtrudeColorDepth(payload));
    eventBus.on('mesh:svg-extrude-color-offsets', (payload) => s.setSvgExtrudeColorOffsets(payload));
    eventBus.on('mesh:svg-extrude-color-offset', (payload) => s.setSvgExtrudeColorOffset(payload));
    eventBus.on('mesh:svg-extrude-flip-direction', (enabled) => s.setSvgExtrudeFlipDirection(enabled));
    eventBus.on('mesh:svg-extrude-surface', (payload) => s.setSvgExtrudeSurface(payload ?? {}));
    eventBus.on('mesh:reverse-normals', (enabled) => s.setReverseNormals(enabled));
    eventBus.on('mesh:stl-smoothing', () => s.applyStlSmoothingFromState());
    eventBus.on('mesh:center-pivot', (enabled) => s.setCenterPivot(!!enabled));
    eventBus.on('mesh:uv-checker', (enabled) => s.setUvCheckerEnabled(enabled));
    eventBus.on('mesh:uv-checker-scale', (scale) => s.setUvCheckerScale(scale));
    eventBus.on('mesh:uv-checker-style', (style) => s.setUvCheckerStyle(style));
    eventBus.on('mesh:normal-view', (enabled) => s.setNormalViewEnabled(enabled));
    eventBus.on('mesh:normal-view-mode', (mode) => s.setNormalViewMode(mode));
    eventBus.on('mesh:transparency-fix', () => s.applyTransparencyFixFromState());
    eventBus.on('mesh:glass-appearance', () => s.applyGlassAppearanceFromState());
    eventBus.on('mesh:svg-extrude-color-override', (settings) => s.setSvgExtrudeColorOverride(settings));
    // Legacy support
    eventBus.on('mesh:diffuse-brightness', (value) => {
      s.materialController?.setMaterialBrightness(value);
    });
    eventBus.on('mesh:wireframe-always-on', (value) => {
      s.setWireframeSettings({ alwaysOn: value });
      s.setSceneGeometryWireframe(false);
    });
    eventBus.on('mesh:wireframe-color', (value) => {
      s.setWireframeSettings({ color: value });
    });
    eventBus.on('mesh:wireframe-only-visible-faces', (value) => {
      s.setWireframeSettings({ onlyVisibleFaces: value });
    });
    eventBus.on('mesh:wireframe-hide-mesh', (value) => {
      s.setWireframeSettings({ hideMesh: value });
    });
    eventBus.on('mesh:wireframe-thickness', (value) => {
      s.setWireframeSettings({ thickness: value });
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
    eventBus.on('camera:preset', (preset) => s.applyCameraPreset(preset));
    eventBus.on('camera:fov', () => {
      s.syncPerspectiveCameraFovAndLens();
    });
    eventBus.on('camera:fisheye', () => {
      s.syncPerspectiveCameraFovAndLens();
    });
    eventBus.on('camera:auto-orbit', (value) => s.setCameraAutoOrbit(value));
    eventBus.on('camera:handheld', (value) => s.setCameraHandheld(value));
    eventBus.on('camera:tilt', (value) => {
      s.cameraController?.setTilt(value);
    });
    eventBus.on('camera:isometric', (settings) => {
      s.applyIsometricCamera?.(settings);
    });
    eventBus.on('camera:focus', () => {
      if (s.currentModel) {
        s.cameraController?.focusOnObjectAnimated(s.currentModel, 1.0);
      }
    });
    eventBus.on('camera:reset', () => {
      s.cameraController?.resetWorldPose?.();
    });
    eventBus.on('camera:world-position', (position) => {
      if (!position) return;
      s.cameraController?.setWorldPosition(position.x, position.y, position.z);
    });
    eventBus.on('camera:distance', (distance) => {
      s.cameraController?.setDistance(distance);
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

    // Studio/HDRI events
    eventBus.on('studio:hdri', (preset) => s.setHdriPreset(preset));
    eventBus.on('studio:hdri-upload', (file) => s.loadCustomHdri(file));
    eventBus.on('studio:hdri-clear-custom', () => s.clearCustomHdri());
    eventBus.on('studio:hdri-enabled', (enabled) => s.setHdriEnabled(enabled));
    eventBus.on('studio:hdri-strength', (value) => s.setHdriStrength(value));
    eventBus.on('studio:hdri-blurriness', (value) => s.setHdriBlurriness(value));
    eventBus.on('studio:hdri-rotation', (value) => s.setHdriRotation(value));
    eventBus.on('studio:hdri-background', (enabled) => s.setHdriBackground(enabled));
    eventBus.on('studio:hdri-receive-shadows-ao', (enabled) =>
      s.setHdriReceiveShadowsAo(enabled),
    );
    eventBus.on('studio:lens-flare-enabled', (enabled) => s.setLensFlareEnabled(enabled));
    eventBus.on('studio:lens-flare-rotation', (value) => s.setLensFlareRotation(value));
    eventBus.on('studio:lens-flare-height', (value) => s.setLensFlareHeight(value));
    eventBus.on('studio:lens-flare-color', (value) => s.setLensFlareColor(value));
    eventBus.on('studio:lens-flare-quality', (value) => s.setLensFlareQuality(value));
    eventBus.on('studio:lens-flare-halo', (value) => s.setLensFlareHaloIntensity(value));
    eventBus.on('studio:lens-flare-streak-length', (value) => s.setLensFlareStreakLength(value));
    eventBus.on('studio:lens-flare-sun-disc-scale', (value) => s.setLensFlareSunDiscScale(value));
    eventBus.on('studio:lens-flare-sun-disc-blur', (value) => s.setLensFlareSunDiscBlur(value));
    eventBus.on('studio:lens-flare-sun-disc-color', (value) => s.setLensFlareSunDiscColor(value));
    eventBus.on('studio:lens-flare-disc-glow-intensity', (value) => s.setLensFlareDiscGlowIntensity(value));
    eventBus.on('studio:lens-flare-disc-glow-size', (value) => s.setLensFlareDiscGlowSize(value));
    eventBus.on('studio:lens-flare-disc-glow-color', (value) => s.setLensFlareDiscGlowColor(value));
    eventBus.on('studio:lens-flare-anamorphic-bloom', () => s.syncAnamorphicBloomFromState());
    eventBus.on('studio:god-rays-enabled', (enabled) => s.setGodRaysEnabled(enabled));
    eventBus.on('studio:god-rays-color', (value) => s.setGodRaysColor(value));
    eventBus.on('studio:god-rays-light-scale', (value) => s.setGodRaysLightScale(value));
    eventBus.on('studio:god-rays-opacity', (value) => s.setGodRaysOpacity(value));
    eventBus.on('studio:god-rays-density', (value) => s.setGodRaysDensity(value));
    eventBus.on('studio:god-rays-decay', (value) => s.setGodRaysDecay(value));
    eventBus.on('studio:god-rays-weight', (value) => s.setGodRaysWeight(value));
    eventBus.on('studio:god-rays-exposure', (value) => s.setGodRaysExposure(value));
    eventBus.on('studio:god-rays-clamp-max', (value) => s.setGodRaysClampMax(value));
    eventBus.on('studio:god-rays-blur', (enabled) => s.setGodRaysBlur(enabled));
    eventBus.on('studio:lens-flare-spin-during-orbit', (enabled) =>
      s.setLensFlareSpinDuringOrbit(enabled),
    );
    eventBus.on('studio:lens-flare-key-light-connected', (enabled) =>
      s.setLensFlareKeyLightConnected(!!enabled),
    );
    eventBus.on('studio:lens-flare-key-light-sync', () =>
      s._syncKeyLightFromLensFlareIfConnected(),
    );
    eventBus.on('studio:god-rays-quality', (value) => s.setGodRaysQuality(value));
    // Legacy saved scenes / presets
    eventBus.on('studio:god-rays-strength', (value) => s.setGodRaysStrength(value));
    eventBus.on('studio:god-rays-length', (value) => s.setGodRaysLength(value));
    eventBus.on('studio:god-rays-softness', (value) => s.setGodRaysSoftness(value));
    eventBus.on('studio:god-rays-threshold', () => {});
    eventBus.on('mesh:clay-normal-map', (enabled) => s.setClayNormalMap(enabled));

    // Render/Post-processing events
    eventBus.on('render:contrast', (value) => s.setContrast(value));
    eventBus.on('render:saturation', (value) => s.setSaturation(value));
    eventBus.on('render:clarity', (value) => s.setClarity(value));
    eventBus.on('render:fade', (value) => s.setFade(value));
    eventBus.on('render:sharpness', (value) => s.setSharpness(value));
    eventBus.on('render:tone-curve', (curve) => s.setToneCurve(curve));
    eventBus.on('render:temperature', (value) => s.setTemperature(value));
    eventBus.on('render:tint', (value) => s.setTint(value));
    eventBus.on('render:highlights', (value) => s.setHighlights(value));
    eventBus.on('render:shadows', (value) => s.setShadows(value));
    eventBus.on('render:vignette', (value) => s.setVignette(value));
    eventBus.on('render:vignette-color', (value) => s.setVignetteColor(value));
    eventBus.on('render:dof', (settings) => {
      s.updateDof(settings);
      s.applyRenderQualityVisualOverrides();
    });
    eventBus.on('dof:reset-smooth-focus', (focus) => {
      s.dofAutofocus?.resetSmoothFocus?.(focus);
    });
    eventBus.on('render:bloom', (settings) => {
      s.updateBloom(settings);
      s.applyRenderQualityVisualOverrides();
    });
    eventBus.on('render:grain', (settings) => s.updateGrain(settings));
    eventBus.on('render:aberration', (settings) => s.updateAberration(settings));
    eventBus.on('render:ambient-occlusion', (settings) =>
      s.updateAmbientOcclusion(settings),
    );
    eventBus.on('render:fresnel', (settings) => s.setFresnelSettings(settings));
    eventBus.on('render:lens-dirt', (settings) => s.lensDirtController?.updateSettings(settings));
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
    eventBus.on('render:tone-mapping', (value) => s.setToneMapping(value));
    eventBus.on('render:histogram-enabled', (enabled) => {
      s.setHistogramEnabled?.(enabled);
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
    eventBus.on('camera:composition-guides-inverted', (inverted) => {
      s.setCompositionGuidesInverted(!!inverted);
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
    eventBus.on('render:look-filter', (presetId) => {
      s.applyLookFilter(presetId);
    });

    // Ground/Podium events
    eventBus.on('studio:ground-solid', (enabled) => s.setGroundSolid(enabled));
    eventBus.on('studio:ground-wire', (enabled) => s.setGroundWire(enabled));
    eventBus.on('studio:ground-solid-color', (color) => s.setGroundSolidColor(color));
    eventBus.on('studio:ground-wire-color', (color) => s.setGroundWireColor(color));
    eventBus.on('studio:ground-wire-opacity', (value) => s.setGroundWireOpacity(value));
    eventBus.on('studio:ground-y', (value) => s.setGroundY(value));
    eventBus.on('studio:grid-y', (value) => s.setGridY(value));
    eventBus.on('studio:base-scale', (value) => s.setBaseScale(value));
    eventBus.on('studio:base-metalness', (value) => s.setBaseMetalness(value));
    eventBus.on('studio:base-roughness', (value) => s.setBaseRoughness(value));
    eventBus.on('studio:base-reflection', (value) => s.setBaseReflection(value));
    eventBus.on('studio:base-clearcoat', (value) => s.setBaseClearcoat(value));
    eventBus.on('studio:base-surface', (payload) => s.setBaseSurface(payload ?? {}));
    eventBus.on('studio:base-glass-surface', (enabled) => s.setBaseGlassSurface(enabled));
    eventBus.on('studio:base-glass-blur', (value) => s.setBaseGlassBlur(value));
    eventBus.on('studio:base-glass-amount', (value) => s.setBaseGlassAmount(value));
    eventBus.on('studio:base-glass-brightness', (value) => s.setBaseGlassBrightness(value));
    eventBus.on('studio:backdrop-enabled', (enabled) => s.setBackdropEnabled(enabled));
    eventBus.on('studio:backdrop-scale', (value) => s.setBackdropScale(value));
    eventBus.on('studio:backdrop-width', (value) => s.setBackdropWidth(value));
    eventBus.on('studio:backdrop-color', (color) => s.setBackdropColor(color));
    eventBus.on('studio:backdrop-rotation', (value) => s.setBackdropRotation(value));
    eventBus.on('studio:backdrop-y', (value) => s.setBackdropY(value));
    eventBus.on('studio:backdrop-metalness', (value) => s.setBackdropMetalness(value));
    eventBus.on('studio:backdrop-roughness', (value) => s.setBackdropRoughness(value));
    eventBus.on('studio:backdrop-surface', (payload) => s.setBackdropSurface(payload ?? {}));
    eventBus.on('studio:backdrop-snap', () => s.snapBackdropToBottom());
    eventBus.on('studio:grid-scale', (value) => s.setGridScale(value));
    eventBus.on('studio:grid-line-width', (value) => s.setGridLineWidth(value));
    eventBus.on('studio:base-snap', () => s.snapBaseToBottom());
    eventBus.on('studio:grid-snap', () => s.snapGridToBottom());

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
    eventBus.on('lights:master', (value) => s.setLightsMaster(value));
    eventBus.on('lights:enabled', (enabled) => s.setLightsEnabled(enabled));
    eventBus.on('lights:rotate', (value) => s.setLightsRotation(value));
    eventBus.on('lights:height', (value) => s.setLightsHeight(value));
    eventBus.on('lights:auto-rotate', (enabled) => s.setLightsAutoRotate(enabled));
    eventBus.on('lights:show-indicators', (enabled) => s.setShowLightIndicators(enabled));
    eventBus.on('lights:cast-shadows', (enabled) => s.setLightsCastShadows(enabled));
    eventBus.on('lights:shadow-quality', (quality) => s.setLightsShadowQuality(quality));
    eventBus.on('lights:shadow-softness', (value) => s.setLightsShadowSoftness(value));
    eventBus.on('lights:shadow-color', (value) => s.setLightsShadowColor(value));
    eventBus.on('lights:shadow-opacity', (value) => s.setLightsShadowOpacity(value));
    eventBus.on('lights:shadow-contact-offset', (value) =>
      s.setLightsShadowContactOffset(value),
    );
    eventBus.on('lights:shadow-two-sided', (enabled) =>
      s.setLightsShadowTwoSided(enabled),
    );
    eventBus.on('lights:shadow-settings', (settings) =>
      s.setLightsShadowSettings(settings),
    );
    eventBus.on('lights:gobo-enabled', (enabled) => {
      void s.setGoboEnabled(enabled);
    });
    eventBus.on('lights:gobo-texture', (textureId) => {
      void s.setGoboTexture(textureId);
    });
    eventBus.on('lights:gobo-softness', (value) => {
      s.setGoboSoftness(value);
    });
    eventBus.on('lights:gobo-scale', (value) => {
      s.setGoboScale(value);
    });
    eventBus.on('lights:gobo-rotation', (value) => {
      s.setGoboRotation(value);
    });

    // Scene/Background events
    eventBus.on('scene:background', (color) => s.backgroundController?.setColor(color));
    eventBus.on('scene:background-gradient', (config) => {
      s.backgroundGradientController?.setConfig(config);
    });
    eventBus.on('scene:exposure', (value) => {
      s.autoExposureController?.setManualExposure(value);
      // Update UI display
      s.ui?.updateExposureDisplay?.(value);
      // Update lens dirt exposure factor
      s.lensDirtController?.updateExposureFactor();
    });
    eventBus.on('camera:auto-exposure', (enabled) => s.autoExposureController?.setEnabled(enabled));
    eventBus.on('camera:clip-planes', (options) => s.syncCameraClipPlanes(options ?? {}));

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
    eventBus.on('animation:scrub', (value) => s.animationController.scrub(value));
    eventBus.on('animation:select', (index) => s.animationController.selectAnimation(index));
    eventBus.on('animation:speed', (speed) =>
      s.animationController.setPlaybackSpeed(speed),
    );
    eventBus.on('animation:reverse', (enabled) =>
      s.animationController.setPlaybackReverse(enabled),
    );
    eventBus.on('animation:clip-mode', (mode) => {
      s.animationController.setClipPlaybackMode(mode);
      s.stateStore.set('animation.clipPlaybackMode', mode === 'cycle' ? 'cycle' : 'loop');
    });
    eventBus.on('animation:show-bones', (enabled) =>
      s.setAnimationShowBones(enabled),
    );
    eventBus.on('animation:show-joint-names', (enabled) =>
      s.setAnimationShowJointNames(enabled),
    );
    eventBus.on('animation:joint-scale', (scale) =>
      s.setAnimationJointScale(scale),
    );
    eventBus.on('animation:bone-stroke-width', (width) =>
      s.setAnimationBoneStrokeWidth(width),
    );
    eventBus.on('animation:hide-mesh', (enabled) =>
      s.setAnimationHideMesh(enabled),
    );
    eventBus.on('animation:display-fps', (fps) => {
      const next = s.ui.syncAnimationDisplayFps(fps);
      s.stateStore.set('animation.displayFps', next);
    });
    eventBus.on('animation:time-reference', (enabled) => {
      s.ui.syncAnimationTimeReference(!!enabled);
      s.stateStore.set('animation.timeReferenceEnabled', !!enabled);
    });

    // Export events
    eventBus.on('export:image', (settings) => s.exportImage(settings));
    eventBus.on('export:png', (settings) => s.exportPng(settings));
    eventBus.on('export:svg', () => s.exportSvgSilhouette());
    eventBus.on('export:svg-color', (payload) =>
      s.exportSvgColor(payload && typeof payload === 'object' ? payload : {}),
    );
    eventBus.on('export:svg-glb', () => s.exportSvgGlb());
    eventBus.on('scene:batch-apply-start', () => {
      s._suppressModeChangeToasts += 1;
    });
    eventBus.on('scene:batch-apply-end', () => {
      s._suppressModeChangeToasts = Math.max(0, s._suppressModeChangeToasts - 1);
    });

    eventBus.on('export:video', (payload) => s.exportVideo(payload));
    eventBus.on('export:video-preview-toggle', (payload) =>
      s.toggleExportVideoPreview(payload),
    );
    eventBus.on('export:movement-preview-stop', () => {
      if (s.exportMovementPreview?.isActive?.()) {
        s.exportMovementPreview.stop({ silent: true });
      }
    });
    eventBus.on('export:video-camera-bookmark-save', () =>
      s.saveExportVideoCameraBookmark(),
    );
    eventBus.on('export:video-camera-bookmark-restore', () =>
      s.restoreExportVideoCameraBookmark(),
    );
    
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

