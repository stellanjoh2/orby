import './main.js';
import * as THREE from 'three';
import { DEFAULT_MATERIAL_BRIGHTNESS, ORBY_LIME } from './constants.js';
import { DEFAULT_GOBO_SOFTNESS } from './config/gobos.js';
import { DEFAULT_LIGHTS_SHADOW_SOFTNESS } from './config/shadowQuality.js';

/** Default fit is ~radius × 1.87; 404 hero sits closer but not tight on the mesh. */
const NOT_FOUND_CAMERA_DISTANCE_FACTOR = 0.62;
const NOT_FOUND_CAMERA_DISTANCE_MIN = 0.35;
const NOT_FOUND_VIEW_DIRECTION = new THREE.Vector3(1.5, 0.7, 1.5).normalize();

const NOT_FOUND_PRESET = {
  shading: 'shaded',
  material: {
    brightness: DEFAULT_MATERIAL_BRIGHTNESS,
    metalness: 0.04,
    roughness: 0.32,
    emissive: 0.34,
  },
  scale: 2.75,
  xOffset: 0,
  yOffset: 0,
  zOffset: 0,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  autoRotate: 0.2,
  clay: {
    color: '#808080',
    normalMap: true,
  },
  wireframe: {
    alwaysOn: false,
    color: ORBY_LIME,
    onlyVisibleFaces: true,
    hideMesh: false,
  },
  fresnel: {
    enabled: false,
    color: '#808080',
    radius: 2,
    strength: 0.3,
  },
  subsurface: {
    enabled: false,
    translucency: 0,
    scatterTint: '#ffd4b8',
  },
  svgExtrude: {
    enabled: true,
    availableColors: ['#c6d400'],
    depth: 0.2,
    normalAngle: 30,
    colorDepths: {},
    colorOffsets: {},
    flipDirection: false,
    colorOverride: false,
    overrideColor: '#7ed321',
    surfacePreset: 'none',
    surfaceScale: 1,
    surfaceStrength: 1,
  },
  advanced: {
    reverseNormals: false,
    transparencyFix: 'default',
    glassOpacity: 0.45,
    glassReflection: 2,
    glassTint: '#ffffff',
    glassBody: 0,
    blendSortingMitigation: true,
    flipGlassNormalMapY: false,
    glassFrontFacesOnly: false,
  },
  hdri: 'congress',
  hdriEnabled: false,
  hdriStrength: 1.6,
  hdriBlurriness: 0.55,
  hdriRotation: 0,
  hdriBackground: false,
  lensFlare: {
    enabled: false,
    rotation: 0,
    height: 15,
    color: '#d28756',
    quality: 'ultra',
    anamorphicBloom: {
      enabled: false,
      quality: 'medium',
      strength: 1,
      spread: 0.2,
      streakAngle: 0,
      threshold: 0.7,
      soften: 0.12,
      streakTint: '#7ec8ff',
    },
  },
  groundSolid: false,
  groundWire: false,
  groundSolidColor: '#808080',
  baseColor: '#e8e8e8',
  groundWireColor: ORBY_LIME,
  groundWireOpacity: 1,
  groundY: -0.28860217332839966,
  gridY: -0.28860217332839966,
  baseScale: 1,
  baseMetalness: 0.08,
  baseRoughness: 0.5,
  baseReflection: 1,
  baseClearcoat: 0,
  baseGlassSurface: false,
  baseGlassBlur: 0.1,
  baseGlassAmount: 0.5,
  baseGlassBrightness: 0.1,
  backdropEnabled: false,
  backdropScale: 1,
  backdropWidth: 2,
  backdropColor: '#808080',
  backdropRotation: 0,
  backdropY: 0,
  backdropTextureEnabled: false,
  backdropTextureScale: 1.8,
  gridScale: 1,
  lights: {
    key: {
      color: '#ffdfc9',
      intensity: 1.28,
      height: 5,
      rotate: 0,
      enabled: false,
      castShadows: false,
    },
    fill: {
      color: '#b0c7ff',
      intensity: 0.8,
      height: 3,
      rotate: 0,
      enabled: false,
      castShadows: false,
    },
    rim: {
      color: '#a0eaf9',
      intensity: 0.96,
      height: 4,
      rotate: 0,
      enabled: false,
      castShadows: false,
    },
    ambient: {
      color: '#7c8ca6',
      intensity: 0.48,
      enabled: false,
    },
  },
  lightsEnabled: false,
  lightsMaster: 0.3,
  lightsRotation: 0,
  lightsHeight: 5,
  lightsAutoRotate: false,
  showLightIndicators: false,
  lightsCastShadows: false,
  lightsShadowQuality: 'medium',
  lightsShadowSoftness: DEFAULT_LIGHTS_SHADOW_SOFTNESS,
  lightsShadowColor: '#080808',
  lightsShadowOpacity: 0.25,
  lightsShadowContactOffset: -0.0001,
  lightsShadowTwoSided: false,
  gobo: {
    enabled: false,
    panelOpen: false,
    texture: 'palm',
    softness: DEFAULT_GOBO_SOFTNESS,
    scale: 1,
    rotation: 0,
  },
  background: '#080808',
  camera: {
    fov: 45,
    tilt: -15,
    position: {
      x: 0.3617021953002032,
      y: 0.2305411801700339,
      z: 0.195141930055061,
    },
    target: {
      x: -0.04892023526093361,
      y: 0.00401737816845487,
      z: -0.0678428721570484,
    },
    contrast: 1,
    temperature: 6000,
    tint: 0,
    highlights: 0,
    shadows: 0,
    saturation: 1.72,
    clarity: 0,
    fade: 0,
    sharpness: 0,
    vignetteEnabled: true,
    vignette: 0.69,
    vignetteColor: '#080808',
    autoOrbit: 'slow',
    handheld: 'off',
    compositionGridEnabled: false,
    compositionGuidesInverted: false,
    cinematicLetterbox219: false,
  },
  exposure: 1,
  autoExposure: false,
  histogramEnabled: false,
  toneCurveOpen: false,
  toneCurve: {
    blackY: 0,
    whiteY: 1,
    p1: {
      x: 0.3333333333333333,
      y: 0.3333333333333333,
    },
    p2: {
      x: 0.6666666666666666,
      y: 0.6666666666666666,
    },
  },
  dof: {
    enabled: false,
    focus: 1.5,
    aperture: 0.003,
    quality: 'high',
  },
  bloom: {
    enabled: true,
    threshold: 1.0,
    strength: 0.2,
    radius: 0.2,
    color: '#f0f4f8',
    quality: 'medium',
  },
  grain: {
    enabled: false,
    intensity: 0.03,
    color: '#ffffff',
  },
  aberration: {
    enabled: true,
    amount: 0.0049,
  },
  ambientOcclusion: {
    enabled: true,
    intensity: 1.25,
    radius: 0.3,
    quality: 'medium',
    color: '#213f08',
  },
  lensDirt: {
    enabled: false,
    strength: 0.8,
    minLuminance: 0.55,
    maxLuminance: 0.95,
    sensitivity: 0.55,
    tintColor: '#ffffff',
  },
  fisheye: {
    enabled: false,
    horizontalFOVDeg: 131,
    strength: 0.37,
    cylindricalRatio: 4,
  },
  colorChecker: {
    enabled: false,
    distance: 2,
    rotate: 333,
    height: -0.5,
    scale: 0.055,
    rawColors: false,
  },
  antiAliasing: 'fxaa',
  renderQuality: 'medium',
  toneMapping: 'aces-filmic',
  lookFilterPreset: 'custom',
  lookFilterPresetsOpen: false,
  creativeLookSectionOpen: false,
  moveWidgetEnabled: false,
  rotateWidgetEnabled: false,
  scaleWidgetEnabled: false,
};

