import * as THREE from 'three';
import { TransformControls } from './vendor/TransformControls.js';
import { HDRI_PRESETS, HDRI_STRENGTH_UNIT, HDRI_MOODS } from './config/hdri.js';
import {
  WIREFRAME_OFFSET,
  WIREFRAME_POLYGON_OFFSET_FACTOR,
  WIREFRAME_POLYGON_OFFSET_UNITS,
  WIREFRAME_OPACITY_VISIBLE,
  WIREFRAME_OPACITY_OVERLAY,
  CAMERA_TEMPERATURE_MIN_K,
  CAMERA_TEMPERATURE_MAX_K,
  CAMERA_TEMPERATURE_NEUTRAL_K,
  resolveBloomQualityTier,
  isBloomPipelineActive,
  resolveRenderQualityTier,
  DEFAULT_MATERIAL_BRIGHTNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_MATERIAL_METALNESS,
  DEFAULT_PODIUM_GLASS_BLUR,
  DEFAULT_PODIUM_GLASS_AMOUNT,
  DEFAULT_PODIUM_GLASS_BRIGHTNESS,
  sanitizeAmbientOcclusion,
  effectiveVignetteIntensity,
  cameraShadowsUiToShader,
} from './constants.js';
import { fullViewportLogicalSize } from './render/fullViewportLogicalSize.js';
import { PostProcessingPipeline } from './render/PostProcessingPipeline.js';
import { LightsController } from './render/LightsController.js';
import { GroundController } from './render/GroundController.js';
import { EnvironmentController } from './render/EnvironmentController.js';
import { HdriMoodController } from './render/HdriMoodController.js';
import { CameraController } from './render/CameraController.js';
import { ModelLoader } from './render/ModelLoader.js';
import { AnimationController } from './render/AnimationController.js';
import { MeshDiagnosticsController } from './render/MeshDiagnosticsController.js';
import { MaterialController } from './render/MaterialController.js';
import { reapplySvgExtrudeProceduralFromState } from './render/SvgExtrudeSurfaceShader.js';
import { LensFlareController } from './render/LensFlareController.js';
import { AutoExposureController } from './render/AutoExposureController.js';
import { TransformController } from './render/TransformController.js';
import { LensDirtController } from './render/LensDirtController.js';
import { BackgroundController } from './render/BackgroundController.js';
import { ImageExporter } from './render/ImageExporter.js';
import { VideoExporter } from './render/VideoExporter.js';
import { HistogramController } from './render/HistogramController.js';
import { SvgGlbExporter } from './export/SvgGlbExporter.js';
import { EventManager } from './scene/EventManager.js';
import { SceneMeshClickHandler } from './scene/SceneMeshClickHandler.js';
import { ViewportFramingOverlays } from './scene/ViewportFramingOverlays.js';
import { createColorCheckerMeshGroup } from './scene/ColorCheckerMesh.js';
import {
  createToggleScaleContext,
  easeOutExpo,
  SCALE_TOGGLE_IN_MS,
  stepToggleScaleAnimation,
} from './scene/toggleScaleAnimation.js';
import { applyLookFilterPreset } from './ui/lookFilterApply.js';
import { LONG_TOAST_CHAR_THRESHOLD } from './UIManager.js';

/** Modal copy after loading `.fbx` — FBX material/textures path is still WIP in Orby. */
const FBX_IMPORT_WIP_ALERT_BODY =
  'FBX import is still a work in progress. Phong/Lambert materials are converted to PBR so mesh sliders behave like GLB; ' +
  'UV sets, packed maps, and external textures may still differ from your DCC. ' +
  'For reliable shading, prefer GLB or glTF when you can. You can still tweak textures under Object → Map Slots.';

const LIGHT_SHADOW_MAP_SIZE = {
  low: 512,
  medium: 1024,
  high: 2048,
  ultra: 4096,
};

function normalizeLightShadowQuality(quality) {
  return quality === 'low' || quality === 'high' || quality === 'ultra'
    ? quality
    : 'medium';
}

export class SceneManager {
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    /** True while the settings shelf `.panels` is being scrolled (drives light FX throttling). */
    this.panelsShelfScrolling = false;
    /** Skip rAF resize while PNG/export pipeline mutates renderer size (avoids composer/canvas mismatch). */
    this._suppressResizeForExport = false;
    /** Bloom passes were disabled while creative look was on; restore from state when toggling off. */
    this._creativeBloomWasSuppressed = false;
    this.eventBus.on('ui:panels-scrolling', (payload) => {
      this.setPanelsShelfScrolling(!!payload?.active);
    });

