import * as THREE from 'three';
import { lightsRotationForExportFrame } from '../config/lightsAutoRotate.js';
import {
  hasExportVideoMovement,
  needsExportCameraDrive,
  needsExportFovDrive,
  normalizeExportVideoMovements,
  normalizeExportMeshAnimationSettings,
  normalizeExportSpinSettings,
  normalizeExportHdriRotationSettings,
} from './exportVideoMovements.js';

/**
 * Real-time viewport preview of export camera/mesh movement (no frame capture).
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
    beginExportCameraDrive = () => {},
    applyExportCameraDriveFrame = () => {},
    endExportCameraDrive = () => {},
    beginExportFovDrive = () => {},
    applyExportFovDriveFrame = () => {},
    endExportFovDrive = () => {},
    beginExportAnimationDrive = () => {},
    applyExportAnimationDriveFrame = () => {},
    endExportAnimationDrive = () => {},
    beginFontTextRevealExportDrive = () => {},
    applyFontTextRevealExportFrame = () => {},
    endFontTextRevealExportDrive = () => {},
    onActiveChange = () => {},
  } = {}) {
    this.stateStore = stateStore;
    this.ui = ui;
    this.setRotationY = setRotationY;
    this.setLightsRotation = setLightsRotation;
    this.setHdriRotation = setHdriRotation;
    this.getHdriRotation = getHdriRotation;
    this.getCurrentModel = getCurrentModel;
    this.getAnimationClipCount = getAnimationClipCount;
    this.beginExportCameraDrive = beginExportCameraDrive;
    this.applyExportCameraDriveFrame = applyExportCameraDriveFrame;
    this.endExportCameraDrive = endExportCameraDrive;
    this.beginExportFovDrive = beginExportFovDrive;
    this.applyExportFovDriveFrame = applyExportFovDriveFrame;
    this.endExportFovDrive = endExportFovDrive;
    this.beginExportAnimationDrive = beginExportAnimationDrive;
    this.applyExportAnimationDriveFrame = applyExportAnimationDriveFrame;
    this.endExportAnimationDrive = endExportAnimationDrive;
    this.beginFontTextRevealExportDrive = beginFontTextRevealExportDrive;
    this.applyFontTextRevealExportFrame = applyFontTextRevealExportFrame;
    this.endFontTextRevealExportDrive = endFontTextRevealExportDrive;
    this.onActiveChange = onActiveChange;

    this._active = false;
    this._elapsed = 0;
    this._durationSec = 5;
    this._fps = 24;
    this._spinSettings = normalizeExportSpinSettings();
    this._hdriRotationSettings = normalizeExportHdriRotationSettings();
    this._startRotationY = 0;
    this._startLightsRotation = 0;
    this._startHdriRotation = 0;
    this._hdriPreviewDriven = false;
    this._lightsAutoRotate = false;
    this._movements = normalizeExportVideoMovements();
    this._meshAnimation = normalizeExportMeshAnimationSettings();
    this._cameraDriveStarted = false;
  }

  isActive() {
    return this._active;
  }

  start(settings = {}) {
    if (!this.getCurrentModel?.()) {
      this.ui?.showToast?.('Load a mesh before previewing movement');
      return false;
    }

    const movements = normalizeExportVideoMovements(settings);
    const hdriRotationSettings = normalizeExportHdriRotationSettings(settings);
    if (!hasExportVideoMovement(movements) && !hdriRotationSettings.degrees) {
      this.ui?.showToast?.('Enable at least one movement or HDRI rotation to preview');
      return false;
    }

    if (this._active) this.stop({ silent: true });

    const allowedDurations = [5, 10, 15];
    this._durationSec = allowedDurations.includes(settings?.durationSec)
      ? settings.durationSec
      : 5;
    this._fps = settings?.fps === 30 || settings?.fps === 60 ? settings.fps : 24;
    this._spinSettings = normalizeExportSpinSettings(settings);
    this._hdriRotationSettings = normalizeExportHdriRotationSettings(settings);
    this._movements = movements;
    this._meshAnimation = normalizeExportMeshAnimationSettings(
      settings,
      this.getAnimationClipCount?.() ?? 0,
    );
    this._elapsed = 0;

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

    this._cameraDriveStarted = needsExportCameraDrive(movements);
    if (this._cameraDriveStarted) {
      this.beginExportCameraDrive();
    }
    this._fovDriveStarted = needsExportFovDrive(movements);
    if (this._fovDriveStarted) {
      this.beginExportFovDrive();
    }
    // Always enter export session (hold pose or drive clip) when GLB has animations.
    this.beginExportAnimationDrive(this._meshAnimation);
    this.beginFontTextRevealExportDrive();
    this._applyFrame(0, 0);

    this._active = true;
    this.onActiveChange(true);
    return true;
  }

  update(delta) {
    if (!this._active) return;
    const d = typeof delta === 'number' && Number.isFinite(delta) ? delta : 0;
    const duration = Math.max(1e-6, this._durationSec);
    this._elapsed += d;
    const loopElapsed = this._elapsed % duration;
    const t = loopElapsed / duration;
    const totalFrames = Math.max(1, Math.round(duration * this._fps));
    const frameIndex = Math.min(totalFrames - 1, Math.floor(loopElapsed * this._fps));
    this._applyFrame(t, frameIndex);
  }

  stop({ silent = false } = {}) {
    if (!this._active) return;
    this._applyFrame(0, 0);
    // Always end drives — idempotent, and guards against flag desync leaving orbit locked.
    this.endExportCameraDrive();
    this.endExportFovDrive();
    this.endExportAnimationDrive();
    this.endFontTextRevealExportDrive();
    this.setRotationY(this._startRotationY);
    this.stateStore.set('rotationY', this._startRotationY);
    if (this._lightsAutoRotate && typeof this.setLightsRotation === 'function') {
      this.setLightsRotation(this._startLightsRotation);
      this.stateStore.set('lightsRotation', this._startLightsRotation);
    }
    this._restorePreviewHdri();

    this._active = false;
    this._cameraDriveStarted = false;
    this._fovDriveStarted = false;
    this._elapsed = 0;
    this.onActiveChange(false);
    if (!silent) {
      this.ui?.showToast?.('Movement preview stopped');
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

  _applyFrame(t, frameIndex) {
    const movements = this._movements;
    const { rotationDegrees, signedRotationDegrees, sign } = this._spinSettings;
    if (movements.turntable && rotationDegrees > 0) {
      const rotationY = this._startRotationY + signedRotationDegrees * t;
      this.setRotationY(rotationY);
      this.stateStore.set('rotationY', rotationY);
    }
    if (this._cameraDriveStarted) {
      this.applyExportCameraDriveFrame(t, {
        rotationDegrees,
        rotationSign: sign,
        orbit: movements.orbit,
        zoom: movements.zoom,
        zoomDistance: movements.zoomDistance,
        tilt: movements.tilt,
        tiltAngle: movements.tiltAngle,
        pitchOffset: movements.pitchOffset,
      });
    }
    if (this._fovDriveStarted) {
      this.applyExportFovDriveFrame(t, movements.fovOffset);
    }
    if (this._meshAnimation.include && typeof frameIndex === 'number' && this._fps > 0) {
      this.applyExportAnimationDriveFrame(frameIndex, this._fps);
    }
    if (typeof frameIndex === 'number' && this._fps > 0) {
      this.applyFontTextRevealExportFrame(frameIndex, this._fps);
    }
    if (this._lightsAutoRotate && typeof this.setLightsRotation === 'function') {
      const lightsRotation = lightsRotationForExportFrame(
        this._startLightsRotation,
        this._durationSec,
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
      this.setHdriRotation(hdriRotation, { updateState: false, updateUi: false });
    }
  }
}