const NOT_FOUND_MESH_URL = '/assets/3D-assets/404.glb';
const NOT_FOUND_MESH_NAME = '404.glb';
const NOT_FOUND_MESSAGE_HTML = `
  <img
    src="/assets/images/favicon.svg"
    alt=""
    aria-hidden="true"
    class="orby-not-found-symbol"
  />
  <br />
  <span class="orby-not-found-emphasis">Nothing to see here.</span> You've drifted beyond the scene bounds.
`;

function waitForOrby() {
  return new Promise((resolve) => {
    const maxWaitMs = 7000;
    const start = performance.now();
    const poll = () => {
      if (window.orby?.eventBus && window.orby?.stateStore && window.orby?.ui && window.orby?.scene) {
        resolve(window.orby);
        return;
      }
      if (performance.now() - start >= maxWaitMs) {
        resolve(window.orby ?? null);
        return;
      }
      requestAnimationFrame(poll);
    };
    poll();
  });
}

function applyNotFoundUiState() {
  document.body.classList.add('orby-not-found-active');
  document.body.classList.remove('orby-not-found-fade-ready');
  // Trigger a route-local fade from black into the 404 scene/UI.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.add('orby-not-found-fade-ready');
    });
  });
  const legacyOverlay = document.getElementById('orbyNotFoundPage');
  if (legacyOverlay) {
    legacyOverlay.hidden = true;
    legacyOverlay.setAttribute('aria-hidden', 'true');
  }
}

