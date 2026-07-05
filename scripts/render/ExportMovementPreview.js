import * as THREE from 'three';
import { lightsRotationForExportFrame } from '../config/lightsAutoRotate.js';
import {
  hasExportVideoMovement,
  needsExportCameraDrive,
  needsExportFovDrive,
  normalizeExportVideoMovements,
  normalizeExportMeshAnimationSettings,
  normalizeExportObjectSpinSettings,
  normalizeExportCameraSpinSettings,
  normalizeExportHdriRotationSettings,
  normalizeExportPresetDurationSec,
  resolveExportMeshAnimationTiming,
  resolveExportCameraMovementLinearT,
} from './exportVideoMovements.js';
import {
  easeExportMovementProgress,
  normalizeExportMovementEasing,
} from './exportMovementEasing.js';
import {
  DEFAULT_EXPORT_VIDEO_FPS,
  normalizeExportVideoFps,
} from './exportVideoResolution.js';

/**
 * Real-time viewport preview of export camera/mesh movement.
 * Offline export pixels are verified via Capture preview frame (same path as PNG encode).
 * Supports scrubbing, play/stop, and looping playback (no pause — scrub to inspect).
 */
export class ExportMovementPreview {
  constructor({
    stateStore,
    ui,
    setRotationY,
    setLightsRotation,
    setHdriRotation,
    getHdriRotation = () => 0,
    getCurrentModel,
    getAnimationClipCount = () => 0,
    getAnimationClipDuration = () => 0,
    beginExportCameraDrive = () => {},
    applyExportCameraDriveFrame = () => {},
    endExportCameraDrive = () => {},
    beginPreviewViewportLock = () => {},
    endPreviewViewportLock = () => {},
    beginExportFovDrive = () => {},
    applyExportFovDriveFrame = () => {},
    endExportFovDrive = () => {},
    beginExportAnimationDrive = () => {},
    applyExportAnimationDriveTime = () => {},
    endExportAnimationDrive = () => {},
    beginFontTextRevealExportDrive = () => {},
    applyFontTextRevealExportTime = () => {},
    endFontTextRevealExportDrive = () => {},
    isExportCameraDriving = () => false,
    isExportFovDriving = () => false,
    isExportViewportLocked = () => false,
    onActiveChange = () => {},
    onProgressChange = () => {},
  } = {}) {
    this.stateStore = stateStore;
    this.ui = ui;
    this.setRotationY = setRotationY;
    this.setLightsRotation = setLightsRotation;
    this.setHdriRotation = setHdriRotation;
    this.getHdriRotation = getHdriRotation;
    this.getCurrentModel = getCurrentModel;
    this.getAnimationClipCount = getAnimationClipCount;
    this.getAnimationClipDuration = getAnimationClipDuration;
    this.beginExportCameraDrive = beginExportCameraDrive;
    this.applyExportCameraDriveFrame = applyExportCameraDriveFrame;
    this.endExportCameraDrive = endExportCameraDrive;
    this.beginPreviewViewportLock = beginPreviewViewportLock;
    this.endPreviewViewportLock = endPreviewViewportLock;
    this.beginExportFovDrive = beginExportFovDrive;
    this.applyExportFovDriveFrame = applyExportFovDriveFrame;
    this.endExportFovDrive = endExportFovDrive;
    this.beginExportAnimationDrive = beginExportAnimationDrive;
    this.applyExportAnimationDriveTime = applyExportAnimationDriveTime;
    this.endExportAnimationDrive = endExportAnimationDrive;
    this.beginFontTextRevealExportDrive = beginFontTextRevealExportDrive;
    this.applyFontTextRevealExportTime = applyFontTextRevealExportTime;
    this.endFontTextRevealExportDrive = endFontTextRevealExportDrive;
    this.isExportCameraDriving = isExportCameraDriving;
    this.isExportFovDriving = isExportFovDriving;
    this.isExportViewportLocked = isExportViewportLocked;
    this.onActiveChange = onActiveChange;
    this.onProgressChange = onProgressChange;

    this._active = false;
    this._playing = false;
    this._drivesEngaged = false;
    this._sessionDrivesEngaged = false;
    this._elapsed = 0;
    this._durationSec = 5;
    this._cameraMovementDurationSec = 5;
    this._presetDurationSec = 5;
    this._fps = DEFAULT_EXPORT_VIDEO_FPS;
    this._objectSpinSettings = normalizeExportObjectSpinSettings();
    this._cameraSpinSettings = normalizeExportCameraSpinSettings();
    this._hdriRotationSettings = normalizeExportHdriRotationSettings();
    this._startRotationY = 0;
    this._startLightsRotation = 0;
    this._startHdriRotation = 0;
    this._hdriPreviewDriven = false;
    this._lightsAutoRotate = false;
    this._movements = normalizeExportVideoMovements();
    this._movementEasing = normalizeExportMovementEasing();
    this._meshAnimation = normalizeExportMeshAnimationSettings();
    this._movementSettingsKey = '';
    this._settingsKey = '';
    this._lastProgressUiAt = 0;
  }

