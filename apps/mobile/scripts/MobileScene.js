import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { normalizeImportScale } from '../../../scripts/import/normalizeImportScale.js';
import {
  DEFAULT_CAMERA_POSITION,
  DEFAULT_CAMERA_TARGET,
} from '../../../scripts/camera/cameraDefaults.js';
import { MOBILE_HDRI_PRESETS } from './mobileHdriConfig.js';
import { HDRI_MOODS, HDRI_STRENGTH_UNIT } from '../../../scripts/config/hdri.js';
import { MobilePost } from './MobilePost.js';
import {
  configureMobileGltfLoader,
  prepareMobileImportModel,
} from './mobilePrepareImport.js';
import { MobileCreativeLooks } from './MobileCreativeLooks.js';
import { TransformControls } from '../../../scripts/vendor/TransformControls.js';

const ORBY_BLACK = '#080808';
/** Match desktop SceneManager transform widget size. */
const ROTATE_GIZMO_SIZE = 1.5;
const MESH_TAP_MOVE_PX = 8;
const MESH_TAP_TIME_MS = 250;
/** Match desktop shelf slider: 0–3, default `hdriStrength` 2 (StateStore). */
export const MOBILE_HDRI_STRENGTH_DEFAULT = 2 * HDRI_STRENGTH_UNIT;
export const MOBILE_HDRI_STRENGTH_MAX = 3 * HDRI_STRENGTH_UNIT;

