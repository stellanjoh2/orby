import * as THREE from 'three';
import { verticalFovForAspectPreservingHorizontalFov } from '../camera/lensPresets.js';
import {
  exportVideoMovementLabel,
  hasExportVideoMovement,
  needsExportCameraDrive,
  needsExportFovDrive,
  normalizeExportVideoMovements,
  normalizeExportMeshAnimationSettings,
  normalizeExportObjectSpinSettings,
  normalizeExportCameraSpinSettings,
  normalizeExportHdriRotationSettings,
  resolveExportMeshAnimationTiming,
  resolveExportCameraMovementLinearT,
  resolveExportTimeSecFromFrame,
  exportSpinSequenceLabel,
  exportSpinToastLabel,
  exportHdriRotationToastLabel,
} from './exportVideoMovements.js';
import {
  easeExportMovementProgress,
  normalizeExportMovementEasing,
} from './exportMovementEasing.js';
import { lightsRotationForExportFrame } from '../config/lightsAutoRotate.js';
import { buildOfflineExportOverlaySummary } from './offlineExportOverlaySummary.js';
import { downloadBlob } from '../utils/downloadBlob.js';
import { forceExportCaptureFramebuffer } from './capture/forceExportCaptureFramebuffer.js';
import { runOfflineCaptureSession } from './capture/OfflineCaptureSession.js';
import { resolvePngExportCaptureSize } from './capture/CaptureSizePolicy.js';
import {
  exportVideoAspectSequenceSuffix,
  getExportVideoResolutionPixelLabel,
  getExportVideoResolutionSize,
  isPortraitExportVideoAspect,
  normalizeExportVideoAspectRatio,
  normalizeExportVideoFps,
  normalizeExportVideoResolution,
} from './exportVideoResolution.js';
import { renderFrameForCaptureWithPins } from './capture/renderFrameForCapture.js';
import { fillCinematicLetterbox219MattesGl } from './capture/cinematicLetterbox219.js';
import { CaptureFeatureSession } from './capture/captureFeatureHooks.js';
import { applyTimedExportFrameDrives } from './capture/captureExportFrameDrives.js';
import {
  captureVideoExportFrameBlob,
  resolveVideoExportFrameTiming,
} from './capture/captureVideoExportFrame.js';
import {
  applyTransparentCaptureSetup,
  cropTransparentTopDownRgbaToCanvas,
  readTransparentMergedTopDownRgba,
  restoreTransparentCaptureSetup,
  topDownRgbaToCanvas,
} from './capture/TransparentCapture.js';
import { isTransparentCropToAsset } from './imageExportFraming.js';
import { repairInteractiveViewportAfterCapture } from './capture/repairInteractiveViewportAfterCapture.js';
import { coerceRendererLogicalSize } from './drawingBufferSize.js';

export class VideoExporter {
  constructor({
    renderer,
    scene,
    camera,
    composer,
    imageExporter,
    backgroundController,
    environmentController,
    stateStore,
    ui,
    syncPostProcessingForLogicalSize,
    syncPerspectiveProjection,
    ensureComposerBuffersMatchRenderer,
    resetRendererViewportToCanvas,
    /** Same clear + bloom guard as interactive `SceneManager.render()` before composer captures. */
    prepareComposerCapture,
    /** Lens flare / god rays prep — must run before each offline capture frame. */
    beforeComposerRender,
    /** Same pass sequence as still PNG export (`ImageExporter.exportImage`). */
    renderComposerPassForExport,
    setRotationY,
    setLightsRotation,
    setHdriRotation,
    getHdriRotation = () => 0,
    beginExportCameraDrive = () => {},
    applyExportCameraDriveFrame = () => {},
    endExportCameraDrive = () => {},
    beginExportFovDrive = () => {},
    applyExportFovDriveFrame = () => {},
    endExportFovDrive = () => {},
    beginExportAnimationDrive = () => {},
    applyExportAnimationDriveFrame = () => {},
    endExportAnimationDrive = () => {},
    /** ShaderLab / creative-look `uTime` — export loop does not run the interactive rAF step. */
    applyCreativeLookExportFrame = () => {},
    /** Film grain `time` — export loop does not run RenderLoopController grain-time. */
    applyGrainExportFrame = () => {},
    beginFontTextRevealExportDrive = () => {},
    applyFontTextRevealExportFrame = () => {},
    endFontTextRevealExportDrive = () => {},
    /** Pop/scale/fade reveals can hide all glyphs at export t=0 — preview capture may advance. */
    isFontRevealFullyHiddenAtExportTime = () => false,
    findFirstVisibleRevealExportFrameIndex = (startFrameIndex) => startFrameIndex,
    /** Dust Field point sprites are sized in absolute framebuffer pixels — scale for export size. */
    setDustFieldCaptureScale = () => {},
    getCurrentModel,
    getCurrentFile,
    getCurrentAssetMetadata,
    getHdriBackgroundEnabled,
    getAnimationClipCount = () => 0,
    getAnimationClipDuration = () => 0,
    getAnimationClipLabel = () => null,
    getFontTextRevealExportLabel = () => null,
    handleResize,
    creativeLookCaptureDeps,
  } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = composer;
    this.imageExporter = imageExporter;
    this.backgroundController = backgroundController;
    this.environmentController = environmentController;
    this.stateStore = stateStore;
    this.ui = ui;
    this.syncPostProcessingForLogicalSize = syncPostProcessingForLogicalSize;
    this.syncPerspectiveProjection = syncPerspectiveProjection;
    this.ensureComposerBuffersMatchRenderer = ensureComposerBuffersMatchRenderer;
    this.resetRendererViewportToCanvas = resetRendererViewportToCanvas;
    this.prepareComposerCapture = prepareComposerCapture;
    this.beforeComposerRender = beforeComposerRender;
    this.renderComposerPassForExport = renderComposerPassForExport;
    this.setRotationY = setRotationY;
    this.setLightsRotation = setLightsRotation;
    this.setHdriRotation = setHdriRotation;
    this.getHdriRotation = getHdriRotation;
    this.beginExportCameraDrive = beginExportCameraDrive;
    this.applyExportCameraDriveFrame = applyExportCameraDriveFrame;
    this.endExportCameraDrive = endExportCameraDrive;
    this.beginExportFovDrive = beginExportFovDrive;
    this.applyExportFovDriveFrame = applyExportFovDriveFrame;
    this.endExportFovDrive = endExportFovDrive;
    this.beginExportAnimationDrive = beginExportAnimationDrive;
    this.applyExportAnimationDriveFrame = applyExportAnimationDriveFrame;
    this.endExportAnimationDrive = endExportAnimationDrive;
    this.applyCreativeLookExportFrame = applyCreativeLookExportFrame;
    this.applyGrainExportFrame = applyGrainExportFrame;
    this.beginFontTextRevealExportDrive = beginFontTextRevealExportDrive;
    this.applyFontTextRevealExportFrame = applyFontTextRevealExportFrame;
    this.endFontTextRevealExportDrive = endFontTextRevealExportDrive;
    this.isFontRevealFullyHiddenAtExportTime = isFontRevealFullyHiddenAtExportTime;
    this.findFirstVisibleRevealExportFrameIndex = findFirstVisibleRevealExportFrameIndex;
    this.setDustFieldCaptureScale = setDustFieldCaptureScale;
    this.getCurrentModel = getCurrentModel;
    this.getCurrentFile = getCurrentFile;
    this.getCurrentAssetMetadata = getCurrentAssetMetadata;
    this.getHdriBackgroundEnabled = getHdriBackgroundEnabled;
    this.getAnimationClipCount = getAnimationClipCount;
    this.getAnimationClipDuration = getAnimationClipDuration;
    this.getAnimationClipLabel = getAnimationClipLabel;
    this.getFontTextRevealExportLabel = getFontTextRevealExportLabel;
    this.handleResize = handleResize;
    this.creativeLookCaptureDeps = creativeLookCaptureDeps;
    this._exportCancelRequested = false;
    /** @type {{ width: number, height: number } | null} — PNG sequence output size from export settings */
    /** @type {import('./capture/captureFeatureHooks.js').CaptureFeatureSession | null} */
    this._captureFeatureSession = null;
  }