  isActive() {
    return this._active;
  }

  isPlaying() {
    return this._playing;
  }

  getProgress() {
    const durationSec = Math.max(1e-6, this._durationSec);
    return Math.min(1, Math.max(0, this._elapsed / durationSec));
  }

  pausePlayback() {
    if (!this._playing) return;
    this._playing = false;
    this._syncPreviewStateToStore();
    this._notifyProgress();
  }

  resumePlayback() {
    if (!this._active || this._playing) return;
    this._playing = true;
    this._lastProgressUiAt = 0;
    this._notifyProgress({ force: true });
  }

  _resolveTiming(settings = {}) {
    const clipCount = this.getAnimationClipCount?.() ?? 0;
    const mesh = normalizeExportMeshAnimationSettings(settings, clipCount);
    const clipDuration = mesh.include
      ? this.getAnimationClipDuration?.(mesh.clipIndex) ?? 0
      : 0;
    return resolveExportMeshAnimationTiming(settings, clipCount, clipDuration);
  }

  _syncPreviewStateToStore() {
    if (this._movements.turntable && this._objectSpinSettings.rotationDegrees > 0) {
      const durationSec = Math.max(1e-6, this._durationSec);
      const elapsed = Math.min(this._elapsed, durationSec);
      const cameraLinearT = resolveExportCameraMovementLinearT(
        elapsed,
        this._cameraMovementDurationSec,
      );
      const t = easeExportMovementProgress(cameraLinearT, this._movementEasing);
      const rotationY =
        this._startRotationY + this._objectSpinSettings.signedRotationDegrees * t;
      this.stateStore.set('rotationY', rotationY);
    }
  }

  /** Whether export settings describe any previewable motion. */
  static canPreview(settings = {}) {
    const movements = normalizeExportVideoMovements(settings);
    return hasExportVideoMovement(movements, settings);
  }

  _movementSettingsFingerprint(settings = {}) {
    const movements = normalizeExportVideoMovements(settings);
    const objectSpinSettings = normalizeExportObjectSpinSettings(settings);
    const cameraSpinSettings = normalizeExportCameraSpinSettings(settings);
    const hdriRotationSettings = normalizeExportHdriRotationSettings(settings);
    const timing = this._resolveTiming(settings);
    const fps = normalizeExportVideoFps(settings?.fps);
    return JSON.stringify({
      movements,
      objectSpinSettings,
      cameraSpinSettings,
      hdriRotationSettings,
      movementEasing: normalizeExportMovementEasing(settings?.movementEasing),
      presetDurationSec: normalizeExportPresetDurationSec(settings?.durationSec),
      exportDurationSec: timing.exportDurationSec,
      cameraMovementDurationSec: timing.cameraMovementDurationSec,
      fps,
    });
  }

  _settingsFingerprint(settings = {}) {
    const meshAnimation = this._resolveTiming(settings);
    return JSON.stringify({
      ...JSON.parse(this._movementSettingsFingerprint(settings)),
      meshAnimation,
    });
  }

  _notifyProgress({ force = false } = {}) {
    const durationSec = Math.max(1e-6, this._durationSec);
    const elapsed = this._playing
      ? this._elapsed % durationSec
      : Math.min(this._elapsed, durationSec);
    if (this._playing && !force) {
      const now = performance.now();
      if (now - this._lastProgressUiAt < 16) return;
      this._lastProgressUiAt = now;
    }
    this.onProgressChange({
      currentSec: elapsed,
      durationSec,
      playing: this._playing,
      armed: this._active,
      t: elapsed / durationSec,
    });
  }

