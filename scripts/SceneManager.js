import * as THREE from 'three';
import { TransformControls } from './vendor/TransformControls.js';
import {
  HDRI_PRESETS,
  HDRI_STRENGTH_UNIT,
  HDRI_MOODS,
  HDRI_CUSTOM_ID,
  getCustomHdriUploadType,
} from './config/hdri.js';
import { blockTabletStudioAccess } from './orbyTabletGate.js';
import { withViewportLoadSpinner } from './utils/viewportLoadSpinner.js';
import {
  WIREFRAME_OFFSET,
  WIREFRAME_POLYGON_OFFSET_FACTOR,
  WIREFRAME_POLYGON_OFFSET_UNITS,
  WIREFRAME_OPACITY_VISIBLE,
  WIREFRAME_OPACITY_OVERLAY,
  resolveBloomQualityTier,
  isAnamorphicBloomPipelineActive,
  resolveRenderQualityTier,
  castShadowLightIdsForGlobalToggle,
  DEFAULT_MATERIAL_BRIGHTNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_MATERIAL_METALNESS,
  DEFAULT_BACKDROP_METALNESS,
  DEFAULT_BACKDROP_ROUGHNESS,
  DEFAULT_BASE_GLASS_BLUR,
  DEFAULT_BASE_GLASS_AMOUNT,
  DEFAULT_BASE_GLASS_BRIGHTNESS,
  sanitizeAmbientOcclusion,
  APP_BACKGROUND,
} from './constants.js';
import {
  isStudioBackdropTransitionLocked,
  TRANSITION_BACKDROP,
} from './ui/orbyPageTransition.js';
import { PostProcessingPipeline } from './render/PostProcessingPipeline.js';
import { LightsController } from './render/LightsController.js';
import { GroundController } from './render/GroundController.js';
import { EnvironmentController } from './render/EnvironmentController.js';
import { HdriMoodController } from './render/HdriMoodController.js';
import { CameraController } from './render/CameraController.js';
import { ModelLoader } from './render/ModelLoader.js';
import { analyzeFbxMaterials } from './import/fbxMaterialReport.js';
import { buildFbxAutoAssignPlan } from './import/fbxAutoAssignTextures.js';
import {
  applyFbxTuningToAllMaterials,
  normalizeFbxMapSlotsState,
  setFbxMaterialTuning,
} from './import/fbxMapSlotsSettings.js';
import { AnimationController } from './render/AnimationController.js';
import { MeshDiagnosticsController } from './render/MeshDiagnosticsController.js';
import { TopologyWarningsOverlay } from './render/TopologyWarningsOverlay.js';
import { JointNameLabelsController } from './render/JointNameLabelsController.js';
import { MaterialController } from './render/MaterialController.js';
import { isMaterialObjectSurfaceEnabled } from './render/SvgExtrudeSurfaceShader.js';
import { effectiveRoughnessWithHdriBlur } from './render/hdriBlur.js';
import {
  computeCreativeLookToonLightScalars,
  isScreenPixelCreativeLookPreset,
  normalizeCreativeLookPreset,
} from './render/CreativeLookMaterials.js';
import { LensFlareController } from './render/LensFlareController.js';
import { keyLightParamsFromLensFlare } from './render/lensFlareKeyLightSync.js';
import { GodRaysController } from './render/GodRaysController.js';
import { AutoExposureController } from './render/AutoExposureController.js';
import { TransformController } from './render/TransformController.js';
import { MeshModifierController } from './render/MeshModifierController.js';
import { isShapeLibraryModel } from './shapeLibrary/shapeLibraryCatalog.js';
import { normalizeModifiersState, modifierActiveFromAmount } from './state/defaults/modifierDefaults.js';
import { LensDirtController } from './render/LensDirtController.js';
import { BackgroundController } from './render/BackgroundController.js';
import { BackgroundGradientController } from './render/backgroundGradient/BackgroundGradientController.js';
import { getViewportBackingStorePixels, coerceRendererLogicalSize } from './render/drawingBufferSize.js';
import { repairInteractiveViewportAfterCapture } from './render/capture/repairInteractiveViewportAfterCapture.js';
import { BackgroundImageController } from './render/backgroundImage/BackgroundImageController.js';
import { loadBackgroundImageElement } from './render/backgroundImage/backgroundImageCanvas.js';
import { normalizeBackgroundImage } from './render/backgroundImage/backgroundImageDefaults.js';
import { applyBackgroundMode, getBackgroundMode } from './render/backgroundMode.js';
import { encodeBackgroundImageAsset } from './render/backgroundImage/backgroundImageAsset.js';
import {
  GoboProjectionController,
  GOBO_UI_DEFAULT,
  clampGoboUiScale,
  normalizeStoredGoboScale,
} from './render/GoboProjection.js';
import { DEFAULT_GOBO_TEXTURE_ID, DEFAULT_GOBO_SOFTNESS } from './config/gobos.js';
import { DEFAULT_LIGHTS_SHADOW_SOFTNESS } from './config/shadowQuality.js';
import { lightsAutoRotateDegreesPerSecond } from './config/lightsAutoRotate.js';
import { ImageExporter } from './render/ImageExporter.js';
import { CaptureSizeMismatchError } from './render/capture/captureReadback.js';
import { normalizeGlyphFillHex } from './import/FontExtrudeImporter.js';
import { fontExtrudeTwoToneActive } from './import/fontExtrudeTwoTone.js';
import { VideoExporter } from './render/VideoExporter.js';
import { ExportMovementPreview } from './render/ExportMovementPreview.js';
import { resolveExportMeshAnimationTiming } from './render/exportVideoMovements.js';
import { FontTextRevealController, isFontExtrudeRevealModel } from './scene/FontTextRevealController.js';
import { FontTextConstantController } from './scene/FontTextConstantController.js';
import { HistogramController } from './render/HistogramController.js';
import { ModelGlbExporter } from './export/ModelGlbExporter.js';
import {
  GLB_EXPORT_UNAVAILABLE_HINT,
  GLB_SHAPE_LIBRARY_EXPORT_UNAVAILABLE_HINT,
  resolveGlbExportKind,
} from './export/resolveGlbExportKind.js';
import { EventManager } from './scene/EventManager.js';
import { RenderLoopController } from './scene/RenderLoopController.js';
import { ComposerLifecycle } from './scene/ComposerLifecycle.js';
import { SceneStateApplier } from './scene/SceneStateApplier.js';
import { ModelLifecycleManager } from './scene/ModelLifecycleManager.js';
import {
  resolveLightCastShadowIntent,
  syncEffectiveCastShadowsFromState,
} from './lights/lightCastShadowEffective.js';
import { createBlankCanvasPreset } from './state/blankCanvasPreset.js';
import {
  shouldBlockFisheyePngExport,
  showFisheyeTransparentPngExportBlockedAlert,
} from './export/fisheyeExportAlert.js';
import {
  getImageExportFormat,
  normalizeImageExportFormat,
} from './render/imageExportFormats.js';
import { normalizeTransparentFraming } from './render/imageExportFraming.js';
import { resolvePngExportCaptureSize } from './render/capture/CaptureSizePolicy.js';
import { fullViewportLogicalSize } from './render/fullViewportLogicalSize.js';
import { deferSpinnerPaint } from './utils/viewportLoadSpinner.js';
import {
  supportsExtrudeBevel,
  runSvgExtrudeImporterMutation,
  sanitizeSvgExtrudeColorDepths,
  sanitizeSvgExtrudeColorOffsets,
  sanitizeSvgExtrudeColorReplacements,
  normalizeSvgExtrudeHexColor,
} from './scene/SvgExtrudeSceneOps.js';
import {
  clampExtrudeBevelAmount,
  normalizeFontBevelType,
} from './import/extrudeBevel.js';
import {
  DEFAULT_EXTRUDE_BEVEL_AMOUNT,
  DEFAULT_EXTRUDE_DEPTH,
  DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG,
  DEFAULT_SVG_EXTRUDE_OVERRIDE_COLOR,
  MAX_EXTRUDE_DEPTH,
  MIN_EXTRUDE_DEPTH,
  normalizeSvgOverrideHex,
} from './import/extrudeDefaults.js';
import { SceneMeshClickHandler } from './scene/SceneMeshClickHandler.js';
import { SceneBoneHoverHandler } from './scene/SceneBoneHoverHandler.js';
import { DofAutofocusController } from './render/DofAutofocusController.js';
import { computeModelViewDepthSpan } from './render/dofFocalDepth.js';
import { DofFocusPlaneHelper } from './render/DofFocusPlaneHelper.js';
import { ViewportFramingOverlays } from './scene/ViewportFramingOverlays.js';
import { normalizeIsometricState } from './camera/isometricPresets.js';
import { sanitizeClipPlanes } from './camera/clipPlanes.js';
import { DEFAULT_CAMERA_FAR, DEFAULT_CAMERA_NEAR } from './constants.js';
import {
  ensureStudioActive,
  shutdownStudio as shutdownStudioLifecycle,
} from './scene/StudioLifecycle.js';
import {
  initStudioShell,
} from './scene/StudioBootstrap.js';
import { setupStudioComposer } from './scene/StudioComposerSetup.js';
import {
  COLOR_CHECKER_GROUP_HALF_HEIGHT_AT_UNIT_SCALE,
  createColorCheckerMeshGroup,
} from './scene/ColorCheckerMesh.js';
import {
  createToggleScaleContext,
  easeOutExpo,
  SCALE_TOGGLE_IN_MS,
  stepToggleScaleAnimation,
} from './scene/toggleScaleAnimation.js';
import { applyLookFilterPreset } from './ui/lookFilterApply.js';
import {
  applyStlNormalSmoothing,
  IMPORT_MESH_SMOOTHING_ENABLED,
  modelHasStlImport,
  populateImportRawCache,
} from './import/stlNormalSmoothing.js';
import {
  captureAndApplyCenterPivot,
  centerModelGeometryOnRoot,
  centerFontModelGeometryOnRoot,
  undoCenterPivot,
} from './scene/centerModelPivot.js';

import {
  shadowMapSizeForQuality,
  normalizeShadowQuality,
  shadowCameraOrthoPaddingForQuality,
} from './config/shadowQuality.js';

export class SceneManager {
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    if (uiManager) uiManager.scene = this;
    /** True while the settings shelf `.panels` is being scrolled (drives light FX throttling). */
    this.panelsShelfScrolling = false;
    /** Skip rAF resize while PNG/export pipeline mutates renderer size (avoids composer/canvas mismatch). */
    this._suppressResizeForExport = false;
    /** Guard overlapping offline capture preview requests (scrub debounce + button). */
    this._capturePreviewInFlight = false;
    /** Keep rAF alive briefly after shader/material swaps (surface, overlays) while idle. */
    this._viewportPresentationFrames = 0;
    this.eventBus.on('ui:panels-scrolling', (payload) => {
      this.setPanelsShelfScrolling(!!payload?.active);
    });

    this.canvas = document.querySelector('#webgl');
    this.viewport = document.querySelector('.viewport');
    this._studioReady = false;
    this._studioBootPromise = null;
    this._studioResizeTeardown = null;

    const initialState = this.stateStore.getState();
    initStudioShell(this, initialState);