    this.canvas = document.querySelector('#webgl');
    this.viewport = document.querySelector('.viewport');
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      5000,
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
    const initialState = this.stateStore.getState();
    // Auto-exposure will be initialized after setupComposer
    this.hdriStrength = Math.min(
      5 * HDRI_STRENGTH_UNIT,
      Math.max(0, initialState.hdriStrength ?? 2),
    );
    this.lightsShadowQuality = normalizeLightShadowQuality(
      initialState.lightsShadowQuality,
    );
    this.lightsShadowSoftness = Number.isFinite(initialState.lightsShadowSoftness)
      ? initialState.lightsShadowSoftness
      : 4;
    this.lightsShadowContactOffset = Number.isFinite(
      initialState.lightsShadowContactOffset,
    )
      ? initialState.lightsShadowContactOffset
      : -0.0001;
    this.lightsShadowTwoSided = !!initialState.lightsShadowTwoSided;
    // Disable tone mapping on renderer - we'll apply it as a post-processing pass instead
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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
        // Update lights controller when model bounds change
        this.lightsController?.setModelBounds(bounds);
      },
    });
    this.controls = this.cameraController.getControls();
    this.camera.position.set(0, 1.5, 6);
    this.controls.target.set(0, 1, 0);
    this.controls.update();

    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);
    this.colorCheckerRoot = createColorCheckerMeshGroup();
    this.colorCheckerRoot.visible = false;
    this.colorCheckerRoot.name = 'ColorCheckerRoot';
    this.scene.add(this.colorCheckerRoot);
    /** When Reference colors is on, shading we restore when turning it off (Display mode before Unlit). */
    this._colorCheckerRestoreShading = null;
    /** Horizontal orbit reference (XZ), reused each frame like LightsController. */
    this._colorCheckerHorizRef = new THREE.Vector3();
    this._colorCheckerTowardCam = new THREE.Vector3();
    /** Shared scale-in/out state for Reference colors (same curves as podium). */
    this._ccToggleCtx = createToggleScaleContext();
    this._podiumToggleCtx = createToggleScaleContext();
    this._podiumGlassToggleCtx = createToggleScaleContext();
    this._backdropToggleCtx = createToggleScaleContext();
    this._groundGridBottomAlignRaf = 0;
    this.scene.environmentIntensity = this.hdriStrength;

    // Initialize background controller (manages solid background color independently from HDRI)
    this.backgroundController = new BackgroundController({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      initialColor: initialState.background ?? '#000000',
    });

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
    
    // Disable OrbitControls when dragging any widget
    const handleTranslateDraggingChanged = (event) => {
      const controls = this.cameraController?.getControls();
      if (controls) {
        controls.enabled = !event.value;
      }
    };
    
    const handleRotateDraggingChanged = (event) => {
      const controls = this.cameraController?.getControls();
      if (controls) {
        controls.enabled = !event.value;
      }
    };
    
    const handleScaleDraggingChanged = (event) => {
      const controls = this.cameraController?.getControls();
      if (controls) {
        controls.enabled = !event.value;
      }
    };
    
    this.transformControlsTranslate.addEventListener('dragging-changed', handleTranslateDraggingChanged);
    this.transformControlsRotate.addEventListener('dragging-changed', handleRotateDraggingChanged);
    this.transformControlsScale.addEventListener('dragging-changed', handleScaleDraggingChanged);
    
    // Sync widget changes back to state/UI
    const handleChange = () => {
      if (this.modelRoot && (this.transformControlsTranslate.object === this.modelRoot || this.transformControlsRotate.object === this.modelRoot || this.transformControlsScale.object === this.modelRoot)) {
        // For scale widget, ensure uniform scaling (all axes the same)
        if (this.transformControlsScale.object === this.modelRoot) {
          const avgScale = (this.modelRoot.scale.x + this.modelRoot.scale.y + this.modelRoot.scale.z) / 3;
          this.modelRoot.scale.setScalar(avgScale);
        }
        this._syncTransformFromGizmo();
      }
    };
    this.transformControlsTranslate.addEventListener('change', handleChange);
    this.transformControlsRotate.addEventListener('change', handleChange);
    this.transformControlsScale.addEventListener('change', handleChange);

    this.diagnosticsController = new MeshDiagnosticsController({
      scene: this.scene,
      modelRoot: this.modelRoot,
    });

    this.currentShading = initialState.shading;
    this.autoRotateSpeed = 0;
    this.cameraAutoOrbit = initialState.camera?.autoOrbit ?? 'off';
    this.cameraHandheld = initialState.camera?.handheld ?? 'off';
    this.lightsMaster = initialState.lightsMaster ?? 0.30;
    this.lightsEnabled = initialState.lightsEnabled ?? true;
    this.lightsRotation = initialState.lightsRotation ?? 0;
    this.lightsAutoRotate = initialState.lightsAutoRotate ?? false;
    this.lightsAutoRotateSpeed = 30; // degrees per second
    this.currentFile = null;
    this.currentModel = null;
    this.currentAssetMetadata = null;
    this.svgExtrudeImporter = null;
    this.isSvgExtrudeModel = false;
    this.reverseNormalsEnabled = initialState.advanced?.reverseNormals ?? false;
    this.originalGeometryIndices = new WeakMap();
    this.originalGeometryAttributes = new WeakMap();
    this.originalMaterialSides = new WeakMap();
    this.isFirstModelLoad = true; // Track if this is the first model load
    this.svgGlbExporter = new SvgGlbExporter();
    this.animationController = new AnimationController({
      onClipsChanged: (clips) => this.ui.setAnimationClips(clips),
      onPlayStateChanged: (playing) => this.ui.setAnimationPlaying(playing),
      onTimeUpdate: (current, duration) =>
        this.ui.updateAnimationTime(current, duration),
      onTopBarUpdate: (detail) => this.ui.updateTopBarDetail(detail),
      getFileName: () => this.currentFile?.name ?? 'model.glb',
    });
    this.unlitMode = false;
    const defaults = this.stateStore.getDefaults();

    this.hdriEnabled = initialState.hdriEnabled ?? true;
    this.hdriBackgroundEnabled = initialState.hdriBackground;
    this.hdriBlurriness = initialState.hdriBlurriness ?? 0;
    this.hdriRotation = initialState.hdriRotation ?? 0;
    this.currentHdri = initialState.hdri ?? 'beach';
    // Lens dirt will be initialized after setupComposer

    this.materialController = new MaterialController({
      stateStore: this.stateStore,
      modelRoot: this.modelRoot,
      getCreativeLookKeyLightDir: (out) => this._getCreativeLookKeyLightDir(out),
      afterCreativeLookMaterialRebuild: () => {
        if (
          typeof this.renderer?.compile === 'function' &&
          this.scene &&
          this.camera
        ) {
          this.renderer.compile(this.scene, this.camera);
        }
      },
      onShadingChanged: (mode) => {
        this.currentShading = mode;
        this.diagnosticsController.setModel(this.currentModel, mode);
        this.refreshBoneHelpers();
        // Apply current HDRI environment settings after shading change
        if (this.scene.environment) {
          const intensity = Math.max(0, this.hdriStrength);
          this.updateMaterialsEnvironment(this.scene.environment, intensity);
        }
      },
      onMaterialUpdate: () => {
        // Trigger any additional updates needed after material changes
      },
    });

    this.modelLoader = new ModelLoader();
    this.textureLoader = new THREE.TextureLoader();
    this.setupLights();
    this.setupGround();
    const bootGround = this.stateStore.getState();
    this._ccToggleCtx.prevEnabled = !!bootGround.colorChecker?.enabled;
    this._podiumToggleCtx.prevEnabled = !!bootGround.groundSolid;
    this._podiumGlassToggleCtx.prevEnabled = !!(
      bootGround.groundSolid && (bootGround.podiumGlassSurface ?? bootGround.podiumReflectMesh ?? false)
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
      stateStore: this.stateStore,
    });
    this.lensFlareController.init(initialState, this.hdriEnabled);
    this.lensFlareController.setTimeAnimationPaused(this.panelsShelfScrolling);
    
    // Initialize histogram controller
    const histogramContainer = document.querySelector('#histogramContainer');
    if (histogramContainer) {
      this.histogramController = new HistogramController(
        this.renderer,
        this.canvas,
        histogramContainer,
        this.composer // Pass composer so it can read from the correct render target
      );
      const histogramState = this.stateStore.getState();
      this.histogramController.setEnabled(histogramState.histogramEnabled ?? false);
    }

    this.viewportFramingOverlays = new ViewportFramingOverlays();
    const cam0 = this.stateStore.getState().camera ?? {};
    this.viewportFramingOverlays.syncFromCamera(cam0, {
      letterboxAnimate: false,
      compositionGridAnimate: false,
    });

    // Initialize event manager and register all event listeners
    this.eventManager = new EventManager(this);
    this.eventManager.register();
    this.setupMeshClickDetection();
    this.handleResize();
    
    // Debounce resize handler to prevent excessive calls
    let resizeTimeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.handleResize();
      }, 16); // ~1 frame debounce (16ms at 60fps)
    };
    
    window.addEventListener('resize', debouncedResize);
    
    // Handle fullscreen changes explicitly
    const handleFullscreenChange = () => {
      // Use requestAnimationFrame to ensure fullscreen transition completes
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Double RAF to ensure layout is complete
          this.handleResize();
          this.ui?.syncFullscreenToggle?.();
        });
      });
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
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

  async init() {
    await this.applyStateSnapshot(this.stateStore.getState());
    requestAnimationFrame(() => {
      const container = this.viewport || this.canvas?.parentElement;
      const rect = container?.getBoundingClientRect?.();
      if (rect?.width > 0 && rect?.height > 0) {
        this.groundController?.resizePodiumReflector?.(rect.width, rect.height);
      }
    });
    this.animate();
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
      podiumScale: state.podiumScale,
      gridScale: state.gridScale,
      podiumMetalness: state.podiumMetalness,
      podiumRoughness: state.podiumRoughness,
      podiumReflection: state.podiumReflection,
      podiumClearcoat: state.podiumClearcoat,
      renderer: this.renderer,
      podiumGlassSurface: !!(state.podiumGlassSurface ?? state.podiumReflectMesh ?? false),
      podiumGlassBlur: state.podiumGlassBlur ?? DEFAULT_PODIUM_GLASS_BLUR,
      podiumGlassAmount: state.podiumGlassAmount ?? DEFAULT_PODIUM_GLASS_AMOUNT,
      podiumGlassBrightness: state.podiumGlassBrightness ?? DEFAULT_PODIUM_GLASS_BRIGHTNESS,
      backdropEnabled: !!state.backdropEnabled,
      backdropScale: state.backdropScale ?? 1,
      backdropWidth: state.backdropWidth ?? 2,
      backdropColor: state.backdropColor ?? '#808080',
      backdropRotation: state.backdropRotation ?? 0,
      backdropY: state.backdropY ?? 0,
      backdropTextureEnabled: !!state.backdropTextureEnabled,
      backdropTextureScale: state.backdropTextureScale ?? 1.8,
      debugWireframeEnabled: !!state.wireframe?.alwaysOn,
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
      fallbackBackgroundColor: this.backgroundController?.getColor() ?? '#000000',
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
      fallbackColor: this.backgroundController?.getColor() ?? '#000000',
      onEnvironmentMapUpdated: (texture, intensity) => {
        this.updateMaterialsEnvironment(texture, intensity);
        this.forceRestoreClaySettings();
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
    
    // Initialize image exporter (needs composer)
    this.imageExporter = new ImageExporter({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      composer: this.composer,
      postPipeline: this.postPipeline,
      backgroundController: this.backgroundController,
      syncPostProcessingForLogicalSize: (w, h) =>
        this.syncPostProcessingForLogicalSize(w, h),
      syncPerspectiveProjection: () => this.syncPerspectiveCameraFovAndLens(),
      renderComposerPassForExport: () => {
        this._applyCreativeLookBloomSuppression();
        this._ensureComposerBuffersMatchRenderer();
        this._resetRendererViewportToCanvas();
        this._syncRendererClearForSceneBackground();
        this.composer.render();
        this._resetRendererViewportToCanvas();
      },
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
      syncPerspectiveProjection: () => this.syncPerspectiveCameraFovAndLens(),
      ensureComposerBuffersMatchRenderer: () =>
        this._ensureComposerBuffersMatchRenderer(),
      resetRendererViewportToCanvas: () => this._resetRendererViewportToCanvas(),
      prepareComposerCapture: () => {
        this._applyCreativeLookBloomSuppression();
        this._syncRendererClearForSceneBackground();
      },
      setRotationY: (value) => this.setRotationY(value),
      beginExportOrbitDrive: () => this.cameraController?.beginExportOrbitDrive?.(),
      applyExportOrbitDriveFrame: (t, spins) =>
        this.cameraController?.applyExportOrbitDriveFrame?.(t, spins),
      endExportOrbitDrive: () => {
        this.cameraController?.endExportOrbitDrive?.();
        if (this.cameraAutoOrbit !== 'off') {
          this.setCameraAutoOrbit(this.cameraAutoOrbit);
        }
      },
      getCurrentModel: () => this.currentModel,
      getCurrentFile: () => this.currentFile,
      getCurrentAssetMetadata: () => this.currentAssetMetadata,
      getHdriBackgroundEnabled: () => this.hdriBackgroundEnabled,
      handleResize: () => this.handleResize(),
    });
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
    if (this.postPipeline?.anamorphicBloomPass?.uniforms?.resolution?.value) {
      this.postPipeline.anamorphicBloomPass.uniforms.resolution.value.set(width, height);
    }
    this.groundController?.resizePodiumReflector?.(width, height);
  }

  /**
   * Keeps Three.js vertical FOV and the lens-distortion pass in lockstep (same as the
   * de Carpentier WebGL sample) so the warped sample stays inside the render and avoids
   * black edges. When fisheye is off, uses `camera.fov` from state.
   */
  syncPerspectiveCameraFovAndLens() {
    const state = this.stateStore.getState();
    const fe = state.fisheye;
    const pass = this.postPipeline?.lensDistortionPass;
    if (!pass) {
      this.camera.fov = state.camera?.fov ?? 50;
      this.camera.updateProjectionMatrix();
      return;
    }
    if (!fe?.enabled) {
      pass.enabled = false;
      this.camera.fov = state.camera?.fov ?? 50;
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

    this.camera.fov = verticalFovDeg;
    this.camera.updateProjectionMatrix();

    pass.enabled = true;
    pass.uniforms.strength.value = strength;
    pass.uniforms.height.value = heightUniform;
    pass.uniforms.aspectRatio.value = aspect;
    pass.uniforms.cylindricalRatio.value = cylindricalRatio;
  }



  // registerEvents() - Moved to EventManager.js

  async applyStateSnapshot(state) {
    this.transformController?.applyState(state);
    this.setShading(state.shading);
    this.autoRotateSpeed = state.autoRotate;
    this.setCameraAutoOrbit(state.camera?.autoOrbit ?? 'off');
    this.setCameraHandheld(state.camera?.handheld ?? 'off');
    this.setGroundSolid(state.groundSolid);
    this.setGroundWire(state.groundWire);
    this.setGroundSolidColor(state.groundSolidColor);
    this.setGroundWireColor(state.groundWireColor);
    this.setGroundWireOpacity(state.groundWireOpacity);
    this.setGridY(state.gridY ?? 0);
    this.setPodiumScale(state.podiumScale ?? 1, { updateState: false });
    this.setPodiumMetalness(state.podiumMetalness ?? DEFAULT_MATERIAL_METALNESS, { updateState: false });
    this.setPodiumRoughness(state.podiumRoughness ?? DEFAULT_MATERIAL_ROUGHNESS, { updateState: false });
    this.setPodiumReflection(state.podiumReflection ?? 1, { updateState: false });
    this.setPodiumClearcoat(state.podiumClearcoat ?? 0, { updateState: false });
    this.setPodiumGlassSurface(
      !!(state.podiumGlassSurface ?? state.podiumReflectMesh ?? false),
      { updateState: false },
    );
    this.setPodiumGlassBlur(state.podiumGlassBlur ?? DEFAULT_PODIUM_GLASS_BLUR, {
      updateState: false,
    });
    this.setPodiumGlassAmount(state.podiumGlassAmount ?? DEFAULT_PODIUM_GLASS_AMOUNT, {
      updateState: false,
    });
    this.setPodiumGlassBrightness(state.podiumGlassBrightness ?? DEFAULT_PODIUM_GLASS_BRIGHTNESS, {
      updateState: false,
    });
    this.setBackdropEnabled(!!state.backdropEnabled, { updateState: false });
    this.setBackdropScale(state.backdropScale ?? 1, { updateState: false });
    this.setBackdropWidth(state.backdropWidth ?? 2, { updateState: false });
    this.setBackdropColor(state.backdropColor ?? '#808080', { updateState: false });
    this.setBackdropRotation(state.backdropRotation ?? 0, { updateState: false });
    this.setBackdropY(state.backdropY ?? 0, { updateState: false });
    this.setBackdropTextureEnabled(!!state.backdropTextureEnabled, { updateState: false });
    this.setBackdropTextureScale(state.backdropTextureScale ?? 1.8, { updateState: false });
    this.setSceneGeometryWireframe(!!state.wireframe?.alwaysOn);
    this.setGridScale(state.gridScale ?? 1);
    this.autoExposureController?.applyStateSnapshot(state);
    // Initialize base HDRI strength if not already set
    if (this.baseHdriStrength === undefined) {
      this.baseHdriStrength = (state.hdriStrength ?? 2) * state.exposure;
    }
    this.syncPerspectiveCameraFovAndLens();
    this.cameraController?.setTilt(state.camera.tilt ?? 0);
    this.lightsEnabled = state.lightsEnabled ?? true;
    this.lightsMaster = state.lightsMaster ?? 0.30;
    this.applyLightSettings(state.lights);
    if (!this.lightsEnabled) {
      Object.values(this.lights).forEach((light) => {
        if (!light) return;
        light.intensity = 0;
      });
    }
    this.setLightsRotation(state.lightsRotation ?? 0);
    this.setLightsHeight(state.lightsHeight ?? 5);
    this.setShowLightIndicators(state.showLightIndicators ?? false);
    this.setLightsAutoRotate(state.lightsAutoRotate ?? false);
    this.setLightsCastShadows(state.lightsCastShadows ?? true);
    this.setLightsShadowQuality(state.lightsShadowQuality ?? 'medium');
    this.setLightsShadowSoftness(state.lightsShadowSoftness ?? 4);
    this.setLightsShadowContactOffset(state.lightsShadowContactOffset ?? -0.0001);
    this.setLightsShadowTwoSided(state.lightsShadowTwoSided ?? false);
    
    // Apply individual light properties
    if (state.lights) {
      Object.entries(state.lights).forEach(([lightId, config]) => {
        if (config.intensity !== undefined) {
          this.lightsController?.updateLightProperty(lightId, 'intensity', config.intensity);
        }
        if (config.height !== undefined) {
          this.lightsController?.updateLightProperty(lightId, 'height', config.height);
        }
        if (config.rotate !== undefined) {
          this.lightsController?.updateLightProperty(lightId, 'rotate', config.rotate);
        }
      });
    }
    // Update material controller settings
    if (state.material?.brightness !== undefined) {
      this.materialController.setMaterialBrightness(state.material.brightness);
    }
    if (state.material?.metalness !== undefined) {
      this.materialController.setMaterialMetalness(state.material.metalness);
    }
    if (state.material?.roughness !== undefined) {
      this.materialController.setMaterialRoughness(state.material.roughness);
    }
    if (state.material?.emissive !== undefined) {
      this.materialController.setMaterialEmissive(state.material.emissive);
    }
    // Legacy support
    if (state.diffuseBrightness !== undefined && state.material?.brightness === undefined) {
      this.materialController.setMaterialBrightness(state.diffuseBrightness);
    }
    if (state.clay) {
      this.materialController.setClaySettings(state.clay);
    }
    if (state.fresnel) {
      this.materialController.setFresnelSettings(state.fresnel);
    }
    if (state.subsurface) {
      this.setSubsurfaceSettings(state.subsurface);
    }
    if (state.wireframe) {
      this.materialController.setWireframeSettings(state.wireframe);
    }
    if (state.creativeLook) {
      this.materialController.setCreativeLookSettings(state.creativeLook, {
        skipStateStore: true,
      });
    }
    if (state.svgExtrude?.depth !== undefined) {
      this.setSvgExtrudeDepth(state.svgExtrude.depth);
    }
    if (state.svgExtrude?.normalAngle !== undefined) {
      this.setSvgExtrudeNormalAngle(state.svgExtrude.normalAngle);
    }
    if (state.svgExtrude?.colorDepths !== undefined) {
      this.setSvgExtrudeColorDepths(state.svgExtrude.colorDepths, { updateState: false });
    }
    if (state.svgExtrude?.colorOffsets !== undefined) {
      this.setSvgExtrudeColorOffsets(state.svgExtrude.colorOffsets, { updateState: false });
    }
    if (state.svgExtrude?.flipDirection !== undefined) {
      this.setSvgExtrudeFlipDirection(state.svgExtrude.flipDirection, { updateState: false });
    }
    if (state.svgExtrude) {
      this.setSvgExtrudeColorOverride(
        {
          enabled: !!state.svgExtrude.colorOverride,
          color: state.svgExtrude.overrideColor ?? '#7ed321',
        },
        { updateState: false },
      );
      this.setSvgExtrudeSurface(
        {
          preset: state.svgExtrude.surfacePreset,
          scale: state.svgExtrude.surfaceScale,
        },
        { updateState: false },
      );
    }
    this.setReverseNormals(state.advanced?.reverseNormals ?? false);
    this.lensDirtController?.updateSettings(state.lensDirt);
    this.updateGrain(state.grain);
    this.updateAberration(state.aberration);
    this.backgroundController?.setColor(state.background);
    this.setToneMapping(state.toneMapping ?? 'aces-filmic');
    this.setHdriStrength(state.hdriStrength ?? 2);
    // Initialize color adjustment settings
    this.setContrast(state.camera?.contrast ?? 1.0);
    this.setSaturation(state.camera?.saturation ?? 1.0);
    this.setClarity(state.camera?.clarity ?? 0);
    this.setFade(state.camera?.fade ?? 0);
    this.setSharpness(state.camera?.sharpness ?? 0);
    this.setToneCurve(state.toneCurve);
    this.setTemperature(state.camera?.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K);
    this.setTint((state.camera?.tint ?? 0) / 100);
    this.setHighlights((state.camera?.highlights ?? 0) / 100);
    this.setShadows(cameraShadowsUiToShader(state.camera?.shadows ?? 0));
    const defaultCam = this.stateStore.getDefaults().camera ?? {};
    this.setVignette(effectiveVignetteIntensity(state.camera, defaultCam));
    this.setVignetteColor(state.camera?.vignetteColor ?? '#000000');
    // Initialize clay normal map setting
    if (state.clay?.normalMap !== undefined) {
      this.setClayNormalMap(state.clay.normalMap);
    }
    this.setHdriBlurriness(state.hdriBlurriness ?? 0);
    this.setHdriRotation(state.hdriRotation ?? 0);
    this.setHdriEnabled(state.hdriEnabled);
    this.setHdriBackground(state.hdriBackground);
    this.lensFlareController?.applyStateSnapshot(state);
    await this.setHdriPreset(state.hdri);
    this.applyRenderQualitySettings();
    this.applyColorCheckerFromState(state);
    this._ensureColorCheckerReferenceShadingConsistency();
    this.viewportFramingOverlays.syncFromCamera(state.camera ?? {}, {
      letterboxAnimate: false,
      compositionGridAnimate: false,
    });
  }

  /**
   * Match visibility to settings (pose is updated every frame when enabled).
   */
  applyColorCheckerFromState(state) {
    const cc = state?.colorChecker ?? this.stateStore.getDefaults().colorChecker;
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
  _updatePodiumAppearAnimation() {
    const podium = this.groundController?.podium;
    if (!podium) return;

    const groundSolid = !!this.stateStore.getState().groundSolid;
    const r = stepToggleScaleAnimation(
      this._podiumToggleCtx,
      performance.now(),
      groundSolid,
    );
    podium.visible = r.visible;
    podium.scale.setScalar(r.animMul);
  }

  /** Podium glass on the podium top — uses same shared scale curves as podium toggles. */
  _updatePodiumGlassAppearAnimation() {
    const reflector = this.groundController?.podiumReflector;
    const st = this.stateStore.getState();
    const glassOn = !!(st.groundSolid && st.podiumGlassSurface);

    if (!reflector) {
      this._podiumGlassToggleCtx.prevEnabled = glassOn;
      return;
    }

    const r = stepToggleScaleAnimation(
      this._podiumGlassToggleCtx,
      performance.now(),
      glassOn,
    );
    reflector.visible = r.visible;
    reflector.scale.setScalar(r.animMul);
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
    }
    this.syncAnamorphicBloomFromState();
  }

  syncAnamorphicBloomFromState() {
    const state = this.stateStore.getState();
    const bloomOk = isBloomPipelineActive(state);
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
      LIGHT_SHADOW_MAP_SIZE[normalizeLightShadowQuality(this.lightsShadowQuality)]
      ?? tier.shadowMapSize;
    this.lightsController?.setShadowMapResolution(shadowSize);
    const isUltraShadowQuality = normalizeLightShadowQuality(this.lightsShadowQuality) === 'ultra';
    if (isUltraShadowQuality) {
      this.renderer.shadowMap.type = THREE.VSMShadowMap;
    } else {
      this.renderer.shadowMap.type = tier.softShadowMap
        ? (this.lightsShadowSoftness <= 0.05 ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap)
        : THREE.PCFShadowMap;
    }
  }

  async setHdriPreset(preset) {
    if (!preset || !HDRI_PRESETS[preset]) return;
        this.currentHdri = preset;
    this.ui.beginLoadSpinner();
    try {
      await this.environmentController?.setPreset(preset);
        this.applyHdriMood(preset);
      // Reset auto-exposure luminance state when HDRI changes
      // This allows it to quickly adapt to the new scene brightness
      this.autoExposureController?.resetLuminance();
    } catch (error) {
      console.error('Failed to apply HDRI preset', preset, error);
      this.ui.showToast('Failed to load HDRI');
    } finally {
      this.ui.endLoadSpinner();
    }
  }

  updateMaterialsEnvironment(envTexture, intensity) {
    this.materialController.updateMaterialsEnvironment(
      envTexture,
      intensity,
      this.hdriBlurriness,
    );
    this.groundController?.applyPodiumEnvironment(
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

  forceRestoreClaySettings() {
    this.materialController.forceRestoreClaySettings();
  }

  setHdriBackground(enabled) {
    this.hdriBackgroundEnabled = enabled;

    const bgColor = this.backgroundController?.getColor() ?? '#000000';
    this.environmentController?.setFallbackColor(bgColor);

    this.environmentController?.setBackgroundEnabled(enabled);

    this.backgroundController?.setHdriBackgroundEnabled(enabled);

    this.applyHdriMood(this.currentHdri);
  }

  setLensFlareEnabled(enabled) {
    this.lensFlareController?.setEnabled(enabled);
  }

  setLensFlareRotation(value) {
    this.lensFlareController?.setRotation(value);
  }

  setLensFlareHeight(value) {
    this.lensFlareController?.setHeight(value);
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
    const bgColor = this.backgroundController?.getColor() ?? '#000000';
    this.environmentController?.setFallbackColor(bgColor);
    
    // Notify background controller of HDRI enabled state
    this.backgroundController?.setHdriEnabled(enabled);
    
    this.applyHdriMood(this.currentHdri);
    this.lensFlareController?.setHdriEnabled(enabled);
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
  }

  setHdriRotation(value) {
    this.hdriRotation = Math.min(360, Math.max(0, value));
    this.stateStore.set('hdriRotation', this.hdriRotation);
    this.environmentController?.setRotation(this.hdriRotation);
    // Also rotate lights to stay in sync (without updating HDRI again to avoid loop)
    this.setLightsRotation(this.hdriRotation, { updateUi: true, updateHdri: false });
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
    this.materialController?.setUvCheckerSettings({ enabled: on });
  }

  setUvCheckerScale(scale) {
    const safe = Number.isFinite(scale) ? Math.max(0.05, Math.min(64, scale)) : 1;
    this.stateStore.set('advanced.uvCheckerScale', safe);
    this.materialController?.setUvCheckerScale(safe);
  }

  setUvCheckerStyle(style) {
    const allowed = ['vibrant', 'monochrome'];
    const safe = allowed.includes(style) ? style : 'vibrant';
    this.stateStore.set('advanced.uvCheckerStyle', safe);
    this.materialController?.setUvCheckerStyle(safe);
  }

  updateUvCheckerOverlayTransforms() {
    this.materialController?.updateUvCheckerOverlayTransforms();
  }

  setGroundSolid(enabled) {
    this.groundController?.setSolidEnabled(enabled);
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

  setCameraAutoOrbit(mode) {
    this.cameraAutoOrbit = mode ?? 'off';
    this.cameraController?.setAutoOrbit(this.cameraAutoOrbit);
  }

  setCameraHandheld(mode) {
    let m = mode ?? 'off';
    if (m === 'medium') m = 'high';
    this.cameraHandheld = m;
    this.cameraController?.setHandheldMode(this.cameraHandheld);
  }

  setGroundY(value) {
    this.groundController?.setGroundY(value);
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

    const podiumY = includePodium ? this.groundController?.snapPodiumToBounds(bounds) : null;
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

  snapPodiumToBottom() {
    if (!this.currentModel) {
      this.ui?.showToast?.('Load a mesh before snapping the podium');
      return;
    }

    const bounds = new THREE.Box3().setFromObject(this.currentModel);
    if (!bounds || !isFinite(bounds.min.y)) {
      this.ui?.showToast?.('Unable to align to mesh');
      return;
    }

    const bottomY = this.groundController?.snapPodiumToBounds(bounds);
    if (bottomY === null || bottomY === undefined) {
      this.ui?.showToast?.('Unable to align to mesh');
      return;
    }
    this.stateStore.set('groundY', bottomY);

    const currentState = this.stateStore.getState();
    if (!currentState.groundSolid) {
      this.setGroundSolid(true);
      this.stateStore.set('groundSolid', true);
    }

    this.ui?.showToast?.(
      'Podium snapped to mesh',
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

  setPodiumScale(value, { updateState = true } = {}) {
    const newGroundY = this.groundController?.setPodiumScale(value);
    if (updateState && typeof newGroundY === 'number') {
      this.stateStore.set('groundY', newGroundY);
    }
  }

  setGridScale(value) {
    this.groundController?.setGridScale(value);
  }

  setPodiumMetalness(value, { updateState = true } = {}) {
    this.groundController?.setPodiumMetalness(value);
    if (updateState) this.stateStore.set('podiumMetalness', value);
  }

  setPodiumRoughness(value, { updateState = true } = {}) {
    this.groundController?.setPodiumRoughness(value);
    if (updateState) this.stateStore.set('podiumRoughness', value);
  }

  setPodiumReflection(value, { updateState = true } = {}) {
    this.groundController?.setPodiumReflection(value);
    if (updateState) this.stateStore.set('podiumReflection', value);
  }

  setPodiumClearcoat(value, { updateState = true } = {}) {
    this.groundController?.setPodiumClearcoat(value);
    if (updateState) this.stateStore.set('podiumClearcoat', value);
  }

  setPodiumGlassSurface(enabled, { updateState = true } = {}) {
    const on = !!enabled;
    this.groundController?.setPodiumGlassSurface(on);
    if (updateState) this.stateStore.set('podiumGlassSurface', on);
  }

  setPodiumGlassBlur(value, { updateState = true } = {}) {
    this.groundController?.setPodiumGlassBlur(value);
    if (updateState) this.stateStore.set('podiumGlassBlur', value);
  }

  setPodiumGlassAmount(value, { updateState = true } = {}) {
    this.groundController?.setPodiumGlassAmount(value);
    if (updateState) this.stateStore.set('podiumGlassAmount', value);
  }

  setPodiumGlassBrightness(value, { updateState = true } = {}) {
    this.groundController?.setPodiumGlassBrightness(value);
    if (updateState) this.stateStore.set('podiumGlassBrightness', value);
  }

  setBackdropEnabled(enabled, { updateState = true } = {}) {
    const on = !!enabled;
    this.groundController?.setBackdropEnabled(on);
    if (updateState) this.stateStore.set('backdropEnabled', on);
  }

  setBackdropScale(value, { updateState = true } = {}) {
    this.groundController?.setBackdropScale(value);
    if (updateState) this.stateStore.set('backdropScale', value);
  }

  setBackdropWidth(value, { updateState = true } = {}) {
    this.groundController?.setBackdropWidth(value);
    if (updateState) this.stateStore.set('backdropWidth', value);
  }

  setBackdropColor(color, { updateState = true } = {}) {
    this.groundController?.setBackdropColor(color);
    if (updateState) this.stateStore.set('backdropColor', color);
  }

  setBackdropRotation(value, { updateState = true } = {}) {
    this.groundController?.setBackdropRotation(value);
    if (updateState) this.stateStore.set('backdropRotation', value);
  }

  setBackdropY(value, { updateState = true } = {}) {
    this.groundController?.setBackdropY(value);
    if (updateState) this.stateStore.set('backdropY', value);
  }

  setBackdropTextureEnabled(enabled, { updateState = true } = {}) {
    const on = !!enabled;
    this.groundController?.setBackdropTextureEnabled(on);
    if (updateState) this.stateStore.set('backdropTextureEnabled', on);
  }

  setBackdropTextureScale(value, { updateState = true } = {}) {
    this.groundController?.setBackdropTextureScale(value);
    if (updateState) this.stateStore.set('backdropTextureScale', value);
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
    }
    this.ui?.showToast?.(
      'Backdrop snapped to mesh',
      3200,
      { notification: false },
    );
  }

  setSceneGeometryWireframe(enabled) {
    this.groundController?.setDebugWireframeEnabled(!!enabled);
  }

  applyLightSettings(lightsState) {
    if (!lightsState) return;
    this.lightsController?.applySettings(lightsState);
  }

  setLightsEnabled(enabled) {
    this.lightsEnabled = !!enabled;
    const lightsState = this.stateStore.getState().lights;
    this.lightsController?.setEnabled(this.lightsEnabled, lightsState);
  }

  setLightsMaster(value) {
    this.lightsMaster = value ?? 0.30;
    const lightsState = this.stateStore.getState().lights;
    this.lightsController?.setMaster(this.lightsMaster, lightsState);
  }

  setShowLightIndicators(enabled) {
    this.lightsController?.setIndicatorsVisible(enabled);
    if (enabled) {
      const bounds = this.cameraController?.getModelBounds();
      if (bounds) {
        this.lightsController?.setModelBounds(bounds);
      }
    }
  }

  updateLightIndicators() {
    this.lightsController?.updateIndicators();
  }

  setLightsRotation(value, { updateUi = true, updateHdri = false, updateState = true } = {}) {
    this.lightsRotation = this.lightsController?.setRotation(value) ?? value;
    // Update StateStore to keep it in sync (especially important for auto-rotate)
    if (updateState) {
      this.stateStore.set('lightsRotation', this.lightsRotation);
    }
    // Also rotate HDRI with lights (unless we're being called from setHdriRotation to avoid loop)
    if (updateHdri) {
      this.hdriRotation = this.lightsRotation;
      this.stateStore.set('hdriRotation', this.hdriRotation);
      this.environmentController?.setRotation(this.hdriRotation);
      // Update HDRI rotation slider in UI
      if (this.ui?.inputs?.hdriRotation) {
        this.ui.inputs.hdriRotation.value = this.hdriRotation;
        this.ui.updateValueLabel('hdriRotation', this.hdriRotation, 'angle');
      }
    }
    if (updateUi) {
      this.ui?.setLightsRotation?.(this.lightsRotation);
    }
    // Update light indicators if visible
    this.updateLightIndicators();
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
  }

  setLightsCastShadows(enabled) {
    const next = !!enabled;
    this.lightsCastShadows = next;
    if (this.stateStore.getState().lightsCastShadows !== next) {
      this.stateStore.set('lightsCastShadows', next);
    }
    this.lightsController?.setCastShadows(next);
  }

  setLightsShadowQuality(quality) {
    this.lightsShadowQuality = normalizeLightShadowQuality(quality);
    this.lightsController?.setShadowQuality(this.lightsShadowQuality);
  }

  setLightsShadowSoftness(value) {
    const raw = Number(value);
    this.lightsShadowSoftness = Number.isFinite(raw) ? Math.min(4, Math.max(0, raw)) : 4;
    this.lightsController?.setShadowSoftness(this.lightsShadowSoftness);
    this.applyRenderQualitySettings();
  }

  setLightsShadowContactOffset(value) {
    const raw = Number(value);
    this.lightsShadowContactOffset = Number.isFinite(raw) ? raw : -0.0001;
    this.lightsController?.setShadowContactOffset(this.lightsShadowContactOffset);
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
    const twoSided = settings.twoSided ?? this.lightsShadowTwoSided;

    this.setLightsCastShadows(cast);
    this.setLightsShadowQuality(quality);
    this.setLightsShadowContactOffset(contactOffset);
    this.setLightsShadowTwoSided(twoSided);
    this.setLightsShadowSoftness(softness);
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
    const style = HDRI_MOODS[preset];
    this.hdriMood?.apply(style, {
      hdriBackgroundEnabled: this.hdriBackgroundEnabled,
      hdriEnabled: this.hdriEnabled,
    });
  }

  applyFresnelToModel(root) {
    this.materialController.applyFresnelToModel(root);
  }

  updateDof(settings) {
    this.postPipeline?.updateDof(settings);
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

  updateAberration(settings) {
    this.postPipeline?.updateAberration(settings);
  }

  updateAmbientOcclusion(settings) {
    const defaults = {
      enabled: false,
      intensity: 3,
      radius: 1,
      quality: 'medium',
      color: '#000000',
    };
    const raw = settings ?? this.stateStore.getState().ambientOcclusion;
    const merged = { ...defaults, ...(raw && typeof raw === 'object' ? raw : {}) };
    const ao = sanitizeAmbientOcclusion(merged) ?? merged;
    const tier = resolveRenderQualityTier(
      this.stateStore.getState().renderQuality,
    );
    this.postPipeline?.updateAmbientOcclusion(
      ao,
      tier.forceAmbientOcclusionOff,
    );
  }

  /**
   * Create a large background sphere for proper DOF depth handling
   * @param {string} color - Background color hex string
   * @returns {THREE.Mesh} - Background sphere mesh
   */

  async loadFile(file, options = {}) {
    if (!file) return;
    const previousFile = this.currentFile;
    const hadExistingModel = !!this.currentModel;

    this.currentFile = file;
    this.ui.updateTitle(file.name);
    this.ui.updateTopBarDetail(`${file.name} — Loading…`);
    this.ui.setDropzoneVisible(false);

    // On first load, start with low exposure and fade in
    const isFirstLoad = this.isFirstModelLoad;
    const targetExposure = this.stateStore.getState().exposure ?? 1.0;
    
    if (isFirstLoad) {
      // Set exposure to very low value initially
      const startExposure = 0.1;
      this.autoExposureController?.setExposure(startExposure);
      this.eventBus.emit('scene:exposure', startExposure);
    }

    this.ui.beginLoadSpinner();
    try {
      const svgExtrudeState = this.stateStore.getState()?.svgExtrude || {};
      const asset = await this.modelLoader.loadFile(file, {
        svgExtrudeDepth: svgExtrudeState.depth,
        svgExtrudeNormalAngle: svgExtrudeState.normalAngle,
        svgExtrudeColorDepths: svgExtrudeState.colorDepths || {},
        svgExtrudeColorOffsets: svgExtrudeState.colorOffsets || {},
        svgExtrudeFlipDirection: !!svgExtrudeState.flipDirection,
      });
      this.setModel(asset.object, asset.animations ?? []);
      this._applyAssetMetadata(asset);
      const isFbx = typeof file?.name === 'string' && file.name.toLowerCase().endsWith('.fbx');
      this.stateStore.set('fbxMapSlots.enabled', isFbx);
      if (isFbx) {
        this.eventBus.emit('scene:fbx-map-slots-reset');
      }
      this.updateStatsUI(file, asset.object, asset.gltfMetadata);
      this.ui.updateTopBarDetail(`${file.name} — Idle`);
      if (!options.silent) {
        if (isFbx) {
          this.ui.showMessageAlert(FBX_IMPORT_WIP_ALERT_BODY, 'FBX — work in progress', {
            okLabel: 'CONTINUE',
            modalTone:
              options.suppressSuccessToastSound === true ? 'none' : 'notification',
          });
        } else {
          this.ui.showToast('Model loaded', 3200, {
            notification: options.suppressSuccessToastSound === true ? false : undefined,
          });
        }
      }
      this.eventBus.emit('scene:model-load-complete', { success: true, file });
    } catch (error) {
      console.error('Failed to load model', error);
      const msg =
        error && typeof error.message === 'string' && error.message.trim().length > 0
          ? error.message.trim()
          : 'Could not load model';
      if (msg.length > LONG_TOAST_CHAR_THRESHOLD) {
        this.ui.showMessageAlert(msg, 'Couldn’t load model');
      } else {
        this.ui.showToast(msg);
      }

      if (hadExistingModel) {
        // Keep the viewer visible with the mesh that was already loaded — do not reopen the dark start screen over it.
        this.currentFile = previousFile ?? null;
        this.ui.setDropzoneVisible(false);
        const label = previousFile?.name ?? 'Model';
        this.ui.updateTitle(label);
        this.ui.updateTopBarDetail(`${label} — Idle`);
      } else {
        this.ui.setDropzoneVisible(true);
      }
      this.eventBus.emit('scene:model-load-complete', { success: false, file, error });
    } finally {
      this.ui.endLoadSpinner();
    }
  }

  async loadFileBundle(files) {
    if (!files?.length) return;
    this.ui.beginLoadSpinner();
    try {
      const asset = await this.modelLoader.loadFileBundle(files);
      const sourceFile = asset.sourceFile ?? files[0]?.file;
      if (sourceFile) {
        this.currentFile = sourceFile;
        this.ui.updateTitle(sourceFile.name);
      }
      this.setModel(asset.object, asset.animations ?? []);
      this._applyAssetMetadata(asset);
      const isFbx =
        typeof sourceFile?.name === 'string' && sourceFile.name.toLowerCase().endsWith('.fbx');
      this.stateStore.set('fbxMapSlots.enabled', isFbx);
      if (isFbx) {
        this.eventBus.emit('scene:fbx-map-slots-reset');
      }
      this.updateStatsUI(sourceFile, asset.object, asset.gltfMetadata);
      if (isFbx) {
        this.ui.showMessageAlert(FBX_IMPORT_WIP_ALERT_BODY, 'FBX — work in progress', {
          okLabel: 'CONTINUE',
          modalTone: 'notification',
        });
      } else {
        this.ui.showToast('Folder loaded');
      }
      this.eventBus.emit('scene:model-load-complete', { success: true, file: sourceFile });
    } catch (error) {
        console.error('Folder load failed', error);
      const raw = error?.message || 'Folder load failed';
      const msg = typeof raw === 'string' ? raw.trim() : String(raw);
      if (msg.length > LONG_TOAST_CHAR_THRESHOLD) {
        this.ui.showMessageAlert(msg, 'Couldn’t load folder');
      } else {
        this.ui.showToast(msg);
      }
      this.eventBus.emit('scene:model-load-complete', { success: false, error });
    } finally {
      this.ui.endLoadSpinner();
    }
  }

  clearModel() {
    this.stateStore.set('fbxMapSlots.enabled', false);
    this.stateStore.set('fbxMapSlots.invertNormalY', false);
    this.stateStore.set('fbxMapSlots.pbrUvChannel', 0);
    this.diagnosticsController.clearBoneHelpers();
    this.materialController.clear();
    this.modelLoader.disposeObjectUrls();
    while (this.modelRoot.children.length) {
      const child = this.modelRoot.children[0];
      this.disposeNode(child);
      this.modelRoot.remove(child);
    }
    this.currentModel = null;
    // Detach transform controls when model is cleared
    this.transformControlsTranslate?.detach();
    this.transformControlsRotate?.detach();
    this.transformControlsScale?.detach();
    // Clear occlusion check objects when model is removed
    this.lensFlareController?.setModelRoot(null);
    this.animationController.dispose();
    this.currentAssetMetadata = null;
    this.svgExtrudeImporter = null;
    this.isSvgExtrudeModel = false;
    this.originalGeometryIndices = new WeakMap();
    this.originalGeometryAttributes = new WeakMap();
    this.originalMaterialSides = new WeakMap();
    this.eventBus.emit('ui:advanced-alpha-visible', { visible: false });
    this.eventBus.emit('ui:advanced-glass-visible', { visible: false });
  }

  /**
   * Apply a user-picked image to all non-glass mesh materials (FBX Map Slots UI).
   * @param {{ slot: string, file: File }} payload
   */
  async applyFbxMapSlot(payload = {}) {
    const slot = payload?.slot;
    const file = payload?.file;
    if (!slot || !file || !this.currentModel) return;
    if (!this.stateStore.getState()?.fbxMapSlots?.enabled) return;

    const url = URL.createObjectURL(file);
    try {
      const tex = await this.textureLoader.loadAsync(url);
      tex.userData.orbyFbxUserTexture = true;
      tex.userData.orbyFbxBlobUrl = url;
      this.materialController.applyFbxSlotTexture(slot, tex);
      const shading = this.stateStore.getState()?.shading ?? 'shaded';
      this.materialController.setShading(shading);
      this.eventBus.emit('scene:fbx-map-applied', { slot, name: file.name });
    } catch (err) {
      console.error('FBX map slot load failed', err);
      URL.revokeObjectURL(url);
      this.ui?.showToast?.('Could not load texture');
    }
  }

  setFbxInvertNormalY(enabled) {
    this.stateStore.set('fbxMapSlots.invertNormalY', !!enabled);
    this.materialController?.applyFbxNormalYInvertFromState?.();
  }

  setFbxPbrUvChannel(channel) {
    const n = Number(channel);
    const idx = n === 1 ? 1 : 0;
    this.stateStore.set('fbxMapSlots.pbrUvChannel', idx);
    this.materialController?.applyFbxPbrUvChannelsFromState?.();
  }

  _applyAssetMetadata(asset = {}) {
    this.currentAssetMetadata = asset?.gltfMetadata || null;
    const svgExtrude = asset?.svgExtrude || null;
    const isSvgExtrude = !!svgExtrude?.enabled;
    this.svgExtrudeImporter = isSvgExtrude ? svgExtrude.importer : null;
    this.isSvgExtrudeModel = isSvgExtrude;
    this.stateStore.set('svgExtrude.enabled', isSvgExtrude);
    if (!isSvgExtrude) {
      this.stateStore.set('svgExtrude.availableColors', []);
      this.stateStore.set('svgExtrude.colorDepths', {});
      this.stateStore.set('svgExtrude.colorOffsets', {});
      this.stateStore.set('svgExtrude.flipDirection', false);
      return;
    }
    if (isSvgExtrude) {
      const nextDepth = svgExtrude.depth ?? this.stateStore.getState()?.svgExtrude?.depth ?? 0.2;
      this.stateStore.set('svgExtrude.depth', nextDepth);
      const nextNormalAngle = svgExtrude.normalAngle ?? this.stateStore.getState()?.svgExtrude?.normalAngle ?? 45;
      this.stateStore.set('svgExtrude.normalAngle', nextNormalAngle);
      const flipDirection = !!(svgExtrude.flipDirection ?? this.stateStore.getState()?.svgExtrude?.flipDirection);
      this.stateStore.set('svgExtrude.flipDirection', flipDirection);
      const availableColors = Array.isArray(svgExtrude.colors) ? svgExtrude.colors : [];
      this.stateStore.set('svgExtrude.availableColors', availableColors);
      const existingColorDepths =
        svgExtrude.colorDepths ??
        this.stateStore.getState()?.svgExtrude?.colorDepths ??
        {};
      const existingColorOffsets =
        svgExtrude.colorOffsets ??
        this.stateStore.getState()?.svgExtrude?.colorOffsets ??
        {};
      const nextColorDepths = {};
      const nextColorOffsets = {};
      availableColors.forEach((color) => {
        if (existingColorDepths[color] !== undefined) {
          nextColorDepths[color] = existingColorDepths[color];
        }
        if (existingColorOffsets[color] !== undefined) {
          nextColorOffsets[color] = existingColorOffsets[color];
        }
      });
      this.stateStore.set('svgExtrude.colorDepths', nextColorDepths);
      this.stateStore.set('svgExtrude.colorOffsets', nextColorOffsets);
      this.setSvgExtrudeColorDepths(nextColorDepths, { updateState: false });
      this.setSvgExtrudeColorOffsets(nextColorOffsets, { updateState: false });
      this.setSvgExtrudeFlipDirection(flipDirection, { updateState: false });
      const svgState = this.stateStore.getState().svgExtrude || {};
      this.setSvgExtrudeColorOverride(
        {
          enabled: !!svgState.colorOverride,
          color: svgState.overrideColor ?? '#7ed321',
        },
        { updateState: false },
      );
    }
  }

  disposeNode(object) {
    object.traverse?.((node) => {
      if (node.isMesh) {
        if (node.geometry) node.geometry.dispose();
        const material = node.material;
        if (Array.isArray(material)) {
          material.forEach((mat) => mat?.dispose?.());
        } else {
          material?.dispose?.();
        }
      }
      if (node.isTexture) {
        node.dispose();
      }
    });
  }

  setModel(object, animations) {
    this.clearModel();
    this.currentModel = object;
    
    // Reset transforms before adding new model
    this.transformController?.reset();
    this.modelRoot.add(object);
    
    // Update lens flare occlusion check to only check the model (much more performant)
    this.lensFlareController?.setModelRoot(this.modelRoot);
    
    this.prepareMesh(object);

    // Track if this is the first model load
    const wasFirstLoad = this.isFirstModelLoad;
    if (this.isFirstModelLoad) {
      // Mark that we've loaded the first model
      this.isFirstModelLoad = false;
    }
    const state = this.stateStore.getState();
    
    // Attach transform controls to modelRoot based on widget visibility states
    if (state.moveWidgetEnabled && this.transformControlsTranslate) {
      this.transformControlsTranslate.attach(this.modelRoot);
      this.transformControlsTranslate.visible = true;
    }
    if (state.rotateWidgetEnabled && this.transformControlsRotate) {
      this.transformControlsRotate.attach(this.modelRoot);
      this.transformControlsRotate.visible = true;
    }
    if (state.scaleWidgetEnabled && this.transformControlsScale) {
      this.transformControlsScale.attach(this.modelRoot);
      this.transformControlsScale.visible = true;
    }
    // Apply transform state from StateStore
    this.transformController?.applyState(state);
    if (wasFirstLoad) {
      this._cancelGroundGridBottomAlignAnimation();
      this._alignGroundAndGridToCurrentModelBottom();
    }
    this.materialController.setModel(object, state.shading, {
      clay: state.clay,
      fresnel: state.fresnel,
      subsurface: state.subsurface,
      wireframe: state.wireframe,
      creativeLook: state.creativeLook,
      advanced: state.advanced,
      material: state.material ?? {
        brightness: state.diffuseBrightness ?? DEFAULT_MATERIAL_BRIGHTNESS,
        metalness: 0.0,
        roughness: DEFAULT_MATERIAL_ROUGHNESS,
      },
    });
    this.setShading(state.shading);
    this._emitAdvancedAlphaPanelVisibility();
    this.setReverseNormals(state.advanced?.reverseNormals ?? false);
    this.diagnosticsController.setModel(object, state.shading);
    this.refreshBoneHelpers();
    // Apply Fresnel settings if enabled
    if (state.fresnel?.enabled) {
      this.setFresnelSettings(state.fresnel);
    }
    // Apply current HDRI environment settings to the new model
    if (this.scene.environment) {
      const intensity = Math.max(0, this.hdriStrength);
      this.updateMaterialsEnvironment(this.scene.environment, intensity);
    }
    this.animationController.setModel(this.currentModel, animations);
    
    // Re-apply ground/podium state after model load to ensure visibility is correct
    // Use a small delay to ensure ground meshes are fully initialized
    requestAnimationFrame(() => {
      this.setGroundSolid(state.groundSolid);
      this.setGroundWire(state.groundWire);
      this.materialController?.resyncEmissiveFromImportedMaterials?.();
    });
    
    this.ui.setDropzoneVisible(false);
    this.ui.revealShelf?.({ skipSound: wasFirstLoad });
    
    // Keep the mesh hidden until camera framing has sampled its full-size bounds.
    object.visible = false;
    
    // Smoothly animate camera to focus on the new mesh
    // Use a small delay to ensure everything is set up
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Double RAF ensures model is fully rendered before animating
        if (this.currentModel) {
          if (wasFirstLoad) {
            // First load: fade in exposure and animate camera
            const targetExposure = this.stateStore.getState().exposure ?? 1.0;
            const startExposure = 0.1;
            const duration = 2000; // 2 seconds
            const startTime = performance.now();
            
            const fadeExposure = () => {
              const elapsed = performance.now() - startTime;
              const progress = Math.min(1, elapsed / duration);
              // Use smooth ease-out curve (quadratic) - starts fast, gradually slows
              const easedProgress = 1 - Math.pow(1 - progress, 2);
              const currentExposure = startExposure + (targetExposure - startExposure) * easedProgress;
              
              this.autoExposureController?.setExposure(currentExposure);
              this.eventBus.emit('scene:exposure', currentExposure);
              
              if (progress < 1) {
                requestAnimationFrame(fadeExposure);
              } else {
                // Ensure we end at exact target value
                this.autoExposureController?.setExposure(targetExposure);
                this.eventBus.emit('scene:exposure', targetExposure);
              }
            };
            
            // Start exposure fade-in
            fadeExposure();
          }
          
          // Smoothly animate camera to focus on the mesh (for both first and subsequent loads)
          this.cameraController?.focusOnObjectAnimated(this.currentModel, 1.0);
          this._scaleInMeshOnSpawn(object);
        }
      });
    });
  }

  prepareMesh(object) {
    this.materialController.prepareMesh(object);
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

  _scaleInMeshOnSpawn(object) {
    if (!object || this.currentModel !== object) return;
    if (this._meshSpawnScaleRaf) {
      cancelAnimationFrame(this._meshSpawnScaleRaf);
      this._meshSpawnScaleRaf = null;
    }

    const targetScale = object.scale.clone();
    const duration = Math.min(SCALE_TOGGLE_IN_MS, 320);
    const startTime = performance.now();

    object.visible = true;
    object.scale.set(
      targetScale.x * 0.001,
      targetScale.y * 0.001,
      targetScale.z * 0.001,
    );

    const tick = () => {
      if (this.currentModel !== object) return;
      const t = Math.min(1, (performance.now() - startTime) / duration);
      const m = easeOutExpo(t);
      object.scale.set(
        targetScale.x * m,
        targetScale.y * m,
        targetScale.z * m,
      );

      if (t < 1) {
        this._meshSpawnScaleRaf = requestAnimationFrame(tick);
      } else {
        object.scale.copy(targetScale);
        this._meshSpawnScaleRaf = null;
      }
    };

    this._meshSpawnScaleRaf = requestAnimationFrame(tick);
  }

  setSvgExtrudeDepth(depth) {
    if (!this.currentModel || !this.svgExtrudeImporter || !this.isSvgExtrudeModel) return;
    try {
      this.svgExtrudeImporter.setDepth(depth);
      // Register rebuilt meshes as originals so material controls keep working.
      this.materialController.prepareMesh(this.currentModel);
      this.setShading(this.currentShading);
      const svgState = this.stateStore.getState().svgExtrude || {};
      this.setSvgExtrudeColorOverride(
        {
          enabled: !!svgState.colorOverride,
          color: svgState.overrideColor ?? '#7ed321',
        },
        { updateState: false },
      );
      this.setReverseNormals(this.stateStore.getState().advanced?.reverseNormals ?? false);
      this.refreshBoneHelpers();
      if (this.currentFile) {
        this.updateStatsUI(this.currentFile, this.currentModel, this.currentAssetMetadata);
      }
    } catch (error) {
      console.error('Failed to update SVG extrusion depth', error);
      this.ui?.showToast?.('Could not update SVG depth');
    }
  }

  setSvgExtrudeNormalAngle(normalAngle) {
    if (!this.currentModel || !this.svgExtrudeImporter || !this.isSvgExtrudeModel) return;
    try {
      this.svgExtrudeImporter.setNormalAngleDeg(normalAngle);
      this.materialController.prepareMesh(this.currentModel);
      this.setShading(this.currentShading);
      const svgState = this.stateStore.getState().svgExtrude || {};
      this.setSvgExtrudeColorOverride(
        {
          enabled: !!svgState.colorOverride,
          color: svgState.overrideColor ?? '#7ed321',
        },
        { updateState: false },
      );
      this.setReverseNormals(this.stateStore.getState().advanced?.reverseNormals ?? false);
      this.refreshBoneHelpers();
      if (this.currentFile) {
        this.updateStatsUI(this.currentFile, this.currentModel, this.currentAssetMetadata);
      }
    } catch (error) {
      console.error('Failed to update SVG normal angle', error);
      this.ui?.showToast?.('Could not update SVG angle');
    }
  }

  setSvgExtrudeColorDepths(colorDepths = {}, options = {}) {
    const { updateState = true } = options;
    if (!this.currentModel || !this.svgExtrudeImporter || !this.isSvgExtrudeModel) return;
    const availableColors = this.stateStore.getState()?.svgExtrude?.availableColors || [];
    const sanitized = {};
    Object.entries(colorDepths || {}).forEach(([color, value]) => {
      if (!availableColors.includes(color)) return;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      sanitized[color] = Math.max(0.01, Math.min(1.0, numeric));
    });
    if (updateState) {
      this.stateStore.set('svgExtrude.colorDepths', sanitized);
    }
    try {
      this.svgExtrudeImporter.setColorDepths(sanitized);
      this.materialController.prepareMesh(this.currentModel);
      this.setShading(this.currentShading);
      const svgState = this.stateStore.getState().svgExtrude || {};
      this.setSvgExtrudeColorOverride(
        {
          enabled: !!svgState.colorOverride,
          color: svgState.overrideColor ?? '#7ed321',
        },
        { updateState: false },
      );
      this.setReverseNormals(this.stateStore.getState().advanced?.reverseNormals ?? false);
      this.refreshBoneHelpers();
      if (this.currentFile) {
        this.updateStatsUI(this.currentFile, this.currentModel, this.currentAssetMetadata);
      }
    } catch (error) {
      console.error('Failed to update SVG color depths', error);
      this.ui?.showToast?.('Could not update SVG color depths');
    }
  }

  setSvgExtrudeColorDepth({ color, depth } = {}) {
    if (!color) return;
    const numericDepth = Number(depth);
    if (!Number.isFinite(numericDepth)) return;
    const state = this.stateStore.getState();
    const baseDepth = Number(state.svgExtrude?.depth ?? 0.2);
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
    const availableColors = this.stateStore.getState()?.svgExtrude?.availableColors || [];
    const sanitized = {};
    Object.entries(colorOffsets || {}).forEach(([color, value]) => {
      if (!availableColors.includes(color)) return;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      sanitized[color] = Math.max(-1.0, Math.min(1.0, numeric));
    });
    if (updateState) {
      this.stateStore.set('svgExtrude.colorOffsets', sanitized);
    }
    try {
      this.svgExtrudeImporter.setColorOffsets(sanitized);
      this.materialController.prepareMesh(this.currentModel);
      this.setShading(this.currentShading);
      const svgState = this.stateStore.getState().svgExtrude || {};
      this.setSvgExtrudeColorOverride(
        {
          enabled: !!svgState.colorOverride,
          color: svgState.overrideColor ?? '#7ed321',
        },
        { updateState: false },
      );
      this.setReverseNormals(this.stateStore.getState().advanced?.reverseNormals ?? false);
      this.refreshBoneHelpers();
      if (this.currentFile) {
        this.updateStatsUI(this.currentFile, this.currentModel, this.currentAssetMetadata);
      }
    } catch (error) {
      console.error('Failed to update SVG color offsets', error);
      this.ui?.showToast?.('Could not update SVG color offsets');
    }
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
    if (!this.currentModel || !this.svgExtrudeImporter || !this.isSvgExtrudeModel) return;
    try {
      this.svgExtrudeImporter.setFlipDirection(flipDirection);
      this.materialController.prepareMesh(this.currentModel);
      this.setShading(this.currentShading);
      const svgState = this.stateStore.getState().svgExtrude || {};
      this.setSvgExtrudeColorOverride(
        {
          enabled: !!svgState.colorOverride,
          color: svgState.overrideColor ?? '#7ed321',
        },
        { updateState: false },
      );
      this.setReverseNormals(this.stateStore.getState().advanced?.reverseNormals ?? false);
      this.refreshBoneHelpers();
      if (this.currentFile) {
        this.updateStatsUI(this.currentFile, this.currentModel, this.currentAssetMetadata);
      }
    } catch (error) {
      console.error('Failed to update SVG extrude direction', error);
      this.ui?.showToast?.('Could not update SVG direction');
    }
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
    this.materialController.reapplyTransparencyPipeline();
    this.refreshMaterialSidesForReverseNormals();
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
    }
    if (!this.currentModel || !this.isSvgExtrudeModel) return;
    reapplySvgExtrudeProceduralFromState(
      this.currentModel,
      this.stateStore,
      this.currentShading,
    );
    const svgState = this.stateStore.getState().svgExtrude || {};
    this.setSvgExtrudeColorOverride(
      {
        enabled: !!svgState.colorOverride,
        color: svgState.overrideColor ?? '#7ed321',
      },
      { updateState: false },
    );
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
   * Sync transform values from gizmo back to state/UI
   * Called when user drags the transform controls
   */
  _syncTransformFromGizmo() {
    if (!this.modelRoot) return;
    
    // Extract transform values from modelRoot
    const scale = this.modelRoot.scale.x; // Assuming uniform scale
    const xOffset = this.modelRoot.position.x;
    const yOffset = this.modelRoot.position.y;
    const zOffset = this.modelRoot.position.z;
    const rotationX = THREE.MathUtils.radToDeg(this.modelRoot.rotation.x);
    const rotationY = THREE.MathUtils.radToDeg(this.modelRoot.rotation.y);
    const rotationZ = THREE.MathUtils.radToDeg(this.modelRoot.rotation.z);
    
    // Update state store
    this.stateStore.set('scale', scale);
    this.stateStore.set('xOffset', xOffset);
    this.stateStore.set('yOffset', yOffset);
    this.stateStore.set('zOffset', zOffset);
    this.stateStore.set('rotationX', rotationX);
    this.stateStore.set('rotationY', rotationY);
    this.stateStore.set('rotationZ', rotationZ);
    
    // Emit events to update UI sliders (using correct event names)
    this.eventBus.emit('mesh:scale', scale);
    this.eventBus.emit('mesh:xOffset', xOffset);
    this.eventBus.emit('mesh:yOffset', yOffset);
    this.eventBus.emit('mesh:zOffset', zOffset);
    this.eventBus.emit('mesh:rotationX', rotationX);
    this.eventBus.emit('mesh:rotationY', rotationY);
    this.eventBus.emit('mesh:rotationZ', rotationZ);
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

  refreshBoneHelpers() {
    this.diagnosticsController.refreshBoneHelpers(this.currentShading);
  }

  applyCameraPreset(preset) {
    this.cameraController?.applyCameraPreset(preset);
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

  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = this.clock.getDelta();
    this.animationController.update(delta);
    if (this.autoRotateSpeed && this.currentModel) {
      this.modelRoot.rotation.y += delta * this.autoRotateSpeed;
    }
    if (this.lightsAutoRotate) {
      const deltaDegrees = this.lightsAutoRotateSpeed * delta;
      // During auto-rotate, skip StateStore updates to avoid triggering full UI sync every frame
      // StateStore will be synced when auto-rotate stops (in setLightsAutoRotate)
      this.setLightsRotation(this.lightsRotation + deltaDegrees, { updateState: false });
    }
    this.cameraController.update();
    // Update camera auto-orbit
    if (this.cameraAutoOrbit !== 'off') {
      this.cameraController.updateAutoOrbit(delta);
    }
    this.cameraController.applyHandheldMotion(delta);
    this.materialController.updateCreativeLookTime(this.clock.elapsedTime);
    this._updateColorCheckerPose();
    this._updatePodiumAppearAnimation();
    this._updatePodiumGlassAppearAnimation();
    this._updateBackdropAppearAnimation();
    this.diagnosticsController.update(delta);
    if (!this.panelsShelfScrolling) {
      this.postPipeline?.updateGrainTime(delta);
    }
    this.updateWireframeOverlayTransforms();
    this.updateUvCheckerOverlayTransforms();
    this._updateBackgroundSphere();
    this.render();
    
    // Update histogram after rendering (skip during shelf scroll to avoid readPixels stall)
    if (this.histogramController && !this.panelsShelfScrolling) {
      this.histogramController.update();
    }
  }

  /**
   * Update background sphere position to follow camera
   * This ensures it's always behind everything for proper DOF depth
   */
  _updateBackgroundSphere() {
    this.backgroundController?.updateSpherePosition();
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
      lc.individualProperties?.key?.enabled !== false &&
      key.intensity > 1e-6;
    if (!keyOn) {
      return v.set(0.35, 0.92, 0.42).normalize();
    }
    key.getWorldDirection(v);
    return v.negate().normalize();
  }

  /**
   * EffectComposer RTs use `logical × composer._pixelRatio`. If that drifts from
   * `renderer.getPixelRatio()` (async resize, Ultra/Medium toggle), podium blur restores the
   * viewport with `rtWidth / rendererPR` and undershoots (~¾ frame + L-shaped black bars).
   */
  _ensureComposerBuffersMatchRenderer() {
    if (!this.composer?.renderTarget1) return;
    const gl = this.renderer.getContext();
    let bw;
    let bh;
    if (gl && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0) {
      bw = gl.drawingBufferWidth;
      bh = gl.drawingBufferHeight;
    } else {
      const db = new THREE.Vector2();
      this.renderer.getDrawingBufferSize(db);
      bw = db.x;
      bh = db.y;
    }
    const rt = this.composer.renderTarget1;
    if (Math.abs(rt.width - bw) <= 2 && Math.abs(rt.height - bh) <= 2) {
      return;
    }
    const logical = fullViewportLogicalSize(this.renderer);
    this.syncPostProcessingForLogicalSize(logical.x, logical.y);
  }

  /** Reset logical viewport + scissor around the post stack (passes may leave partial viewport). */
  _resetRendererViewportToCanvas() {
    const r = this.renderer;
    const v = fullViewportLogicalSize(r);
    r.setViewport(0, 0, v.x, v.y);
    if (typeof r.setScissorTest === 'function') {
      r.setScissorTest(false);
    }
  }

  /**
   * Bloom / several ShaderPasses temporarily set clear alpha (e.g. 0). If that lingers in Three's
   * tracked clear state, the next frame's RenderPass can snapshot a bad `oldClearAlpha` and clear
   * the scene RT wrong → random black behind the HDRI. Reset before EffectComposer each frame.
   */
  _syncRendererClearForSceneBackground() {
    const r = this.renderer;
    const bg = this.scene.background;
    if (bg == null) {
      const hex = this.backgroundController?.getColor() ?? '#000000';
      r.setClearColor(new THREE.Color(hex), 1);
      return;
    }
    if (bg.isColor) {
      r.setClearColor(bg, 1);
      return;
    }
    r.setClearColor(0x000000, 1);
  }

  /**
   * UnrealBloomPass / tint / anamorphic aggressively rewrite clear alpha and RT state; combined with
   * Shader Lab materials that causes intermittent black regions. Same logic must run before any
   * EffectComposer capture path (interactive render, PNG export, video frames).
   */
  _applyCreativeLookBloomSuppression() {
    const creativeLookOn =
      this.materialController?.getCreativeLookSettings?.()?.enabled === true;

    if (creativeLookOn && this.postPipeline) {
      if (this.postPipeline.bloomPass) this.postPipeline.bloomPass.enabled = false;
      if (this.postPipeline.bloomTintPass) this.postPipeline.bloomTintPass.enabled = false;
      if (this.postPipeline.anamorphicBloomPass) {
        this.postPipeline.anamorphicBloomPass.enabled = false;
      }
      this._creativeBloomWasSuppressed = true;
    } else if (this._creativeBloomWasSuppressed) {
      this._creativeBloomWasSuppressed = false;
      this.updateBloom(this.stateStore.getState().bloom);
      this.applyRenderQualityVisualOverrides();
    }
  }

  render() {
    // Continuously protect clay settings during render to prevent any resets
    // This runs every frame to ensure values NEVER go to 0
    this.materialController.forceRestoreClaySettings();
    
    if (this.unlitMode) {
      const previousExposure = this.renderer.toneMappingExposure;
      const previousColor = this.renderer.getClearColor(new THREE.Color()).clone();
      const previousAlpha = this.renderer.getClearAlpha();
      this.renderer.toneMappingExposure = 1;
      const bgColor = this.backgroundController?.getColor() ?? '#000000';
      this.renderer.setClearColor(new THREE.Color(bgColor), 1);
      this._resetRendererViewportToCanvas();
      this.renderer.render(this.scene, this.camera);
      this.renderer.setClearColor(previousColor, previousAlpha);
      this.renderer.toneMappingExposure = previousExposure;
      return;
    }
    this.autoExposureController?.update(this.unlitMode);
    // Update lens dirt exposure factor from auto-exposure luminance
    this.lensDirtController?.updateExposureFactor();

    this._applyCreativeLookBloomSuppression();

    if (this.composer) {
      this._ensureComposerBuffersMatchRenderer();
      this._resetRendererViewportToCanvas();
      this._syncRendererClearForSceneBackground();
      this.composer.render();
      this._resetRendererViewportToCanvas();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  handleResize() {
    // Use requestAnimationFrame to ensure DOM has updated before reading dimensions
    requestAnimationFrame(() => {
      if (this._suppressResizeForExport) {
        return;
      }
      // Get dimensions from the viewport container (parent of canvas)
      // This is more reliable since the canvas is absolutely positioned with inset: 0
      const container = this.viewport || this.canvas.parentElement;
      const containerRect = container ? container.getBoundingClientRect() : null;
      const canvasRect = this.canvas.getBoundingClientRect();
      
      // Prefer container dimensions, fallback to canvas, then window
      const width = containerRect 
        ? Math.floor(containerRect.width) 
        : (Math.floor(canvasRect.width) || window.innerWidth);
      const height = containerRect 
        ? Math.floor(containerRect.height) 
        : (Math.floor(canvasRect.height) || window.innerHeight);
      
      // Ensure we have valid dimensions
      if (width <= 0 || height <= 0) {
        console.warn('Invalid dimensions during resize, skipping');
        return;
      }
      
      // Check if we're in fullscreen mode
      const isFullscreen = !!(document.fullscreenElement || 
                              document.webkitFullscreenElement || 
                              document.mozFullScreenElement || 
                              document.msFullscreenElement);
      
      // In fullscreen, use window dimensions to ensure we fill the entire screen
      const finalWidth = isFullscreen ? window.innerWidth : width;
      const finalHeight = isFullscreen ? window.innerHeight : height;
      
      // Update renderer size
      // Pass false to prevent Three.js from setting canvas width/height attributes
      // (CSS handles the display size, we just need renderer internal size to match)
      this.renderer.setSize(finalWidth, finalHeight, false);
      
      // Ensure canvas element matches (for absolutely positioned elements)
      if (this.canvas.style.width !== '100%' || this.canvas.style.height !== '100%') {
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
      }
      
      // Update camera aspect ratio; FOV + lens pass must match (fisheye)
      this.camera.aspect = finalWidth / finalHeight;
      this.syncPerspectiveCameraFovAndLens();

      this.syncPostProcessingForLogicalSize(finalWidth, finalHeight);
    });
  }

  async exportPng(settings = {}) {
    const { transparent = false, size = 2 } = settings;
    this._suppressResizeForExport = true;
    try {
      if (transparent) {
        if (!this.currentModel) return;
        const ok = await this.imageExporter.exportTransparentPng(
          this.currentModel,
          this.currentFile,
          this.cameraController,
          size,
        );
        if (ok) this.ui?.uiSounds?.playRenderFinished();
      } else {
        const originalSize = new THREE.Vector2();
        this.renderer.getSize(originalSize);
        const originalPixelRatio = this.renderer.getPixelRatio();

        const cinematicLetterbox219 = !!this.stateStore
          .getState()
          .camera?.cinematicLetterbox219;
        await this.imageExporter.exportPng(
          this.currentFile,
          originalSize,
          originalPixelRatio,
          size,
          cinematicLetterbox219,
        );
        this.ui?.uiSounds?.playRenderFinished();
      }
    } finally {
      this._suppressResizeForExport = false;
      this.handleResize();
    }
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

  async exportSvgColor(detail = 'high') {
    if (!this.currentModel) {
      this.ui?.showToast?.('Load a mesh before exporting SVG');
      return;
    }
    const level =
      detail === 'low' || detail === 'medium' || detail === 'high' ? detail : 'high';
    try {
      this.ui?.showToast?.('Exporting SVG (color)…');
      await this.imageExporter.exportSvgColor(
        this.currentModel,
        this.currentFile,
        level,
      );
      this.ui?.uiSounds?.playRenderFinished();
      this.ui?.showToast?.('SVG (color) exported', 3200, { notification: false });
    } catch (error) {
      console.error('SVG (color) export failed', error);
      this.ui?.showToast?.('SVG (color) export failed');
    }
  }

  async exportSvgGlb() {
    if (!this.currentModel) {
      this.ui?.showToast?.('Load a mesh before exporting GLB');
      return;
    }
    if (!this.isSvgExtrudeModel) {
      this.ui?.showToast?.('Export .GLB is for imported SVG meshes only');
      return;
    }
    try {
      this.ui?.showToast?.('Exporting .GLB…');
      const sourceName = this.currentFile?.name || this.currentAssetMetadata?.assetName || 'svg-extrude';
      await this.svgGlbExporter.exportFromModelRoot(this.modelRoot, sourceName);
      this.ui?.uiSounds?.playRenderFinished();
      this.ui?.showToast?.('.GLB exported', 3200, { notification: false });
    } catch (error) {
      console.error('SVG GLB export failed', error);
      this.ui?.showToast?.('SVG .GLB export failed');
    }
  }

  async exportVideo(settings = {}) {
    await this.videoExporter?.exportVideo(settings);
  }
}