  _applySettings(settings = {}) {
    const timing = this._resolveTiming(settings);
    this._presetDurationSec = normalizeExportPresetDurationSec(settings?.durationSec);
    this._durationSec = timing.exportDurationSec;
    this._cameraMovementDurationSec = timing.cameraMovementDurationSec;
    this._fps = normalizeExportVideoFps(settings?.fps);
    this._objectSpinSettings = normalizeExportObjectSpinSettings(settings);
    this._cameraSpinSettings = normalizeExportCameraSpinSettings(settings);
    this._hdriRotationSettings = normalizeExportHdriRotationSettings(settings);
    this._movements = normalizeExportVideoMovements(settings);
    this._movementEasing = normalizeExportMovementEasing(settings?.movementEasing);
    this._meshAnimation = timing;
    this._movementSettingsKey = this._movementSettingsFingerprint(settings);
    this._settingsKey = this._settingsFingerprint(settings);
  }

  /**
   * Update GLB clip export settings during an armed preview without re-capturing
   * camera drives (avoids orbit lock flicker and framing jumps on embed toggle).
   * @returns {boolean} true when handled — caller should skip full rearm
   */
  updateMeshAnimationSettings(settings = {}) {
    if (!this._active) return false;

    const nextTiming = this._resolveTiming(settings);
    const movementSettingsKey = this._movementSettingsFingerprint(settings);
    const meshUnchanged =
      nextTiming.include === this._meshAnimation.include
      && nextTiming.clipIndex === this._meshAnimation.clipIndex
      && nextTiming.matchDurationToClip === this._meshAnimation.matchDurationToClip
      && nextTiming.syncCameraToDuration === this._meshAnimation.syncCameraToDuration;

    if (meshUnchanged) {
      if (movementSettingsKey === this._movementSettingsKey) {
        return true;
      }
      this._applySettings(settings);
      if (this._sessionDrivesEngaged && this._meshAnimation.include) {
        this.endExportAnimationDrive();
        this.beginExportAnimationDrive(this._meshAnimation);
        const durationSec = Math.max(1e-6, this._durationSec);
        const exportTimeSec = this._playing
          ? this._elapsed % durationSec
          : Math.min(this._elapsed, durationSec);
        this.applyExportAnimationDriveTime(exportTimeSec);
      }
      const cameraLinearT = resolveExportCameraMovementLinearT(
        Math.min(this._elapsed, this._durationSec),
        this._cameraMovementDurationSec,
      );
      this._applyFrame(cameraLinearT, Math.min(this._elapsed, this._durationSec));
      return true;
    }
    if (movementSettingsKey !== this._movementSettingsKey) {
      return false;
    }

    if (this._meshAnimation.include) {
      this.endExportAnimationDrive();
    }

    this._applySettings(settings);

    if (this._sessionDrivesEngaged && this._meshAnimation.include) {
      this.beginExportAnimationDrive(this._meshAnimation);
      const durationSec = Math.max(1e-6, this._durationSec);
      const exportTimeSec = this._playing
        ? this._elapsed % durationSec
        : Math.min(this._elapsed, durationSec);
      this.applyExportAnimationDriveTime(exportTimeSec);
    }

    return true;
  }

  _captureStartState() {
    const state = this.stateStore.getState();
    this._startRotationY = Number.isFinite(state.rotationY)
      ? state.rotationY
      : THREE.MathUtils.radToDeg(this.getCurrentModel()?.rotation?.y || 0);
    this._startLightsRotation = Number.isFinite(state.lightsRotation)
      ? state.lightsRotation
      : 0;
    this._startHdriRotation = Number.isFinite(this.getHdriRotation?.())
      ? this.getHdriRotation()
      : Number.isFinite(state.hdriRotation)
        ? state.hdriRotation
        : 0;
    this._hdriPreviewDriven = this._hdriRotationSettings.degrees > 0;
    this._lightsAutoRotate = !!state.lightsAutoRotate;
  }

  _engageSessionDrives() {
    if (this._sessionDrivesEngaged) return;
    // Camera-only preview must not freeze live GLB playback — export drive pauses the mixer.
    if (this._meshAnimation.include) {
      this.beginExportAnimationDrive(this._meshAnimation);
    }
    this.beginFontTextRevealExportDrive();
    this._sessionDrivesEngaged = true;
  }

  _releaseSessionDrives() {
    if (!this._sessionDrivesEngaged) return;
    if (this._meshAnimation.include) {
      this.endExportAnimationDrive();
    }
    this.endFontTextRevealExportDrive();
    this._sessionDrivesEngaged = false;
  }

