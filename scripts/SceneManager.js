import * as THREE from 'three';
import { HDRI_PRESETS, HDRI_STRENGTH_UNIT, HDRI_MOODS } from './config/hdri.js';
import {
  WIREFRAME_OFFSET,
  WIREFRAME_POLYGON_OFFSET_FACTOR,
  WIREFRAME_POLYGON_OFFSET_UNITS,
  WIREFRAME_OPACITY_VISIBLE,
  WIREFRAME_OPACITY_OVERLAY,
  CLAY_DEFAULT_ROUGHNESS,
  CLAY_DEFAULT_METALNESS,
  CAMERA_TEMPERATURE_MIN_K,
  CAMERA_TEMPERATURE_MAX_K,
  CAMERA_TEMPERATURE_NEUTRAL_K,
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
import { LensFlareController } from './render/LensFlareController.js';
import { AutoExposureController } from './render/AutoExposureController.js';
import { TransformController } from './render/TransformController.js';
import { LensDirtController } from './render/LensDirtController.js';
import { BackgroundController } from './render/BackgroundController.js';
import { ImageExporter } from './render/ImageExporter.js';


export class SceneManager {
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;

    this.canvas = document.querySelector('#webgl');
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
      Math.max(0, initialState.hdriStrength ?? 1.50),
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

    this.diagnosticsController = new MeshDiagnosticsController({
      scene: this.scene,
      modelRoot: this.modelRoot,
      ui: this.ui,
    });

    this.currentShading = initialState.shading;
    this.autoRotateSpeed = 0;
    this.lightsMaster = initialState.lightsMaster ?? 0.30;
    this.lightsEnabled = initialState.lightsEnabled ?? true;
    this.lightsRotation = initialState.lightsRotation ?? 0;
    this.lightsAutoRotate = initialState.lightsAutoRotate ?? false;
    this.lightsAutoRotateSpeed = 30; // degrees per second
    this.currentFile = null;
    this.currentModel = null;
    this.isFirstModelLoad = true; // Track if this is the first model load
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
    this.currentHdri = initialState.hdri ?? 'meadow';
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
    this.registerEvents();
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
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
      setGrainState: (value) => this.stateStore.set('grain', value),
      fallbackBackgroundColor: this.backgroundController?.getColor() ?? '#000000',
    });
  }

  setupEnvironment(initialState) {
    this.environmentController = new EnvironmentController(this.scene, this.renderer, {
      presets: HDRI_PRESETS,
      moods: HDRI_MOODS,
      initialPreset: initialState.hdri ?? 'meadow',
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



  registerEvents() {
    this.eventBus.on('mesh:scale', (value) => this.setScale(value));
    this.eventBus.on('mesh:yOffset', (value) => this.setYOffset(value));
    this.eventBus.on('mesh:rotationX', (value) => this.setRotationX(value));
    this.eventBus.on('mesh:rotationY', (value) => this.setRotationY(value));
    this.eventBus.on('mesh:rotationZ', (value) => this.setRotationZ(value));
    this.eventBus.on('mesh:shading', (mode) => this.setShading(mode));
    this.eventBus.on('mesh:normals', (enabled) => this.toggleNormals(enabled));
    this.eventBus.on('mesh:auto-rotate', (speed) => {
      this.autoRotateSpeed = speed;
    });
    this.eventBus.on('mesh:clay-color', (value) => {
      this.setClaySettings({ color: value });
    });
    this.eventBus.on('mesh:clay-roughness', (value) => {
      this.setClaySettings({ roughness: value });
    });
    this.eventBus.on('mesh:clay-specular', (value) => {
      this.setClaySettings({ specular: value });
    });
    this.eventBus.on('mesh:diffuse-brightness', (value) => {
      this.materialController?.setDiffuseBrightness(value);
    });
    this.eventBus.on('mesh:wireframe-always-on', (value) => {
      this.setWireframeSettings({ alwaysOn: value });
    });
    this.eventBus.on('mesh:wireframe-color', (value) => {
      this.setWireframeSettings({ color: value });
    });
    this.eventBus.on('mesh:wireframe-only-visible-faces', (value) => {
      this.setWireframeSettings({ onlyVisibleFaces: value });
    });
    this.eventBus.on('mesh:reset-transform', () => {
      this.transformController?.setRotationY(0);
    });

    this.eventBus.on('camera:preset', (preset) => this.applyCameraPreset(preset));
    this.eventBus.on('camera:fov', (value) => {
      this.camera.fov = value;
      this.camera.updateProjectionMatrix();
    });
    this.eventBus.on('camera:tilt', (value) => {
      this.cameraController?.setTilt(value);
    });
    this.eventBus.on('camera:focus', () => {
      if (this.currentModel) {
        this.cameraController?.focusOnObjectAnimated(this.currentModel, 1.0);
      }
    });
    this.eventBus.on('camera:reset', () => {
      this.camera.position.set(0, 1.5, 6);
      this.controls.target.set(0, 1, 0);
      this.controls.update();
    });
    this.eventBus.on('camera:get-state', () => {
      const state = {
        position: {
          x: this.camera.position.x,
          y: this.camera.position.y,
          z: this.camera.position.z,
        },
        target: {
          x: this.controls.target.x,
          y: this.controls.target.y,
          z: this.controls.target.z,
        },
      };
      this.eventBus.emit('camera:state', state);
    });
    this.eventBus.on('camera:set-state', (state) => {
      if (state.position) {
        this.camera.position.set(state.position.x, state.position.y, state.position.z);
      }
      if (state.target) {
        this.controls.target.set(state.target.x, state.target.y, state.target.z);
        this.controls.update();
      }
    });
    this.eventBus.on('camera:lock-orbit', () => {
      if (this.controls) {
        this.controls.enableRotate = false;
        this.controls.enablePan = false;
      }
    });
    this.eventBus.on('camera:unlock-orbit', () => {
      if (this.controls) {
        this.controls.enableRotate = true;
        this.controls.enablePan = true;
      }
    });

    this.eventBus.on('studio:hdri', (preset) => this.setHdriPreset(preset));
    this.eventBus.on('studio:hdri-enabled', (enabled) =>
      this.setHdriEnabled(enabled),
    );
    this.eventBus.on('studio:hdri-strength', (value) =>
      this.setHdriStrength(value),
    );
    this.eventBus.on('studio:hdri-blurriness', (value) =>
      this.setHdriBlurriness(value),
    );
    this.eventBus.on('studio:hdri-rotation', (value) =>
      this.setHdriRotation(value),
    );
    this.eventBus.on('studio:hdri-background', (enabled) =>
      this.setHdriBackground(enabled),
    );
    this.eventBus.on('studio:lens-flare-enabled', (enabled) =>
      this.setLensFlareEnabled(enabled),
    );
    this.eventBus.on('studio:lens-flare-rotation', (value) =>
      this.setLensFlareRotation(value),
    );
    this.eventBus.on('studio:lens-flare-height', (value) =>
      this.setLensFlareHeight(value),
    );
    this.eventBus.on('studio:lens-flare-color', (value) =>
      this.setLensFlareColor(value),
    );
    this.eventBus.on('studio:lens-flare-quality', (value) =>
      this.setLensFlareQuality(value),
    );
    this.eventBus.on('mesh:clay-normal-map', (enabled) =>
      this.setClayNormalMap(enabled),
    );
    this.eventBus.on('render:contrast', (value) => this.setContrast(value));
    this.eventBus.on('render:saturation', (value) => this.setSaturation(value));
    this.eventBus.on('render:temperature', (value) =>
      this.setTemperature(value),
    );
    this.eventBus.on('render:tint', (value) => this.setTint(value));
    this.eventBus.on('render:highlights', (value) =>
      this.setHighlights(value),
    );
    this.eventBus.on('render:shadows', (value) => this.setShadows(value));
    this.eventBus.on('render:vignette', (value) => this.setVignette(value));
    this.eventBus.on('render:vignette-color', (value) => this.setVignetteColor(value));
    this.eventBus.on('studio:ground-solid', (enabled) => {
      this.setGroundSolid(enabled);
    });
    this.eventBus.on('studio:ground-wire', (enabled) => {
      this.setGroundWire(enabled);
    });
    this.eventBus.on('studio:ground-solid-color', (color) =>
      this.setGroundSolidColor(color),
    );
    this.eventBus.on('studio:ground-wire-color', (color) =>
      this.setGroundWireColor(color),
    );
    this.eventBus.on('studio:ground-wire-opacity', (value) =>
      this.setGroundWireOpacity(value),
    );
    this.eventBus.on('studio:ground-y', (value) => this.setGroundY(value));
    this.eventBus.on('studio:podium-scale', (value) => this.setPodiumScale(value));
    this.eventBus.on('studio:grid-scale', (value) => this.setGridScale(value));
    this.eventBus.on('studio:podium-snap', () => this.snapPodiumToBottom());
    this.eventBus.on('studio:grid-snap', () => this.snapGridToBottom());

    this.eventBus.on('lights:update', ({ lightId, property, value }) => {
      this.lightsController?.updateLightProperty(lightId, property, value);
    });
    this.eventBus.on('lights:master', (value) => this.setLightsMaster(value));
    this.eventBus.on('lights:enabled', (enabled) =>
      this.setLightsEnabled(enabled),
    );
    this.eventBus.on('lights:rotate', (value) => this.setLightsRotation(value));
    this.eventBus.on('lights:height', (value) => this.setLightsHeight(value));
    this.eventBus.on('lights:auto-rotate', (enabled) =>
      this.setLightsAutoRotate(enabled),
    );
    this.eventBus.on('lights:show-indicators', (enabled) =>
      this.setShowLightIndicators(enabled),
    );

    this.eventBus.on('render:dof', (settings) => this.updateDof(settings));
    this.eventBus.on('render:bloom', (settings) => this.updateBloom(settings));
    this.eventBus.on('render:grain', (settings) => this.updateGrain(settings));
    this.eventBus.on('render:aberration', (settings) =>
      this.updateAberration(settings),
    );
    this.eventBus.on('render:fresnel', (settings) =>
      this.setFresnelSettings(settings),
    );
    this.eventBus.on('render:lens-dirt', (settings) =>
      this.lensDirtController?.updateSettings(settings),
    );
    this.eventBus.on('render:anti-aliasing', (value) => {
      if (this.fxaaPass) {
        this.fxaaPass.enabled = value === 'fxaa';
      }
    });
    this.eventBus.on('render:tone-mapping', (value) => {
      this.setToneMapping(value);
    });

    this.eventBus.on('scene:background', (color) =>
      this.backgroundController?.setColor(color),
    );
    this.eventBus.on('scene:exposure', (value) => {
      this.autoExposureController?.setManualExposure(value);
      // Update UI display
      this.ui?.updateExposureDisplay?.(value);
      // Update lens dirt exposure factor
      this.lensDirtController?.updateExposureFactor();
    });
    this.eventBus.on('camera:auto-exposure', (enabled) =>
      this.autoExposureController?.setEnabled(enabled),
    );

    this.eventBus.on('file:selected', (file) => this.loadFile(file));
    this.eventBus.on('file:bundle', (bundle) => this.loadFileBundle(bundle));
    this.eventBus.on('file:reload', () => {
      if (this.currentFile) {
        this.loadFile(this.currentFile, { silent: true });
      } else {
        this.ui.showToast('No model to reload');
      }
    });

    this.eventBus.on('animation:toggle', () => this.animationController.togglePlayback());
    this.eventBus.on('animation:scrub', (value) => this.animationController.scrub(value));
    this.eventBus.on('animation:select', (index) => this.animationController.selectAnimation(index));

    this.eventBus.on('export:png', (settings) => this.exportPng(settings));
    this.eventBus.on('app:reset', () =>
      this.applyStateSnapshot(this.stateStore.getState()),
    );
  }

  async applyStateSnapshot(state) {
    this.transformController?.applyState(state);
    this.setShading(state.shading);
    this.toggleNormals(state.showNormals);
    this.autoRotateSpeed = state.autoRotate;
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
      this.baseHdriStrength = (state.hdriStrength ?? 1.0) * state.exposure;
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
    if (state.diffuseBrightness !== undefined) {
      this.materialController.setDiffuseBrightness(state.diffuseBrightness);
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
    this.updateDof(state.dof);
    this.updateBloom(state.bloom);
    this.lensDirtController?.updateSettings(state.lensDirt);
    this.updateGrain(state.grain);
    this.updateAberration(state.aberration);
    this.backgroundController?.setColor(state.background);
    if (this.fxaaPass) {
      this.fxaaPass.enabled = (state.antiAliasing ?? 'none') === 'fxaa';
    }
    this.setToneMapping(state.toneMapping ?? 'aces-filmic');
    this.setHdriStrength(state.hdriStrength ?? 1);
    // Initialize color adjustment settings
    this.setContrast(state.camera?.contrast ?? 1.0);
    this.setSaturation(state.camera?.saturation ?? 1.0);
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
    if (this.currentShading === 'clay' && this.currentModel) {
      this.currentModel.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        if (this.materialController.isClayMaterial(child)) {
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];
          materials.forEach((material) => {
            if (!material || !material.isMeshStandardMaterial) return;
            if (enabled) {
              // Restore normal map from original material
              const originalMaterial = this.materialController.getOriginalMaterial(child);
              if (originalMaterial) {
                const originalMat = Array.isArray(originalMaterial) 
                  ? originalMaterial[0] 
                  : originalMaterial;
                if (originalMat?.normalMap) {
                  material.normalMap = originalMat.normalMap;
                  material.normalMapType = originalMat.normalMapType ?? THREE.TangentSpaceNormalMap;
                  if (originalMat.normalScale) {
                    material.normalScale = originalMat.normalScale.clone();
                  }
                } else {
                  // Original has no normal map, ensure it's cleared
                  material.normalMap = null;
                }
              }
            } else {
              // Remove normal map completely
              material.normalMap = null;
              material.normalMapType = THREE.TangentSpaceNormalMap; // Reset to default
            }
            material.needsUpdate = true;
          });
        }
      });
    }
  }

  setContrast(value) {
    this.postPipeline?.setContrast(value);
  }


  setSaturation(value) {
    this.postPipeline?.setSaturation(value);
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

  setLightsHeight(value) {
    this.lightsController?.setHeight(value);
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
      const asset = await this.modelLoader.loadFile(file);
      this.setModel(asset.object, asset.animations ?? []);
      this.updateStatsUI(file, asset.object, asset.gltfMetadata);
      this.ui.updateTopBarDetail(`${file.name} — Idle`);
      if (!options.silent) {
        this.ui.showToast('Model loaded');
      }
    } catch (error) {
      console.error('Failed to load model', error);
      this.ui.showToast('Could not load model');
      this.ui.setDropzoneVisible(true);
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
      this.updateStatsUI(sourceFile, asset.object, asset.gltfMetadata);
        this.ui.showToast('Folder loaded');
    } catch (error) {
        console.error('Folder load failed', error);
      this.ui.showToast(error.message || 'Folder load failed');
    }
  }

  clearModel() {
    this.diagnosticsController.clearAll();
    this.materialController.clear();
    this.modelLoader.disposeObjectUrls();
    while (this.modelRoot.children.length) {
      const child = this.modelRoot.children[0];
      this.disposeNode(child);
      this.modelRoot.remove(child);
    }
    this.currentModel = null;
    // Clear occlusion check objects when model is removed
    this.lensFlareController?.setModelRoot(null);
    this.animationController.dispose();
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
    // Apply transform state from StateStore
    this.transformController?.applyState(state);
    this.materialController.setModel(object, state.shading, {
      clay: state.clay,
      fresnel: state.fresnel,
      wireframe: state.wireframe,
      diffuseBrightness: state.diffuseBrightness ?? 1.0,
    });
    this.setShading(state.shading);
    this.diagnosticsController.setModel(object, state.shading);
    this.toggleNormals(state.showNormals);
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
    object.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if (mat && !materials.includes(mat)) {
            materials.push(mat);
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
          mat.opacity = opacity;
        }
      });

      if (progress < 1) {
        requestAnimationFrame(fadeIn);
      } else {
        // Ensure we end at exact opacity 1 and rotation 0° (relative to modelRoot)
        materials.forEach((mat) => {
          if (mat) {
            mat.opacity = 1;
          }
        });
        object.rotation.y = THREE.MathUtils.degToRad(targetRotationY);
      }
    };

    requestAnimationFrame(fadeIn);
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

  setScale(value) {
    this.transformController?.setScale(value);
  }

  setYOffset(value) {
    this.transformController?.setYOffset(value);
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
  }

  toggleNormals(enabled) {
    this.diagnosticsController.toggleNormals(enabled);
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
    this.diagnosticsController.update(delta);
    this.postPipeline?.updateGrainTime(delta);
    this.updateWireframeOverlayTransforms();
    this._updateBackgroundSphere();
    this.render();
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
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(width, height);
    
    // Update FXAA resolution on resize
    if (this.fxaaPass) {
      const pixelRatio = this.renderer.getPixelRatio();
      this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * pixelRatio);
      this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * pixelRatio);
    }
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
}

