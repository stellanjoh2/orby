import * as THREE from 'three';
import { TransformControls } from './vendor/TransformControls.js';
import { HDRI_PRESETS, HDRI_STRENGTH_UNIT, HDRI_MOODS } from './config/hdri.js';
import {
  WIREFRAME_OFFSET,
  WIREFRAME_POLYGON_OFFSET_FACTOR,
  WIREFRAME_POLYGON_OFFSET_UNITS,
  WIREFRAME_OPACITY_VISIBLE,
  WIREFRAME_OPACITY_OVERLAY,
  resolveBloomQualityTier,
  isBloomPipelineActive,
  resolveRenderQualityTier,
  DEFAULT_MATERIAL_BRIGHTNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_MATERIAL_METALNESS,
  DEFAULT_BASE_GLASS_BLUR,
  DEFAULT_BASE_GLASS_AMOUNT,
  DEFAULT_BASE_GLASS_BRIGHTNESS,
  sanitizeAmbientOcclusion,
} from './constants.js';
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
import { RenderLoopController } from './scene/RenderLoopController.js';
import { ComposerLifecycle } from './scene/ComposerLifecycle.js';
import { SceneStateApplier } from './scene/SceneStateApplier.js';
import { ModelLifecycleManager } from './scene/ModelLifecycleManager.js';
import {
  isFisheyeEnabledInState,
  showFisheyePngExportBlockedAlert,
} from './export/fisheyeExportAlert.js';
import {
  runSvgExtrudeImporterMutation,
  sanitizeSvgExtrudeColorDepths,
  sanitizeSvgExtrudeColorOffsets,
} from './scene/SvgExtrudeSceneOps.js';
import { SceneMeshClickHandler } from './scene/SceneMeshClickHandler.js';
import { ViewportFramingOverlays } from './scene/ViewportFramingOverlays.js';
import { normalizeIsometricState } from './camera/isometricPresets.js';
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

  async shutdownStudio() {
    return shutdownStudioLifecycle(this);
  }

  /** Lightweight shell — no WebGL until the first model load. */
  _initStudioShell(initialState) {
    this.currentShading = initialState.shading;
    this.autoRotateSpeed = 0;
    this.cameraAutoOrbit = initialState.camera?.autoOrbit ?? 'off';
    this.cameraHandheld = initialState.camera?.handheld ?? 'off';
    this.lightsMaster = initialState.lightsMaster ?? 0.30;
    this.lightsEnabled = initialState.lightsEnabled ?? true;
    this.lightsRotation = initialState.lightsRotation ?? 0;
    this.lightsAutoRotate = initialState.lightsAutoRotate ?? false;
    this.lightsAutoRotateSpeed = 30;
    this.currentFile = null;
    this.currentModel = null;
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
    this.lightsShadowColor = initialState.lightsShadowColor ?? '#000000';
    this.lightsShadowOpacity = Number.isFinite(initialState.lightsShadowOpacity)
      ? Math.min(1, Math.max(0, initialState.lightsShadowOpacity))
      : 0.25;

    this.modelLoader = new ModelLoader();
    this.modelLifecycle = new ModelLifecycleManager(this);
    this.svgGlbExporter = new SvgGlbExporter();
    this.animationController = new AnimationController({
      onClipsChanged: (clips) => this.ui.setAnimationClips(clips),
      onPlayStateChanged: (playing) => this.ui.setAnimationPlaying(playing),
      onTimeUpdate: (current, duration) =>
        this.ui.updateAnimationTime(current, duration),
      onTopBarUpdate: (detail) => this.ui.updateTopBarDetail(detail),
      getFileName: () => this.currentFile?.name ?? 'model.glb',
    });

    this._ccToggleCtx = createToggleScaleContext();
    this._baseToggleCtx = createToggleScaleContext();
    this._baseGlassToggleCtx = createToggleScaleContext();
    this._backdropToggleCtx = createToggleScaleContext();
    const bootGround = this.stateStore.getState();
    this._ccToggleCtx.prevEnabled = !!bootGround.colorChecker?.enabled;
    this._baseToggleCtx.prevEnabled = !!bootGround.groundSolid;
    this._baseGlassToggleCtx.prevEnabled = !!(
      bootGround.groundSolid && (bootGround.baseGlassSurface ?? bootGround.podiumReflectMesh ?? false)
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

    this.textureLoader = new THREE.TextureLoader();
    this.setupLights();
    this.setupGround();
    const bootGround = this.stateStore.getState();
    this._ccToggleCtx.prevEnabled = !!bootGround.colorChecker?.enabled;
    this._baseToggleCtx.prevEnabled = !!bootGround.groundSolid;
    this._baseGlassToggleCtx.prevEnabled = !!(
      bootGround.groundSolid && (bootGround.baseGlassSurface ?? bootGround.podiumReflectMesh ?? false)
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

    this.stateApplier = new SceneStateApplier(this);
    this.setupMeshClickDetection();
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
    this.ui?.updateTitle?.('Orby');
    this.ui?.updateTopBarDetail?.('');
    this.animationController = new AnimationController({
      onClipsChanged: (clips) => this.ui.setAnimationClips(clips),
      onPlayStateChanged: (playing) => this.ui.setAnimationPlaying(playing),
      onTimeUpdate: (current, duration) =>
        this.ui.updateAnimationTime(current, duration),
      onTopBarUpdate: (detail) => this.ui.updateTopBarDetail(detail),
      getFileName: () => this.currentFile?.name ?? 'model.glb',
    });

    this.meshClickHandler?.detach?.();

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
    this.lensDirtController?.dispose?.();
    this.lensDirtController = null;
    this.autoExposureController?.dispose?.();
    this.autoExposureController = null;
    this.environmentController?.dispose?.();
    this.environmentController = null;
    this.groundController?.disposeMeshes?.();
    this.backgroundController?.dispose?.();
    this.backgroundController = null;
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
      backdropTextureEnabled: !!state.backdropTextureEnabled,
      backdropTextureScale: state.backdropTextureScale ?? 1.8,
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
      composer: this.composer,
      postPipeline: this.postPipeline,
      backgroundController: this.backgroundController,
      getCreativeLookEnabled: () =>
        this.materialController?.getCreativeLookSettings?.()?.enabled === true,
      syncPostProcessingForLogicalSize: (w, h) =>
        this.syncPostProcessingForLogicalSize(w, h),
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
      renderComposerPassForExport: () => this.composerLifecycle.renderComposerPassForExport(),
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
    this.groundController?.resizeBaseReflector?.(width, height);
    this.groundController?.resizeGridLines?.(width, height);
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



  // registerEvents() - Moved to EventManager.js

  async applyStateSnapshot(state) {
    await this.stateApplier.apply(state);
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
    const podium = this.groundController?.podium;
    if (!podium) return;

    const groundSolid = !!this.stateStore.getState().groundSolid;
    const r = stepToggleScaleAnimation(
      this._baseToggleCtx,
      performance.now(),
      groundSolid,
    );
    podium.visible = r.visible;
    podium.scale.setScalar(r.animMul);
  }

  /** Base glass on the base top — same shared scale curves as base toggles. */
  _updateBaseGlassAppearAnimation() {
    const reflector = this.groundController?.podiumReflector;
    const st = this.stateStore.getState();
    const glassOn = !!(
      st.groundSolid &&
      (st.baseGlassSurface ?? st.podiumReflectMesh ?? false)
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

  setHdriRotation(value, { updateState = true, updateUi = false } = {}) {
    const normalized = ((value % 360) + 360) % 360;
    this.hdriRotation = normalized;
    if (updateState) {
      this.stateStore.set('hdriRotation', this.hdriRotation);
    }
    this.environmentController?.setRotation(this.hdriRotation);
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
    if (!currentState.groundSolid) {
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

  setBaseGlassSurface(enabled, { updateState = true } = {}) {
    const on = !!enabled;
    this.groundController?.setBaseGlassSurface(on);
    if (updateState) this.stateStore.set('baseGlassSurface', on);
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
    this.ui?.applyBlockStates?.(this.stateStore.getState());
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
    // Wireframe display mode targets the loaded mesh overlay only.
    if (enabled) return;
    this.groundController?.setDebugWireframeEnabled(false);
  }

  applyLightSettings(lightsState) {
    if (!lightsState) return;
    this.lightsController?.applySettings(lightsState);
  }

  setLightsEnabled(enabled) {
    this.lightsEnabled = !!enabled;
    const lightsState = this.stateStore.getState().lights;
    this.lightsController?.setEnabled(this.lightsEnabled, lightsState);

    if (this.lightsEnabled) {
      ['key', 'fill', 'rim', 'ambient'].forEach((lightId) => {
        const on = lightsState?.[lightId]?.enabled !== false;
        this.lightsController?.updateLightProperty(lightId, 'enabled', on);
      });
    } else {
      ['key', 'fill', 'rim', 'ambient'].forEach((lightId) => {
        this.lightsController?.updateLightProperty(lightId, 'enabled', false);
      });
    }

    this._syncEffectiveCastShadows();
    this._applyShadowTintToScene();
  }

  _isShadowTintActive() {
    return !!this.lightsEnabled && this.lightsCastShadows !== false;
  }

  _syncEffectiveCastShadows() {
    const cast = this._isShadowTintActive();
    this.lightsController?.setCastShadows(cast);
    const lightsState = this.stateStore.getState().lights;
    ['key', 'fill', 'rim'].forEach((lightId) => {
      this.lightsController?.updateLightProperty(lightId, 'castShadows', cast);
      if (lightsState?.[lightId]) {
        this.stateStore.set(`lights.${lightId}.castShadows`, cast);
      }
    });
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
    this._syncEffectiveCastShadows();
    this._applyShadowTintToScene();
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

  setLightsShadowColor(color) {
    const next = color ?? '#000000';
    this.lightsShadowColor = next;
    if (this.stateStore.getState().lightsShadowColor !== next) {
      this.stateStore.set('lightsShadowColor', next);
    }
    this._applyShadowTintToScene();
  }

  setLightsShadowOpacity(value) {
    const raw = Number(value);
    this.lightsShadowOpacity = Number.isFinite(raw)
      ? Math.min(1, Math.max(0, raw))
      : 0.25;
    if (this.stateStore.getState().lightsShadowOpacity !== this.lightsShadowOpacity) {
      this.stateStore.set('lightsShadowOpacity', this.lightsShadowOpacity);
    }
    this._applyShadowTintToScene();
  }

  _applyShadowTintToScene() {
    const color = this.lightsShadowColor ?? '#000000';
    const strength = this._isShadowTintActive() ? 1 : 0;
    const opacity = this.lightsShadowOpacity ?? 0.25;
    this.materialController?.setShadowTintSettings({ color, strength, opacity });
    const ground = this.groundController;
    const tintOpts = { color, strength, opacity };
    if (ground?.podium) this.materialController?.applyShadowTintToObject(ground.podium, tintOpts);
    if (ground?.backdrop) {
      this.materialController?.clearShadowTintFromObject(ground.backdrop);
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
    const shadowColor = settings.color ?? this.lightsShadowColor;
    const shadowOpacity = settings.opacity ?? this.lightsShadowOpacity;
    const twoSided = settings.twoSided ?? this.lightsShadowTwoSided;

    this.setLightsCastShadows(cast);
    this.setLightsShadowQuality(quality);
    this.setLightsShadowContactOffset(contactOffset);
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

  setSvgExtrudeDepth(depth) {
    runSvgExtrudeImporterMutation(this, () => this.svgExtrudeImporter.setDepth(depth), {
      logLabel: 'update SVG extrusion depth',
      toastOnError: 'Could not update SVG depth',
    });
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
   * @param {{ updateState?: boolean }} [options]
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
    return true;
  }

  _afterPivotChange() {
    if (!this.currentModel) return;
    this.currentModel.updateMatrixWorld(true);
    this.modelRoot.updateMatrixWorld(true);
    this.cameraController?.refreshModelBounds(this.currentModel);
    this.updateWireframeOverlayTransforms();
    this.updateUvCheckerOverlayTransforms();
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
    this._applyShadowTintToScene();
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

    if (!cc?.isIsometricModeActive?.()) {
      cc?.beginIsometricMode?.();
    }

    const focus = cc?.getModelBounds?.()?.center ?? cc?.getControls?.()?.target;
    if (focus) {
      cc.getControls().target.copy(focus);
    }

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

  render() {
    if (!this.isStudioReady || !this.renderer) return;
    if (this.unlitMode) {
      const previousExposure = this.renderer.toneMappingExposure;
      const previousColor = this.renderer.getClearColor(new THREE.Color()).clone();
      const previousAlpha = this.renderer.getClearAlpha();
      this.renderer.toneMappingExposure = 1;
      const bgColor = this.backgroundController?.getColor() ?? '#000000';
      this.renderer.setClearColor(new THREE.Color(bgColor), 1);
      this.composerLifecycle?.resetRendererViewportToCanvas();
      this.renderer.render(this.scene, this.camera);
      this.renderer.setClearColor(previousColor, previousAlpha);
      this.renderer.toneMappingExposure = previousExposure;
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
  }

  async exportPng(settings = {}) {
    if (isFisheyeEnabledInState(this.stateStore)) {
      showFisheyePngExportBlockedAlert(this.ui);
      return;
    }
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
    if (settings?.format === 'png' && isFisheyeEnabledInState(this.stateStore)) {
      showFisheyePngExportBlockedAlert(this.ui);
      return;
    }
    await this.videoExporter?.exportVideo(settings);
  }
}