function openFullscreenNotFoundPrompt(orby) {
  if (typeof orby.ui?.showFullscreenPrompt !== 'function') return;
  orby.ui.showFullscreenPrompt({
    messageHtml: NOT_FOUND_MESSAGE_HTML,
    cancelLabel: 'Stay',
    confirmLabel: 'Return home',
    confirmVariant: 'accent',
    onConfirm: () => {
      window.location.href = '/';
    },
    onCancel: () => {},
  });
}

function preventBackdropDismissFor404(orby) {
  const layer = orby.ui?.dom?.fullscreenPrompt;
  if (!layer || layer.__orby404BackdropGuard) return;
  layer.__orby404BackdropGuard = true;
  layer.addEventListener(
    'click',
    (event) => {
      if (event.target !== layer) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    },
    true,
  );
}

async function fetchNotFoundMesh() {
  const absoluteUrl = new URL(NOT_FOUND_MESH_URL, window.location.origin).toString();
  const response = await fetch(absoluteUrl);
  if (!response.ok) {
    throw new Error(`Failed to load 404 mesh (${response.status}) from ${absoluteUrl}`);
  }
  const blob = await response.blob();
  return new File([blob], NOT_FOUND_MESH_NAME, { type: 'model/gltf-binary' });
}

function enforceBlackBackground(orby) {
  if (typeof orby.stateStore?.set === 'function') {
    orby.stateStore.set('background', '#080808');
    orby.stateStore.set('hdriBackground', false);
    orby.stateStore.set('hdriEnabled', false);
  }
  if (typeof orby.scene?.setHdriEnabled === 'function') {
    orby.scene.setHdriEnabled(false);
  }
  if (typeof orby.scene?.setHdriBackground === 'function') {
    orby.scene.setHdriBackground(false);
  }
  orby.scene?.backgroundController?.setColor?.('#080808');
  // Hard clamp renderer output to opaque black (avoids gray startup frames).
  const renderer = orby.scene?.renderer;
  if (renderer?.setClearColor) {
    renderer.setClearColor('#080808', 1);
  }
  if (renderer?.setClearAlpha) {
    renderer.setClearAlpha(1);
  }
}

function enforceBlackBackgroundHard(orby) {
  enforceBlackBackground(orby);
  // Some post FX/controllers re-apply state on initial frames; pin black briefly.
  window.setTimeout(() => enforceBlackBackground(orby), 120);
  window.setTimeout(() => enforceBlackBackground(orby), 400);
  window.setTimeout(() => enforceBlackBackground(orby), 900);
}