export class MobileScene {
  /** @param {HTMLElement} mount */
  constructor(mount) {
    this.mount = mount;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'orby-mobile-webgl';
    this.canvas.setAttribute('aria-hidden', 'true');
    mount.append(this.canvas);

    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
    this.camera.position.set(
      DEFAULT_CAMERA_POSITION.x,
      DEFAULT_CAMERA_POSITION.y,
      DEFAULT_CAMERA_POSITION.z,
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(ORBY_BLACK, 1);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(
      DEFAULT_CAMERA_TARGET.x,
      DEFAULT_CAMERA_TARGET.y,
      DEFAULT_CAMERA_TARGET.z,
    );
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = 500;

    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.pmremGenerator.compileEquirectangularShader();
    this.textureLoader = new THREE.TextureLoader();

    this.gltfLoader = new GLTFLoader();
    if (this.gltfLoader.setMeshoptDecoder) {
      this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    }
    configureMobileGltfLoader(this.gltfLoader);

    this.post = new MobilePost(this.renderer, this.scene, this.camera);
    this.creativeLooks = new MobileCreativeLooks(this.renderer, this.scene, this.camera);
    this.creativeLooks.onCreativeLookSync = () => {
      this.post.syncCreativeLook(this._creativeLookPreset);
    };
    /** @type {number} */
    this._hdriStrength = MOBILE_HDRI_STRENGTH_DEFAULT;
    /** @type {number} */
    this._hdriBlurriness = 0;

    /** @type {THREE.Object3D | null} */
    this.currentModel = null;
    /** @type {THREE.Texture | null} */
    this._hdriTexture = null;
    /** @type {THREE.WebGLRenderTarget | null} */
    this._hdriPmrem = null;
    this._hdriPresetId = 'beach';
    this._hdriLoadId = 0;
    this._raf = 0;
    this._resizeObserver = null;
    /** @type {string | null} */
    this._creativeLookPreset = null;

    /** @type {string | null} */
    this._currentFileName = null;
    this._exportInProgress = false;

    /** @type {(() => void) | null} */
    this.onModelLoaded = null;
    /** @type {((message: string) => void) | null} */
    this.onError = null;
    /** @type {(() => void) | null} */
    this.onFxStateChanged = null;

    this.raycaster = new THREE.Raycaster();
    this._pickNdc = new THREE.Vector2();
    /** @type {{ x: number, y: number, time: number, id: number } | null} */
    this._pointerDown = null;
    this._gizmoPointerActive = false;
    this._rotateGizmoEnabled = false;

    this.transformControlsRotate = new TransformControls(this.camera, this.canvas);
    this.transformControlsRotate.setMode('rotate');
    this.transformControlsRotate.setSpace('local');
    this.transformControlsRotate.setSize(ROTATE_GIZMO_SIZE);
    this.transformControlsRotate.visible = false;
    this.scene.add(this.transformControlsRotate);

    this.transformControlsRotate.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
    });
    this.transformControlsRotate.addEventListener('mouseDown', () => {
      this._gizmoPointerActive = true;
    });
    this.transformControlsRotate.addEventListener('mouseUp', () => {
      this._gizmoPointerActive = false;
    });
  }

  async init() {
    this._bindResize();
    this._bindMeshPicking();
    await this.setHdri('beach');
    this._startLoop();
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._resizeObserver?.disconnect();
    this._unbindMeshPicking();
    this._setRotateGizmoEnabled(false);
    this.transformControlsRotate?.dispose?.();
    this.scene.remove(this.transformControlsRotate);
    this._clearModel();
    this._disposeHdri();
    this.post?.dispose();
    this.pmremGenerator?.dispose();
    this.controls?.dispose();
    this.renderer?.dispose();
    this.canvas.remove();
  }

  _bindResize() {
    const apply = () => {
      const w = Math.max(1, this.mount.clientWidth);
      const h = Math.max(1, this.mount.clientHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
      this.post.setSize(w, h);
    };
    apply();
    this._resizeObserver = new ResizeObserver(apply);
    this._resizeObserver.observe(this.mount);
  }

  _startLoop() {
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      const dt = this.clock.getDelta();
      this.controls.update();
      this.transformControlsRotate.updateMatrixWorld?.();
      this.creativeLooks.tick(dt);
      this.post.tick(dt);
      const animTime = this.creativeLooks.materialController.getCreativeLookAnimationTime?.() ?? 0;
      this.post.render(animTime);
    };
    tick();
  }

  _bindMeshPicking() {
    this._onPickPointerDown = (e) => this._handlePickPointerDown(e);
    this._onPickPointerUp = (e) => this._handlePickPointerUp(e);
    this._onPickPointerCancel = () => {
      this._pointerDown = null;
    };
    this.canvas.addEventListener('pointerdown', this._onPickPointerDown);
    this.canvas.addEventListener('pointerup', this._onPickPointerUp);
    this.canvas.addEventListener('pointercancel', this._onPickPointerCancel);
  }

  _unbindMeshPicking() {
    if (this._onPickPointerDown) {
      this.canvas.removeEventListener('pointerdown', this._onPickPointerDown);
    }
    if (this._onPickPointerUp) {
      this.canvas.removeEventListener('pointerup', this._onPickPointerUp);
    }
    if (this._onPickPointerCancel) {
      this.canvas.removeEventListener('pointercancel', this._onPickPointerCancel);
    }
  }

  /** @param {PointerEvent} e */
  _handlePickPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this._pointerDown = {
      x: e.clientX,
      y: e.clientY,
      time: performance.now(),
      id: e.pointerId,
    };
  }

  /** @param {PointerEvent} e */
  _handlePickPointerUp(e) {
    if (!this._pointerDown || e.pointerId !== this._pointerDown.id) return;
    if (this._gizmoPointerActive || this.transformControlsRotate.dragging) {
      this._pointerDown = null;
      return;
    }

    const dx = e.clientX - this._pointerDown.x;
    const dy = e.clientY - this._pointerDown.y;
    const dt = performance.now() - this._pointerDown.time;
    this._pointerDown = null;

    if (!this.currentModel) return;
    if (Math.hypot(dx, dy) > MESH_TAP_MOVE_PX || dt > MESH_TAP_TIME_MS) return;

    this._clientToNdc(e.clientX, e.clientY, this._pickNdc);
    this.raycaster.setFromCamera(this._pickNdc, this.camera);
    const hits = this.raycaster.intersectObject(this.currentModel, true);
    this._setRotateGizmoEnabled(hits.length > 0);
  }

  /** @param {number} clientX @param {number} clientY @param {THREE.Vector2} target */
  _clientToNdc(clientX, clientY, target) {
    const rect = this.canvas.getBoundingClientRect();
    target.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    target.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  /** @param {boolean} enabled */
  _setRotateGizmoEnabled(enabled) {
    this._rotateGizmoEnabled = enabled;
    this.transformControlsRotate.visible = enabled;
    if (enabled && this.currentModel) {
      this.transformControlsRotate.attach(this.currentModel);
    } else {
      this.transformControlsRotate.detach();
    }
  }

  isRotateGizmoEnabled() {
    return this._rotateGizmoEnabled;
  }

  _disposeHdri() {
    this._hdriPmrem?.dispose();
    this._hdriPmrem = null;
    this._hdriTexture?.dispose();
    this._hdriTexture = null;
    this.scene.background = null;
  }

  /**
   * @param {string} presetId
   */
  async setHdri(presetId) {
    const config = MOBILE_HDRI_PRESETS[presetId];
    if (!config?.url) return;

    const loadId = ++this._hdriLoadId;
    try {
      const texture = await this._loadLdrEquirect(config.url);
      if (loadId !== this._hdriLoadId) {
        texture.dispose();
        return;
      }

      this._disposeHdri();
      this._hdriTexture = texture;
      this._hdriPresetId = presetId;
      this._hdriPmrem = this.pmremGenerator.fromEquirectangular(texture);

      this.scene.environment = this._hdriPmrem.texture;
      this.scene.background = texture;

      this._applyHdriEnvironment();
      this.post.applyHdriMood(HDRI_MOODS[presetId]);
      this.onFxStateChanged?.();
    } catch (err) {
      console.error('[Orby Mobile] HDRI load failed', presetId, err);
      this.onError?.('HDRI failed to load');
    }
  }

  _applyHdriEnvironment() {
    const strength = this._hdriStrength;
    const blur = this._hdriBlurriness;
    this.scene.environmentIntensity = strength;
    this.scene.backgroundIntensity = strength;
    if ('backgroundBlurriness' in this.scene) {
      this.scene.backgroundBlurriness = blur;
    }
    this.creativeLooks.setHdriBlurriness(blur);
    this.creativeLooks.syncEnvironment(this.scene.environment, strength);
  }

  /** @param {number} value */
  setHdriStrength(value) {
    this._hdriStrength = THREE.MathUtils.clamp(
      value,
      0,
      MOBILE_HDRI_STRENGTH_MAX,
    );
    this._applyHdriEnvironment();
  }

  getHdriStrength() {
    return this._hdriStrength;
  }

  /** @param {number} value */
  setHdriBlurriness(value) {
    this._hdriBlurriness = THREE.MathUtils.clamp(value, 0, 1);
    this._applyHdriEnvironment();
  }

  getHdriBlurriness() {
    return this._hdriBlurriness;
  }

  getHdriPresetId() {
    return this._hdriPresetId;
  }

  /** @param {string} url */
  _loadLdrEquirect(url) {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          resolve(texture);
        },
        undefined,
        reject,
      );
    });
  }

  /** @param {File} file */
  async loadFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext !== 'glb' && ext !== 'gltf') {
      this.onError?.('Mobile supports GLB / GLTF only');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const gltf = await this._parseGlb(buffer);
      this._currentFileName = file.name;
      this._setModel(gltf.scene);
      this.onModelLoaded?.();
    } catch (err) {
      console.error('[Orby Mobile] Model load failed', err);
      this.onError?.('Could not load model');
    }
  }

  /** @param {ArrayBuffer} buffer */
  _parseGlb(buffer) {
    return new Promise((resolve, reject) => {
      this.gltfLoader.parse(
        buffer,
        '',
        (gltf) => resolve(gltf),
        reject,
      );
    });
  }

  /** @param {THREE.Object3D} object */
  _setModel(object) {
    this._clearModel();
    normalizeImportScale(object);
    prepareMobileImportModel(object, { envMapIntensity: this._hdriStrength });
    this.currentModel = object;
    this.scene.add(object);
    this.creativeLooks.setModel(object);
    if (this._creativeLookPreset && this._creativeLookPreset !== 'none') {
      this.creativeLooks.setCreativeLook(this._creativeLookPreset);
    }
    if (this.scene.environment) {
      this.creativeLooks.syncEnvironment(this.scene.environment, this._hdriStrength);
    }
    this._frameModel(object);
    this.renderer.compile(this.scene, this.camera);
  }

  _clearModel() {
    if (!this.currentModel) return;
    this._setRotateGizmoEnabled(false);
    this.creativeLooks.clearModel();
    this.scene.remove(this.currentModel);
    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry?.dispose?.();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => m?.dispose?.());
    });
    this.currentModel = null;
  }

  /** @param {THREE.Object3D} object */
  _frameModel(object) {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (this.camera.fov * Math.PI) / 180;
    const dist = (maxDim / (2 * Math.tan(fov / 2))) * 1.35;

    this.controls.target.copy(center);
    this.camera.position.set(
      center.x + dist * 0.65,
      center.y + dist * 0.28,
      center.z + dist * 0.75,
    );
    this.controls.update();
  }

  resetCamera() {
    if (this.currentModel) {
      this._frameModel(this.currentModel);
    } else {
      this.controls.target.set(
        DEFAULT_CAMERA_TARGET.x,
        DEFAULT_CAMERA_TARGET.y,
        DEFAULT_CAMERA_TARGET.z,
      );
      this.camera.position.set(
        DEFAULT_CAMERA_POSITION.x,
        DEFAULT_CAMERA_POSITION.y,
        DEFAULT_CAMERA_POSITION.z,
      );
      this.controls.update();
    }
  }

  /**
   * @param {string} presetId — creative-look id, or `none` / `standard`
   */
  setCreativeLook(presetId) {
    const id = presetId === 'standard' ? 'none' : presetId;
    this._creativeLookPreset = id === 'none' ? null : id;
    this.creativeLooks.setCreativeLook(id);
    this.post.syncCreativeLook(id);
  }

  /** @param {number} fovDeg */
  setFov(fovDeg) {
    const fov = THREE.MathUtils.clamp(fovDeg, 28, 85);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  getFov() {
    return this.camera.fov;
  }

  /** @param {string} presetId */
  applyLookFilter(presetId) {
    return this.post.applyLookFilter(presetId);
  }

  /**
   * @param {string} path
   * @param {number | boolean} value
   */
  setFxValue(path, value) {
    if (path === 'fov' && typeof value === 'number') {
      this.setFov(value);
      return;
    }
    this.post.setFxValue(path, value);
  }

  resetFx() {
    this.post.reset();
    this.post.applyHdriMood(HDRI_MOODS[this._hdriPresetId]);
    this.onFxStateChanged?.();
  }

  /**
   * @param {'exposure' | 'contrast' | 'saturation' | 'temperature'} key
   * @param {number} value
   */
  setFxGrade(key, value) {
    this.post.setGrade(key, value);
  }

  getFxGrades() {
    return this.post.getFxSnapshot();
  }

  getFxSnapshot() {
    return {
      ...this.post.getFxSnapshot(),
      fov: this.getFov(),
      hdriStrength: this._hdriStrength,
      hdriBlurriness: this._hdriBlurriness,
      hdriPresetId: this._hdriPresetId,
    };
  }

  /** @returns {Promise<'shared' | 'downloaded' | 'no-model' | 'failed'>} */
  async exportImage() {
    const { exportMobileSceneJpeg } = await import('./mobileExportImage.js');
    return exportMobileSceneJpeg(this);
  }
}
