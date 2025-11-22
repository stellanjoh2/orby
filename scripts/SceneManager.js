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
    this.backgroundColor = initialState.background ?? '#000000';
    this.manualExposure = initialState.exposure ?? 1;
    this.currentExposure = this.manualExposure;
    this.autoExposureEnabled = initialState.autoExposure ?? false;
    this.autoExposureValue = this.manualExposure;
    this.autoExposureTarget = 0.45;
    this.autoExposureMin = 0.15;
    this.autoExposureMax = 2.5;
    this.autoExposureSmooth = 0.12;
    this.hdriStrength = Math.min(
      5 * HDRI_STRENGTH_UNIT,
      Math.max(0, initialState.hdriStrength ?? 0.6),
    );
    // Disable tone mapping on renderer - we'll apply it as a post-processing pass instead
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(new THREE.Color(this.backgroundColor), 1);
    this.renderer.toneMappingExposure = 1;

    this.cameraController = new CameraController(this.camera, this.canvas, {
      initialFov: this.camera.fov,
      getFocusPoint: () => {
        if (this.modelBounds?.center) {
          return this.modelBounds.center;
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
    });
    this.controls = this.cameraController.getControls();
    this.camera.position.set(0, 1.5, 6);
    this.controls.target.set(0, 1, 0);
    this.controls.update();

    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);
    this.scene.environmentIntensity = this.hdriStrength;

    this.diagnosticsController = new MeshDiagnosticsController({
      scene: this.scene,
      modelRoot: this.modelRoot,
      ui: this.ui,
    });

    this.currentShading = initialState.shading;
    this.autoRotateSpeed = 0;
    this.lightsMaster = initialState.lightsMaster ?? 1;
    this.lightsEnabled = initialState.lightsEnabled ?? true;
    this.lightsRotation = initialState.lightsRotation ?? 0;
    this.lightsAutoRotate = initialState.lightsAutoRotate ?? false;
    this.lightsAutoRotateSpeed = 30; // degrees per second
    this.currentFile = null;
    this.currentModel = null;
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
    this.lensDirtSettings = {
      ...(initialState.lensDirt ?? defaults.lensDirt),
    };
    this.lensDirtTexture = null;
    this.lensDirtTexturePath =
      './assets/images/free_texture_friday_566-1024x682.jpg';
    this.luminanceSampleSize = 8;
    this.luminanceRenderTarget = new THREE.WebGLRenderTarget(
      this.luminanceSampleSize,
      this.luminanceSampleSize,
      {
        depthBuffer: false,
        stencilBuffer: false,
      },
    );
    this.luminanceBuffer = new Uint8Array(
      this.luminanceSampleSize * this.luminanceSampleSize * 4,
    );
    this.averageLuminance = 0.5;

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
    this.updateLensDirt(this.lensDirtSettings);
    this.loadLensDirtTexture();
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
      fallbackBackgroundColor: this.backgroundColor,
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
      fallbackColor: this.backgroundColor,
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
    this.renderPass = this.postPipeline.renderPass;
    this.bokehPass = this.postPipeline.bokehPass;
    this.bloomPass = this.postPipeline.bloomPass;
    this.filmPass = this.postPipeline.filmPass;
    this.bloomTintPass = this.postPipeline.bloomTintPass;
    this.grainTintPass = this.postPipeline.grainTintPass;
    this.lensDirtPass = this.postPipeline.lensDirtPass;
    this.aberrationPass = this.postPipeline.aberrationPass;
    this.fxaaPass = this.postPipeline.fxaaPass;
    this.exposurePass = this.postPipeline.exposurePass;
    this.colorAdjust = this.postPipeline.colorAdjust;
    this.colorAdjustPass = this.postPipeline.colorAdjustPass;
    this.toneMappingPass = this.postPipeline.toneMappingPass;
    this.exposurePass.uniforms.exposure.value = this.currentExposure;
  }

  loadLensDirtTexture() {
    if (!this.textureLoader || !this.lensDirtTexturePath) return;
    this.textureLoader.load(
      this.lensDirtTexturePath,
      (texture) => {
        if ('colorSpace' in texture && THREE.SRGBColorSpace) {
          texture.colorSpace = THREE.SRGBColorSpace;
        }
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        this.lensDirtTexture = texture;
        if (this.lensDirtPass) {
          this.lensDirtPass.uniforms.tDirt.value = texture;
          this.updateLensDirt();
        }
      },
      undefined,
      (error) => {
        console.warn('Failed to load lens dirt texture', error);
      },
    );
  }

  updateLensDirt(settings) {
    if (!this.lensDirtPass) return;
    if (settings) {
      this.lensDirtSettings = {
        ...(this.lensDirtSettings ?? this.stateStore.getDefaults().lensDirt),
        ...settings,
      };
    }
    const defaults = this.stateStore.getDefaults().lensDirt;
    const current = this.lensDirtSettings ?? defaults;
    const enabled = !!current.enabled && !!this.lensDirtTexture;
    this.lensDirtPass.enabled = enabled;
    this.lensDirtPass.uniforms.strength.value = current.strength ?? defaults.strength;
    this.lensDirtPass.uniforms.minLuminance.value =
      current.minLuminance ?? defaults.minLuminance;
    this.lensDirtPass.uniforms.maxLuminance.value =
      current.maxLuminance ?? defaults.maxLuminance;
    this.lensDirtPass.uniforms.sensitivity.value =
      current.sensitivity ?? defaults.sensitivity ?? 1.0;
    const globalBrightness = THREE.MathUtils.clamp(
      this.averageLuminance ?? 0,
      0,
      1,
    );
    this.lensDirtPass.uniforms.exposureFactor.value = globalBrightness;
  }

  sampleSceneLuminance() {
    if (!this.luminanceRenderTarget || !this.renderer || this.unlitMode) return;
    const previousTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.luminanceRenderTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previousTarget);
    try {
      this.renderer.readRenderTargetPixels(
        this.luminanceRenderTarget,
        0,
        0,
        this.luminanceSampleSize,
        this.luminanceSampleSize,
        this.luminanceBuffer,
      );
      let sum = 0;
      for (let i = 0; i < this.luminanceBuffer.length; i += 4) {
        const r = this.luminanceBuffer[i] / 255;
        const g = this.luminanceBuffer[i + 1] / 255;
        const b = this.luminanceBuffer[i + 2] / 255;
        const value = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sum += value;
      }
      const avg = sum / (this.luminanceBuffer.length / 4);
      this.averageLuminance = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(this.averageLuminance ?? avg, avg, 0.35),
        0,
        1,
      );
      if (this.lensDirtPass) {
        this.lensDirtPass.uniforms.exposureFactor.value = this.averageLuminance;
      }
    } catch (error) {
      // Ignore read errors (e.g., if readPixels is unavailable)
    }
  }

  applyAutoExposure() {
    if (!this.autoExposureEnabled) return;
    const luminance = THREE.MathUtils.clamp(
      this.averageLuminance ?? this.autoExposureTarget,
      0.05,
      1.2,
    );
    const target = THREE.MathUtils.clamp(
      this.autoExposureTarget / luminance,
      this.autoExposureMin,
      this.autoExposureMax,
    );
    this.autoExposureValue = THREE.MathUtils.lerp(
      this.autoExposureValue ?? target,
      target,
      this.autoExposureSmooth,
    );
    this.updateExposureUniform(this.autoExposureValue);
  }

  setAutoExposureEnabled(enabled) {
    this.autoExposureEnabled = !!enabled;
    if (this.autoExposureEnabled) {
      this.autoExposureValue = this.currentExposure ?? this.manualExposure ?? 1;
    } else {
      this.updateExposureUniform(this.manualExposure ?? 1);
    }
  }

  updateExposureUniform(value) {
    this.currentExposure = value;
    if (this.exposurePass) {
      this.exposurePass.uniforms.exposure.value = value;
    }
    this.ui?.updateExposureDisplay?.(value);
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
      this.modelRoot.rotation.y = 0;
    });

    this.eventBus.on('camera:preset', (preset) => this.applyCameraPreset(preset));
    this.eventBus.on('camera:fov', (value) => {
      this.camera.fov = value;
      this.camera.updateProjectionMatrix();
    });
    this.eventBus.on('camera:focus', () => {
      if (this.currentModel) {
        this.fitCameraToObject(this.currentModel);
      }
    });
    this.eventBus.on('camera:reset', () => {
      this.camera.position.set(0, 1.5, 6);
      this.controls.target.set(0, 1, 0);
      this.controls.update();
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
    this.eventBus.on('render:hue', (value) => this.setHue(value));
    this.eventBus.on('render:saturation', (value) => this.setSaturation(value));
    this.eventBus.on('render:temperature', (value) =>
      this.setTemperature(value),
    );
    this.eventBus.on('render:tint', (value) => this.setTint(value));
    this.eventBus.on('render:highlights', (value) =>
      this.setHighlights(value),
    );
    this.eventBus.on('render:shadows', (value) => this.setShadows(value));
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
      this.updateLensDirt(settings),
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
      this.updateBackgroundColor(color),
    );
    this.eventBus.on('scene:exposure', (value) => {
      this.manualExposure = value;
      if (!this.autoExposureEnabled) {
        this.updateExposureUniform(value);
      }
      this.updateLensDirt();
    });
    this.eventBus.on('camera:auto-exposure', (enabled) =>
      this.setAutoExposureEnabled(enabled),
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

    this.eventBus.on('export:png', () => this.exportPng());
    this.eventBus.on('app:reset', () =>
      this.applyStateSnapshot(this.stateStore.getState()),
    );
  }

  async applyStateSnapshot(state) {
    this.setScale(state.scale);
    this.setYOffset(state.yOffset);
    this.setRotationX(state.rotationX ?? 0);
    this.setRotationY(state.rotationY ?? 0);
    this.setRotationZ(state.rotationZ ?? 0);
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
    this.manualExposure = state.exposure ?? 1;
    this.autoExposureEnabled = state.autoExposure ?? false;
    this.autoExposureValue = this.manualExposure;
    this.updateExposureUniform(this.manualExposure);
    this.setAutoExposureEnabled(this.autoExposureEnabled);
    // Initialize base HDRI strength if not already set
    if (this.baseHdriStrength === undefined) {
      this.baseHdriStrength = (state.hdriStrength ?? 1.0) * state.exposure;
    }
    this.camera.fov = state.camera.fov;
    this.camera.updateProjectionMatrix();
    this.lightsEnabled = state.lightsEnabled ?? true;
    this.lightsMaster = state.lightsMaster ?? 1;
    this.applyLightSettings(state.lights);
    if (!this.lightsEnabled) {
      Object.values(this.lights).forEach((light) => {
        if (!light) return;
        light.intensity = 0;
      });
    }
    this.setLightsRotation(state.lightsRotation ?? 0);
    this.setShowLightIndicators(state.showLightIndicators ?? false);
    this.setLightsAutoRotate(state.lightsAutoRotate ?? false);
    // Update material controller settings
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
    this.updateLensDirt(state.lensDirt);
    this.updateGrain(state.grain);
    this.updateAberration(state.aberration);
    this.updateBackgroundColor(state.background);
    if (this.fxaaPass) {
      this.fxaaPass.enabled = (state.antiAliasing ?? 'none') === 'fxaa';
    }
    this.setToneMapping(state.toneMapping ?? 'aces-filmic');
    this.setHdriStrength(state.hdriStrength ?? 1);
    // Initialize color adjustment settings
    this.setContrast(state.camera?.contrast ?? 1.0);
    this.setHue(state.camera?.hue ?? 0.0);
    this.setSaturation(state.camera?.saturation ?? 1.0);
    this.setTemperature(state.camera?.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K);
    this.setTint((state.camera?.tint ?? 0) / 100);
    this.setHighlights((state.camera?.highlights ?? 0) / 100);
    this.setShadows((state.camera?.shadows ?? 0) / 50);
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
    this.environmentController?.setBackgroundEnabled(enabled);
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
                }
                  }
                } else {
              // Remove normal map
              material.normalMap = null;
            }
            material.needsUpdate = true;
          });
        }
      });
    }
  }

  setContrast(value) {
    this.colorAdjust?.setContrast(value);
  }

  setHue(value) {
    this.colorAdjust?.setHue(value);
  }

  setSaturation(value) {
    this.colorAdjust?.setSaturation(value);
  }

  setTemperature(kelvin) {
    if (!this.colorAdjust) return;
    const neutral = CAMERA_TEMPERATURE_NEUTRAL_K;
    const minK = CAMERA_TEMPERATURE_MIN_K;
    const maxK = CAMERA_TEMPERATURE_MAX_K;
    const clamped = THREE.MathUtils.clamp(
      kelvin ?? neutral,
      minK,
      maxK,
    );
    let normalized;
    if (clamped >= neutral) {
      normalized =
        (clamped - neutral) / (maxK - neutral);
    } else {
      normalized =
        (clamped - neutral) / (neutral - minK);
    }
    this.colorAdjust.setTemperature(normalized);
  }

  setTint(value) {
    this.colorAdjust?.setTint(value);
  }

  setHighlights(value) {
    this.colorAdjust?.setHighlights(value);
  }

  setShadows(value) {
    this.colorAdjust?.setShadows(value);
  }

  setHdriEnabled(enabled) {
    this.hdriEnabled = enabled;
    this.environmentController?.setEnabled(enabled);
    this.applyHdriMood(this.currentHdri);
    this.lensFlareController?.setHdriEnabled(enabled);
  }

  setToneMapping(value) {
    // Map UI values to shader pass values (0=none, 1=linear, 2=reinhard, 4=aces-filmic)
    const toneMappingMap = {
      'none': 0,
      'linear': 1,
      'reinhard': 2,
      'aces-filmic': 4,
    };
    
    const toneMappingValue = toneMappingMap[value] ?? 4; // Default to ACES Filmic
    
    // Update the tone mapping shader pass
    if (this.toneMappingPass) {
      this.toneMappingPass.uniforms.toneMappingType.value = toneMappingValue;
    }
    
    // Keep renderer tone mapping disabled (we apply it in post-processing)
    this.renderer.toneMapping = THREE.NoToneMapping;
    
    const constantNames = {
      0: 'None',
      1: 'Linear',
      2: 'Reinhard',
      4: 'ACES Filmic',
    };
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
    this.lightsMaster = value ?? 1;
    const lightsState = this.stateStore.getState().lights;
    this.lightsController?.setMaster(this.lightsMaster, lightsState);
  }

  setShowLightIndicators(enabled) {
    this.lightsController?.setIndicatorsVisible(enabled);
    if (enabled && this.modelBounds) {
      this.lightsController?.setModelBounds(this.modelBounds);
    }
  }

  updateLightIndicators() {
    this.lightsController?.updateIndicators();
  }

  setLightsRotation(value, { updateUi = true, updateHdri = false } = {}) {
    this.lightsRotation = this.lightsController?.setRotation(value) ?? value;
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

  setLightsAutoRotate(enabled) {
    this.lightsAutoRotate = enabled;
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
    if (!settings) return;
    const wants =
      settings.enabled === undefined ? true : Boolean(settings.enabled);
    const active = wants && settings.strength > 0.0001;
    if (this.bokehPass) {
      this.bokehPass.enabled = active;
    }
    if (!active) return;
    this.bokehPass.uniforms.focus.value = settings.focus;
    this.bokehPass.uniforms.aperture.value = settings.aperture;
    this.bokehPass.uniforms.maxblur.value = settings.strength;
  }

  updateBloom(settings) {
    if (!settings) return;
    const wants =
      settings.enabled === undefined ? true : Boolean(settings.enabled);
    const active = wants && settings.strength > 0.0001;
    if (this.bloomPass) {
      this.bloomPass.enabled = active;
    }
    if (this.bloomTintPass) {
      this.bloomTintPass.enabled = active;
    }
    if (!active) return;
    this.bloomPass.threshold = settings.threshold;
    this.bloomPass.strength = settings.strength;
    this.bloomPass.radius = settings.radius;
    this.bloomTintPass.uniforms.tint.value = new THREE.Color(settings.color);
    this.bloomTintPass.uniforms.strength.value = THREE.MathUtils.clamp(
      settings.strength / 4,
      0,
      1.5,
    );
  }

  updateGrain(settings) {
    if (!settings) return;
    const wants =
      settings.enabled === undefined ? true : Boolean(settings.enabled);
    
    // Always keep passes enabled to prevent exposure pop
    // Instead, set intensity to 0 when disabled
    const intensity = wants ? (settings.intensity || 0) : 0;
    
    if (this.filmPass) {
      // FilmPass uses material.uniforms, not direct uniforms
      const material = this.filmPass.material;
      if (material && material.uniforms) {
        // Keep FilmPass enabled but set intensity to 0 when disabled
        this.filmPass.enabled = true;
        if (material.uniforms.nIntensity) {
          material.uniforms.nIntensity.value = intensity * 0.5;
        }
        // Also set sIntensity (scanline intensity) to 0 to fully disable FilmPass grain
        if (material.uniforms.sIntensity) {
          material.uniforms.sIntensity.value = intensity * 0.5;
        }
      }
    }
    if (this.grainTintPass) {
      // Keep GrainTintPass enabled but set intensity to 0 when disabled
      this.grainTintPass.enabled = true;
      if (this.grainTintPass.uniforms?.intensity) {
        this.grainTintPass.uniforms.intensity.value = intensity;
      }
      if (this.grainTintPass.uniforms?.tint) {
        this.grainTintPass.uniforms.tint.value = new THREE.Color(
          settings.color || '#ffffff',
        );
      }
    }
  }

  updateAberration(settings) {
    if (!settings) return;
    const wants =
      settings.enabled === undefined ? true : Boolean(settings.enabled);
    const active =
      wants &&
      settings.strength > 0.0001 &&
      Math.abs(settings.offset) > 0.0001;
    if (this.aberrationPass) {
      this.aberrationPass.enabled = active;
    }
    if (!active) return;
    this.aberrationPass.uniforms.offset.value = settings.offset;
    this.aberrationPass.uniforms.strength.value = settings.strength;
  }


  updateBackgroundColor(color) {
    if (!color) return;
    this.backgroundColor = color;
    if (!this.hdriBackgroundEnabled || !this.hdriEnabled) {
      const background = new THREE.Color(color);
      this.scene.background = null;
      this.renderer.setClearColor(background, 1);
    }
    this.environmentController?.setFallbackColor(color);
    this.hdriMood?.setFallbackBackgroundColor(color);
  }

  async loadFile(file, options = {}) {
    if (!file) return;
    this.currentFile = file;
    this.ui.updateTitle(file.name);
    this.ui.updateTopBarDetail(`${file.name} — Loading…`);
    this.ui.setDropzoneVisible(false);

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
    this.modelRoot.rotation.set(0, 0, 0);
    this.modelRoot.position.set(0, 0, 0);
    this.modelRoot.scale.setScalar(1);
    this.modelRoot.add(object);
    
    // Update lens flare occlusion check to only check the model (much more performant)
    this.lensFlareController?.setModelRoot(this.modelRoot);
    
    this.prepareMesh(object);
    this.fitCameraToObject(object);
    const state = this.stateStore.getState();
    this.setScale(state.scale);
    this.setYOffset(state.yOffset);
    this.setRotationX(state.rotationX ?? 0);
    this.setRotationY(state.rotationY ?? 0);
    this.setRotationZ(state.rotationZ ?? 0);
    this.materialController.setModel(object, state.shading, {
      clay: state.clay,
      fresnel: state.fresnel,
      wireframe: state.wireframe,
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
  }

  prepareMesh(object) {
    this.materialController.prepareMesh(object);
  }

  fitCameraToObject(object) {
    const box = new THREE.Box3().setFromObject(object);
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      this.modelBounds = { box, size, center, radius: size.length() / 2 };
      this.lightsController?.setModelBounds(this.modelBounds);
      this.controls.target.copy(center);
      const distance = this.modelBounds.radius * 2.2 || 5;
      const direction = new THREE.Vector3(1.5, 1.2, 1.5).normalize();
      this.camera.position.copy(center.clone().add(direction.multiplyScalar(distance)));
      this.camera.near = Math.max(0.01, distance / 200);
      this.camera.far = distance * 50;
      this.camera.updateProjectionMatrix();
      this.controls.update();
    }
  }

  updateStatsUI(file, object, gltfMetadata = null) {
    const stats = this.diagnosticsController.calculateStats(
      object,
      file,
      gltfMetadata,
      this.modelBounds,
    );
    this.ui.updateStats(stats);
  }

  setScale(value) {
    if (!this.modelRoot) return;
    this.modelRoot.scale.setScalar(value);
  }

  setYOffset(value) {
    if (!this.modelRoot) return;
    this.modelRoot.position.y = value;
  }

  setRotationX(value) {
    if (!this.modelRoot) return;
    this.modelRoot.rotation.x = THREE.MathUtils.degToRad(value);
  }

  setRotationY(value) {
    if (!this.modelRoot) return;
    this.modelRoot.rotation.y = THREE.MathUtils.degToRad(value);
  }

  setRotationZ(value) {
    if (!this.modelRoot) return;
    this.modelRoot.rotation.z = THREE.MathUtils.degToRad(value);
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
    if (!this.modelBounds) return;
    const { center, radius } = this.modelBounds;
    const distance = radius * 2.4 || 5;
    const target = center.clone();
    let position;
    if (preset === 'front') {
      position = target.clone().add(new THREE.Vector3(0, radius * 0.2, distance));
    } else if (preset === 'three-quarter') {
      position = target
        .clone()
        .add(new THREE.Vector3(distance, radius * 0.4, distance));
    } else if (preset === 'top') {
      position = target.clone().add(new THREE.Vector3(0, distance, 0.0001));
    }
    if (position) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
    }
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
      this.setLightsRotation(this.lightsRotation + deltaDegrees);
    }
    this.cameraController.update();
    this.diagnosticsController.update(delta);
    this.grainTintPass.uniforms.time.value += delta * 60;
    this.updateWireframeOverlayTransforms();
    this.render();
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
      this.renderer.setClearColor(new THREE.Color(this.backgroundColor), 1);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setClearColor(previousColor, previousAlpha);
      this.renderer.toneMappingExposure = previousExposure;
      return;
    }
    this.sampleSceneLuminance();
    this.applyAutoExposure();
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

  async exportPng() {
    const originalSize = new THREE.Vector2();
    this.renderer.getSize(originalSize);
    const originalPixelRatio = this.renderer.getPixelRatio();
    const targetWidth = originalSize.x * 2;
    const targetHeight = originalSize.y * 2;

    this.renderer.setPixelRatio(originalPixelRatio * 2);
    this.renderer.setSize(targetWidth, targetHeight, false);
    this.composer.setSize(targetWidth, targetHeight);
    this.render();
    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    const link = document.createElement('a');
    const name = this.currentFile?.name ?? 'orby';
    link.href = dataUrl;
    link.download = `${name.replace(/\.[a-z0-9]+$/i, '')}-orby.png`;
    link.click();

    this.renderer.setPixelRatio(originalPixelRatio);
    this.renderer.setSize(originalSize.x, originalSize.y, false);
    this.composer.setSize(originalSize.x, originalSize.y);
  }
}

