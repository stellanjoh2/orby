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
import { EnvironmentController } from '../../../scripts/render/EnvironmentController.js';
import { BackgroundController } from '../../../scripts/render/BackgroundController.js';
import { BackgroundGradientController } from '../../../scripts/render/backgroundGradient/BackgroundGradientController.js';
import { APP_BACKGROUND } from '../../../scripts/constants.js';
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
    this.renderer.toneMappingExposure = 1;
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

    this.gltfLoader = new GLTFLoader();
    if (this.gltfLoader.setMeshoptDecoder) {
      this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    }
    configureMobileGltfLoader(this.gltfLoader);

    this.post = new MobilePost(this.renderer, this.scene, this.camera);
    this.creativeLooks = new MobileCreativeLooks(this.renderer, this.scene, this.camera);
    this.post.setCreativeLookSettingsGetter(() => this.creativeLooks.getCreativeLookSettings());
    this.creativeLooks.onCreativeLookSync = () => {
      this.post.syncCreativeLook(this._creativeLookPreset);
    };
    this.creativeLooks.onCreativeLookStateChanged = () => {
      this.onCreativeLookStateChanged?.();
    };
    this.creativeLooks.onEnvironmentResync = () => {
      this._syncModelEnvironment();
    };
    /** @type {number} */
    this._hdriStrength = MOBILE_HDRI_STRENGTH_DEFAULT;
    /** @type {number} */
    this._hdriBlurriness = 0;
    this._hdriBackgroundEnabled = true;

    this.backgroundController = new BackgroundController({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      initialColor: APP_BACKGROUND,
    });
    this.backgroundGradientController = new BackgroundGradientController({
      renderer: this.renderer,
      scene: this.scene,
      backgroundController: this.backgroundController,
    });
    this.backgroundController.setGradientController(this.backgroundGradientController);
    this.backgroundController.setHdriEnabled(true);
    this.backgroundController.setHdriBackgroundEnabled(this._hdriBackgroundEnabled);

    this.environmentController = new EnvironmentController(this.scene, this.renderer, {
      presets: MOBILE_HDRI_PRESETS,
      moods: HDRI_MOODS,
      initialPreset: 'beach',
      enabled: true,
      backgroundEnabled: this._hdriBackgroundEnabled,
      strength: this._hdriStrength,
      blurriness: this._hdriBlurriness,
      fallbackColor: this.backgroundController.getColor(),
      onReleaseSceneBackground: () => this.backgroundController.refreshAppearance(),
      shouldDrawHdriBackdrop: () => this._hdriBackgroundEnabled,
      onEnvironmentMapUpdated: (texture, intensity) => {
        this._onEnvironmentMapUpdated(texture, intensity);
      },
    });

    this.post.beforeComposerRender = () => {
      this.creativeLooks.materialController.syncImportGltfGlassMaterials?.();
    };

    /** @type {THREE.Object3D | null} */
    this.currentModel = null;
    this._hdriPresetId = 'beach';
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
    this.onCreativeLookStateChanged = null;

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
    this.backgroundGradientController?.dispose?.();
    this.environmentController?.dispose();
    this.post?.dispose();
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
      const gl = this.renderer.getContext();
      const dbw = gl?.drawingBufferWidth ?? w;
      const dbh = gl?.drawingBufferHeight ?? h;
      this.backgroundGradientController?.handleResize?.(dbw, dbh);
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

  /** @param {THREE.Texture | null} envTexture @param {number} intensity */
  _onEnvironmentMapUpdated(envTexture, intensity) {
    this.creativeLooks.setHdriStrength(intensity);
    this.creativeLooks.setHdriBlurriness(this._hdriBlurriness);
    this._syncModelEnvironment();
  }

  /**
   * @param {string} presetId
   */
  async setHdri(presetId) {
    if (!MOBILE_HDRI_PRESETS[presetId]) return;

    this._hdriPresetId = presetId;
    try {
      const mood = await this.environmentController.setPreset(presetId);
      this.post.applyHdriMood(mood ?? HDRI_MOODS[presetId]);
      this.onFxStateChanged?.();
    } catch (err) {
      console.error('[Orby Mobile] HDRI load failed', presetId, err);
      this.onError?.('HDRI failed to load');
    }
  }

  /** Effective IBL intensity — matches UI HDRI strength (no hidden multiplier). */
  getEffectiveHdriIntensity(strength = this._hdriStrength) {
    return strength;
  }

  /** @deprecated alias */
  _effectiveHdriIntensity(strength) {
    return this.getEffectiveHdriIntensity(strength);
  }

  getCurrentFileName() {
    return this._currentFileName;
  }

  /** @param {number} value */
  setHdriStrength(value) {
    this._hdriStrength = THREE.MathUtils.clamp(
      value,
      0,
      MOBILE_HDRI_STRENGTH_MAX,
    );
    this.environmentController?.setStrength(this._hdriStrength);
  }

  getHdriStrength() {
    return this._hdriStrength;
  }

  /** @param {number} value */
  setHdriBlurriness(value) {
    this._hdriBlurriness = THREE.MathUtils.clamp(value, 0, 1);
    this.environmentController?.setBlurriness(this._hdriBlurriness);
    this._syncModelEnvironment();
  }

  getHdriBlurriness() {
    return this._hdriBlurriness;
  }

  getHdriPresetId() {
    return this._hdriPresetId;
  }

  getHdriBackgroundEnabled() {
    return this._hdriBackgroundEnabled;
  }

  /** @param {boolean} enabled */
  setHdriBackground(enabled) {
    this._hdriBackgroundEnabled = !!enabled;
    const bgColor = this.backgroundController.getColor();
    this.environmentController.setFallbackColor(bgColor);
    this.backgroundController.setHdriBackgroundEnabled(this._hdriBackgroundEnabled);
    this.environmentController.setBackgroundEnabled(this._hdriBackgroundEnabled);
  }

  getBackgroundColor() {
    return this.backgroundController.getColor();
  }

  /** @param {string} color */
  setBackgroundColor(color) {
    this.backgroundController.setColor(color);
    if (!this._hdriBackgroundEnabled) {
      this.environmentController.setFallbackColor(color);
    }
  }

  getBackgroundGradient() {
    return this.backgroundGradientController.getConfig();
  }

  /** @param {Partial<import('../../../scripts/render/backgroundGradient/backgroundGradientDefaults.js').BackgroundGradientConfig>} patch */
  setBackgroundGradient(patch) {
    this.backgroundGradientController.setConfig(patch);
    if (!this._hdriBackgroundEnabled) {
      this.backgroundController.refreshAppearance();
    }
  }

  /** Re-apply HDRI env map + intensities on every material rebuild. */
  _syncModelEnvironment() {
    const env = this.scene.environment;
    if (!env) return;

    const intensity = Math.max(0, this._hdriStrength);
    this.scene.environmentIntensity = intensity;
    if ('backgroundIntensity' in this.scene) {
      this.scene.backgroundIntensity = intensity;
    }

    this.creativeLooks.syncEnvironment(env, intensity, this._hdriBlurriness);

    if (!this.currentModel) return;

    const mc = this.creativeLooks.materialController;
    mc.updateMaterialsEnvironment(env, intensity, this._hdriBlurriness);
    mc.syncImportGltfGlassMaterials?.(undefined, { forcePresentation: true });

    // r167: per-material envMap ignores scene.environmentIntensity — envMapIntensity must match HDRI slider.
    this.currentModel.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (
          m.isMeshStandardMaterial
          || m.isMeshPhysicalMaterial
          || m.isMeshLambertMaterial
          || m.isMeshPhongMaterial
        ) {
          m.envMap = env;
          if ('envMapIntensity' in m) {
            m.envMapIntensity = intensity;
          }
          m.needsUpdate = true;
        }
      }
    });
  }

  /** Desktop repairRenderSurfacesAfterModelLoad parity — composer buffers + env resync. */
  _repairRenderSurfacesAfterModelLoad() {
    const sz = new THREE.Vector2();
    this.renderer.getSize(sz);
    if (sz.x > 0 && sz.y > 0) {
      this.post.setSize(sz.x, sz.y);
    }
    this.post.composerLifecycle?.ensureComposerBuffersMatchRenderer?.();
    this.post.composerLifecycle?.resetRendererViewportToCanvas?.();
    this._syncModelEnvironment();
  }

  /** @param {THREE.Object3D} object */
  _setModel(object) {
    this._clearModel();
    normalizeImportScale(object);
    prepareMobileImportModel(object);
    this.currentModel = object;
    this.scene.add(object);
    this.creativeLooks.setModel(object);
    if (this._creativeLookPreset && this._creativeLookPreset !== 'none') {
      this.creativeLooks.setCreativeLook(this._creativeLookPreset);
    }
    this._syncModelEnvironment();
    this._repairRenderSurfacesAfterModelLoad();
    this._frameModel(object);
    this.renderer.compile(this.scene, this.camera);
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
    this.post.syncCreativeLook(this._creativeLookPreset);
  }

  getCreativeLookSettings() {
    return this.creativeLooks.getCreativeLookSettings();
  }

  /** @param {string} path @param {number | boolean} value */
  setCreativeLookValue(path, value) {
    this.creativeLooks.setCreativeLookSettings({ [path]: value });
    this.post.syncCreativeLook(this._creativeLookPreset);
  }

  togglePauseShaderAnimations() {
    return this.creativeLooks.togglePauseShaderAnimations();
  }

  toggleViewportBloom() {
    return this.creativeLooks.toggleViewportBloom();
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
