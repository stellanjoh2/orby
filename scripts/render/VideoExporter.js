import * as THREE from 'three';
import { verticalFovForAspectPreservingHorizontalFov } from '../camera/lensPresets.js';
import { getComposerOutputRenderTarget } from './composerOutputBuffer.js';
import {
  exportVideoMovementLabel,
  hasExportVideoMovement,
  needsExportCameraDrive,
  needsExportFovDrive,
  normalizeExportVideoMovements,
  normalizeExportMeshAnimationSettings,
  normalizeExportSpinSettings,
  normalizeExportHdriRotationSettings,
  exportSpinSequenceLabel,
  exportSpinToastLabel,
  exportHdriRotationToastLabel,
} from './exportVideoMovements.js';
import { lightsRotationForExportFrame } from '../config/lightsAutoRotate.js';
import { buildOfflineExportOverlaySummary } from './offlineExportOverlaySummary.js';

export class VideoExporter {
  constructor({
    renderer,
    scene,
    camera,
    composer,
    imageExporter,
    backgroundController,
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
    /** Same pass sequence as still PNG export (`ImageExporter.exportPng`). */
    renderComposerPassForExport,
    setRotationY,
    setLightsRotation,
    setHdriRotation,
    beginExportOrbitDrive = () => {},
    applyExportOrbitDriveFrame = () => {},
    endExportOrbitDrive = () => {},
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
    getCurrentModel,
    getCurrentFile,
    getCurrentAssetMetadata,
    getHdriBackgroundEnabled,
    getAnimationClipCount = () => 0,
    getAnimationClipLabel = () => null,
    handleResize,
  } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = composer;
    this.imageExporter = imageExporter;
    this.backgroundController = backgroundController;
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
    this.beginExportOrbitDrive = beginExportOrbitDrive;
    this.applyExportOrbitDriveFrame = applyExportOrbitDriveFrame;
    this.endExportOrbitDrive = endExportOrbitDrive;
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
    this.getCurrentModel = getCurrentModel;
    this.getCurrentFile = getCurrentFile;
    this.getCurrentAssetMetadata = getCurrentAssetMetadata;
    this.getHdriBackgroundEnabled = getHdriBackgroundEnabled;
    this.getAnimationClipCount = getAnimationClipCount;
    this.getAnimationClipLabel = getAnimationClipLabel;
    this.handleResize = handleResize;
    this._exportCancelRequested = false;
  }

  requestCancelExport() {
    this._exportCancelRequested = true;
  }