function pushCameraCloserFor404(orby) {
  const camera = orby.scene?.camera;
  const controls = orby.scene?.controls;
  const cameraController = orby.scene?.cameraController;
  if (!camera || !controls) return;

  const bounds = cameraController?.modelBounds;
  if (bounds?.center && bounds.radius > 0) {
    const target = bounds.center.clone();
    if (bounds.size) {
      target.y -= bounds.size.y * 0.05;
    }
    const distance = Math.max(
      bounds.radius * NOT_FOUND_CAMERA_DISTANCE_FACTOR,
      NOT_FOUND_CAMERA_DISTANCE_MIN,
    );
    const direction = NOT_FOUND_VIEW_DIRECTION.clone();
    controls.target.copy(target);
    camera.position.copy(target.clone().add(direction.multiplyScalar(distance)));
    camera.near = Math.max(0.01, distance / 200);
    camera.far = Math.max(distance * 50, 50);
    camera.updateProjectionMatrix();
    controls.update();
  } else {
    const target = controls.target.clone();
    const offset = camera.position.clone().sub(target);
    if (offset.lengthSq() < 1e-10) return;
    offset.multiplyScalar(0.12);
    camera.position.copy(target.clone().add(offset));
    controls.update();
  }

  if (typeof cameraController?.setAutoOrbit === 'function') {
    cameraController.setAutoOrbit('slow');
  }
}

function configureNoPopSpawnFor404(orby) {
  const scene = orby.scene;
  const cameraController = scene?.cameraController;
  if (!scene || !cameraController) return;
  if (scene.__orby404NoPopConfigured) return;
  scene.__orby404NoPopConfigured = true;

  // Stop tiny->full spawn pop; show model at final authored scale immediately.
  scene._scaleInMeshOnSpawn = (object) => {
    if (!object) return;
    object.visible = true;
  };

  // Keep regular "asset loaded" flow, but avoid 1s animated camera jump/glitch.
  cameraController.focusOnObjectAnimated = (object) => {
    if (!object) return;
    if (typeof cameraController.fitCameraToObject === 'function') {
      cameraController.fitCameraToObject(object);
    }
    pushCameraCloserFor404(orby);
  };
}

async function setupNotFoundExperience() {
  applyNotFoundUiState();

  const orby = await waitForOrby();
  if (!orby) return;

  if (typeof orby.ui.toggleUi === 'function') {
    orby.ui.toggleUi(true);
  }
  if (typeof orby.ui.setDropzoneVisible === 'function') {
    orby.ui.setDropzoneVisible(false);
  }
  openFullscreenNotFoundPrompt(orby);
  preventBackdropDismissFor404(orby);
  configureNoPopSpawnFor404(orby);

  orby.stateStore.setTopLevelBundle(NOT_FOUND_PRESET);
  orby.eventBus.emit('app:reset');
  enforceBlackBackgroundHard(orby);

  const onLoaded = ({ success }) => {
    if (!success) return;
    enforceBlackBackgroundHard(orby);
    pushCameraCloserFor404(orby);
    window.setTimeout(() => pushCameraCloserFor404(orby), 120);
    window.setTimeout(() => pushCameraCloserFor404(orby), 450);
    orby.eventBus.off('scene:model-load-complete', onLoaded);
  };
  orby.eventBus.on('scene:model-load-complete', onLoaded);

  try {
    const file = await fetchNotFoundMesh();
    if (typeof orby.scene?.loadFile === 'function') {
      await orby.scene.loadFile(file, {
        silent: true,
        suppressSuccessToastSound: true,
      });
    } else {
      orby.eventBus.emit('file:selected', {
        file,
        suppressSuccessToastSound: true,
      });
    }
  } catch (error) {
    console.error('Failed to load 404 mesh', error);
  }
}

void setupNotFoundExperience();
