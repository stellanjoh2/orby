import * as THREE from 'three';
import { TransformControls } from './vendor/TransformControls.js';
import {
  HDRI_PRESETS,
  HDRI_STRENGTH_UNIT,
  HDRI_MOODS,
  HDRI_CUSTOM_ID,
  getCustomHdriUploadType,
} from './config/hdri.js';
import { arrayBufferToBase64, fileFromEmbeddedAsset } from './utils/binaryAsset.js';
import { withViewportLoadSpinner } from './utils/viewportLoadSpinner.js';
import {
  WIREFRAME_OFFSET,
  WIREFRAME_POLYGON_OFFSET_FACTOR,
  WIREFRAME_POLYGON_OFFSET_UNITS,
  WIREFRAME_OPACITY_VISIBLE,
  WIREFRAME_OPACITY_OVERLAY,
  resolveBloomQualityTier,
  isAnamorphicBloomPipelineActive,
  isCreativeLookViewportPostActive,
  isCreativeLookWatercolourPostActive,
  isCreativeLookGouachePostActive,
  isCreativeLookSketchPostActive,
  isCreativeLookSketchColourPostActive,
  isCreativeLookAscii4PostActive,
  isCreativeLookVectrexPostActive,
  resolveRenderQualityTier,
  isKeyLightOnlyShadowCastingRenderQuality,
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
import { applyStaticAnimationFrameZero } from './render/bakeStaticSkinnedGeometry.js';
import { confirmVoxelHdHighPolyAlert } from './render/voxelHdHighPolyAlert.js';
import { willApplyVoxelHdGeometry } from './mesh/voxelizationMeshAdvice.js';
import {
  computeCreativeLookToonLightScalars,
  creativeLookFlatPostVariant,
  creativeLookMasterHueRadians,
  formatCreativeLookPresetLabel,
  isFlatPostCreativeLookPreset,
  isScreenPixelCreativeLookPreset,
  isVectrexCreativeLookPreset,
  isWatercolourCreativeLookPreset,
  isGouacheCreativeLookPreset,
  isSketchColourCreativeLookPreset,
  isSketchFamilyCreativeLookPreset,
  isSketchCreativeLookPreset,
  isDitherPixelCreativeLookPreset,
  normalizeCreativeLookIntensity,
  normalizeCreativeLookLiftCrush,
  normalizeCreativeLookMasterHue,
  normalizeCreativeLookPatternScale,
  normalizeCreativeLookPreset,
  resolveCreativeLookPresetChoice,
} from './render/CreativeLookMaterials.js';
import {
  creativeLookWatercolourRadius,
} from './render/creativeLookWatercolourArt.js';
import {
  resolveCreativeLookSketchParams,
  SKETCH_PAPER_HEX,
} from './render/creativeLookSketchArt.js';
import { resolveCreativeLookInkParams } from './render/creativeLookInkArt.js';
import { isArtisticCreativeLookPreset } from './render/creativeLookPresetSliders.js';
import { ensureAsciiFontAtlasLoaded } from './render/creativeLookAsciiArt.js';
import { ensureAscii2FontAtlasLoaded } from './render/creativeLookAscii2Art.js';
import { ensureAscii3FontAtlasLoaded } from './render/creativeLookAscii3Art.js';
import { ensureAscii4FontAtlasLoaded } from './render/creativeLookAscii4Art.js';
import { LensFlareController } from './render/LensFlareController.js';
import { keyLightParamsFromLensFlare } from './render/lensFlareKeyLightSync.js';
import { GodRaysController } from './render/GodRaysController.js';
import { AutoExposureController } from './render/AutoExposureController.js';
import { TransformController } from './render/TransformController.js';
import { LensDirtController } from './render/LensDirtController.js';
import { BackgroundController } from './render/BackgroundController.js';
import { BackgroundGradientController } from './render/backgroundGradient/BackgroundGradientController.js';
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
import { normalizeGlyphFillHex } from './import/FontExtrudeImporter.js';
import { VideoExporter } from './render/VideoExporter.js';
import { ExportMovementPreview } from './render/ExportMovementPreview.js';
import { FontTextRevealController, isFontExtrudeRevealModel } from './scene/FontTextRevealController.js';
import { HistogramController } from './render/HistogramController.js';
import { ModelGlbExporter } from './export/ModelGlbExporter.js';
import {
  GLB_EXPORT_UNAVAILABLE_HINT,
  resolveGlbExportKind,
} from './export/resolveGlbExportKind.js';
import { EventManager } from './scene/EventManager.js';
import { RenderLoopController } from './scene/RenderLoopController.js';
import { ComposerLifecycle } from './scene/ComposerLifecycle.js';
import { SceneStateApplier } from './scene/SceneStateApplier.js';
import { ModelLifecycleManager } from './scene/ModelLifecycleManager.js';
import {
  shouldBlockFisheyePngExport,
  showFisheyeTransparentPngExportBlockedAlert,
} from './export/fisheyeExportAlert.js';
import {
  getImageExportFormat,
  normalizeImageExportFormat,
} from './render/imageExportFormats.js';
import {
  supportsExtrudeBevel,
  runSvgExtrudeImporterMutation,
  sanitizeSvgExtrudeColorDepths,
  sanitizeSvgExtrudeColorOffsets,
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
import { createColorCheckerMeshGroup } from './scene/ColorCheckerMesh.js';
import {
  createToggleScaleContext,
  easeOutExpo,
  SCALE_TOGGLE_IN_MS,
  stepToggleScaleAnimation,
} from './scene/toggleScaleAnimation.js';
import { applyLookFilterPreset } from './ui/lookFilterApply.js';
import {
  applyStlNormalSmoothing,
  cloneStlSourceGeometry,
  modelHasStlImport,
} from './import/stlNormalSmoothing.js';
import {
  captureAndApplyCenterPivot,
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
    /** True while the settings shelf `.panels` is being scrolled (drives light FX throttling). */
    this.panelsShelfScrolling = false;
    /** Skip rAF resize while PNG/export pipeline mutates renderer size (avoids composer/canvas mismatch). */
    this._suppressResizeForExport = false;
    this.eventBus.on('ui:panels-scrolling', (payload) => {
      this.setPanelsShelfScrolling(!!payload?.active);
    });

    this.canvas = document.querySelector('#webgl');
    this.viewport = document.querySelector('.viewport');
    this._studioReady = false;
    this._studioBootPromise = null;
    this._studioResizeTeardown = null;

    const initialState = this.stateStore.getState();
    this._initStudioShell(initialState);

    this.renderLoop = new RenderLoopController(this);
    this.eventManager = new EventManager(this);
    this.eventManager.register();
  }

  get isStudioReady() {
    return !!this._studioReady;
  }

  async ensureStudioReady() {
    return ensureStudioActive(this);
  }

  /**
   * Enter the studio with no model (HDRI + controls only) — for text tools / debugging.
   * @param {{ skipSound?: boolean }} [options]
   */
  async enterBlankStudio(options = {}) {
    await this.ui.ensureStudioUiReady();
    await this.ensureStudioReady();
    this.ui.setDropzoneVisible(false);
    await this.syncViewportSize();
    this.startRenderLoop();
    this.ui.updateTitle('Blank canvas');
    this.ui.updateTopBarDetail('No model — generate text or import a file');
    this.ui.revealShelf({ skipSound: options.skipSound !== false });
    this.ui.syncControls(this.stateStore.getState());
    this.ui.showToast('Blank canvas — generate text or import a file', 3200, {
      notification: false,
    });
  }

  async shutdownStudio() {
    return shutdownStudioLifecycle(this);
  }

  /** Lightweight shell — no WebGL until the first model load. */
  _initStudioShell(initialState) {
    this.currentShading = initialState.shading;
    this.autoRotateSpeed = 0;
    this.cameraAutoOrbit = initialState.camera?.autoOrbit ?? 'off';
    this.cameraHandheld = initialState.camera?.handheld ?? 'off';
    /** Suppress mode-change toasts during settings restore / batch apply. */
    this._suppressModeChangeToasts = 0;
    this.lightsMaster = initialState.lightsMaster ?? 0.30;
    this.lightsEnabled = initialState.lightsEnabled ?? true;
    this.lightsRotation = initialState.lightsRotation ?? 0;
    this.lightsAutoRotate = initialState.lightsAutoRotate ?? false;
    this.lightsAutoRotateSpeed = lightsAutoRotateDegreesPerSecond();
    this.currentFile = null;
    this.currentModel = null;
    /** Folder bundle from last `loadFileBundle` — used by Map Slots “Scan folder again”. */
    this._fbxImportBundle = null;
    this.currentAssetMetadata = null;
    this.svgExtrudeImporter = null;
    this.isSvgExtrudeModel = false;
    this.isStlModel = false;
    this.stlRawByMesh = new Map();
    this._pivotCenterDelta = null;
    this.reverseNormalsEnabled = initialState.advanced?.reverseNormals ?? false;
    this.originalGeometryIndices = new WeakMap();
    this.originalGeometryAttributes = new WeakMap();
    this.originalMaterialSides = new WeakMap();
    this.isFirstModelLoad = true;
    /** When true, next `setModel` skips first-load podium/grid bottom snap (.orby restore). */
    this._skipGroundGridAutoAlignOnNextModelLoad = false;
    /** When true, next `setModel` skips the intro camera flight (.orby restore). */
    this._skipCameraFlightOnNextModelLoad = false;
    this.unlitMode = false;
    this.hdriEnabled = initialState.hdriEnabled ?? true;
    this.hdriBackgroundEnabled = initialState.hdriBackground;
    this.hdriBlurriness = initialState.hdriBlurriness ?? 0;
    this.hdriRotation = initialState.hdriRotation ?? 0;
    this.currentHdri = initialState.hdri ?? 'beach';
    this.hdriStrength = Math.min(
      5 * HDRI_STRENGTH_UNIT,
      Math.max(0, initialState.hdriStrength ?? 2),
    );
    this.lightsShadowQuality = normalizeShadowQuality(
      initialState.lightsShadowQuality,
    );
    this.lightsShadowSoftness = Number.isFinite(initialState.lightsShadowSoftness)
      ? initialState.lightsShadowSoftness
      : DEFAULT_LIGHTS_SHADOW_SOFTNESS;
    this.lightsShadowContactOffset = Number.isFinite(
      initialState.lightsShadowContactOffset,
    )
      ? initialState.lightsShadowContactOffset
      : -0.0005;
    this.lightsShadowNormalBias = Number.isFinite(initialState.lightsShadowNormalBias)
      ? initialState.lightsShadowNormalBias
      : 0.01;
    this.lightsShadowTwoSided = !!initialState.lightsShadowTwoSided;
    this.lightsCastShadows = !!initialState.lightsCastShadows;
    this.lightsShadowColor = initialState.lightsShadowColor ?? '#080808';
    this.lightsShadowOpacity = Number.isFinite(initialState.lightsShadowOpacity)
      ? Math.min(1, Math.max(0, initialState.lightsShadowOpacity))
      : 0.25;
    this.goboEnabled = !!initialState.gobo?.enabled;
    this.goboTextureId = initialState.gobo?.texture ?? DEFAULT_GOBO_TEXTURE_ID;
    this.goboSoftness = Number.isFinite(initialState.gobo?.softness)
      ? Math.min(4, Math.max(0, initialState.gobo.softness))
      : DEFAULT_GOBO_SOFTNESS;
    this.goboScale = normalizeStoredGoboScale(
      initialState.gobo?.scale,
      initialState.gobo?.scaleSpace,
    );
    this.goboRotation = Number.isFinite(initialState.gobo?.rotation)
      ? ((initialState.gobo.rotation % 360) + 360) % 360
      : 0;

    this.modelLoader = new ModelLoader();
    this.modelLifecycle = new ModelLifecycleManager(this);
    this.modelGlbExporter = new ModelGlbExporter();
    this.animationController = this._createAnimationController();
    this._syncAnimationControllerFromState();
    this.fontTextRevealController = new FontTextRevealController({
      stateStore: this.stateStore,
      onNeedRender: () => this.render(),
      reapplyMaterialEmissive: () => {
        const emissive = this.stateStore.getState().material?.emissive ?? 0;
        this.materialController.materialSettings.emissive = emissive;
        this.materialController.updateMaterials();
      },
    });

    this._ccToggleCtx = createToggleScaleContext();
    this._baseToggleCtx = createToggleScaleContext();
    this._baseGlassToggleCtx = createToggleScaleContext();
    this._backdropToggleCtx = createToggleScaleContext();
    const bootGround = this.stateStore.getState();
    this._ccToggleCtx.prevEnabled = !!bootGround.colorChecker?.enabled;
    this._baseToggleCtx.prevEnabled = !!bootGround.groundSolid;
    this._baseGlassToggleCtx.prevEnabled = !!(
      bootGround.baseGlassSurface ?? bootGround.podiumReflectMesh ?? false
    );
    this._backdropToggleCtx.prevEnabled = !!bootGround.backdropEnabled;

    this.viewportFramingOverlays = new ViewportFramingOverlays();
    const cam0 = this.stateStore.getState().camera ?? {};
    this.viewportFramingOverlays.syncFromCamera(cam0, {
      letterboxAnimate: false,
      compositionGridAnimate: false,
    });
  }

  /**
   * Fresh #webgl canvas — required after GPU teardown (forceContextLoss poisons the node)
   * and so WebGL init is not attempted while the canvas is display:none.
   */
  _refreshWebglCanvas() {
    const parent =
      this.canvas?.parentElement ?? document.querySelector('.viewport');
    if (!parent) return;
    const next = document.createElement('canvas');
    next.id = 'webgl';
    next.tabIndex = 0;
    if (this.canvas?.isConnected) {
      this.canvas.replaceWith(next);
    } else {
      parent.appendChild(next);
    }
    this.canvas = next;
  }

  async _bootstrapStudio() {
    if (this._studioReady) return;

    try {
    document.documentElement.classList.add('orby-studio-active');
    this._refreshWebglCanvas();

    const initialState = this.stateStore.getState();
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      DEFAULT_CAMERA_NEAR,
      DEFAULT_CAMERA_FAR,
    );
    this.scene.add(this.camera);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      // `true` preserves the drawing buffer for synchronous canvas readbacks; it also tends to
      // cause visible black flashes with EffectComposer + custom shaders on some GPUs/browsers.
      // PNG export uses render-target readback (`ImageExporter`); silhouette flow may still call
      // toDataURL after an explicit render.
      preserveDrawingBuffer: false,
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Disable tone mapping on renderer - we'll apply it as a post-processing pass instead
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMappingExposure = 1;
    // Opaque first, then transparent (back-to-front) — important for glTF glass / blend materials.
    this.renderer.sortObjects = true;

    this.cameraController = new CameraController(this.camera, this.canvas, {
      initialFov: this.camera.fov,
      getFocusPoint: () => {
        const bounds = this.cameraController?.getModelBounds();
        if (bounds?.center) {
          return bounds.center;
        }
        return this.controls?.target?.clone() ?? new THREE.Vector3(0, 1, 0);
      },
      onAltLightRotate: (deltaDegrees) => {
        const currentRotation = this.lightsRotation ?? 0;
        this.setLightsRotation(currentRotation + deltaDegrees, {
          updateUi: false,
        });
      },
      onAltLightRotateEnd: () => {
        this.stateStore.set('lightsRotation', this.lightsRotation);
        this.ui?.setLightsRotation?.(this.lightsRotation);
      },
      onShiftHdriRotate: (deltaDegrees) => {
        const currentRotation = this.hdriRotation ?? 0;
        this.setHdriRotation(currentRotation + deltaDegrees, {
          updateState: false,
          updateUi: false,
        });
      },
      onShiftHdriRotateEnd: () => {
        this.stateStore.set('hdriRotation', this.hdriRotation);
        if (this.ui?.inputs?.hdriRotation) {
          this.ui.inputs.hdriRotation.value = this.hdriRotation;
          this.ui.updateValueLabel('hdriRotation', this.hdriRotation, 'angle');
        }
      },
      onAltLightHeight: (deltaHeight) => {
        // Get current height from lights controller (source of truth)
        if (!this.lightsController) {
          console.warn('lightsController not available for height adjustment');
          return;
        }
        const currentHeight = this.lightsController.lightsHeight ?? 5;
        const newHeight = Math.max(0.1, Math.min(20, currentHeight + deltaHeight));
        // Directly call setHeight on lightsController for immediate update
        this.lightsController.setHeight(newHeight);
      },
      onAltLightHeightEnd: () => {
        // Get current height from lights controller and sync to state/UI
        const currentHeight = this.lightsController?.lightsHeight ?? this.stateStore.getState().lightsHeight ?? 5;
        this.stateStore.batch(() => {
          this.stateStore.set('lightsHeight', currentHeight);
          this._syncDirectionalLightHeightsFromControllerToState();
        });
        this.ui?.syncControls?.(this.stateStore.getState());
      },
      onModelBoundsChanged: (bounds) => {
        this._syncShadowCameraBounds(bounds);
      },
      onPoseChanged: (pose) => {
        this.eventBus.emit('camera:pose-changed', pose);
      },
    });
    this.controls = this.cameraController.getControls();
    this.camera.position.set(0, 1.5, 6);
    this.controls.target.set(0, 1, 0);
    this.controls.update();
    this.cameraController.emitPoseChanged();

    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);
    this.colorCheckerRoot = createColorCheckerMeshGroup();
    this.colorCheckerRoot.visible = false;
    this.colorCheckerRoot.name = 'ColorCheckerRoot';
    this.scene.add(this.colorCheckerRoot);
    /** When Reference colors is on, shading we restore when turning it off (Display mode before Unlit). */
    this._colorCheckerRestoreShading = null;
    /** Re-apply studio backdrop from state when Shader Lab turns on (no longer forces black). */
    this._creativeLookStudioBgSynced = false;
    /** Artistic presets (watercolour / sketch) temporarily use paper-white backdrop. */
    this._creativeLookArtisticPaperBg = false;
    /** Horizontal orbit reference (XZ), reused each frame like LightsController. */
    this._colorCheckerHorizRef = new THREE.Vector3();
    this._colorCheckerTowardCam = new THREE.Vector3();
    this._groundGridBottomAlignRaf = 0;
    this.scene.environmentIntensity = this.hdriStrength;

    // Initialize background controller (manages solid background color independently from HDRI)
    this.backgroundController = new BackgroundController({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      initialColor: initialState.background ?? APP_BACKGROUND,
    });
    this.backgroundGradientController = new BackgroundGradientController({
      renderer: this.renderer,
      scene: this.scene,
      backgroundController: this.backgroundController,
    });
    this.backgroundImageController = new BackgroundImageController({
      renderer: this.renderer,
      scene: this.scene,
      backgroundController: this.backgroundController,
    });
    this.backgroundController.setGradientController(this.backgroundGradientController);
    this.backgroundController.setImageController(this.backgroundImageController);
    this.backgroundGradientController.setConfig(initialState.backgroundGradient ?? {});
    this.backgroundImageController.setConfig(initialState.backgroundImage ?? {});
    this.backgroundController.setSolidEnabled(getBackgroundMode(initialState) === 'solid');

    this.transformController = new TransformController({
      modelRoot: this.modelRoot,
    });

    // Setup TransformControls (widgets) for visual transform editing
    // Create separate controls for translate (move), rotate, and scale
    const WIDGET_SIZE = 1.5; // Unified size for all widgets
    
    this.transformControlsTranslate = new TransformControls(this.camera, this.canvas);
    this.transformControlsTranslate.setMode('translate');
    this.transformControlsTranslate.setSpace('local'); // Use local/object space for move
    this.transformControlsTranslate.setSize(WIDGET_SIZE);
    this.transformControlsTranslate.visible = false;
    this.scene.add(this.transformControlsTranslate);
    
    this.transformControlsRotate = new TransformControls(this.camera, this.canvas);
    this.transformControlsRotate.setMode('rotate');
    this.transformControlsRotate.setSpace('local'); // Use local space so it follows mesh rotation
    this.transformControlsRotate.setSize(WIDGET_SIZE);
    this.transformControlsRotate.visible = false;
    this.scene.add(this.transformControlsRotate);
    
    this.transformControlsScale = new TransformControls(this.camera, this.canvas);
    this.transformControlsScale.setMode('scale');
    this.transformControlsScale.setSpace('local'); // Use local space for scale
    this.transformControlsScale.setSize(WIDGET_SIZE);
    // Ensure all scale axes are enabled
    this.transformControlsScale.showX = true;
    this.transformControlsScale.showY = true;
    this.transformControlsScale.showZ = true;
    this.transformControlsScale.visible = false;
    this.scene.add(this.transformControlsScale);

    this._gizmoDragActive = false;
    
    // Disable OrbitControls when dragging any widget
    const handleGizmoDraggingChanged = (event) => {
      const controls = this.cameraController?.getControls();
      if (controls) {
        controls.enabled = !event.value;
      }
      if (event.value) {
        this._gizmoDragActive = true;
      } else if (this._gizmoDragActive) {
        this._gizmoDragActive = false;
        this._commitTransformFromGizmo();
      }
    };
    
    this.transformControlsTranslate.addEventListener('dragging-changed', handleGizmoDraggingChanged);
    this.transformControlsRotate.addEventListener('dragging-changed', handleGizmoDraggingChanged);
    this.transformControlsScale.addEventListener('dragging-changed', handleGizmoDraggingChanged);
    
    const handleGizmoChange = () => {
      if (this.transformControlsScale.object === this.modelRoot) {
        const avgScale = (
          this.modelRoot.scale.x + this.modelRoot.scale.y + this.modelRoot.scale.z
        ) / 3;
        this.modelRoot.scale.setScalar(avgScale);
      }
      if (this._gizmoDragActive) {
        this._updateTransformSliderUI();
      }
    };
    this.transformControlsTranslate.addEventListener('change', handleGizmoChange);
    this.transformControlsRotate.addEventListener('change', handleGizmoChange);
    this.transformControlsScale.addEventListener('change', handleGizmoChange);

    this.diagnosticsController = new MeshDiagnosticsController({
      scene: this.scene,
      modelRoot: this.modelRoot,
      getLineResolution: () => {
        const canvas = this.renderer?.domElement;
        return {
          width: canvas?.clientWidth || window.innerWidth || 1,
          height: canvas?.clientHeight || window.innerHeight || 1,
        };
      },
    });

    this.topologyWarningsOverlay = new TopologyWarningsOverlay({
      getLineResolution: () => {
        const canvas = this.renderer?.domElement;
        return {
          width: canvas?.clientWidth || window.innerWidth || 1,
          height: canvas?.clientHeight || window.innerHeight || 1,
        };
      },
    });

    this.jointNameLabelsController?.dispose?.();
    this.jointNameLabelsController = new JointNameLabelsController({
      viewport: this.viewport,
      getCamera: () => this.camera,
      getDiagnostics: () => this.diagnosticsController,
      getEnabled: () => !!this.stateStore.getState().animation?.showJointNames,
    });

    this.materialController = new MaterialController({
      stateStore: this.stateStore,
      modelRoot: this.modelRoot,
      getCreativeLookKeyLightDir: (out) => this._getCreativeLookKeyLightDir(out),
      getCreativeLookToonLightScalars: () =>
        this._getCreativeLookToonLightScalars(),
      afterCreativeLookMaterialRebuild: () => {
        this._syncCreativeLookAsciiPass();
        if (this.scene?.environment) {
          this.updateMaterialsEnvironment(
            this.scene.environment,
            Math.max(0, this.hdriStrength),
          );
        }
        this.animationController?.resyncPose?.();
        if (
          typeof this.renderer?.compile === 'function' &&
          this.scene &&
          this.camera
        ) {
          // Defer compile so rapid Shader Lab cycling does not block rAF / input.
          requestAnimationFrame(() => {
            if (!this.renderer || !this.scene || !this.camera) return;
            try {
              this.renderer.compile(this.scene, this.camera);
            } catch (_) {
              /* ignore compile failures on partial rebuild */
            }
          });
        }
      },
      onCreativeLookAsciiSync: () => this._syncCreativeLookAsciiPass(),
      prepareStaticVoxelPose: () => {
        if (!this.currentModel) return;
        applyStaticAnimationFrameZero(this.currentModel, this.animationController);
        this.fontTextRevealController?.snapGlyphsForVoxelization?.();
      },
      restoreStaticVoxelPose: () => {
        this.animationController?.endStaticPoseHold?.();
      },
      onShadingChanged: (mode) => {
        this.currentShading = mode;
        this.diagnosticsController.setModel(this.currentModel, mode);
        this.refreshBoneHelpers();
        this.jointNameLabelsController?.update?.();
        if (this.diagnosticsController.showBones) {
          this.diagnosticsController.refreshGhostMesh();
        }
        // Apply current HDRI environment settings after shading change
        if (this.scene.environment) {
          const intensity = Math.max(0, this.hdriStrength);
          this.updateMaterialsEnvironment(this.scene.environment, intensity);
        }
      },
      onMaterialUpdate: () => {
        this.fontTextRevealController?.onMaterialBaselineChanged?.();
      },
    });

    this.textureLoader = new THREE.TextureLoader();
    this.goboProjection = new GoboProjectionController({
      textureLoader: this.textureLoader,
      getKeyLight: () => this.lightsController?.lights?.key ?? null,
      getProjectionCenter: (out) => {
        const bounds = this.cameraController?.getModelBounds?.();
        if (bounds?.center) return out.copy(bounds.center);
        return out.set(0, 1, 0);
      },
      getProjectionBounds: (out) => {
        out.makeEmpty();
        if (this.currentModel) out.expandByObject(this.currentModel);
        // Backdrop/podium still receive the pattern; frustum follows the mesh so
        // studio backdrop width/scale does not rescale the projected gobo.
        return out;
      },
      getProjectionRadius: () => {
        const bounds = this.cameraController?.getModelBounds?.();
        return Number.isFinite(bounds?.radius) ? Math.max(0.5, bounds.radius) : 3;
      },
    });
    this.goboProjection.setEnabled(this.goboEnabled);
    this.goboProjection.setShadowSettings({
      opacity: this.lightsShadowOpacity,
      color: this.lightsShadowColor,
    });
    this.goboProjection.setGoboSettings({
      softness: this.goboSoftness,
      scale: this.goboScale,
      rotation: this.goboRotation,
    });
    this.goboProjection.setShadowQuality(this.lightsShadowQuality);
    void this.goboProjection.setTextureId(this.goboTextureId);
    this.setupLights();
    this.setupGround();
    this._syncHdriShadowReceiverFromState();
    const bootGround = this.stateStore.getState();
    this._ccToggleCtx.prevEnabled = !!bootGround.colorChecker?.enabled;
    this._baseToggleCtx.prevEnabled = !!bootGround.groundSolid;
    this._baseGlassToggleCtx.prevEnabled = !!(
      bootGround.baseGlassSurface ?? bootGround.podiumReflectMesh ?? false
    );
    this._backdropToggleCtx.prevEnabled = !!bootGround.backdropEnabled;
    this.setupMoodController();
    this.setupEnvironment(initialState);
    this.setupComposer();
    this.autoExposureController = new AutoExposureController({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      exposurePass: this.exposurePass,
      setExposure: (value) => this.postPipeline?.setExposure(value),
      stateStore: this.stateStore,
      onExposureChange: (value) => {
        // Update UI display in real-time when auto-exposure changes exposure
        this.ui?.updateExposureDisplay?.(value);
      },
    });
    this.autoExposureController.init(initialState);
    this.lensDirtController = new LensDirtController({
      lensDirtPass: this.lensDirtPass,
      textureLoader: this.textureLoader,
      stateStore: this.stateStore,
      getAverageLuminance: () => this.autoExposureController?.getAverageLuminance() ?? 0,
      getCurrentExposure: () => this.autoExposureController?.getExposure() ?? 1.0,
    });
    this.lensDirtController.init(initialState);
    this.lensFlareController = new LensFlareController({
      camera: this.camera,
      scene: this.scene,
      stateStore: this.stateStore,
      getCameraAutoOrbit: () => this.cameraAutoOrbit ?? 'off',
    });
    this.lensFlareController.init(initialState, this.hdriEnabled);
    this.lensFlareController.setTimeAnimationPaused(this.panelsShelfScrolling);
    this.godRaysController = new GodRaysController({
      godRaysPass: this.postPipeline.godRaysPass,
      stateStore: this.stateStore,
      getCamera: () => this.camera,
    });
    this.godRaysController.init(initialState);
    this.godRaysController.setHdriEnabled(this.hdriEnabled);

    this.dofAutofocus = new DofAutofocusController({
      getCamera: () => this.camera,
      getCurrentModel: () => this.currentModel,
      getControlsTarget: () => this.cameraController?.controls?.target,
      getModelBounds: () => this.cameraController?.getModelBounds?.(),
      stateStore: this.stateStore,
      eventBus: this.eventBus,
    });
    this.dofAutofocus.resetSmoothFocus(
      this.stateStore.getState().dof?.focus ?? 1.5,
    );

    this.dofFocusPlane = new DofFocusPlaneHelper(this.scene);
    this._syncDofFocusPlane(this.stateStore.getState().dof);
    
    // Histogram is created lazily on first enable (see setHistogramEnabled).
    if (this.stateStore.getState().histogramEnabled) {
      this.setHistogramEnabled(true);
    }

    this.stateApplier = new SceneStateApplier(this);
    this.setupMeshClickDetection();
    this.setupBoneHoverHandler();
    this._attachViewportResizeObserver();

    let resizeTimeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.handleResize();
      }, 16);
    };

    const handleFullscreenChange = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.handleResize();
          this.ui?.syncFullscreenToggle?.();
        });
      });
    };

    window.addEventListener('resize', debouncedResize);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    this._studioResizeTeardown = () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', debouncedResize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };

    await this.applyStateSnapshot(this.stateStore.getState());
    this._studioReady = true;
    // Render loop starts after shelf layout settles (see loadFile / startRenderLoop).
    } catch (error) {
      this._teardownStudioGpu();
      throw error;
    }
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

  _attachViewportResizeObserver() {
    if (typeof ResizeObserver === 'undefined' || !this.viewport) return;
    this._viewportResizeObserver?.disconnect();
    this._viewportResizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this._viewportResizeObserver.observe(this.viewport);
  }

  _teardownStudioGpu() {
    this.renderLoop?.stop();
    this._viewportResizeObserver?.disconnect();
    this._viewportResizeObserver = null;
    this._studioResizeTeardown?.();
    this._studioResizeTeardown = null;

    this.modelLifecycle?.clearModel();
    this.currentFile = null;
    this.isFirstModelLoad = true;
    /** When true, next `setModel` skips first-load podium/grid bottom snap (.orby restore). */
    this._skipGroundGridAutoAlignOnNextModelLoad = false;
    this._skipCameraFlightOnNextModelLoad = false;
    this.ui?.updateTitle?.('Orby');
    this.ui?.updateTopBarDetail?.('');
    this.animationController = this._createAnimationController();
    this._syncAnimationControllerFromState();

    this.meshClickHandler?.detach?.();
    this.boneHoverHandler?.detach?.();

    this.transformControlsTranslate?.dispose?.();
    this.transformControlsRotate?.dispose?.();
    this.transformControlsScale?.dispose?.();
    this.transformControlsTranslate = null;
    this.transformControlsRotate = null;
    this.transformControlsScale = null;

    this.histogramController?.dispose?.();
    this.histogramController = null;
    this.lensFlareController?.dispose?.();
    this.lensFlareController = null;
    this.godRaysController?.dispose?.();
    this.godRaysController = null;
    this.lensDirtController?.dispose?.();
    this.lensDirtController = null;
    this.autoExposureController?.dispose?.();
    this.autoExposureController = null;
    this.environmentController?.dispose?.();
    this.environmentController = null;
    this.groundController?.disposeMeshes?.();
    this.goboProjection?.dispose?.();
    this.goboProjection = null;
    this.backgroundController?.dispose?.();
    this.backgroundController = null;
    this.backgroundGradientController?.dispose?.();
    this.backgroundGradientController = null;
    this.backgroundImageController?.dispose?.();
    this.backgroundImageController = null;
    this.materialController?.clear?.();

    if (this.composer?.renderTarget1) {
      this.composer.renderTarget1.dispose?.();
      this.composer.renderTarget2?.dispose?.();
    }
    this.composer = null;
    this.postPipeline = null;
    this.composerLifecycle = null;
    this.imageExporter = null;
    this.videoExporter = null;
    this.exposurePass = null;
    this.lensDirtPass = null;
    this.fxaaPass = null;

    this.cameraController?.dispose?.();
    this.cameraController = null;
    this.controls = null;

    if (this.renderer) {
      this.renderer.dispose();
    }
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.modelRoot = null;
    this.colorCheckerRoot = null;
    this.clock = null;
    this.diagnosticsController = null;
    this.jointNameLabelsController?.dispose?.();
    this.jointNameLabelsController = null;
    this.materialController = null;
    this.lightsController = null;
    this.lights = null;
    this.groundController = null;
    this.hdriMood = null;
    this.transformController = null;
    this.textureLoader = null;
    this.stateApplier = null;

    this._studioReady = false;
    document.documentElement.classList.remove('orby-studio-active');
  }

  /** @see ViewportFramingOverlays#setCompositionGridOverlayVisible */
  setCompositionGridOverlayVisible(enabled, options) {
    this.viewportFramingOverlays.setCompositionGridOverlayVisible(enabled, options);
  }

  /** @see ViewportFramingOverlays#setCompositionGuidesInverted */
  setCompositionGuidesInverted(inverted) {
    this.viewportFramingOverlays.setCompositionGuidesInverted(inverted);
  }

  /** @see ViewportFramingOverlays#setCinematicLetterbox219Visible */
  setCinematicLetterbox219Visible(enabled, options) {
    this.viewportFramingOverlays.setCinematicLetterbox219Visible(enabled, options);
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
      debugWireframeEnabled: false,
    });
  }

  setupMoodController() {
    this.hdriMood = new HdriMoodController({
      renderer: this.renderer,
      groundController: this.groundController,
      getState: () => this.stateStore.getState(),
      updateBloom: (settings) => this.updateBloom(settings),
      updateGrain: (settings) => this.updateGrain(settings),
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
    this.postPipeline = new PostProcessingPipeline(this.renderer, this.scene, this.camera, {
      getDofDepthProxy: () => this.backgroundController?.getBackgroundSphere?.() ?? null,
    });
    this.composer = this.postPipeline.composer;
    this.lensDirtPass = this.postPipeline.lensDirtPass;
    this.fxaaPass = this.postPipeline.fxaaPass;
    this.exposurePass = this.postPipeline.exposurePass;

    this.composerLifecycle = new ComposerLifecycle({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      composer: this.composer,
      postPipeline: this.postPipeline,
      backgroundController: this.backgroundController,
      getCreativeLookEnabled: () =>
        this.materialController?.getCreativeLookSettings?.()?.enabled === true,
      getTransformControls: () => [
        this.transformControlsTranslate,
        this.transformControlsRotate,
        this.transformControlsScale,
      ].filter(Boolean),
      getGroundGrid: () => this.groundController?.grid ?? null,
      getCreativeLookViewportBloomActive: () => {
        const state = this.stateStore.getState();
        return (
          this.materialController?.getCreativeLookSettings?.()?.enabled === true &&
          isCreativeLookViewportPostActive(state)
        );
      },
      getCreativeLookAsciiActive: () => {
        const state = this.stateStore.getState();
        const cl = state.creativeLook ?? {};
        return cl.enabled === true && isFlatPostCreativeLookPreset(cl.preset);
      },
      getCreativeLookWatercolourActive: () => {
        const state = this.stateStore.getState();
        return isCreativeLookWatercolourPostActive(state);
      },
      getCreativeLookGouacheActive: () => {
        const state = this.stateStore.getState();
        return isCreativeLookGouachePostActive(state);
      },
      getCreativeLookSketchActive: () => {
        const state = this.stateStore.getState();
        return isCreativeLookSketchPostActive(state);
      },
      getCreativeLookVectrexActive: () => {
        const state = this.stateStore.getState();
        return isCreativeLookVectrexPostActive(state);
      },
      getWireframeOverlayMeshes: () =>
        this.materialController?.wireframeOverlayMeshes ?? [],
      getRenderState: () => this.stateStore.peekState(),
      syncPostProcessingForLogicalSize: (w, h) =>
        this.syncPostProcessingForLogicalSize(w, h),
      beforeComposerRender: () => {
        this.backgroundGradientController?.syncToDrawingBuffer?.();
        this.materialController?.syncImportGltfGlassMaterials?.();
        this.lensFlareController?.prepareFrame(this.renderer);
        this.godRaysController?.prepareFrame(this.renderer);
        if (isCreativeLookVectrexPostActive(this.stateStore.getState())) {
          this.postPipeline?.updateCreativeLookVectrex?.({
            time: this.materialController?.getCreativeLookAnimationTime?.() ?? 0,
          });
        }
        if (isCreativeLookSketchPostActive(this.stateStore.getState())) {
          this._prepareCreativeLookSketchFrameUniforms();
        }
        if (isCreativeLookGouachePostActive(this.stateStore.getState())) {
          this._prepareCreativeLookGouacheFrameUniforms();
        }
        if (isCreativeLookAscii4PostActive(this.stateStore.getState())) {
          this.postPipeline?.updateCreativeLookAscii?.({
            time: this.materialController?.getCreativeLookAnimationTime?.() ?? 0,
          });
        }
      },
      onRestoreBloomAfterCreativeLook: () => {
        this.updateBloom(this.stateStore.getState().bloom);
        this.applyRenderQualityVisualOverrides();
      },
    });

    // Initialize image exporter (needs composer)
    this.imageExporter = new ImageExporter({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      composer: this.composer,
      postPipeline: this.postPipeline,
      isLensDistortionActive: () =>
        this.postPipeline?.lensDistortionPass?.enabled === true,
      backgroundController: this.backgroundController,
      syncPostProcessingForLogicalSize: (w, h) =>
        this.syncPostProcessingForLogicalSize(w, h),
      syncPerspectiveProjection: (opts) => this.syncPerspectiveCameraFovAndLens(opts),
      renderComposerPassForExport: (opts) =>
        this.composerLifecycle.renderComposerPassForExport(opts),
      getRenderState: () => this.stateStore.peekState(),
    });

    const szComposer = new THREE.Vector2();
    this.renderer.getSize(szComposer);
    if (szComposer.x > 0 && szComposer.y > 0) {
      this.syncPostProcessingForLogicalSize(szComposer.x, szComposer.y);
    }

    this.videoExporter = new VideoExporter({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      composer: this.composer,
      imageExporter: this.imageExporter,
      backgroundController: this.backgroundController,
      stateStore: this.stateStore,
      ui: this.ui,
      syncPostProcessingForLogicalSize: (w, h) =>
        this.syncPostProcessingForLogicalSize(w, h),
      syncPerspectiveProjection: (opts) => this.syncPerspectiveCameraFovAndLens(opts),
      ensureComposerBuffersMatchRenderer: () =>
        this.composerLifecycle.ensureComposerBuffersMatchRenderer(),
      resetRendererViewportToCanvas: () =>
        this.composerLifecycle.resetRendererViewportToCanvas(),
      prepareComposerCapture: () => this.composerLifecycle.prepareComposerCapture(),
      beforeComposerRender: () => {
        this.backgroundGradientController?.syncToDrawingBuffer?.();
        this.materialController?.syncImportGltfGlassMaterials?.();
        this.lensFlareController?.prepareFrame(this.renderer);
        this.godRaysController?.prepareFrame(this.renderer);
        if (isCreativeLookVectrexPostActive(this.stateStore.getState())) {
          this.postPipeline?.updateCreativeLookVectrex?.({
            time: this.materialController?.getCreativeLookAnimationTime?.() ?? 0,
          });
        }
        if (isCreativeLookSketchPostActive(this.stateStore.getState())) {
          this._prepareCreativeLookSketchFrameUniforms();
        }
        if (isCreativeLookGouachePostActive(this.stateStore.getState())) {
          this._prepareCreativeLookGouacheFrameUniforms();
        }
        if (isCreativeLookAscii4PostActive(this.stateStore.getState())) {
          this.postPipeline?.updateCreativeLookAscii?.({
            time: this.materialController?.getCreativeLookAnimationTime?.() ?? 0,
          });
        }
      },
      renderComposerPassForExport: (opts) =>
        this.composerLifecycle.renderComposerPassForExport(opts),
      setRotationY: (value) => this.setRotationY(value),
      setLightsRotation: (value, opts) => this.setLightsRotation(value, opts),
      setHdriRotation: (value, opts) => this.setHdriRotation(value, opts),
      beginExportCameraDrive: () => this.cameraController?.beginExportCameraDrive?.(),
      applyExportCameraDriveFrame: (t, options) =>
        this.cameraController?.applyExportCameraDriveFrame?.(t, options),
      endExportCameraDrive: (options) => {
        this.cameraController?.endExportCameraDrive?.(options);
        if (this.cameraAutoOrbit !== 'off') {
          this.setCameraAutoOrbit(this.cameraAutoOrbit);
        }
      },
      beginExportFovDrive: () => this.cameraController?.beginExportFovDrive?.(),
      applyExportFovDriveFrame: (t, fovOffset) =>
        this.cameraController?.applyExportFovDriveFrame?.(t, fovOffset),
      endExportFovDrive: (options) => this.cameraController?.endExportFovDrive?.(options),
      beginExportAnimationDrive: (opts) => this.animationController?.beginExportDrive?.(opts),
      applyExportAnimationDriveFrame: (frameIndex, fps) =>
        this.animationController?.applyExportDriveFrame?.(frameIndex, fps),
      endExportAnimationDrive: () => this.animationController?.endExportDrive?.(),
      applyCreativeLookExportFrame: (frameIndex, fps) => {
        const elapsed = frameIndex / Math.max(1, fps);
        this.materialController?.updateCreativeLookTime?.(elapsed);
      },
      applyGrainExportFrame: (frameIndex, fps) => {
        const elapsed = frameIndex / Math.max(1, fps);
        this.postPipeline?.setGrainTimeForExport?.(elapsed);
      },
      beginFontTextRevealExportDrive: () =>
        this.fontTextRevealController?.beginExportDrive?.(this.currentModel),
      applyFontTextRevealExportFrame: (frameIndex, fps) =>
        this.fontTextRevealController?.applyExportFrame?.(frameIndex, fps, this.currentModel),
      endFontTextRevealExportDrive: () =>
        this.fontTextRevealController?.endExportDrive?.(),
      getCurrentModel: () => this.currentModel,
      getCurrentFile: () => this.currentFile,
      getCurrentAssetMetadata: () => this.currentAssetMetadata,
      getHdriBackgroundEnabled: () => this.hdriBackgroundEnabled,
      getAnimationClipCount: () => this.animationController?.animations?.length ?? 0,
      getAnimationClipLabel: (index) => {
        const clip = this.animationController?.animations?.[index];
        return clip?.name || (clip ? `Clip ${index + 1}` : null);
      },
      getFontTextRevealExportLabel: () => {
        const model = this.currentModel;
        const controller = this.fontTextRevealController;
        if (!isFontExtrudeRevealModel(model) || !controller?.isEnabled?.()) return null;
        const type = controller.getRevealType?.();
        const unit = controller.getRevealUnit?.();
        const duration = controller.getDurationSec?.();
        const parts = ['On'];
        if (type) parts.push(type);
        if (unit) parts.push(unit);
        if (Number.isFinite(duration) && duration > 0) parts.push(`${duration}s`);
        return parts.join(' · ');
      },
      handleResize: () => this.handleResize(),
    });

    this.exportMovementPreview = new ExportMovementPreview({
      stateStore: this.stateStore,
      ui: this.ui,
      setRotationY: (value) => this.setRotationY(value),
      setLightsRotation: (value, opts) => this.setLightsRotation(value, opts),
      setHdriRotation: (value, opts) => this.setHdriRotation(value, opts),
      getHdriRotation: () => this.hdriRotation ?? 0,
      getCurrentModel: () => this.currentModel,
      getAnimationClipCount: () => this.animationController?.animations?.length ?? 0,
      beginExportCameraDrive: () => this.cameraController?.beginExportCameraDrive?.(),
      applyExportCameraDriveFrame: (t, options) =>
        this.cameraController?.applyExportCameraDriveFrame?.(t, options),
      endExportCameraDrive: (options) => {
        this.cameraController?.endExportCameraDrive?.(options);
        if (this.cameraAutoOrbit !== 'off') {
          this.setCameraAutoOrbit(this.cameraAutoOrbit);
        }
      },
      beginPreviewViewportLock: () => this.cameraController?.beginPreviewViewportLock?.(),
      endPreviewViewportLock: () => this.cameraController?.endPreviewViewportLock?.(),
      beginExportFovDrive: () => this.cameraController?.beginExportFovDrive?.(),
      applyExportFovDriveFrame: (t, fovOffset) =>
        this.cameraController?.applyExportFovDriveFrame?.(t, fovOffset),
      endExportFovDrive: (options) => this.cameraController?.endExportFovDrive?.(options),
      beginExportAnimationDrive: (opts) => this.animationController?.beginExportDrive?.(opts),
      applyExportAnimationDriveTime: (exportTimeSec) =>
        this.animationController?.applyExportDriveTime?.(exportTimeSec),
      endExportAnimationDrive: () => this.animationController?.endExportDrive?.(),
      beginFontTextRevealExportDrive: () =>
        this.fontTextRevealController?.beginExportDrive?.(this.currentModel),
      applyFontTextRevealExportTime: (exportTimeSec) =>
        this.fontTextRevealController?.applyExportTime?.(exportTimeSec, this.currentModel),
      endFontTextRevealExportDrive: () =>
        this.fontTextRevealController?.endExportDrive?.(),
      onActiveChange: (active) => {
        this.ui?.setExportVideoPreviewActive?.(active);
        this.ui?.setExportPreviewBannerVisible?.(active);
        if (!active) {
          this.ui?.setExportPreviewPlaying?.(false);
          this.ui?.updateExportPreviewTimeline?.(0, this._exportPreviewDurationSec(), {
            fromPlayback: true,
          });
        }
      },
      onProgressChange: ({ currentSec, durationSec, playing }) => {
        this.ui?.setExportPreviewPlaying?.(playing);
        this.ui?.updateExportPreviewTimeline?.(currentSec, durationSec, {
          fromPlayback: true,
        });
      },
    });
  }

  _exportPreviewDurationSec() {
    const allowed = [5, 10, 15];
    const duration = this.ui?.exportSettings?.video?.durationSec;
    return allowed.includes(duration) ? duration : 5;
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
    this.syncPerspectiveCameraFovAndLens();
  }

  /**
   * Keeps Three.js vertical FOV and the lens-distortion pass in lockstep (same as the
   * de Carpentier WebGL sample) so the warped sample stays inside the render and avoids
   * black edges. When fisheye is off, uses `camera.fov` from state.
   */
  syncPerspectiveCameraFovAndLens(options = {}) {
    if (!this.camera?.isPerspectiveCamera) return;
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

    // Keep the chart at the mesh’s vertical level when we have bounds — orbit-target Y (pans) won’t yank it as much.
    const bounds = this.cameraController?.getModelBounds();
    const baseY =
      bounds?.center && bounds?.box && !bounds.box.isEmpty() ? bounds.center.y : anchor.y;

    this.colorCheckerRoot.position.set(
      anchor.x + orbitDir.x * d,
      baseY + h,
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

    const sc = Math.max(0.01, Math.min(20, cc.scale ?? defaults.scale));
    this.colorCheckerRoot.scale.setScalar(sc * animMul);
  }

  /** Ground solid / podium — same scale curves as Reference colors (see toggleScaleAnimation.js). */
  _updateBaseAppearAnimation() {
    const gc = this.groundController;
    const root = gc?.podiumRoot;
    const solid = gc?.podium;
    if (!root || !solid) return;

    const st = this.stateStore.getState();
    const groundSolid = !!st.groundSolid;
    const glassOn = !!(
      st.baseGlassSurface ?? st.podiumReflectMesh ?? false
    );
    const r = stepToggleScaleAnimation(
      this._baseToggleCtx,
      performance.now(),
      groundSolid,
    );

    const baseAnimating =
      this._baseToggleCtx.phase === 'in' || this._baseToggleCtx.phase === 'out';
    const glassAnimating =
      this._baseGlassToggleCtx.phase === 'in' || this._baseGlassToggleCtx.phase === 'out';
    root.visible = groundSolid || glassOn || baseAnimating || glassAnimating;

    solid.scale.setScalar(r.animMul);

    if (groundSolid || baseAnimating) {
      solid.visible = r.visible;
      if (solid.material) {
        solid.material.visible =
          r.visible && (groundSolid || this._baseToggleCtx.phase === 'out');
      }
    } else if (glassOn) {
      solid.visible = false;
      if (solid.material) solid.material.visible = false;
    } else {
      solid.visible = r.visible;
      if (solid.material) solid.material.visible = true;
    }
  }

  /** Base glass on the base top — same shared scale curves as base toggles. */
  _updateBaseGlassAppearAnimation() {
    const reflector = this.groundController?.podiumReflector;
    const st = this.stateStore.getState();
    const glassOn = !!(
      st.baseGlassSurface ?? st.podiumReflectMesh ?? false
    );

    if (!reflector) {
      this._baseGlassToggleCtx.prevEnabled = glassOn;
      return;
    }

    const r = stepToggleScaleAnimation(
      this._baseGlassToggleCtx,
      performance.now(),
      glassOn,
    );
    reflector.visible = r.visible;
    reflector.scale.setScalar(r.animMul);
    if (
      !glassOn &&
      !r.visible &&
      this._baseGlassToggleCtx.phase === 'idle' &&
      this.groundController?.podiumReflector
    ) {
      this.groundController.disposeBaseReflector();
    }
  }

  _updateBackdropAppearAnimation() {
    const backdrop = this.groundController?.backdrop;
    if (!backdrop) return;
    const enabled = !!this.stateStore.getState().backdropEnabled;
    const r = stepToggleScaleAnimation(
      this._backdropToggleCtx,
      performance.now(),
      enabled,
    );
    this.groundController?.setBackdropAnimationState(r.animMul, r.visible);
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
    this.backgroundGradientController?.syncToDrawingBuffer?.();
    this.handleResize();
    this.updateDof(state.dof);
    this.updateBloom(state.bloom);
    this.updateAmbientOcclusion(state.ambientOcclusion);
    this.applyRenderQualityVisualOverrides();
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
      if (!options.suppressSuccessToast) {
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
        if (blur > 0) {
          mat.roughness = Math.min(1, baseR + (1 - baseR) * blur);
        } else {
          mat.roughness = baseR;
        }
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

  setLensFlareEnabled(enabled) {
    this.lensFlareController?.setEnabled(enabled);
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

  setLensFlareColor(value) {
    this.lensFlareController?.setColor(value);
  }

  setLensFlareQuality(mode) {
    this.lensFlareController?.setQuality(mode);
  }

  setLensFlareHaloIntensity(value) {
    this.lensFlareController?.setHaloIntensity(value);
  }

  setLensFlareStreakLength(value) {
    this.lensFlareController?.setStreakLength(value);
  }

  setLensFlareSunDiscScale(value) {
    this.lensFlareController?.setSunDiscScale(value);
  }

  setLensFlareSunDiscBlur(value) {
    this.lensFlareController?.setSunDiscBlur(value);
  }

  setLensFlareSunDiscColor(value) {
    this.lensFlareController?.setSunDiscColor(value);
  }

  setLensFlareDiscGlowIntensity(value) {
    this.lensFlareController?.setDiscGlowIntensity(value);
  }

  setLensFlareDiscGlowSize(value) {
    this.lensFlareController?.setDiscGlowSize(value);
  }

  setLensFlareDiscGlowColor(value) {
    this.lensFlareController?.setDiscGlowColor(value);
  }

  setGodRaysEnabled(enabled) {
    this.godRaysController?.setEnabled(enabled);
  }

  setGodRaysColor(value) {
    this.godRaysController?.setColor(value);
  }

  setGodRaysLightScale(value) {
    this.godRaysController?.setLightScale(value);
  }

  setGodRaysOpacity(value) {
    this.godRaysController?.setOpacity(value);
  }

  setGodRaysDensity(value) {
    this.godRaysController?.setDensity(value);
  }

  setGodRaysDecay(value) {
    this.godRaysController?.setDecay(value);
  }

  setGodRaysWeight(value) {
    this.godRaysController?.setWeight(value);
  }

  setGodRaysExposure(value) {
    this.godRaysController?.setExposure(value);
  }

  setGodRaysClampMax(value) {
    this.godRaysController?.setClampMax(value);
  }

  setGodRaysBlur(enabled) {
    this.godRaysController?.setBlur(enabled);
  }

  setLensFlareSpinDuringOrbit(enabled) {
    this.stateStore.set('lensFlare.spinDuringOrbit', !!enabled);
    this.lensFlareController?.setSpinDuringOrbit(enabled);
  }

  /** @deprecated Legacy presets — maps to opacity. */
  setGodRaysStrength(value) {
    this.godRaysController?.setStrength(value);
  }

  /** @deprecated Legacy presets — maps to density. */
  setGodRaysLength(value) {
    this.godRaysController?.setLength(value);
  }

  /** @deprecated Legacy presets — maps to decay. */
  setGodRaysSoftness(value) {
    this.godRaysController?.setSoftness(value);
  }

  /** @deprecated No-op (pmndrs has no threshold). */
  setGodRaysThreshold() {}

  setGodRaysQuality(value) {
    this.godRaysController?.setQuality(value);
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

  setContrast(value) {
    this.postPipeline?.setContrast(value);
  }


  setSaturation(value) {
    this.postPipeline?.setSaturation(value);
  }

  setClarity(value) {
    this.postPipeline?.setClarity(value);
  }

  setFade(value) {
    this.postPipeline?.setFade(value);
  }

  setSharpness(value) {
    this.postPipeline?.setSharpness(value);
  }

  setToneCurve(curve) {
    this.postPipeline?.setToneCurve(curve);
  }

  setTemperature(kelvin) {
    this.postPipeline?.setTemperature(kelvin);
  }

  setTint(value) {
    this.postPipeline?.setTint(value);
  }

  setHighlights(value) {
    this.postPipeline?.setHighlights(value);
  }

  setShadows(value) {
    this.postPipeline?.setShadows(value);
  }

  setVignette(value) {
    this.postPipeline?.setVignette(value);
  }

  setVignetteColor(color) {
    this.postPipeline?.setVignetteColor(color);
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

  setToneMapping(value) {
    this.postPipeline?.setToneMapping(value);
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

  setClaySettings(patch) {
    this.materialController.setClaySettings(patch);
  }

  setWireframeSettings(patch) {
    this.materialController.setWireframeSettings(patch);
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
      return;
    }
    void withViewportLoadSpinner(this.ui, 'Loading UV checker', async () => {
      overlay.setEnabled(true, false);
      await overlay.rebuildAsync();
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
    });
  }

  setNormalViewEnabled(enabled) {
    const on = !!enabled;
    this.stateStore.set('advanced.normalView', on);
    const overlay = this.materialController?.normalViewOverlay;
    if (!overlay) return;
    if (!on) {
      overlay.setEnabled(false);
      return;
    }
    void withViewportLoadSpinner(this.ui, 'Loading normal view', async () => {
      overlay.setEnabled(true, false);
      await overlay.rebuildAsync();
    });
  }

  setNormalViewMode(mode) {
    const allowed = ['geometry', 'tangent'];
    const safe = allowed.includes(mode) ? mode : 'geometry';
    this.stateStore.set('advanced.normalViewMode', safe);
    const overlay = this.materialController?.normalViewOverlay;
    if (!overlay) return;
    if (!overlay.enabled) {
      overlay.setMode(safe, false);
      return;
    }
    void withViewportLoadSpinner(this.ui, 'Loading normal view', async () => {
      overlay.setMode(safe, false);
      await overlay.rebuildAsync();
    });
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
  }

  clearMapInspectPreview() {
    this.materialController?.mapInspectPreview?.clear();
  }

  setGroundSolid(enabled) {
    this.groundController?.setSolidEnabled(enabled);
    this.backgroundController?.setGroundSolid(!!enabled);
    this._syncShadowCameraBounds();
    this._updateBaseAppearAnimation();
    this._updateBaseGlassAppearAnimation();
    this.ui?.applyBlockStates?.(this.stateStore.getState());
  }

  setGroundWire(enabled) {
    this.groundController?.setWireEnabled(enabled);
  }

  setGroundSolidColor(color) {
    this.groundController?.setSolidColor(color);
  }

  setGroundWireColor(color) {
    this.groundController?.setWireColor(color);
  }

  setGroundWireOpacity(value) {
    this.groundController?.setWireOpacity(value);
  }

  setAutoRotateSpeed(speed, { silent = false } = {}) {
    const next = Number(speed) || 0;
    if (next === this.autoRotateSpeed) return;
    this.autoRotateSpeed = next;
    if (!silent && this._suppressModeChangeToasts === 0) {
      this.ui?.showModeChangeToast?.('autoRotate', next);
    }
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
    this.groundController?.setGroundY(value);
    this.backgroundController?.setGroundY(value);
    this._updateHdriShadowReceiverContact();
    this._syncShadowCameraBounds();
  }

  setGridY(value) {
    this.groundController?.setGridY(value);
  }

  /**
   * Align podium + grid Y to the current model bottom without forcing visibility changes.
   * Used for first-load QoL so toggling them on starts at the correct vertical placement.
   */

  _alignGroundAndGridToCurrentModelBottom({
    updateState = true,
    includePodium = true,
    includeGrid = true,
  } = {}) {
    if (!this.currentModel) return null;
    const bounds = new THREE.Box3().setFromObject(this.currentModel);
    if (!bounds || !isFinite(bounds.min.y)) return null;

    const podiumY = includePodium ? this.groundController?.snapBaseToBounds(bounds) : null;
    const gridY = includeGrid ? this.groundController?.snapGridToBounds(bounds) : null;

    if (updateState) {
      if (includePodium && podiumY !== null && podiumY !== undefined) {
        this.stateStore.set('groundY', podiumY);
      }
      if (includeGrid && gridY !== null && gridY !== undefined) {
        this.stateStore.set('gridY', gridY);
      }
    }
    return {
      podiumY,
      gridY,
    };
  }

  _cancelGroundGridBottomAlignAnimation() {
    if (this._groundGridBottomAlignRaf) {
      cancelAnimationFrame(this._groundGridBottomAlignRaf);
      this._groundGridBottomAlignRaf = 0;
    }
  }

  _animateGroundAndGridToCurrentModelBottom({ durationMs = 420 } = {}) {
    const snap = this._alignGroundAndGridToCurrentModelBottom({
      updateState: false,
      includePodium: true,
      includeGrid: true,
    });
    if (!snap) return false;

    const targetGroundY = Number.isFinite(snap.podiumY) ? snap.podiumY : null;
    const targetGridY = Number.isFinite(snap.gridY) ? snap.gridY : null;
    if (targetGroundY === null && targetGridY === null) return false;

    const startGroundYRaw = this.groundController?.getGroundY?.();
    const startGridYRaw = this.groundController?.getGridY?.();
    const startGroundY = Number.isFinite(startGroundYRaw) ? startGroundYRaw : targetGroundY;
    const startGridY = Number.isFinite(startGridYRaw) ? startGridYRaw : targetGridY;

    const groundDelta =
      targetGroundY === null || startGroundY === null ? 0 : Math.abs(targetGroundY - startGroundY);
    const gridDelta =
      targetGridY === null || startGridY === null ? 0 : Math.abs(targetGridY - startGridY);
    if (groundDelta < 1e-5 && gridDelta < 1e-5) {
      if (targetGroundY !== null) this.stateStore.set('groundY', targetGroundY);
      if (targetGridY !== null) this.stateStore.set('gridY', targetGridY);
      return true;
    }

    this._cancelGroundGridBottomAlignAnimation();
    const start = performance.now();
    const easeOutCubic = (t) => 1 - (1 - t) ** 3;

    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / Math.max(1, durationMs));
      const e = easeOutCubic(t);

      if (targetGroundY !== null && startGroundY !== null) {
        const y = startGroundY + (targetGroundY - startGroundY) * e;
        this.groundController?.setGroundY(y);
      }
      if (targetGridY !== null && startGridY !== null) {
        const y = startGridY + (targetGridY - startGridY) * e;
        this.groundController?.setGridY(y);
      }

      if (t < 1) {
        this._groundGridBottomAlignRaf = requestAnimationFrame(tick);
      } else {
        this._groundGridBottomAlignRaf = 0;
        if (targetGroundY !== null) this.stateStore.set('groundY', targetGroundY);
        if (targetGridY !== null) this.stateStore.set('gridY', targetGridY);
      }
    };

    this._groundGridBottomAlignRaf = requestAnimationFrame(tick);
    return true;
  }

  snapBaseToBottom() {
    if (!this.currentModel) {
      this.ui?.showToast?.('Load a mesh before snapping the base');
      return;
    }

    const bounds = new THREE.Box3().setFromObject(this.currentModel);
    if (!bounds || !isFinite(bounds.min.y)) {
      this.ui?.showToast?.('Unable to align to mesh');
      return;
    }

    const bottomY = this.groundController?.snapBaseToBounds(bounds);
    if (bottomY === null || bottomY === undefined) {
      this.ui?.showToast?.('Unable to align to mesh');
      return;
    }
    this.stateStore.set('groundY', bottomY);

    const currentState = this.stateStore.getState();
    const glassOn = !!(
      currentState.baseGlassSurface ?? currentState.podiumReflectMesh ?? false
    );
    if (!currentState.groundSolid && !glassOn) {
      this.setGroundSolid(true);
      this.stateStore.set('groundSolid', true);
    }

    this.ui?.showToast?.(
      'Base snapped to mesh',
      3200,
      { notification: false },
    );
  }

  snapGridToBottom() {
    if (!this.currentModel) {
      this.ui?.showToast?.('Load a mesh before snapping the grid');
      return;
    }

    const bounds = new THREE.Box3().setFromObject(this.currentModel);
    if (!bounds || !isFinite(bounds.min.y)) {
      this.ui?.showToast?.('Unable to align to mesh');
      return;
    }

    const bottomY = this.groundController?.snapGridToBounds(bounds);
    if (bottomY === null || bottomY === undefined) {
      this.ui?.showToast?.('Unable to align to mesh');
      return;
    }
    this.stateStore.set('gridY', bottomY);
    this.ui?.showToast?.(
      'Grid snapped to mesh',
      3200,
      { notification: false },
    );
  }

  setBaseScale(value, { updateState = true } = {}) {
    const newGroundY = this.groundController?.setBaseScale(value);
    if (updateState && typeof newGroundY === 'number') {
      this.stateStore.set('groundY', newGroundY);
    }
    this._syncShadowCameraBounds();
  }

  setGridScale(value) {
    this.groundController?.setGridScale(value);
  }

  setGridLineWidth(value) {
    this.groundController?.setGridLineWidth(value);
  }

  setBaseMetalness(value, { updateState = true } = {}) {
    this.groundController?.setBaseMetalness(value);
    if (updateState) this.stateStore.set('baseMetalness', value);
  }

  setBaseRoughness(value, { updateState = true } = {}) {
    this.groundController?.setBaseRoughness(value);
    if (updateState) this.stateStore.set('baseRoughness', value);
  }

  setBaseReflection(value, { updateState = true } = {}) {
    this.groundController?.setBaseReflection(value);
    if (updateState) this.stateStore.set('baseReflection', value);
  }

  setBaseClearcoat(value, { updateState = true } = {}) {
    this.groundController?.setBaseClearcoat(value);
    if (updateState) this.stateStore.set('baseClearcoat', value);
  }

  setBaseSurface(settings = {}, { updateState = true } = {}) {
    const state = this.stateStore.getState();
    const preset = settings.preset ?? state.baseSurfacePreset ?? 'none';
    const scale = settings.scale ?? state.baseSurfaceScale ?? 1;
    const strength = settings.strength ?? state.baseSurfaceStrength ?? 1;
    if (updateState) {
      if (settings.preset !== undefined) this.stateStore.set('baseSurfacePreset', preset);
      if (settings.scale !== undefined) this.stateStore.set('baseSurfaceScale', scale);
      if (settings.strength !== undefined) this.stateStore.set('baseSurfaceStrength', strength);
    }
    this.groundController?.setBaseSurface({ preset, scale, strength });
  }

  setBaseGlassSurface(enabled, { updateState = true } = {}) {
    const on = !!enabled;
    this.groundController?.setBaseGlassSurface(on);
    if (updateState) this.stateStore.set('baseGlassSurface', on);
    this._updateBaseAppearAnimation();
    this._updateBaseGlassAppearAnimation();
    this.ui?.applyBlockStates?.(this.stateStore.getState());
  }

  setBaseGlassBlur(value, { updateState = true } = {}) {
    this.groundController?.setBaseGlassBlur(value);
    if (updateState) this.stateStore.set('baseGlassBlur', value);
  }

  setBaseGlassAmount(value, { updateState = true } = {}) {
    this.groundController?.setBaseGlassAmount(value);
    if (updateState) this.stateStore.set('baseGlassAmount', value);
  }

  setBaseGlassBrightness(value, { updateState = true } = {}) {
    this.groundController?.setBaseGlassBrightness(value);
    if (updateState) this.stateStore.set('baseGlassBrightness', value);
  }

  setBackdropEnabled(enabled, { updateState = true } = {}) {
    const on = !!enabled;
    this.groundController?.setBackdropEnabled(on);
    if (updateState) this.stateStore.set('backdropEnabled', on);
    this._updateBackdropAppearAnimation();
    this._syncShadowAndGobo();
    this._syncShadowCameraBounds();
    this.ui?.applyBlockStates?.(this.stateStore.getState());
  }

  setBackdropScale(value, { updateState = true } = {}) {
    this.groundController?.setBackdropScale(value);
    if (updateState) this.stateStore.set('backdropScale', value);
    this.goboProjection?.syncUniformsOnScene(this._getGoboSceneTargets());
    this._syncShadowCameraBounds();
  }

  setBackdropWidth(value, { updateState = true } = {}) {
    this.groundController?.setBackdropWidth(value);
    if (updateState) this.stateStore.set('backdropWidth', value);
    this.goboProjection?.syncUniformsOnScene(this._getGoboSceneTargets());
    this._syncShadowCameraBounds();
  }

  setBackdropColor(color, { updateState = true } = {}) {
    this.groundController?.setBackdropColor(color);
    if (updateState) this.stateStore.set('backdropColor', color);
  }

  setBackdropRotation(value, { updateState = true } = {}) {
    this.groundController?.setBackdropRotation(value);
    if (updateState) this.stateStore.set('backdropRotation', value);
    this._syncShadowCameraBounds();
  }

  setBackdropY(value, { updateState = true } = {}) {
    this.groundController?.setBackdropY(value);
    if (updateState) this.stateStore.set('backdropY', value);
    this.goboProjection?.syncUniformsOnScene(this._getGoboSceneTargets());
    this._syncShadowCameraBounds();
  }

  setBackdropMetalness(value, { updateState = true } = {}) {
    this.groundController?.setBackdropMetalness(value);
    if (updateState) this.stateStore.set('backdropMetalness', value);
  }

  setBackdropRoughness(value, { updateState = true } = {}) {
    this.groundController?.setBackdropRoughness(value);
    if (updateState) this.stateStore.set('backdropRoughness', value);
  }

  setBackdropSurface(settings = {}, { updateState = true } = {}) {
    const state = this.stateStore.getState();
    const preset = settings.preset ?? state.backdropSurfacePreset ?? 'none';
    const scale = settings.scale ?? state.backdropSurfaceScale ?? 1;
    const strength = settings.strength ?? state.backdropSurfaceStrength ?? 1;
    if (updateState) {
      if (settings.preset !== undefined) this.stateStore.set('backdropSurfacePreset', preset);
      if (settings.scale !== undefined) this.stateStore.set('backdropSurfaceScale', scale);
      if (settings.strength !== undefined) this.stateStore.set('backdropSurfaceStrength', strength);
    }
    this.groundController?.setBackdropSurface({ preset, scale, strength });
  }

  snapBackdropToBottom() {
    if (!this.currentModel) {
      this.ui?.showToast?.('Load a mesh before snapping the backdrop');
      return;
    }
    const bounds = new THREE.Box3().setFromObject(this.currentModel);
    if (!bounds || !isFinite(bounds.min.y)) {
      this.ui?.showToast?.('Unable to align to mesh');
      return;
    }
    const backdropY = this.groundController?.snapBackdropToBounds(bounds);
    if (backdropY === null || backdropY === undefined) {
      this.ui?.showToast?.('Unable to align to mesh');
      return;
    }
    this.stateStore.set('backdropY', backdropY);
    if (!this.stateStore.getState().backdropEnabled) {
      this.setBackdropEnabled(true);
      this.stateStore.set('backdropEnabled', true);
    } else {
      this._syncShadowCameraBounds();
    }
    this.ui?.showToast?.(
      'Backdrop snapped to mesh',
      3200,
      { notification: false },
    );
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
  }

  _isShadowTintActive() {
    return !!this.lightsEnabled && !!this.lightsCastShadows;
  }

  _syncEffectiveCastShadows() {
    const state = this.stateStore.getState();
    const globalCast = this._isShadowTintActive();
    const lightsState = state.lights ?? {};
    const keyOnly = isKeyLightOnlyShadowCastingRenderQuality(state.renderQuality);
    ['key', 'fill', 'rim'].forEach((lightId) => {
      let perLight =
        globalCast
        && lightsState[lightId]?.enabled === true
        && lightsState[lightId]?.castShadows === true;
      if (keyOnly && lightId !== 'key') {
        perLight = false;
      }
      this.lightsController?.updateLightProperty(lightId, 'castShadows', perLight);
    });
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

    if (state.backdropEnabled && this.groundController?.backdropEnabled) {
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
    if (!bounds) return;
    this.lightsController?.setModelBounds(bounds, {
      receiveSurfaceRadius: this._getShadowReceiveSurfaceRadius(bounds),
    });
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
    const keyCast = this.stateStore.getState().lights?.key?.castShadows === true;
    this.lightsController.updateLightProperty('key', 'castShadows', keyCast);
  }

  setLightsMaster(value) {
    this.lightsMaster = value ?? 0.30;
    const lightsState = this.stateStore.getState().lights;
    this.lightsController?.setMaster(this.lightsMaster, lightsState);
  }

  setShowLightIndicators(enabled) {
    this.lightsController?.setIndicatorsVisible(enabled);
    if (enabled) {
      this._syncShadowCameraBounds();
    }
  }

  updateLightIndicators() {
    this.lightsController?.updateIndicators();
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
  }

  setLightsShadowQuality(quality) {
    this.lightsShadowQuality = normalizeShadowQuality(quality);
    this.lightsController?.setShadowQuality(this.lightsShadowQuality);
    this.goboProjection?.setShadowQuality(this.lightsShadowQuality);
    this.applyRenderQualitySettings();
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
    this._syncShadowAndGobo();
  }

  setLightsShadowOpacity(value) {
    const raw = Number(value);
    this.lightsShadowOpacity = Number.isFinite(raw)
      ? Math.min(1, Math.max(0, raw))
      : 0.25;
    if (this.stateStore.getState().lightsShadowOpacity !== this.lightsShadowOpacity) {
      this.stateStore.set('lightsShadowOpacity', this.lightsShadowOpacity);
    }
    this._syncShadowAndGobo();
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

  _syncShadowAndGobo() {
    this._applyKeyLightGoboShadowOverride();
    this._applyShadowTintToScene();
    this._syncGoboShadowSettings();
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
      this._applyShadowTintToScene();
    }
  }

  async setGoboTexture(textureId, { updateState = true } = {}) {
    const nextId = textureId || DEFAULT_GOBO_TEXTURE_ID;
    this.goboTextureId = nextId;
    if (updateState) this.stateStore.set('gobo.texture', nextId);
    await this.goboProjection?.setTextureId(nextId);
    if (this.goboEnabled) {
      this._syncShadowAndGobo();
    }
  }

  _applyGoboToScene() {
    if (!this.goboProjection?.enabled) return;
    this.goboProjection.applyToScene(this._getGoboSceneTargets());
  }

  _applyShadowTintToScene() {
    const color = this.lightsShadowColor ?? '#080808';
    const strength = this._isShadowTintActive() ? 1 : 0;
    const opacity = this.lightsShadowOpacity ?? 0.25;
    this.materialController?.setShadowTintSettings({ color, strength, opacity });
    const ground = this.groundController;
    const tintOpts = { color, strength, opacity };
    if (ground?.podium) this.materialController?.applyShadowTintToObject(ground.podium, tintOpts);
    if (ground?.backdrop) {
      this.materialController?.applyShadowTintToObject(ground.backdrop, {
        ...tintOpts,
        includeStudioBackdrop: true,
      });
    }
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

  setFresnelSettings(settings = {}) {
    this.materialController.setFresnelSettings(settings);
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
    this.hdriMood?.apply(style, {
      hdriBackgroundEnabled: this.hdriBackgroundEnabled,
      hdriEnabled: this.hdriEnabled,
    });
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

  updateGrain(settings) {
    this.postPipeline?.updateGrain(settings);
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

  updateAberration(settings) {
    this.postPipeline?.updateAberration(settings);
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

  setSvgExtrudeHardEdgeAngle(_hardEdgeAngle) {
    // SVG extrude uses standard creased normals from Normal Angle only.
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

  _disposeStlRawCaches() {
    this.stlRawByMesh.forEach((geometry) => geometry.dispose());
    this.stlRawByMesh.clear();
  }

  _emitStlSmoothingControlsVisibility() {
    this.eventBus.emit('ui:stl-smoothing-visible', { visible: !!this.isStlModel });
  }

  _currentFileIsStl() {
    const name = this.currentFile?.name;
    return typeof name === 'string' && name.toLowerCase().endsWith('.stl');
  }

  _setupStlSmoothingForModel(object) {
    this._disposeStlRawCaches();
    this.isStlModel = modelHasStlImport(object) || this._currentFileIsStl();
    this._emitStlSmoothingControlsVisibility();
    if (!this.isStlModel || !object) return;

    object.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      if (!child.userData?.orbyStlImport && !this._currentFileIsStl()) return;
      if (!this.stlRawByMesh.has(child.uuid)) {
        child.userData.orbyStlImport = true;
        this.stlRawByMesh.set(child.uuid, cloneStlSourceGeometry(child.geometry));
      }
    });

    this.applyStlSmoothingFromState();
  }

  _applyCenterPivotFromState() {
    const wantCentered = !!this.stateStore.getState()?.advanced?.centerPivot;
    if (wantCentered === !!this._pivotCenterDelta) return;
    this.setCenterPivot(wantCentered, { updateState: false });
  }

  /**
   * @param {boolean} enabled
   * @param {{ updateState?: boolean, showToast?: boolean }} [options]
   */
  setCenterPivot(enabled, options = {}) {
    const wantCentered = !!enabled;
    if (!this.currentModel || !this.modelRoot) {
      if (options.updateState !== false) {
        this.stateStore.set('advanced.centerPivot', false);
      }
      return false;
    }

    if (wantCentered) {
      if (this._pivotCenterDelta) {
        return true;
      }
      const delta = captureAndApplyCenterPivot(this.modelRoot, this.currentModel);
      if (!delta) {
        this.ui?.showToast?.('Could not center pivot');
        if (options.updateState !== false) {
          this.stateStore.set('advanced.centerPivot', false);
          this.ui?.syncUIFromState?.();
        }
        return false;
      }
      this._pivotCenterDelta = delta;
    } else {
      if (!this._pivotCenterDelta) {
        return true;
      }
      undoCenterPivot(this.modelRoot, this.currentModel, this._pivotCenterDelta);
      this._pivotCenterDelta = null;
    }

    if (options.updateState !== false) {
      this.stateStore.set('advanced.centerPivot', wantCentered);
    }

    this._afterPivotChange();
    if (wantCentered && options.showToast !== false) {
      this.ui?.showToast?.('Pivot centered', 3200, { notification: false });
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

  applyStlSmoothingFromState() {
    if (!this.isStlModel || !this.currentModel) return;

    const advanced = this.stateStore.getState()?.advanced ?? {};
    const options = {
      smoothShading: advanced.stlSmoothShading !== false,
      angleDeg: advanced.stlSmoothingAngle,
    };

    this.currentModel.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const raw = this.stlRawByMesh.get(child.uuid);
      if (!raw) return;
      applyStlNormalSmoothing(child, raw, options);
    });

    this.originalGeometryIndices = new WeakMap();
    this.originalGeometryAttributes = new WeakMap();
    this.setReverseNormals(this.reverseNormalsEnabled);
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
    this.materialController.applyGlassAppearanceFromState(this.currentModel);
    this.materialController.applyGlassOrientationFromState(this.currentModel);
    this.refreshMaterialSidesForReverseNormals();
    if (this.scene.environment) {
      const intensity = Math.max(0, this.hdriStrength ?? 0);
      this.updateMaterialsEnvironment(this.scene.environment, intensity);
    }
  }

  setSvgExtrudeSurface(settings = {}, options = {}) {
    const { updateState = true } = options;
    if (updateState) {
      if (settings.preset !== undefined) {
        this.stateStore.set('svgExtrude.surfacePreset', settings.preset);
      }
      if (settings.scale !== undefined) {
        this.stateStore.set('svgExtrude.surfaceScale', settings.scale);
      }
      if (settings.strength !== undefined) {
        this.stateStore.set('svgExtrude.surfaceStrength', settings.strength);
      }
    }
    if (!this.currentModel || !this.isSvgExtrudeModel) return;
    this.materialController?.reapplySvgExtrudeSurfaceShaders();
  }

  /** Live update fill on font-generated meshes (no SVG “color override” toggle). */
  applyFontExtrudeFillColor(hex) {
    const fillHex = normalizeGlyphFillHex(hex);
    const importer = this.svgExtrudeImporter;
    if (importer && typeof importer.getFillColor === 'function') {
      importer.currentFillColor = fillHex;
      importer.currentColorPalette = [fillHex];
    }
    this.materialController?.setFontExtrudeFillColor?.(fillHex);
  }

  setSvgExtrudeColorOverride(settings = {}, options = {}) {
    const { updateState = true } = options;
    const enabled = settings.colorOverride !== undefined
      ? !!settings.colorOverride
      : (settings.enabled !== undefined && settings.availableColors === undefined
        ? !!settings.enabled
        : false);
    const color = settings.color || settings.overrideColor || '#7ed321';
    if (updateState) {
      this.stateStore.set('svgExtrude.colorOverride', enabled);
      this.stateStore.set('svgExtrude.overrideColor', color);
    }
    if (!this.currentModel || !this.isSvgExtrudeModel) return;
    const overrideColor = new THREE.Color(color);
    this.currentModel.traverse((child) => {
      if (!child.isMesh || !child.userData?.orbySvgExtrude) return;
      const baseHex = child.userData.orbySvgBaseColor || '#ffffff';
      const baseLinear = child.userData.orbySvgBaseColorLinear;
      const baseColor = (baseLinear && Number.isFinite(baseLinear.r) && Number.isFinite(baseLinear.g) && Number.isFinite(baseLinear.b))
        ? new THREE.Color().setRGB(baseLinear.r, baseLinear.g, baseLinear.b)
        : new THREE.Color(baseHex);
      const targetColor = enabled ? overrideColor : baseColor;
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
    this.materialController.updateMaterials();
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
    this.transformController?.setScale(value);
    // Update transform controls if attached
    if (this.transformControlsScale?.object === this.modelRoot) {
      this.transformControlsScale.updateMatrixWorld();
    }
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
      onPlayStateChanged: (playing) => this.ui.setAnimationPlaying(playing),
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
      this.ui.syncAnimationShowJointNames({
        visible: next,
        enabled: next,
        checked: next ? !!animation.showJointNames : false,
      });
      if (!next && animation.showJointNames) {
        this.setAnimationShowJointNames(false, { updateUi: false });
      }
      this.ui.syncAnimationBoneStroke({
        visible: next,
        enabled: next,
        value: animation.boneStrokeWidth ?? 2,
      });
      this.ui.syncAnimationHideMesh({
        visible: next,
        enabled: next,
        checked: !!animation.hideMesh,
      });
      this.ui.syncAnimationJointScale({
        visible: next,
        enabled: next,
        value: animation.jointScale ?? 0.5,
      });
    }

    this.render();
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

    this.render();
    return next;
  }

  setAnimationJointScale(scale, { updateUi = true } = {}) {
    if (!this.diagnosticsController) return 0.5;

    const next = this.diagnosticsController.setJointScale(scale);
    this.stateStore.set('animation.jointScale', next);

    if (updateUi) {
      this.ui.syncAnimationJointScale({ value: next });
    }

    this.render();
    return next;
  }

  setAnimationBoneStrokeWidth(width, { updateUi = true } = {}) {
    if (!this.diagnosticsController) return 2;

    const next = this.diagnosticsController.setBoneStrokeWidth(width);
    this.stateStore.set('animation.boneStrokeWidth', next);

    if (updateUi) {
      this.ui.syncAnimationBoneStroke({ value: next });
    }

    this.render();
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

    this.render();
    return next;
  }

  applyCameraPreset(preset) {
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

  /** Enable / tune flat-post passes (ASCII, C64, Game Boy). */
  _syncCreativeLookAsciiPass() {
    const storeCl = this.stateStore?.getState()?.creativeLook ?? {};
    const mcCl = this.materialController?.getCreativeLookSettings?.() ?? {};
    const presetId = normalizeCreativeLookPreset(storeCl.preset ?? mcCl.preset);
    const creativeLookOn =
      (storeCl.enabled ?? mcCl.enabled) === true;
    const prevCreativeLookBackdrop =
      this.backgroundController?.creativeLookBackdropActive === true;
    this.backgroundController?.setCreativeLookBackdropActive?.(creativeLookOn);
    if (prevCreativeLookBackdrop !== creativeLookOn) {
      this.environmentController?.setBackgroundEnabled?.(this.hdriBackgroundEnabled);
    }
    const enabled = creativeLookOn && isFlatPostCreativeLookPreset(presetId);
    const flatVariant = enabled ? creativeLookFlatPostVariant(presetId) : null;
    const isAscii = flatVariant === 'ascii';

    const masterHue = normalizeCreativeLookMasterHue(storeCl.masterHue ?? mcCl.masterHue);
    const masterHueRad = creativeLookMasterHueRadians(masterHue);
    const asciiSettings = {
      enabled: enabled && isAscii,
      variant: presetId,
      masterHue: masterHueRad,
    };
    const egaSettings = {
      enabled: enabled && flatVariant === 'ega-pixel',
      masterHue: masterHueRad,
    };
    const c64Settings = {
      enabled: enabled && flatVariant === 'c64-pixel',
      masterHue: masterHueRad,
    };
    const gameBoySettings = {
      enabled: enabled && flatVariant === 'gameboy-pixel',
      masterHue: masterHueRad,
    };
    const nesSettings = {
      enabled: enabled && flatVariant === 'nes-pixel',
      masterHue: masterHueRad,
    };
    const megaDriveSettings = {
      enabled: enabled && flatVariant === 'megadrive-pixel',
      masterHue: masterHueRad,
    };
    const gbaSettings = {
      enabled: enabled && flatVariant === 'gba-pixel',
      masterHue: masterHueRad,
    };
    const intellivisionSettings = {
      enabled: enabled && flatVariant === 'intellivision-pixel',
      masterHue: masterHueRad,
    };

    const apple2Settings = {
      enabled: enabled && flatVariant === 'apple2-pixel',
      masterHue: masterHueRad,
    };

    const patternScale = normalizeCreativeLookPatternScale(
      presetId,
      Number(storeCl.patternScale ?? mcCl.patternScale),
    );
    const intensity = normalizeCreativeLookIntensity(storeCl.intensity ?? mcCl.intensity);
    const liftCrush = normalizeCreativeLookLiftCrush(storeCl.liftCrush ?? mcCl.liftCrush);
    const ditherSettings = {
      enabled: enabled && isDitherPixelCreativeLookPreset(presetId),
      variant: presetId,
      masterHue: masterHueRad,
      patternScale,
      intensity,
      liftCrush,
    };

    this.postPipeline?.setCreativeLookFlatPostMode?.({ enabled, variant: flatVariant });
    this.postPipeline?.updateCreativeLookAscii(asciiSettings);
    this.postPipeline?.updateCreativeLookEga?.(egaSettings);
    this.postPipeline?.updateCreativeLookC64?.(c64Settings);
    this.postPipeline?.updateCreativeLookGameBoy?.(gameBoySettings);
    this.postPipeline?.updateCreativeLookNes?.(nesSettings);
    this.postPipeline?.updateCreativeLookMegaDrive?.(megaDriveSettings);
    this.postPipeline?.updateCreativeLookIntellivision?.(intellivisionSettings);
    this.postPipeline?.updateCreativeLookGba?.(gbaSettings);
    this.postPipeline?.updateCreativeLookApple2?.(apple2Settings);
    this.postPipeline?.updateCreativeLookDither?.(ditherSettings);

    const watercolourOn = creativeLookOn && isWatercolourCreativeLookPreset(presetId);
    const gouacheOn = creativeLookOn && isGouacheCreativeLookPreset(presetId);
    const sketchOn = creativeLookOn && isSketchCreativeLookPreset(presetId);
    const sketchColourOn = creativeLookOn && isSketchColourCreativeLookPreset(presetId);
    const sketchFamilyOn = sketchOn || sketchColourOn;
    const vectrexOn = creativeLookOn && isVectrexCreativeLookPreset(presetId);
    const presetParams = storeCl.presetParams ?? mcCl.presetParams;
    const watercolourInk = resolveCreativeLookInkParams(presetParams, 'watercolour');
    const watercolourSettings = {
      enabled: watercolourOn,
      patternScale,
      radius: creativeLookWatercolourRadius(patternScale),
      intensity: normalizeCreativeLookIntensity(storeCl.intensity ?? mcCl.intensity),
      strokeColor: watercolourInk.strokeColor,
      preset: 'watercolour',
    };
    this.postPipeline?.updateCreativeLookWatercolour?.(watercolourSettings);
    if (!watercolourOn) {
      this.postPipeline?.releaseCreativeLookWatercolour?.();
    }

    const gouacheInk = resolveCreativeLookInkParams(presetParams, 'gouache');
    const gouacheSettings = {
      enabled: gouacheOn,
      patternScale,
      intensity: normalizeCreativeLookIntensity(storeCl.intensity ?? mcCl.intensity),
      strokeColor: gouacheInk.strokeColor,
      preset: 'gouache',
    };
    this.postPipeline?.updateCreativeLookGouache?.(gouacheSettings);
    if (!gouacheOn) {
      this.postPipeline?.releaseCreativeLookGouache?.();
    }

    const sketchParams = resolveCreativeLookSketchParams(
      presetParams,
      patternScale,
    );
    const sketchInk = resolveCreativeLookInkParams(presetParams, 'sketch');
    const sketchColourInk = resolveCreativeLookInkParams(presetParams, 'sketch-colour');
    const sketchSettings = {
      enabled: sketchOn && sketchParams.rasterSize > 0,
      strokeWidth: sketchParams.strokeWidth,
      rasterSize: sketchParams.rasterSize,
      intensity: normalizeCreativeLookIntensity(storeCl.intensity ?? mcCl.intensity),
      strokeColor: sketchInk.strokeColor,
      preset: 'sketch',
    };
    const sketchColourSettings = {
      enabled: sketchColourOn && sketchParams.rasterSize > 0,
      strokeWidth: sketchParams.strokeWidth,
      rasterSize: sketchParams.rasterSize,
      intensity: normalizeCreativeLookIntensity(storeCl.intensity ?? mcCl.intensity),
      strokeColor: sketchColourInk.strokeColor,
      preset: 'sketch-colour',
    };
    this.postPipeline?.updateCreativeLookSketch?.(sketchSettings);
    this.postPipeline?.updateCreativeLookSketchColour?.(sketchColourSettings);
    if (!sketchFamilyOn) {
      this.postPipeline?.releaseCreativeLookSketch?.();
    }

    const vectrexSettings = {
      enabled: vectrexOn,
      intensity: normalizeCreativeLookIntensity(storeCl.intensity ?? mcCl.intensity),
    };
    this.postPipeline?.updateCreativeLookVectrex?.(vectrexSettings);
    if (!vectrexOn) {
      this.postPipeline?.releaseCreativeLookVectrex?.();
    }

    this._syncCreativeLookStudioBackground(creativeLookOn, presetId);

    if (enabled || watercolourOn || gouacheOn || sketchFamilyOn || vectrexOn) {
      const sz = new THREE.Vector2();
      this.renderer.getSize(sz);
      if (sz.x > 0 && sz.y > 0) {
        if (enabled) {
          this.postPipeline?.creativeLookAscii?.setSize(sz.x, sz.y);
          this.postPipeline?.creativeLookEga?.setSize(sz.x, sz.y);
          this.postPipeline?.creativeLookC64?.setSize(sz.x, sz.y);
          this.postPipeline?.creativeLookGameBoy?.setSize(sz.x, sz.y);
          this.postPipeline?.creativeLookNes?.setSize(sz.x, sz.y);
          this.postPipeline?.creativeLookMegaDrive?.setSize(sz.x, sz.y);
          this.postPipeline?.creativeLookIntellivision?.setSize(sz.x, sz.y);
          this.postPipeline?.creativeLookGba?.setSize(sz.x, sz.y);
          this.postPipeline?.creativeLookApple2?.setSize(sz.x, sz.y);
          this.postPipeline?.creativeLookDither?.setSize(sz.x, sz.y);
        }
        if (watercolourOn) {
          this.postPipeline?.creativeLookWatercolour?.setSize(sz.x, sz.y);
        }
        if (gouacheOn) {
          this.postPipeline?.creativeLookGouache?.setSize(sz.x, sz.y);
        }
        if (sketchOn) {
          this.postPipeline?.creativeLookSketch?.setSize(sz.x, sz.y);
        }
        if (sketchColourOn) {
          this.postPipeline?.creativeLookSketchColour?.setSize(sz.x, sz.y);
        }
        if (vectrexOn) {
          this.postPipeline?.creativeLookVectrex?.setSize(sz.x, sz.y);
        }
      }
      if (isAscii) {
        const loadAtlas =
          presetId === 'ascii-art-2'
            ? ensureAscii3FontAtlasLoaded
            : presetId === 'ascii-art-3'
              ? ensureAscii2FontAtlasLoaded
              : presetId === 'ascii-art-4'
                ? ensureAscii4FontAtlasLoaded
                : ensureAsciiFontAtlasLoaded;
        void loadAtlas().then(() => {
          this.postPipeline?.creativeLookAscii?.refreshAtlas?.();
          this.postPipeline?.updateCreativeLookAscii(asciiSettings);
        });
      }
    }
  }

  /** Per-frame Gouache post uniforms — pattern scale drives ink width & chalk grain. */
  _prepareCreativeLookGouacheFrameUniforms() {
    if (!isCreativeLookGouachePostActive(this.stateStore.getState())) return;
    const cl = this.stateStore.getState().creativeLook ?? {};
    const presetId = normalizeCreativeLookPreset(cl.preset);
    const patternScale = normalizeCreativeLookPatternScale(
      presetId,
      Number(cl.patternScale),
    );
    const gouacheInk = resolveCreativeLookInkParams(cl.presetParams, 'gouache');
    this.postPipeline?.updateCreativeLookGouache?.({
      time: this.materialController?.getCreativeLookAnimationTime?.() ?? 0,
      patternScale,
      intensity: normalizeCreativeLookIntensity(cl.intensity),
      strokeColor: gouacheInk.strokeColor,
      preset: presetId,
    });
  }

  /** Per-frame Sketch post uniforms — stroke / raster must not be omitted (defaults reset ink & halftone). */
  _prepareCreativeLookSketchFrameUniforms() {
    if (!isCreativeLookSketchPostActive(this.stateStore.getState())) return;
    const cl = this.stateStore.getState().creativeLook ?? {};
    const presetId = normalizeCreativeLookPreset(cl.preset);
    const patternScale = normalizeCreativeLookPatternScale(
      presetId,
      Number(cl.patternScale),
    );
    const sketchParams = resolveCreativeLookSketchParams(
      cl.presetParams,
      patternScale,
    );
    const sketchInk = resolveCreativeLookInkParams(
      cl.presetParams,
      isSketchColourCreativeLookPreset(presetId) ? 'sketch-colour' : 'sketch',
    );
    const frameSettings = {
      time: this.materialController?.getCreativeLookAnimationTime?.() ?? 0,
      strokeWidth: sketchParams.strokeWidth,
      rasterSize: sketchParams.rasterSize,
      intensity: normalizeCreativeLookIntensity(cl.intensity),
      strokeColor: sketchInk.strokeColor,
      preset: presetId,
    };
    if (isSketchCreativeLookPreset(presetId)) {
      this.postPipeline?.updateCreativeLookSketch?.(frameSettings);
    }
    if (isSketchColourCreativeLookPreset(presetId)) {
      this.postPipeline?.updateCreativeLookSketchColour?.(frameSettings);
    }
  }

  /**
   * Shader Lab backdrop — artistic presets use warm paper white; other presets keep studio color.
   * @param {boolean} creativeLookOn
   * @param {import('./render/CreativeLookMaterials.js').CreativeLookPreset | string} [presetId]
   */
  _syncCreativeLookStudioBackground(creativeLookOn, presetId = '') {
    const state = this.stateStore.getState();
    const studioBg = state.background ?? APP_BACKGROUND;
    const studioGradient = state.backgroundGradient;

    const restoreStudioBackdrop = () => {
      this.backgroundController?.setColor(studioBg);
      if (studioGradient) {
        this.backgroundGradientController?.setConfig(studioGradient);
      }
      this.environmentController?.setFallbackColor(studioBg);
      this._creativeLookArtisticPaperBg = false;
    };

    if (!creativeLookOn) {
      if (this._creativeLookArtisticPaperBg) {
        restoreStudioBackdrop();
      }
      this._creativeLookStudioBgSynced = false;
      return;
    }

    const artisticOn = isArtisticCreativeLookPreset(
      normalizeCreativeLookPreset(presetId),
    );

    if (artisticOn) {
      if (!this._creativeLookArtisticPaperBg) {
        this.backgroundController?.setColor(SKETCH_PAPER_HEX);
        this.backgroundGradientController?.setConfig({
          ...(studioGradient ?? {}),
          enabled: false,
        });
        this.environmentController?.setFallbackColor(SKETCH_PAPER_HEX);
        this._creativeLookArtisticPaperBg = true;
      }
      this._creativeLookStudioBgSynced = true;
      return;
    }

    if (this._creativeLookArtisticPaperBg) {
      restoreStudioBackdrop();
      this._creativeLookStudioBgSynced = true;
      return;
    }

    if (this._creativeLookStudioBgSynced) return;
    this.backgroundController?.setColor(studioBg);
    if (studioGradient) {
      this.backgroundGradientController?.setConfig(studioGradient);
    }
    this.environmentController?.setFallbackColor(studioBg);
    this._creativeLookStudioBgSynced = true;
  }

  /**
   * Apply Shader Lab state with viewport spinner + toast when materials rebuild.
   * @param {object} creativeLookState
   * @param {{ skipStateStore?: boolean }} [options]
   */
  applyCreativeLookFromState(creativeLookState, options = {}) {
    this._creativeLookApplyChain = (this._creativeLookApplyChain ?? Promise.resolve())
      .catch(() => {})
      .then(() => this._applyCreativeLookFromStateOnce(creativeLookState, options));
    return this._creativeLookApplyChain;
  }

  /**
   * @param {object} creativeLookState
   * @param {{ skipStateStore?: boolean }} [options]
   */
  async _applyCreativeLookFromStateOnce(creativeLookState, options = {}) {
    const mc = this.materialController;
    if (!mc) return;

    if (
      !options.skipVoxelPolyWarning &&
      willApplyVoxelHdGeometry(mc, creativeLookState)
    ) {
      const proceed = await confirmVoxelHdHighPolyAlert(this.ui, this.currentModel);
      if (!proceed) {
        this._revertPendingCreativeLookSelection();
        return;
      }
    }

    const heavy = mc.willRebuildCreativeLookMaterials(creativeLookState);
    if (heavy) {
      this.ui?.setLoadSpinnerStatusPrefix?.('Loading shader');
      this.ui?.beginLoadSpinner?.();
      this.ui?.beginLoadSpinnerElapsed?.();
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
    }

    try {
      mc.setCreativeLookSettings(creativeLookState, options);
      this._syncCreativeLookAsciiPass();
      if (heavy && creativeLookState?.enabled) {
        const label = formatCreativeLookPresetLabel(creativeLookState.preset);
        this.ui?.showToast?.(`${label} loaded`, 2800, {
          notification: false,
          icon: 'success',
        });
      }
    } finally {
      if (heavy) {
        this.ui?.endLoadSpinner?.();
      }
    }
  }

  /** Undo a Voxel HD selection when the high-poly confirm dialog is cancelled. */
  _revertPendingCreativeLookSelection() {
    const mc = this.materialController;
    if (!mc) return;

    const applied = mc.creativeLookSettings;
    const preset = resolveCreativeLookPresetChoice(applied.preset);
    this.stateStore?.batch?.(() => {
      this.stateStore.set('creativeLook.preset', preset);
      this.stateStore.set('creativeLook.enabled', !!applied.enabled);
    });
    if (this.ui?.inputs?.creativeLookEnabled) {
      this.ui.inputs.creativeLookEnabled.checked = !!applied.enabled;
    }
    this.ui?.setCreativeLookActive?.(applied.enabled ? preset : null);
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

  render() {
    if (!this.isStudioReady || !this.renderer) return;
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
    this.autoExposureController?.update(this.unlitMode);
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

  _applyViewportSizeFromLayout() {
    if (this._suppressResizeForExport || !this.isStudioReady || !this.renderer) {
      return;
    }
    const container = this.viewport || this.canvas?.parentElement;
    const containerRect = container?.getBoundingClientRect?.() ?? null;
    const canvasRect = this.canvas?.getBoundingClientRect?.() ?? null;

    const width = containerRect
      ? Math.floor(containerRect.width)
      : Math.floor(canvasRect?.width) || window.innerWidth;
    const height = containerRect
      ? Math.floor(containerRect.height)
      : Math.floor(canvasRect?.height) || window.innerHeight;

    if (width <= 0 || height <= 0) {
      return;
    }

    const isFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );

    const finalWidth = isFullscreen ? window.innerWidth : width;
    const finalHeight = isFullscreen ? window.innerHeight : height;

    this.renderer.setSize(finalWidth, finalHeight, false);

    if (
      this.canvas &&
      (this.canvas.style.width !== '100%' || this.canvas.style.height !== '100%')
    ) {
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
    }

    this.camera.aspect = finalWidth / Math.max(1, finalHeight);
    this.syncPerspectiveCameraFovAndLens();
    this.syncPostProcessingForLogicalSize(finalWidth, finalHeight);
    const gl = this.renderer.getContext();
    if (gl && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0) {
      this.backgroundImageController?.handleResize?.(
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
      );
      this.backgroundGradientController?.handleResize?.(
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
      );
    } else {
      const dbSize = new THREE.Vector2();
      this.renderer.getDrawingBufferSize(dbSize);
      this.backgroundImageController?.handleResize?.(dbSize.x, dbSize.y);
      this.backgroundGradientController?.handleResize?.(dbSize.x, dbSize.y);
    }
  }

  async exportImage(settings = {}) {
    const formatId = normalizeImageExportFormat(settings.format);
    const formatMeta = getImageExportFormat(formatId);
    let { transparent = false, size = 2 } = settings;
    if (transparent && !formatMeta.supportsAlpha) {
      transparent = false;
    }
    if (shouldBlockFisheyePngExport(this.stateStore, { transparent })) {
      showFisheyeTransparentPngExportBlockedAlert(this.ui);
      return;
    }
    this._suppressResizeForExport = true;
    try {
      if (transparent) {
        if (!this.currentModel) {
          this.ui?.showToast?.('Load a mesh before exporting image');
          return;
        }
        const ok = await this.imageExporter.exportTransparentImage(
          this.currentModel,
          this.currentFile,
          this.cameraController,
          size,
          formatId,
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

        const cinematicLetterbox219 = !!this.stateStore
          .getState()
          .camera?.cinematicLetterbox219;
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
      this.ui?.showToast?.(`${formatMeta.label} export failed`);
    } finally {
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
      this.ui?.showToast?.(GLB_EXPORT_UNAVAILABLE_HINT);
      return;
    }

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

  scrubExportVideoPreview(t, settings = {}) {
    this.exportMovementPreview?.scrub(t, this._videoExportSettingsFromUi(settings));
  }

  resetExportVideoPreview(settings = {}) {
    this.exportMovementPreview?.resetToStart(this._videoExportSettingsFromUi(settings));
  }

  toggleExportVideoPreviewPlay(settings = {}) {
    this.exportMovementPreview?.togglePlay(this._videoExportSettingsFromUi(settings));
  }

  syncExportVideoPreviewSettings(settings = {}) {
    const resolved = this._videoExportSettingsFromUi(settings);
    if (
      !ExportMovementPreview.canPreview(resolved)
      && this.exportMovementPreview?.isActive?.()
    ) {
      this.exportMovementPreview.stop({ silent: true });
    } else {
      this.exportMovementPreview?.rearm(resolved);
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
    const embedToggle = this.ui?.inputs?.exportMeshAnimationsEmbed;
    const clipSelect = this.ui?.inputs?.exportMeshAnimationSelect;
    if (embedToggle) {
      video.meshAnimationsInclude = !!embedToggle.checked;
    }
    if (clipSelect && clipSelect.options.length) {
      const index = parseInt(clipSelect.value, 10);
      if (Number.isFinite(index)) {
        video.meshAnimationClipIndex = index;
      }
    }
    if (this.ui?.pngExportDirectoryHandle) {
      video.pngOutputDirectoryHandle = this.ui.pngExportDirectoryHandle;
    }
    return video;
  }
}

