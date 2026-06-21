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
import { MOBILE_BASE_COLOR_DEFAULT, MOBILE_BASE_SCALE } from './mobileObjectBaseControls.js';
import { HDRI_MOODS, HDRI_STRENGTH_UNIT } from '../../../scripts/config/hdri.js';
import { EnvironmentController } from '../../../scripts/render/EnvironmentController.js';
import { BackgroundController } from '../../../scripts/render/BackgroundController.js';
import { GroundController } from '../../../scripts/render/GroundController.js';
import { BackgroundGradientController } from '../../../scripts/render/backgroundGradient/BackgroundGradientController.js';
import { APP_BACKGROUND } from '../../../scripts/constants.js';
import { exportMobileSceneJpeg } from './mobileExportImage.js';
import { MobilePost } from './MobilePost.js';
import {
  configureMobileGltfLoader,
  prepareMobileImportModel,
} from './mobilePrepareImport.js';
import { MobileCreativeLooks } from './MobileCreativeLooks.js';
import { markMobileDebugLog } from './mobileDebugLog.js';
import { validateOrbyMobileModelFile, isOrbyMobileModelWithinLimit, orbyMobileModelTooLargeMessage } from '../../../scripts/orbyMobileModelLimits.js';
import { findCreativeLook } from './mobileCatalog.js';
import { MESH_AUTO_ROTATE_SPEED_NORMAL } from '../../../scripts/config/meshAutoRotate.js';
import { captureAndApplyCenterPivot } from '../../../scripts/scene/centerModelPivot.js';
import { AnimationController } from '../../../scripts/render/AnimationController.js';