    this.renderLoop = new RenderLoopController(this);
    this.eventManager = new EventManager(this);
    this.eventManager.register();
  }

  get isStudioReady() {
    return !!this._studioReady;
  }

  async ensureStudioReady() {
    if (blockTabletStudioAccess()) {
      throw new Error('Orby studio is not available on tablets — please use a desktop computer.');
    }
    return ensureStudioActive(this);
  }

  /**
   * Clear the workspace and restore the blank-canvas preset (same as the homepage link).
   * @param {{ skipSound?: boolean }} [options]
   */
  async resetScene(options = {}) {
    this.clearModel();
    this.currentFile = null;
    await this.enterBlankStudio(options);
  }

  /**
   * Enter the studio with no model (HDRI + controls only) — for text tools / debugging.
   * @param {{ skipSound?: boolean }} [options]
   */
  async enterBlankStudio(options = {}) {
    // Lock backdrop to Orby black before dropzone hide / WebGL boot (no gray flash).
    this.ui.setLoadSpinnerStatusPrefix?.('Loading');
    this.ui.beginLoadSpinner();
    this.ui.beginLoadSpinnerElapsed?.();
    this.ui.setDropzoneVisible(false);
    await deferSpinnerPaint();

    try {
      await this.ui.ensureStudioUiReady();
      await this.ensureStudioReady();
      // Apply the minimal "blank canvas" snapshot (HDRI panorama hidden → solid
      // black void, lights off, ground wireframe on) before the viewport is shown.
      // Bootstrap uses default hdriBackground:true; revealing WebGL first would flash
      // the beach HDRI for a frame before this preset lands.
      try {
        await this.ui.sceneSettingsManager?.loadFromText(
          JSON.stringify(createBlankCanvasPreset()),
        );
      } catch (error) {
        console.error('Failed to apply blank canvas preset', error);
      }
      await this.syncViewportSize();
      this.startRenderLoop();
      this.ui.endLoadSpinner();
      this.ui.updateTitle('Blank canvas');
      this.ui.updateTopBarDetail('No model — generate text or import a file');
      this.ui.revealShelf({ skipSound: options.skipSound !== false });
      this.ui.syncControls(this.stateStore.getState());
      this.ui.showToast('Blank canvas — generate text or import a file', 3200, {
        notification: false,
      });
    } finally {
      this.ui.endLoadSpinner();
    }
  }

  async shutdownStudio() {
    return shutdownStudioLifecycle(this);
  }

  startRenderLoop() {
    if (!this._studioReady || !this.renderer) return;
    this.renderLoop.start();
  }

  /**
   * After shelf / dropzone layout changes (no window `resize` event).
   * @returns {Promise<void>}
   */
  syncViewportSize() {
    if (!this.isStudioReady || !this.renderer) return Promise.resolve();
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this._applyViewportSizeFromLayout();
          resolve();
        });
      });
    });
  }

  /** @see ViewportFramingOverlays#setCompositionGridOverlayVisible */
  setCompositionGridOverlayVisible(enabled, options) {
    this.viewportFramingOverlays.setCompositionGridOverlayVisible(enabled, options);
  }

  /** @see ViewportFramingOverlays#setCompositionPortraitCropGuideVisible */
  setCompositionPortraitCropGuideVisible(enabled) {
    this.viewportFramingOverlays.setCompositionPortraitCropGuideVisible(enabled);
  }

  /** @see ViewportFramingOverlays#setCinematicLetterbox219Visible */
  setCinematicLetterbox219Visible(enabled, options) {
    this.viewportFramingOverlays.setCinematicLetterbox219Visible(enabled, options);
  }

  focusCameraOnCurrentModel() {
    if (this.currentModel) {
      this.cameraController?.focusOnObjectAnimated(this.currentModel, 1.0);
    }
  }

  setAntiAliasing(value) {
    if (!this.fxaaPass) return;
    const tier = resolveRenderQualityTier(this.stateStore.getState().renderQuality);
    this.fxaaPass.enabled = !tier.forceFxaaOff && value === 'fxaa';
  }

  applyAnimationDisplayFps(fps) {
    const next = this.ui.syncAnimationDisplayFps(fps);
    this.stateStore.set('animation.displayFps', next);
  }

  applyAnimationTimeReference(enabled) {
    this.ui.syncAnimationTimeReference(!!enabled);
    this.stateStore.set('animation.timeReferenceEnabled', !!enabled);
  }

  _setTransformWidgetEnabled(control, enabled) {
    if (!control) return;
    const objectHidden = !!this.stateStore?.getState()?.objectHidden;
    const show = enabled && !objectHidden;
    control.visible = show;
    if (show && this.currentModel && this.modelRoot) {
      control.attach(this.modelRoot);
    } else if (!enabled) {
      control.detach();
    }
  }

  setMoveWidgetEnabled(enabled) {
    this._setTransformWidgetEnabled(this.transformControlsTranslate, enabled);
  }

  setRotateWidgetEnabled(enabled) {
    this._setTransformWidgetEnabled(this.transformControlsRotate, enabled);
  }

  setScaleWidgetEnabled(enabled) {
    this._setTransformWidgetEnabled(this.transformControlsScale, enabled);
  }

  setTooltipController(tooltips) {
    this.tooltips = tooltips;
    if (this._studioReady) {
      this.setupBoneHoverHandler();
    }
  }

  setupMeshClickDetection() {
    this.meshClickHandler = new SceneMeshClickHandler({
      canvas: this.canvas,
      camera: this.camera,
      getCurrentModel: () => this.currentModel,
      stateStore: this.stateStore,
      eventBus: this.eventBus,
      hitsLightConeAt: (clientX, clientY) =>
        this.lightViewportSelection?.hitsLightConeAt?.(clientX, clientY) ?? false,
      onDeselectLight: () => this.lightViewportSelection?.deselect?.(),
    });
    this.meshClickHandler.attach();
  }

  setupBoneHoverHandler() {
    this.boneHoverHandler?.detach?.();
    if (!this.tooltips) return;

    this.boneHoverHandler = new SceneBoneHoverHandler({
      canvas: this.canvas,
      camera: this.camera,
      getDiagnostics: () => this.diagnosticsController,
      getControls: () => this.cameraController?.controls,
      getIsGizmoDragging: () => this._gizmoDragActive,
      getShowJointNames: () => !!this.stateStore.getState().animation?.showJointNames,
      tooltips: this.tooltips,
    });
    this.boneHoverHandler.attach();
  }

  /** @deprecated Studio boots on first model load; kept for callers that await scene.init(). */
  async init() {
    /* no-op — WebGL starts in ensureStudioReady() */
  }

  setupLights() {
    this.lightsController = new LightsController(this.scene, {
      enabled: this.lightsEnabled,
      master: this.lightsMaster,
      rotation: this.lightsRotation,
      autoRotateSpeed: this.lightsAutoRotateSpeed,
      shadowQuality: this.lightsShadowQuality,
      shadowSoftness: this.lightsShadowSoftness,
      shadowContactOffset: this.lightsShadowContactOffset,
      shadowNormalBias: this.lightsShadowNormalBias,
    });
    this.lights = this.lightsController.getLights();
  }

  setupGround() {
    const state = this.stateStore.getState();
    this.groundController = new GroundController(this.scene, {
      solidEnabled: state.groundSolid,
      wireEnabled: state.groundWire,
      solidColor: state.groundSolidColor,
      wireColor: state.groundWireColor,
      wireOpacity: state.groundWireOpacity,
      groundY: state.groundY,
      gridY: state.gridY,
      baseScale: state.baseScale,
      gridScale: state.gridScale,
      gridLineWidth: state.gridLineWidth ?? 1,
      baseMetalness: state.baseMetalness,
      baseRoughness: state.baseRoughness,
      baseReflection: state.baseReflection,
      baseClearcoat: state.baseClearcoat,
      baseSurfacePreset: state.baseSurfacePreset,
      baseSurfaceScale: state.baseSurfaceScale,
      baseSurfaceStrength: state.baseSurfaceStrength,
      renderer: this.renderer,
      getStudioPixelRatio: () =>
        resolveRenderQualityTier(this.stateStore.getState().renderQuality).maxPixelRatio,
      baseGlassSurface: !!(state.baseGlassSurface ?? state.podiumReflectMesh ?? false),
      baseGlassBlur: state.baseGlassBlur ?? DEFAULT_BASE_GLASS_BLUR,
      baseGlassAmount: state.baseGlassAmount ?? DEFAULT_BASE_GLASS_AMOUNT,
      baseGlassBrightness: state.baseGlassBrightness ?? DEFAULT_BASE_GLASS_BRIGHTNESS,
      backdropEnabled: !!state.backdropEnabled,
      backdropScale: state.backdropScale ?? 1,
      backdropWidth: state.backdropWidth ?? 2,
      backdropColor: state.backdropColor ?? '#808080',
      backdropRotation: state.backdropRotation ?? 0,
      backdropY: state.backdropY ?? 0,
      backdropMetalness: state.backdropMetalness ?? DEFAULT_BACKDROP_METALNESS,
      backdropRoughness: state.backdropRoughness ?? DEFAULT_BACKDROP_ROUGHNESS,
      backdropSurfacePreset: state.backdropSurfacePreset,
      backdropSurfaceScale: state.backdropSurfaceScale,
      backdropSurfaceStrength: state.backdropSurfaceStrength,
      infinityCoveEnabled: !!state.infinityCoveEnabled,
      infinityCoveScale: state.infinityCoveScale ?? 2,
      infinityCoveWidth: state.infinityCoveWidth ?? 2,
      infinityCoveColor: state.infinityCoveColor ?? '#808080',
      infinityCoveRotation: state.infinityCoveRotation ?? 0,
      infinityCoveY: state.infinityCoveY ?? 0,
      infinityCoveMetalness: state.infinityCoveMetalness ?? DEFAULT_BACKDROP_METALNESS,
      infinityCoveRoughness: state.infinityCoveRoughness ?? DEFAULT_BACKDROP_ROUGHNESS,
      infinityCoveSurfacePreset: state.infinityCoveSurfacePreset,
      infinityCoveSurfaceScale: state.infinityCoveSurfaceScale,
      infinityCoveSurfaceStrength: state.infinityCoveSurfaceStrength,
      debugWireframeEnabled: false,
    });
    this.groundController.onSurfacePresentationSync = () => this._syncStudioGroundSurfaces();
  }

  setupMoodController() {
    this.hdriMood = new HdriMoodController({
      renderer: this.renderer,
      groundController: this.groundController,
      getState: () => this.stateStore.getState(),
      updateBloom: (settings) => this.updateBloom(settings),
      updateGrain: (settings) => this.postPipeline?.updateGrain(settings),
      setBloomState: (value) => this.stateStore.set('bloom', value),
      fallbackBackgroundColor: this.backgroundController?.getColor() ?? APP_BACKGROUND,
    });
  }

  setupEnvironment(initialState) {
    this.environmentController = new EnvironmentController(this.scene, this.renderer, {
      presets: HDRI_PRESETS,
      moods: HDRI_MOODS,
      initialPreset: initialState.hdri ?? 'beach',
      enabled: this.hdriEnabled,
      backgroundEnabled: this.hdriBackgroundEnabled,
      strength: this.hdriStrength,
      blurriness: this.hdriBlurriness,
      rotation: this.hdriRotation,
      fallbackColor: this.backgroundController?.getColor() ?? APP_BACKGROUND,
      onReleaseSceneBackground: () => {
        if (this.backgroundController?.usesFallbackBackdrop?.()) {
          this.backgroundController?.refreshAppearance?.();
        }
      },
      shouldDrawHdriBackdrop: () => this.hdriBackgroundEnabled,
      onEnvironmentMapUpdated: (texture, intensity) => {
        this.updateMaterialsEnvironment(texture, intensity);
      },
    });
  }

  setupComposer() {
    setupStudioComposer(this);
  }

  _exportPreviewDurationSec() {
    const video = this._videoExportSettingsFromUi();
    const clipCount = this.animationController?.animations?.length ?? 0;
    const mesh = resolveExportMeshAnimationTiming(
      video,
      clipCount,
      this.animationController?.animations?.[video.meshAnimationClipIndex ?? 0]
        ?.duration ?? 0,
    );
    return mesh.exportDurationSec;
  }

  /**
   * Scrub progress for capture preview — timeline slider is source of truth when set.
   * @param {{ previewT?: number }} [options]
   * @returns {number} normalized 0…1
   */
  _resolveExportPreviewScrubT(options = {}) {
    if (Number.isFinite(options.previewT)) {
      return Math.max(0, Math.min(1, options.previewT));
    }
    const scrubEl = this.ui?.dom?.exportPreviewScrub;
    if (scrubEl && !scrubEl.disabled) {
      const fromSlider = parseFloat(scrubEl.value);
      if (Number.isFinite(fromSlider)) {
        return Math.max(0, Math.min(1, fromSlider));
      }
    }
    const preview = this.exportMovementPreview;
    if (preview?.isActive?.()) {
      return preview.getProgress();
    }
    return 0;
  }

  /**
   * Keeps EffectComposer pixel ratio and pass resolutions aligned with the renderer.
   * EffectComposer caches its own pixel ratio — changing only renderer.setPixelRatio breaks exports.
   */
  syncPostProcessingForLogicalSize(width, height) {
    if (!this.composer || width <= 0 || height <= 0) return;
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(width, height);

    const state = this.stateStore.getState();
    const tier = resolveRenderQualityTier(state.renderQuality);
    const bloomQuality = resolveBloomQualityTier(state.bloom?.quality);
    const bloomScale = tier.bloomResolutionScale * bloomQuality.resolutionScale;
    const bloomW = Math.max(1, Math.floor(width * bloomScale));
    const bloomH = Math.max(1, Math.floor(height * bloomScale));
    if (this.postPipeline?.bloomPass) {
      if (this.postPipeline.bloomPass.resolution) {
        this.postPipeline.bloomPass.resolution.set(bloomW, bloomH);
      }
      if (typeof this.postPipeline.bloomPass.setSize === 'function') {
        this.postPipeline.bloomPass.setSize(bloomW, bloomH);
      }
    }
    if (this.postPipeline?.colorAdjust) {
      this.postPipeline.colorAdjust.setResolution(width, height);
    }
    if (this.fxaaPass) {
      this.fxaaPass.material.uniforms.resolution.value.x = 1 / (width * pr);
      this.fxaaPass.material.uniforms.resolution.value.y = 1 / (height * pr);
    }
    if (this.postPipeline?.aberrationPass?.uniforms?.aspectRatio) {
      this.postPipeline.aberrationPass.uniforms.aspectRatio.value =
        height > 0 ? width / height : 1;
    }
    if (this.postPipeline?.bloomCompositeController) {
      this.postPipeline.bloomCompositeController.setResolution(width, height);
    } else if (this.postPipeline?.anamorphicBloomPass?.uniforms?.resolution?.value) {
      this.postPipeline.anamorphicBloomPass.uniforms.resolution.value.set(width, height);
    }
    this.postPipeline?.creativeLookViewportBloom?.setSize(width, height, bloomScale);
    this.postPipeline?.creativeLookAscii?.setSize(width, height);
    this.postPipeline?.creativeLookEga?.setSize(width, height);
    this.postPipeline?.creativeLookC64?.setSize(width, height);
    this.postPipeline?.creativeLookGameBoy?.setSize(width, height);
    this.postPipeline?.creativeLookNes?.setSize(width, height);
    this.postPipeline?.creativeLookMegaDrive?.setSize(width, height);
    this.postPipeline?.creativeLookIntellivision?.setSize(width, height);
    this.postPipeline?.creativeLookGba?.setSize(width, height);
    this.postPipeline?.creativeLookApple2?.setSize(width, height);
    this.postPipeline?.creativeLookDither?.setSize(width, height);
    this.postPipeline?.creativeLookWatercolour?.setSize(width, height);
    this.postPipeline?.creativeLookGouache?.setSize(width, height);
    this.postPipeline?.creativeLookOptics?.setSize(width, height);
    this.postPipeline?.creativeLookSketch?.setSize(width, height);
    this.postPipeline?.creativeLookSketchColour?.setSize(width, height);
    this.postPipeline?.creativeLookVectrex?.setSize(width, height);
    this.groundController?.resizeBaseReflector?.(width, height);
    this.groundController?.resizeGridLines?.(width, height);
    this.materialController?.syncWireframeLineResolution?.(
      width,
      height,
      this.renderer?.getPixelRatio?.() ?? 1,
    );
    this.diagnosticsController?.syncBoneLineResolution?.(width, height);
    if (this.postPipeline?.bokehPass?.setSize) {
      this.postPipeline.bokehPass.setSize(width, height);
    }
    // N8AO sizing is handled by composer.setSize above (logical × pixelRatio). A second
    // setSize here at logical dimensions would halve the beauty buffer at Ultra DPR.
    this.syncPerspectiveCameraFovAndLens();
  }

  /**
   * Keeps Three.js vertical FOV and the lens-distortion pass in lockstep (same as the
   * de Carpentier WebGL sample) so the warped sample stays inside the render and avoids
   * black edges. When fisheye is off, uses `camera.fov` from state.
   *
   * Skips overwriting `camera.fov` while export preview / encode FOV drive is active —
   * otherwise capture buffer sync resets the animated FOV back to the studio slider value.
   */
  syncPerspectiveCameraFovAndLens(options = {}) {
    if (!this.camera?.isPerspectiveCamera) return;
    if (this.cameraController?.isExportFovDriving?.()) {
      this.camera.updateProjectionMatrix();
      return;
    }
    const state = this.stateStore.getState();
    if (state.camera?.isometric?.enabled) {
      const pass = this.postPipeline?.lensDistortionPass;
      if (pass) pass.enabled = false;
      this.camera.fov = state.camera?.fov ?? 45;
      this.camera.updateProjectionMatrix();
      return;
    }
    const fe = state.fisheye;
    const pass = this.postPipeline?.lensDistortionPass;
    const fovScale = THREE.MathUtils.clamp(Number(options.fovScale) || 1, 1, 1.12);
    if (!pass) {
      this.camera.fov = (state.camera?.fov ?? 45) * fovScale;
      this.camera.updateProjectionMatrix();
      return;
    }
    if (!fe?.enabled) {
      pass.enabled = false;
      this.camera.fov = (state.camera?.fov ?? 45) * fovScale;
      this.camera.updateProjectionMatrix();
      return;
    }
    const hFovDeg = THREE.MathUtils.clamp(
      fe.horizontalFOVDeg ?? 131,
      5,
      160,
    );
    const strength = THREE.MathUtils.clamp(fe.strength ?? 0, 0, 1);
    const cylindricalRatio = THREE.MathUtils.clamp(
      fe.cylindricalRatio ?? 1,
      0.25,
      4,
    );
    const aspect = Math.max(0.01, this.camera.aspect);
    const heightUniform =
      Math.tan(THREE.MathUtils.degToRad(hFovDeg) / 2) / aspect;
    const verticalFovDeg = THREE.MathUtils.radToDeg(
      Math.atan(heightUniform) * 2,
    );

    this.camera.fov = verticalFovDeg * fovScale;
    this.camera.updateProjectionMatrix();

    pass.enabled = true;
    pass.uniforms.strength.value = strength;
    pass.uniforms.height.value = heightUniform;
    pass.uniforms.aspectRatio.value = aspect;
    pass.uniforms.cylindricalRatio.value = cylindricalRatio;
  }

  /**
   * Manual Render Distance only — does not auto-fit on mesh load or orbit.
   * When off, camera keeps DEFAULT_CAMERA_NEAR / DEFAULT_CAMERA_FAR unless restoring defaults.
   */
  syncCameraClipPlanes(options = {}) {
    const cc = this.cameraController;
    if (!cc || !this.camera?.isPerspectiveCamera) return null;

    const defaults = this.stateStore.getDefaults().camera?.clipPlanes ?? {};
    const clip = sanitizeClipPlanes(
      this.stateStore.getState().camera?.clipPlanes,
      defaults,
    );

    let near;
    let far;
    if (clip.manual) {
      near = clip.near;
      far = clip.far;
    } else if (options.restoreDefaults) {
      near = DEFAULT_CAMERA_NEAR;
      far = DEFAULT_CAMERA_FAR;
    } else {
      return null;
    }

    const applied = cc.applyClipPlanes(near, far);
    if (!options.skipUiUpdate) {
      const last = this._clipPlaneUiCache ?? {};
      if (
        Math.abs((last.near ?? 0) - applied.near) > 0.005
        || Math.abs((last.far ?? 0) - applied.far) > 0.05
        || last.manual !== clip.manual
      ) {
        this._clipPlaneUiCache = {
          near: applied.near,
          far: applied.far,
          manual: clip.manual,
        };
        this.ui?.updateClipPlaneDisplay?.(applied.near, applied.far, clip.manual);
      }
    }
    return applied;
  }



  // registerEvents() - Moved to EventManager.js

  async applyStateSnapshot(state) {
    this._suppressModeChangeToasts += 1;
    try {
      await this.stateApplier.apply(state);
      this._syncShadowAndGobo();
    } finally {
      this._suppressModeChangeToasts = Math.max(0, this._suppressModeChangeToasts - 1);
    }
  }

  /**
   * Sync visibility / scale animation and probes from settings.
   */
  applyColorCheckerFromState(state) {
    const cc = state?.colorChecker ?? this.stateStore.getDefaults().colorChecker;
    if (this.colorCheckerRoot) {
      this._updateColorCheckerPose();
    }
    if (this.colorCheckerRoot && cc?.enabled) {
      this._syncColorCheckerReferenceProbes(
        this.scene.environment,
        this.hdriStrength,
        this.hdriBlurriness,
      );
    }
  }

  _updateColorCheckerPose() {
    const ccRaw = this.stateStore.getState().colorChecker;
    const defaults = this.stateStore.getDefaults().colorChecker;
    const cc = { ...defaults, ...(ccRaw && typeof ccRaw === 'object' ? ccRaw : {}) };
    if (cc.rotation != null && cc.rotate === undefined) {
      cc.rotate = cc.rotation;
    }

    if (!this.colorCheckerRoot) return;

    const r = stepToggleScaleAnimation(
      this._ccToggleCtx,
      performance.now(),
      !!cc.enabled,
    );
    this.colorCheckerRoot.visible = r.visible;
    if (r.skipRest) return;

    const animMul = r.animMul;

    const anchor = this.controls.target;
    const camPos = this.camera.position;

    // Orbit yaw from ColorChecker → Rotate only — not studio lights / HDRI global rotation,
    // so lighting tweaks don’t swing the chart around the target.
    let horiz = this._colorCheckerHorizRef.set(camPos.x - anchor.x, 0, camPos.z - anchor.z);
    if (horiz.lengthSq() < 1e-10) {
      horiz.set(0, 0, 1);
    } else {
      horiz.normalize();
    }

    const yRad = THREE.MathUtils.degToRad(cc.rotate ?? 0);
    const cos = Math.cos(yRad);
    const sin = Math.sin(yRad);
    const rx = horiz.x * cos + horiz.z * sin;
    const rz = -horiz.x * sin + horiz.z * cos;
    const orbitDir = new THREE.Vector3(rx, 0, rz).normalize();

    const d = Math.max(0.05, cc.distance ?? defaults.distance);
    const h = cc.height ?? defaults.height;
    const sc = Math.max(0.01, Math.min(20, cc.scale ?? defaults.scale));

    const st = this.stateStore.getState();
    const floorY =
      this.groundController?.getGroundY?.() ??
      (Number.isFinite(st.groundY) ? st.groundY : 0);
    const halfH = COLOR_CHECKER_GROUP_HALF_HEIGHT_AT_UNIT_SCALE * sc * animMul;

    this.colorCheckerRoot.position.set(
      anchor.x + orbitDir.x * d,
      floorY + halfH + h,
      anchor.z + orbitDir.z * d,
    );

    // Upright “billboard”: only yaw toward the camera in XZ — no pitch tilt from mouse up/down, so it doesn’t appear to jump vertically.
    const flat = this._colorCheckerTowardCam.subVectors(camPos, this.colorCheckerRoot.position);
    flat.y = 0;
    if (flat.lengthSq() < 1e-10) {
      flat.set(0, 0, 1);
    } else {
      flat.normalize();
    }
    this.colorCheckerRoot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), flat);

    this.colorCheckerRoot.scale.setScalar(sc * animMul);
  }

  /** Ground solid / podium — same scale curves as Reference colors (see toggleScaleAnimation.js). */
  _updateBaseAppearAnimation() {
    this.studioGroundFacade?.updateBaseAppearAnimation();
  }

  /** Base glass on the base top — same shared scale curves as base toggles. */
  _updateBaseGlassAppearAnimation() {
    this.studioGroundFacade?.updateBaseGlassAppearAnimation();
  }

  _updateBackdropAppearAnimation() {
    this.studioGroundFacade?.updateBackdropAppearAnimation();
  }

  /**
   * Reference colors is a shortcut to Display → Unlit (textures): same path as the mesh tab Unlit icon.
   */
  applyColorCheckerReferenceShading() {
    const cc = this.stateStore.getState().colorChecker ?? {};
    const defaults = this.stateStore.getDefaults().colorChecker;
    const merged = { ...defaults, ...(typeof cc === 'object' ? cc : {}) };
    const on = !!merged.rawColors;

    if (on) {
      const sh = this.stateStore.getState().shading;
      this._colorCheckerRestoreShading = sh;
      if (sh !== 'textures') {
        this.stateStore.set('shading', 'textures');
        this.setShading('textures');
      }
      this.ui?.syncUIFromState?.();
      return;
    }

    if (this._colorCheckerRestoreShading != null) {
      const back = this._colorCheckerRestoreShading;
      this._colorCheckerRestoreShading = null;
      this.stateStore.set('shading', back);
      this.setShading(back);
    }
    this.ui?.syncUIFromState?.();
  }

  /**
   * After loading scene JSON: Reference on implies Display → Unlit (textures).
   * Uses direct material path so we don’t clear `rawColors` via `setShading`.
   */
  _ensureColorCheckerReferenceShadingConsistency() {
    const st = this.stateStore.getState();
    if (!st.colorChecker?.rawColors || st.shading === 'textures') return;
    this._colorCheckerRestoreShading = st.shading;
    this.stateStore.set('shading', 'textures');
    this.materialController.setShading('textures');
    this.unlitMode = this.materialController.getUnlitMode();
    this.setReverseNormals(this.reverseNormalsEnabled);
    this.ui?.syncUIFromState?.();
  }

  /**
   * After state-driven pass updates, apply tier rules (e.g. Low disables DOF/bloom
   * even when those effects are "on" in saved settings).
   */
  applyRenderQualityVisualOverrides() {
    const tier = resolveRenderQualityTier(
      this.stateStore.getState().renderQuality,
    );
    if (tier.forceDepthOfFieldOff && this.postPipeline?.bokehPass) {
      this.postPipeline.bokehPass.enabled = false;
    }
    if (tier.forceBloomOff) {
      if (this.postPipeline?.bloomPass) {
        this.postPipeline.bloomPass.enabled = false;
      }
      if (this.postPipeline?.bloomTintPass) {
        this.postPipeline.bloomTintPass.enabled = false;
      }
      if (this.postPipeline?.creativeLookViewportBloomPass) {
        this.postPipeline.creativeLookViewportBloomPass.enabled = false;
      }
    }
    this.syncAnamorphicBloomFromState();
  }

  syncAnamorphicBloomFromState() {
    const state = this.stateStore.getState();
    const bloomOk = isAnamorphicBloomPipelineActive(state);
    const defaults = this.stateStore.getDefaults().lensFlare?.anamorphicBloom ?? {};
    const raw = state.lensFlare?.anamorphicBloom ?? {};
    const merged = {
      ...defaults,
      ...(raw && typeof raw === 'object' ? raw : {}),
    };
    this.postPipeline?.updateAnamorphicBloom(merged, { forceOff: !bloomOk });
  }

  /**
   * Shared deps for Gouache / Watercolour / Sketch capture hooks + live viewport prep.
   */
  _creativeLookCaptureDeps() {
    return this.creativeLookSceneSync?.captureDeps();
  }

  /**
   * Apply render quality tier: DPR cap, shadow resolution, bloom internal scale, FXAA/DOF policy.
   */
  applyRenderQualitySettings() {
    const state = this.stateStore.getState();
    const tier = resolveRenderQualityTier(state.renderQuality);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, tier.maxPixelRatio),
    );
    // Keep composer RT pixel ratio in lockstep immediately (handleResize is rAF-deferred).
    const szNow = new THREE.Vector2();
    this.renderer.getSize(szNow);
    if (this.composer && szNow.x > 0 && szNow.y > 0) {
      this.syncPostProcessingForLogicalSize(szNow.x, szNow.y);
    }
    this._applyViewportSizeFromLayout();
    this.backgroundGradientController?.applyIfActive?.();
    this.updateDof(state.dof);
    this.updateBloom(state.bloom);
    this.updateAmbientOcclusion(state.ambientOcclusion);
    this.applyRenderQualityVisualOverrides();
    this.materialController?.retuneCreativeCrystalGemPerformance?.();
    if (this.fxaaPass) {
      this.fxaaPass.enabled =
        !tier.forceFxaaOff && (state.antiAliasing ?? 'none') === 'fxaa';
    }
    const shadowSize =
      shadowMapSizeForQuality(this.lightsShadowQuality)
      ?? tier.shadowMapSize;
    this.lightsController?.setShadowMapResolution(shadowSize);
    // PCFSoft ignores shadow.radius; softness slider drives radius on PCFShadowMap only.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this._syncEffectiveCastShadows();
  }

  _hasHdriPreset(preset) {
    if (!preset) return false;
    if (HDRI_PRESETS[preset]) return true;
    return preset === HDRI_CUSTOM_ID && !!this.environmentController?.presets?.[HDRI_CUSTOM_ID];
  }

  applyNeutralHdriCompanion() {
    const bloom = { ...this.stateStore.defaults.bloom };
    this.stateStore.set('bloom', bloom);
    this.updateBloom(bloom);
    this.applyHdriMood(null);
  }

  clearCustomHdri() {
    this.environmentController?.disposePreset(HDRI_CUSTOM_ID);
    this.stateStore.set('hdriCustomName', null);
    this.stateStore.set('hdriCustomAsset', null);
    this.ui?.clearHdriUploadLoaded?.();
  }

  async loadCustomHdri(file) {
    if (!file) return;
    const type = getCustomHdriUploadType(file.name);
    this.clearCustomHdri();
    const fileBuffer = await file.arrayBuffer();
    this.stateStore.set('hdriCustomAsset', {
      name: file.name,
      type: file.type || '',
      dataBase64: arrayBufferToBase64(fileBuffer),
    });
    const url = URL.createObjectURL(file);
    this.environmentController?.registerPreset(HDRI_CUSTOM_ID, {
      url,
      type,
      revokeUrl: true,
    });
    this.stateStore.set('hdriCustomName', file.name);
    const loaded = await this.setHdriPreset(HDRI_CUSTOM_ID, { suppressSuccessToast: true });
    if (loaded) {
      this.ui?.setHdriUploadLoaded?.(file.name);
      this.ui?.showToast?.(`Custom HDRI loaded — ${file.name}`, 3200, { notification: false });
    } else {
      this.clearCustomHdri();
      this.ui?.showToast?.('Failed to load custom HDRI');
    }
  }

  async loadCustomBackgroundImage(file, { persist = true, suppressSuccessToast = false } = {}) {
    if (!file) return false;
    try {
      const image = await loadBackgroundImageElement(file);
      let asset = null;

      if (persist) {
        asset = await encodeBackgroundImageAsset(image, file.name);
      }

      const current = normalizeBackgroundImage(this.stateStore.getState().backgroundImage);
      const next = normalizeBackgroundImage({
        ...current,
        enabled: true,
        ...(asset ? { asset } : {}),
      });

      if (persist && asset) {
        applyBackgroundMode(this.stateStore, this.eventBus, 'image');
        this.stateStore.set('backgroundImage', next);
        this.eventBus.emit('scene:background-image', next);
      }

      this.backgroundImageController?.setImage(image, { skipRefresh: true });
      this.backgroundImageController?.setConfig(
        persist && asset ? next : { ...next, enabled: true },
        { skipRefresh: true },
      );
      this.backgroundController?.refreshAppearance?.();

      if (!suppressSuccessToast) {
        this.ui?.showToast?.(`Background image loaded — ${file.name}`, 3200, {
          notification: false,
        });
      }
      return true;
    } catch (error) {
      console.warn('Failed to load background image', error);
      this.ui?.showToast?.('Failed to load background image');
      return false;
    }
  }

  async restoreBackgroundImageFromState(config) {
    const normalized = normalizeBackgroundImage(config);
    const current = this.backgroundImageController?.getConfig?.();
    const sameAsset =
      normalized.asset?.dataBase64 &&
      current?.asset?.dataBase64 === normalized.asset.dataBase64 &&
      this.backgroundImageController?.hasImage?.();
    if (sameAsset) {
      this.backgroundImageController?.setConfig(normalized);
      this.backgroundController?.refreshAppearance?.();
      return;
    }
    this.backgroundImageController?.setConfig(normalized);
    if (!normalized.asset?.dataBase64) {
      this.backgroundImageController?.setImage(null);
      this.backgroundController?.refreshAppearance?.();
      return;
    }
    const file = fileFromEmbeddedAsset(normalized.asset, 'background.jpg');
    if (!file) return;
    await this.loadCustomBackgroundImage(file, {
      persist: false,
      suppressSuccessToast: true,
    });
    this.backgroundImageController?.setConfig(normalized);
  }

  async setHdriPreset(preset, options = {}) {
    if (!this._hasHdriPreset(preset)) return false;
    this.currentHdri = preset;
    const alreadyCached = this.environmentController?.cache?.has?.(preset);
    if (!alreadyCached) {
      this.ui.beginLoadSpinner();
    }
    try {
      await this.environmentController?.setPreset(preset);
      if (preset === HDRI_CUSTOM_ID) {
        this.applyNeutralHdriCompanion();
      } else {
        this.applyHdriMood(preset);
      }
      this.autoExposureController?.resetLuminance();
      if (
        !options.suppressSuccessToast
        && this._suppressModeChangeToasts === 0
      ) {
        const state = this.stateStore.getState();
        const customName = state.hdriCustomName;
        const message =
          preset === HDRI_CUSTOM_ID && customName
            ? `Custom HDRI loaded — ${customName}`
            : `HDRI loaded — ${String(preset)
                .replace(/-/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase())}`;
        this.ui?.showToast?.(message, 3200, { notification: false });
      }
      return true;
    } catch (error) {
      console.error('Failed to apply HDRI preset', preset, error);
      this.ui.showToast('Failed to load HDRI');
      return false;
    } finally {
      if (!alreadyCached) {
        this.ui.endLoadSpinner();
      }
    }
  }

  updateMaterialsEnvironment(envTexture, intensity) {
    this.materialController.updateMaterialsEnvironment(
      envTexture,
      intensity,
      this.hdriBlurriness,
    );
    this.groundController?.applyBaseEnvironment(
      envTexture,
      intensity,
      this.hdriBlurriness,
    );
    this._syncStudioGroundSurfaces();
    this._syncColorCheckerReferenceProbes(envTexture, intensity, this.hdriBlurriness);
  }

  /**
   * Chrome / grey / white reference spheres use their own fixed metalness — not the mesh slider.
   * Env maps are assigned here (they are not under `currentModel`, so MaterialController skips them).
   * Roughness tracks HDRI blurriness like the main mesh / podium so probe reflections match the dome.
   */
  _syncColorCheckerReferenceProbes(envTexture, intensity, hdriBlurriness) {
    const mats = this.colorCheckerRoot?.userData?.referenceProbeMaterials;
    if (!mats?.length) return;
    const tex = envTexture ?? this.scene.environment ?? null;
    const envInt = Math.max(
      0,
      Number.isFinite(intensity) ? intensity : this.hdriStrength ?? 0,
    );
    const rawBlur =
      hdriBlurriness !== undefined ? Number(hdriBlurriness) : this.hdriBlurriness ?? 0;
    const blur = Number.isFinite(rawBlur)
      ? Math.min(1, Math.max(0, rawBlur))
      : 0;
    for (const mat of mats) {
      if (!mat?.userData?.meshglReferenceProbe) continue;
      mat.envMap = tex;
      if (mat.envMapIntensity !== undefined) {
        mat.envMapIntensity = envInt;
      }
      const baseR = mat.userData?.referenceBaseRoughness;
      if (baseR !== undefined && mat.roughness !== undefined) {
        mat.roughness = effectiveRoughnessWithHdriBlur(baseR, blur);
      }
      mat.needsUpdate = true;
    }
  }

  setHdriBackground(enabled) {
    this.hdriBackgroundEnabled = enabled;

    const bgColor = this.backgroundController?.getColor() ?? APP_BACKGROUND;
    this.environmentController?.setFallbackColor(bgColor);

    // BackgroundController must know backdrop is off before EnvironmentController releases
    // scene.background (onReleaseSceneBackground → refreshAppearance).
    this.backgroundController?.setHdriBackgroundEnabled(enabled);
    this.environmentController?.setBackgroundEnabled(enabled);

    this.applyHdriMood(this.currentHdri);
    this.ui?.updateHdriReceiveShadowsAoDisabled?.();
    this.ui?.updateHdriBackgroundFallbackVisibility?.();
  }

  syncCreativeLookTransmissionBackdrop() {
    return this.creativeLookSceneSync?.syncTransmissionBackdrop() ?? false;
  }

  setHdriReceiveShadowsAo(enabled) {
    this.backgroundController?.setReceiveShadowsAoEnabled(!!enabled);
    this._syncHdriShadowReceiverFromState();
  }

  _syncHdriShadowReceiverFromState() {
    const state = this.stateStore.getState();
    const bg = this.backgroundController;
    if (!bg) return;
    bg.setReceiveShadowsAoEnabled(!!state.hdriReceiveShadowsAo);
    bg.setHdriBackgroundEnabled(this.hdriBackgroundEnabled);
    bg.setHdriEnabled(this.hdriEnabled);
    bg.setGroundSolid(!!state.groundSolid);
    bg.setGroundY(state.groundY ?? 0);
    bg.setShadowReceiverOpacity(
      state.lightsShadowOpacity ?? this.lightsShadowOpacity,
    );
    bg.setHdriShadowReceiverAoRadius(state.ambientOcclusion?.radius ?? 1);
    this._syncShadowModesHdriReceiver();
    this._syncShadowCameraBounds();
  }

  _updateHdriShadowReceiverContact() {
    this.backgroundController?.updateHdriShadowReceiverFromModel?.(this.currentModel);
    this._syncShadowCameraBounds();
  }

  setLensFlareRotation(value) {
    this.lensFlareController?.setRotation(value);
    this._syncKeyLightFromLensFlareIfConnected();
  }

  setLensFlareHeight(value) {
    this.lensFlareController?.setHeight(value);
    this._syncKeyLightFromLensFlareIfConnected();
  }

  /**
   * Toggle key-light sync to lens-flare sun direction (rotation + elevation).
   * @param {boolean} connected
   */
  setLensFlareKeyLightConnected(connected) {
    const state = this.stateStore.getState();
    const flare = state.lensFlare ?? {};
    const wasConnected = !!flare.keyLightConnected;

    if (connected && !wasConnected) {
      const restore = {
        rotate: state.lights?.key?.rotate ?? 0,
        height: state.lights?.key?.height ?? 5,
      };
      this.stateStore.batch(() => {
        this.stateStore.set('lensFlare.keyLightRestore', restore);
        this.stateStore.set('lensFlare.keyLightConnected', true);
      });
      this._syncKeyLightFromLensFlareIfConnected();
    } else if (!connected && wasConnected) {
      const restore = flare.keyLightRestore;
      if (restore) {
        this._applyKeyLightFromLensFlareSync(restore.rotate, restore.height);
      }
      this.stateStore.batch(() => {
        this.stateStore.set('lensFlare.keyLightRestore', null);
        this.stateStore.set('lensFlare.keyLightConnected', false);
      });
    }

    this.ui?.syncLensFlareKeyLightConnectButton?.();
  }

  _syncKeyLightFromLensFlareIfConnected() {
    const flare = this.stateStore.getState().lensFlare;
    if (!flare?.keyLightConnected) return;

    const { rotate, height } = keyLightParamsFromLensFlare(
      flare.rotation ?? 0,
      flare.height ?? 0,
      this.stateStore.getState().lightsRotation ?? 0,
    );
    this._applyKeyLightFromLensFlareSync(rotate, height);
  }

  _applyKeyLightFromLensFlareSync(rotate, height) {
    this._applyingKeyLightFromLensFlare = true;
    try {
      this.stateStore.batch(() => {
        this.stateStore.set('lights.key.rotate', rotate);
        this.stateStore.set('lights.key.height', height);
      });
      this.lightsController?.updateLightProperty('key', 'rotate', rotate);
      this.lightsController?.updateLightProperty('key', 'height', height);
      if (this.ui?.inputs?.keyLightRotate) {
        this.ui.inputs.keyLightRotate.value = rotate;
        this.ui.updateValueLabel('keyLightRotate', rotate, 'angle');
      }
      if (this.ui?.inputs?.keyLightHeight) {
        this.ui.inputs.keyLightHeight.value = height;
        this.ui.updateValueLabel('keyLightHeight', height, 'decimal');
      }
      this.updateLightIndicators();
      if (this.goboProjection?.enabled) {
        this.goboProjection.syncUniformsOnScene(this._getGoboSceneTargets());
      }
    } finally {
      this._applyingKeyLightFromLensFlare = false;
    }
  }

  setLensFlareSpinDuringOrbit(enabled) {
    this.stateStore.set('lensFlare.spinDuringOrbit', !!enabled);
    this.lensFlareController?.setSpinDuringOrbit(enabled);
  }

  setClayNormalMap(enabled) {
    if (!this.currentModel) return;

    const applyFromOriginal = (material, originalMat) => {
      if (!material) return;
      if (enabled) {
        if (originalMat?.normalMap) {
          material.normalMap = originalMat.normalMap;
          material.normalMapType =
            originalMat.normalMapType ?? THREE.TangentSpaceNormalMap;
          if (originalMat.normalScale) {
            material.normalScale = originalMat.normalScale.clone();
          }
        } else {
          material.normalMap = null;
        }
      } else {
        material.normalMap = null;
        material.normalMapType = THREE.TangentSpaceNormalMap;
      }
      material.needsUpdate = true;
    };

    const isPbrWithNormalSlot = (m) =>
      m &&
      (m.isMeshStandardMaterial ||
        m.isMeshPhysicalMaterial);

    if (this.currentShading === 'clay') {
      this.currentModel.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        if (!this.materialController.isClayMaterial(child)) return;
        const originals = this.materialController.getOriginalMaterial(child);
        if (!originals) return;
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        const origs = Array.isArray(originals) ? originals : [originals];
        materials.forEach((material, i) => {
          if (!material?.isMeshStandardMaterial) return;
          const originalMat = origs[i] ?? origs[0];
          applyFromOriginal(material, originalMat);
        });
      });
    } else if (this.currentShading === 'shaded') {
      this.currentModel.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const originals = this.materialController.getOriginalMaterial(child);
        if (!originals) return;
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        const origs = Array.isArray(originals) ? originals : [originals];
        materials.forEach((material, i) => {
          if (!isPbrWithNormalSlot(material)) return;
          const originalMat = origs[i] ?? origs[0];
          applyFromOriginal(material, originalMat);
        });
      });
    }
  }

  setHdriEnabled(enabled) {
    this.hdriEnabled = enabled;
    this.environmentController?.setEnabled(enabled);
    
    // Update environment controller's fallback color (for when HDRI is completely off)
    const bgColor = this.backgroundController?.getColor() ?? APP_BACKGROUND;
    this.environmentController?.setFallbackColor(bgColor);
    
    // Notify background controller of HDRI enabled state
    this.backgroundController?.setHdriEnabled(enabled);

    this.applyHdriMood(this.currentHdri);
    this.lensFlareController?.setHdriEnabled(enabled);
    this.godRaysController?.setHdriEnabled(enabled);
    this.ui?.updateHdriReceiveShadowsAoDisabled?.();
    // Reset auto-exposure when HDRI is toggled (scene brightness changes dramatically)
    this.autoExposureController?.resetLuminance();
  }

  applyLookFilter(presetId) {
    applyLookFilterPreset({
      eventBus: this.eventBus,
      stateStore: this.stateStore,
      ui: this.ui,
      presetId,
    });
  }

  setHdriStrength(value) {
    const maxStrength = 5 * HDRI_STRENGTH_UNIT;
    this.hdriStrength = Math.min(maxStrength, Math.max(0, value));
    this.environmentController?.setStrength(this.hdriStrength);
  }

  setHdriBlurriness(value) {
    this.hdriBlurriness = Math.min(1, Math.max(0, value));
    this.environmentController?.setBlurriness(this.hdriBlurriness);
    // Blurriness feeds base roughness via effectiveRoughnessWithHdriBlur; env notify dedupes on
    // texture/intensity only, so sync materials explicitly when the dome is already loaded.
    if (this.scene?.environment) {
      const intensity = Math.max(0, this.hdriStrength ?? 0);
      this.updateMaterialsEnvironment(this.scene.environment, intensity);
    }
  }

  setHdriRotation(value, { updateState = true, updateUi = false, live = false } = {}) {
    const normalized = ((value % 360) + 360) % 360;
    this.hdriRotation = normalized;
    if (updateState) {
      this.stateStore.set('hdriRotation', this.hdriRotation);
    }
    if (live) {
      this.environmentController?.setRotationLive?.(this.hdriRotation);
    } else {
      this.environmentController?.setRotation(this.hdriRotation);
    }
    if (updateUi && this.ui?.inputs?.hdriRotation) {
      this.ui.inputs.hdriRotation.value = this.hdriRotation;
      this.ui.updateValueLabel('hdriRotation', this.hdriRotation, 'angle');
    }
  }

  clearWireframeOverlay() {
    this.materialController.clearWireframeOverlay();
  }

  updateWireframeOverlay() {
    this.materialController.updateWireframeOverlay();
  }

  updateWireframeOverlayTransforms() {
    this.materialController.updateWireframeOverlayTransforms();
  }

  setUvCheckerEnabled(enabled) {
    const on = !!enabled;
    this.stateStore.set('advanced.uvChecker', on);
    const overlay = this.materialController?.uvCheckerOverlay;
    if (!overlay) return;
    if (!on) {
      overlay.setEnabled(false);
      this._refreshViewportAfterOverlayChange();
      return;
    }
    void withViewportLoadSpinner(this.ui, 'Loading UV checker', async () => {
      overlay.setEnabled(true, false);
      await overlay.rebuildAsync();
      this._refreshViewportAfterOverlayChange();
    });
  }

  setUvCheckerScale(scale) {
    const safe = Number.isFinite(scale) ? Math.max(0.05, Math.min(10, scale)) : 5;
    this.stateStore.set('advanced.uvCheckerScale', safe);
    this.materialController?.setUvCheckerScale(safe);
  }

  setUvCheckerStyle(style) {
    const mapped = style === 'vibrant' ? 'classic' : style;
    const allowed = ['orby', 'classic', 'monochrome'];
    const safe = allowed.includes(mapped) ? mapped : 'orby';
    this.stateStore.set('advanced.uvCheckerStyle', safe);
    const overlay = this.materialController?.uvCheckerOverlay;
    if (!overlay) return;
    if (!overlay.enabled) {
      overlay.setStyle(safe, false);
      return;
    }
    void withViewportLoadSpinner(this.ui, 'Loading UV checker', async () => {
      overlay.setStyle(safe, false);
      await overlay.rebuildAsync();
      this._refreshViewportAfterOverlayChange();
    });
  }

  setNormalViewEnabled(enabled) {
    const on = !!enabled;
    const overlay = this.materialController?.normalViewOverlay;
    if (on && this.stateStore.peekState().advanced?.uvChecker) {
      this.setUvCheckerEnabled(false);
    }
    if (!overlay) {
      this.stateStore.set('advanced.normalView', on);
      return;
    }
    if (!on) {
      this.stateStore.batch(() => {
        this.stateStore.set('advanced.normalView', false);
      });
      overlay.setEnabled(false);
      this._refreshViewportAfterOverlayChange();
      return;
    }
    void withViewportLoadSpinner(this.ui, 'Loading normal view', async () => {
      overlay.setEnabled(true, false);
      await overlay.rebuildAsync();
      this.stateStore.batch(() => {
        this.stateStore.set('advanced.normalView', true);
      });
      this._refreshViewportAfterOverlayChange();
    });
  }

  setNormalViewMode(mode) {
    const allowed = ['geometry', 'tangent'];
    const safe = allowed.includes(mode) ? mode : 'geometry';
    const overlay = this.materialController?.normalViewOverlay;
    if (!overlay) {
      this.stateStore.set('advanced.normalViewMode', safe);
      return;
    }
    if (!overlay.enabled) {
      this.stateStore.batch(() => {
        this.stateStore.set('advanced.normalViewMode', safe);
      });
      overlay.setMode(safe, false);
      return;
    }
    void withViewportLoadSpinner(this.ui, 'Loading normal view', async () => {
      overlay.setMode(safe, false);
      await overlay.rebuildAsync();
      this.stateStore.batch(() => {
        this.stateStore.set('advanced.normalViewMode', safe);
      });
      this._refreshViewportAfterOverlayChange();
    });
  }

  /** Wake idle render loop after diagnostic overlay rebuilds (normal view, UV checker, etc.). */
  _refreshViewportAfterOverlayChange() {
    this.wakeViewportPresentation(6);
  }

  updateUvCheckerOverlayTransforms() {
    this.materialController?.updateUvCheckerOverlayTransforms();
  }

  updateNormalViewOverlayTransforms() {
    this.materialController?.updateNormalViewOverlayTransforms();
  }

  /**
   * @param {boolean} enabled
   * @param {import('./mesh/topologyAnalysis.js').TopologyWarningCategory | null} [category]
   * @param {{ skipSpinner?: boolean }} [options]
   * @returns {Promise<void>}
   */
  setTopologyWarningsEnabled(enabled, category = null, options = {}) {
    const overlay = this.topologyWarningsOverlay;
    if (!overlay) return Promise.resolve();
    if (!enabled) {
      overlay.setEnabled(false);
      return Promise.resolve();
    }

    const apply = async () => {
      overlay.setModel(this.currentModel ?? null);
      overlay.setCategory(category ?? null, false);
      overlay.setEnabled(true, false);
      await overlay.rebuildAsync();
    };

    if (options.skipSpinner) {
      return apply();
    }
    return withViewportLoadSpinner(this.ui, 'Loading mesh health', apply);
  }

  /**
   * @param {import('./mesh/topologyAnalysis.js').TopologyWarningCategory} category
   * @param {{ skipSpinner?: boolean }} [options]
   * @returns {Promise<void>}
   */
  setTopologyWarningsCategory(category, options = {}) {
    const overlay = this.topologyWarningsOverlay;
    if (!overlay?.enabled) {
      overlay?.setCategory(category, false);
      return Promise.resolve();
    }

    const apply = async () => {
      overlay.setCategory(category, false);
      await overlay.rebuildAsync();
    };

    if (options.skipSpinner) {
      return apply();
    }
    return withViewportLoadSpinner(this.ui, 'Loading mesh health', apply);
  }

  updateTopologyWarningsOverlayTransforms() {
    this.topologyWarningsOverlay?.updateTransforms();
  }

  setMapInspectPreview(slot) {
    this.materialController?.mapInspectPreview?.preview(slot);
    this.animationController?.resyncPose?.();
    this.requestRender?.();
  }

  clearMapInspectPreview() {
    this.materialController?.mapInspectPreview?.clear();
    this.animationController?.resyncPose?.();
    this.requestRender?.();
  }

  setGroundSolid(enabled) {
    this.studioGroundFacade?.setGroundSolid(enabled);
  }

  setAutoRotateSpeed(speed, { silent = false } = {}) {
    const next = Number(speed) || 0;
    if (next === this.autoRotateSpeed) return;
    this.autoRotateSpeed = next;
    if (!silent && this._suppressModeChangeToasts === 0) {
      this.ui?.showModeChangeToast?.('autoRotate', next);
    }
  }

  setAutoRotateDirection(direction) {
    const next = direction === 'reverse' ? 'reverse' : 'forward';
    if (next === this.autoRotateDirection) return;
    this.autoRotateDirection = next;
  }

  setCameraAutoOrbit(mode, { silent = false } = {}) {
    const next = mode ?? 'off';
    if (next === this.cameraAutoOrbit) return;
    this.cameraAutoOrbit = next;
    this.cameraController?.setAutoOrbit(this.cameraAutoOrbit);
    this.lensFlareController?.refreshProceduralSpin?.();
    if (!silent && this._suppressModeChangeToasts === 0) {
      this.ui?.showModeChangeToast?.('autoOrbit', next);
    }
  }

  setCameraHandheld(mode, { silent = false } = {}) {
    let m = mode ?? 'off';
    if (m === 'medium') m = 'high';
    if (m === this.cameraHandheld) return;
    this.cameraHandheld = m;
    this.cameraController?.setHandheldMode(this.cameraHandheld);
    if (!silent && this._suppressModeChangeToasts === 0) {
      this.ui?.showModeChangeToast?.('handheld', m);
    }
  }

  setGroundY(value) {
    this.studioGroundFacade?.setGroundY(value);
  }

  _alignGroundAndGridToCurrentModelBottom(options) {
    return this.studioGroundFacade?.alignGroundAndGridToCurrentModelBottom(options);
  }

  _cancelGroundGridBottomAlignAnimation() {
    this.studioGroundFacade?.cancelGroundGridBottomAlignAnimation();
  }

  _animateGroundAndGridToCurrentModelBottom(options) {
    return this.studioGroundFacade?.animateGroundAndGridToCurrentModelBottom(options);
  }

  snapBaseToBottom() {
    this.studioGroundFacade?.snapBaseToBottom();
  }

  snapGridToBottom() {
    this.studioGroundFacade?.snapGridToBottom();
  }

  setBaseScale(value, { updateState = true } = {}) {
    this.studioGroundFacade?.setBaseScale(value, { updateState });
  }

  setBaseSurface(settings = {}, { updateState = true } = {}) {
    this.studioGroundFacade?.setBaseSurface(settings, { updateState });
  }

  setBaseGlassSurface(enabled, { updateState = true } = {}) {
    this.studioGroundFacade?.setBaseGlassSurface(enabled, { updateState });
  }

  setBackdropEnabled(enabled, { updateState = true } = {}) {
    this.studioGroundFacade?.setBackdropEnabled(enabled, { updateState });
  }

  setBackdropScale(value, { updateState = true } = {}) {
    this.studioGroundFacade?.setBackdropScale(value, { updateState });
  }

  setBackdropWidth(value, { updateState = true } = {}) {
    this.studioGroundFacade?.setBackdropWidth(value, { updateState });
  }

  setBackdropRotation(value, { updateState = true } = {}) {
    this.studioGroundFacade?.setBackdropRotation(value, { updateState });
  }

  setBackdropY(value, { updateState = true } = {}) {
    this.studioGroundFacade?.setBackdropY(value, { updateState });
  }

  setBackdropSurface(settings = {}, { updateState = true } = {}) {
    this.studioGroundFacade?.setBackdropSurface(settings, { updateState });
  }

  setInfinityCoveEnabled(enabled, { updateState = true } = {}) {
    this.studioGroundFacade?.setInfinityCoveEnabled(enabled, { updateState });
  }

  setInfinityCoveScale(value, { updateState = true } = {}) {
    this.studioGroundFacade?.setInfinityCoveScale(value, { updateState });
  }

  setInfinityCoveWidth(value, { updateState = true } = {}) {
    this.studioGroundFacade?.setInfinityCoveWidth(value, { updateState });
  }

  setInfinityCoveRotation(value, { updateState = true } = {}) {
    this.studioGroundFacade?.setInfinityCoveRotation(value, { updateState });
  }

  setInfinityCoveY(value, { updateState = true } = {}) {
    this.studioGroundFacade?.setInfinityCoveY(value, { updateState });
  }

  setInfinityCoveSurface(settings = {}, { updateState = true } = {}) {
    this.studioGroundFacade?.setInfinityCoveSurface(settings, { updateState });
  }

  snapInfinityCoveToBottom() {
    this.studioGroundFacade?.snapInfinityCoveToBottom();
  }

  snapBackdropToBottom() {
    this.studioGroundFacade?.snapBackdropToBottom();
  }

  setSceneGeometryWireframe(enabled) {
    // Wireframe display mode targets the loaded mesh overlay only.
    if (enabled) return;
    this.groundController?.setDebugWireframeEnabled(false);
  }

  applyLightSettings(lightsState) {
    if (!lightsState) return;
    this.lightsController?.applySettings(lightsState);
  }

  /**
   * Master lights on with every per-light `enabled` false is an invalid rig (intensities stay 0).
   * Ensure the default 3-point + ambient flags when turning the system on.
   */
  _ensureDefaultLightsRigInState() {
    const state = this.stateStore.getState();
    const lights = state.lights ?? {};
    const anyOn = ['key', 'fill', 'rim', 'ambient'].some(
      (id) => lights[id]?.enabled === true,
    );
    if (anyOn) return;
    this.stateStore.batch(() => {
      ['key', 'fill', 'rim', 'ambient'].forEach((id) => {
        this.stateStore.set(`lights.${id}.enabled`, true);
      });
      if (state.lightsCastShadows) {
        this._ensureDefaultPerLightCastShadowsInState();
      }
    });
  }

  setLightsEnabled(enabled) {
    this.lightsEnabled = !!enabled;
    // Keep in sync with StateStore (UI may set lightsCastShadows before this runs).
    this.lightsCastShadows = !!this.stateStore.getState().lightsCastShadows;
    if (this.lightsEnabled) {
      this._ensureDefaultLightsRigInState();
    }
    const lightsState = this.stateStore.getState().lights;
    this.lightsController?.setEnabled(this.lightsEnabled, lightsState);

    if (this.lightsEnabled) {
      ['key', 'fill', 'rim', 'ambient'].forEach((lightId) => {
        const on = lightsState?.[lightId]?.enabled === true;
        this.lightsController?.updateLightProperty(lightId, 'enabled', on);
      });
    } else {
      ['key', 'fill', 'rim', 'ambient'].forEach((lightId) => {
        this.lightsController?.updateLightProperty(lightId, 'enabled', false);
      });
    }

    this._syncEffectiveCastShadows();
    this._syncShadowAndGobo();
    this._syncHdriShadowReceiverFromState();
    if (this.lightsEnabled) {
      this._syncLightIndicatorCenterFallback();
    }
  }

  _isShadowTintActive() {
    return !!this.lightsEnabled && !!this.lightsCastShadows;
  }

  _syncEffectiveCastShadows() {
    syncEffectiveCastShadowsFromState(this);
    this._applyKeyLightGoboShadowOverride();
  }

  /**
   * Horizontal radius from the model center to the shadow receive surface edge (podium / HDRI catcher).
   * Keeps the directional shadow frustum large enough that out-of-map samples do not paint a square slab.
   * Solid-base scale only enlarges the visual floor — shadow maps stay mesh-focused so Base scale
   * does not dilute contact-shadow resolution.
   */
  _getShadowReceiveSurfaceRadius(bounds) {
    const center = bounds?.center;
    if (!center) return 0;

    const state = this.stateStore.getState();
    const meshRadius = Number.isFinite(bounds?.radius)
      ? Math.max(0.5, bounds.radius)
      : 1;
    const shadowPad = shadowCameraOrthoPaddingForQuality(
      normalizeShadowQuality(state.lightsShadowQuality),
    );
    let radius = 0;

    if (
      (state.groundSolid && this.groundController?.solidEnabled)
      || (state.baseGlassSurface ?? state.podiumReflectMesh ?? false)
    ) {
      const gc = this.groundController;
      const visualPodiumR = (gc.podiumBaseRadius ?? 2) * (gc.podiumScale ?? 1);
      const px = gc.podiumRoot?.position?.x ?? 0;
      const py = gc.podiumRoot?.position?.y ?? 0;
      const pz = gc.podiumRoot?.position?.z ?? 0;
      const podiumHeight = Math.max(0, gc.groundHeight ?? 0);
      const centerToTopY = Math.abs((center.y ?? 0) - py);
      const centerToBottomY = Math.abs((center.y ?? 0) - (py - podiumHeight));
      const verticalReach = Math.max(centerToTopY, centerToBottomY);
      const horizontalOffset = Math.hypot(center.x - px, center.z - pz);
      const meshFootprintR = horizontalOffset + meshRadius * shadowPad + 0.35;
      const horizontalReach = Math.min(
        horizontalOffset + visualPodiumR,
        meshFootprintR,
      );
      radius = Math.max(
        radius,
        Math.hypot(horizontalReach, verticalReach) + 0.35,
      );
    }

    if (
      (state.backdropEnabled && this.groundController?.backdropEnabled)
      || (state.infinityCoveEnabled && this.groundController?.infinityCove?.enabled)
    ) {
      radius = Math.max(
        radius,
        this.groundController.getShadowReceiveRadiusFromCenter(center) ?? 0,
      );
    }

    const recv = this.backgroundController?.hdriShadowReceiver;
    if (
      state.hdriReceiveShadowsAo
      && state.hdriEnabled
      && state.hdriBackground
      && recv?.isActive?.()
    ) {
      radius = Math.max(radius, recv.getShadowCatcherRadius?.() ?? 0);
    }

    return radius;
  }

  _syncShadowCameraBounds(bounds = this.cameraController?.getModelBounds()) {
    if (bounds) {
      this.lightsController?.setModelBounds(bounds, {
        receiveSurfaceRadius: this._getShadowReceiveSurfaceRadius(bounds),
      });
    } else {
      this.lightsController?.setModelBounds(null, { receiveSurfaceRadius: 0 });
      this._syncLightIndicatorCenterFallback();
    }
  }

  /** Aim spotlight guides + HUD at orbit target when no mesh bounds exist. */
  _syncLightIndicatorCenterFallback() {
    const center =
      this.controls?.target
      ?? this.cameraController?.getModelBounds()?.center
      ?? new THREE.Vector3(0, 1, 0);
    this.lightsController?.setIndicatorCenterFallback(center);
  }

  /**
   * When gobo is on, the key light uses the projected pattern instead of shadow maps.
   * Preserves the user's key cast-shadow preference in state for when gobo turns off.
   */
  _applyKeyLightGoboShadowOverride() {
    if (!this.lightsController || !this._isShadowTintActive()) return;
    if (this.goboEnabled) {
      this.lightsController.updateLightProperty('key', 'castShadows', false);
      return;
    }
    const keyCast = resolveLightCastShadowIntent(this.stateStore.getState(), 'key');
    this.lightsController.updateLightProperty('key', 'castShadows', keyCast);
  }

  setLightsMaster(value) {
    this.lightsMaster = value ?? 0.30;
    const lightsState = this.stateStore.getState().lights;
    this.lightsController?.setMaster(this.lightsMaster, lightsState);
  }

  setShowLightIndicators(enabled) {
    if (enabled) {
      this._syncShadowCameraBounds();
      this._syncLightIndicatorCenterFallback();
    } else {
      this.lightViewportSelection?.deselect?.();
    }
    this.lightsController?.setIndicatorsVisible(enabled);
    this.lightIndicatorHud?.update();
    this.requestRender();
  }

  setShowLightFalloffIndicators(enabled) {
    if (enabled) {
      this._syncShadowCameraBounds();
      this._syncLightIndicatorCenterFallback();
    }
    this.lightsController?.setFalloffIndicatorsVisible(enabled);
    this.requestRender();
  }

  updateLightIndicators() {
    this._syncLightRigToSceneFocusIfNoModel();
    this.lightsController?.updateIndicators();
    this.lightViewportSelection?.updateWidget?.();
    this.lightIndicatorHud?.update();
  }

  /** Orbit target becomes the light rig focus when the viewport has no mesh. */
  _syncLightRigToSceneFocusIfNoModel() {
    if (this.currentModel || !this.lightsEnabled) return;
    const target = this.controls?.target;
    if (!target?.isVector3) return;
    const fallback = this.lightsController?._indicatorCenterFallback;
    if (fallback && fallback.distanceToSquared(target) < 1e-8) return;
    this.lightsController?.setIndicatorCenterFallback(target);
  }

  setLightsRotation(value, { updateUi = true, updateState = true } = {}) {
    this.lightsRotation = this.lightsController?.setRotation(value) ?? value;
    // Update StateStore to keep it in sync (especially important for auto-rotate)
    if (updateState) {
      this.stateStore.set('lightsRotation', this.lightsRotation);
    }
    if (updateUi) {
      this.ui?.setLightsRotation?.(this.lightsRotation);
    }
    // Update light indicators if visible
    this.updateLightIndicators();
    this.goboProjection?.syncUniformsOnScene(this._getGoboSceneTargets());
    this._syncKeyLightFromLensFlareIfConnected();
  }

  /**
   * After {@link LightsController#setHeight}, per-light Y values live in the controller but the
   * global `lightsHeight` slider only touched top-level state — leaving `lights.*.height` stale.
   * Stale heights then overwrote the rig when {@link LightsController#applySettings} ran (e.g. master
   * strength). Keep the store aligned whenever the controller mutates directional light heights.
   */
  _syncDirectionalLightHeightsFromControllerToState() {
    const lc = this.lightsController;
    if (!lc?.individualProperties) return;
    ['key', 'fill', 'rim'].forEach((id) => {
      const h = lc.individualProperties[id]?.height;
      if (Number.isFinite(h)) {
        this.stateStore.set(`lights.${id}.height`, h);
      }
    });
  }

  setLightsHeight(value, { updateUi = true, updateState = true } = {}) {
    if (!this.lightsController) return;
    this.lightsController.setHeight(value);
    if (updateState) {
      this.stateStore.batch(() => {
        this.stateStore.set('lightsHeight', value);
        this._syncDirectionalLightHeightsFromControllerToState();
      });
    }
    if (updateUi) {
      this.ui?.syncControls?.(this.stateStore.getState());
    }
    this.goboProjection?.syncUniformsOnScene(this._getGoboSceneTargets());
  }

  setLightsRigScale(value, { updateUi = true, updateState = true } = {}) {
    if (!this.lightsController) return;
    const normalized = this.lightsController.setRigScale(value);
    if (updateState) {
      this.stateStore.set('lightsRigScale', normalized);
    }
    if (updateUi) {
      this.ui?.syncControls?.(this.stateStore.getState());
    }
    this.updateLightIndicators();
    this.goboProjection?.syncUniformsOnScene(this._getGoboSceneTargets());
  }

  /**
   * When global shadows turn on and no per-light cast flag is set, apply quality-tier defaults.
   * Preserves existing per-light preferences across global shadow toggles.
   */
  _ensureDefaultPerLightCastShadowsInState() {
    const state = this.stateStore.getState();
    const lights = state.lights ?? {};
    const anyCast = ['key', 'fill', 'rim'].some(
      (id) => lights[id]?.castShadows === true,
    );
    if (anyCast) return;
    const castIds = castShadowLightIdsForGlobalToggle(state.renderQuality);
    this.stateStore.batch(() => {
      ['key', 'fill', 'rim'].forEach((id) => {
        this.stateStore.set(`lights.${id}.castShadows`, castIds.includes(id));
      });
    });
  }

  setLightsCastShadows(enabled) {
    const next = !!enabled;
    this.lightsCastShadows = next;
    const state = this.stateStore.getState();
    if (state.lightsCastShadows !== next) {
      this.stateStore.set('lightsCastShadows', next);
    }
    if (next) {
      this._ensureDefaultPerLightCastShadowsInState();
    }
    this._syncEffectiveCastShadows();
    this._syncShadowAndGobo();
    this._syncHdriShadowReceiverFromState();
    this.ui?.syncControls?.(this.stateStore.getState());
    this.updateLightIndicators();
    this.requestRender();
  }

  setLightsShadowQuality(quality) {
    this.lightsShadowQuality = normalizeShadowQuality(quality);
    this.lightsController?.setShadowQuality(this.lightsShadowQuality);
    this.applyRenderQualitySettings();
    this._syncShadowCameraBounds();
    this._syncShadowAndGobo();
  }

  setLightsShadowSoftness(value) {
    const raw = Number(value);
    this.lightsShadowSoftness = Number.isFinite(raw)
      ? Math.min(4, Math.max(0, raw))
      : DEFAULT_LIGHTS_SHADOW_SOFTNESS;
    this.lightsController?.setShadowSoftness(this.lightsShadowSoftness);
    this.applyRenderQualitySettings();
    this._syncShadowAndGobo();
  }

  setLightsShadowContactOffset(value) {
    const raw = Number(value);
    this.lightsShadowContactOffset = Number.isFinite(raw) ? raw : -0.0005;
    this.lightsController?.setShadowContactOffset(this.lightsShadowContactOffset);
  }

  setLightsShadowNormalBias(value) {
    const raw = Number(value);
    this.lightsShadowNormalBias = Number.isFinite(raw) ? raw : 0.01;
    this.lightsController?.setShadowNormalBias(this.lightsShadowNormalBias);
  }

  setLightsShadowColor(color) {
    const next = color ?? '#080808';
    this.lightsShadowColor = next;
    if (this.stateStore.getState().lightsShadowColor !== next) {
      this.stateStore.set('lightsShadowColor', next);
    }
    this._syncShadowAndGobo({ presentationOnly: true });
  }

  setLightsShadowOpacity(value) {
    const raw = Number(value);
    this.lightsShadowOpacity = Number.isFinite(raw)
      ? Math.min(1, Math.max(0, raw))
      : 0.25;
    if (this.stateStore.getState().lightsShadowOpacity !== this.lightsShadowOpacity) {
      this.stateStore.set('lightsShadowOpacity', this.lightsShadowOpacity);
    }
    this._syncShadowAndGobo({ presentationOnly: true });
    this.backgroundController?.setShadowReceiverOpacity(this.lightsShadowOpacity);
  }

  _syncGoboShadowSettings() {
    this.goboProjection?.setShadowSettings({
      opacity: this.lightsShadowOpacity,
      color: this.lightsShadowColor ?? '#080808',
    });
    this.goboProjection?.setGoboSettings({
      softness: this.goboSoftness,
      scale: this.goboScale,
      rotation: this.goboRotation,
    });
    this.goboProjection?.setSoftnessQuality(this.goboSoftnessQuality);
  }

  setGoboSoftnessQuality(quality, { updateState = true } = {}) {
    const next = normalizeShadowQuality(quality);
    this.goboSoftnessQuality = next;
    if (updateState) this.stateStore.set('gobo.softnessQuality', next);
    const modeChanged = this.goboProjection?.setSoftnessQuality(next) === true;
    this._syncGoboShadowSettings();
    if (this.goboProjection?.enabled) {
      const targets = this._getGoboSceneTargets();
      if (modeChanged) {
        this.goboProjection.markProgramsDirty(targets);
      }
      this.goboProjection.syncUniformsOnScene(targets);
    }
  }

  setGoboSoftness(value, { updateState = true } = {}) {
    const raw = Number(value);
    this.goboSoftness = Number.isFinite(raw) ? Math.min(4, Math.max(0, raw)) : DEFAULT_GOBO_SOFTNESS;
    if (updateState) this.stateStore.set('gobo.softness', this.goboSoftness);
    this._syncGoboShadowSettings();
    if (this.goboProjection?.enabled) {
      this.goboProjection.syncUniformsOnScene(this._getGoboSceneTargets());
    }
  }

  setGoboScale(value, { updateState = true } = {}) {
    const raw = Number(value);
    this.goboScale = Number.isFinite(raw) ? clampGoboUiScale(raw) : GOBO_UI_DEFAULT;
    if (updateState) {
      this.stateStore.set('gobo.scale', this.goboScale);
      this.stateStore.set('gobo.scaleSpace', 'ui');
    }
    this._syncGoboShadowSettings();
    if (this.goboProjection?.enabled) {
      this.goboProjection.syncUniformsOnScene(this._getGoboSceneTargets());
    }
  }

  setGoboRotation(value, { updateState = true } = {}) {
    const raw = Number(value);
    this.goboRotation = Number.isFinite(raw) ? ((raw % 360) + 360) % 360 : 0;
    if (updateState) this.stateStore.set('gobo.rotation', this.goboRotation);
    this._syncGoboShadowSettings();
    if (this.goboProjection?.enabled) {
      this.goboProjection.syncUniformsOnScene(this._getGoboSceneTargets());
    }
  }

  _syncStudioGroundSurfaces({ presentationOnly = false } = {}) {
    const color = this.lightsShadowColor ?? '#080808';
    const strength = this._isShadowTintActive() ? 1 : 0;
    const opacity = this.lightsShadowOpacity ?? 0.25;
    this.materialController?.setShadowTintSettings({ color, strength, opacity });
    if (presentationOnly) {
      this._applyShadowTintPresentation({ color, strength, opacity });
      this.wakeViewportPresentation(2);
      return;
    }
    this.materialController?.reapplyStudioGroundSurfaceShaders(this.groundController);
    if (typeof this.renderer?.compile === 'function' && this.scene && this.camera) {
      try {
        this.renderer.compile(this.scene, this.camera);
      } catch (_) {
        /* ignore compile failures on partial rebuild */
      }
    }
    this.wakeViewportPresentation(8);
  }

  _applyShadowTintPresentation({ color, strength, opacity } = {}) {
    const mc = this.materialController;
    if (!mc) return;
    const tintOpts = {
      color: color ?? '#080808',
      strength: strength ?? 0,
      opacity: opacity ?? 0.25,
      forceRepatch: false,
    };
    if (this.currentModel) {
      mc.applyShadowTintToObject(this.currentModel, tintOpts);
    }
    const ground = this.groundController;
    if (ground?.podium) {
      mc.applyShadowTintToObject(ground.podium, tintOpts);
    }
    if (ground?.backdrop) {
      mc.applyShadowTintToObject(ground.backdrop, {
        ...tintOpts,
        includeStudioBackdrop: true,
      });
    }
    if (ground?.infinityCove?.mesh) {
      mc.applyShadowTintToObject(ground.infinityCove.mesh, {
        ...tintOpts,
        includeStudioBackdrop: true,
      });
    }
  }

  _syncShadowAndGobo({ presentationOnly = false } = {}) {
    this._applyKeyLightGoboShadowOverride();
    this._syncGoboShadowSettings();
    this._syncStudioGroundSurfaces({ presentationOnly });
    this._applyGoboToScene();
    if (this.goboProjection?.enabled) {
      this.goboProjection.syncUniformsOnScene(this._getGoboSceneTargets());
    }
  }

  _getGoboSceneTargets() {
    const ground = this.groundController;
    return {
      model: this.currentModel,
      backdrop: ground?.backdrop ?? null,
      infinityCove: ground?.infinityCove?.mesh ?? null,
      podium: ground?.podium ?? null,
    };
  }

  async setGoboEnabled(enabled, { updateState = true } = {}) {
    const on = !!enabled;
    if (this.goboEnabled === on && this.goboProjection?.enabled === on) {
      if (on) this._syncShadowAndGobo();
      return;
    }
    this.goboEnabled = on;
    this.goboProjection?.setEnabled(on);
    if (updateState) this.stateStore.set('gobo.enabled', on);
    if (on) {
      if (!this.goboProjection?._goboTexture) {
        await this.goboProjection?.setTextureId(this.goboTextureId);
      }
      this._syncShadowAndGobo();
    } else {
      this.goboProjection?.removeFromScene(this._getGoboSceneTargets());
      this._applyKeyLightGoboShadowOverride();
      this._syncStudioGroundSurfaces();
    }
  }

  async setGoboTexture(textureId, { updateState = true } = {}) {
    const nextId = textureId || DEFAULT_GOBO_TEXTURE_ID;
    this.goboTextureId = nextId;
    if (updateState) this.stateStore.set('gobo.texture', nextId);
    await this.goboProjection?.setTextureId(nextId);
    if (this.goboEnabled) {
      this._syncShadowAndGobo();
      this.goboProjection?.syncUniformsOnScene(this._getGoboSceneTargets());
    }
  }

  _applyGoboToScene() {
    if (!this.goboProjection?.enabled) return;
    this.goboProjection.applyToScene(this._getGoboSceneTargets());
  }

  _applyShadowTintToScene() {
    this._syncStudioGroundSurfaces();
  }

  setLightsShadowTwoSided(enabled) {
    const next = !!enabled;
    if (this.lightsShadowTwoSided === next) return;
    this.lightsShadowTwoSided = next;
    if (!this.currentModel) return;
    this.currentModel.traverse((child) => {
      if (!child?.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        if (!mat) return;
        mat.shadowSide = this.lightsShadowTwoSided ? THREE.DoubleSide : null;
      });
    });
  }

  setLightsShadowSettings(settings = {}) {
    const currentState = this.stateStore.getState();
    const cast = settings.castShadows ?? settings.enabled ?? currentState.lightsCastShadows;
    const quality = settings.quality ?? this.lightsShadowQuality;
    const softness = settings.softness ?? this.lightsShadowSoftness;
    const contactOffset = settings.contactOffset ?? this.lightsShadowContactOffset;
    const normalBias = settings.normalBias ?? this.lightsShadowNormalBias;
    const shadowColor = settings.color ?? this.lightsShadowColor;
    const shadowOpacity = settings.opacity ?? this.lightsShadowOpacity;
    const twoSided = settings.twoSided ?? this.lightsShadowTwoSided;

    this.setLightsCastShadows(cast);
    this.setLightsShadowQuality(quality);
    this.setLightsShadowContactOffset(contactOffset);
    this.setLightsShadowNormalBias(normalBias);
    this.setLightsShadowTwoSided(twoSided);
    this.setLightsShadowSoftness(softness);
    this.setLightsShadowColor(shadowColor);
    this.setLightsShadowOpacity(shadowOpacity);
  }

  setLightsAutoRotate(enabled) {
    this.lightsAutoRotate = enabled;
    // When turning off auto-rotate, ensure StateStore is synced with current rotation
    // This prevents "pop" when manually adjusting after auto-rotate stops
    if (!enabled) {
      this.stateStore.set('lightsRotation', this.lightsRotation);
    }
  }

  setSubsurfaceSettings(patch = {}) {
    const cur = this.stateStore.getState().subsurface ?? {};
    this.materialController.setSubsurfaceSettings({
      enabled:
        patch.enabled !== undefined ? !!patch.enabled : cur.enabled ?? false,
      translucency:
        patch.translucency !== undefined ? patch.translucency : cur.translucency ?? 0,
      scatterTint:
        patch.scatterTint !== undefined
          ? patch.scatterTint
          : cur.scatterTint ?? '#ffd4b8',
    });
  }

  applyHdriMood(preset) {
    const style = preset ? HDRI_MOODS[preset] : null;
    this.hdriMood?.apply(style);
  }

  /** Studio flat backdrop — keep GPU clear color, env fallback, Shader Lab, and CSS viewport backing in sync. */
  syncStudioBackgroundColor(color) {
    if (!color) return;
    const hex = String(color).trim();
    this.backgroundController?.setColor(hex);
    this.environmentController?.setFallbackColor(hex);
    this.hdriMood?.setFallbackBackgroundColor(hex);
    this.creativeLookSceneSync?.noteStudioBackgroundColor(hex);
    this._applyStudioViewportBackdropPresentation();
  }

  /** Force Orby black on viewport canvas + WebGL clear during page transitions. */
  presentStudioBackdropDuringTransition() {
    this._applyStudioViewportBackdropPresentation();
  }

  /** Re-apply studio backdrop after transitions complete. */
  flushStudioViewportBackdrop() {
    this._applyStudioViewportBackdropPresentation();
  }

  _applyStudioViewportBackdropPresentation() {
    const hex =
      this.backgroundController?.getColor?.()
      ?? this.stateStore.getState().background
      ?? APP_BACKGROUND;
    const effective = isStudioBackdropTransitionLocked() ? TRANSITION_BACKDROP : hex;
    document.documentElement.style.setProperty('--orby-studio-bg', effective);
    this.backgroundController?.refreshAppearance();
    this.composerLifecycle?.syncRendererClearForSceneBackground?.();
  }

  applyFresnelToModel(root) {
    this.materialController.applyFresnelToModel(root);
  }

  updateDof(settings) {
    const dof = settings ?? this.stateStore.getState().dof;
    const state = this.stateStore.getState();
    const cam = state.camera;
    const zoomAttenuation = this.dofAutofocus?.computeZoomAttenuation(dof) ?? 1;
    const focalLengthMm =
      typeof cam?.lensFocalMm === 'number' && cam.lensFocalMm > 0
        ? cam.lensFocalMm
        : 35;
    const bounds = this.cameraController?.getModelBounds?.();
    const modelViewDepthSpan =
      this.camera && bounds ? computeModelViewDepthSpan(this.camera, bounds) : null;
    this.postPipeline?.updateDof(dof, {
      zoomAttenuation,
      focalLengthMm,
      cameraNear: this.camera?.near,
      cameraFar: this.camera?.far,
      camera: this.camera,
      groundPlaneY: state.gridY,
      groundPlaneEnabled: !!state.groundWire && !!dof?.enabled,
      modelViewDepthSpan,
    });
    this._syncDofFocusPlane(dof);
  }

  _syncDofFocusPlane(dof) {
    const settings = dof ?? this.stateStore.getState().dof;
    const show = !!settings?.showFocusPlane;
    this.dofFocusPlane?.setVisible(show);
    if (show) {
      const focalDepth = this.postPipeline?.bokehPass?.uniforms?.focalDepth?.value;
      this.dofFocusPlane?.update(this.camera, settings?.focus ?? 1.5, {
        near: this.camera?.near,
        far: this.camera?.far,
        focalDepth,
      });
    }
  }

  updateDofFocusPlaneTransform() {
    if (!this.stateStore.getState().dof?.showFocusPlane) return;
    const focalDepth = this.postPipeline?.bokehPass?.uniforms?.focalDepth?.value;
    this.dofFocusPlane?.update(
      this.camera,
      this.stateStore.getState().dof?.focus ?? 1.5,
      {
        near: this.camera?.near,
        far: this.camera?.far,
        focalDepth,
      },
    );
  }

  updateBloom(settings) {
    this.postPipeline?.updateBloom(settings);
    const qualityId = settings?.quality ?? 'medium';
    if (this._bloomQualityApplied !== qualityId) {
      this._bloomQualityApplied = qualityId;
      const size = new THREE.Vector2();
      this.renderer.getSize(size);
      this.syncPostProcessingForLogicalSize(size.x, size.y);
    }
    this.syncAnamorphicBloomFromState();
  }

  /** @returns {import('./render/HistogramController.js').HistogramController | null} */
  ensureHistogramController() {
    if (this.histogramController) return this.histogramController;
    const histogramContainer = document.querySelector('#histogramContainer');
    if (!histogramContainer || !this.renderer) return null;
    this.histogramController = new HistogramController(
      this.renderer,
      this.canvas,
      histogramContainer,
      this.composer,
    );
    return this.histogramController;
  }

  /**
   * Live histogram readback + UI — only allocated while the toggle is on.
   * @param {boolean} enabled
   */
  setHistogramEnabled(enabled) {
    const on = !!enabled;
    if (on) {
      this.ensureHistogramController()?.setEnabled(true);
      return;
    }
    if (this.histogramController) {
      this.histogramController.dispose();
      this.histogramController = null;
    }
    const container = document.querySelector('#histogramContainer');
    if (container) {
      container.classList.toggle('histogram-container--collapsed', true);
      container.classList.toggle('histogram-container--expanded', false);
    }
  }

  updateAmbientOcclusion(settings) {
    const defaults = {
      enabled: false,
      intensity: 3,
      radius: 1,
      quality: 'medium',
      color: '#080808',
    };
    const raw = settings ?? this.stateStore.getState().ambientOcclusion;
    const merged = { ...defaults, ...(raw && typeof raw === 'object' ? raw : {}) };
    const ao = sanitizeAmbientOcclusion(merged) ?? merged;
    const tier = resolveRenderQualityTier(
      this.stateStore.getState().renderQuality,
    );
    this.postPipeline?.updateAmbientOcclusion(ao, tier.forceAmbientOcclusionOff);
    this.backgroundController?.setHdriShadowReceiverAoRadius(ao.radius ?? 1);
    this._syncShadowModesHdriReceiver();
  }

  _syncShadowModesHdriReceiver() {
    const bg = this.backgroundController;
    if (!bg) return;
    const state = this.stateStore.getState();
    bg.setHdriShadowReceiverAoRadius(state.ambientOcclusion?.radius ?? 1);
    this._updateHdriShadowReceiverContact();
  }

  /**
   * Create a large background sphere for proper DOF depth handling
   * @param {string} color - Background color hex string
   * @returns {THREE.Mesh} - Background sphere mesh
   */

  async loadFile(file, options = {}) {
    return this.modelLifecycle.loadFile(file, options);
  }

  async loadFileBundle(files) {
    return this.modelLifecycle.loadFileBundle(files);
  }

  clearModel() {
    this.modelLifecycle.clearModel();
  }

  disposeNode(object) {
    this.modelLifecycle.disposeNode(object);
  }

  setModel(object, animations) {
    this.modelLifecycle.setModel(object, animations);
  }

  /**
   * Apply a user-picked image to FBX mesh materials (Map Slots UI; optional material target).
   * @param {{ slot: string, file: File, materialKey?: string }} payload
   */
  async applyFbxMapSlot(payload = {}) {
    const slot = payload?.slot;
    const file = payload?.file;
    if (!slot || !file || !this.currentModel) return;
    const fbxState = this.stateStore.getState()?.fbxMapSlots;
    if (!fbxState?.enabled) return;
    const materialKey = payload?.materialKey ?? fbxState.activeMaterial ?? null;

    const url = URL.createObjectURL(file);
    try {
      const tex = await this.textureLoader.loadAsync(url);
      tex.userData.orbyFbxUserTexture = true;
      tex.userData.orbyFbxBlobUrl = url;
      this.materialController.applyFbxSlotTexture(slot, tex, {
        materialKey,
        fileName: file.name,
      });
      this.clearMapInspectPreview();
      this.eventBus.emit('scene:fbx-map-applied', { slot, name: file.name, materialKey });
      this.ui?.showToast?.(`Texture applied — ${file.name}`, 3200, { notification: false });
    } catch (err) {
      console.error('FBX map slot load failed', err);
      URL.revokeObjectURL(url);
      this.ui?.showToast?.('Could not load texture');
    }
  }

  /**
   * Match dropped-folder images like `sanyo1body_BaseColor.png` to FBX materials and fill empty Map Slots.
   * @param {Array<{ file: File, path?: string }> | File[]} bundleFiles
   * @param {import('three').Object3D} [object]
   * @returns {Promise<{ applied: number, planned: number }>}
   */
  async autoAssignFbxTexturesFromBundle(bundleFiles, object = this.currentModel) {
    if (!object || !bundleFiles?.length) return { applied: 0, planned: 0 };
    const fbxState = this.stateStore.getState()?.fbxMapSlots;
    if (!fbxState?.enabled) return { applied: 0, planned: 0 };

    const report = analyzeFbxMaterials(object);
    const materialKeys = report.materials.map((entry) => entry.key);
    const plan = buildFbxAutoAssignPlan(
      bundleFiles,
      materialKeys,
      object,
      this.materialController?.originalMaterials,
    );
    if (!plan.length) return { applied: 0, planned: 0 };

    let applied = 0;
    for (const item of plan) {
      const url = URL.createObjectURL(item.file);
      try {
        const tex = await this.textureLoader.loadAsync(url);
        tex.userData.orbyFbxUserTexture = true;
        tex.userData.orbyFbxBlobUrl = url;
        this.materialController.applyFbxSlotTexture(item.slot, tex, {
          materialKey: item.materialKey,
          fileName: item.file.name,
        });
        this.eventBus.emit('scene:fbx-map-applied', {
          slot: item.slot,
          name: item.file.name,
          materialKey: item.materialKey,
        });
        applied += 1;
      } catch (err) {
        console.warn('[Orby] FBX auto-assign texture failed', item.file.name, err);
        URL.revokeObjectURL(url);
      }
    }

    if (applied > 0) {
      this.clearMapInspectPreview();
      this.eventBus.emit('scene:fbx-material-report', {
        report: analyzeFbxMaterials(object),
      });
    }

    return { applied, planned: plan.length };
  }

  clearFbxMapSlot(payload = {}) {
    const slot = payload?.slot;
    if (!slot || !this.currentModel) return;
    const fbxState = this.stateStore.getState()?.fbxMapSlots;
    if (!fbxState?.enabled) return;
    const materialKey = payload?.materialKey ?? fbxState.activeMaterial ?? null;

    this.materialController.clearFbxSlotTexture(slot, { materialKey });
    this.clearMapInspectPreview();
    this.eventBus.emit('scene:fbx-map-cleared', { slot, materialKey });
  }

  setFbxActiveMaterial(materialKey) {
    const key = typeof materialKey === 'string' ? materialKey : '';
    this.stateStore.set('fbxMapSlots.activeMaterial', key);
    this.eventBus.emit('scene:fbx-active-material', { materialKey: key });
  }

  /**
   * @param {string} materialKey
   * @param {{ normalConvention?: string, pbrUvChannel?: number, ormPacking?: string }} patch
   */
  setFbxMaterialTuning(materialKey, patch = {}) {
    const raw = this.stateStore.getState()?.fbxMapSlots;
    const next = setFbxMaterialTuning(raw, materialKey, patch);
    this.stateStore.set('fbxMapSlots', next);
    this.materialController?.applyFbxMapSlotsTuningFromState?.();
    this.eventBus.emit('scene:fbx-tuning-changed', { materialKey, patch });
  }

  applyFbxTuningToAllMaterials(sourceMaterialKey) {
    if (!this.currentModel) return;
    const report = analyzeFbxMaterials(this.currentModel);
    const keys = report.materials.map((entry) => entry.key);
    const raw = this.stateStore.getState()?.fbxMapSlots;
    const next = applyFbxTuningToAllMaterials(raw, keys, sourceMaterialKey);
    this.stateStore.set('fbxMapSlots', next);
    this.materialController?.applyFbxMapSlotsTuningFromState?.();
    this.eventBus.emit('scene:fbx-tuning-changed', { materialKey: sourceMaterialKey, all: true });
  }

  hasFbxImportBundle() {
    return Array.isArray(this._fbxImportBundle) && this._fbxImportBundle.length > 0;
  }

  async rescanFbxMapSlotTextures() {
    if (!this.hasFbxImportBundle()) {
      this.ui?.showToast?.('No folder bundle — drop an FBX with textures in a folder');
      return { applied: 0, planned: 0 };
    }
    const result = await this.autoAssignFbxTexturesFromBundle(this._fbxImportBundle);
    if (result.applied > 0) {
      this.ui?.showToast(`Re-assigned ${result.applied} texture(s) from folder`, 3200, {
        notification: false,
      });
    } else {
      this.ui?.showToast?.('No new textures matched empty slots', 2800, { notification: false });
    }
    this.eventBus.emit('scene:fbx-tuning-changed');
    return result;
  }

  /** After shading/material setup, sync Advanced → Alpha UI from import materials (originalMaterials). */
  _emitAdvancedAlphaPanelVisibility() {
    if (!this.currentModel) return;
    const hasAlphaMaterials =
      this.materialController.modelHasAlphaRelevantMaterials(this.currentModel);
    const hasHeuristicGlass =
      hasAlphaMaterials && this.materialController.modelHasHeuristicGlass(this.currentModel);
    this.eventBus.emit('ui:advanced-alpha-visible', { visible: hasAlphaMaterials });
    this.eventBus.emit('ui:advanced-glass-visible', { visible: hasHeuristicGlass });
  }

  setSvgExtrudeDepth(depth, options = {}) {
    const { updateState = true } = options;
    const numeric = Number(depth);
    const clamped = Number.isFinite(numeric)
      ? Math.max(MIN_EXTRUDE_DEPTH, Math.min(MAX_EXTRUDE_DEPTH, numeric))
      : DEFAULT_EXTRUDE_DEPTH;
    const ok = runSvgExtrudeImporterMutation(
      this,
      () => this.svgExtrudeImporter.setDepth(clamped),
      {
        logLabel: 'update SVG extrusion depth',
        toastOnError: 'Could not update SVG depth',
      },
    );
    if (!ok || !updateState) return;

    this.stateStore.set('svgExtrude.depth', this.svgExtrudeImporter.getDepth());
    this.stateStore.set(
      'svgExtrude.colorDepths',
      sanitizeSvgExtrudeColorDepths(
        this.svgExtrudeImporter.getColorDepths(),
        this.stateStore,
      ),
    );
    if (supportsExtrudeBevel(this.svgExtrudeImporter)) {
      const newDepth = this.svgExtrudeImporter.getDepth();
      const prevBevel = this.stateStore.getState().svgExtrude?.bevelAmount ?? 0;
      const clampedBevel = clampExtrudeBevelAmount(prevBevel, newDepth);
      if (Math.abs(clampedBevel - prevBevel) > 1e-6) {
        this.setSvgExtrudeBevel({ amount: clampedBevel }, { updateState: true });
      } else {
        this.stateStore.set('svgExtrude.bevelAmount', this.svgExtrudeImporter.getBevelAmount());
      }
    }
  }

  setSvgExtrudeNormalAngle(normalAngle) {
    runSvgExtrudeImporterMutation(
      this,
      () => this.svgExtrudeImporter.setNormalAngleDeg(normalAngle),
      {
        logLabel: 'update SVG normal angle',
        toastOnError: 'Could not update SVG angle',
      },
    );
  }

  setSvgExtrudeHardEdgeAngle(hardEdgeAngle) {
    if (typeof this.svgExtrudeImporter?.setHardEdgeAngleDeg !== 'function') {
      return;
    }
    runSvgExtrudeImporterMutation(
      this,
      () => this.svgExtrudeImporter.setHardEdgeAngleDeg(hardEdgeAngle),
      {
        logLabel: 'update extrude hard edge angle',
        toastOnError: 'Could not update hard edge angle',
      },
    );
  }

  setSvgExtrudeBevel(settings = {}, options = {}) {
    const { updateState = true } = options;
    if (!supportsExtrudeBevel(this.svgExtrudeImporter)) return;
    const depth = this.svgExtrudeImporter.getDepth();
    const amount = clampExtrudeBevelAmount(settings.amount, depth);
    const ok = runSvgExtrudeImporterMutation(
      this,
      () => this.svgExtrudeImporter.setBevelSettings({ amount }),
      {
        logLabel: 'update extrude bevel',
        toastOnError: 'Could not update bevel',
      },
    );
    if (!ok || !updateState) return;
    this.stateStore.set('svgExtrude.bevelAmount', this.svgExtrudeImporter.getBevelAmount());
  }

  setFontExtrudeBevelType(type, options = {}) {
    const { updateState = true } = options;
    if (!this.currentModel?.userData?.orbyFontExtrude) return;
    if (!supportsExtrudeBevel(this.svgExtrudeImporter)) return;
    const normalized = normalizeFontBevelType(type);
    const ok = runSvgExtrudeImporterMutation(
      this,
      () => this.svgExtrudeImporter.setBevelSettings({ type: normalized }),
      {
        logLabel: 'update font bevel type',
        toastOnError: 'Could not update bevel type',
      },
    );
    if (!ok || !updateState) return;
    if (typeof this.svgExtrudeImporter.getBevelType === 'function') {
      this.stateStore.set('fontExtrude.bevelType', this.svgExtrudeImporter.getBevelType());
    } else {
      this.stateStore.set('fontExtrude.bevelType', normalized);
    }
  }

  setSvgExtrudeDetail(detail, options = {}) {
    const { updateState = true } = options;
    if (!this.svgExtrudeImporter || typeof this.svgExtrudeImporter.setDetail !== 'function') {
      return;
    }
    const ok = runSvgExtrudeImporterMutation(
      this,
      () => this.svgExtrudeImporter.setDetail(detail),
      {
        logLabel: 'update extrude detail',
        toastOnError: 'Could not update extrusion detail',
      },
    );
    if (!ok || !updateState) return;
    this.stateStore.set('svgExtrude.detail', this.svgExtrudeImporter.getDetail());
  }

  setSvgExtrudeColorDepths(colorDepths = {}, options = {}) {
    const { updateState = true } = options;
    if (!this.currentModel || !this.svgExtrudeImporter || !this.isSvgExtrudeModel) return;
    const sanitized = sanitizeSvgExtrudeColorDepths(colorDepths, this.stateStore);
    if (updateState) {
      this.stateStore.set('svgExtrude.colorDepths', sanitized);
    }
    runSvgExtrudeImporterMutation(
      this,
      () => this.svgExtrudeImporter.setColorDepths(sanitized),
      {
        logLabel: 'update SVG color depths',
        toastOnError: 'Could not update SVG color depths',
      },
    );
  }

  setSvgExtrudeColorDepth({ color, depth } = {}) {
    if (!color) return;
    const numericDepth = Number(depth);
    if (!Number.isFinite(numericDepth)) return;
    const state = this.stateStore.getState();
    const baseDepth = Number(state.svgExtrude?.depth ?? DEFAULT_EXTRUDE_DEPTH);
    const existing = { ...(state.svgExtrude?.colorDepths || {}) };
    const clamped = Math.max(0.01, Math.min(2.0, numericDepth));
    if (Math.abs(clamped - baseDepth) < 0.0001) {
      delete existing[color];
    } else {
      existing[color] = clamped;
    }
    this.setSvgExtrudeColorDepths(existing, { updateState: true });
  }

  setSvgExtrudeColorOffsets(colorOffsets = {}, options = {}) {
    const { updateState = true } = options;
    if (!this.currentModel || !this.svgExtrudeImporter || !this.isSvgExtrudeModel) return;
    const sanitized = sanitizeSvgExtrudeColorOffsets(colorOffsets, this.stateStore);
    if (updateState) {
      this.stateStore.set('svgExtrude.colorOffsets', sanitized);
    }
    runSvgExtrudeImporterMutation(
      this,
      () => this.svgExtrudeImporter.setColorOffsets(sanitized),
      {
        logLabel: 'update SVG color offsets',
        toastOnError: 'Could not update SVG color offsets',
      },
    );
  }

  setSvgExtrudeColorOffset({ color, offset } = {}) {
    if (!color) return;
    const numericOffset = Number(offset);
    if (!Number.isFinite(numericOffset)) return;
    const existing = { ...(this.stateStore.getState().svgExtrude?.colorOffsets || {}) };
    const clamped = Math.max(-1.0, Math.min(1.0, numericOffset));
    if (Math.abs(clamped) < 0.0001) {
      delete existing[color];
    } else {
      existing[color] = clamped;
    }
    this.setSvgExtrudeColorOffsets(existing, { updateState: true });
  }

  setSvgExtrudeFlipDirection(enabled, options = {}) {
    const { updateState = true } = options;
    const flipDirection = !!enabled;
    if (updateState) {
      this.stateStore.set('svgExtrude.flipDirection', flipDirection);
    }
    runSvgExtrudeImporterMutation(
      this,
      () => this.svgExtrudeImporter.setFlipDirection(flipDirection),
      {
        logLabel: 'update SVG extrude direction',
        toastOnError: 'Could not update SVG direction',
      },
    );
  }

  _disposeImportRawCaches() {
    this.importRawByMesh.forEach((geometry) => geometry.dispose());
    this.importRawByMesh.clear();
  }

  _emitImportSmoothingControlsVisibility() {
    const visible = !!this.isImportSmoothingModel;
    this.eventBus.emit('ui:stl-smoothing-visible', { visible });
  }

  _refreshImportSmoothingUi() {
    if (!IMPORT_MESH_SMOOTHING_ENABLED) {
      this.isImportSmoothingModel = false;
      this._emitImportSmoothingControlsVisibility();
      return;
    }
    // Any imported file mesh — SVG/font extrudes use their own normal-angle controls.
    this.isImportSmoothingModel = !!this.currentModel && !this.isSvgExtrudeModel;
    this._emitImportSmoothingControlsVisibility();
  }

  _currentFileIsStl() {
    const name = this.currentFile?.name;
    return typeof name === 'string' && name.toLowerCase().endsWith('.stl');
  }

  _setupImportSmoothingForModel(object) {
    this._disposeImportRawCaches();
    this._refreshImportSmoothingUi();
    if (!IMPORT_MESH_SMOOTHING_ENABLED) return;

    const isStl = modelHasStlImport(object) || this._currentFileIsStl();

    if (isStl && !this.isSvgExtrudeModel) {
      this.stateStore.set('advanced.stlSmoothShading', true);
    }

    if (!this.isImportSmoothingModel || !object) return;

    populateImportRawCache(object, this.importRawByMesh, { tagStl: isStl });

    this.applyImportSmoothingFromState();
  }

  _ensureImportRawCaches() {
    if (!this.currentModel) return;
    const isStl = modelHasStlImport(this.currentModel) || this._currentFileIsStl();
    populateImportRawCache(this.currentModel, this.importRawByMesh, { tagStl: isStl });
  }

  /**
   * Move the mesh pivot to the current bounding-box center. Undoes a prior centering
   * first so extrude / geometry edits can be corrected without reloading.
   * @param {{ showToast?: boolean }} [options]
   */
  recenterPivot(options = {}) {
    if (!this.currentModel || !this.modelRoot) {
      if (options.showToast !== false) {
        this.ui?.showToast?.('Load a model first');
      }
      return false;
    }

    if (this._pivotCenterDelta) {
      undoCenterPivot(this.modelRoot, this.currentModel, this._pivotCenterDelta);
      this._pivotCenterDelta = null;
    }

    const delta = captureAndApplyCenterPivot(this.modelRoot, this.currentModel);
    if (!delta) {
      if (options.showToast !== false) {
        this.ui?.showToast?.('Could not center pivot');
      }
      return false;
    }

    this._pivotCenterDelta = delta;
    this._afterPivotChange();
    if (options.showToast !== false) {
      this.ui?.showToast?.('Pivot centered', 3200, { notification: false });
    }
    return true;
  }

  /**
   * Center imported geometry on modelRoot without preserving authored world offsets.
   * Keeps modelRoot at the studio origin so lights, grid, and camera defaults align.
   * @param {{ showToast?: boolean }} [options]
   */
  centerImportAtStudioOrigin(options = {}) {
    if (!this.currentModel || !this.modelRoot) {
      if (options.showToast !== false) {
        this.ui?.showToast?.('Load a model first');
      }
      return false;
    }

    if (this._pivotCenterDelta) {
      undoCenterPivot(this.modelRoot, this.currentModel, this._pivotCenterDelta);
      this._pivotCenterDelta = null;
    }

    const delta = centerModelGeometryOnRoot(this.modelRoot, this.currentModel);
    if (!delta) {
      if (options.showToast !== false) {
        this.ui?.showToast?.('Could not center import');
      }
      return false;
    }

    this._pivotCenterDelta = delta;
    this._afterPivotChange();
    return true;
  }

  /**
   * Center generated font meshes on the studio origin after live typography offsets.
   * Keeps the text block above the grid with a centered model pivot.
   * @param {{ alignGround?: boolean }} [options]
   */
  finalizeFontModelStudioPlacement(options = {}) {
    if (!isFontExtrudeRevealModel(this.currentModel)) return false;

    if (this._pivotCenterDelta) {
      undoCenterPivot(this.modelRoot, this.currentModel, this._pivotCenterDelta);
      this._pivotCenterDelta = null;
    }

    const delta = centerFontModelGeometryOnRoot(this.modelRoot, this.currentModel);
    if (!delta) return false;

    this._pivotCenterDelta = delta;
    this._afterPivotChange();
    if (options.alignGround) {
      this._cancelGroundGridBottomAlignAnimation();
      // Keep the wireframe grid on the studio floor — text sits slightly above it.
      this._alignGroundAndGridToCurrentModelBottom({
        includePodium: true,
        includeGrid: false,
      });
    }
    return true;
  }

  _afterPivotChange() {
    if (!this.currentModel) return;
    this.currentModel.updateMatrixWorld(true);
    this.modelRoot.updateMatrixWorld(true);
    this.cameraController?.refreshModelBounds(this.currentModel);
    this.updateWireframeOverlayTransforms();
    this.updateUvCheckerOverlayTransforms();
    this.updateNormalViewOverlayTransforms();
    this._syncTransformFromGizmo();
    this.transformControlsTranslate?.updateMatrixWorld?.();
    this.transformControlsRotate?.updateMatrixWorld?.();
    this.transformControlsScale?.updateMatrixWorld?.();
  }

  applyImportSmoothingFromState() {
    if (!IMPORT_MESH_SMOOTHING_ENABLED || !this.isImportSmoothingModel || !this.currentModel) return;

    this._ensureImportRawCaches();

    const advanced = this.stateStore.getState()?.advanced ?? {};
    const angleDeg = advanced.stlSmoothingAngle;

    this.currentModel.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      if (child.userData?.orbySvgExtrude || child.userData?.orbyFontExtrude) return;
      const raw = this.importRawByMesh.get(child.uuid);
      if (!raw) return;
      const smoothShading = !!advanced.stlSmoothShading;
      applyStlNormalSmoothing(child, raw, { smoothShading, angleDeg });
    });

    this.originalGeometryIndices = new WeakMap();
    this.originalGeometryAttributes = new WeakMap();
    this.setReverseNormals(this.reverseNormalsEnabled);
  }

  /** @deprecated Use {@link applyImportSmoothingFromState} */
  applyStlSmoothingFromState() {
    this.applyImportSmoothingFromState();
  }

  /** @param {THREE.BufferGeometry} geometry */
  _updateReverseNormalsGeometryCache(geometry) {
    if (!geometry?.attributes) return;
    const cached = {};
    Object.keys(geometry.attributes).forEach((name) => {
      const attr = geometry.attributes[name];
      if (!attr?.array) return;
      cached[name] = new attr.array.constructor(attr.array);
    });
    this.originalGeometryAttributes.set(geometry, cached);
  }

  /** Keep Advanced → Reverse Normals snapshots aligned after CPU modifier edits. */
  _syncReverseNormalsGeometryCacheFromModel() {
    if (!this.currentModel) return;
    this.currentModel.traverse((child) => {
      if (child.isMesh && child.geometry) {
        this._updateReverseNormalsGeometryCache(child.geometry);
      }
    });
  }

  setReverseNormals(enabled) {
    this.reverseNormalsEnabled = !!enabled;
    if (!this.currentModel) return;
    this.currentModel.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const geometry = child.geometry;
      const attributes = geometry.attributes || {};
      if (!this.originalGeometryAttributes.has(geometry)) {
        const cached = {};
        Object.keys(attributes).forEach((name) => {
          const attr = attributes[name];
          if (!attr?.array) return;
          cached[name] = new attr.array.constructor(attr.array);
        });
        this.originalGeometryAttributes.set(geometry, cached);
      }
      const sourceAttributes = this.originalGeometryAttributes.get(geometry);

      // Restore all attributes from the cached original orientation first.
      Object.keys(sourceAttributes || {}).forEach((name) => {
        const attr = geometry.getAttribute(name);
        const sourceArray = sourceAttributes[name];
        if (!attr?.array || !sourceArray) return;
        attr.array.set(sourceArray);
        attr.needsUpdate = true;
      });

      // Restore index orientation first.
      const indexAttr = geometry.index;
      if (indexAttr?.array) {
        if (!this.originalGeometryIndices.has(geometry)) {
          this.originalGeometryIndices.set(
            geometry,
            new indexAttr.array.constructor(indexAttr.array),
          );
        }
        const originalIndex = this.originalGeometryIndices.get(geometry);
        indexAttr.array.set(originalIndex);
        indexAttr.needsUpdate = true;
      }

      geometry.computeBoundingSphere();

      const applySideForMaterial = (material) => {
        if (!material) return;
        if (!this.originalMaterialSides.has(material)) {
          this.originalMaterialSides.set(material, material.side);
        }
        const originalSide = this.originalMaterialSides.get(material);
        if (this.reverseNormalsEnabled) {
          // Make reversal visually deterministic by flipping face culling mode.
          if (originalSide === THREE.FrontSide) {
            material.side = THREE.BackSide;
          } else if (originalSide === THREE.BackSide) {
            material.side = THREE.FrontSide;
          } else {
            // If source is DoubleSide, pick BackSide so reverse mode is visible.
            material.side = THREE.BackSide;
          }
        } else {
          material.side = originalSide;
        }
        material.needsUpdate = true;
      };

      if (Array.isArray(child.material)) {
        child.material.forEach(applySideForMaterial);
      } else {
        applySideForMaterial(child.material);
      }
    });
  }

  /**
   * After Advanced → Alpha changes material.side, refresh reverse-normals cache.
   */
  refreshMaterialSidesForReverseNormals() {
    if (!this.currentModel) return;
    this.currentModel.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (mat) {
          this.originalMaterialSides.set(mat, mat.side);
        }
      });
    });
    this.setReverseNormals(this.reverseNormalsEnabled);
  }

  /**
   * Reapply material transparency pipeline from state (after user changes Advanced → Alpha).
   */
  applyTransparencyFixFromState() {
    if (!this.currentModel) return;
    try {
      this.syncCreativeLookTransmissionBackdrop();
      this.materialController.reapplyTransparencyPipeline();
      this.refreshMaterialSidesForReverseNormals();
      if (this.scene.environment) {
        const intensity = Math.max(0, this.hdriStrength ?? 0);
        this.updateMaterialsEnvironment(this.scene.environment, intensity);
      }
    } catch (err) {
      console.error('[Orby] Transparency mode update failed:', err);
    }
  }

  /** Re-sync composer RTs + viewport after import (transmission/bloom need full-frame buffers). */
  repairRenderSurfacesAfterModelLoad() {
    const sz = new THREE.Vector2();
    this.renderer.getSize(sz);
    if (sz.x > 0 && sz.y > 0) {
      this.syncPostProcessingForLogicalSize(sz.x, sz.y);
    }
    this.composerLifecycle?.ensureComposerBuffersMatchRenderer();
    this.composerLifecycle?.resetRendererViewportToCanvas();
    this.materialController?.syncImportGltfGlassMaterials?.(undefined, {
      forcePresentation: true,
    });
    if (this.scene.environment) {
      const intensity = Math.max(0, this.hdriStrength ?? 0);
      this.updateMaterialsEnvironment(this.scene.environment, intensity);
    }
  }

  /** Advanced glass opacity + HDRI reflection multiplier (heuristic glass/window meshes). */
  applyGlassAppearanceFromState() {
    if (!this.currentModel) return;
    this.syncCreativeLookTransmissionBackdrop();
    this.materialController.applyGlassAppearanceFromState(this.currentModel);
    this.materialController.applyGlassOrientationFromState(this.currentModel);
    this.refreshMaterialSidesForReverseNormals();
    if (this.scene.environment) {
      const intensity = Math.max(0, this.hdriStrength ?? 0);
      this.updateMaterialsEnvironment(this.scene.environment, intensity);
    }
  }

  setSvgExtrudeSurface(settings = {}, options = {}) {
    const objectSettings = {
      scale: settings.scale,
      strength: settings.strength,
    };
    if (settings.preset !== undefined) {
      objectSettings.preset = settings.preset;
      objectSettings.enabled = settings.preset !== 'none';
    }
    return this.setObjectSurface(objectSettings, options);
  }

  setObjectSurface(settings = {}, options = {}) {
    const { updateState = true } = options;
    const prevMaterial = this.stateStore.peekState()?.material || {};
    const wasActive = isMaterialObjectSurfaceEnabled(prevMaterial);
    let rebuildShadedMaterials = false;
    if (updateState && this.currentModel) {
      const nextMaterial = { ...prevMaterial };
      if (settings.enabled !== undefined) {
        nextMaterial.surfaceEnabled = !!settings.enabled;
      }
      if (settings.preset !== undefined) {
        nextMaterial.surfacePreset = settings.preset;
      }
      const willBeActive = isMaterialObjectSurfaceEnabled(nextMaterial);
      const mode = this.currentShading ?? this.stateStore.peekState().shading;
      rebuildShadedMaterials =
        !wasActive && willBeActive && (mode === 'shaded' || mode === 'clay');
    }

    this.stateStore.batch(() => {
      if (updateState) {
        if (settings.enabled !== undefined) {
          this.stateStore.set('material.surfaceEnabled', !!settings.enabled);
        }
        if (settings.preset !== undefined) {
          this.stateStore.set('material.surfacePreset', settings.preset);
          if (settings.preset !== 'none') {
            this.stateStore.set(
              'material.surfaceLastPreset',
              settings.lastPreset ?? settings.preset,
            );
          }
        }
        if (settings.scale !== undefined) {
          this.stateStore.set('material.surfaceScale', settings.scale);
        }
        if (settings.strength !== undefined) {
          this.stateStore.set('material.surfaceStrength', settings.strength);
        }
        if (settings.lastPreset !== undefined) {
          this.stateStore.set('material.surfaceLastPreset', settings.lastPreset);
        }
      }
      if (this.currentModel && !rebuildShadedMaterials) {
        this.materialController?.reapplySvgExtrudeSurfaceShaders({ silentEligible: true });
      }
    });
    if (!this.currentModel) return;
    if (rebuildShadedMaterials) {
      const mode = this.currentShading ?? this.stateStore.peekState().shading;
      this.setShading(mode);
      return;
    }
    this._presentObjectSurfaceChange();
  }

  /** Repaint immediately after surface shader swaps (idle loop + async normal maps). */
  _presentObjectSurfaceChange() {
    this.materialController?.relinkObjectSurfacePresentation?.();
    this.materialController?.reapplyStudioGroundSurfaceShaders?.(this.groundController);
    this.wakeViewportPresentation(8);
    this.materialController?.deferCreativeLookSurfaceResync?.(() => {
      this.wakeViewportPresentation(4);
    });
  }

  /** Live update face + extrude colors on font-generated meshes (no SVG “color override” toggle). */
  applyFontExtrudeColors(fillHex, extrudeHex) {
    const faceHex = normalizeGlyphFillHex(fillHex);
    const sideHex = normalizeGlyphFillHex(extrudeHex ?? faceHex);
    const importer = this.svgExtrudeImporter;
    if (importer && typeof importer.setTwoToneColors === 'function') {
      importer.setTwoToneColors(faceHex, sideHex);
    } else if (importer && typeof importer.getFillColor === 'function') {
      importer.currentFillColor = faceHex;
      importer.currentExtrudeColor = sideHex;
      importer.currentColorPalette = [faceHex];
    }
    this.materialController?.setFontExtrudeColors?.(faceHex, sideHex);
  }

  /** @deprecated — use {@link applyFontExtrudeColors} */
  applyFontExtrudeFillColor(hex) {
    const extrude =
      this.stateStore.getState()?.fontExtrude?.extrudeColor ?? hex;
    this.applyFontExtrudeColors(hex, extrude);
  }

  setSvgExtrudeColorOverride(settings = {}, options = {}) {
    const { updateState = true } = options;
    const enabled = settings.colorOverride !== undefined
      ? !!settings.colorOverride
      : (settings.enabled !== undefined && settings.availableColors === undefined
        ? !!settings.enabled
        : false);
    const color = normalizeSvgOverrideHex(
      settings.color || settings.overrideColor || DEFAULT_SVG_EXTRUDE_OVERRIDE_COLOR,
    );
    const storedFace = this.stateStore.getState()?.svgExtrude?.overrideColor;
    const extrudeColor = normalizeSvgOverrideHex(
      settings.extrudeColor
        ?? settings.overrideExtrudeColor
        ?? storedFace
        ?? color,
      color,
    );
    if (updateState) {
      this.stateStore.set('svgExtrude.colorOverride', enabled);
      this.stateStore.set('svgExtrude.overrideColor', color);
      this.stateStore.set('svgExtrude.overrideExtrudeColor', extrudeColor);
    }
    this.applySvgExtrudeColors();
  }

  /**
   * Live-recolor SVG extrude meshes from current color state. Global override wins;
   * otherwise per-fill replacements apply, falling back to each mesh's original fill.
   * No geometry rebuild — just material color copies.
   * @param {Record<string, string> | null} [replacementsOverride] transient map for preview
   */
  applySvgExtrudeColors(replacementsOverride = null) {
    if (!this.currentModel || !this.isSvgExtrudeModel) return;
    const svg = this.stateStore.getState().svgExtrude || {};
    const overrideEnabled = !!svg.colorOverride;
    const faceHex = normalizeSvgOverrideHex(svg.overrideColor);
    const extrudeHex = normalizeSvgOverrideHex(svg.overrideExtrudeColor, faceHex);
    const overrideTwoTone = overrideEnabled && fontExtrudeTwoToneActive(faceHex, extrudeHex);
    const overrideColor = new THREE.Color(faceHex);
    const replacements = replacementsOverride || svg.colorReplacements || {};
    const fontState = this.stateStore.getState()?.fontExtrude || {};
    const fontTwoToneFromState = fontExtrudeTwoToneActive(
      fontState.fillColor,
      fontState.extrudeColor,
    );

    if (overrideTwoTone) {
      this.materialController?.setSvgExtrudeOverrideColors?.(faceHex, extrudeHex);
    }

    this.currentModel.traverse((child) => {
      if (!child.isMesh || !child.userData?.orbySvgExtrude) return;
      if (overrideTwoTone && !child.userData?.orbyFontExtrude) return;
      // Font two-tone uses face + extrude pickers — not the SVG per-fill recolor path.
      if (
        !overrideEnabled &&
        child.userData?.orbyFontExtrude &&
        (child.userData.orbyExtrudeTwoTone || fontTwoToneFromState)
      ) {
        return;
      }
      let targetColor;
      if (overrideEnabled) {
        targetColor = overrideColor;
      } else {
        const grouped = child.userData.orbySvgGroupedColor;
        const replacementHex = grouped ? replacements[grouped] : undefined;
        if (replacementHex) {
          targetColor = new THREE.Color(replacementHex);
        } else {
          const baseHex = child.userData.orbySvgBaseColor || '#ffffff';
          const baseLinear = child.userData.orbySvgBaseColorLinear;
          targetColor = (baseLinear && Number.isFinite(baseLinear.r) && Number.isFinite(baseLinear.g) && Number.isFinite(baseLinear.b))
            ? new THREE.Color().setRGB(baseLinear.r, baseLinear.g, baseLinear.b)
            : new THREE.Color(baseHex);
        }
      }
      const originalMaterial = this.materialController.getOriginalMaterial(child);
      const applyColor = (material) => {
        if (!material) return;
        if (Array.isArray(material)) {
          material.forEach((mat) => mat?.color?.copy?.(targetColor));
        } else if (material.color) {
          material.color.copy(targetColor);
        }
      };
      applyColor(originalMaterial);
      applyColor(child.material);
    });
    if (!overrideTwoTone) {
      this.materialController.updateMaterials();
    }
  }

  setSvgExtrudeColorReplacements(colorReplacements = {}, options = {}) {
    const { updateState = true } = options;
    if (!this.currentModel || !this.isSvgExtrudeModel) return;
    const sanitized = sanitizeSvgExtrudeColorReplacements(colorReplacements, this.stateStore);
    if (updateState) {
      this.stateStore.set('svgExtrude.colorReplacements', sanitized);
    }
    this.applySvgExtrudeColors();
  }

  /**
   * Update one fill's recolor. `commit: false` recolors live without writing state
   * (used during native color-picker drag so the per-color shelf doesn't re-render).
   * @param {{ color?: string, replacement?: string, commit?: boolean }} [payload]
   */
  /**
   * Reset one fill back to defaults: clears its per-color depth, position, and recolor.
   * @param {string} color grouped palette hex
   */
  resetSvgExtrudeColor(color) {
    if (!color) return;
    const svg = this.stateStore.getState().svgExtrude || {};
    const depths = { ...(svg.colorDepths || {}) };
    const offsets = { ...(svg.colorOffsets || {}) };
    const replacements = { ...(svg.colorReplacements || {}) };
    delete depths[color];
    delete offsets[color];
    delete replacements[color];
    // Recolor first (state cleared) so the depth/offset rebuilds restore the base fill.
    this.setSvgExtrudeColorReplacements(replacements, { updateState: true });
    this.setSvgExtrudeColorDepths(depths, { updateState: true });
    this.setSvgExtrudeColorOffsets(offsets, { updateState: true });
  }

  setSvgExtrudeColorReplacement({ color, replacement, commit = true } = {}) {
    if (!color) return;
    const state = this.stateStore.getState();
    const palette = state.svgExtrude?.availableColors || [];
    if (!palette.includes(color)) return;
    const existing = { ...(state.svgExtrude?.colorReplacements || {}) };
    const normalized = normalizeSvgExtrudeHexColor(replacement);
    if (!normalized || normalized === normalizeSvgExtrudeHexColor(color)) {
      delete existing[color];
    } else {
      existing[color] = normalized;
    }
    if (commit) {
      this.setSvgExtrudeColorReplacements(existing, { updateState: true });
    } else {
      this.applySvgExtrudeColors(existing);
    }
  }

  fitCameraToObject(object) {
    this.cameraController?.fitCameraToObject(object);
  }

  updateStatsUI(file, object, gltfMetadata = null) {
    const stats = this.diagnosticsController.calculateStats(
      object,
      file,
      gltfMetadata,
      this.cameraController?.getModelBounds(),
    );
    this.ui.updateStats(stats);
  }

  /**
   * Read current transform values from the live model root (gizmo / scene source of truth).
   */
  _readTransformValuesFromModelRoot() {
    if (!this.modelRoot) {
      return {
        scale: 1,
        scaleY: 1,
        scaleZ: 1,
        xOffset: 0,
        yOffset: 0,
        zOffset: 0,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
      };
    }
    return {
      scale: this.modelRoot.scale.x,
      scaleY: this.modelRoot.scale.y,
      scaleZ: this.modelRoot.scale.z,
      xOffset: this.modelRoot.position.x,
      yOffset: this.modelRoot.position.y,
      zOffset: this.modelRoot.position.z,
      rotationX: THREE.MathUtils.radToDeg(this.modelRoot.rotation.x),
      rotationY: THREE.MathUtils.radToDeg(this.modelRoot.rotation.y),
      rotationZ: THREE.MathUtils.radToDeg(this.modelRoot.rotation.z),
    };
  }

  /** Update transform sliders from the live gizmo pose (no stateStore notify). */
  _updateTransformSliderUI() {
    if (!this.modelRoot || !this.ui?.meshControls) return;
    this.ui.meshControls.syncTransformSliders(this._readTransformValuesFromModelRoot());
  }

  /**
   * Commit transform values from gizmo to state/UI (once per drag, not every frame).
   */
  _commitTransformFromGizmo() {
    if (!this.modelRoot) return;

    const values = this._readTransformValuesFromModelRoot();

    this.stateStore.batch(() => {
      this.stateStore.set('scale', values.scale);
      this.stateStore.set('scaleY', values.scaleY);
      this.stateStore.set('scaleZ', values.scaleZ);
      this.stateStore.set('xOffset', values.xOffset);
      this.stateStore.set('yOffset', values.yOffset);
      this.stateStore.set('zOffset', values.zOffset);
      this.stateStore.set('rotationX', values.rotationX);
      this.stateStore.set('rotationY', values.rotationY);
      this.stateStore.set('rotationZ', values.rotationZ);
    });

    this._updateTransformSliderUI();
    this.eventBus.emit('ui:reset-section-touched', 'transform');
  }

  /** @deprecated alias — immediate commit after pivot ops etc. */
  _syncTransformFromGizmo() {
    this._commitTransformFromGizmo();
  }

  setScale(value) {
    this.transformController?.setScaleX(value);
    this._syncScaleGizmoMatrix();
  }

  setScaleY(value) {
    this.transformController?.setScaleY(value);
    this._syncScaleGizmoMatrix();
  }

  setScaleZ(value) {
    this.transformController?.setScaleZ(value);
    this._syncScaleGizmoMatrix();
  }

  _syncScaleGizmoMatrix() {
    if (this.transformControlsScale?.object === this.modelRoot) {
      this.transformControlsScale.updateMatrixWorld();
    }
  }

  /**
   * Apply per-axis scale from gizmo commits or scene settings restore.
   * @param {{ x?: number, y?: number, z?: number }} vector
   */
  setScaleVector(vector) {
    const state = this.stateStore.getState();
    const x = vector?.x ?? state.scale ?? 1;
    const y = vector?.y ?? state.scaleY ?? x;
    const z = vector?.z ?? state.scaleZ ?? x;
    this.transformController?.setScaleVector(x, y, z);
    this._syncScaleGizmoMatrix();
  }

  setXOffset(value) {
    this.transformController?.setXOffset(value);
    // Update transform controls if attached
    if (this.transformControlsTranslate?.object === this.modelRoot) {
      this.transformControlsTranslate.updateMatrixWorld();
    }
  }

  setYOffset(value) {
    this.transformController?.setYOffset(value);
    // Update transform controls if attached
    if (this.transformControlsTranslate?.object === this.modelRoot) {
      this.transformControlsTranslate.updateMatrixWorld();
    }
  }

  setZOffset(value) {
    this.transformController?.setZOffset(value);
    // Update transform controls if attached
    if (this.transformControlsTranslate?.object === this.modelRoot) {
      this.transformControlsTranslate.updateMatrixWorld();
    }
  }

  setRotationX(value) {
    this.transformController?.setRotationX(value);
  }

  setRotationY(value) {
    this.transformController?.setRotationY(value);
  }

  setRotationZ(value) {
    this.transformController?.setRotationZ(value);
  }

  setModifierToggle({ id, enabled } = {}) {
    if (!id) return;
    if (enabled && !isShapeLibraryModel(this.currentModel)) {
      this.stateStore.set(`modifiers.${id}.enabled`, false);
      this.ui?.modifierControls?.sync(this.stateStore.getState());
      return;
    }
    this.applyModifiersFromState();
  }

  setModifierAmount({ id, amount } = {}) {
    if (!id) return;
    const numeric = Number(amount) || 0;
    this.stateStore.set(`modifiers.${id}.enabled`, modifierActiveFromAmount(numeric));
    this.applyModifiersFromState();
  }

  applyModifiersFromState(state) {
    const base = state ?? this.stateStore.getState();
    const snapshot = {
      ...base,
      modifiers: normalizeModifiersState(base.modifiers),
    };
    if (!isShapeLibraryModel(this.currentModel)) {
      return;
    }
    this.modifierController?.applyFromState(snapshot);
    if (this.currentModel) {
      this.currentModel.updateMatrixWorld(true);
    }
    if (this.stateStore.isNotifyDeferred?.()) {
      return;
    }
    this.syncModifiersSceneAfterScrub();
  }

  /** Bounds, shadow contact, overlays — run after modifier slider release. */
  syncModifiersSceneAfterScrub() {
    if (!isShapeLibraryModel(this.currentModel)) return;
    this._syncReverseNormalsGeometryCacheFromModel();
    if (this.currentModel) {
      this.currentModel.updateMatrixWorld(true);
      this.cameraController?.refreshModelBounds(this.currentModel);
      this._updateHdriShadowReceiverContact?.();
      this.updateWireframeOverlayTransforms?.();
      this.updateUvCheckerOverlayTransforms?.();
      this.updateNormalViewOverlayTransforms?.();
    }
    this.ui?.modifierControls?.sync(this.stateStore.getState());
  }

  subdivideModifierMesh() {
    if (!isShapeLibraryModel(this.currentModel)) return;
    const changed = this.modifierController?.subdivideMeshes?.();
    if (!changed) return;
    this._finalizeModifierMeshTopologyChange();
  }

  restoreModifierOriginalMesh() {
    if (!isShapeLibraryModel(this.currentModel)) return;
    const changed = this.modifierController?.restoreOriginalMeshes?.();
    if (!changed) return;
    this._finalizeModifierMeshTopologyChange();
  }

  _finalizeModifierMeshTopologyChange() {
    this.applyModifiersFromState();
    this.syncModifiersSceneAfterScrub();
    const wireframeOn =
      this.stateStore.getState()?.shading === 'wireframe'
      || !!this.stateStore.getState()?.wireframe?.alwaysOn;
    if (wireframeOn) {
      this.updateWireframeOverlay();
    }
    this._refreshViewportAfterOverlayChange?.();
  }

  setShading(mode) {
    const clearReference =
      !!this.stateStore.getState().colorChecker?.rawColors && mode !== 'textures';
    if (clearReference) {
      this.stateStore.set('colorChecker.rawColors', false);
      this._colorCheckerRestoreShading = null;
    }
    this.materialController.setShading(mode);
    this.unlitMode = this.materialController.getUnlitMode();
    if (mode !== 'textures' && this.scene.environment) {
      const intensity = Math.max(0, this.hdriStrength ?? 0);
      this.updateMaterialsEnvironment(this.scene.environment, intensity);
    }
    this._syncShadowAndGobo();
    this.setLightsShadowTwoSided(this.lightsShadowTwoSided);
    // Material instances are recreated when shading changes; reapply reverse mode.
    this.setReverseNormals(this.reverseNormalsEnabled);
    if (isShapeLibraryModel(this.currentModel)) {
      this.applyModifiersFromState();
      const wireframeOn =
        mode === 'wireframe' || !!this.stateStore.getState()?.wireframe?.alwaysOn;
      if (wireframeOn) {
        this.updateWireframeOverlay();
      }
    }
    this._refreshViewportAfterOverlayChange();
    if (clearReference) {
      this.ui?.syncUIFromState?.();
    }
  }

  clearBoneHelpers() {
    this.diagnosticsController.clearBoneHelpers();
  }

  _createAnimationController() {
    return new AnimationController({
      onClipsChanged: (clips) => {
        this.ui.setAnimationClips(clips);
        this.ui.setExportVideoAnimationClips(clips);
        this.ui.syncAnimationReverse(
          this.animationController.playbackReverse,
          !!clips?.length,
        );
        this.ui.syncAnimationClipMode(
          this.animationController.clipPlaybackMode,
          !!clips?.length,
        );
      },
      onPlayStateChanged: (playing) => {
        this.ui.setAnimationPlaying(playing);
        if (playing) this.requestRender();
      },
      onTimeUpdate: (current, duration) =>
        this.ui.updateAnimationTime(current, duration),
      onClipIndexChanged: (index) => this.ui.syncAnimationClipSelect(index),
      onTopBarUpdate: (detail) => this.ui.updateTopBarDetail(detail),
      getFileName: () => this.currentFile?.name ?? 'model.glb',
    });
  }

  _syncAnimationControllerFromState() {
    this.animationController.setClipPlaybackMode(
      this.stateStore.getState().animation?.clipPlaybackMode ?? 'loop',
    );
    this.ui?.syncAnimationClipMode?.(
      this.animationController.clipPlaybackMode,
      false,
    );
    this.ui?.syncAnimationDisplayFps?.(
      this.stateStore.getState().animation?.displayFps ?? 60,
    );
    this.ui?.syncAnimationTimeReference?.(
      this.stateStore.getState().animation?.timeReferenceEnabled ?? false,
    );
  }

  refreshBoneHelpers() {
    this.diagnosticsController.refreshBoneHelpers(this.currentShading);
    this.jointNameLabelsController?.update?.();
  }

  setAnimationShowBones(enabled, { updateUi = true } = {}) {
    if (!this.diagnosticsController) return false;

    const hasSkinned = this.diagnosticsController.hasSkinnedSkeleton();
    const next = !!enabled && hasSkinned;
    this.diagnosticsController.setShowBones(next);
    if (next) {
      const animation = this.stateStore.getState().animation ?? {};
      this.diagnosticsController.setHideMesh(!!animation.hideMesh);
    }
    this.stateStore.set('animation.showBones', next);

    if (updateUi) {
      this.ui.syncAnimationShowBones(next, hasSkinned);
      const animation = this.stateStore.getState().animation ?? {};
      if (!next && animation.showJointNames) {
        this.setAnimationShowJointNames(false, { updateUi: false });
      }
    }

    this.requestRender();
    return next;
  }

  setAnimationShowJointNames(enabled, { updateUi = true } = {}) {
    const hasSkinned = this.diagnosticsController?.hasSkinnedSkeleton?.() ?? false;
    const bonesOn = !!this.diagnosticsController?.showBones;
    const next = !!enabled && hasSkinned && bonesOn;
    this.stateStore.set('animation.showJointNames', next);

    if (updateUi) {
      this.ui.syncAnimationShowJointNames({
        visible: bonesOn,
        enabled: bonesOn,
        checked: next,
      });
    }

    if (!next) {
      this.jointNameLabelsController?.setVisible(false);
    }

    this.requestRender();
    return next;
  }

  setAnimationJointScale(scale, { updateUi = true } = {}) {
    if (!this.diagnosticsController) return 0.5;

    const next = this.diagnosticsController.setJointScale(scale);
    this.stateStore.set('animation.jointScale', next);

    if (updateUi) {
      this.ui.syncAnimationJointScale({ value: next });
    }

    this.requestRender();
    return next;
  }

  setAnimationBoneStrokeWidth(width, { updateUi = true } = {}) {
    if (!this.diagnosticsController) return 2;

    const next = this.diagnosticsController.setBoneStrokeWidth(width);
    this.stateStore.set('animation.boneStrokeWidth', next);

    if (updateUi) {
      this.ui.syncAnimationBoneStroke({ value: next });
    }

    this.requestRender();
    return next;
  }

  setAnimationHideMesh(enabled, { updateUi = true } = {}) {
    if (!this.diagnosticsController) return false;

    const hasSkinned = this.diagnosticsController.hasSkinnedSkeleton();
    const bonesOn = !!this.diagnosticsController.showBones;
    const next = !!enabled && hasSkinned && bonesOn;
    this.diagnosticsController.setHideMesh(next);
    this.stateStore.set('animation.hideMesh', next);

    if (updateUi) {
      this.ui.syncAnimationHideMesh({ checked: next });
    }

    this.requestRender();
    return next;
  }

  setObjectHidden(hidden, { updateUi = true } = {}) {
    const next = !!hidden;
    this.stateStore.set('objectHidden', next);

    if (this.modelRoot) {
      this.modelRoot.visible = !next;
    }
    this._syncTransformControlsForObjectHidden();

    if (updateUi) {
      this.ui.meshControls?.syncHideObjectButton?.({
        hidden: next,
        hasModel: !!this.currentModel,
      });
    }

    this.requestRender();
    return next;
  }

  _syncTransformControlsForObjectHidden() {
    const state = this.stateStore.getState();
    const objectHidden = !!state.objectHidden;

    if (this.transformControlsTranslate) {
      const show = !!state.moveWidgetEnabled && !objectHidden;
      this.transformControlsTranslate.visible = show;
      if (show && this.modelRoot) {
        this.transformControlsTranslate.attach(this.modelRoot);
      }
    }
    if (this.transformControlsRotate) {
      const show = !!state.rotateWidgetEnabled && !objectHidden;
      this.transformControlsRotate.visible = show;
      if (show && this.modelRoot) {
        this.transformControlsRotate.attach(this.modelRoot);
      }
    }
    if (this.transformControlsScale) {
      const show = !!state.scaleWidgetEnabled && !objectHidden;
      this.transformControlsScale.visible = show;
      if (show && this.modelRoot) {
        this.transformControlsScale.attach(this.modelRoot);
      }
    }
  }

  applyCameraPreset(preset) {
    if (this.currentModel) {
      this.currentModel.updateMatrixWorld(true);
      this.cameraController?.refreshModelBounds(this.currentModel);
    }
    this.cameraController?.applyCameraPreset(preset);
  }

  /**
   * Isometric mode locks orbit/pan: camera snaps to RTS-style pose; fisheye and tilt
   * are bypassed until turned off. Focal length (FOV) still applies via syncPerspectiveCameraFovAndLens.
   */
  applyIsometricCamera(rawSettings) {
    const iso = normalizeIsometricState(rawSettings);
    const cc = this.cameraController;

    if (!iso.enabled) {
      cc?.exitIsometricMode?.();
      this.syncPerspectiveCameraFovAndLens();
      this.ui?.applyBlockStates?.(this.stateStore.getState());
      return;
    }

    if (this.cameraAutoOrbit !== 'off') {
      this.stateStore.set('camera.autoOrbit', 'off');
      this.setCameraAutoOrbit('off', { silent: true });
    }
    if (this.cameraHandheld !== 'off') {
      this.stateStore.set('camera.handheld', 'off');
      this.setCameraHandheld('off', { silent: true });
    }

    if (!cc?.isIsometricModeActive?.()) {
      cc?.beginIsometricMode?.();
    }

    const focus = cc?.getModelBounds?.()?.center ?? cc?.getControls?.()?.target;
    if (focus) {
      cc.getControls().target.copy(focus);
    }

    cc?.setIsometricPanUnlocked?.(iso.panUnlocked);
    cc?.applyIsometricAngles(iso.horizontalDeg, iso.verticalDeg, focus);

    this.syncPerspectiveCameraFovAndLens();
    this.ui?.applyBlockStates?.(this.stateStore.getState());
  }

  /**
   * When the shelf panel list is scrolling, pause grain time, lens-flare iTime, and histogram readback.
   */
  setPanelsShelfScrolling(active) {
    const on = !!active;
    if (this.panelsShelfScrolling === on) return;
    this.panelsShelfScrolling = on;
    this.lensFlareController?.setTimeAnimationPaused(on);
  }

  /**
   * Update background sphere position to follow camera
   * This ensures it's always behind everything for proper DOF depth
   */
  _updateBackgroundSphere() {
    this.backgroundController?.updateSpherePosition();
  }

  _syncCreativeLookAsciiPass() {
    this.creativeLookSceneSync?.syncAsciiPass();
  }

  _prepareCreativeLookOpticsFrameUniforms() {
    this.creativeLookSceneSync?.prepareOpticsFrameUniforms();
  }

  applyCreativeLookFromState(creativeLookState, options = {}) {
    return this.creativeLookSceneSync?.applyFromState(creativeLookState, options);
  }

  /**
   * World-space direction from surface toward the 3-point **key** light (for creative toon).
   * Matches shading rig when lights are off — falls back to the shader’s original fixed axis.
   * @param {THREE.Vector3} [out]
   */
  _getCreativeLookKeyLightDir(out) {
    const v = out ?? new THREE.Vector3();
    const lc = this.lightsController;
    const key = lc?.lights?.key;
    if (!key) {
      return v.set(0.35, 0.92, 0.42).normalize();
    }
    const keyOn =
      lc.lightsEnabled !== false &&
      lc.individualProperties?.key?.enabled === true &&
      key.intensity > 1e-6;
    if (!keyOn) {
      return v.set(0.35, 0.92, 0.42).normalize();
    }
    key.getWorldDirection(v);
    return v.negate().normalize();
  }

  /** Studio rig strength for Shader Lab toon / PS2 Crush (tracks lights master + per-light intensity). */
  _getCreativeLookToonLightScalars() {
    const state = this.stateStore?.getState();
    return computeCreativeLookToonLightScalars(this.lightsController, {
      hdriStrength: state?.hdriStrength ?? this.hdriStrength,
      hdriEnabled: state?.hdriEnabled !== false,
    });
  }

  /** Wake the idle-aware render loop, or paint once if the loop is not armed. */
  requestRender() {
    if (!this.isStudioReady) return;
    // Offline export / capture preview — a live composer pass clears gradient capture pins
    // (restoreAfterCapture) and drops the display-graded plate before readback.
    if (this._capturePreviewInFlight || this._suppressResizeForExport) return;
    if (this.renderLoop?.isLoopActive?.()) {
      this.renderLoop.requestFrame();
      return;
    }
    this.render();
  }

  /**
   * Hold the idle render loop for several frames after material/shader edits so WebGL
   * program recompiles paint while the camera is still (orbit damping is not required).
   * @param {number} [frameCount]
   */
  wakeViewportPresentation(frameCount = 8) {
    if (!this.isStudioReady) return;
    const n = Math.max(1, Math.floor(Number(frameCount) || 1));
    this._viewportPresentationFrames = Math.max(this._viewportPresentationFrames, n);
    this.requestRender();
  }

  render() {
    if (!this.isStudioReady || !this.renderer) return;
    if (this._capturePreviewInFlight || this._suppressResizeForExport) return;
    if (this.unlitMode) {
      // Avoid `renderer.render()` to the MSAA canvas — use RenderPass-only composer instead.
      if (this.composer && this.postPipeline) {
        this.postPipeline.pushUnlitPresentation();
        try {
          this.composerLifecycle.renderComposerPass();
        } finally {
          this.postPipeline.popUnlitPresentation();
        }
      } else {
        this.composerLifecycle?.resetRendererViewportToCanvas();
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scene, this.camera);
      }
      return;
    }
    this.autoExposureController?.update(this.unlitMode, {
      burstSample: this.cameraController?.needsContinuousOrbitFrames?.() === true,
      forceSample: !!(this._capturePreviewInFlight || this._suppressResizeForExport),
    });
    // Update lens dirt exposure factor from auto-exposure luminance
    this.lensDirtController?.updateExposureFactor();

    if (this.composer) {
      this.composerLifecycle.renderComposerPass();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  handleResize() {
    if (!this.isStudioReady || !this.renderer) return;
    requestAnimationFrame(() => this._applyViewportSizeFromLayout());
  }

  /** Layout pixels for the studio canvas (not export preset size). */
  _getStudioViewportLayoutSize() {
    const container = this.viewport || this.canvas?.parentElement;
    const containerRect = container?.getBoundingClientRect?.() ?? null;
    const canvasRect = this.canvas?.getBoundingClientRect?.() ?? null;

    const width = containerRect
      ? Math.floor(containerRect.width)
      : Math.floor(canvasRect?.width) || window.innerWidth;
    const height = containerRect
      ? Math.floor(containerRect.height)
      : Math.floor(canvasRect?.height) || window.innerHeight;

    const isFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );

    return {
      width: Math.max(1, isFullscreen ? window.innerWidth : width),
      height: Math.max(1, isFullscreen ? window.innerHeight : height),
    };
  }

  _applyViewportSizeFromLayout() {
    if (this._suppressResizeForExport || !this.isStudioReady || !this.renderer) {
      return;
    }
    const { width: finalWidth, height: finalHeight } = this._getStudioViewportLayoutSize();

    if (finalWidth <= 0 || finalHeight <= 0) {
      return;
    }

    if (
      this.canvas &&
      (this.canvas.style.width !== '100%' || this.canvas.style.height !== '100%')
    ) {
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
    }

    const pr = Math.min(
      window.devicePixelRatio,
      resolveRenderQualityTier(this.stateStore.getState().renderQuality).maxPixelRatio,
    );
    coerceRendererLogicalSize(this.renderer, finalWidth, finalHeight, pr);

    this.camera.aspect = finalWidth / Math.max(1, finalHeight);
    this.syncPerspectiveCameraFovAndLens();
    this.syncPostProcessingForLogicalSize(finalWidth, finalHeight);
    this.backgroundGradientController?.handleResize?.();
    this.backgroundImageController?.handleResize?.();
    this.requestRender();
  }

  async exportImage(settings = {}) {
    const formatId = normalizeImageExportFormat(settings.format);
    const formatMeta = getImageExportFormat(formatId);
    let { transparent = false, size = 2, transparentFraming = 'crop' } = settings;
    transparentFraming = normalizeTransparentFraming(transparentFraming);
    if (transparent && !formatMeta.supportsAlpha) {
      transparent = false;
    }
    if (shouldBlockFisheyePngExport(this.stateStore, { transparent })) {
      showFisheyeTransparentPngExportBlockedAlert(this.ui);
      return;
    }
    if (transparent && !this.currentModel) {
      this.ui?.showToast?.('Load a mesh before exporting image');
      return;
    }

    const studioState = this.stateStore.getState();
    const logical = fullViewportLogicalSize(this.renderer);
    const previewDensity = Math.max(1e-6, this.renderer.getPixelRatio());
    const captureSize = resolvePngExportCaptureSize(
      this.renderer,
      size,
      this.imageExporter?._maxExportPixelArea ?? null,
    );

    // Still-image export uses the lightweight bottom-left load spinner (not the full black video
    // export overlay) so the viewport stays visible for debugging during capture.
    this._suppressResizeForExport = true;
    this.ui?.setLoadSpinnerStatusPrefix?.(`Capturing .${formatId.toUpperCase()}`);
    this.ui?.beginLoadSpinner?.();
    this.ui?.beginLoadSpinnerElapsed?.();
    await deferSpinnerPaint();

    // Dust Field point sprites are sized in absolute framebuffer pixels — keep their on-screen
    // fraction stable by scaling for the export vs viewport framebuffer height (see setter docs).
    const viewportFbHeight = Math.max(1, logical.y * previewDensity);
    const dustCaptureScale = captureSize.height / viewportFbHeight;
    this.materialController?.setDustFieldCaptureScale?.(dustCaptureScale);
    this.imageExporter.setExportViewportReference?.({
      logicalWidth: logical.x,
      logicalHeight: logical.y,
      backingWidth: logical.x * previewDensity,
      backingHeight: logical.y * previewDensity,
      previewDensity,
    });

    try {
      if (transparent) {
        const ok = await this.imageExporter.exportTransparentImage(
          this.currentModel,
          this.currentFile,
          this.cameraController,
          size,
          formatId,
          transparentFraming,
        );
        if (ok) {
          this.ui?.showToast?.(
            `Transparent ${formatMeta.label} exported`,
            3200,
            { notification: false },
          );
        } else {
          this.ui?.showToast?.(`${formatMeta.label} export failed`);
        }
      } else {
        const originalSize = new THREE.Vector2();
        this.renderer.getSize(originalSize);
        const originalPixelRatio = this.renderer.getPixelRatio();
        const cinematicLetterbox219 = !!studioState.camera?.cinematicLetterbox219;

        await this.imageExporter.exportImage(
          this.currentFile,
          originalSize,
          originalPixelRatio,
          size,
          cinematicLetterbox219,
          formatId,
        );
        this.ui?.showToast?.(`${formatMeta.label} exported`, 3200, { notification: false });
      }
    } catch (error) {
      console.error('Image export failed', error);
      if (error instanceof CaptureSizeMismatchError) {
        this.ui?.showToast?.(
          `Export failed — capture size mismatch (${error.debug.readbackW}×${error.debug.readbackH} vs ${error.debug.requestedW}×${error.debug.requestedH})`,
          4800,
          { caution: true },
        );
      } else {
        this.ui?.showToast?.(`${formatMeta.label} export failed`);
      }
    } finally {
      this.materialController?.setDustFieldCaptureScale?.(1);
      this.imageExporter.setExportViewportReference?.(null);
      this.ui?.endLoadSpinner?.();
      this._suppressResizeForExport = false;
      this.handleResize();
    }
  }

  async exportPng(settings = {}) {
    return this.exportImage({ ...settings, format: 'png' });
  }

  async exportSvgSilhouette() {
    if (!this.currentModel) {
      this.ui?.showToast?.('Load a mesh before exporting SVG');
      return;
    }
    return withViewportLoadSpinner(this.ui, 'Exporting SVG', async () => {
      try {
        this.ui?.showToast?.('Exporting SVG silhouette…');
        await this.imageExporter.exportSvgSilhouette(
          this.currentModel,
          this.currentFile,
          this.cameraController,
        );
        this.ui?.uiSounds?.playRenderFinished();
        this.ui?.showToast?.('SVG silhouette exported', 3200, { notification: false });
      } catch (error) {
        console.error('SVG export failed', error);
        this.ui?.showToast?.('SVG export failed');
      }
    });
  }

  async exportSvgColor(settings = {}) {
    if (!this.currentModel) {
      this.ui?.showToast?.('Load a mesh before exporting SVG');
      return;
    }
    const storeCl = this.stateStore?.getState()?.creativeLook ?? {};
    const mcCl = this.materialController?.getCreativeLookSettings?.() ?? {};
    const presetId = normalizeCreativeLookPreset(storeCl.preset ?? mcCl.preset);
    const creativeLookOn = (storeCl.enabled ?? mcCl.enabled) === true;
    const usePixelSvg = creativeLookOn && isScreenPixelCreativeLookPreset(presetId);

    const level =
      settings.detail === 'low' || settings.detail === 'medium' || settings.detail === 'high'
        ? settings.detail
        : 'high';
    const transparent = settings.transparent === true;
    return withViewportLoadSpinner(this.ui, 'Exporting SVG', async () => {
      try {
        this.ui?.showToast?.(usePixelSvg ? 'Exporting pixel SVG…' : 'Exporting SVG (color)…');
        if (usePixelSvg) {
          await this.imageExporter.exportSvgScreenPixel(this.currentFile, presetId, {
            transparent,
          });
        } else {
          await this.imageExporter.exportSvgColor(
            this.currentModel,
            this.currentFile,
            level,
          );
        }
        this.ui?.uiSounds?.playRenderFinished();
        this.ui?.showToast?.(
          usePixelSvg ? 'Pixel SVG exported' : 'SVG (color) exported',
          3200,
          { notification: false },
        );
      } catch (error) {
        console.error('SVG (color) export failed', error);
        this.ui?.showToast?.('SVG export failed');
      }
    });
  }

  async exportSvgGlb() {
    if (!this.currentModel) {
      this.ui?.showToast?.('Load a mesh before exporting GLB');
      return;
    }

    const exportKind = resolveGlbExportKind({
      isSvgExtrudeModel: this.isSvgExtrudeModel,
      creativeLook: this.materialController?.getCreativeLookSettings?.(),
      modelRoot: this.modelRoot,
    });
    if (!exportKind) {
      const hint = isShapeLibraryModel(this.currentModel)
        ? GLB_SHAPE_LIBRARY_EXPORT_UNAVAILABLE_HINT
        : GLB_EXPORT_UNAVAILABLE_HINT;
      this.ui?.showToast?.(hint);
      return;
    }

    return withViewportLoadSpinner(this.ui, 'Exporting GLB', async () => {
      try {
        this.ui?.showToast?.('Exporting .GLB…');
        const sourceName = this.currentFile?.name
          || this.currentAssetMetadata?.assetName
          || (exportKind.mode === 'svg' ? 'svg-extrude' : 'model');
        await this.modelGlbExporter.export({
          modelRoot: this.modelRoot,
          sourceName,
          exportKind,
          getOriginalMaterial: (mesh) => this.materialController?.getOriginalMaterial?.(mesh),
        });
        this.ui?.uiSounds?.playRenderFinished();
        this.ui?.showToast?.('.GLB exported', 3200, { notification: false });
      } catch (error) {
        console.error('GLB export failed', error);
        this.ui?.showToast?.('.GLB export failed');
      }
    });
  }

  async exportVideo(settings = {}) {
    if (this.exportMovementPreview?.isActive?.()) {
      this.exportMovementPreview.stop({ silent: true });
    }
    const exportSettings = this._videoExportSettingsFromUi(settings);
    if (
      exportSettings.format === 'png'
      && shouldBlockFisheyePngExport(this.stateStore, {
        transparent: !!exportSettings.movTransparent,
      })
    ) {
      showFisheyeTransparentPngExportBlockedAlert(this.ui);
      return;
    }
    const resumeRenderLoop = this.renderLoop?.isRunning?.() === true;
    if (resumeRenderLoop) {
      this.renderLoop.stop();
    }
    this._suppressResizeForExport = true;
    try {
      await this.videoExporter?.exportVideo(exportSettings);
    } finally {
      this._suppressResizeForExport = false;
      this.handleResize();
      if (resumeRenderLoop) {
        this.renderLoop.start();
      }
    }
  }

  _repairInteractiveViewportAfterCapture() {
    if (!this.renderer) return;
    const { width, height } = this._getStudioViewportLayoutSize();
    const tier = resolveRenderQualityTier(this.stateStore.getState().renderQuality);
    const pixelRatio = Math.min(window.devicePixelRatio, tier.maxPixelRatio);
    repairInteractiveViewportAfterCapture({
      renderer: this.renderer,
      composer: this.composer,
      logicalWidth: width,
      logicalHeight: height,
      pixelRatio,
      syncPostProcessingForLogicalSize: (w, h) =>
        this.syncPostProcessingForLogicalSize(w, h),
      ensureComposerBuffersMatchRenderer: () =>
        this.composerLifecycle?.ensureComposerBuffersMatchRenderer?.(),
      backgroundController: this.backgroundController,
    });
    this._applyViewportSizeFromLayout();
  }

  _resumeLiveAnimationAfterExportCapture() {
    if (this.exportMovementPreview?.isActive?.()) return;
    this.animationController?.ensureLivePlaybackResumed?.();
    this.renderLoop?.requestFrame?.();
    this.requestRender?.();
  }

  _releaseStuckExportCaptureState() {
    this._capturePreviewInFlight = false;
    this._suppressResizeForExport = false;
    this.ui?.forceClearLoadSpinner?.();
    this.stateStore?.flushDeferredNotify?.();
    this.composer?.clearExportCaptureViewportPin?.();
    this.animationController?.ensureLivePlaybackResumed?.();
    if (this.videoExporter?._captureFeatureSession) {
      this.videoExporter._captureFeatureSession.restore?.();
      this.videoExporter._captureFeatureSession = null;
    }
    if (this.videoExporter) {
      this.videoExporter._exportCaptureSize = null;
    }
  }

  async captureExportPreviewFrame(options = {}) {
    const {
      download = true,
      showThumbnail = false,
      preservePreviewSession = false,
      showSpinner = true,
    } = options;

    if (this._capturePreviewInFlight) {
      return null;
    }

    const resolvedPreviewT = this._resolveExportPreviewScrubT(options);
    const wasPreviewActive = this.exportMovementPreview?.isActive?.();
    if (wasPreviewActive) {
      this.exportMovementPreview.stop({ silent: true });
    }

    const exportSettings = this._videoExportSettingsFromUi();
    if (
      exportSettings.format === 'png'
      && exportSettings.movTransparent
      && shouldBlockFisheyePngExport(this.stateStore, { transparent: true })
    ) {
      showFisheyeTransparentPngExportBlockedAlert(this.ui);
      return;
    }

    const resumeRenderLoop = this.renderLoop?.isRunning?.() === true;
    if (resumeRenderLoop) {
      this.renderLoop.stop();
    }
    this._suppressResizeForExport = true;
    this._capturePreviewInFlight = true;

    const runCapture = async () =>
      this.videoExporter?.capturePreviewFrame(exportSettings, {
        download,
        previewT: resolvedPreviewT,
        showThumbnail,
      });

    try {
      if (showSpinner) {
        return await withViewportLoadSpinner(this.ui, 'Capture preview frame', runCapture);
      }
      return await runCapture();
    } finally {
      this._capturePreviewInFlight = false;
      this._suppressResizeForExport = false;
      this._releaseStuckExportCaptureState();
      this.applyRenderQualitySettings?.();
      this._repairInteractiveViewportAfterCapture();
      this.handleResize();
      if (resumeRenderLoop) {
        this.renderLoop.start();
      }
      if (preservePreviewSession || (wasPreviewActive && resolvedPreviewT > 0)) {
        this.scrubExportVideoPreview(resolvedPreviewT);
      } else {
        this._resumeLiveAnimationAfterExportCapture();
      }
    }
  }

  scrubExportVideoPreview(t, settings = {}) {
    this.exportMovementPreview?.scrub(t, this._videoExportSettingsFromUi(settings));
    this.requestRender();
  }

  resetExportVideoPreview(settings = {}) {
    this.exportMovementPreview?.resetToStart(this._videoExportSettingsFromUi(settings));
    this.requestRender();
  }

  toggleExportVideoPreviewPlay(settings = {}) {
    this.exportMovementPreview?.togglePlay(this._videoExportSettingsFromUi(settings));
    this.requestRender();
  }

  syncExportVideoPreviewSettings(settings = {}) {
    const resolved = this._videoExportSettingsFromUi(settings);
    const preview = this.exportMovementPreview;
    if (!ExportMovementPreview.canPreview(resolved) && preview?.isActive?.()) {
      preview.stop({ silent: true });
    } else if (preview?.updateMeshAnimationSettings?.(resolved)) {
      // Mesh timing / clip options — keep camera drives and orbit lock stable when possible.
    } else {
      preview?.rearm(resolved);
    }
    this.ui?.syncExportPreviewAvailability?.(!!this.currentModel);
  }

  saveExportVideoCameraBookmark() {
    const rotationY = this.stateStore.getState().rotationY;
    if (!this.cameraController?.saveExportFramingBookmark?.({ rotationY })) return;
    this.ui?.setExportVideoCameraBookmarkAvailable?.(true);
    this.ui?.showToast?.('Camera framing saved for this session');
  }

  restoreExportVideoCameraBookmark() {
    const bookmark = this.cameraController?.getExportFramingBookmark?.();
    if (!this.cameraController?.restoreExportFramingBookmark?.()) {
      this.ui?.showToast?.('No saved camera framing');
      return;
    }

    const preview = this.exportMovementPreview;
    const previewActive = preview?.isActive?.();
    const previewProgress = previewActive ? preview.getProgress() : 0;
    preview?.pausePlayback?.();

    if (Number.isFinite(bookmark?.rotationY)) {
      this.setRotationY(bookmark.rotationY);
      this.stateStore.set('rotationY', bookmark.rotationY);
    }

    const tilt = this.cameraController.currentTilt ?? 0;
    const pose = this.cameraController.getPose();
    this.stateStore.batch(() => {
      this.stateStore.set('camera.worldPosition', { ...pose.position });
      this.stateStore.set('camera.distance', pose.distance);
      this.stateStore.set('camera.tilt', tilt);
    });
    this.ui?.renderControls?.syncCameraWorldPose?.(pose);
    this.ui?.syncControls?.(this.stateStore.getState());

    if (previewActive) {
      preview.scrub(previewProgress, this._videoExportSettingsFromUi());
    }

    this.ui?.showToast?.('Camera framing restored');
  }

  _videoExportSettingsFromUi(settings = {}) {
    const video = { ...(this.ui?.exportSettings?.video || {}), ...settings };
    const clipSelect = this.ui?.inputs?.exportMeshAnimationSelect;
    const matchToggle = this.ui?.inputs?.exportMeshMatchDurationToClip;
    const syncToggle = this.ui?.inputs?.exportMeshSyncCameraToDuration;
    if (clipSelect && clipSelect.options.length) {
      const parsed = this.ui?._parseExportMeshAnimationSelectValue?.(clipSelect.value);
      if (parsed) {
        video.meshAnimationsInclude = parsed.include;
        video.meshAnimationClipIndex = parsed.clipIndex;
      }
    }
    if (matchToggle) {
      video.meshMatchDurationToClip = !!matchToggle.checked;
    }
    if (syncToggle) {
      video.meshSyncCameraToDuration = !!syncToggle.checked;
    }
    if (this.ui?.pngExportDirectoryHandle) {
      video.pngOutputDirectoryHandle = this.ui.pngExportDirectoryHandle;
    }
    video.transparentFraming = normalizeTransparentFraming(
      settings.transparentFraming ?? this.ui?.exportSettings?.transparentFraming,
    );
    return video;
  }
}