  _cameraMovementLinearT(frameIndex, fps, cameraMovementDurationSec) {
    return resolveExportCameraMovementLinearT(
      resolveExportTimeSecFromFrame(frameIndex, fps),
      cameraMovementDurationSec,
    );
  }

  requestCancelExport() {
    this._exportCancelRequested = true;
  }

  _downloadBlob(blob, fileName) {
    downloadBlob(blob, fileName);
  }

  _frameNameForSequence(baseName, mode, durationSec, frameIndex) {
    const safeBase = (baseName || 'orby')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      || 'orby';
    const frame = String(frameIndex + 1).padStart(4, '0');
    return `${safeBase}_${mode}_${durationSec}s_${frame}.png`;
  }

  _previewFrameFileName(baseName, modeLabel, resolutionLabel, frameIndex) {
    const safeBase = (baseName || 'orby')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      || 'orby';
    const frame = String(frameIndex + 1).padStart(4, '0');
    return `${safeBase}_capture_preview_${modeLabel}_${resolutionLabel}_f${frame}.png`;
  }

  /** Normalized export settings shared by full encode and single-frame capture preview. */
  _resolveVideoExportParams(settings = {}) {
    if (!this.getCurrentModel?.()) {
      return null;
    }
    const movements = normalizeExportVideoMovements(settings);
    if (!hasExportVideoMovement(movements, settings)) {
      return null;
    }
    const allowedDurations = [5, 10, 15];
    const clipCount = this.getAnimationClipCount?.() ?? 0;
    const meshAnimation = normalizeExportMeshAnimationSettings(settings, clipCount);
    const clipDuration = meshAnimation.include
      ? this.getAnimationClipDuration?.(meshAnimation.clipIndex) ?? 0
      : 0;
    const timing = resolveExportMeshAnimationTiming(settings, clipCount, clipDuration);
    const durationSec = timing.exportDurationSec;
    const cameraMovementDurationSec = timing.cameraMovementDurationSec;
    const fps = normalizeExportVideoFps(settings?.fps);
    const totalFrames = Math.max(2, Math.round(durationSec * fps));
    const state = this.stateStore.getState();
    const startRotationY = Number.isFinite(state.rotationY)
      ? state.rotationY
      : THREE.MathUtils.radToDeg(this.getCurrentModel()?.rotation?.y || 0);
    const startLightsRotation = Number.isFinite(state.lightsRotation)
      ? state.lightsRotation
      : 0;
    const startHdriRotation = Number.isFinite(this.getHdriRotation?.())
      ? this.getHdriRotation()
      : Number.isFinite(state.hdriRotation)
        ? state.hdriRotation
        : 0;
    return {
      movements,
      hdriRotationSettings: normalizeExportHdriRotationSettings(settings),
      modeLabel: exportVideoMovementLabel(movements),
      meshAnimation: timing,
      durationSec,
      cameraMovementDurationSec,
      presetDurationSec: allowedDurations.includes(settings?.durationSec)
        ? settings.durationSec
        : 5,
      fps,
      totalFrames,
      objectSpinSettings: normalizeExportObjectSpinSettings(settings),
      cameraSpinSettings: normalizeExportCameraSpinSettings(settings),
      resolution: normalizeExportVideoResolution(settings?.resolution),
      aspectRatio: normalizeExportVideoAspectRatio(settings?.aspectRatio),
      outputSize: this._getVideoResolutionSize(
        normalizeExportVideoResolution(settings?.resolution),
        normalizeExportVideoAspectRatio(settings?.aspectRatio),
      ),
      baseName:
        this.getCurrentFile?.()?.name
        || this.getCurrentAssetMetadata?.()?.assetName
        || 'orby',
      startRotationY,
      startLightsRotation,
      startHdriRotation,
      lightsAutoRotate: !!state.lightsAutoRotate,
      movementEasing: normalizeExportMovementEasing(settings?.movementEasing),
    };
  }

  _sequenceFolderName(
    baseName,
    durationSec,
    fps,
    objectSpinSettings,
    cameraSpinSettings,
    resolution,
    mode = 'turntable',
    aspectRatio = '16:9',
  ) {
    const safeBase = (baseName || 'orby')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      || 'orby';
    const spinParts = [];
    if (objectSpinSettings?.rotationDegrees) {
      spinParts.push(`obj_${exportSpinSequenceLabel(objectSpinSettings)}`);
    }
    if (cameraSpinSettings?.rotationDegrees) {
      spinParts.push(`cam_${exportSpinSequenceLabel(cameraSpinSettings)}`);
    }
    const spinLabel = spinParts.length ? spinParts.join('_') : 'nospin';
    const aspectSuffix = exportVideoAspectSequenceSuffix(aspectRatio);
    return `${safeBase}_${mode}_${durationSec}s_${fps}fps_${spinLabel}_${resolution}${aspectSuffix}`;
  }

  _applyVideoExportFrame({
    movements,
    t: linearT,
    movementEasing,
    objectSpinSettings,
    cameraSpinSettings,
    hdriRotationSettings,
    startRotationY,
    startLightsRotation,
    startHdriRotation,
    lightsAutoRotate,
    durationSec,
    cameraMovementDurationSec,
    frameIndex,
    fps,
    meshAnimation,
  }) {
    const t = easeExportMovementProgress(linearT, movementEasing);
    const cameraDuration = Math.max(
      1e-6,
      Number(cameraMovementDurationSec) || Number(durationSec) || 1,
    );
    const {
      rotationDegrees: objectRotationDegrees,
      signedRotationDegrees: objectSignedRotationDegrees,
    } = objectSpinSettings;
    if (movements.turntable && objectRotationDegrees > 0) {
      const rotationY = startRotationY + objectSignedRotationDegrees * t;
      this.setRotationY(rotationY);
      this.stateStore.set('rotationY', rotationY);
    }
    if (lightsAutoRotate && typeof this.setLightsRotation === 'function') {
      const lightsRotation = lightsRotationForExportFrame(
        startLightsRotation,
        cameraDuration,
        t,
      );
      this.setLightsRotation(lightsRotation, { updateUi: false, updateState: false });
    }
    if (typeof this.setHdriRotation === 'function') {
      const hdriRotation = hdriRotationSettings?.degrees > 0
        ? startHdriRotation + hdriRotationSettings.signedDegrees * t
        : startHdriRotation;
      this.setHdriRotation(hdriRotation, {
        updateState: false,
        updateUi: false,
        live: true,
      });
    }
    if (needsExportCameraDrive(movements)) {
      const {
        rotationDegrees: cameraRotationDegrees,
        sign: cameraRotationSign,
      } = cameraSpinSettings;
      this.applyExportCameraDriveFrame?.(t, {
        rotationDegrees: cameraRotationDegrees,
        rotationSign: cameraRotationSign,
        orbit: movements.orbit,
        zoom: movements.zoom,
        zoomDistance: movements.zoomDistance,
        tilt: movements.tilt,
        tiltAngle: movements.tiltAngle,
        pitchOffset: movements.pitchOffset,
      });
    }
    if (needsExportFovDrive(movements)) {
      this.applyExportFovDriveFrame?.(t, movements.fovOffset);
    }
    applyTimedExportFrameDrives(
      { frameIndex, fps, meshAnimation },
      {
        applyExportAnimationDriveFrame: this.applyExportAnimationDriveFrame,
        applyCreativeLookExportFrame: this.applyCreativeLookExportFrame,
        applyGrainExportFrame: this.applyGrainExportFrame,
        applyFontTextRevealExportFrame: this.applyFontTextRevealExportFrame,
      },
    );
  }

  _startVideoCaptureFeatureSession(referenceLogicalSize) {
    this._captureFeatureSession = new CaptureFeatureSession({
      backgroundController: this.backgroundController,
      environmentController: this.environmentController,
      postPipeline: this.imageExporter?.postPipeline,
      creativeLookCaptureDeps: this.creativeLookCaptureDeps,
    });
    this._captureFeatureSession.startCapture({
      getHdriRotationDegrees: () =>
        typeof this.getHdriRotation === 'function' ? this.getHdriRotation() : 0,
      referenceLogicalSize,
    });
  }

