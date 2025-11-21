import * as THREE from 'three';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/meshopt_decoder.module.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/STLLoader.js';
import { USDZLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/USDZLoader.js';
import { RGBELoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/FilmPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/shaders/FXAAShader.js';
import { VertexNormalsHelper } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/helpers/VertexNormalsHelper.js';
import { LensFlareEffect } from './LensFlareEffect.js';
import { HDRI_PRESETS, HDRI_STRENGTH_UNIT, HDRI_MOODS } from './config/hdri.js';
import {
  BloomTintShader,
  GrainTintShader,
  AberrationShader,
  ExposureShader,
  ToneMappingShader,
  BackgroundShader,
  RotateEquirectShader,
  ColorAdjustShader,
} from './shaders/index.js';
import {
  WIREFRAME_OFFSET,
  WIREFRAME_POLYGON_OFFSET_FACTOR,
  WIREFRAME_POLYGON_OFFSET_UNITS,
  WIREFRAME_OPACITY_VISIBLE,
  WIREFRAME_OPACITY_OVERLAY,
  CLAY_DEFAULT_ROUGHNESS,
  CLAY_DEFAULT_METALNESS,
  PODIUM_TOP_RADIUS_OFFSET,
  PODIUM_SEGMENTS,
  PODIUM_RADIUS_MULTIPLIER,
  NORMALS_HELPER_SIZE,
  NORMALS_HELPER_COLOR,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_MATERIAL_METALNESS,
} from './constants.js';
import { formatTime } from './utils/timeFormatter.js';


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
    this.groundSolidColor = initialState.groundSolidColor ?? '#31363f';
    this.groundWireColor = initialState.groundWireColor ?? '#e1e1e1';
    this.groundWireOpacity = initialState.groundWireOpacity ?? 1.0;
    this.groundY = initialState.groundY ?? 0;
    this.gridY = initialState.gridY ?? 0;
    this.podiumScale = initialState.podiumScale ?? 1;
    this.gridScale = initialState.gridScale ?? 1;
    this.groundHeight = 0.1; // Fixed height for podium
    this.currentExposure = initialState.exposure ?? 1;
    this.hdriStrength = Math.min(
      5 * HDRI_STRENGTH_UNIT,
      Math.max(0, initialState.hdriStrength ?? 0.6),
    );
    // Disable tone mapping on renderer - we'll apply it as a post-processing pass instead
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.clearColor = new THREE.Color('#000000');
    this.clearAlpha = 1;
    this.renderer.setClearColor(new THREE.Color(this.backgroundColor), 1);
    this.renderer.toneMappingExposure = 1;

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = true;
    
    // Configure mouse buttons: left = orbit, right = pan
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };

    this.camera.position.set(0, 1.5, 6);
    this.controls.target.set(0, 1, 0);
    this.controls.update();

    // Setup custom mouse interactions
    this.setupCustomMouseControls();

    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);
    this.scene.environmentIntensity = this.hdriStrength;

    this.normalsHelpers = [];
    this.boneHelpers = [];
    this.currentShading = initialState.shading;
    this.lastBoneToastTime = 0;
    this.autoRotateSpeed = 0;
    this.lightsMaster = initialState.lightsMaster ?? 1;
    this.lightsEnabled = initialState.lightsEnabled ?? true;
    this.lightsRotation = initialState.lightsRotation ?? 0;
    this.lightsAutoRotate = initialState.lightsAutoRotate ?? false;
    this.lightsAutoRotateSpeed = 30; // degrees per second
    this.currentFile = null;
    this.currentModel = null;
    this.mixer = null;
    this.currentAction = null;
    this.currentClipIndex = 0;
    this.animations = [];
    this.unlitMode = false;
    const defaults = this.stateStore.getDefaults();
    this.lensFlareState = {
      ...defaults.lensFlare,
      ...(initialState.lensFlare ?? {}),
    };
    this.lensFlareEnabled = this.lensFlareState.enabled ?? false;

    this.hdriCache = new Map();
    this.hdriEnabled = initialState.hdriEnabled ?? true;
    this.hdriBackgroundEnabled = initialState.hdriBackground;
    this.hdriBlurriness = initialState.hdriBlurriness ?? 0;
    this.hdriRotation = initialState.hdriRotation ?? 0;
    this.currentEnvironment = null;
    this.currentEnvironmentTexture = null;
    this.blurredBackgroundTexture = null;
    this.rotatedEnvironmentTexture = null;
    this.rotationRenderTarget = null;
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.pmremGenerator.compileEquirectangularShader();
    this.claySettings = { ...(initialState.clay || {}) };
    this.fresnelSettings = { ...(initialState.fresnel || {}) };
    this.wireframeSettings = { ...(initialState.wireframe || { alwaysOn: false, color: '#9fb7ff', onlyVisibleFaces: false }) };

    this.originalMaterials = new WeakMap();
    this.wireframeOverlay = null; // Group for wireframe overlay when "always on"

    this.fileReaders = {
      text: (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(reader.error);
          reader.onload = () => resolve(reader.result);
          reader.readAsText(file);
        }),
      buffer: (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(reader.error);
          reader.onload = () => resolve(reader.result);
          reader.readAsArrayBuffer(file);
        }),
    };
    this.pendingObjectUrls = [];

    this.lightIndicators = null; // Group for light indicator cones

    this.setupLoaders();
    this.setupLights();
    this.setupGround();
    this.setupComposer();
    this.setupLensFlare(this.lensFlareState);
    this.registerEvents();
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  async init() {
    await this.applyStateSnapshot(this.stateStore.getState());
    this.animate();
  }

  setupLoaders() {
    this.gltfLoader = new GLTFLoader();
    if (this.gltfLoader.setMeshoptDecoder && MeshoptDecoder) {
      this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    }
    this.fbxLoader = new FBXLoader();
    this.objLoader = new OBJLoader();
    this.stlLoader = new STLLoader();
    this.usdLoader = new USDZLoader();
    this.hdriLoader = new RGBELoader();
    this.textureLoader = new THREE.TextureLoader();
  }

  setupLights() {
    this.lights = {
      key: new THREE.DirectionalLight('#ffffff', 4),
      fill: new THREE.DirectionalLight('#ffffff', 2.5),
      rim: new THREE.DirectionalLight('#ffffff', 3),
      ambient: new THREE.AmbientLight('#7c8ca6', 1.5),
    };
    this.lights.key.position.set(5, 5, 5);
    this.lights.fill.position.set(-4, 3, 3);
    this.lights.rim.position.set(-2, 4, -4);
    this.lightBasePositions = {
      key: this.lights.key.position.clone(),
      fill: this.lights.fill.position.clone(),
      rim: this.lights.rim.position.clone(),
    };
    Object.values(this.lights).forEach((light) => {
      if ('castShadow' in light && light.shadow) {
        light.castShadow = true;
        light.shadow.radius = 4;
        light.shadow.mapSize.set(2048, 2048);
        light.shadow.bias = -0.0001;
      } else {
        light.castShadow = false;
      }
      this.scene.add(light);
    });
  }

  setupGround() {
    this.buildGroundMeshes();
    const groundState = this.stateStore.getState();
    this.setGroundSolid(groundState.groundSolid);
    this.setGroundWire(groundState.groundWire);
    this.setGroundSolidColor(groundState.groundSolidColor);
    this.setGroundWireColor(groundState.groundWireColor);
    this.setGroundWireOpacity(
      groundState.groundWireOpacity ?? this.groundWireOpacity,
    );
    this.setGroundY(this.groundY);
  }

  setupComposer() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.renderPass.clearAlpha = 0;
    this.bokehPass = new BokehPass(this.scene, this.camera, {
      focus: 10,
      aperture: 0.003,
      maxblur: 0.01,
    });
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      1.2,
      0.35,
      0.85,
    );
    // FilmPass: noiseIntensity, scanlineIntensity, scanlineCount, grayscale
    // Initialize with 0 intensity so it's off by default
    this.filmPass = new FilmPass(0.0, 0.0, 648, false);
    this.bloomTintPass = new ShaderPass(BloomTintShader);
    this.grainTintPass = new ShaderPass(GrainTintShader);
    // Initialize time uniform for grain animation
    this.grainTintPass.uniforms.time.value = 0;
    this.aberrationPass = new ShaderPass(AberrationShader);
    this.exposurePass = new ShaderPass(ExposureShader);
    this.exposurePass.uniforms.exposure.value = this.currentExposure;
    
    // FXAA pass - added before exposure pass
    this.fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = this.renderer.getPixelRatio();
    this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (size.x * pixelRatio);
    this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (size.y * pixelRatio);
    this.fxaaPass.enabled = false; // Off by default
    
    this.aberrationPass.renderToScreen = false;
    this.fxaaPass.renderToScreen = false;
    this.exposurePass.renderToScreen = false;
    
    // Color adjustment pass (contrast, hue, saturation)
    this.colorAdjustPass = new ShaderPass(ColorAdjustShader);
    this.colorAdjustPass.uniforms.contrast.value = 1.0;
    this.colorAdjustPass.uniforms.hue.value = 0.0;
    this.colorAdjustPass.uniforms.saturation.value = 1.0;
    this.colorAdjustPass.renderToScreen = false;
    this.colorAdjustPass.enabled = false; // Disabled by default (only enable when values change)
    
    // Tone mapping pass - applied at the END after all other effects
    this.toneMappingPass = new ShaderPass(ToneMappingShader);
    this.toneMappingPass.uniforms.toneMappingType.value = 4; // Default to ACES Filmic
    this.toneMappingPass.renderToScreen = true;

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bokehPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.bloomTintPass);
    this.composer.addPass(this.filmPass);
    this.composer.addPass(this.grainTintPass);
    this.composer.addPass(this.aberrationPass);
    this.composer.addPass(this.fxaaPass);
    this.composer.addPass(this.exposurePass);
    this.composer.addPass(this.colorAdjustPass);
    this.composer.addPass(this.toneMappingPass); // Last pass - applies tone mapping
  }

  setupLensFlare(initialLensFlare) {
    const defaults = this.stateStore.getDefaults().lensFlare;
    const state = initialLensFlare ?? defaults;
    const safeHeight = Math.min(
      90,
      Math.max(0, state?.height ?? defaults?.height ?? 15),
    );
    this.lensFlare = new LensFlareEffect({
      enabled: (state.enabled ?? false) && this.hdriEnabled,
      rotation: state.rotation ?? 0,
      height: safeHeight,
      color: state.color ?? defaults?.color ?? '#d28756',
      quality: state.quality ?? 'maximum',
    });
    this.camera.add(this.lensFlare);
    this.lensFlare.position.set(0, 0, -1);
    this.lensFlare.userData.lensflare = 'no-occlusion';
  }

  setupCustomMouseControls() {
    this.isAltRightDragging = false;
    this.isAltLeftDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.originalControlsEnabled = {};
    this.altLeftTargetSet = false;

    // Alt + Right Click: Rotate lighting setup/HDRI
    this.canvas.addEventListener('mousedown', (event) => {
      if (event.altKey && event.button === 2) {
        // Right mouse button
        event.preventDefault();
        event.stopPropagation();
        this.isAltRightDragging = true;
        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;
        // Disable controls temporarily
        this.originalControlsEnabled.pan = this.controls.enablePan;
        this.originalControlsEnabled.rotate = this.controls.enableRotate;
        this.controls.enablePan = false;
        this.controls.enableRotate = false;
      } else if (event.altKey && event.button === 0) {
        // Left mouse button - orbit around focus point
        event.preventDefault();
        event.stopPropagation();
        this.isAltLeftDragging = true;
        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;
        // Set orbit target to model center
        if (this.modelBounds && this.modelBounds.center) {
          this.controls.target.copy(this.modelBounds.center);
          this.controls.update();
          this.altLeftTargetSet = true;
        }
      }
    });

    this.canvas.addEventListener('mousemove', (event) => {
      if (this.isAltRightDragging) {
        // Rotate lights/HDRI
        event.preventDefault();
        const deltaX = event.clientX - this.lastMouseX;
        const sensitivity = 0.5;
        const currentRotation = this.lightsRotation || 0;
        const newRotation = currentRotation + deltaX * sensitivity;
        this.setLightsRotation(newRotation, { updateUi: false });
        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;
      } else if (this.isAltLeftDragging && this.altLeftTargetSet) {
        // Orbit around focus point - ensure target stays at model center
        if (this.modelBounds && this.modelBounds.center) {
          this.controls.target.copy(this.modelBounds.center);
        }
      }
    });

    this.canvas.addEventListener('mouseup', (event) => {
      if (this.isAltRightDragging && event.button === 2) {
        this.isAltRightDragging = false;
        // Restore controls
        this.controls.enablePan = this.originalControlsEnabled.pan;
        this.controls.enableRotate = this.originalControlsEnabled.rotate;
        // Update UI with final rotation
        if (this.ui?.setLightsRotation) {
          this.ui.setLightsRotation(this.lightsRotation);
        }
        // Update state store
        this.stateStore.set('lightsRotation', this.lightsRotation);
      } else if (this.isAltLeftDragging && event.button === 0) {
        this.isAltLeftDragging = false;
        this.altLeftTargetSet = false;
      }
    });

    // Prevent context menu on right click with Alt
    this.canvas.addEventListener('contextmenu', (event) => {
      if (event.altKey) {
        event.preventDefault();
      }
    });

    // Handle mouse leave to reset dragging state
    this.canvas.addEventListener('mouseleave', () => {
      if (this.isAltRightDragging) {
        this.isAltRightDragging = false;
        this.controls.enablePan = this.originalControlsEnabled.pan;
        this.controls.enableRotate = this.originalControlsEnabled.rotate;
        if (this.ui?.setLightsRotation) {
          this.ui.setLightsRotation(this.lightsRotation);
        }
        this.stateStore.set('lightsRotation', this.lightsRotation);
      }
      if (this.isAltLeftDragging) {
        this.isAltLeftDragging = false;
        this.altLeftTargetSet = false;
      }
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
    this.eventBus.on('studio:lens-flare-distance', (value) =>
      this.setLensFlareDistance(value),
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
      const light = this.lights[lightId];
      if (!light) return;
      if (property === 'color') {
        light.color = new THREE.Color(value);
        // Update light indicators in real-time when color changes
        this.updateLightIndicators();
      } else if (property === 'intensity') {
        const multiplier = light.isAmbientLight ? 4 : 2;
        light.intensity = value * multiplier;
        // Update light indicators when intensity changes
        this.updateLightIndicators();
      }
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
      this.currentExposure = value;
      if (this.exposurePass) {
        this.exposurePass.uniforms.exposure.value = value;
      }
      // Exposure now works independently without auto-balancing HDRI
    });

    this.eventBus.on('file:selected', (file) => this.loadFile(file));
    this.eventBus.on('file:bundle', (bundle) => this.loadFileBundle(bundle));
    this.eventBus.on('file:reload', () => {
      if (this.currentFile) {
        this.loadFile(this.currentFile, { silent: true });
      } else {
        this.ui.showToast('No model to reload');
      }
    });

    this.eventBus.on('animation:toggle', () => this.toggleAnimation());
    this.eventBus.on('animation:scrub', (value) => this.scrubAnimation(value));
    this.eventBus.on('animation:select', (index) => this.selectAnimation(index));

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
    this.setPodiumScale(state.podiumScale ?? 1);
    this.setGridScale(state.gridScale ?? 1);
    this.currentExposure = state.exposure;
    if (this.exposurePass) {
      this.exposurePass.uniforms.exposure.value = state.exposure;
    }
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
    // Preserve existing clay settings - don't reset them when applying state snapshot
    // Only update if state has clay settings and we don't have any yet
    if (state.clay && !this.claySettings) {
      this.claySettings = { ...state.clay };
    } else if (state.clay) {
      // Merge with existing, preserving current values
      this.claySettings = { ...this.claySettings, ...state.clay };
    }
    this.fresnelSettings = { ...(state.fresnel || this.fresnelSettings) };
    this.wireframeSettings = { ...(state.wireframe || this.wireframeSettings) };
    this.updateWireframeOverlay();
    this.updateDof(state.dof);
    this.updateBloom(state.bloom);
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
    // Initialize clay normal map setting
    if (state.clay?.normalMap !== undefined) {
      this.setClayNormalMap(state.clay.normalMap);
    }
    this.setHdriBlurriness(state.hdriBlurriness ?? 0);
    this.setHdriRotation(state.hdriRotation ?? 0);
    this.setHdriEnabled(state.hdriEnabled);
    this.setHdriBackground(state.hdriBackground);
    const lensDefaults = this.stateStore.getDefaults().lensFlare;
    const lensState = {
      ...lensDefaults,
      ...(state.lensFlare ?? {}),
    };
    this.setLensFlareHeight(lensState.height ?? 0);
    this.setLensFlareDistance(lensState.distance ?? 40);
    this.setLensFlareColor(lensState.color ?? '#d28756');
    this.setLensFlareQuality(lensState.quality ?? 'maximum');
    this.setLensFlareRotation(lensState.rotation ?? 0);
    this.setLensFlareEnabled(lensState.enabled ?? false);
    await this.setHdriPreset(state.hdri);
  }

  async setHdriPreset(preset) {
    const config = HDRI_PRESETS[preset];
    if (!preset || !config) return;
    if (this.currentHdri === preset && this.hdriCache.has(preset)) {
      this.applyEnvironment(this.hdriCache.get(preset));
      this.applyHdriMood(preset);
      // Force restore clay settings after HDRI change
      this.forceRestoreClaySettings();
      return;
    }
    try {
      if (this.hdriCache.has(preset)) {
        const cached = this.hdriCache.get(preset);
        this.applyEnvironment(cached);
        this.currentHdri = preset;
        this.applyHdriMood(preset);
        // Force restore clay settings after HDRI change
        this.forceRestoreClaySettings();
        return;
      }
      const texture = await this.loadHdriTexture(config);
      if (!texture) throw new Error('Texture failed to load');
      this.hdriCache.set(preset, texture);
      this.applyEnvironment(texture);
      this.currentHdri = preset;
      this.applyHdriMood(preset);
      // Force restore clay settings after HDRI change
      this.forceRestoreClaySettings();
    } catch (error) {
      console.error('Failed to load HDRI', error);
      this.ui.showToast('Failed to load HDRI');
    }
  }

  loadHdriTexture(config) {
    const source = typeof config === 'string' ? config : config?.url;
    const type = typeof config === 'object' ? config.type : 'hdr';
    if (!source) {
      return Promise.reject(new Error('Missing HDRI source'));
    }
    if (type === 'ldr') {
      return new Promise((resolve, reject) => {
        this.textureLoader.load(
          source,
          (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.encoding = THREE.sRGBEncoding;
            resolve(texture);
          },
          undefined,
          (err) => reject(err),
        );
      });
    }
    return this.hdriLoader.loadAsync(source).then((texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      // Log loaded texture dimensions
      const width = texture.image?.width || texture.image?.data?.width || 'unknown';
      const height = texture.image?.height || texture.image?.data?.height || 'unknown';
      const pixels = typeof width === 'number' && typeof height === 'number' 
        ? `${(width * height / 1000000).toFixed(2)}M pixels` 
        : 'unknown';
      return texture;
    });
  }

  applyEnvironment(texture) {
    this.currentEnvironmentTexture = texture || null;
    const hdriActive = this.hdriEnabled && this.currentEnvironmentTexture;
    
    if (!hdriActive) {
      this.scene.environment = null;
      this.scene.environmentIntensity = 0;
      this.scene.background = null;
      this.renderer.setClearColor(new THREE.Color(this.backgroundColor), 1);
      // Update all materials to remove environment
      this.updateMaterialsEnvironment(null, 0);
      return;
    }

    // Dispose of previous environment render target if it exists
    if (this.currentEnvironment) {
      this.currentEnvironment.dispose();
      this.currentEnvironment = null;
    }

    // Always use PMREMGenerator for proper IBL
    let envTexture = null;
    if (this.pmremGenerator) {
      // Dispose old render target before creating new one
      if (this.currentEnvironment) {
        this.currentEnvironment.dispose();
        this.currentEnvironment = null;
      }
      
      // Apply rotation to the texture using a shader
      let sourceTexture = this.currentEnvironmentTexture;
      if (this.hdriRotation !== 0) {
        sourceTexture = this.createRotatedTexture(this.currentEnvironmentTexture, this.hdriRotation);
      }
      
      const renderTarget = this.pmremGenerator.fromEquirectangular(
        sourceTexture,
      );
      this.currentEnvironment = renderTarget;
      envTexture = renderTarget.texture;
      
      // Apply blurriness - PMREMGenerator creates mipmaps
      // We can control blur by accessing different mipmap levels
      envTexture.minFilter = THREE.LinearMipmapLinearFilter;
      envTexture.magFilter = THREE.LinearFilter;
      
      // Store blurriness for background use
      envTexture.userData.blurriness = this.hdriBlurriness;
    } else {
      // Fallback to original texture
      envTexture = this.currentEnvironmentTexture;
      // Apply rotation to original texture if needed
      if (this.hdriRotation !== 0 && envTexture) {
        envTexture = this.createRotatedTexture(this.currentEnvironmentTexture, this.hdriRotation);
      }
    }

    this.scene.environment = envTexture;

    // Apply intensity (also darkens the HDRI like in the example)
    // environmentIntensity controls the brightness of environment lighting
    const intensity = Math.max(0, this.hdriStrength);
    this.scene.environmentIntensity = intensity;
    
    // Also update materials directly to ensure intensity is applied
    // Note: Clay materials are completely skipped in updateMaterialsEnvironment
    // They only get envMap and intensity set, nothing else
    this.updateMaterialsEnvironment(envTexture, intensity);
    
    // IMMEDIATELY restore clay settings after environment update
    // Use the dedicated method to ensure consistency
    this.forceRestoreClaySettings();

    // Handle background with blurriness and intensity (like Three.js example)
    const backgroundIsHdri = this.hdriBackgroundEnabled;
    if (backgroundIsHdri && this.currentEnvironmentTexture) {
      // Try using Three.js built-in properties first (if available in newer versions)
      if ('backgroundBlurriness' in this.scene) {
        let bgTexture = this.currentEnvironmentTexture;
        // Apply rotation to background texture
        if (this.hdriRotation !== 0) {
          bgTexture = this.createRotatedTexture(this.currentEnvironmentTexture, this.hdriRotation);
        }
        this.scene.background = bgTexture;
        this.scene.backgroundBlurriness = this.hdriBlurriness;
        this.scene.backgroundIntensity = intensity;
      } else {
        // Fallback for r165: use PMREM texture for blurriness
        // PMREM creates pre-filtered mipmaps which provide blur effect
        let bgTexture = this.currentEnvironmentTexture;
        
        // Apply rotation to background texture
        if (this.hdriRotation !== 0) {
          bgTexture = this.createRotatedTexture(this.currentEnvironmentTexture, this.hdriRotation);
        }
        
        if (this.hdriBlurriness > 0 && envTexture) {
          // Use PMREM texture which is pre-filtered (blurred)
          // Note: PMREM texture already has rotation applied from sourceTexture
          bgTexture = envTexture;
        }
        
        // For intensity, we need to apply it manually
        // Since we can't directly modify the background texture intensity in r165,
        // we'll use the PMREM texture which respects environment intensity
        // The intensity will affect the environment lighting, and we use PMREM for background
        this.scene.background = bgTexture;
        
        // Note: In r165, background intensity isn't directly supported
        // The intensity slider affects environment lighting, not the background texture
        // To properly darken the background, we'd need a custom shader or texture modification
      }
      
      this.renderer.setClearColor(this.clearColor, 1);
    } else {
      this.scene.background = null;
      if ('backgroundBlurriness' in this.scene) {
        this.scene.backgroundBlurriness = 0;
        this.scene.backgroundIntensity = 1;
      }
      this.renderer.setClearColor(new THREE.Color(this.backgroundColor), 1);
    }
  }

  updateMaterialsEnvironment(envTexture, intensity) {
    if (!this.currentModel) return;
    
    // If we're in clay mode, handle clay materials separately and skip the rest
    if (this.currentShading === 'clay') {
      const targetRoughness = this.claySettings?.roughness ?? CLAY_DEFAULT_ROUGHNESS;
      const targetMetalness = this.claySettings?.specular ?? CLAY_DEFAULT_METALNESS;
      
      this.currentModel.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const isClayMaterial = !this.originalMaterials.has(child);
        
        if (isClayMaterial) {
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];
          
          materials.forEach((material) => {
            if (!material || !material.isMeshStandardMaterial) return;
            
            // ONLY set envMap and intensity - NEVER touch roughness/metalness
            material.envMap = envTexture;
            if (material.envMapIntensity !== undefined) {
              material.envMapIntensity = intensity;
            }
            
            // CRITICAL: Always restore roughness and metalness immediately after setting envMap
            // Setting envMap might trigger Three.js internal updates that reset these values
            material.roughness = targetRoughness;
            material.metalness = targetMetalness;
            
            material.needsUpdate = true;
          });
        }
      });
      
      // Don't process non-clay materials when in clay mode
      return;
    }
    
    // For non-clay materials, apply environment and blurriness as normal
    this.currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        
        materials.forEach((material) => {
          if (!material) return;
          
          if (material.isMeshStandardMaterial || 
              material.isMeshPhysicalMaterial || 
              material.isMeshLambertMaterial ||
              material.isMeshPhongMaterial) {
            material.envMap = envTexture;
            if (material.envMapIntensity !== undefined) {
              material.envMapIntensity = intensity;
            }
            
            // Apply blurriness to roughness for non-clay materials only
            if (material.roughness !== undefined) {
              // Store original roughness if not already stored
              if (material.userData.originalRoughness === undefined) {
                const originalMaterial = this.originalMaterials.get(child);
                if (originalMaterial) {
                  const originalMat = Array.isArray(originalMaterial) 
                    ? originalMaterial[0] 
                    : originalMaterial;
                  if (originalMat && originalMat.roughness !== undefined) {
                    material.userData.originalRoughness = originalMat.roughness;
                  } else {
                    material.userData.originalRoughness = material.roughness;
                  }
                } else {
                  material.userData.originalRoughness = material.roughness;
                }
              }
              const baseRoughness = material.userData.originalRoughness ?? material.roughness;
              
              // Apply blurriness by increasing roughness (which uses higher mipmap levels)
              if (this.hdriBlurriness > 0) {
                const blurRoughness = baseRoughness + (1.0 - baseRoughness) * this.hdriBlurriness;
              material.roughness = Math.min(1.0, blurRoughness);
              } else {
                // Reset to base roughness when blurriness is 0
                material.roughness = baseRoughness;
              }
            }
            
            material.needsUpdate = true;
          }
        });
      }
    });
  }

  forceRestoreClaySettings() {
    // Simple restoration - just set the values directly from claySettings
    if (this.currentShading === 'clay' && this.claySettings && this.currentModel) {
      const targetRoughness = this.claySettings.roughness ?? 0.6;
      const targetMetalness = this.claySettings.specular ?? 0.08;
      
      this.currentModel.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const isClayMaterial = !this.originalMaterials.has(child);
        
        if (isClayMaterial) {
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];
          
          materials.forEach((material) => {
            if (!material || !material.isMeshStandardMaterial) return;
            
            // Simply restore the values - no complex checks needed
            if (material.roughness !== undefined) {
              material.roughness = targetRoughness;
            }
            if (material.metalness !== undefined) {
              material.metalness = targetMetalness;
            }
            material.needsUpdate = true;
          });
        }
      });
    }
  }

  setHdriBackground(enabled) {
    this.hdriBackgroundEnabled = enabled;
    this.applyEnvironment(this.currentEnvironmentTexture);
    this.applyHdriMood(this.currentHdri);
    // Force restore clay settings after any HDRI change
    this.forceRestoreClaySettings();
  }

  setLensFlareEnabled(enabled) {
    this.lensFlareEnabled = !!enabled;
    if (this.lensFlare) {
      this.lensFlare.setEnabled(this.lensFlareEnabled && this.hdriEnabled);
    }
  }

  setLensFlareRotation(value) {
    if (this.lensFlare) {
      this.lensFlare.setRotation(value ?? 0);
    }
  }

  setLensFlareHeight(value) {
    if (this.lensFlare) {
      const clamped = Math.max(0, Math.min(90, value ?? 0));
      this.lensFlare.setHeight(clamped);
    }
  }

  setLensFlareColor(value) {
    if (this.lensFlare && value) {
      this.lensFlare.setColor(value);
    }
  }

  setLensFlareQuality(mode) {
    if (this.lensFlare && mode) {
      this.lensFlare.setQuality(mode);
    }
  }

  setLensFlareDistance(value) {
    if (this.lensFlare) {
      this.lensFlare.setDistance(value ?? 40);
    }
  }

  setClayNormalMap(enabled) {
    if (this.currentShading === 'clay' && this.currentModel) {
      this.currentModel.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const isClayMaterial = !this.originalMaterials.has(child);
        if (isClayMaterial) {
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];
          materials.forEach((material) => {
            if (!material || !material.isMeshStandardMaterial) return;
            if (enabled) {
              // Restore normal map from original material
              const originalMaterial = this.originalMaterials.get(child);
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
    if (this.colorAdjustPass) {
      this.colorAdjustPass.uniforms.contrast.value = value ?? 1.0;
      this.updateColorAdjustPassEnabled();
    }
  }

  setHue(value) {
    if (this.colorAdjustPass) {
      this.colorAdjustPass.uniforms.hue.value = value ?? 0.0;
      this.updateColorAdjustPassEnabled();
    }
  }

  setSaturation(value) {
    if (this.colorAdjustPass) {
      this.colorAdjustPass.uniforms.saturation.value = value ?? 1.0;
      this.updateColorAdjustPassEnabled();
    }
  }

  updateColorAdjustPassEnabled() {
    if (!this.colorAdjustPass) return;
    const contrast = this.colorAdjustPass.uniforms.contrast.value;
    const hue = this.colorAdjustPass.uniforms.hue.value;
    const saturation = this.colorAdjustPass.uniforms.saturation.value;
    // Only enable the pass if any value is not at default
    const isDefault = Math.abs(contrast - 1.0) < 0.001 && 
                      Math.abs(hue - 0.0) < 0.001 && 
                      Math.abs(saturation - 1.0) < 0.001;
    this.colorAdjustPass.enabled = !isDefault;
  }

  setHdriEnabled(enabled) {
    this.hdriEnabled = enabled;
    this.applyEnvironment(this.currentEnvironmentTexture);
    this.applyHdriMood(this.currentHdri);
    if (this.lensFlare) {
      this.lensFlare.setEnabled(this.lensFlareEnabled && this.hdriEnabled);
    }
    // Force restore clay settings after any HDRI change
    this.forceRestoreClaySettings();
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
    // Regenerate environment to update both lighting and background
    this.applyEnvironment(this.currentEnvironmentTexture);
    // Force restore clay settings after any HDRI change
    this.forceRestoreClaySettings();
  }

  setHdriBlurriness(value) {
    this.hdriBlurriness = Math.min(1, Math.max(0, value));
    // Regenerate environment map with new blurriness
    this.applyEnvironment(this.currentEnvironmentTexture);
    // Force restore clay settings after blurriness change
    this.forceRestoreClaySettings();
  }

  setHdriRotation(value) {
    this.hdriRotation = Math.min(360, Math.max(0, value));
    this.stateStore.set('hdriRotation', this.hdriRotation);
    // Also rotate lights to stay in sync (without updating HDRI again to avoid loop)
    this.setLightsRotation(this.hdriRotation, { updateUi: true, updateHdri: false });
    // Regenerate environment map with new rotation
    this.applyEnvironment(this.currentEnvironmentTexture);
    // Force restore clay settings after any HDRI change
    this.forceRestoreClaySettings();
  }

  createRotatedTexture(sourceTexture, rotationDegrees) {
    if (!sourceTexture) return sourceTexture;
    
    // Convert rotation from degrees to normalized value (0-1)
    const rotation = (rotationDegrees / 360) % 1.0;
    
    // Dispose old render target if it exists
    if (this.rotationRenderTarget) {
      this.rotationRenderTarget.dispose();
    }
    
    // Get exact texture dimensions from source - check multiple possible locations
    let width = sourceTexture.image?.width;
    let height = sourceTexture.image?.height;
    
    // For HDR textures, dimensions might be in image.data
    if (!width && sourceTexture.image?.data) {
      width = sourceTexture.image.data.width;
      height = sourceTexture.image.data.height;
    }
    
    // Fallback to render target size if available
    if (!width && sourceTexture.source?.data) {
      width = sourceTexture.source.data.width;
      height = sourceTexture.source.data.height;
    }
    
    // Last resort: use actual texture dimensions from WebGL
    if (!width) {
      // Try to get from the texture itself
      const gl = this.renderer.getContext();
      if (gl && sourceTexture.id !== undefined) {
        // This is a workaround - we'll use the source texture's actual size
        // For now, log a warning and use a safe default
        console.warn('Could not detect HDRI texture dimensions, using source texture directly');
        // Return original texture if we can't determine size
        return sourceTexture;
      }
      width = 2048;
      height = 1024;
    }
    
    // Log texture size for debugging
    
    // Detect HDR texture properties
    // HDR textures typically use RGBE encoding or HalfFloat/Float types
    const isHDR = sourceTexture.encoding === THREE.RGBEEncoding || 
                  sourceTexture.type === THREE.HalfFloatType ||
                  sourceTexture.type === THREE.FloatType ||
                  (sourceTexture.format === THREE.RGBAFormat && 
                   (sourceTexture.type === THREE.UnsignedByteType && 
                    sourceTexture.encoding === THREE.RGBEEncoding));
    
    // Preserve original format and type for HDR textures
    let format = sourceTexture.format || THREE.RGBAFormat;
    let type = sourceTexture.type || THREE.UnsignedByteType;
    let encoding = sourceTexture.encoding || THREE.sRGBEncoding;
    
    // For HDR textures, ensure we use appropriate types
    if (isHDR) {
      // HDR textures should use HalfFloat or Float for better quality
      if (type === THREE.UnsignedByteType && encoding === THREE.RGBEEncoding) {
        // RGBE encoded HDR - keep the encoding
        type = THREE.UnsignedByteType;
        encoding = THREE.RGBEEncoding;
      } else if (type !== THREE.HalfFloatType && type !== THREE.FloatType) {
        // Try to use HalfFloat if available for better HDR quality
        type = THREE.HalfFloatType;
      }
    }
    
    // Create render target with preserved format and type
    this.rotationRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      format: format,
      type: type,
      encoding: encoding,
      generateMipmaps: false, // Don't generate mipmaps for rotated texture
    });
    
    // Create shader material for rotation
    const material = new THREE.ShaderMaterial({
      uniforms: {
        tEquirect: { value: sourceTexture },
        rotation: { value: rotation },
      },
      vertexShader: RotateEquirectShader.vertexShader,
      fragmentShader: RotateEquirectShader.fragmentShader,
    });
    
    // Create a fullscreen quad
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      material,
    );
    
    const scene = new THREE.Scene();
    scene.add(quad);
    
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    // Render to texture
    const oldRenderTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rotationRenderTarget);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(oldRenderTarget);
    
    // Clean up
    quad.geometry.dispose();
    material.dispose();
    scene.remove(quad);
    
    // Use the render target texture directly
    const rotatedTexture = this.rotationRenderTarget.texture;
    rotatedTexture.mapping = THREE.EquirectangularReflectionMapping;
    rotatedTexture.encoding = encoding;
    rotatedTexture.format = format;
    rotatedTexture.type = type;
    
    // Ensure texture is properly initialized
    if (!rotatedTexture.image) {
      rotatedTexture.image = {
        width: width,
        height: height,
      };
    }
    
    return rotatedTexture;
  }

  setClaySettings(patch) {
    this.claySettings = { ...this.claySettings, ...patch };
    if (this.stateStore.getState().shading === 'clay') {
      // Update existing clay materials directly instead of recreating them
      if (this.currentModel) {
        this.currentModel.traverse((child) => {
          if (!child.isMesh) return;
          const material = child.material;
          // Check if this is a clay material (not an original material)
          const original = this.originalMaterials.get(child);
          const isClayMaterial = material && original && material !== original && 
            (!Array.isArray(material) || !Array.isArray(original) || material.length !== original.length || 
             !material.every((mat, idx) => mat === original[idx]));
          
          if (isClayMaterial) {
            // This is a clay material, update it directly
            if (Array.isArray(material)) {
              material.forEach((mat) => {
                if (mat && mat.isMeshStandardMaterial) {
                  if (patch.color !== undefined) {
                    mat.color.set(patch.color);
                  }
                  if (patch.roughness !== undefined) {
                    mat.roughness = patch.roughness;
                  }
                  if (patch.specular !== undefined) {
                    mat.metalness = patch.specular;
                  }
                  // Always ensure values are set from claySettings, even if patch doesn't include them
                  // This prevents values from being 0 or undefined
                  if (mat.roughness === undefined || mat.roughness === 0) {
                    mat.roughness = this.claySettings.roughness ?? 0.6;
                  }
                  if (mat.metalness === undefined || mat.metalness === 0) {
                    mat.metalness = this.claySettings.specular ?? 0.08;
                  }
                  mat.needsUpdate = true;
                }
              });
            } else if (material.isMeshStandardMaterial) {
              if (patch.color !== undefined) {
                material.color.set(patch.color);
              }
              if (patch.roughness !== undefined) {
                material.roughness = patch.roughness;
              }
              if (patch.specular !== undefined) {
                material.metalness = patch.specular;
              }
              // Always ensure values are set from claySettings, even if patch doesn't include them
              if (material.roughness === undefined || material.roughness === 0) {
                material.roughness = this.claySettings.roughness ?? 0.6;
              }
              if (material.metalness === undefined || material.metalness === 0) {
                material.metalness = this.claySettings.specular ?? 0.08;
              }
              material.needsUpdate = true;
            }
          }
        });
      } else {
        // Fallback to recreating materials if no model loaded
      this.setShading('clay');
      }
    }
  }

  setWireframeSettings(patch) {
    this.wireframeSettings = { ...this.wireframeSettings, ...patch };
    this.stateStore.set('wireframe', this.wireframeSettings);
    this.updateWireframeOverlay();
    if (this.currentShading === 'wireframe') {
      this.setShading('wireframe');
    }
  }

  clearWireframeOverlay() {
    if (this.wireframeOverlay) {
      this.wireframeOverlay.traverse((child) => {
        if (child.isMesh) {
          // Only dispose geometry if it was cloned (has userData.isCloned)
          if (child.geometry && child.userData.isCloned) {
            child.geometry.dispose();
          }
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((mat) => mat?.dispose?.());
            } else {
              child.material.dispose();
            }
          }
        }
      });
      // Remove from parent (could be currentModel or modelRoot)
      if (this.wireframeOverlay.parent) {
        this.wireframeOverlay.parent.remove(this.wireframeOverlay);
      }
      this.wireframeOverlay = null;
    }
  }

  updateWireframeOverlay() {
    if (!this.currentModel) return;

    // Always clear existing overlay first to prevent duplicates
    this.clearWireframeOverlay();

    // Create overlay if "always on" is enabled
    if (this.wireframeSettings.alwaysOn) {
      this.wireframeOverlay = new THREE.Group();
      this.wireframeOverlay.name = 'wireframeOverlay';

      const { color, onlyVisibleFaces } = this.wireframeSettings;
      const wireMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        wireframe: true,
        depthTest: onlyVisibleFaces, // Enable depth test when only showing visible faces
        depthWrite: false,
        transparent: !onlyVisibleFaces, // No transparency when showing only visible faces
        opacity: onlyVisibleFaces ? WIREFRAME_OPACITY_VISIBLE : WIREFRAME_OPACITY_OVERLAY,
      });
      
      // Add depth offset to prevent z-fighting when showing only visible faces
      // Increased values help with darker colors where z-fighting is more visible
      if (onlyVisibleFaces) {
        wireMaterial.polygonOffset = true;
        wireMaterial.polygonOffsetFactor = WIREFRAME_POLYGON_OFFSET_FACTOR;
        wireMaterial.polygonOffsetUnits = WIREFRAME_POLYGON_OFFSET_UNITS;
      }

      // Create wireframe meshes that follow the model
      this.currentModel.traverse((child) => {
        if (child.isMesh && child.geometry) {
          let geometry = child.geometry;
          let isCloned = false;
          
          // If onlyVisibleFaces is enabled, push vertices along normals
          if (onlyVisibleFaces) {
            // Clone geometry so we don't modify the original
            geometry = child.geometry.clone();
            isCloned = true;
            const positions = geometry.attributes.position;
            
            // Compute normals if they don't exist
            if (!geometry.attributes.normal) {
              geometry.computeVertexNormals();
            }
            
            // Push vertices along their normals by a small amount (0.002 units)
            const offset = WIREFRAME_OFFSET;
            for (let i = 0; i < positions.count; i++) {
              const normal = new THREE.Vector3();
              normal.fromBufferAttribute(geometry.attributes.normal, i);
              const position = new THREE.Vector3();
              position.fromBufferAttribute(positions, i);
              position.addScaledVector(normal, offset);
              positions.setXYZ(i, position.x, position.y, position.z);
            }
            positions.needsUpdate = true;
          }
          
          const wireMesh = new THREE.Mesh(geometry, wireMaterial);
          // Link to original mesh for matrix updates
          wireMesh.userData.originalMesh = child;
          wireMesh.userData.isCloned = isCloned;
          wireMesh.renderOrder = 999; // Render on top
          this.wireframeOverlay.add(wireMesh);
        }
      });

      // Add wireframe overlay as a child of currentModel so it inherits the same transforms
      // This ensures both the original meshes and wireframe meshes rotate together through modelRoot
      if (this.currentModel) {
        this.currentModel.add(this.wireframeOverlay);
      } else {
        this.modelRoot.add(this.wireframeOverlay);
      }
    }
  }

  updateWireframeOverlayTransforms() {
    if (!this.wireframeOverlay || !this.currentModel) return;
    
    // Update wireframe overlay transforms to match the model perfectly
    // Since wireframeOverlay is now a child of currentModel (same as original meshes),
    // we just need to copy local transforms and they'll inherit modelRoot rotations together
    this.wireframeOverlay.traverse((wireMesh) => {
      if (wireMesh.isMesh && wireMesh.userData.originalMesh) {
        const original = wireMesh.userData.originalMesh;
        // Copy local position, rotation, and scale from original
        // This ensures they transform together through modelRoot
        wireMesh.position.copy(original.position);
        wireMesh.rotation.copy(original.rotation);
        wireMesh.scale.copy(original.scale);
        // Let Three.js handle matrix updates through the parent hierarchy
        wireMesh.matrixAutoUpdate = true;
        wireMesh.updateMatrix();
        wireMesh.matrixAutoUpdate = false;
      }
    });
  }

  setGroundSolid(enabled) {
    if (this.podium) this.podium.visible = enabled;
    if (this.podiumShadow) this.podiumShadow.visible = enabled;
  }

  setGroundWire(enabled) {
    if (this.grid) this.grid.visible = enabled;
  }

  setGroundSolidColor(color) {
    this.groundSolidColor = color;
    if (this.podium?.material?.color) {
      this.podium.material.color.set(color);
    }
  }

  setGroundWireColor(color) {
    this.groundWireColor = color;
    if (this.gridMaterials) {
      this.gridMaterials.forEach((mat) => {
        if (mat?.color) {
          mat.color.set(color);
        }
      });
    }
  }

  setGroundWireOpacity(value) {
    this.groundWireOpacity = value;
    if (this.gridMaterials) {
      this.gridMaterials.forEach((mat) => {
        if (mat) {
          mat.opacity = value;
        }
      });
    }
  }

  setGroundY(value) {
    this.groundY = value;
    if (this.podium) this.podium.position.y = value;
    if (this.podiumShadow) this.podiumShadow.position.y = value - this.groundHeight;
  }

  setGridY(value) {
    this.gridY = value;
    if (this.grid) this.grid.position.y = value;
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

    const bottomY = bounds.min.y;
    this.setGroundY(bottomY);
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

    const bottomY = bounds.min.y;
    this.setGridY(bottomY);
    this.stateStore.set('gridY', bottomY);
    this.ui?.showToast?.('Grid snapped to mesh bottom');
  }

  disposeGroundMeshes() {
    if (this.podium) {
      this.scene.remove(this.podium);
      this.podium.geometry.dispose();
      this.podium.material.dispose?.();
      this.podium = null;
    }
    if (this.podiumShadow) {
      this.scene.remove(this.podiumShadow);
      this.podiumShadow.geometry.dispose();
      this.podiumShadow.material.dispose?.();
      this.podiumShadow = null;
    }
    if (this.grid) {
      this.scene.remove(this.grid);
      if (Array.isArray(this.grid.material)) {
        this.grid.material.forEach((mat) => mat?.dispose?.());
      } else {
        this.grid.material?.dispose?.();
      }
      this.grid = null;
      this.gridMaterials = null;
    }
  }

  buildGroundMeshes() {
    this.disposeGroundMeshes();
    this.podiumBaseRadius = 2; // Store base radius for scaling
    const baseRadius = this.podiumBaseRadius * this.podiumScale;
    const height = this.groundHeight;
    const topRadius = (this.podiumBaseRadius - PODIUM_TOP_RADIUS_OFFSET) * this.podiumScale;
    const segments = PODIUM_SEGMENTS;

    const podiumGeo = new THREE.CylinderGeometry(
      topRadius,
      baseRadius,
      height,
      segments,
      1,
      false,
    );
    podiumGeo.translate(0, -height / 2, 0);

    const solidMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.groundSolidColor),
      roughness: DEFAULT_MATERIAL_ROUGHNESS,
      metalness: DEFAULT_MATERIAL_METALNESS,
    });

    this.podium = new THREE.Mesh(podiumGeo, solidMat);
    this.podium.receiveShadow = true;
    this.podium.visible = false; // Hidden by default until enabled
    this.scene.add(this.podium);

    const shadowMat = new THREE.ShadowMaterial({
      opacity: 0.4,
    });
    this.podiumShadow = new THREE.Mesh(
      new THREE.CircleGeometry(baseRadius * PODIUM_RADIUS_MULTIPLIER, segments),
      shadowMat,
    );
    this.podiumShadow.rotation.x = -Math.PI / 2;
    this.podiumShadow.receiveShadow = true;
    this.podiumShadow.visible = false; // Hidden by default until enabled
    this.scene.add(this.podiumShadow);

    this.grid = new THREE.GridHelper(
      baseRadius * 2 * this.gridScale,
      32,
      this.groundWireColor,
      this.groundWireColor,
    );
    this.gridMaterials = Array.isArray(this.grid.material)
      ? this.grid.material
      : [this.grid.material];
    this.gridMaterials.forEach((mat) => {
      if (!mat) return;
      mat.transparent = true;
      mat.opacity = this.groundWireOpacity;
      mat.depthWrite = false;
      mat.toneMapped = false;
      if (mat.color) mat.color.set(this.groundWireColor);
    });
    this.grid.visible = false; // Hidden by default until enabled
    this.scene.add(this.grid);

    this.setGroundY(this.groundY);
    this.setGridY(this.gridY);
  }

  setPodiumScale(value) {
    this.podiumScale = Math.min(3, Math.max(0.5, value));
    // Store visibility state and current color before rebuilding
    const wasVisible = this.podium?.visible ?? false;
    const currentColor = this.podium?.material?.color 
      ? `#${this.podium.material.color.getHexString()}`
      : this.groundSolidColor;
    // Store the current top face position (where it meets the mesh)
    // Top face is at: groundY + height/2 (because geometry is translated by -height/2)
    const topFaceY = this.groundY + this.groundHeight / 2;
    // Rebuild the podium with new scale (this will reset position to current groundY)
    this.buildGroundMeshes();
    // Restore visibility state and color
    if (this.podium) {
      this.podium.visible = wasVisible;
      this.podium.material.color.set(currentColor);
    }
    if (this.podiumShadow) this.podiumShadow.visible = wasVisible;
    // Adjust Y position so top face stays at the same absolute position
    // After rebuild, top face would be at: groundY + height/2
    // We want it to stay at: topFaceY
    // So: groundY + height/2 = topFaceY
    // Therefore: groundY = topFaceY - height/2
    this.groundY = topFaceY - this.groundHeight / 2;
    this.setGroundY(this.groundY);
  }

  setGridScale(value) {
    this.gridScale = Math.min(3, Math.max(0.5, value));
    // Store visibility state before rebuilding
    const wasVisible = this.grid?.visible ?? false;
    // Rebuild the ground meshes to update grid size
    this.buildGroundMeshes();
    // Restore visibility state
    if (this.grid) this.grid.visible = wasVisible;
  }

  applyLightSettings(lightsState) {
    if (!lightsState) return;
    Object.entries(lightsState).forEach(([id, config]) => {
      const light = this.lights[id];
      if (!light) return;
      if (config.color) {
        light.color = new THREE.Color(config.color);
      }
      const multiplier = light.isAmbientLight ? 4 : 2;
      const baseIntensity = (config.intensity ?? 0) * multiplier;
      const targetIntensity = baseIntensity * (this.lightsMaster ?? 1);
      light.intensity = this.lightsEnabled ? targetIntensity : 0;
    });
    // Update light indicators if visible
    this.updateLightIndicators();
  }

  setLightsEnabled(enabled) {
    this.lightsEnabled = enabled;
    if (enabled) {
      this.applyLightSettings(this.stateStore.getState().lights);
    } else {
      Object.values(this.lights).forEach((light) => {
        if (!light) return;
        light.intensity = 0;
      });
    }
  }

  setLightsMaster(value) {
    this.lightsMaster = value;
    if (this.lightsEnabled) {
      this.applyLightSettings(this.stateStore.getState().lights);
    }
    // Update light indicators if visible
    this.updateLightIndicators();
  }

  setShowLightIndicators(enabled) {
    if (enabled) {
      this.createLightIndicators();
    } else {
      this.clearLightIndicators();
    }
  }

  clearLightIndicators() {
    if (this.lightIndicators) {
      this.scene.remove(this.lightIndicators);
      this.lightIndicators.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.lightIndicators = null;
    }
  }

  createLightIndicators() {
    this.clearLightIndicators();
    if (!this.modelBounds || !this.lightBasePositions) return;

    const group = new THREE.Group();
    const { center, radius } = this.modelBounds;
    const baseDistance = radius * 2.5; // Position lights further out from mesh

    ['key', 'fill', 'rim'].forEach((id) => {
      const light = this.lights[id];
      if (!light) return;

      // Get current light position (already rotated)
      const lightPos = light.position.clone();
      
      // Calculate direction from mesh center to light
      const direction = lightPos.clone().sub(center).normalize();
      
      // Position indicator at a fixed distance from mesh center, in the same direction as the light
      const position = center.clone().add(direction.multiplyScalar(baseDistance));

      // Create cone geometry (simplified spotlight)
      const coneHeight = 0.3;
      const coneRadius = 0.15;
      const geometry = new THREE.ConeGeometry(coneRadius, coneHeight, 8);
      const material = new THREE.MeshBasicMaterial({
        color: light.color,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      });

      const cone = new THREE.Mesh(geometry, material);
      
      // Position cone at calculated position
      cone.position.copy(position);
      
      // Orient cone so wide end (base) points at mesh center (like a real spotlight)
      // ConeGeometry has tip at +Y and base at -Y in local space
      // We want the base (-Y) to point at the mesh center
      // Calculate direction from light to center
      const dirToCenter = center.clone().sub(position).normalize();
      // Create a quaternion that rotates -Y (base) to point in dirToCenter direction
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(up.clone().negate(), dirToCenter); // negate up to get -Y
      cone.quaternion.copy(quaternion);
      
      // Store light ID for updates
      cone.userData.lightId = id;
      group.add(cone);
    });

    this.lightIndicators = group;
    this.scene.add(group);
    this.updateLightIndicators();
  }

  updateLightIndicators() {
    if (!this.lightIndicators || !this.modelBounds || !this.lightBasePositions) return;

    const { center, radius } = this.modelBounds;
    const baseDistance = radius * 2.5;

    this.lightIndicators.traverse((child) => {
      if (!child.isMesh || !child.userData.lightId) return;
      
      const lightId = child.userData.lightId;
      const light = this.lights[lightId];
      if (!light) return;

      // Get current light position (already rotated)
      const lightPos = light.position.clone();
      
      // Calculate direction from mesh center to light
      const direction = lightPos.clone().sub(center).normalize();
      
      // Position indicator at a fixed distance from mesh center, in the same direction as the light
      const newPosition = center.clone().add(direction.multiplyScalar(baseDistance));
      child.position.copy(newPosition);

      // Update color
      child.material.color.copy(light.color);

      // Update size based on intensity (scale from 0.5 to 2.5 based on intensity 0-5)
      // lightsMaster can go up to 5, and individual intensities are multiplied by 2 (non-ambient)
      // So max intensity = baseIntensity * 2 * 5 = up to 10 for non-ambient lights
      // We want to scale from 0.5 to 2.5 based on lightsMaster 0-5
      const maxIntensity = 10; // Max intensity when lightsMaster is 5
      const normalizedIntensity = Math.min(light.intensity / maxIntensity, 1);
      const scale = 0.5 + normalizedIntensity * 2.0; // Scale from 0.5 to 2.5
      child.scale.set(scale, scale, scale);

      // Re-orient to point at mesh center (wide end pointing at mesh, like a real spotlight)
      const dirToCenter = center.clone().sub(newPosition).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(up.clone().negate(), dirToCenter); // negate up to get -Y
      child.quaternion.copy(quaternion);
    });
  }

  setLightsRotation(value, { updateUi = true, updateHdri = false } = {}) {
    this.lightsRotation = ((value % 360) + 360) % 360;
    if (!this.lightBasePositions) return;
    const radians = THREE.MathUtils.degToRad(this.lightsRotation);
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    ['key', 'fill', 'rim'].forEach((id) => {
      const base = this.lightBasePositions[id];
      const light = this.lights[id];
      if (!base || !light) return;
      const rotatedX = base.x * cos + base.z * sin;
      const rotatedZ = -base.x * sin + base.z * cos;
      light.position.set(rotatedX, base.y, rotatedZ);
    });
    // Also rotate HDRI with lights (unless we're being called from setHdriRotation to avoid loop)
    if (updateHdri) {
      this.hdriRotation = this.lightsRotation;
      this.stateStore.set('hdriRotation', this.hdriRotation);
      this.applyEnvironment(this.currentEnvironmentTexture);
      this.forceRestoreClaySettings();
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
    this.fresnelSettings = {
      ...this.fresnelSettings,
      ...settings,
    };
    this.fresnelSettings.radius = Math.max(0.1, this.fresnelSettings.radius || 1);
    this.applyFresnelToModel(this.currentModel);
  }

  applyHdriMood(preset) {
    const style = HDRI_MOODS[preset];
    const state = this.stateStore.getState();
    if (!style) {
      if (this.podium) this.podium.material.color.set(this.groundSolidColor);
      if (!this.hdriBackgroundEnabled || !this.currentEnvironmentTexture) {
        this.renderer.setClearColor(new THREE.Color(this.backgroundColor), 1);
      }
      this.updateBloom(state.bloom);
      this.updateGrain(state.grain);
      return;
    }
    if (style.podiumColor && this.podium) {
      this.podium.material.color.set(style.podiumColor);
    }
    if (
      style.background &&
      (!this.hdriBackgroundEnabled || !this.currentEnvironmentTexture)
    ) {
      this.renderer.setClearColor(new THREE.Color(style.background), 1);
    }
    if (style.bloomTint && this.bloomTintPass) {
      const bloomState = {
        ...state.bloom,
        enabled: true,
        color: style.bloomTint,
        // Preserve user's bloom strength - don't change it based on HDRI mood
        strength: state.bloom.strength,
        radius: state.bloom.radius,
      };
      // Update state store so UI reflects the mood's color (but not strength)
      this.stateStore.set('bloom', bloomState);
      this.updateBloom(bloomState);
    }
    if (this.grainTintPass) {
      const grainState = {
        ...state.grain,
        color: style.grainTint ?? state.grain.color,
      };
      // Update state store so UI reflects the mood's color
      if (style.grainTint) {
        this.stateStore.set('grain', grainState);
      }
      this.updateGrain(grainState);
    }
  }

  applyFresnelToModel(root) {
    if (!root) return;
    root.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((mat) => this.applyFresnelToMaterial(mat));
    });
  }

  applyFresnelToMaterial(material) {
    const settings = this.fresnelSettings || {};
    const needsFresnel =
      settings.enabled &&
      settings.strength > 0.0001 &&
      material &&
      material.onBeforeCompile !== undefined &&
      (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial);

    if (!needsFresnel) {
      if (material?.userData?.fresnelPatched) {
        material.onBeforeCompile =
          material.userData.originalOnBeforeCompile || (() => {});
        delete material.userData.originalOnBeforeCompile;
        delete material.userData.fresnelPatched;
        delete material.userData.fresnelUniforms;
        material.needsUpdate = true;
      }
      return;
    }

    // Always re-patch if material was replaced or uniforms are missing
    // This ensures Fresnel works even after material updates/recompilations
    if (material.userData.fresnelPatched) {
      const uniforms = material.userData.fresnelUniforms;
      // If uniforms exist and are valid, just update values
      if (uniforms && uniforms.color && uniforms.color.value) {
        uniforms.color.value.set(settings.color);
        uniforms.strength.value = settings.strength;
        uniforms.power.value = Math.max(0.1, settings.radius);
        // Force shader recompilation to ensure uniforms are applied
        material.needsUpdate = true;
        return;
      }
      // If uniforms are missing, clear flag and re-patch
      delete material.userData.fresnelPatched;
      delete material.userData.originalOnBeforeCompile;
    }

    // Create new patch - this handles both new materials and re-patching
    const original = material.onBeforeCompile;
    material.userData.originalOnBeforeCompile = original;
    
    // Create uniforms that will be stored and reused
    const uniforms = {
      color: { value: new THREE.Color(settings.color) },
      strength: { value: settings.strength },
      power: { value: Math.max(0.1, settings.radius) },
    };
    
    // Store uniforms before patching so they're available even if shader recompiles
    material.userData.fresnelUniforms = uniforms;
    
    material.onBeforeCompile = (shader) => {
      original?.(shader);
      
      // Use stored uniforms or create new ones if missing (defensive)
      const fresnelUniforms = material.userData.fresnelUniforms || uniforms;
      
      shader.uniforms.fresnelColor = fresnelUniforms.color;
      shader.uniforms.fresnelStrength = fresnelUniforms.strength;
      shader.uniforms.fresnelPower = fresnelUniforms.power;
      
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `
        #include <common>
        uniform vec3 fresnelColor;
        uniform float fresnelStrength;
        uniform float fresnelPower;
      `,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `
        #include <lights_fragment_end>
        vec3 fresnelNormal = normalize( normal );
        vec3 fresnelViewDir = normalize( vViewPosition );
        float fresnelTerm = pow( max(0.0, 1.0 - abs(dot(fresnelNormal, fresnelViewDir))), fresnelPower );
        vec3 fresnelContribution = fresnelColor * fresnelTerm * fresnelStrength;
        reflectedLight.directDiffuse += fresnelContribution;
        totalEmissiveRadiance += fresnelContribution;
      `,
      );
      
      // Ensure uniforms are stored after shader compilation
      material.userData.fresnelUniforms = fresnelUniforms;
    };
    material.userData.fresnelPatched = true;
    material.needsUpdate = true;
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
    this.backgroundColor = color;
    if (!this.hdriBackgroundEnabled || !this.hdriEnabled) {
      const background = new THREE.Color(color);
      this.scene.background = null;
      this.renderer.setClearColor(background, 1);
    }
  }

  async loadFile(file, options = {}) {
    if (!file) return;
    this.currentFile = file;
    const extension = file.name.split('.').pop().toLowerCase();
    this.ui.updateTitle(file.name);
    this.ui.updateTopBarDetail(`${file.name} — Loading…`);
    this.ui.setDropzoneVisible(false);

    try {
      const asset = await this.parseFileByExtension(file, extension);
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

  async parseFileByExtension(file, ext) {
    switch (ext) {
      case 'glb':
        return this.loadGlb(file);
      case 'fbx':
        return this.loadFbx(file);
      case 'stl':
        return this.loadStl(file);
      default:
        throw new Error(`Unsupported format: .${ext}`);
    }
  }

  async loadGlb(file) {
    const buffer = await this.fileReaders.buffer(file);
    return new Promise((resolve, reject) => {
      this.gltfLoader.parse(
        buffer,
        '',
        (gltf) => {
          // Extract asset metadata from the parsed GLTF
          // The parser.json contains the original GLTF JSON structure
          const json = gltf.parser?.json || {};
          const asset = json.asset || {};
          // Try to get asset name from scene name, first node name, or filename
          let assetName = gltf.scene?.name;
          if (!assetName && gltf.scene?.children?.length > 0) {
            assetName = gltf.scene.children[0]?.name;
          }
          if (!assetName) {
            assetName = file.name.replace(/\.[^/.]+$/, '');
          }
          resolve({
            object: gltf.scene,
            animations: gltf.animations,
            gltfMetadata: {
              assetName,
              generator: asset.generator || null,
              version: asset.version || null,
              copyright: asset.copyright || null,
            },
          });
        },
        reject,
      );
    });
  }

  async loadGltf(file) {
    this.ui.showToast('Please convert GLTF to GLB before loading');
    throw new Error('GLTF not supported');
  }

  async loadFileBundle(files) {
    if (!files?.length) return;
    const normalizedMap = new Map();
    files.forEach(({ file, path }) => {
      const key = this.normalizePath(path || file.name);
      normalizedMap.set(key, file);
      normalizedMap.set(key.toLowerCase(), file);
    });

    const primaryKey = [...normalizedMap.keys()].find((key) =>
      key.toLowerCase().endsWith('.gltf'),
    );
    let primaryFile = primaryKey ? normalizedMap.get(primaryKey) : null;

    if (!primaryFile) {
      const glbKey = [...normalizedMap.keys()].find((key) =>
        key.toLowerCase().endsWith('.glb'),
      );
      if (glbKey) {
        await this.loadFile(normalizedMap.get(glbKey));
        return;
      }
      this.ui.showToast('No .gltf/.glb in folder');
      return;
    }

    const rootPath = this.getDirectoryFromPath(primaryKey);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder?.(MeshoptDecoder);
    loader.setURLModifier((url) => {
      if (/^https?:\/\//i.test(url)) return url;
      const decoded = decodeURI(url);
      const relative = this.normalizePath(decoded);
      const candidates = [
        this.normalizePath(`${rootPath}${relative}`),
        relative,
      ];
      for (const candidate of candidates) {
        const match =
          normalizedMap.get(candidate) ||
          normalizedMap.get(candidate.toLowerCase());
        if (match) {
          const objectUrl = URL.createObjectURL(match);
          this.registerObjectUrl(objectUrl);
          return objectUrl;
        }
      }
      return url;
    });

    const text = await this.fileReaders.text(primaryFile);
    loader.parse(
      text,
      '/',
      (gltf) => {
        // Extract asset metadata from the parsed GLTF
        const asset = gltf.parser?.json?.asset || {};
        const assetName = gltf.scene?.name || primaryFile.name.replace(/\.[^/.]+$/, '');
        const gltfMetadata = {
          assetName,
          generator: asset.generator || null,
          version: asset.version || null,
          copyright: asset.copyright || null,
        };
        this.setModel(gltf.scene, gltf.animations ?? []);
        this.updateStatsUI(primaryFile, gltf.scene, gltfMetadata);
        this.ui.updateTitle(primaryFile.name);
        this.ui.showToast('Folder loaded');
      },
      (error) => {
        console.error('Folder load failed', error);
        this.ui.showToast('Folder load failed');
      },
    );
  }

  createObjectUrlDirectory(file) {
    if (!file) return '';
    const url = URL.createObjectURL(file);
    this.registerObjectUrl(url);
    return url.replace(/[^/]+$/, '');
  }

  disposePendingObjectUrls() {
    if (!this.pendingObjectUrls) return;
    this.pendingObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.pendingObjectUrls = [];
  }

  registerObjectUrl(url) {
    this.pendingObjectUrls = this.pendingObjectUrls ?? [];
    this.pendingObjectUrls.push(url);
  }

  normalizePath(path = '') {
    return path
      .replace(/\\/g, '/')
      .replace(/^(\.\/)+/, '')
      .replace(/\/{2,}/g, '/')
      .replace(/^\//, '')
      .trim();
  }

  getDirectoryFromPath(path = '') {
    const normalized = this.normalizePath(path);
    if (!normalized.includes('/')) return '';
    return normalized.replace(/[^/]+$/, '');
  }

  async loadFbx(file) {
    const buffer = await this.fileReaders.buffer(file);
    return new Promise((resolve, reject) => {
      try {
        const object = this.fbxLoader.parse(buffer, '');
        resolve({ object, animations: object.animations ?? [] });
      } catch (error) {
        reject(error);
      }
    });
  }

  async loadObj(file) {
    const text = await this.fileReaders.text(file);
    return new Promise((resolve, reject) => {
      try {
        const object = this.objLoader.parse(text);
        resolve({ object, animations: [] });
      } catch (error) {
        reject(error);
      }
    });
  }

  async loadStl(file) {
    const buffer = await this.fileReaders.buffer(file);
    return new Promise((resolve, reject) => {
      try {
        const geometry = this.stlLoader.parse(buffer, { invert: true });
        const material = new THREE.MeshStandardMaterial({
          color: '#d0d0d0',
          roughness: 0.35,
          metalness: 0.05,
        });
        const mesh = new THREE.Mesh(geometry, material);
        resolve({ object: mesh, animations: [] });
      } catch (error) {
        reject(error);
      }
    });
  }

  async loadUsd(file) {
    const buffer = await this.fileReaders.buffer(file);
    if (typeof this.usdLoader.parse === 'function') {
      const object = await this.usdLoader.parse(buffer);
      return { object, animations: [] };
    }
    const blobUrl = URL.createObjectURL(new Blob([buffer]));
    try {
      const object = await this.usdLoader.loadAsync(blobUrl);
      return { object, animations: [] };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  clearModel() {
    this.normalsHelpers.forEach((helper) => this.modelRoot.remove(helper));
    this.normalsHelpers = [];
    this.clearBoneHelpers();
    this.clearWireframeOverlay();
    this.disposePendingObjectUrls();
    while (this.modelRoot.children.length) {
      const child = this.modelRoot.children[0];
      this.disposeNode(child);
      this.modelRoot.remove(child);
    }
    this.currentModel = null;
    // Clear occlusion check objects when model is removed
    if (this.lensFlare) {
      this.lensFlare.occlusionCheckObjects = null;
    }
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.animations = [];
    this.currentAction = null;
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
    if (this.lensFlare) {
      this.lensFlare.occlusionCheckObjects = [this.modelRoot];
    }
    
    this.prepareMesh(object);
    this.fitCameraToObject(object);
    const state = this.stateStore.getState();
    this.setScale(state.scale);
    this.setYOffset(state.yOffset);
    this.setRotationX(state.rotationX ?? 0);
    this.setRotationY(state.rotationY ?? 0);
    this.setRotationZ(state.rotationZ ?? 0);
    this.setShading(state.shading);
    this.toggleNormals(state.showNormals);
    this.refreshBoneHelpers();
    this.applyFresnelToModel(this.currentModel);
    // Apply current HDRI environment settings to the new model
    if (this.scene.environment) {
      const intensity = Math.max(0, this.hdriStrength);
      this.updateMaterialsEnvironment(this.scene.environment, intensity);
    }
    this.setupAnimations(animations);
    this.updateWireframeOverlay();
    this.ui.setDropzoneVisible(false);
    this.ui.revealShelf?.();
  }

  prepareMesh(object) {
    object.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (!this.originalMaterials.has(child)) {
          this.originalMaterials.set(child, child.material);
        }
      }
    });
  }

  fitCameraToObject(object) {
    const box = new THREE.Box3().setFromObject(object);
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      this.modelBounds = { box, size, center, radius: size.length() / 2 };
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

  setupAnimations(animations = []) {
    if (!animations.length) {
      this.ui.setAnimationClips([]);
      return;
    }
    this.animations = animations;
    this.mixer = new THREE.AnimationMixer(this.currentModel);
    this.currentClipIndex = 0;
    const formattedClips = animations.map((clip, index) => ({
      name: clip.name || `Clip ${index + 1}`,
      duration: formatTime(clip.duration),
      seconds: clip.duration,
    }));
    this.ui.setAnimationClips(formattedClips);
    this.playClip(0);
  }

  playClip(index) {
    if (!this.animations.length) return;
    const clip = this.animations[index];
    if (!clip) return;
    this.currentClipIndex = index;
    if (this.currentAction) {
      this.currentAction.stop();
    }
    this.currentAction = this.mixer.clipAction(clip);
    this.currentAction.play();
    this.ui.setAnimationPlaying(true);
    const fileName = this.currentFile?.name ?? 'model.glb';
    this.ui.updateTopBarDetail(`${fileName} — ${clip.name || 'Clip'} (${formatTime(clip.duration)})`);
  }

  toggleAnimation() {
    if (!this.currentAction) return;
    this.currentAction.paused = !this.currentAction.paused;
    this.ui.setAnimationPlaying(!this.currentAction.paused);
  }

  scrubAnimation(value) {
    if (!this.currentAction || !this.animations[this.currentClipIndex]) return;
    const clip = this.animations[this.currentClipIndex];
    this.currentAction.time = clip.duration * value;
    this.mixer.update(0);
    this.ui.updateAnimationTime(this.currentAction.time, clip.duration);
  }

  selectAnimation(index) {
    this.playClip(index);
  }

  updateStatsUI(file, object, gltfMetadata = null) {
    const stats = {
      triangles: 0,
      vertices: 0,
      materials: new Set(),
      textures: new Set(),
    };
    object.traverse((child) => {
      if (child.isMesh) {
        const geometry = child.geometry;
        if (!geometry) return;
        const position = geometry.attributes.position;
        if (geometry.index) {
          stats.triangles += geometry.index.count / 3;
        } else if (position) {
          stats.triangles += position.count / 3;
        }
        if (position) {
          stats.vertices += position.count;
        }
        const material = child.material;
        if (Array.isArray(material)) {
          material.forEach((mat) => mat && stats.materials.add(mat.uuid));
        } else if (material) {
          stats.materials.add(material.uuid);
        }
        const registerTexture = (map) => map && stats.textures.add(map.uuid);
        if (material) {
          registerTexture(material.map);
          registerTexture(material.normalMap);
          registerTexture(material.roughnessMap);
          registerTexture(material.metalnessMap);
          registerTexture(material.emissiveMap);
          registerTexture(material.alphaMap);
        }
      }
    });
    const fileSize =
      file?.size != null ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : '—';
    let boundsText = '—';
    if (this.modelBounds?.size) {
      const { size } = this.modelBounds;
      boundsText = `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`;
    }
    this.ui.updateStats({
      triangles: Math.round(stats.triangles),
      vertices: Math.round(stats.vertices),
      materials: stats.materials.size,
      textures: stats.textures.size,
      fileSize,
      bounds: boundsText,
      assetName: gltfMetadata?.assetName || file?.name?.replace(/\.[^/.]+$/, '') || '—',
      generator: gltfMetadata?.generator || '—',
      version: gltfMetadata?.version || '—',
      copyright: gltfMetadata?.copyright || '—',
    });
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
    if (!this.currentModel) return;
    this.currentShading = mode;
    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      const original = this.originalMaterials.get(child);
      if (!original) return;
      const disposeIfTransient = () => {
        const material = child.material;
        const sameReference =
          material === original ||
          (Array.isArray(material) &&
            Array.isArray(original) &&
            material.length === original.length &&
            material.every((mat, idx) => mat === original[idx]));
        if (sameReference) return;
        if (Array.isArray(material)) {
          material.forEach((mat) => mat?.dispose?.());
        } else {
          material?.dispose?.();
        }
      };
      const applyMaterial = (material) => {
        disposeIfTransient();
        child.material = material;
      };
      const buildArray = (factory) => {
        if (Array.isArray(original)) {
          return original.map((mat) => factory(mat));
        }
        return factory(original);
      };

      if (mode === 'wireframe') {
        const { color } = this.wireframeSettings;
        const createWire = (mat) => {
          const base = mat?.clone ? mat.clone() : new THREE.MeshStandardMaterial();
          base.wireframe = true;
          base.color = new THREE.Color(color);
          return base;
        };
        applyMaterial(buildArray(createWire));
      } else if (mode === 'clay') {
        const { color, roughness, specular } = this.claySettings;
        const createClay = (originalMat) => {
          const clay = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            roughness,
            metalness: specular,
            side: THREE.DoubleSide,
          });
          // Preserve normal map from original material only if enabled
          const normalMapEnabled = this.stateStore.getState().clay?.normalMap !== false;
          if (normalMapEnabled && originalMat?.normalMap) {
            clay.normalMap = originalMat.normalMap;
            clay.normalMapType = originalMat.normalMapType ?? THREE.TangentSpaceNormalMap;
            if (originalMat.normalScale) {
              clay.normalScale = originalMat.normalScale.clone();
            }
          }
          return clay;
        };
        applyMaterial(buildArray(createClay));
      } else if (mode === 'textures') {
        const createTextureMaterial = (mat) => {
          const standard = new THREE.MeshStandardMaterial({
            map: mat?.map ?? null,
            color: mat?.color ? mat.color.clone() : new THREE.Color('#ffffff'),
            roughness: mat?.roughness ?? 0.8,
            metalness: mat?.metalness ?? 0,
            normalMap: mat?.normalMap ?? null,
            aoMap: mat?.aoMap ?? null,
            emissive: mat?.emissive ? mat.emissive.clone() : new THREE.Color(0x000000),
            emissiveIntensity: mat?.emissiveIntensity ?? 1,
            transparent: mat?.transparent ?? false,
            opacity: mat?.opacity ?? 1,
            side: mat?.side ?? THREE.FrontSide,
          });
          if (mat?.aoMap) {
            standard.aoMapIntensity = mat.aoMapIntensity ?? 1;
          }
          standard.wireframe = false;
          return standard;
        };
        applyMaterial(buildArray(createTextureMaterial));
      } else {
        // Restore original materials when switching away from wireframe/clay/textures
        disposeIfTransient();
        child.material = original;
        // Ensure wireframe is off
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            if (mat) {
              mat.wireframe = false;
            }
          });
        } else if (child.material) {
          child.material.wireframe = false;
        }
      }
    });
    this.unlitMode = mode === 'textures';
    this.refreshBoneHelpers();
    // Apply current HDRI environment settings after shading change
    if (this.scene.environment) {
      const intensity = Math.max(0, this.hdriStrength);
      this.updateMaterialsEnvironment(this.scene.environment, intensity);
    }
    // Re-apply Fresnel after material updates (important: do this AFTER environment update)
    this.applyFresnelToModel(this.currentModel);
  }

  toggleNormals(enabled) {
    this.normalsHelpers.forEach((helper) => this.modelRoot.remove(helper));
    this.normalsHelpers = [];
    if (!enabled || !this.currentModel) return;
    this.currentModel.traverse((child) => {
      if (child.isMesh) {
        const helper = new VertexNormalsHelper(child, NORMALS_HELPER_SIZE, NORMALS_HELPER_COLOR);
        this.modelRoot.add(helper);
        this.normalsHelpers.push(helper);
      }
    });
  }

  clearBoneHelpers() {
    this.boneHelpers.forEach((helper) => {
      this.scene.remove(helper);
      helper.dispose?.();
    });
    this.boneHelpers = [];
  }

  refreshBoneHelpers() {
    this.clearBoneHelpers();
    if (!this.currentModel || this.currentShading !== 'wireframe') {
      return;
    }
    let found = false;
    this.currentModel.traverse((child) => {
      if (child.isSkinnedMesh && child.skeleton) {
        const helper = new THREE.SkeletonHelper(child);
        helper.material.depthTest = false;
        helper.material.color.set('#66ccff');
        this.scene.add(helper);
        this.boneHelpers.push(helper);
        found = true;
      }
    });
    if (!found) {
      const now = performance.now();
      if (now - this.lastBoneToastTime > 2000) {
        this.ui.showToast('No bones/skeleton detected in this mesh');
        this.lastBoneToastTime = now;
      }
    }
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
    if (this.mixer && this.currentAction) {
      this.mixer.update(delta);
      const clip = this.animations[this.currentClipIndex];
      if (clip) {
        this.ui.updateAnimationTime(this.currentAction.time, clip.duration);
      }
    }
    if (this.autoRotateSpeed && this.currentModel) {
      this.modelRoot.rotation.y += delta * this.autoRotateSpeed;
    }
    if (this.lightsAutoRotate) {
      const deltaDegrees = this.lightsAutoRotateSpeed * delta;
      this.setLightsRotation(this.lightsRotation + deltaDegrees);
    }
    this.controls.update();
    this.boneHelpers.forEach((helper) => helper.update?.());
    this.grainTintPass.uniforms.time.value += delta * 60;
    this.updateWireframeOverlayTransforms();
    this.render();
  }

  render() {
    // Continuously protect clay settings during render to prevent any resets
    // This runs every frame to ensure values NEVER go to 0
    if (this.currentShading === 'clay' && this.claySettings && this.currentModel) {
      const targetRoughness = this.claySettings.roughness ?? 0.6;
      const targetMetalness = this.claySettings.specular ?? 0.08;
      
      this.currentModel.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const isClayMaterial = !this.originalMaterials.has(child);
        
        if (isClayMaterial) {
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];
          
          materials.forEach((material) => {
            if (!material || !material.isMeshStandardMaterial) return;
            
            // Continuously check and restore - if values are 0 or wrong, fix immediately
            if (material.roughness !== undefined && 
                (material.roughness === 0 || Math.abs(material.roughness - targetRoughness) > 0.001)) {
              material.roughness = targetRoughness;
            }
            if (material.metalness !== undefined && 
                (material.metalness === 0 || Math.abs(material.metalness - targetMetalness) > 0.001)) {
              material.metalness = targetMetalness;
            }
          });
        }
      });
    }
    
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