const ORBY_BLACK = '#080808';
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
    this._preventCanvasSelection = (event) => event.preventDefault();
    this.canvas.addEventListener('contextmenu', this._preventCanvasSelection);
    this.canvas.addEventListener('selectstart', this._preventCanvasSelection);
    mount.append(this.canvas);

    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.modelRoot = new THREE.Group();
    this.modelRoot.name = 'MobileModelRoot';
    this.scene.add(this.modelRoot);
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
    if (!this.renderer.getContext()) {
      markMobileDebugLog('scene:webgl-unavailable');
      throw new Error('WebGL unavailable');
    }
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      markMobileDebugLog('scene:webgl-context-lost');
      this.onError?.('Graphics paused — reload the page');
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
    this.controls.addEventListener('start', () => {
      if (!this.currentModel) return;
      this.onOrbitChromeChange?.(true);
    });
    this.controls.addEventListener('end', () => {
      this.onOrbitChromeChange?.(false);
    });

    this.gltfLoader = new GLTFLoader();
    if (this.gltfLoader.setMeshoptDecoder) {
      this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    }
    configureMobileGltfLoader(this.gltfLoader);

    this.animationController = new AnimationController({
      getFileName: () => this._currentFileName ?? 'model.glb',
    });

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

    this._groundSolid = false;
    this._groundY = 0;
    this._baseScale = MOBILE_BASE_SCALE.defaultValue;
    this._baseColor = MOBILE_BASE_COLOR_DEFAULT;
    this._baseGlassSurface = false;
    this.groundController = new GroundController(this.scene, {
      solidEnabled: false,
      wireEnabled: false,
      solidColor: MOBILE_BASE_COLOR_DEFAULT,
      groundY: 0,
      baseScale: MOBILE_BASE_SCALE.minActive,
      renderer: this.renderer,
      baseGlassSurface: false,
      backdropEnabled: false,
    });
    this._syncBaseVisibility();

    this.post = new MobilePost(this.renderer, this.scene, this.camera, this.backgroundController);
    this.creativeLooks = new MobileCreativeLooks(this.renderer, this.scene, this.camera);
    this.post.setCreativeLookSettingsGetter(() => this.creativeLooks.getCreativeLookSettings());
    this.creativeLooks.onCreativeLookSync = () => {
      this.post.syncCreativeLook(this._creativeLookPreset);
    };
    this.creativeLooks.onCreativeLookStateChanged = () => {
      this.onCreativeLookStateChanged?.();
    };
    this.creativeLooks.onCreativeLookLoading = (loading) => {
      this.onCreativeLookLoading?.(loading);
    };
    this.creativeLooks.onEnvironmentResync = () => {
      this._syncModelEnvironment();
    };
    const prevAfterCreativeLookRebuild =
      this.creativeLooks.materialController.afterCreativeLookMaterialRebuild;
    this.creativeLooks.materialController.afterCreativeLookMaterialRebuild = () => {
      if (typeof prevAfterCreativeLookRebuild === 'function') {
        prevAfterCreativeLookRebuild();
      }
      this.animationController?.resyncPose?.();
    };
    this.creativeLooks.prepareCreativeLookPost = (presetId) =>
      this.post.creativeLooks.prepareForPreset(presetId);
    this.creativeLooks.needsCreativeLookPostPrepare = (presetId) =>
      this.post.creativeLooks.needsPrepare(presetId);

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
    /** @type {Promise<'shared' | 'downloaded' | 'no-model' | 'busy' | 'failed'> | null} */
    this._exportFlight = null;
    this._autoRotateEnabled = false;

    /** @type {(() => void) | null} */
    this.onModelLoaded = null;
    /** @type {((message: string) => void) | null} */
    this.onError = null;
    /** @type {(() => void) | null} */
    this.onFxStateChanged = null;
    /** @type {(() => void) | null} */
    this.onCreativeLookStateChanged = null;
    /** @type {((hidden: boolean) => void) | null} */
    this.onOrbitChromeChange = null;
    /** @type {((loading: boolean) => void) | null} */
    this.onCreativeLookLoading = null;
    /** @type {(() => void) | null} */
    this.onBaseStateChanged = null;
  }

  async init() {
    this._bindResize();
    this._startLoop();
    await this.setHdri('beach');
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._resizeObserver?.disconnect();
    this._clearModel();
    this.backgroundGradientController?.dispose?.();
    this.groundController?.disposeMeshes?.();
    this.groundController = null;
    this.environmentController?.dispose();
    this.post?.dispose();
    this.controls?.dispose();
    this.renderer?.dispose();
    this.canvas.removeEventListener('contextmenu', this._preventCanvasSelection);
    this.canvas.removeEventListener('selectstart', this._preventCanvasSelection);
    this.canvas.remove();
  }

  _bindResize() {
    const apply = () => {
      if (this._exportInProgress) return;
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
      this.groundController?.resizeBaseReflector?.(w, h);
    };
    apply();
    this._resizeObserver = new ResizeObserver(apply);
    this._resizeObserver.observe(this.mount);
  }

  _startLoop() {
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      if (this._exportInProgress) return;
      const dt = this.clock.getDelta();
      this.controls.update();
      if (this._autoRotateEnabled && this.currentModel) {
        this.modelRoot.rotation.y += dt * MESH_AUTO_ROTATE_SPEED_NORMAL;
      }
      this.animationController.update(dt);
      this.creativeLooks.tick(dt);
      this.post.tick(dt);
      const animTime = this.creativeLooks.materialController.getCreativeLookAnimationTime?.() ?? 0;
      this.post.render(animTime);
    };
    tick();
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
      const resolvedMood = mood ?? HDRI_MOODS[presetId];
      this.post.applyHdriMood(resolvedMood);
      if (resolvedMood?.baseColor) {
        this.setBaseColor(resolvedMood.baseColor);
      }
      this.onFxStateChanged?.();
    } catch (err) {
      console.error('[Orby Mobile] HDRI load failed', presetId, err);
      markMobileDebugLog('scene:hdri-failed', { presetId, message: String(err?.message || err) });
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
    if (!color) return;
    this.backgroundController.setColor(color);
    if (!this._hdriBackgroundEnabled) {
      this.environmentController.setFallbackColor(color);
      this.backgroundController.refreshAppearance();
    }
  }

  getBackgroundGradient() {
    return this.backgroundGradientController.getConfig();
  }

  /** @param {Partial<import('../../../scripts/render/backgroundGradient/backgroundGradientDefaults.js').BackgroundGradientConfig>} patch */
  setBackgroundGradient(patch) {
    this.backgroundGradientController.setConfig(patch);
    if (!this._hdriBackgroundEnabled) {
      if (this.backgroundGradientController.isActive()) {
        this.backgroundGradientController.syncToDrawingBuffer(undefined, undefined, { forceRedraw: true });
      } else {
        this.backgroundController.refreshAppearance();
      }
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
    this.groundController?.applyBaseEnvironment(env, intensity, this._hdriBlurriness);

    if (!this.currentModel) return;

    const mc = this.creativeLooks.materialController;
    mc.updateMaterialsEnvironment(env, intensity, this._hdriBlurriness);
    mc.syncImportGltfGlassMaterials?.(undefined, { forcePresentation: true });
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

  /** @param {THREE.Object3D} object @param {THREE.AnimationClip[]} [animations] */
  _setModel(object, animations = []) {
    this._clearModel();
    normalizeImportScale(object);
    prepareMobileImportModel(object);
    this._resetModelRoot();
    this.currentModel = object;
    this.modelRoot.add(object);
    captureAndApplyCenterPivot(this.modelRoot, object);
    this.creativeLooks.setModel(object);
    this.animationController.setModel(object, animations);
    if (this._creativeLookPreset && this._creativeLookPreset !== 'none') {
      this.creativeLooks.setCreativeLook(this._creativeLookPreset);
    }
    this._syncModelEnvironment();
    this._repairRenderSurfacesAfterModelLoad();
    this._frameModel(object);
    if (this._groundSolid) {
      this.snapBaseToBottom();
    }
    if (typeof this.renderer?.compile === 'function') {
      requestAnimationFrame(() => {
        if (!this.renderer || !this.scene || !this.camera) return;
        try {
          this.renderer.compile(this.scene, this.camera);
        } catch {
          /* ignore compile failures while materials settle */
        }
      });
    }
  }

  /** @param {ArrayBuffer} buffer @param {string} name @param {number} [byteLength] */
  async loadModelBuffer(name, buffer, byteLength = buffer?.byteLength ?? 0) {
    if (!buffer?.byteLength) {
      throw new Error('Empty model data');
    }
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (ext !== 'glb' && ext !== 'gltf') {
      const message = 'Mobile supports GLB / GLTF only';
      this.onError?.(message);
      throw new Error(message);
    }
    if (!isOrbyMobileModelWithinLimit(byteLength || buffer.byteLength)) {
      const message = orbyMobileModelTooLargeMessage(byteLength || buffer.byteLength);
      this.onError?.(message);
      throw new Error(message);
    }

    try {
      const gltf = await this._parseGlb(buffer);
      this._currentFileName = name;
      this._setModel(gltf.scene, gltf.animations ?? []);
      this.onModelLoaded?.();
    } catch (err) {
      console.error('[Orby Mobile] Model load failed', err);
      const message = err instanceof Error && err.message.includes('too large')
        ? err.message
        : 'Could not load model — file may be too large for this device';
      this.onError?.(message);
      throw err;
    }
  }

  /** @param {File} file */
  async loadFile(file) {
    if (!file) return;

    const check = validateOrbyMobileModelFile(file);
    if (!check.ok) {
      this.onError?.(check.message);
      throw new Error(check.message);
    }

    const buffer = await file.arrayBuffer();
    await this.loadModelBuffer(file.name, buffer, file.size);
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
    this.animationController.dispose();
    if (!this.currentModel) return;
    this.creativeLooks.clearModel();
    this.modelRoot.remove(this.currentModel);
    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry?.dispose?.();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => m?.dispose?.());
    });
    this.currentModel = null;
    this._resetModelRoot();
  }

  _resetModelRoot() {
    this.modelRoot.position.set(0, 0, 0);
    this.modelRoot.rotation.set(0, 0, 0);
    this.modelRoot.scale.setScalar(1);
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
   * @returns {Promise<void>}
   */
  setCreativeLook(presetId) {
    const raw = presetId === 'standard' ? 'none' : presetId;
    const id = raw === 'none' ? 'none' : findCreativeLook(raw).id;
    this._creativeLookPreset = id === 'none' ? null : id;
    return this.creativeLooks.setCreativeLook(id);
  }

  getCreativeLookSettings() {
    return this.creativeLooks.getCreativeLookSettings();
  }

  /** @param {string} path @param {number | boolean} value */
  setCreativeLookValue(path, value) {
    this.creativeLooks.setCreativeLookSettings({ [path]: value });
    this.post.syncCreativeLook(this._creativeLookPreset);
  }

  resetCreativeLookSliders() {
    return this.creativeLooks.resetCreativeLookSliders();
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

  getMaterialSettings() {
    return this.creativeLooks.getMaterialSettings();
  }

  /** @param {'brightness' | 'metalness' | 'roughness' | 'emissive'} key @param {number} value */
  setMaterialValue(key, value) {
    this.creativeLooks.setMaterialValue(key, value);
  }

  /** @param {boolean} enabled */
  setAutoRotate(enabled) {
    this._autoRotateEnabled = !!enabled;
  }

  getAutoRotate() {
    return this._autoRotateEnabled;
  }

  getAmbientOcclusion() {
    return this.post.getAmbientOcclusion();
  }

  /** @param {boolean} enabled */
  setAmbientOcclusionEnabled(enabled) {
    this.post.setAmbientOcclusionEnabled(enabled);
    this.onBaseStateChanged?.();
  }

  getBaseScale() {
    return this._baseScale;
  }

  getBaseColor() {
    return this._baseColor;
  }

  /** @param {string} color */
  setBaseColor(color) {
    if (!color) return;
    this._baseColor = color;
    this.groundController?.setSolidColor(color);
    this.onBaseStateChanged?.();
  }

  getBaseGlassSurface() {
    return this._baseGlassSurface;
  }

  /** @param {number} value — 0 turns the base off. */
  setBaseScale(value) {
    const uiScale = THREE.MathUtils.clamp(
      Number(value),
      MOBILE_BASE_SCALE.min,
      MOBILE_BASE_SCALE.max,
    );
    const wasOff = !this._groundSolid;

    if (uiScale <= 0) {
      if (this._baseScale === 0 && !this._groundSolid) return;
      this._baseScale = 0;
      this._groundSolid = false;
      if (this._baseGlassSurface) {
        this._baseGlassSurface = false;
        this.groundController?.setBaseGlassSurface(false);
      }
      this.groundController?.setSolidEnabled(false);
      this._syncBaseVisibility();
      this.backgroundController?.setGroundSolid(false);
      this.onBaseStateChanged?.();
      return;
    }

    const effectiveScale = Math.max(MOBILE_BASE_SCALE.minActive, uiScale);
    this._baseScale = uiScale;
    this._groundSolid = true;
    this.groundController?.setSolidEnabled(true);
    const newGroundY = this.groundController?.setBaseScale(effectiveScale);
    if (typeof newGroundY === 'number') {
      this._groundY = newGroundY;
      this.backgroundController?.setGroundY(newGroundY);
    }
    this.backgroundController?.setGroundSolid(true);
    this._syncBaseVisibility();
    if (wasOff) {
      this.snapBaseToBottom();
    }
    this.onBaseStateChanged?.();
  }

  /** @param {boolean} enabled */
  setBaseGlassSurface(enabled) {
    const next = !!enabled;
    if (next === this._baseGlassSurface) return;
    if (!this._groundSolid && next) return;

    this._baseGlassSurface = next;
    this.groundController?.setBaseGlassSurface(next);
    this._syncBaseVisibility();
    this.onBaseStateChanged?.();
  }

  /** @returns {boolean} Whether the base Y was updated. */
  snapBaseToBottom() {
    if (!this.currentModel) return false;

    this.modelRoot.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.modelRoot);
    if (!bounds || !isFinite(bounds.min.y)) return false;

    const bottomY = this.groundController?.snapBaseToBounds(bounds);
    if (bottomY === null || bottomY === undefined) return false;

    this._groundY = bottomY;
    this.backgroundController?.setGroundY(bottomY);
    return true;
  }

  _syncBaseVisibility() {
    const solidOn = this._groundSolid;
    const glassOn = this._baseGlassSurface && solidOn;
    const root = this.groundController?.podiumRoot;
    const podium = this.groundController?.podium;
    const reflector = this.groundController?.podiumReflector;
    if (root) root.visible = solidOn || glassOn;
    if (podium) {
      podium.visible = solidOn;
      if (podium.material) podium.material.visible = solidOn;
    }
    if (reflector) reflector.visible = glassOn;
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

  /** @returns {Promise<'shared' | 'downloaded' | 'no-model' | 'busy' | 'failed'>} */
  exportImage() {
    if (!this._exportFlight) {
      this._exportFlight = exportMobileSceneJpeg(this).finally(() => {
        this._exportFlight = null;
      });
    }
    return this._exportFlight;
  }
}