  /** Rewind export-driven scene state to frame 0 before tearing down export drives. */
  _resetExportSceneToFirstFrame({
    movements,
    movementEasing,
    objectSpinSettings,
    cameraSpinSettings,
    hdriRotationSettings,
    startRotationY,
    startLightsRotation,
    startHdriRotation,
    lightsAutoRotate,
    durationSec,
    fps,
    meshAnimation,
    cameraMovementDurationSec,
  }) {
    this._applyVideoExportFrame({
      movements,
      t: 0,
      movementEasing,
      objectSpinSettings,
    cameraSpinSettings,
      hdriRotationSettings,
      startRotationY,
      startLightsRotation,
      startHdriRotation,
      lightsAutoRotate,
      durationSec,
      cameraMovementDurationSec,
      frameIndex: 0,
      fps,
      meshAnimation,
    });
  }

  _beginExportSession({ movements, meshAnimation }) {
    if (needsExportCameraDrive(movements)) {
      this.beginExportCameraDrive?.();
    }
    if (needsExportFovDrive(movements)) {
      this.beginExportFovDrive?.();
    }
    this.beginExportAnimationDrive?.(meshAnimation);
    this.beginFontTextRevealExportDrive?.();
  }

  /**
   * End export drives, restore session start pose, and repair viewport/size.
   * @param {object} session
   * @param {object} [transparentRestore] — PNG transparent sequence only
   */
  _finishExportSession(session, transparentRestore = null) {
    const {
      movements,
      movementEasing,
      objectSpinSettings,
    cameraSpinSettings,
      hdriRotationSettings,
      startRotationY,
      startLightsRotation,
      startHdriRotation,
      lightsAutoRotate,
      durationSec,
      fps,
      meshAnimation,
      cameraMovementDurationSec,
      sizeSnapshot,
    } = session;

    this._resetExportSceneToFirstFrame({
      movements,
      movementEasing,
      objectSpinSettings,
    cameraSpinSettings,
      hdriRotationSettings,
      startRotationY,
      startLightsRotation,
      startHdriRotation,
      lightsAutoRotate,
      durationSec,
      fps,
      meshAnimation,
      cameraMovementDurationSec,
    });
    if (needsExportCameraDrive(movements)) {
      this.endExportCameraDrive?.();
    }
    if (needsExportFovDrive(movements)) {
      this.endExportFovDrive?.();
    }
    this.endExportAnimationDrive?.();
    this.endFontTextRevealExportDrive?.();

    this.setRotationY(startRotationY);
    this.stateStore.set('rotationY', startRotationY);
    if (lightsAutoRotate && typeof this.setLightsRotation === 'function') {
      this.setLightsRotation(startLightsRotation);
      this.stateStore.set('lightsRotation', startLightsRotation);
    }
    if (typeof this.setHdriRotation === 'function') {
      this.setHdriRotation(startHdriRotation);
      this.stateStore.set('hdriRotation', startHdriRotation);
    }

    if (transparentRestore) {
      const {
        originalBackground,
        originalClearColor,
        originalClearAlpha,
        transparentSetupSnapshot,
        wasBackgroundEnabled,
      } = transparentRestore;
      this.scene.background = originalBackground;
      this.renderer.setClearColor(originalClearColor, originalClearAlpha);
      this.renderer.setClearAlpha(originalClearAlpha);
      this._restoreTransparentFrameSetup(transparentSetupSnapshot);
      if (wasBackgroundEnabled) {
        this.backgroundController?.setHdriBackgroundEnabled(true);
      }
    }

    this._restoreVideoExportSize(sizeSnapshot);
    this._captureFeatureSession?.restore();
    this._repairViewportAfterExport(sizeSnapshot);
    this._exportCaptureSize = null;

    this._captureFeatureSession = null;

    this.handleResize?.();
  }

