/**
 * Offscreen Three.js thumbnails for the shape library grid.
 * One shared WebGLRenderer while the queue runs; released after idle so we
 * do not keep a second GL context competing with the main viewport.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/loaders/GLTFLoader.js';
import { applyShapeLibraryPresentationTilt } from './shapeLibraryCatalog.js';

const loader = new GLTFLoader();
/** @type {Map<string, Promise<string>>} */
const cache = new Map();

/** @type {THREE.WebGLRenderer | null} */
let sharedRenderer = null;
/** @type {THREE.Scene | null} */
let sharedScene = null;
/** @type {THREE.PerspectiveCamera | null} */
let sharedCamera = null;
/** @type {THREE.Group | null} */
let sharedModelMount = null;
/** @type {number} */
let sharedRendererSizePx = 0;
/** @type {Promise<void>} */
let renderQueue = Promise.resolve();

function disposeThumbStudio() {
  sharedModelMount?.clear();
  sharedRenderer?.dispose();
  sharedRenderer = null;
  sharedScene = null;
  sharedCamera = null;
  sharedModelMount = null;
  sharedRendererSizePx = 0;
}

/** Release the offscreen GL context once the serial thumb queue has drained. */
function scheduleDisposeThumbStudioWhenIdle() {
  const tail = renderQueue;
  tail.finally(() => {
    if (renderQueue !== tail) return;
    disposeThumbStudio();
  });
}

function ensureThumbStudio(sizePx) {
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    sharedRenderer.setPixelRatio(1);
    sharedRenderer.setClearColor(0x000000, 0);
    sharedRenderer.outputColorSpace = THREE.SRGBColorSpace;
    sharedRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    sharedRenderer.toneMappingExposure = 1.05;

    sharedScene = new THREE.Scene();

    sharedCamera = new THREE.PerspectiveCamera(34, 1, 0.05, 40);
    sharedCamera.position.set(1.35, 1.05, 1.65);
    sharedCamera.lookAt(0, 0, 0);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(2.5, 3.5, 2);
    sharedScene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xff6ec7, 0.55);
    fillLight.position.set(-2.2, 0.4, 1.4);
    sharedScene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x6ecbff, 0.45);
    rimLight.position.set(0.5, -1.2, -2.4);
    sharedScene.add(rimLight);

    sharedScene.add(new THREE.AmbientLight(0x404040, 0.35));

    sharedModelMount = new THREE.Group();
    sharedScene.add(sharedModelMount);
  }

  if (sharedRendererSizePx !== sizePx) {
    sharedRenderer.setSize(sizePx, sizePx, false);
    sharedRendererSizePx = sizePx;
  }

  return {
    renderer: sharedRenderer,
    scene: sharedScene,
    camera: sharedCamera,
    modelMount: sharedModelMount,
  };
}

function disposeObject3D(root) {
  root.traverse((node) => {
    if (node.isMesh) {
      node.geometry?.dispose?.();
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((mat) => mat?.dispose?.());
    }
  });
}

/**
 * @param {string} glbUrl
 * @param {number} sizePx
 * @returns {Promise<string>}
 */
async function renderShapeLibraryThumbOnce(glbUrl, sizePx) {
  const response = await fetch(glbUrl);
  if (!response.ok) throw new Error(`Thumb fetch failed: ${glbUrl}`);
  const buffer = await response.arrayBuffer();

  const gltf = await new Promise((resolve, reject) => {
    loader.parse(buffer, '', resolve, reject);
  });

  const root = gltf.scene;
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(...box.getSize(new THREE.Vector3()).toArray(), 0.001);
  root.position.sub(center);
  root.scale.multiplyScalar(1.35 / maxDim);
  applyShapeLibraryPresentationTilt(root);

  const { renderer, scene, camera, modelMount } = ensureThumbStudio(sizePx);
  modelMount.clear();
  modelMount.add(root);

  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL('image/png');

  modelMount.clear();
  disposeObject3D(root);

  return dataUrl;
}

/**
 * @param {string} glbUrl
 * @param {number} sizePx
 * @returns {Promise<string>} data URL
 */
export function renderShapeLibraryThumb(glbUrl, sizePx = 256) {
  const key = `${glbUrl}@${sizePx}`;
  if (cache.has(key)) return cache.get(key);

  const promise = renderQueue
    .catch(() => {})
    .then(() => renderShapeLibraryThumbOnce(glbUrl, sizePx));

  renderQueue = promise.then(() => undefined, () => undefined);
  scheduleDisposeThumbStudioWhenIdle();
  cache.set(key, promise);
  return promise;
}

export function clearShapeLibraryThumbCache() {
  cache.clear();
  renderQueue = Promise.resolve();
  disposeThumbStudio();
}
