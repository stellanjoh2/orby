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
import { VertexNormalsHelper } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/helpers/VertexNormalsHelper.js';

const HDRI_PRESETS = {
  'noir-studio': './assets/hdris/noir-studio.hdr',
  'luminous-sky': './assets/hdris/luminous-sky.hdr',
  'sunset-cove': './assets/hdris/sunset-cove.hdr',
  'steel-lab': './assets/hdris/steel-lab.hdr',
  cyberpunk: './assets/hdris/ghost-luxe.hdr',
};

const HDRI_MOODS = {
  cyberpunk: {
    bloomTint: '#ff4df9',
    bloomStrengthMin: 0.7,
    bloomRadiusMin: 0.8,
    grainTint: '#00e8ff',
    podiumColor: '#1f233f',
    background: '#050014',
  },
};

const BloomTintShader = {
  uniforms: {
    tDiffuse: { value: null },
    tint: { value: new THREE.Color('#ffe9cc') },
    strength: { value: 0.25 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform vec3 tint;
    uniform float strength;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      float luminance = dot(base.rgb, vec3(0.299, 0.587, 0.114));
      float mask = smoothstep(0.6, 1.2, luminance);
      vec3 colorized = base.rgb + tint * mask * strength;
      gl_FragColor = vec4(colorized, base.a);
    }
  `,
};

const GrainTintShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    intensity: { value: 0.2 },
    tint: { value: new THREE.Color('#ffffff') },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float intensity;
    uniform vec3 tint;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      float noise = rand(vUv * time) * 2.0 - 1.0;
      vec3 grain = tint * noise * intensity;
      gl_FragColor = vec4(base.rgb + grain, base.a);
    }
  `,
};

const AberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 0.003 },
    strength: { value: 0.4 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float strength;

    void main() {
      vec2 center = vec2(0.5);
      vec2 dir = normalize(vUv - center);
      vec2 shift = dir * offset * strength;
      float r = texture2D(tDiffuse, vUv + shift).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - shift).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};