  _downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    // Safari can produce truncated/corrupt downloads when blob URLs are revoked too early.
    window.setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 60_000);
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

  _sequenceFolderName(baseName, durationSec, fps, spinSettings, resolution, mode = 'turntable') {
    const safeBase = (baseName || 'orby')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      || 'orby';
    const spinLabel = exportSpinSequenceLabel(spinSettings);
    return `${safeBase}_${mode}_${durationSec}s_${fps}fps_${spinLabel}_${resolution}`;
  }

  _applyVideoExportFrame({
    movements,
    t,
    spinSettings,
    hdriRotationSettings,
    startRotationY,
    startLightsRotation,
    startHdriRotation,
    lightsAutoRotate,
    durationSec,
    frameIndex,
    fps,
    meshAnimation,
  }) {
    const { rotationDegrees, signedRotationDegrees, sign } = spinSettings;
    if (movements.turntable && rotationDegrees > 0) {
      const rotationY = startRotationY + signedRotationDegrees * t;
      this.setRotationY(rotationY);
      this.stateStore.set('rotationY', rotationY);
    }
    if (lightsAutoRotate && typeof this.setLightsRotation === 'function') {
      const lightsRotation = lightsRotationForExportFrame(
        startLightsRotation,
        durationSec,
        t,
      );
      this.setLightsRotation(lightsRotation, { updateUi: false, updateState: false });
    }
    if (
      hdriRotationSettings?.degrees > 0
      && typeof this.setHdriRotation === 'function'
    ) {
      const hdriRotation = startHdriRotation + hdriRotationSettings.signedDegrees * t;
      this.setHdriRotation(hdriRotation, { updateState: false, updateUi: false });
    }
    if (needsExportCameraDrive(movements)) {
      this.applyExportCameraDriveFrame?.(t, {
        rotationDegrees,
        rotationSign: sign,
        orbit: movements.orbit,
        zoom: movements.zoom,
        zoomDistance: movements.zoomDistance,
        tilt: movements.tilt,
        tiltAngle: movements.tiltAngle,
      });
    }
    if (needsExportFovDrive(movements)) {
      this.applyExportFovDriveFrame?.(t, movements.fovOffset);
    }
    if (
      meshAnimation?.include
      && typeof frameIndex === 'number'
      && typeof fps === 'number'
    ) {
      this.applyExportAnimationDriveFrame?.(frameIndex, fps);
    }
    if (typeof frameIndex === 'number' && typeof fps === 'number' && fps > 0) {
      this.applyCreativeLookExportFrame?.(frameIndex, fps);
      this.applyGrainExportFrame?.(frameIndex, fps);
      this.applyFontTextRevealExportFrame?.(frameIndex, fps);
    }
  }

  /** Rewind export-driven scene state to frame 0 before tearing down export drives. */
  _resetExportSceneToFirstFrame({
    movements,
    spinSettings,
    hdriRotationSettings,
    startRotationY,
    startLightsRotation,
    startHdriRotation,
    lightsAutoRotate,
    durationSec,
    fps,
    meshAnimation,
  }) {
    this._applyVideoExportFrame({
      movements,
      t: 0,
      spinSettings,
      hdriRotationSettings,
      startRotationY,
      startLightsRotation,
      startHdriRotation,
      lightsAutoRotate,
      durationSec,
      frameIndex: 0,
      fps,
      meshAnimation,
    });
  }

  async _downloadSequenceAsZip({
    files,
    baseName,
    durationSec,
    fps,
    spinSettings,
    resolution,
    mode = 'turntable',
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
      spinSettings,
      resolution,
      mode,
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

  /**
   * Offline frame render — matches still PNG export (composer pass + viewport repair).
   * @param {{ transparent?: boolean }} [opts]
   */
  _renderComposerFrameForCapture({ transparent = false } = {}) {
    const db = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(db);
    const targetWidth = Math.max(1, Math.round(db.x));
    const targetHeight = Math.max(1, Math.round(db.y));
    this.imageExporter?._ensureComposerMatchesDrawingBuffer?.({ strict: true });
    this.imageExporter?._setExportViewport?.(targetWidth, targetHeight);

    this.beforeComposerRender?.();
    if (typeof this.renderComposerPassForExport === 'function') {
      this.renderComposerPassForExport({ transparent });
      return;
    }
    if (this.composer) {
      this.ensureComposerBuffersMatchRenderer?.();
      this.resetRendererViewportToCanvas?.();
      this.prepareComposerCapture?.();
      this.composer.render();
      this.resetRendererViewportToCanvas?.();
      return;
    }
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  _finishGpuFrame() {
    const gl = this.renderer?.getContext?.();
    if (gl && typeof gl.finish === 'function') {
      gl.finish();
    }
  }

  _renderCurrentFrameToCanvas() {
    this._renderComposerFrameForCapture();
  }

  _renderAndCaptureCurrentFramePng() {
    const db = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(db);
    const targetWidth = Math.max(1, Math.round(db.x));
    const targetHeight = Math.max(1, Math.round(db.y));

    if (this.composer) {
      const previousRenderToScreen = this.composer.renderToScreen;
      this.composer.renderToScreen = false;
      try {
        this._renderComposerFrameForCapture();
        this._finishGpuFrame();
        return this.imageExporter._captureComposerOutputAsPngDataUrl(
          targetWidth,
          targetHeight,
        );
      } finally {
        this.composer.renderToScreen = previousRenderToScreen;
      }
    }

    this._renderComposerFrameForCapture();
    this._finishGpuFrame();
    return this.renderer.domElement.toDataURL('image/png');
  }

  _captureTransparentFramePngDataUrl() {
    const db = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(db);
    const targetWidth = Math.max(1, Math.round(db.x));
    const targetHeight = Math.max(1, Math.round(db.y));

    let postPixels = null;

    if (this.composer) {
      const previousRenderToScreen = this.composer.renderToScreen;
      this.composer.renderToScreen = false;
      try {
        this._renderComposerFrameForCapture({ transparent: true });
        this._finishGpuFrame();

        const byteRT = new THREE.WebGLRenderTarget(targetWidth, targetHeight, {
          type: THREE.UnsignedByteType,
          format: THREE.RGBAFormat,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          stencilBuffer: false,
        });
        try {
          postPixels = new Uint8Array(targetWidth * targetHeight * 4);
          this.composer.copyPass.render(
            this.renderer,
            byteRT,
            getComposerOutputRenderTarget(this.composer),
            0,
            false,
          );
          this.renderer.readRenderTargetPixels(
            byteRT,
            0,
            0,
            targetWidth,
            targetHeight,
            postPixels,
          );
        } finally {
          byteRT.dispose();
        }
      } finally {
        this.composer.renderToScreen = previousRenderToScreen;
      }
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL('image/png');
    }

    const alphaRT = new THREE.WebGLRenderTarget(targetWidth, targetHeight, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      samples: this.renderer.capabilities?.isWebGL2 ? 4 : 0,
    });

    let alphaPixels = null;
    try {
      this.renderer.setRenderTarget(alphaRT);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setClearAlpha(0);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);

      alphaPixels = new Uint8Array(targetWidth * targetHeight * 4);
      this.renderer.readRenderTargetPixels(
        alphaRT,
        0,
        0,
        targetWidth,
        targetHeight,
        alphaPixels,
      );
    } finally {
      alphaRT.dispose();
    }

    const merged = new Uint8ClampedArray(targetWidth * targetHeight * 4);
    for (let i = 0; i < merged.length; i += 4) {
      const a = alphaPixels[i + 3];
      merged[i + 3] = a;
      if (a === 0) {
        merged[i] = 0;
        merged[i + 1] = 0;
        merged[i + 2] = 0;
      } else if (a < 255) {
        // Edge pixels: use direct render RGB to avoid dark/premultiplied halos.
        merged[i] = alphaPixels[i];
        merged[i + 1] = alphaPixels[i + 1];
        merged[i + 2] = alphaPixels[i + 2];
      } else {
        merged[i] = postPixels[i];
        merged[i + 1] = postPixels[i + 1];
        merged[i + 2] = postPixels[i + 2];
      }
    }

    const flipped = new Uint8ClampedArray(targetWidth * targetHeight * 4);
    const rowStride = targetWidth * 4;
    for (let y = 0; y < targetHeight; y += 1) {
      const srcRow = (targetHeight - 1 - y) * rowStride;
      const dstRow = y * rowStride;
      flipped.set(merged.subarray(srcRow, srcRow + rowStride), dstRow);
    }

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = targetWidth;
    exportCanvas.height = targetHeight;
    const ctx = exportCanvas.getContext('2d');
    const imageData = ctx.createImageData(targetWidth, targetHeight);
    imageData.data.set(flipped);
    ctx.putImageData(imageData, 0, 0);
    return exportCanvas.toDataURL('image/png');
  }

  _getMp4BitrateForQuality(quality) {
    if (quality === 'low') return 4_000_000;
    if (quality === 'high') return 16_000_000;
    return 8_000_000;
  }

  _getVideoResolutionSize(resolutionKey) {
    if (resolutionKey === '1440p') return { width: 2560, height: 1440 };
    if (resolutionKey === '2160p') return { width: 3840, height: 2160 };
    return { width: 1920, height: 1080 }; // 1080p default
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

  _applyVideoExportSize(width, height) {
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

    this.syncPerspectiveProjection?.({ fovScale: exportFovScale });

    // 1080p/1440p/2160p are 16∶9; a wider studio viewport keeps the same vertical FOV but
    // shows more horizontally — export looked zoomed-in without this adjustment.
    if (
      !fisheyeActive
      && !lensDistortionActive
      && Math.abs(previousAspect - newAspect) > 1e-4
    ) {
      const baseVfov = state?.camera?.fov ?? this.camera?.fov ?? 45;
      const adjusted = verticalFovForAspectPreservingHorizontalFov(
        baseVfov,
        previousAspect,
        newAspect,
      );
      this.camera.fov = adjusted * exportFovScale;
      this.camera.updateProjectionMatrix();
    }

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
    this.renderer.setPixelRatio(snapshot.previousPixelRatio);
    this.renderer.setSize(snapshot.previousSize.x, snapshot.previousSize.y, false);
    this.camera.aspect = snapshot.previousAspect;
    this.camera.updateProjectionMatrix();
    this.syncPostProcessingForLogicalSize?.(
      snapshot.previousSize.x,
      snapshot.previousSize.y,
    );
    this.syncPerspectiveProjection?.();
  }

  /** Repair GL viewport / composer RT size after offline capture (passes may leave partial viewport). */
  _repairViewportAfterExport() {
    this.ensureComposerBuffersMatchRenderer?.();
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
    fps,
    startRotationY,
    startLightsRotation,
    startHdriRotation,
    lightsAutoRotate,
    quality = 'medium',
    spinSettings,
    hdriRotationSettings,
    movements,
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
        fps,
        startRotationY,
        startLightsRotation,
        startHdriRotation,
        lightsAutoRotate,
        quality,
        spinSettings,
        hdriRotationSettings,
        movements,
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
      spinSettings,
      hdriRotationSettings,
      startRotationY,
      startLightsRotation,
      startHdriRotation,
      lightsAutoRotate,
      durationSec,
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

    // Same discrete angles as PNG export: i = 0 … totalFrames-1, t = i / totalFrames.
    const startedAt = performance.now();
    for (let i = 0; i < totalFrames; i += 1) {
      const targetAt = startedAt + i * frameDurationMs;
      const delay = targetAt - performance.now();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const t = i / totalFrames;
      this._applyVideoExportFrame({
        movements,
        t,
        spinSettings,
        hdriRotationSettings,
        startRotationY,
        startLightsRotation,
        startHdriRotation,
        lightsAutoRotate,
        durationSec,
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
    fps,
    startRotationY,
    startLightsRotation,
    startHdriRotation,
    lightsAutoRotate,
    quality = 'medium',
    spinSettings,
    hdriRotationSettings,
    movements,
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
      spinSettings,
      hdriRotationSettings,
      startRotationY,
      startLightsRotation,
      startHdriRotation,
      lightsAutoRotate,
      durationSec,
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
      const t = i / totalFrames;
      this._applyVideoExportFrame({
        movements,
        t,
        spinSettings,
        hdriRotationSettings,
        startRotationY,
        startLightsRotation,
        startHdriRotation,
        lightsAutoRotate,
        durationSec,
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

  async exportVideo(settings = {}) {
    this._exportCancelRequested = false;
    if (!this.getCurrentModel?.()) {
      this.ui?.showToast?.('Load a mesh before exporting video');
      return;
    }

    const movements = normalizeExportVideoMovements(settings);
    const hdriRotationSettings = normalizeExportHdriRotationSettings(settings);
    if (!hasExportVideoMovement(movements) && !hdriRotationSettings.degrees) {
      this.ui?.showToast?.('Enable at least one movement or HDRI rotation to export');
      return;
    }
    const modeLabel = exportVideoMovementLabel(movements);
    const meshAnimation = normalizeExportMeshAnimationSettings(
      settings,
      this.getAnimationClipCount?.() ?? 0,
    );

    const format = settings?.format === 'png' ? 'png' : 'mp4';
    const allowedDurations = [5, 10, 15];
    const durationSec = allowedDurations.includes(settings?.durationSec)
      ? settings.durationSec
      : 5;
    const mp4Quality =
      settings?.mp4Quality === 'low' || settings?.mp4Quality === 'high'
        ? settings.mp4Quality
        : 'medium';
    const spinSettings = normalizeExportSpinSettings(settings);
    const movTransparent = !!settings?.movTransparent;
    const resolution =
      settings?.resolution === '1440p' || settings?.resolution === '2160p'
        ? settings.resolution
        : '1080p';
    const fps = settings?.fps === 30 || settings?.fps === 60 ? settings.fps : 24;
    const totalFrames = Math.max(2, Math.round(durationSec * fps));

    const state = this.stateStore.getState();
    const startRotationY = Number.isFinite(state.rotationY)
      ? state.rotationY
      : THREE.MathUtils.radToDeg(this.getCurrentModel()?.rotation?.y || 0);
    const startLightsRotation = Number.isFinite(state.lightsRotation)
      ? state.lightsRotation
      : 0;
    const startHdriRotation = Number.isFinite(state.hdriRotation)
      ? state.hdriRotation
      : 0;
    const lightsAutoRotate = !!state.lightsAutoRotate;
    const baseName =
      this.getCurrentFile?.()?.name
      || this.getCurrentAssetMetadata?.()?.assetName
      || 'orby';

    const wasBackgroundEnabled = !!this.getHdriBackgroundEnabled?.();
    const originalBackground = this.scene.background;
    const originalClearAlpha = this.renderer.getClearAlpha();
    const originalClearColor = this.renderer.getClearColor(new THREE.Color()).clone();
    const shouldUseTransparentFrames = format === 'png' && movTransparent;
    const outputSize = this._getVideoResolutionSize(resolution);
    if (resolution === '2160p' && (fps >= 60 || mp4Quality === 'high')) {
      this.ui?.showToast?.(
        '4K export is heavy on this browser/GPU and may use fallback encoding',
      );
    }
    const isOfflinePngSequence = format === 'png';
    if (isOfflinePngSequence) {
      const summary = buildOfflineExportOverlaySummary({
        exportJob: {
          ...settings,
          resolution,
          durationSec,
          fps,
          movTransparent: shouldUseTransparentFrames,
          clipCount: meshAnimation.clipCount,
        },
        assetName: baseName,
        animationClipLabel: meshAnimation.include
          ? this.getAnimationClipLabel?.(meshAnimation.clipIndex)
          : null,
      });
      this.ui?.showOfflineExportOverlay?.(summary, {
        cancellable: true,
        onCancelExport: () => this.requestCancelExport(),
      });
      this.ui?.updateOfflineExportOverlayProgress?.({ frameIndex: 0, totalFrames });
      await this._yieldUntilPaintCommitted();
    }
    const sizeSnapshot = this._applyVideoExportSize(outputSize.width, outputSize.height);
    let spinnerActive = false;
    if (!isOfflinePngSequence && typeof this.ui?.beginLoadSpinner === 'function') {
      this.ui.beginLoadSpinner();
      spinnerActive = true;
      this.ui.beginLoadSpinnerElapsed?.();
    }

    try {
      if (needsExportCameraDrive(movements)) {
        this.beginExportCameraDrive?.();
      }
      if (needsExportFovDrive(movements)) {
        this.beginExportFovDrive?.();
      }
      this.beginExportAnimationDrive?.(meshAnimation);
      this.beginFontTextRevealExportDrive?.();

      if (format === 'mp4') {
        const hdriLabel = exportHdriRotationToastLabel(hdriRotationSettings);
        const spinSummary = exportSpinToastLabel(spinSettings);
        const motionSummary = hdriLabel
          ? `${spinSummary}; ${hdriLabel}`
          : spinSummary;
        this.ui?.showToast?.(
          `Recording MP4 (${durationSec}s, ${fps}fps, ${resolution}, ${mp4Quality}, ${modeLabel}, ${motionSummary})…`,
        );
        try {
          const success = await this._exportTurntableRealtimeRecorder({
            durationSec,
            fps,
            startRotationY,
            startLightsRotation,
            startHdriRotation,
            lightsAutoRotate,
            baseName,
            quality: mp4Quality,
            spinSettings,
            hdriRotationSettings,
            movements,
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
          this._resetExportSceneToFirstFrame({
            movements,
            spinSettings,
            hdriRotationSettings,
            startRotationY,
            startLightsRotation,
            startHdriRotation,
            lightsAutoRotate,
            durationSec,
            fps,
            meshAnimation,
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
          this._restoreVideoExportSize(sizeSnapshot);
          this._repairViewportAfterExport();
          this.handleResize?.();
        }
        return;
      }

      this.ui?.showToast?.(`Rendering ${totalFrames} frames…`);
      let transparentSetupSnapshot = null;
      try {
        if (shouldUseTransparentFrames) {
          transparentSetupSnapshot = this._applyTransparentFrameSetup();
        }

        const bufferedFiles = [];
        let exportCancelled = false;
        for (let i = 0; i < totalFrames; i += 1) {
          if (this._exportCancelRequested) {
            exportCancelled = true;
            break;
          }
          const t = i / totalFrames;
          this._applyVideoExportFrame({
            movements,
            t,
            spinSettings,
            hdriRotationSettings,
            startRotationY,
            startLightsRotation,
            startHdriRotation,
            lightsAutoRotate,
            durationSec,
            frameIndex: i,
            fps,
            meshAnimation,
          });
          const dataUrl = shouldUseTransparentFrames
            ? this._captureTransparentFramePngDataUrl()
            : this._renderAndCaptureCurrentFramePng();
          const blob = await (await fetch(dataUrl)).blob();
          const fileName = this._frameNameForSequence(baseName, modeLabel, durationSec, i);
          bufferedFiles.push({ fileName, blob });
          this.ui?.updateOfflineExportOverlayProgress?.({
            frameIndex: i + 1,
            totalFrames,
          });
        }

        if (exportCancelled) {
          this.ui?.showToast?.('PNG export cancelled', 3200, { notification: false });
        } else if (bufferedFiles.length > 0) {
          const zipped = await this._downloadSequenceAsZip({
            files: bufferedFiles,
            baseName,
            durationSec,
            fps,
            spinSettings,
            resolution,
            mode: modeLabel,
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
        this._resetExportSceneToFirstFrame({
          movements,
          spinSettings,
          hdriRotationSettings,
          startRotationY,
          startLightsRotation,
          startHdriRotation,
          lightsAutoRotate,
          durationSec,
          fps,
          meshAnimation,
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
        this.scene.background = originalBackground;
        this.renderer.setClearColor(originalClearColor, originalClearAlpha);
        this.renderer.setClearAlpha(originalClearAlpha);
        this._restoreTransparentFrameSetup(transparentSetupSnapshot);
        if (wasBackgroundEnabled) {
          this.backgroundController?.setHdriBackgroundEnabled(true);
        }
        this._restoreVideoExportSize(sizeSnapshot);
        this._repairViewportAfterExport();
        this.handleResize?.();
      }
    } finally {
      this.ui?.hideOfflineExportOverlay?.();
      if (spinnerActive && typeof this.ui?.endLoadSpinner === 'function') {
        this.ui.endLoadSpinner();
      }
    }
  }
}