  async _downloadSequenceAsZip({
    files,
    baseName,
    durationSec,
    fps,
    objectSpinSettings,
    cameraSpinSettings,
    resolution,
    mode = 'turntable',
    aspectRatio = '16:9',
  }) {
    let JSZipMod = null;
    try {
      JSZipMod = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
    } catch (error) {
      console.error('Failed to load JSZip', error);
      return false;
    }
    const JSZip = JSZipMod?.default;
    if (!JSZip) return false;

    const zip = new JSZip();
    const folderName = this._sequenceFolderName(
      baseName,
      durationSec,
      fps,
      objectSpinSettings,
    cameraSpinSettings,
      resolution,
      mode,
      aspectRatio,
    );
    const folder = zip.folder(folderName);
    if (!folder) return false;

    for (const entry of files) {
      folder.file(entry.fileName, entry.blob);
    }

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      // PNG is already compressed; STORE avoids extra CPU and reduces unzip compatibility issues.
      compression: 'STORE',
    });
    this._downloadBlob(zipBlob, `${folderName}.zip`);
    return true;
  }

  async _ensureDirectoryWritePermission(dirHandle) {
    if (!dirHandle) return false;
    const opts = { mode: 'readwrite' };
    if ((await dirHandle.queryPermission(opts)) === 'granted') return true;
    if ((await dirHandle.requestPermission(opts)) === 'granted') return true;
    return false;
  }

  async _preparePngSequenceOutputFolder({
    parentHandle,
    baseName,
    durationSec,
    fps,
    objectSpinSettings,
    cameraSpinSettings,
    resolution,
    mode = 'turntable',
    aspectRatio = '16:9',
  }) {
    const folderName = this._sequenceFolderName(
      baseName,
      durationSec,
      fps,
      objectSpinSettings,
    cameraSpinSettings,
      resolution,
      mode,
      aspectRatio,
    );
    const sequenceDirHandle = await parentHandle.getDirectoryHandle(folderName, { create: true });
    return { folderName, sequenceDirHandle };
  }

  async _writeBlobToDirectory(dirHandle, fileName, blob) {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  _dataUrlToBlob(dataUrl) {
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return new Blob();
    const header = dataUrl.slice(0, comma);
    const mimeMatch = header.match(/data:([^;,]+)/i);
    const mime = mimeMatch?.[1] || 'application/octet-stream';
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  _videoExportSizeSnapshot(exportWidth, exportHeight) {
    const previousSize = new THREE.Vector2();
    this.renderer.getSize(previousSize);
    return {
      previousSize,
      previousPixelRatio: this.renderer.getPixelRatio(),
      previousAspect: this.camera.aspect,
      exportWidth: Math.max(1, Math.round(exportWidth)),
      exportHeight: Math.max(1, Math.round(exportHeight)),
    };
  }

  _downscaleCaptureCanvasToVideoExport(canvas, outputWidth, outputHeight) {
    if (canvas.width === outputWidth && canvas.height === outputHeight) {
      return { canvas, cropped: false };
    }
    const out = document.createElement('canvas');
    out.width = outputWidth;
    out.height = outputHeight;
    const ctx = out.getContext('2d');
    if (!ctx) {
      return { canvas, cropped: false };
    }
    const srcAspect = canvas.width / Math.max(1, canvas.height);
    const dstAspect = outputWidth / Math.max(1, outputHeight);
    let sx = 0;
    let sy = 0;
    let sw = canvas.width;
    let sh = canvas.height;
    let cropped = false;
    if (Math.abs(srcAspect - dstAspect) > 1e-4) {
      cropped = true;
      if (srcAspect > dstAspect) {
        sw = Math.round(canvas.height * dstAspect);
        sx = Math.floor((canvas.width - sw) / 2);
      } else {
        sh = Math.round(canvas.width / dstAspect);
        sy = Math.floor((canvas.height - sh) / 2);
      }
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
    return { canvas: out, cropped };
  }

  /**
   * Opaque PNG frame — same transactional path as still Export Image (OfflineCaptureSession).
   * Renders at viewport backing-store pixels (still PNG path), then downscales to video preset.
   * Forcing 1920×1080 GL resize from Ultra leaves partial viewports in bloom/AO buffers.
   * @param {object} frameParams — `_applyVideoExportFrame` args
   * @param {{ exportWidth?: number, exportHeight?: number }} [opts]
   * @returns {Promise<{ blob: Blob, width: number, height: number, cropped: boolean }>}
   */
  async _captureOpaqueFrameViaOfflineSession(frameParams, { exportWidth, exportHeight } = {}) {
    const imageExporter = this.imageExporter;
    if (!imageExporter?._captureSessionDeps) {
      this._syncExportCaptureFramebuffer();
      this._applyVideoExportFrame(frameParams);
      return this._captureCurrentFramePngBlob({ exportWidth, exportHeight });
    }

    const outputWidth = Math.max(
      1,
      Math.round(exportWidth ?? this._exportCaptureSize?.width ?? 1),
    );
    const outputHeight = Math.max(
      1,
      Math.round(exportHeight ?? this._exportCaptureSize?.height ?? 1),
    );
    const cinematicLetterbox219 = this._resolveCinematicLetterbox219();

    const renderCaptureSize = resolvePngExportCaptureSize(
      this.renderer,
      1,
      imageExporter._maxExportPixelArea,
    );

    return runOfflineCaptureSession(imageExporter._captureSessionDeps(), async (session) => {
      const synced = session.applyCaptureSize(renderCaptureSize);
      const renderW = synced.width;
      const renderH = synced.height;

      this._applyVideoExportFrame(frameParams);
      session.renderFrame({ transparent: false });

      const gl = this.renderer.getContext();
      if (gl && typeof gl.finish === 'function') {
        gl.finish();
      }

      let canvas = imageExporter._captureComposerOutputAsCanvas(renderW, renderH, {
        cinematicLetterbox219,
        retryRender: () => {
          this._applyVideoExportFrame(frameParams);
          session.renderFrame({ transparent: false });
          if (gl && typeof gl.finish === 'function') {
            gl.finish();
          }
        },
      });
      if (!canvas) {
        throw new Error('Video export frame capture failed');
      }

      const { canvas: outputCanvas, cropped } = this._downscaleCaptureCanvasToVideoExport(
        canvas,
        outputWidth,
        outputHeight,
      );

      const blob = await new Promise((resolve, reject) => {
        outputCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))),
          'image/png',
        );
      });
      return {
        blob,
        width: outputWidth,
        height: outputHeight,
        cropped,
      };
    });
  }

  /**
   * @returns {{ blob: Blob, width: number, height: number, cropped: boolean }}
   */
  _captureCurrentFramePngBlob({
    transparent = false,
    exportWidth,
    exportHeight,
    transparentFraming = 'crop',
  } = {}) {
    const { width: targetWidth, height: targetHeight } =
      this._resolveExportCapturePixelSize(exportWidth, exportHeight);
    if (transparent) {
      const cropToAsset = isTransparentCropToAsset(transparentFraming);
      const { dataUrl, width, height } = this._captureTransparentFramePngDataUrl(
        exportWidth,
        exportHeight,
        transparentFraming,
      );
      return {
        blob: this._dataUrlToBlob(dataUrl),
        width,
        height,
        cropped: cropToAsset,
      };
    }
    const dataUrl = this._renderAndCaptureCurrentFramePng(exportWidth, exportHeight);
    return {
      blob: this._dataUrlToBlob(dataUrl),
      width: targetWidth,
      height: targetHeight,
      cropped: false,
    };
  }

  /** Keep the GL backing store locked to the export preset (not viewport × DPR). */
  _syncExportCaptureFramebuffer() {
    const size = this._exportCaptureSize;
    if (!size?.width || !size?.height) return;
    forceExportCaptureFramebuffer(
      {
        renderer: this.renderer,
        composer: this.composer,
        syncPostProcessingForLogicalSize: this.syncPostProcessingForLogicalSize,
        ensureComposerBuffersMatchRenderer: this.ensureComposerBuffersMatchRenderer,
      },
      size.width,
      size.height,
    );
    this.imageExporter?._ensureComposerMatchesDrawingBuffer?.({ strict: true });
    this.ensureComposerBuffersMatchRenderer?.();
  }

  _resolveExportCapturePixelSize(exportWidth, exportHeight) {
    const fromSettings = this._exportCaptureSize;
    const width = Math.max(
      1,
      Math.round(exportWidth ?? fromSettings?.width ?? 1),
    );
    const height = Math.max(
      1,
      Math.round(exportHeight ?? fromSettings?.height ?? 1),
    );
    return { width, height };
  }

  /**
   * Offline frame render — matches still PNG export (composer pass + viewport repair).
   * @param {{ transparent?: boolean }} [opts]
   */
  _renderComposerFrameForCapture({
    transparent = false,
    exportWidth,
    exportHeight,
  } = {}) {
    const { width: targetWidth, height: targetHeight } =
      this._resolveExportCapturePixelSize(exportWidth, exportHeight);

    renderFrameForCaptureWithPins({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      composer: this.composer,
      imageExporter: this.imageExporter,
      postPipeline: this.imageExporter?.postPipeline,
      renderComposerPassForExport: this.renderComposerPassForExport,
      backgroundController: this.backgroundController,
      environmentController: this.environmentController,
      captureFeatureSession: this._captureFeatureSession ?? undefined,
      creativeLookCaptureDeps: this.creativeLookCaptureDeps,
      width: targetWidth,
      height: targetHeight,
      transparent,
    });
  }

  _finishGpuFrame() {
    const gl = this.renderer?.getContext?.();
    if (gl && typeof gl.finish === 'function') {
      gl.finish();
    }
  }

  /**
   * Present the current export frame on `renderer.domElement` for MediaRecorder.captureStream.
   * PNG sequence uses {@link _renderComposerFrameForCapture} (composer RT readback) instead.
   */
  _renderCurrentFrameToCanvas() {
    this._syncExportCaptureFramebuffer();

    const size = this._exportCaptureSize;
    if (this._captureFeatureSession && size?.width && size?.height) {
      this._captureFeatureSession.prepareFrame({
        width: size.width,
        height: size.height,
        transparent: false,
      });
    }

    if (typeof this.renderComposerPassForExport === 'function') {
      this.renderComposerPassForExport({ transparent: false });
    } else if (this.composerLifecycle?.renderVideoPreviewPass) {
      this.beforeComposerRender?.();
      this.composerLifecycle.renderVideoPreviewPass();
    } else if (this.composer) {
      this.beforeComposerRender?.();
      this.composer.render();
    }
    // MediaRecorder samples the GL drawing buffer, so paint mattes into GL (not a 2D overlay).
    if (this._resolveCinematicLetterbox219()) {
      fillCinematicLetterbox219MattesGl(this.renderer);
    }
    this._finishGpuFrame();
  }

  /** True when the studio 21∶9 cinematic letterbox overlay is enabled (export should bake it in). */
  _resolveCinematicLetterbox219() {
    return this.stateStore?.getState?.()?.camera?.cinematicLetterbox219 === true;
  }

  _renderAndCaptureCurrentFramePng(exportWidth, exportHeight) {
    const { width: targetWidth, height: targetHeight } =
      this._resolveExportCapturePixelSize(exportWidth, exportHeight);
    const cinematicLetterbox219 = this._resolveCinematicLetterbox219();

    this._renderComposerFrameForCapture({
      exportWidth: targetWidth,
      exportHeight: targetHeight,
    });
    this._finishGpuFrame();

    return this.imageExporter._captureComposerOutputAsPngDataUrl(
      targetWidth,
      targetHeight,
      {
        cinematicLetterbox219,
        retryRender: () => {
          this._renderComposerFrameForCapture({
            exportWidth: targetWidth,
            exportHeight: targetHeight,
          });
          this._finishGpuFrame();
        },
      },
    );
  }

  /**
   * @returns {{ dataUrl: string, width: number, height: number }}
   */
  _captureTransparentFramePngDataUrl(exportWidth, exportHeight, framing = 'crop') {
    const { width: targetWidth, height: targetHeight } =
      this._resolveExportCapturePixelSize(exportWidth, exportHeight);
    const cropToAsset = isTransparentCropToAsset(framing);

    if (!this.composer) {
      this._renderComposerFrameForCapture({
        transparent: true,
        exportWidth: targetWidth,
        exportHeight: targetHeight,
      });
      return {
        dataUrl: this.renderer.domElement.toDataURL('image/png'),
        width: targetWidth,
        height: targetHeight,
      };
    }

    const topDown = readTransparentMergedTopDownRgba({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      composer: this.composer,
      width: targetWidth,
      height: targetHeight,
      renderFrame: () => {
        this._renderComposerFrameForCapture({
          transparent: true,
          exportWidth: targetWidth,
          exportHeight: targetHeight,
        });
      },
      finishGpu: () => this._finishGpuFrame(),
    });

    const exportCanvas = cropToAsset
      ? cropTransparentTopDownRgbaToCanvas(topDown, targetWidth, targetHeight)
      : topDownRgbaToCanvas(topDown, targetWidth, targetHeight);
    return {
      dataUrl: exportCanvas.toDataURL('image/png'),
      width: exportCanvas.width,
      height: exportCanvas.height,
    };
  }

  _getMp4BitrateForQuality(quality) {
    if (quality === 'low') return 4_000_000;
    if (quality === 'high') return 16_000_000;
    return 8_000_000;
  }

  _getVideoResolutionSize(resolutionKey, aspectRatio = '16:9') {
    return getExportVideoResolutionSize(resolutionKey, aspectRatio);
  }

  _applyTransparentFrameSetup() {
    const originalBackgroundSphereVisible =
      this.backgroundController?.getBackgroundSphere?.()?.visible ?? null;
    const originalPassClearAlpha = [];
    if (this.composer?.passes?.length) {
      for (const pass of this.composer.passes) {
        if (pass && Object.prototype.hasOwnProperty.call(pass, 'clearAlpha')) {
          originalPassClearAlpha.push({ pass, clearAlpha: pass.clearAlpha });
          pass.clearAlpha = 0;
        }
      }
    }

    const backgroundSphere = this.backgroundController?.getBackgroundSphere?.();
    if (backgroundSphere) {
      backgroundSphere.visible = false;
    }
    this.scene.background = null;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setClearAlpha(0);

    return { originalBackgroundSphereVisible, originalPassClearAlpha };
  }

  _restoreTransparentFrameSetup(snapshot) {
    if (!snapshot) return;
    const backgroundSphere = this.backgroundController?.getBackgroundSphere?.();
    if (backgroundSphere && snapshot.originalBackgroundSphereVisible !== null) {
      backgroundSphere.visible = snapshot.originalBackgroundSphereVisible;
    }
    for (const entry of snapshot.originalPassClearAlpha || []) {
      if (entry?.pass) entry.pass.clearAlpha = entry.clearAlpha;
    }
  }

  _applyVideoExportSize(width, height, aspectRatio = '16:9') {
    const previousSize = new THREE.Vector2();
    this.renderer.getSize(previousSize);
    const previousPixelRatio = this.renderer.getPixelRatio();
    const previousAspect = this.camera.aspect;

    const synced = this.imageExporter?._setExportFramebufferSize
      ? this.imageExporter._setExportFramebufferSize(width, height)
      : (() => {
          this.renderer.setPixelRatio(1);
          this.renderer.setSize(width, height, false);
          return { width, height };
        })();

    const exportFovScale = this.imageExporter?.isLensDistortionActive?.() ? 1.06 : 1;
    const newAspect = synced.width / Math.max(1e-6, synced.height);
    const state = this.stateStore?.getState?.();
    const lensDistortionActive = this.imageExporter?.isLensDistortionActive?.() === true;
    const fisheyeActive = !!state?.fisheye?.enabled;
    const portraitExport = isPortraitExportVideoAspect(aspectRatio);

    this.syncPerspectiveProjection?.({ fovScale: exportFovScale });

    if (
      !fisheyeActive
      && !lensDistortionActive
      && Math.abs(previousAspect - newAspect) > 1e-4
    ) {
      const baseVfov = state?.camera?.fov ?? this.camera?.fov ?? 45;
      if (portraitExport && previousAspect < newAspect) {
        // Rare tall viewport: preserve horizontal FOV (crop top/bottom).
        const adjusted = verticalFovForAspectPreservingHorizontalFov(
          baseVfov,
          previousAspect,
          newAspect,
        );
        this.camera.fov = adjusted * exportFovScale;
        this.camera.updateProjectionMatrix();
      } else if (!portraitExport && previousAspect > newAspect) {
        // Wide studio viewport — preserve horizontal FOV when reframing to 16∶9.
        const adjusted = verticalFovForAspectPreservingHorizontalFov(
          baseVfov,
          previousAspect,
          newAspect,
        );
        this.camera.fov = adjusted * exportFovScale;
        this.camera.updateProjectionMatrix();
      }
      // Narrower/taller viewport → keep vertical FOV (matches live preview; 16∶9 adds horizontal extent).
      // 9∶16 center crop — keep vertical FOV (no adjustment on typical wide viewports).
    }

    // Dust Field point sprites use absolute framebuffer pixels — keep their on-screen fraction
    // stable by scaling for the export vs viewport framebuffer height (see MaterialController setter).
    const viewportFbHeight = Math.max(1, previousSize.y * previousPixelRatio);
    this.setDustFieldCaptureScale?.(synced.height / viewportFbHeight);

    return {
      previousSize,
      previousPixelRatio,
      previousAspect,
      exportWidth: synced.width,
      exportHeight: synced.height,
    };
  }

  _restoreVideoExportSize(snapshot) {
    if (!snapshot) return;
    this.setDustFieldCaptureScale?.(1);
    coerceRendererLogicalSize(
      this.renderer,
      snapshot.previousSize.x,
      snapshot.previousSize.y,
      snapshot.previousPixelRatio,
    );
    this.camera.aspect = snapshot.previousAspect;
    this.camera.updateProjectionMatrix();
    this.syncPostProcessingForLogicalSize?.(
      snapshot.previousSize.x,
      snapshot.previousSize.y,
    );
    this.syncPerspectiveProjection?.();
  }

  /** Repair GL viewport / composer RT size after offline capture (passes may leave partial viewport). */
  _repairViewportAfterExport(sizeSnapshot = null) {
    if (sizeSnapshot?.previousSize) {
      repairInteractiveViewportAfterCapture({
        renderer: this.renderer,
        composer: this.composer,
        logicalWidth: sizeSnapshot.previousSize.x,
        logicalHeight: sizeSnapshot.previousSize.y,
        pixelRatio: sizeSnapshot.previousPixelRatio,
        syncPostProcessingForLogicalSize: this.syncPostProcessingForLogicalSize,
        ensureComposerBuffersMatchRenderer: this.ensureComposerBuffersMatchRenderer,
        backgroundController: this.backgroundController,
      });
      return;
    }
    this.composer?.clearExportCaptureViewportPin?.();
    this.ensureComposerBuffersMatchRenderer?.();
    this.resetRendererViewportToCanvas?.();
    this.backgroundController?.gradientController?.restoreAfterCapture?.();
    this.resetRendererViewportToCanvas?.();
  }

  _getSupportedRecorderMimeType() {
    if (typeof MediaRecorder === 'undefined') return null;
    const mp4Candidates = [
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4;codecs=avc1',
      'video/mp4',
    ];
    for (const mimeType of mp4Candidates) {
      try {
        if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
      } catch (error) {
        // Try next.
      }
    }
    return null;
  }

  /** Yield until the canvas has painted (helps first MediaRecorder frames match WebGL). */
  async _yieldUntilPaintCommitted() {
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  /**
   * @returns {Promise<Blob | null>}
   */
  async _recordTurntableToMp4Blob({
    durationSec,
    cameraMovementDurationSec,
    fps,
    startRotationY,
    startLightsRotation,
    startHdriRotation,
    lightsAutoRotate,
    quality = 'medium',
    objectSpinSettings,
    cameraSpinSettings,
    hdriRotationSettings,
    movements,
    movementEasing,
    meshAnimation,
  }) {
    const mimeType = this._getSupportedRecorderMimeType();
    if (!mimeType) return null;

    const frameDurationMs = 1000 / Math.max(1, fps);
    const totalFrames = Math.max(2, Math.round(durationSec * fps));
    const stream = this.renderer.domElement.captureStream(0);
    const track = stream.getVideoTracks?.()[0] || null;
    const canRequestFrame = !!(track && typeof track.requestFrame === 'function');
    if (!canRequestFrame) {
      stream.getTracks().forEach((t) => t.stop());
      return this._recordTurntableToMp4BlobLegacy({
        durationSec,
        cameraMovementDurationSec,
        fps,
        startRotationY,
        startLightsRotation,
        startHdriRotation,
        lightsAutoRotate,
        quality,
        objectSpinSettings,
    cameraSpinSettings,
        hdriRotationSettings,
        movements,
        movementEasing,
        meshAnimation,
      });
    }

    const chunks = [];
    const bitrate = this._getMp4BitrateForQuality(quality);
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: bitrate,
    });
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    const stopPromise = new Promise((resolve) => {
      recorder.onstop = resolve;
    });

    // Prime frame 0 and wait until the canvas reflects it — avoids garbage lead-in frames
    // after recorder.start().
    this._applyVideoExportFrame({
      movements,
      t: 0,
      movementEasing,
      objectSpinSettings,
    cameraSpinSettings,
      hdriRotationSettings,
      startRotationY,
      startLightsRotation,
      startHdriRotation,
      lightsAutoRotate,
      durationSec,
      cameraMovementDurationSec,
      frameIndex: 0,
      fps,
      meshAnimation,
    });
    this._renderCurrentFrameToCanvas();
    await this._yieldUntilPaintCommitted();
    this.ui?.setLoadSpinnerElapsedFromStart?.();

    const timesliceMs = Math.min(
      1000,
      Math.max(20, Math.min(250, Math.floor(frameDurationMs))),
    );
    recorder.start(timesliceMs);

    // Same discrete angles as PNG export: i = 0 … totalFrames-1.
    const startedAt = performance.now();
    for (let i = 0; i < totalFrames; i += 1) {
      const targetAt = startedAt + i * frameDurationMs;
      const delay = targetAt - performance.now();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const t = this._cameraMovementLinearT(i, fps, cameraMovementDurationSec);
      this._applyVideoExportFrame({
        movements,
        t,
        movementEasing,
        objectSpinSettings,
    cameraSpinSettings,
        hdriRotationSettings,
        startRotationY,
        startLightsRotation,
        startHdriRotation,
        lightsAutoRotate,
        durationSec,
        cameraMovementDurationSec,
        frameIndex: i,
        fps,
        meshAnimation,
      });
      this._renderCurrentFrameToCanvas();
      track.requestFrame();
      this.ui?.setLoadSpinnerElapsedFromStart?.();
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(33, Math.round(frameDurationMs * 2.5))),
    );
    if (recorder.state === 'recording') recorder.stop();
    await stopPromise;
    stream.getTracks().forEach((t) => t.stop());
    if (!chunks.length) return null;
    return new Blob(chunks, { type: mimeType });
  }

  /** @returns {Promise<Blob | null>} */
  async _recordTurntableToMp4BlobLegacy({
    durationSec,
    cameraMovementDurationSec,
    fps,
    startRotationY,
    startLightsRotation,
    startHdriRotation,
    lightsAutoRotate,
    quality = 'medium',
    objectSpinSettings,
    cameraSpinSettings,
    hdriRotationSettings,
    movements,
    movementEasing,
    meshAnimation,
  }) {
    const mimeType = this._getSupportedRecorderMimeType();
    if (!mimeType) return null;
    const stream = this.renderer.domElement.captureStream(fps);
    const chunks = [];
    const bitrate = this._getMp4BitrateForQuality(quality);
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: bitrate,
    });
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    const stopPromise = new Promise((resolve) => {
      recorder.onstop = resolve;
    });
    const totalFrames = Math.max(2, Math.round(durationSec * fps));
    const frameDurationMs = 1000 / Math.max(1, fps);

    this._applyVideoExportFrame({
      movements,
      t: 0,
      movementEasing,
      objectSpinSettings,
    cameraSpinSettings,
      hdriRotationSettings,
      startRotationY,
      startLightsRotation,
      startHdriRotation,
      lightsAutoRotate,
      durationSec,
      cameraMovementDurationSec,
      frameIndex: 0,
      fps,
      meshAnimation,
    });
    this._renderCurrentFrameToCanvas();
    await this._yieldUntilPaintCommitted();
    this.ui?.setLoadSpinnerElapsedFromStart?.();

    const timesliceMs = Math.min(
      1000,
      Math.max(20, Math.min(250, Math.floor(frameDurationMs))),
    );
    recorder.start(timesliceMs);

    // Discrete schedule matches PNG; captureStream(fps) samples Canvas on this cadence.
    const startedAt = performance.now();
    for (let i = 0; i < totalFrames; i += 1) {
      const targetAt = startedAt + i * frameDurationMs;
      const delay = targetAt - performance.now();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const t = this._cameraMovementLinearT(i, fps, cameraMovementDurationSec);
      this._applyVideoExportFrame({
        movements,
        t,
        movementEasing,
        objectSpinSettings,
    cameraSpinSettings,
        hdriRotationSettings,
        startRotationY,
        startLightsRotation,
        startHdriRotation,
        lightsAutoRotate,
        durationSec,
        cameraMovementDurationSec,
        frameIndex: i,
        fps,
        meshAnimation,
      });
      this._renderCurrentFrameToCanvas();
      this.ui?.setLoadSpinnerElapsedFromStart?.();
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(33, Math.round(frameDurationMs * 2.5))),
    );
    if (recorder.state === 'recording') recorder.stop();
    await stopPromise;
    stream.getTracks().forEach((t) => t.stop());
    if (!chunks.length) return null;
    return new Blob(chunks, { type: mimeType });
  }

  async _exportTurntableRealtimeRecorder(opts) {
    const blob = await this._recordTurntableToMp4Blob(opts);
    if (!blob) return false;
    const safeBase = (opts.baseName || 'orby').replace(/\.[a-z0-9]+$/i, '');
    const { durationSec, fps } = opts;
    const modeLabel = exportVideoMovementLabel(opts.movements);
    this._downloadBlob(
      blob,
      `${safeBase}_${modeLabel}_${durationSec}s_${fps}fps.mp4`,
    );
    return true;
  }

  /**
   * Render one offline frame at video export resolution (same path as PNG sequence encode).
   * Frame 0 uses identical capture to still PNG at matching tier + resolution + aspect.
   *
   * @param {object} settings — video export UI settings
   * @param {{ download?: boolean, previewT?: number, previewFrameIndex?: number, showThumbnail?: boolean }} [opts]
   * @returns {Promise<{ blob: Blob, dataUrl: string, frameIndex: number, width: number, height: number, cropped: boolean, transparent: boolean } | null>}
   */
  async capturePreviewFrame(settings = {}, opts = {}) {
    const params = this._resolveVideoExportParams(settings);
    if (!params) {
      this.ui?.showToast?.('Load a mesh and enable at least one movement');
      return null;
    }

    const {
      movements,
      hdriRotationSettings,
      modeLabel,
      meshAnimation,
      durationSec,
      fps,
      totalFrames,
      objectSpinSettings,
    cameraSpinSettings,
      resolution,
      aspectRatio,
      outputSize,
      baseName,
      startRotationY,
      startLightsRotation,
      startHdriRotation,
      lightsAutoRotate,
      movementEasing,
      cameraMovementDurationSec,
    } = params;

    const timing = resolveVideoExportFrameTiming(totalFrames, {
      previewT: Number.isFinite(opts.previewT) ? opts.previewT : undefined,
      previewFrameIndex: Number.isFinite(opts.previewFrameIndex)
        ? opts.previewFrameIndex
        : undefined,
    });
    timing.fps = fps;
    timing.durationSec = durationSec;

    let revealPreviewAdjusted = false;
    const requestedPreviewFrameIndex = timing.frameIndex;
    if (
      opts.showThumbnail
      && !Number.isFinite(opts.previewFrameIndex)
      && typeof this.findFirstVisibleRevealExportFrameIndex === 'function'
    ) {
      const adjustedFrameIndex = this.findFirstVisibleRevealExportFrameIndex(
        timing.frameIndex,
        totalFrames,
        fps,
      );
      if (adjustedFrameIndex !== timing.frameIndex) {
        timing.frameIndex = adjustedFrameIndex;
        timing.t = adjustedFrameIndex / Math.max(1, totalFrames - 1);
        revealPreviewAdjusted = true;
      }
    }

    const exportTimeSec = resolveExportTimeSecFromFrame(timing.frameIndex, fps);
    const cameraLinearT = resolveExportCameraMovementLinearT(
      exportTimeSec,
      cameraMovementDurationSec,
    );

    const format = settings?.format === 'png' ? 'png' : 'mp4';
    const shouldUseTransparentFrames = format === 'png' && !!settings?.movTransparent;
    const wasBackgroundEnabled = !!this.getHdriBackgroundEnabled?.();
    const originalBackground = this.scene.background;
    const originalClearAlpha = this.renderer.getClearAlpha();
    const originalClearColor = this.renderer.getClearColor(new THREE.Color()).clone();
    let transparentSetupSnapshot = null;

    const resolutionLabel = getExportVideoResolutionPixelLabel(resolution, aspectRatio);
    const usePersistentExportSize = shouldUseTransparentFrames;
    const sizeSnapshot = usePersistentExportSize
      ? this._applyVideoExportSize(
          outputSize.width,
          outputSize.height,
          aspectRatio,
        )
      : this._videoExportSizeSnapshot(outputSize.width, outputSize.height);
    this._exportCaptureSize = {
      width: sizeSnapshot.exportWidth,
      height: sizeSnapshot.exportHeight,
    };
    if (usePersistentExportSize) {
      this._startVideoCaptureFeatureSession(sizeSnapshot.previousSize);
    }

    const exportSession = {
      movements,
      movementEasing,
      objectSpinSettings,
    cameraSpinSettings,
      hdriRotationSettings,
      startRotationY,
      startLightsRotation,
      startHdriRotation,
      lightsAutoRotate,
      durationSec,
      fps,
      meshAnimation,
      cameraMovementDurationSec,
      sizeSnapshot,
    };

    let blob = null;
    let outputWidth = sizeSnapshot.exportWidth;
    let outputHeight = sizeSnapshot.exportHeight;
    let outputCropped = false;
    try {
      if (shouldUseTransparentFrames) {
        transparentSetupSnapshot = this._applyTransparentFrameSetup();
      }
      this._beginExportSession({ movements, meshAnimation });
      const frameCapture = await captureVideoExportFrameBlob(
        this,
        {
          movements,
          t: cameraLinearT,
          movementEasing,
          objectSpinSettings,
    cameraSpinSettings,
          hdriRotationSettings,
          startRotationY,
          startLightsRotation,
          startHdriRotation,
          lightsAutoRotate,
          durationSec,
          cameraMovementDurationSec,
          frameIndex: timing.frameIndex,
          fps,
          meshAnimation,
        },
        {
          transparent: shouldUseTransparentFrames,
          exportWidth: sizeSnapshot.exportWidth,
          exportHeight: sizeSnapshot.exportHeight,
          transparentFraming: settings?.transparentFraming,
        },
      );
      blob = frameCapture.blob;
      outputWidth = frameCapture.width;
      outputHeight = frameCapture.height;
      outputCropped = frameCapture.cropped;
    } finally {
      this._finishExportSession(
        exportSession,
        shouldUseTransparentFrames
          ? {
              originalBackground,
              originalClearColor,
              originalClearAlpha,
              transparentSetupSnapshot,
              wasBackgroundEnabled,
            }
          : null,
      );
    }

    const download = opts.download !== false;
    let previewDataUrl = null;
    if (opts.showThumbnail) {
      previewDataUrl = URL.createObjectURL(blob);
      this.ui?.showExportCapturePreviewThumb?.(previewDataUrl, {
        width: outputWidth,
        height: outputHeight,
        frameIndex: timing.frameIndex,
        totalFrames,
        transparent: shouldUseTransparentFrames,
        cropped: outputCropped,
      });
    }

    if (download) {
      this._downloadBlob(
        blob,
        this._previewFrameFileName(
          baseName,
          modeLabel,
          resolutionLabel,
          timing.frameIndex,
        ),
      );
      this.ui?.uiSounds?.playRenderFinished?.();
      const sizeNote = outputCropped
        ? `~${outputWidth}×${outputHeight} cropped`
        : `${outputWidth}×${outputHeight}`;
      const alphaNote = shouldUseTransparentFrames ? ', transparent' : '';
      this.ui?.showToast?.(
        `Capture preview saved (${sizeNote}${alphaNote}, frame ${timing.frameIndex + 1}/${totalFrames})`,
        3600,
        { notification: false },
      );
    } else if (revealPreviewAdjusted) {
      this.ui?.showToast?.(
        `Text reveal hasn't started at frame ${requestedPreviewFrameIndex + 1} — preview shows frame ${timing.frameIndex + 1}/${totalFrames}`,
        4200,
        { notification: false },
      );
    }

    return {
      blob,
      dataUrl: previewDataUrl,
      frameIndex: timing.frameIndex,
      width: outputWidth,
      height: outputHeight,
      cropped: outputCropped,
      transparent: shouldUseTransparentFrames,
    };
  }

  async exportVideo(settings = {}) {
    this._exportCancelRequested = false;
    const params = this._resolveVideoExportParams(settings);
    if (!params) {
      if (!this.getCurrentModel?.()) {
        this.ui?.showToast?.('Load a mesh before exporting video');
      } else {
        this.ui?.showToast?.('Enable at least one movement to export');
      }
      return;
    }

    const {
      movements,
      hdriRotationSettings,
      modeLabel,
      meshAnimation,
      durationSec,
      fps,
      totalFrames,
      objectSpinSettings,
    cameraSpinSettings,
      resolution,
      aspectRatio,
      outputSize,
      baseName,
      startRotationY,
      startLightsRotation,
      startHdriRotation,
      lightsAutoRotate,
      movementEasing,
      cameraMovementDurationSec,
    } = params;

    const format = settings?.format === 'png' ? 'png' : 'mp4';

    const mp4Quality =
      settings?.mp4Quality === 'low' || settings?.mp4Quality === 'high'
        ? settings.mp4Quality
        : 'medium';
    const movTransparent = !!settings?.movTransparent;

    const wasBackgroundEnabled = !!this.getHdriBackgroundEnabled?.();
    const originalBackground = this.scene.background;
    const originalClearAlpha = this.renderer.getClearAlpha();
    const originalClearColor = this.renderer.getClearColor(new THREE.Color()).clone();
    const shouldUseTransparentFrames = format === 'png' && movTransparent;
    const resolutionLabel = getExportVideoResolutionPixelLabel(resolution, aspectRatio);
    if (resolution === '2160p' && (fps >= 60 || mp4Quality === 'high')) {
      this.ui?.showToast?.(
        '4K export is heavy on this browser/GPU and may use fallback encoding',
      );
    }
    const isOfflinePngSequence = format === 'png';
    if (isOfflinePngSequence) {
      const sequenceFolderName = this._sequenceFolderName(
        baseName,
        durationSec,
        fps,
        objectSpinSettings,
    cameraSpinSettings,
        resolution,
        modeLabel,
        aspectRatio,
      );
      const state = this.stateStore?.getState?.() ?? {};
      const summary = buildOfflineExportOverlaySummary({
        exportJob: {
          ...settings,
          resolution,
          aspectRatio,
          durationSec,
          fps,
          movTransparent: shouldUseTransparentFrames,
          clipCount: meshAnimation.clipCount,
          pngOutputDirectoryHandle: settings?.pngOutputDirectoryHandle ?? null,
        },
        assetName: baseName,
        animationClipLabel: meshAnimation.include
          ? this.getAnimationClipLabel?.(meshAnimation.clipIndex)
          : null,
        renderContext: {
          sequenceFolderName,
          zipFileName: `${sequenceFolderName}.zip`,
          outputDirectoryName: settings?.pngOutputDirectoryHandle?.name ?? null,
          useFolderExport: !!settings?.pngOutputDirectoryHandle,
          creativeLookEnabled: !!state.creativeLook?.enabled,
          creativeLookPreset: state.creativeLook?.preset ?? null,
          lightsAutoRotate: !!state.lightsAutoRotate,
          fisheyeEnabled: !!state.fisheye?.enabled,
          lensDistortionActive: this.imageExporter?.isLensDistortionActive?.() === true,
          postFxState: state,
          fontTextRevealLabel: this.getFontTextRevealExportLabel?.() ?? null,
          exportWidth: outputSize.width,
          exportHeight: outputSize.height,
          totalFrames,
        },
      });
      this.ui?.showOfflineExportOverlay?.(summary, {
        cancellable: true,
        onCancelExport: () => this.requestCancelExport(),
        assetFilename: baseName,
      });
      this.ui?.updateOfflineExportOverlayProgress?.({ frameIndex: 0, totalFrames });
      await this._yieldUntilPaintCommitted();
    }
    const usePersistentExportSize = format === 'mp4' || shouldUseTransparentFrames;
    const sizeSnapshot = usePersistentExportSize
      ? this._applyVideoExportSize(
          outputSize.width,
          outputSize.height,
          aspectRatio,
        )
      : this._videoExportSizeSnapshot(outputSize.width, outputSize.height);
    this._exportCaptureSize = {
      width: sizeSnapshot.exportWidth,
      height: sizeSnapshot.exportHeight,
    };
    if (usePersistentExportSize) {
      this._startVideoCaptureFeatureSession(sizeSnapshot.previousSize);
    }
    const exportSession = {
      movements,
      movementEasing,
      objectSpinSettings,
    cameraSpinSettings,
      hdriRotationSettings,
      startRotationY,
      startLightsRotation,
      startHdriRotation,
      lightsAutoRotate,
      durationSec,
      fps,
      meshAnimation,
      cameraMovementDurationSec,
      sizeSnapshot,
    };
    let spinnerActive = false;
    let pngSequenceCancelled = false;
    if (!isOfflinePngSequence && typeof this.ui?.beginLoadSpinner === 'function') {
      this.ui.beginLoadSpinner();
      spinnerActive = true;
      this.ui.beginLoadSpinnerElapsed?.();
    }

    try {
      this._beginExportSession({ movements, meshAnimation });

      if (format === 'mp4') {
        const hdriLabel = exportHdriRotationToastLabel(hdriRotationSettings);
        const spinParts = [];
        if (objectSpinSettings?.rotationDegrees) {
          spinParts.push(`Object ${exportSpinToastLabel(objectSpinSettings)}`);
        }
        if (cameraSpinSettings?.rotationDegrees) {
          spinParts.push(`Camera ${exportSpinToastLabel(cameraSpinSettings)}`);
        }
        const spinSummary = spinParts.length ? spinParts.join('; ') : 'no spin';
        const motionSummary = hdriLabel
          ? `${spinSummary}; ${hdriLabel}`
          : spinSummary;
        this.ui?.showToast?.(
          `Recording MP4 (${durationSec}s, ${fps}fps, ${resolutionLabel}, ${mp4Quality}, ${modeLabel}, ${motionSummary})…`,
        );
        try {
          const success = await this._exportTurntableRealtimeRecorder({
            durationSec,
            cameraMovementDurationSec,
            fps,
            startRotationY,
            startLightsRotation,
            startHdriRotation,
            lightsAutoRotate,
            baseName,
            quality: mp4Quality,
            objectSpinSettings,
    cameraSpinSettings,
            hdriRotationSettings,
            movements,
            movementEasing,
            meshAnimation,
          });
          if (success) {
            this.ui?.uiSounds?.playRenderFinished();
            this.ui?.showToast?.('MP4 exported', 3200, { notification: false });
          }
          else this.ui?.showToast?.('MP4 export failed');
        } catch (error) {
          console.error('MP4 export failed', error);
          this.ui?.showToast?.('MP4 export failed');
        } finally {
          this._finishExportSession(exportSession);
        }
        return;
      }

      this.ui?.showToast?.(`Rendering ${totalFrames} frames…`);
      let transparentSetupSnapshot = null;
      let sequenceDirHandle = null;
      let sequenceFolderLabel = null;
      let useFolderExport = false;
      try {
        if (shouldUseTransparentFrames) {
          transparentSetupSnapshot = this._applyTransparentFrameSetup();
        }

        const outputDirectoryHandle = settings?.pngOutputDirectoryHandle ?? null;
        if (outputDirectoryHandle) {
          const permitted = await this._ensureDirectoryWritePermission(outputDirectoryHandle);
          if (permitted) {
            const prepared = await this._preparePngSequenceOutputFolder({
              parentHandle: outputDirectoryHandle,
              baseName,
              durationSec,
              fps,
              objectSpinSettings,
    cameraSpinSettings,
              resolution,
              mode: modeLabel,
              aspectRatio,
            });
            sequenceDirHandle = prepared.sequenceDirHandle;
            sequenceFolderLabel = `${outputDirectoryHandle.name}/${prepared.folderName}`;
            useFolderExport = true;
          } else {
            this.ui?.showToast?.('Folder access denied — exporting as ZIP instead');
          }
        }

        const bufferedFiles = [];
        let exportCancelled = false;
        let framesWritten = 0;
        for (let i = 0; i < totalFrames; i += 1) {
          if (this._exportCancelRequested) {
            exportCancelled = true;
            break;
          }
          const t = this._cameraMovementLinearT(i, fps, cameraMovementDurationSec);
          const { blob } = await captureVideoExportFrameBlob(
            this,
            {
              movements,
              t,
              movementEasing,
              objectSpinSettings,
    cameraSpinSettings,
              hdriRotationSettings,
              startRotationY,
              startLightsRotation,
              startHdriRotation,
              lightsAutoRotate,
              durationSec,
              cameraMovementDurationSec,
              frameIndex: i,
              fps,
              meshAnimation,
            },
            {
              transparent: shouldUseTransparentFrames,
              exportWidth: this._exportCaptureSize?.width,
              exportHeight: this._exportCaptureSize?.height,
              transparentFraming: settings?.transparentFraming,
            },
          );
          const fileName = this._frameNameForSequence(baseName, modeLabel, durationSec, i);
          this.ui?.setOfflineExportPreviewFrame?.(blob);
          if (useFolderExport && sequenceDirHandle) {
            await this._writeBlobToDirectory(sequenceDirHandle, fileName, blob);
            framesWritten += 1;
          } else {
            bufferedFiles.push({ fileName, blob });
          }
          this.ui?.updateOfflineExportOverlayProgress?.({
            frameIndex: i + 1,
            totalFrames,
          });
          this.ui?.setOfflineExportElapsedFromStart?.();
          await this._yieldUntilPaintCommitted();
        }

        if (exportCancelled) {
          pngSequenceCancelled = true;
          this.ui?.setOfflineExportOverlayCancelled?.();
          this.ui?.showToast?.('PNG export cancelled', 3200, { notification: false });
        } else if (useFolderExport && framesWritten > 0) {
          this.ui?.uiSounds?.playRenderFinished();
          this.ui?.showToast?.(
            `PNG sequence saved (${framesWritten} frames) → ${sequenceFolderLabel}`,
            4200,
            { notification: false },
          );
        } else if (bufferedFiles.length > 0) {
          const zipped = await this._downloadSequenceAsZip({
            files: bufferedFiles,
            baseName,
            durationSec,
            fps,
            objectSpinSettings,
    cameraSpinSettings,
            resolution,
            mode: modeLabel,
            aspectRatio,
          });
          if (!zipped) {
            // Last-resort fallback if zip library failed to load.
            for (const file of bufferedFiles) {
              this._downloadBlob(file.blob, file.fileName);
              await new Promise((resolve) => setTimeout(resolve, 80));
            }
            this.ui?.showToast?.(
              'ZIP unavailable; downloaded individual PNG files (browser may limit batch downloads)',
            );
          }
          this.ui?.uiSounds?.playRenderFinished();
          this.ui?.showToast?.(`Video sequence exported (${totalFrames} PNG frames)`, 3200, {
            notification: false,
          });
        }
      } catch (error) {
        console.error('Video export failed', error);
        this.ui?.showToast?.('Video export failed');
      } finally {
        this._finishExportSession(exportSession, {
          originalBackground,
          originalClearColor,
          originalClearAlpha,
          transparentSetupSnapshot,
          wasBackgroundEnabled,
        });
      }
    } finally {
      if (!pngSequenceCancelled) {
        this.ui?.hideOfflineExportOverlay?.();
      }
      if (spinnerActive && typeof this.ui?.endLoadSpinner === 'function') {
        this.ui.endLoadSpinner();
      }
    }
  }
}