  _viewportDrivesAreLive() {
    if (needsExportCameraDrive(this._movements)) {
      if (!this.isExportCameraDriving?.()) return false;
    } else if (!this.isExportViewportLocked?.()) {
      return false;
    }
    if (needsExportFovDrive(this._movements) && !this.isExportFovDriving?.()) {
      return false;
    }
    return true;
  }

  /** Re-engage orbit/FOV drives when offline capture ended them but preview state stayed armed. */
  _syncViewportDrives() {
    if (this._drivesEngaged && this._viewportDrivesAreLive()) return;
    this._drivesEngaged = false;
    this._engageViewportDrives();
  }

  _engageViewportDrives() {
    if (this._drivesEngaged) return;
    if (needsExportCameraDrive(this._movements)) {
      this.beginExportCameraDrive();
    } else {
      this.beginPreviewViewportLock();
    }
    if (needsExportFovDrive(this._movements)) {
      this.beginExportFovDrive();
    }
    this._drivesEngaged = true;
  }

  _releaseViewportDrives({ keepPose = true } = {}) {
    if (!this._drivesEngaged) return;
    if (needsExportCameraDrive(this._movements)) {
      this.endExportCameraDrive({ revertToSnapshot: !keepPose });
    } else {
      this.endPreviewViewportLock();
    }
    if (needsExportFovDrive(this._movements)) {
      this.endExportFovDrive({ revertToStart: !keepPose });
    }
    this._drivesEngaged = false;
  }

  _applyPreviewFrame(cameraLinearT, exportTimeSec) {
    this._engageSessionDrives();
    this._syncViewportDrives();
    this._applyFrame(cameraLinearT, exportTimeSec);
  }

  /** Enter export preview session at frame 0. */
  arm(settings = {}) {
    if (!this.getCurrentModel?.()) {
      this.ui?.showToast?.('Load a mesh before previewing movement');
      return false;
    }
    if (!ExportMovementPreview.canPreview(settings)) {
      this.ui?.showToast?.('Enable at least one movement to preview');
      return false;
    }

    const wasActive = this._active;
    if (wasActive) {
      this._releaseViewportDrives({ keepPose: true });
      this._releaseSessionDrives();
    }

    this._applySettings(settings);
    this._captureStartState();
    this._elapsed = 0;
    this._playing = false;
    this._applyPreviewFrame(0, 0);

    if (!wasActive) {
      this._active = true;
      this.onActiveChange(true);
    }
    this._notifyProgress({ force: true });
    return true;
  }

  /** Re-arm from frame 0 when export settings change during an active preview. */
  rearm(settings = {}) {
    if (!this._active) return false;
    const nextKey = this._settingsFingerprint(settings);
    if (nextKey === this._settingsKey) return false;
    return this.arm(settings);
  }

  scrub(t, settings = {}) {
    if (!this.getCurrentModel?.()) return false;
    if (!ExportMovementPreview.canPreview(settings)) return false;

    const normalizedT = Math.max(0, Math.min(1, Number(t) || 0));
    const fingerprint = this._settingsFingerprint(settings);

    if (!this._active) {
      if (!this.arm(settings)) return false;
    } else if (this._settingsKey !== fingerprint) {
      this._applySettings(settings);
      this._captureStartState();
      this._settingsKey = fingerprint;
    }

    this._playing = false;
    const duration = Math.max(1e-6, this._durationSec);
    this._elapsed = normalizedT * duration;
    const exportTimeSec = this._elapsed;
    const cameraLinearT = resolveExportCameraMovementLinearT(
      exportTimeSec,
      this._cameraMovementDurationSec,
    );
    this._applyPreviewFrame(cameraLinearT, exportTimeSec);
    this._syncPreviewStateToStore();
    this._notifyProgress({ force: true });
    return true;
  }

  resetToStart(settings = {}) {
    if (!this.getCurrentModel?.()) return false;
    if (!ExportMovementPreview.canPreview(settings)) return false;

    if (this._active) {
      this.stop({ silent: false });
      return true;
    }

    this._applySettings(settings);
    this._playing = false;
    this._elapsed = 0;
    this._notifyProgress({ force: true });
    return true;
  }

