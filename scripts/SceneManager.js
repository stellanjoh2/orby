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
  resolveRenderQualityTier,
  DEFAULT_MATERIAL_ROUGHNESS,
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
import { HistogramController } from './render/HistogramController.js';
import { SvgGlbExporter } from './export/SvgGlbExporter.js';
import { EventManager } from './scene/EventManager.js';
import { applyLookFilterPreset } from './ui/lookFilterApply.js';


export class SceneManager {
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    /** True while the settings shelf `.panels` is being scrolled (drives light FX throttling). */
    this.panelsShelfScrolling = false;
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
      preserveDrawingBuffer: true,
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
    // Disable tone mapping on renderer - we'll apply it as a post-processing pass instead
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMappingExposure = 1;

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
        this.stateStore.set('lightsHeight', currentHeight);
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
      ui: this.ui,
    });

    this.currentShading = initialState.shading;
    this.autoRotateSpeed = 0;
    this.cameraAutoOrbit = initialState.camera?.autoOrbit ?? 'off';
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
        });
      });
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
  }

  setupMeshClickDetection() {
    // Raycaster for detecting mesh clicks
    this.raycaster = new THREE.Raycaster();
    
    // Track mouse state to distinguish clicks from drags
    this.mouseDownPos = null;
    this.mouseDownTime = null;
    this.mouseDownOnCanvas = false;
    const CLICK_THRESHOLD = 5; // pixels
    const CLICK_TIME_THRESHOLD = 200; // milliseconds
    
    const handleMouseDown = (event) => {
      // Only handle left mouse button
      if (event.button !== 0) return;
      
      const target = event.target;
      const clickedOnCanvas = target === this.canvas || this.canvas.contains(target);
      
      if (clickedOnCanvas) {
        this.mouseDownOnCanvas = true;
        this.mouseDownPos = {
          x: event.clientX,
          y: event.clientY,
        };
        this.mouseDownTime = performance.now();
      }
    };
    
    const handleMouseUp = (event) => {
      // Only handle left mouse button
      if (event.button !== 0) return;
      
      const target = event.target;
      const clickedOnCanvas = target === this.canvas || this.canvas.contains(target);
      
      // If click started on canvas, check if it was a click or drag
      if (this.mouseDownOnCanvas && this.mouseDownPos && this.mouseDownTime) {
        // Check if this was a click (not a drag)
        const mouseMove = Math.sqrt(
          Math.pow(event.clientX - this.mouseDownPos.x, 2) +
          Math.pow(event.clientY - this.mouseDownPos.y, 2)
        );
        const mouseTime = performance.now() - this.mouseDownTime;
        
        const wasClick = mouseMove < CLICK_THRESHOLD && mouseTime < CLICK_TIME_THRESHOLD;
        
        if (wasClick && this.currentModel && clickedOnCanvas) {
          // Convert mouse position to normalized device coordinates
          const rect = this.canvas.getBoundingClientRect();
          const mouse = new THREE.Vector2();
          mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          
          // Raycast to check if we hit the mesh
          this.raycaster.setFromCamera(mouse, this.camera);
          const intersects = this.raycaster.intersectObject(this.currentModel, true);
          
          if (intersects.length > 0) {
            // Clicked on mesh - enable rotate widget, disable other widgets
            this.stateStore.set('moveWidgetEnabled', false);
            this.stateStore.set('rotateWidgetEnabled', true);
            this.stateStore.set('scaleWidgetEnabled', false);
            this.eventBus.emit('mesh:move-widget-enabled', false);
            this.eventBus.emit('mesh:rotate-widget-enabled', true);
            this.eventBus.emit('mesh:scale-widget-enabled', false);
          } else {
            // Clicked on canvas but outside mesh - disable all widgets
            this.stateStore.set('moveWidgetEnabled', false);
            this.stateStore.set('rotateWidgetEnabled', false);
            this.stateStore.set('scaleWidgetEnabled', false);
            this.eventBus.emit('mesh:move-widget-enabled', false);
            this.eventBus.emit('mesh:rotate-widget-enabled', false);
            this.eventBus.emit('mesh:scale-widget-enabled', false);
          }
        }
      } else if (!clickedOnCanvas) {
        // Clicked outside canvas (e.g., on UI) - disable all widgets
        this.stateStore.set('moveWidgetEnabled', false);
        this.stateStore.set('rotateWidgetEnabled', false);
        this.stateStore.set('scaleWidgetEnabled', false);
        this.eventBus.emit('mesh:move-widget-enabled', false);
        this.eventBus.emit('mesh:rotate-widget-enabled', false);
        this.eventBus.emit('mesh:scale-widget-enabled', false);
      }
      
      // Reset tracking
      this.mouseDownPos = null;
      this.mouseDownTime = null;
      this.mouseDownOnCanvas = false;
    };
    
    this.canvas.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
  }

  async init() {
    await this.applyStateSnapshot(this.stateStore.getState());
    this.animate();
  }

  setupLights() {
    this.lightsController = new LightsController(this.scene, {
      enabled: this.lightsEnabled,
      master: this.lightsMaster,
      rotation: this.lightsRotation,
      autoRotateSpeed: this.lightsAutoRotateSpeed,
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
    this.postPipeline = new PostProcessingPipeline(
      this.renderer,
      this.scene,
      this.camera,
    );
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
    });
  }



  // registerEvents() - Moved to EventManager.js

  async applyStateSnapshot(state) {
    this.transformController?.applyState(state);
    this.setShading(state.shading);
    this.autoRotateSpeed = state.autoRotate;
    this.setCameraAutoOrbit(state.camera?.autoOrbit ?? 'off');
    this.setGroundSolid(state.groundSolid);
    this.setGroundWire(state.groundWire);
    this.setGroundSolidColor(state.groundSolidColor);
    this.setGroundWireColor(state.groundWireColor);
    this.setGroundWireOpacity(state.groundWireOpacity);
    this.setGridY(state.gridY ?? 0);
    this.setPodiumScale(state.podiumScale ?? 1, { updateState: false });
    this.setGridScale(state.gridScale ?? 1);
    this.autoExposureController?.applyStateSnapshot(state);
    // Initialize base HDRI strength if not already set
    if (this.baseHdriStrength === undefined) {
      this.baseHdriStrength = (state.hdriStrength ?? 2) * state.exposure;
    }
    this.camera.fov = state.camera.fov;
    this.camera.updateProjectionMatrix();
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
    if (state.wireframe) {
      this.materialController.setWireframeSettings(state.wireframe);
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
    this.setShadows((state.camera?.shadows ?? 0) / 50);
    this.setVignette(state.camera?.vignette ?? 0);
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
    this.handleResize();
    this.updateDof(state.dof);
    this.updateBloom(state.bloom);
    this.applyRenderQualityVisualOverrides();
    if (this.fxaaPass) {
      this.fxaaPass.enabled =
        !tier.forceFxaaOff && (state.antiAliasing ?? 'none') === 'fxaa';
    }
    this.lightsController?.setShadowMapResolution(tier.shadowMapSize);
    this.renderer.shadowMap.type = tier.softShadowMap
      ? THREE.PCFSoftShadowMap
      : THREE.PCFShadowMap;
  }

  async setHdriPreset(preset) {
    if (!preset || !HDRI_PRESETS[preset]) return;
        this.currentHdri = preset;
    try {
      await this.environmentController?.setPreset(preset);
        this.applyHdriMood(preset);
      // Reset auto-exposure luminance state when HDRI changes
      // This allows it to quickly adapt to the new scene brightness
      this.autoExposureController?.resetLuminance();
    } catch (error) {
      console.error('Failed to apply HDRI preset', preset, error);
      this.ui.showToast('Failed to load HDRI');
    }
  }

  updateMaterialsEnvironment(envTexture, intensity) {
    this.materialController.updateMaterialsEnvironment(
      envTexture,
      intensity,
      this.hdriBlurriness,
    );
  }

  forceRestoreClaySettings() {
    this.materialController.forceRestoreClaySettings();
  }

  setHdriBackground(enabled) {
    this.hdriBackgroundEnabled = enabled;
    
    // Update environment controller's fallback color (for when HDRI is completely off)
    const bgColor = this.backgroundController?.getColor() ?? '#000000';
    this.environmentController?.setFallbackColor(bgColor);
    
    // Set background enabled on environment controller
    this.environmentController?.setBackgroundEnabled(enabled);
    
    // Notify background controller of HDRI background state
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
    const c =
      curve?.p1 && curve?.p2
        ? curve
        : {
            p1: { x: 0.25, y: 0.25 },
            p2: { x: 0.75, y: 0.75 },
          };
    this.postPipeline?.setToneCurve(c);
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

  setGroundY(value) {
    this.groundController?.setGroundY(value);
  }

  setGridY(value) {
    this.groundController?.setGridY(value);
  }

  snapPodiumToBottom() {
    if (!this.currentModel) {
      this.ui?.showToast?.('Load a mesh before snapping the podium');
      return;
    }

    const bounds = new THREE.Box3().setFromObject(this.currentModel);
    if (!bounds || !isFinite(bounds.min.y)) {
      this.ui?.showToast?.('Unable to determine mesh bottom');
      return;
    }

    const bottomY = this.groundController?.snapPodiumToBounds(bounds);
    if (bottomY === null || bottomY === undefined) {
      this.ui?.showToast?.('Unable to determine mesh bottom');
      return;
    }
    this.stateStore.set('groundY', bottomY);

    const currentState = this.stateStore.getState();
    if (!currentState.groundSolid) {
      this.setGroundSolid(true);
      this.stateStore.set('groundSolid', true);
    }

    this.ui?.showToast?.('Podium snapped to mesh bottom');
  }

  snapGridToBottom() {
    if (!this.currentModel) {
      this.ui?.showToast?.('Load a mesh before snapping the grid');
      return;
    }

    const bounds = new THREE.Box3().setFromObject(this.currentModel);
    if (!bounds || !isFinite(bounds.min.y)) {
      this.ui?.showToast?.('Unable to determine mesh bottom');
      return;
    }

    const bottomY = this.groundController?.snapGridToBounds(bounds);
    if (bottomY === null || bottomY === undefined) {
      this.ui?.showToast?.('Unable to determine mesh bottom');
      return;
    }
    this.stateStore.set('gridY', bottomY);
    this.ui?.showToast?.('Grid snapped to mesh bottom');
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

  setLightsHeight(value, { updateUi = true, updateState = true } = {}) {
    if (!this.lightsController) return;
    this.lightsController.setHeight(value);
    if (updateState) {
      this.stateStore.set('lightsHeight', value);
    }
    if (updateUi) {
      this.ui?.syncControls?.(this.stateStore.getState());
    }
  }

  setLightsCastShadows(enabled) {
    this.lightsController?.setCastShadows(enabled);
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
  }

  updateGrain(settings) {
    this.postPipeline?.updateGrain(settings);
  }

  updateAberration(settings) {
    this.postPipeline?.updateAberration(settings);
  }


  /**
   * Create a large background sphere for proper DOF depth handling
   * @param {string} color - Background color hex string
   * @returns {THREE.Mesh} - Background sphere mesh
   */

  async loadFile(file, options = {}) {
    if (!file) return;
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
      this.updateStatsUI(file, asset.object, asset.gltfMetadata);
      this.ui.updateTopBarDetail(`${file.name} — Idle`);
      if (!options.silent) {
        this.ui.showToast('Model loaded');
      }
      this.eventBus.emit('scene:model-load-complete', { success: true, file });
    } catch (error) {
      console.error('Failed to load model', error);
      this.ui.showToast('Could not load model');
      this.ui.setDropzoneVisible(true);
      this.eventBus.emit('scene:model-load-complete', { success: false, file, error });
    }
  }

  async loadFileBundle(files) {
    if (!files?.length) return;
    try {
      const asset = await this.modelLoader.loadFileBundle(files);
      const sourceFile = asset.sourceFile ?? files[0]?.file;
      if (sourceFile) {
        this.currentFile = sourceFile;
        this.ui.updateTitle(sourceFile.name);
      }
      this.setModel(asset.object, asset.animations ?? []);
      this._applyAssetMetadata(asset);
      this.updateStatsUI(sourceFile, asset.object, asset.gltfMetadata);
        this.ui.showToast('Folder loaded');
      this.eventBus.emit('scene:model-load-complete', { success: true, file: sourceFile });
    } catch (error) {
        console.error('Folder load failed', error);
      this.ui.showToast(error.message || 'Folder load failed');
      this.eventBus.emit('scene:model-load-complete', { success: false, error });
    }
  }

  clearModel() {
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
    this.materialController.setModel(object, state.shading, {
      clay: state.clay,
      fresnel: state.fresnel,
      wireframe: state.wireframe,
      material: state.material ?? {
        brightness: state.diffuseBrightness ?? 1.0,
        metalness: 0.0,
        roughness: DEFAULT_MATERIAL_ROUGHNESS,
      },
    });
    this.setShading(state.shading);
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
    });
    
    this.ui.setDropzoneVisible(false);
    this.ui.revealShelf?.();
    
    // Fade in mesh opacity from 0 to 1 over 2 seconds with spin-in animation
    // Animate object rotation relative to modelRoot (which may have saved rotation)
    this._fadeInMeshOpacity(object);
    
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
          this.cameraController?.focusOnObjectAnimated(this.currentModel, 2.0);
        }
      });
    });
  }

  prepareMesh(object) {
    this.materialController.prepareMesh(object);
  }


  _fadeInMeshOpacity(object) {
    // Collect all materials from the mesh
    const materials = [];
    const originalMaterialStates = new Map();
    object.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if (mat && !materials.includes(mat)) {
            materials.push(mat);
            originalMaterialStates.set(mat, {
              transparent: !!mat.transparent,
              opacity: Number.isFinite(mat.opacity) ? mat.opacity : 1,
              depthWrite: mat.depthWrite !== false,
            });
          }
        });
      }
    });

    if (materials.length === 0) return;

    // Set initial opacity to 0 and enable transparency
    materials.forEach((mat) => {
      if (mat) {
        mat.transparent = true;
        mat.opacity = 0;
        // During fade we disable depth writes to avoid temporary sorting artifacts.
        mat.depthWrite = false;
      }
    });

    // Set initial rotation to -90 degrees on Y axis (spins in from the left)
    // This is relative to modelRoot, which may have its own rotation from transform controller
    const startRotationY = -90;
    const targetRotationY = 0;
    object.rotation.y = THREE.MathUtils.degToRad(startRotationY);

    // Animate opacity and rotation from 0 to 1 and -90° to 0° over 2 seconds
    const duration = 2000; // 2 seconds
    const startTime = performance.now();

    const fadeIn = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Use smooth ease-out curve (quadratic) - starts fast, gradually slows
      const easedProgress = 1 - Math.pow(1 - progress, 2);
      const opacity = easedProgress;
      
      // Animate rotation from -90° to 0° (synced with fade, relative to modelRoot)
      const rotationY = startRotationY + (targetRotationY - startRotationY) * easedProgress;
      object.rotation.y = THREE.MathUtils.degToRad(rotationY);

      materials.forEach((mat) => {
        if (mat) {
          const original = originalMaterialStates.get(mat);
          const targetOpacity = original ? original.opacity : 1;
          mat.opacity = targetOpacity * opacity;
        }
      });

      if (progress < 1) {
        requestAnimationFrame(fadeIn);
      } else {
        // Ensure we end at exact opacity 1 and rotation 0° (relative to modelRoot)
        materials.forEach((mat) => {
          if (mat) {
            const original = originalMaterialStates.get(mat);
            if (original) {
              mat.opacity = original.opacity;
              mat.transparent = original.transparent;
              mat.depthWrite = original.depthWrite;
            } else {
              mat.opacity = 1;
              mat.transparent = false;
              mat.depthWrite = true;
            }
          }
        });
        object.rotation.y = THREE.MathUtils.degToRad(targetRotationY);
      }
    };

    requestAnimationFrame(fadeIn);
  }

  setSvgExtrudeDepth(depth) {
    if (!this.currentModel || !this.svgExtrudeImporter || !this.isSvgExtrudeModel) return;
    try {
      this.svgExtrudeImporter.setDepth(depth);
      // Register rebuilt meshes as originals so material controls keep working.
      this.materialController.prepareMesh(this.currentModel);
      this.setShading(this.currentShading);
      const svgState = this.stateStore.getState().svgExtrude || {};
      const overrideEnabled = !!svgState.colorOverride;
      if (overrideEnabled) {
        this.setSvgExtrudeColorOverride(svgState, { updateState: false });
      }
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
      const overrideEnabled = !!svgState.colorOverride;
      if (overrideEnabled) {
        this.setSvgExtrudeColorOverride(svgState, { updateState: false });
      }
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
      const overrideEnabled = !!svgState.colorOverride;
      if (overrideEnabled) {
        this.setSvgExtrudeColorOverride(svgState, { updateState: false });
      }
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
      const overrideEnabled = !!svgState.colorOverride;
      if (overrideEnabled) {
        this.setSvgExtrudeColorOverride(svgState, { updateState: false });
      }
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
      const overrideEnabled = !!svgState.colorOverride;
      if (overrideEnabled) {
        this.setSvgExtrudeColorOverride(svgState, { updateState: false });
      }
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
    const enabled = !!(settings.enabled ?? settings.colorOverride);
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
    this.materialController.setShading(mode);
    this.unlitMode = this.materialController.getUnlitMode();
    // Material instances are recreated when shading changes; reapply reverse mode.
    this.setReverseNormals(this.reverseNormalsEnabled);
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
    this.diagnosticsController.update(delta);
    if (!this.panelsShelfScrolling) {
      this.postPipeline?.updateGrainTime(delta);
    }
    this.updateWireframeOverlayTransforms();
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
    if (!this.backgroundSphere || !this.backgroundSphere.visible) return;
    
    // Position sphere far behind the camera in its view direction
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    
    // Position sphere very far behind (5000 units) to ensure it's at maximum depth
    // This gives DOF proper depth information for smooth background blur
    const distance = 5000;
    this.backgroundSphere.position.copy(this.camera.position);
    this.backgroundSphere.position.addScaledVector(cameraDirection, -distance);
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
      this.renderer.render(this.scene, this.camera);
      this.renderer.setClearColor(previousColor, previousAlpha);
      this.renderer.toneMappingExposure = previousExposure;
      return;
    }
    this.autoExposureController?.update(this.unlitMode);
    // Update lens dirt exposure factor from auto-exposure luminance
    this.lensDirtController?.updateExposureFactor();
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  handleResize() {
    // Use requestAnimationFrame to ensure DOM has updated before reading dimensions
    requestAnimationFrame(() => {
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
      
      // Update camera aspect ratio and projection matrix
      this.camera.aspect = finalWidth / finalHeight;
      this.camera.updateProjectionMatrix();
      
      // Update composer (post-processing pipeline). EffectComposer caches _pixelRatio from
      // construction; it does not follow renderer.setPixelRatio() unless we sync here.
      // Without this, switching render quality (Epic ↔ Medium) leaves passes sized for the old DPR.
      if (this.composer) {
        this.composer.setPixelRatio(this.renderer.getPixelRatio());
        this.composer.setSize(finalWidth, finalHeight);
      }
      
      // UnrealBloomPass internal resolution (tier may decimate for speed)
      const tier = resolveRenderQualityTier(
        this.stateStore.getState().renderQuality,
      );
      const bloomScale = tier.bloomResolutionScale;
      const bloomW = Math.max(1, Math.floor(finalWidth * bloomScale));
      const bloomH = Math.max(1, Math.floor(finalHeight * bloomScale));
      if (this.postPipeline?.bloomPass) {
        if (this.postPipeline.bloomPass.resolution) {
          this.postPipeline.bloomPass.resolution.set(bloomW, bloomH);
        }
        if (typeof this.postPipeline.bloomPass.setSize === 'function') {
          this.postPipeline.bloomPass.setSize(bloomW, bloomH);
        }
      }
      
      // Update color adjust resolution for sharpness
      if (this.postPipeline?.colorAdjust) {
        this.postPipeline.colorAdjust.setResolution(finalWidth, finalHeight);
      }
      
      // Update FXAA resolution on resize
      if (this.fxaaPass) {
        const pixelRatio = this.renderer.getPixelRatio();
        this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (finalWidth * pixelRatio);
        this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (finalHeight * pixelRatio);
      }
      
      // Note: Histogram controller doesn't need explicit resize handling
      // as it reads from the composer's render target which is updated by composer.setSize()
    });
  }

  async exportPng(settings = {}) {
    const { transparent = false, size = 2 } = settings;
    
    if (transparent) {
      await this.imageExporter.exportTransparentPng(
        this.currentModel,
        this.currentFile,
        this.cameraController,
        size,
      );
    } else {
      const originalSize = new THREE.Vector2();
      this.renderer.getSize(originalSize);
      const originalPixelRatio = this.renderer.getPixelRatio();
      
      await this.imageExporter.exportPng(
        this.currentFile,
        originalSize,
        originalPixelRatio,
        size,
      );
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
      this.ui?.showToast?.('SVG silhouette exported');
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
      this.ui?.showToast?.('SVG (color) exported');
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
      this.ui?.showToast?.('.GLB exported');
    } catch (error) {
      console.error('SVG GLB export failed', error);
      this.ui?.showToast?.('SVG .GLB export failed');
    }
  }
}