const ExposureShader = {
  uniforms: {
    tDiffuse: { value: null },
    exposure: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float exposure;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      color.rgb *= exposure;
      gl_FragColor = color;
    }
  `,
};

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(1, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${mins}:${secs}`;
};

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
    this.groundWireColor = initialState.groundWireColor ?? '#c4cadd';
    this.groundWireOpacity = initialState.groundWireOpacity ?? 0.45;
    this.currentExposure = initialState.exposure ?? 1;
    this.hdriStrength = Math.min(
      3,
      Math.max(0, initialState.hdriStrength ?? 1),
    );
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.clearColor = new THREE.Color('#000000');
    this.clearAlpha = 1;
    this.renderer.setClearColor(new THREE.Color(this.backgroundColor), 1);
    this.renderer.toneMappingExposure = 1;

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = true;

    this.camera.position.set(0, 1.5, 6);
    this.controls.target.set(0, 1, 0);
    this.controls.update();

    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);
    this.scene.environmentIntensity = this.hdriStrength;

    this.normalsHelpers = [];
    this.autoRotateSpeed = 0;
    this.currentFile = null;
    this.currentModel = null;
    this.mixer = null;
    this.currentAction = null;
    this.currentClipIndex = 0;
    this.animations = [];
    this.unlitMode = false;

    this.hdriCache = new Map();
    this.hdriEnabled = initialState.hdriEnabled ?? true;
    this.hdriBackgroundEnabled = initialState.hdriBackground;
    this.currentEnvironment = null;
    this.currentEnvironmentTexture = null;
    this.claySettings = { ...(initialState.clay || {}) };
    this.fresnelSettings = { ...(initialState.fresnel || {}) };

    this.originalMaterials = new WeakMap();

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

    this.setupLoaders();
    this.setupLights();
    this.setupGround();
    this.setupComposer();
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
    const baseRadius = 2;
    const height = 0.15;
    const topRadius = baseRadius - 0.08;
    const segments = 96;

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
      roughness: 0.85,
      metalness: 0.08,
    });

    this.podium = new THREE.Mesh(podiumGeo, solidMat);
    this.podium.receiveShadow = true;
    this.scene.add(this.podium);

    const shadowMat = new THREE.ShadowMaterial({
      opacity: 0.4,
    });
    this.podiumShadow = new THREE.Mesh(
      new THREE.CircleGeometry(baseRadius * 1.05, segments),
      shadowMat,
    );
    this.podiumShadow.rotation.x = -Math.PI / 2;
    this.podiumShadow.position.y = -height;
    this.podiumShadow.receiveShadow = true;
    this.scene.add(this.podiumShadow);
    this.grid = new THREE.GridHelper(
      baseRadius * 2,
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
    this.scene.add(this.grid);
    const groundState = this.stateStore.getState();
    this.setGroundSolid(groundState.groundSolid);
    this.setGroundWire(groundState.groundWire);
    this.setGroundWireOpacity(groundState.groundWireOpacity ?? this.groundWireOpacity);
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
    this.filmPass = new FilmPass(0.2, 0.025, 648, false);
    this.bloomTintPass = new ShaderPass(BloomTintShader);
    this.grainTintPass = new ShaderPass(GrainTintShader);
    this.aberrationPass = new ShaderPass(AberrationShader);
    this.exposurePass = new ShaderPass(ExposureShader);
    this.exposurePass.uniforms.exposure.value = this.currentExposure;
    this.aberrationPass.renderToScreen = false;
    this.exposurePass.renderToScreen = true;

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bokehPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.bloomTintPass);
    this.composer.addPass(this.filmPass);
    this.composer.addPass(this.grainTintPass);
    this.composer.addPass(this.aberrationPass);
    this.composer.addPass(this.exposurePass);
  }

  registerEvents() {
    this.eventBus.on('mesh:scale', (value) => this.setScale(value));
    this.eventBus.on('mesh:yOffset', (value) => this.setYOffset(value));
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
    this.eventBus.on('mesh:reset-transform', () => {
      this.modelRoot.rotation.y = 0;
    });

    this.eventBus.on('camera:preset', (preset) => this.applyCameraPreset(preset));
    this.eventBus.on('camera:fov', (value) => {
      this.camera.fov = value;
      this.camera.updateProjectionMatrix();
    });

    this.eventBus.on('studio:hdri', (preset) => this.setHdriPreset(preset));
    this.eventBus.on('studio:hdri-enabled', (enabled) =>
      this.setHdriEnabled(enabled),
    );
    this.eventBus.on('studio:hdri-strength', (value) =>
      this.setHdriStrength(value),
    );
    this.eventBus.on('studio:hdri-background', (enabled) =>
      this.setHdriBackground(enabled),
    );
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

    this.eventBus.on('lights:update', ({ lightId, property, value }) => {
      const light = this.lights[lightId];
      if (!light) return;
      if (property === 'color') {
        light.color = new THREE.Color(value);
      } else if (property === 'intensity') {
        const multiplier = light.isAmbientLight ? 4 : 2;
        light.intensity = value * multiplier;
      }
    });

    this.eventBus.on('render:dof', (settings) => this.updateDof(settings));
    this.eventBus.on('render:bloom', (settings) => this.updateBloom(settings));
    this.eventBus.on('render:grain', (settings) => this.updateGrain(settings));
    this.eventBus.on('render:aberration', (settings) =>
      this.updateAberration(settings),
    );
    this.eventBus.on('render:fresnel', (settings) =>
      this.setFresnelSettings(settings),
    );

    this.eventBus.on('scene:fog', (fog) => this.updateFog(fog));
    this.eventBus.on('scene:background', (color) =>
      this.updateBackgroundColor(color),
    );
    this.eventBus.on('scene:exposure', (value) => {
      this.currentExposure = value;
      if (this.exposurePass) {
        this.exposurePass.uniforms.exposure.value = value;
      }
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
    this.setShading(state.shading);
    this.toggleNormals(state.showNormals);
    this.autoRotateSpeed = state.autoRotate;
    this.setGroundSolid(state.groundSolid);
    this.setGroundWire(state.groundWire);
    this.setGroundSolidColor(state.groundSolidColor);
    this.setGroundWireColor(state.groundWireColor);
    this.setGroundWireOpacity(state.groundWireOpacity);
    this.currentExposure = state.exposure;
    if (this.exposurePass) {
      this.exposurePass.uniforms.exposure.value = state.exposure;
    }
    this.camera.fov = state.camera.fov;
    this.camera.updateProjectionMatrix();
    Object.entries(state.lights).forEach(([id, config]) => {
      const light = this.lights[id];
      if (!light) return;
      light.color = new THREE.Color(config.color);
      const multiplier = light.isAmbientLight ? 4 : 2;
      light.intensity = config.intensity * multiplier;
    });
    this.claySettings = { ...(state.clay || this.claySettings) };
    this.fresnelSettings = { ...(state.fresnel || this.fresnelSettings) };
    this.updateDof(state.dof);
    this.updateBloom(state.bloom);
    this.updateGrain(state.grain);
    this.updateAberration(state.aberration);
    this.updateFog(state.fog);
    this.updateBackgroundColor(state.background);
    this.setHdriStrength(state.hdriStrength ?? 1);
    this.setHdriEnabled(state.hdriEnabled);
    this.setHdriBackground(state.hdriBackground);
    await this.setHdriPreset(state.hdri);
  }

  async setHdriPreset(preset) {
    if (!preset || !HDRI_PRESETS[preset]) return;
    if (this.currentHdri === preset) {
      this.applyEnvironment(this.hdriCache.get(preset));
      return;
    }
    try {
      if (this.hdriCache.has(preset)) {
      this.applyEnvironment(this.hdriCache.get(preset));
      this.currentHdri = preset;
      this.applyHdriMood(preset);
        return;
      }
      const texture = await this.hdriLoader.loadAsync(HDRI_PRESETS[preset]);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      this.hdriCache.set(preset, texture);
      this.applyEnvironment(texture);
      this.currentHdri = preset;
      this.applyHdriMood(preset);
    } catch (error) {
      console.error('Failed to load HDRI', error);
      this.ui.showToast('Failed to load HDRI');
    }
  }

  applyEnvironment(texture) {
    this.currentEnvironmentTexture = texture || null;
    const hdriActive = this.hdriEnabled && this.currentEnvironmentTexture;
    this.scene.environment = hdriActive ? this.currentEnvironmentTexture : null;
    this.scene.environmentIntensity = hdriActive ? this.hdriStrength : 0;
    const backgroundIsHdri = hdriActive && this.hdriBackgroundEnabled;
    if (backgroundIsHdri) {
      this.scene.background = this.currentEnvironmentTexture;
      this.renderer.setClearColor(this.clearColor, 1);
    } else {
      this.scene.background = null;
      this.renderer.setClearColor(new THREE.Color(this.backgroundColor), 1);
    }
  }

  setHdriBackground(enabled) {
    this.hdriBackgroundEnabled = enabled;
    this.applyEnvironment(this.currentEnvironmentTexture);
    this.applyHdriMood(this.currentHdri);
  }

  setHdriEnabled(enabled) {
    this.hdriEnabled = enabled;
    this.applyEnvironment(this.currentEnvironmentTexture);
    this.applyHdriMood(this.currentHdri);
  }

  setHdriStrength(value) {
    this.hdriStrength = Math.min(3, Math.max(0, value));
    this.applyEnvironment(this.currentEnvironmentTexture);
  }

  setClaySettings(patch) {
    this.claySettings = { ...this.claySettings, ...patch };
    if (this.stateStore.getState().shading === 'clay') {
      this.setShading('clay');
    }
  }

  setClaySettings(patch) {
    this.claySettings = { ...this.claySettings, ...patch };
    if (this.stateStore.getState().shading === 'clay') {
      this.setShading('clay');
    }
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
      };
      bloomState.strength = Math.max(
        style.bloomStrengthMin ?? 0,
        bloomState.strength,
      );
      bloomState.radius = Math.max(
        style.bloomRadiusMin ?? 0,
        bloomState.radius,
      );
      this.updateBloom(bloomState);
    }
    if (this.grainTintPass) {
      const grainState = {
        ...state.grain,
        color: style.grainTint ?? state.grain.color,
      };
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

    if (material.userData.fresnelPatched) {
      const uniforms = material.userData.fresnelUniforms;
      uniforms.color.value.set(settings.color);
      uniforms.strength.value = settings.strength;
      uniforms.power.value = Math.max(0.1, settings.radius);
      return;
    }

    const original = material.onBeforeCompile;
    material.userData.originalOnBeforeCompile = original;
    material.onBeforeCompile = (shader) => {
      original?.(shader);
      const uniforms = {
        color: { value: new THREE.Color(settings.color) },
        strength: { value: settings.strength },
        power: {
          value: Math.max(0.1, settings.radius),
        },
      };
      shader.uniforms.fresnelColor = uniforms.color;
      shader.uniforms.fresnelStrength = uniforms.strength;
      shader.uniforms.fresnelPower = uniforms.power;
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
      material.userData.fresnelUniforms = uniforms;
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
    const active = wants && settings.intensity > 0.0001;
    if (this.filmPass) {
      this.filmPass.enabled = active;
    }
    if (this.grainTintPass) {
      this.grainTintPass.enabled = active;
    }
    if (!active) return;
    if (this.filmPass?.uniforms?.nIntensity) {
      this.filmPass.uniforms.nIntensity.value = settings.intensity * 0.5;
    }
    if (this.grainTintPass?.uniforms?.intensity) {
      this.grainTintPass.uniforms.intensity.value = settings.intensity;
    }
    if (this.grainTintPass?.uniforms?.tint) {
      this.grainTintPass.uniforms.tint.value = new THREE.Color(
        settings.color,
      );
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

  updateFog(fog) {
    if (!fog) {
      this.scene.fog = null;
      return;
    }
    if (fog.type === 'none') {
      this.scene.fog = null;
      return;
    }
    const color = new THREE.Color(fog.color);
    if (fog.type === 'linear') {
      this.scene.fog = new THREE.Fog(color, fog.near, fog.near + 200);
    } else if (fog.type === 'exp') {
      this.scene.fog = new THREE.FogExp2(color, fog.density);
    } else if (fog.type === 'exp2') {
      this.scene.fog = new THREE.FogExp2(color, fog.density);
    }
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
      this.updateStatsUI(file, asset.object);
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
        (gltf) => resolve({ object: gltf.scene, animations: gltf.animations }),
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
        this.setModel(gltf.scene, gltf.animations ?? []);
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
    this.disposePendingObjectUrls();
    while (this.modelRoot.children.length) {
      const child = this.modelRoot.children[0];
      this.disposeNode(child);
      this.modelRoot.remove(child);
    }
    this.currentModel = null;
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
    this.prepareMesh(object);
    this.fitCameraToObject(object);
    this.setScale(this.stateStore.getState().scale);
    this.setYOffset(this.stateStore.getState().yOffset);
    this.setShading(this.stateStore.getState().shading);
    this.toggleNormals(this.stateStore.getState().showNormals);
    this.applyFresnelToModel(this.currentModel);
    this.setupAnimations(animations);
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

  updateStatsUI(file, object) {
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

  setShading(mode) {
    if (!this.currentModel) return;
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
        const createWire = (mat) => {
          const base = mat?.clone ? mat.clone() : new THREE.MeshStandardMaterial();
          base.wireframe = true;
          base.color = new THREE.Color('#9fb7ff');
          return base;
        };
        applyMaterial(buildArray(createWire));
      } else if (mode === 'clay') {
        const { color, roughness, specular } = this.claySettings;
        const createClay = () =>
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            roughness,
            metalness: specular,
            side: THREE.DoubleSide,
          });
        applyMaterial(buildArray(createClay));
      } else if (mode === 'textures') {
        const createTextureMaterial = (mat) => {
          const basic = new THREE.MeshBasicMaterial({
            map: mat?.map ?? null,
            color: mat?.color ? mat.color.clone() : new THREE.Color('#ffffff'),
            side: mat?.side ?? THREE.FrontSide,
            transparent: mat?.transparent ?? false,
            opacity: mat?.opacity ?? 1,
          });
          basic.wireframe = false;
          return basic;
        };
        applyMaterial(buildArray(createTextureMaterial));
      } else {
        disposeIfTransient();
        child.material = original;
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            if (mat) mat.wireframe = false;
          });
        } else if (child.material) {
          child.material.wireframe = false;
        }
      }
    });
    this.unlitMode = mode === 'textures';
    this.applyFresnelToModel(this.currentModel);
  }

  toggleNormals(enabled) {
    this.normalsHelpers.forEach((helper) => this.modelRoot.remove(helper));
    this.normalsHelpers = [];
    if (!enabled || !this.currentModel) return;
    this.currentModel.traverse((child) => {
      if (child.isMesh) {
        const helper = new VertexNormalsHelper(child, 0.08, '#4db3ff');
        this.modelRoot.add(helper);
        this.normalsHelpers.push(helper);
      }
    });
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
    this.controls.update();
    this.grainTintPass.uniforms.time.value += delta * 60;
    this.render();
  }

  render() {
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
    const name = this.currentFile?.name ?? 'meshgl';
    link.href = dataUrl;
    link.download = `${name.replace(/\.[a-z0-9]+$/i, '')}-meshgl.png`;
    link.click();

    this.renderer.setPixelRatio(originalPixelRatio);
    this.renderer.setSize(originalSize.x, originalSize.y, false);
    this.composer.setSize(originalSize.x, originalSize.y);
  }
}