  togglePlay(settings = {}) {
    if (!this.getCurrentModel?.()) {
      this.ui?.showToast?.('Load a mesh before previewing movement');
      return false;
    }
    if (!ExportMovementPreview.canPreview(settings)) {
      this.ui?.showToast?.('Enable at least one movement to preview');
      return false;
    }

    if (this._active && this._playing) {
      this.stop({ silent: false });
      return true;
    }

    if (!this._active || this._settingsKey !== this._settingsFingerprint(settings)) {
      if (!this.arm(settings)) return false;
    }

    this._engageSessionDrives();
    this._engageViewportDrives();
    this._playing = true;
    this._lastProgressUiAt = 0;
    this._notifyProgress({ force: true });
    return true;
  }

  /** @deprecated use scrub/togglePlay — kept for callers that still invoke start(). */
  start(settings = {}) {
    return this.togglePlay(settings);
  }

  update(delta) {
    if (!this._active || !this._playing) return;
    this._engageSessionDrives();
    this._syncViewportDrives();
    const d = typeof delta === 'number' && Number.isFinite(delta) ? delta : 0;
    const duration = Math.max(1e-6, this._durationSec);
    this._elapsed += d;
    const loopElapsed = this._elapsed % duration;
    const cameraLinearT = resolveExportCameraMovementLinearT(
      loopElapsed,
      this._cameraMovementDurationSec,
    );
    this._applyFrame(cameraLinearT, loopElapsed);
    this._notifyProgress();
  }

  stop({ silent = false } = {}) {
    if (!this._active) return;
    this._playing = false;
    this._releaseViewportDrives({ keepPose: false });
    this._releaseSessionDrives();
    this.setRotationY(this._startRotationY);
    this.stateStore.set('rotationY', this._startRotationY);
    if (this._lightsAutoRotate && typeof this.setLightsRotation === 'function') {
      this.setLightsRotation(this._startLightsRotation);
      this.stateStore.set('lightsRotation', this._startLightsRotation);
    }
    this._restorePreviewHdri();

    this._active = false;
    this._elapsed = 0;
    this._settingsKey = '';
    this.onActiveChange(false);
    this._notifyProgress({ force: true });
    if (!silent) {
      this.ui?.showToast?.('Preview ended — camera orbit restored');
    }
  }

  _restorePreviewHdri() {
    if (
      !this._hdriPreviewDriven
      || typeof this.setHdriRotation !== 'function'
    ) {
      return;
    }
    this.setHdriRotation(this._startHdriRotation, {
      updateState: true,
      updateUi: true,
    });
  }

  _applyFrame(cameraLinearT, exportTimeSec) {
    const t = easeExportMovementProgress(cameraLinearT, this._movementEasing);
    const movements = this._movements;
    const {
      rotationDegrees: objectRotationDegrees,
      signedRotationDegrees: objectSignedRotationDegrees,
    } = this._objectSpinSettings;
    if (movements.turntable && objectRotationDegrees > 0) {
      const rotationY = this._startRotationY + objectSignedRotationDegrees * t;
      this.setRotationY(rotationY);
      this.stateStore.set('rotationY', rotationY);
    }
    if (needsExportCameraDrive(movements)) {
      const {
        rotationDegrees: cameraRotationDegrees,
        sign: cameraRotationSign,
      } = this._cameraSpinSettings;
      this.applyExportCameraDriveFrame(t, {
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
      this.applyExportFovDriveFrame(t, movements.fovOffset);
    }
    if (this._meshAnimation.include && Number.isFinite(exportTimeSec)) {
      this.applyExportAnimationDriveTime(exportTimeSec);
    }
    if (Number.isFinite(exportTimeSec)) {
      this.applyFontTextRevealExportTime(exportTimeSec);
    }
    if (this._lightsAutoRotate && typeof this.setLightsRotation === 'function') {
      const lightsRotation = lightsRotationForExportFrame(
        this._startLightsRotation,
        this._cameraMovementDurationSec,
        t,
      );
      this.setLightsRotation(lightsRotation, { updateUi: false, updateState: false });
    }
    if (
      this._hdriRotationSettings?.degrees > 0
      && typeof this.setHdriRotation === 'function'
    ) {
      const hdriRotation =
        this._startHdriRotation + this._hdriRotationSettings.signedDegrees * t;
      this.setHdriRotation(hdriRotation, {
        updateState: false,
        updateUi: false,
        live: true,
      });
    }
  }
}
