import * as THREE from 'three';
import { expandBox3FromArmature } from '../import/bvhArmatureBounds.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/controls/OrbitControls.js';
import { orbitControlsNeedFrame } from '../scene/renderLoopIdle.js';
import { gsap } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js';
import { setCameraOrbitFromAngles } from '../camera/isometricView.js';
import {
  DEFAULT_CAMERA_POSITION,
  DEFAULT_CAMERA_TARGET,
} from '../camera/cameraDefaults.js';
import { clampFovDeg } from '../camera/lensPresets.js';
function defaultModelViewDirection() {
  return new THREE.Vector3(1.5, 0.7, 1.5).normalize();
}

function computeObjectBounds(object) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    expandBox3FromArmature(object, box);
  }
  return box;
}

/**
 * pos — fraction of camera–target distance for position wobble;
 * rot — degrees scale for pitch/yaw euler wobble;
 * dutch — max degrees for roll around the lens axis (independent slow noise, very subtle).
 */
const HANDHELD_PRESETS = {
  low: { pos: 0.000225, rot: 0.03, dutch: 0.18 },
  high: { pos: 0.00065625, rot: 0.09, dutch: 0.39 },
};

/** Remaining wheel-zoom multiplier eases toward 1 (OrbitControls dolly has no damping). */
const WHEEL_ZOOM_PENDING_EPS = 1e-5;
const WHEEL_ZOOM_DAMPING_MULT = 3;
const WHEEL_ZOOM_DAMPING_MAX = 0.22;

export class CameraController {
  constructor(
    camera,
    canvas,
    {
      initialFov = 60,
      getFocusPoint = null,
      onAltLightRotate = null,
      onAltLightRotateEnd = null,
      onAltLightHeight = null,
      onAltLightHeightEnd = null,
      onShiftHdriRotate = null,
      onShiftHdriRotateEnd = null,
      altLightRotateSensitivity = 0.5,
      altLightHeightSensitivity = 0.1,
      onModelBoundsChanged = null,
      onPoseChanged = null,
      onNeedRender = null,
      getIsGizmoDragging = null,
    } = {},
  ) {
    this.camera = camera;
    this.canvas = canvas;
    this.callbacks = {
      getFocusPoint,
      onAltLightRotate,
      onAltLightRotateEnd,
      onAltLightHeight,
      onAltLightHeightEnd,
      onShiftHdriRotate,
      onShiftHdriRotateEnd,
      onModelBoundsChanged,
      onPoseChanged,
      onNeedRender,
      getIsGizmoDragging,
    };
    this.altLightRotateSensitivity = altLightRotateSensitivity;
    this.altLightHeightSensitivity = altLightHeightSensitivity ?? 0.15;
    this.modelBounds = null;

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = true;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this._orbitOffset = new THREE.Vector3();
    this._orbitSpherical = new THREE.Spherical();
    this._panRight = new THREE.Vector3();
    this._panUp = new THREE.Vector3();
    this._panMove = new THREE.Vector3();
    this._dollyDirection = new THREE.Vector3();
    this._dollyOffset = new THREE.Vector3();
    this._tiltRollQuat = new THREE.Quaternion();
    this._tiltSyncedUp = new THREE.Vector3();
    this._tiltTowardTarget = new THREE.Vector3();
    this._tiltLocalRollAxis = new THREE.Vector3(0, 0, 1);
    this.handheldMode = 'off';
    this._handheldTime = 0;
    this._handheldPosLocal = new THREE.Vector3();
    this._handheldEuler = new THREE.Euler();
    this._handheldQuat = new THREE.Quaternion();
    this.camera.fov = initialFov;
    this.camera.updateProjectionMatrix();
    this._updateOrbitControls();

    this.currentTilt = 0;
    this._applyTilt();
    /** When true, update() skips OrbitControls+tilt until orbit/damping moves again. */
    this._orbitSolveLocked = true;
    this._orbitInteractionActive = false;

    // Auto-orbit state
    this.autoOrbitMode = 'off'; // 'off', 'slow', 'fast'
    this.autoOrbitTime = 0; // Time accumulator for smooth orbit
    this.autoOrbitBaseSpherical = null; // Store initial orbit position

    /** Video export / preview: timed camera path from current orbit-target framing. */
    this._exportCameraDriveActive = false;
    this._exportCameraSnapshot = null;
    this._preExportCameraControls = null;
    this._exportFovDriveActive = false;
    this._exportStartFov = null;

    this.altRightDragging = false;
    this.shiftRightDragging = false;
    this.altLeftDragging = false;
    this.altLeftTargetSet = false;
    this.lastMouseX = 0;
    this.originalControlState = {
      pan: this.controls.enablePan,
      rotate: this.controls.enableRotate,
    };

    /** @type {gsap.core.Timeline | null} */
    this._focusTimeline = null;
    this._focusGeneration = 0;

    this._isometricModeActive = false;
    this._isometricPanUnlocked = false;
    /** @type {{ position: THREE.Vector3, target: THREE.Vector3, tilt: number, minPolar: number, maxPolar: number, minAzimuth: number, maxAzimuth: number, enableRotate: boolean, enablePan: boolean } | null} */
    this._isometricRestoreSnapshot = null;

    /** Session-only export framing bookmark (position, target, tilt). */
    this._exportFramingBookmark = null;

    /** Export movement preview — orbit locked without timed camera drive (e.g. turntable-only). */
    this._previewViewportLockActive = false;
    this._prePreviewViewportControls = null;

    this._suppressPoseEvents = false;

    /** Wheel dolly intent — 1 = idle; >1 zoom in, <1 zoom out. Eased per frame in update(). */
    this._wheelZoomPendingScale = 1;
    this._wheelZoomInteractionActive = false;

    this._bindAltInteractions();
    this._bindOrbitPoseSync();
    this._bindWheelZoomSmoothing();
  }

  isIsometricModeActive() {
    return !!this._isometricModeActive;
  }

  getControls() {
    return this.controls;
  }

  isFocusAnimating() {
    return !!this._focusTimeline?.isActive?.();
  }

  hasViewportInteraction() {
    return (
      this.shiftRightDragging ||
      this.altRightDragging ||
      this.altLeftDragging
    );
  }

  /**
   * Keep the idle render loop alive during orbit drag, damping settle, and focus tweens.
   */
  needsContinuousOrbitFrames() {
    if (!this.controls?.enabled) return false;
    if (this._exportCameraDriveActive || this._previewViewportLockActive) return false;
    if (this.isWheelZoomSettling()) return true;
    if (this._orbitInteractionActive) return true;
    if (!this._orbitSolveLocked) return true;
    if (this.isFocusAnimating()) return true;
    if (this.hasViewportInteraction()) return true;
    return orbitControlsNeedFrame(this.controls);
  }

  isWheelZoomSettling() {
    return Math.abs(this._wheelZoomPendingScale - 1) > WHEEL_ZOOM_PENDING_EPS;
  }

  _wakeRender() {
    this.callbacks.onNeedRender?.();
  }

  getPose() {
    const target = this.controls?.target;
    const distance = target
      ? this.camera.position.distanceTo(target)
      : 0;
    return {
      position: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
      distance,
    };
  }

  emitPoseChanged({ persist = true } = {}) {
    this.callbacks.onPoseChanged?.({ ...this.getPose(), persist });
  }

  _emitPoseChanged(options) {
    this.emitPoseChanged(options);
  }

  /**
   * Set camera world position; orbit target stays fixed (view angle and distance may change).
   */
  setWorldPosition(x, y, z) {
    if (this._isometricModeActive) return;
    this._cancelFocusAnimation();
    this._unlockOrbitSolve();
    this._suppressPoseEvents = true;
    this.camera.position.set(x, y, z);
    this._updateOrbitControls();
    this._applyTilt();
    this._suppressPoseEvents = false;
    this._lockOrbitSolve();
    this._emitPoseChanged();
  }

  /**
   * Dolly along the camera→target axis to a fixed distance from the orbit target.
   */
  setDistance(distance) {
    if (this._isometricModeActive) return;
    this._cancelFocusAnimation();
    const target = this.controls?.target;
    if (!target) return;

    const nextDistance = Math.max(0.01, Number(distance) || 0.01);
    const offset = new THREE.Vector3().subVectors(this.camera.position, target);
    let direction;
    if (offset.lengthSq() < 1e-10) {
      direction = defaultModelViewDirection();
    } else {
      direction = offset.normalize();
    }

    this._unlockOrbitSolve();
    this._suppressPoseEvents = true;
    this.camera.position.copy(target).add(direction.multiplyScalar(nextDistance));
    this._updateOrbitControls();
    this._applyTilt();
    this._suppressPoseEvents = false;
    this._lockOrbitSolve();
    this._emitPoseChanged();
  }

  resetWorldPose() {
    this._cancelFocusAnimation();
    this._unlockOrbitSolve();
    this._suppressPoseEvents = true;
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
    this._updateOrbitControls();
    this._applyTilt();
    this._suppressPoseEvents = false;
    this._lockOrbitSolve();
    this._emitPoseChanged();
  }

  _bindOrbitPoseSync() {
    if (!this.controls) return;
    this.controls.addEventListener('start', () => {
      // TransformControls pointerdown runs after OrbitControls on the same canvas.
      // Defer so a gizmo grab is not treated as orbit (avoids one-frame camera drift).
      queueMicrotask(() => {
        if (this._getIsGizmoDragging()) {
          this._orbitInteractionActive = false;
          this._clearOrbitControlDeltas();
          this._lockOrbitSolve();
          return;
        }
        this._orbitInteractionActive = true;
        this._unlockOrbitSolve();
      });
    });
    this.controls.addEventListener('end', () => {
      queueMicrotask(() => {
        if (this._getIsGizmoDragging()) return;
        this._orbitInteractionActive = false;
        if (this._suppressPoseEvents || this._exportCameraDriveActive) return;
        if (this.autoOrbitMode !== 'off') return;
        this._emitPoseChanged({ persist: true });
      });
    });
  }

  _getIsGizmoDragging() {
    return !!this.callbacks.getIsGizmoDragging?.();
  }

  /** Lock orbit pose before mesh gizmo transforms (move / rotate / scale). */
  onMeshGizmoDragStart() {
    this._orbitInteractionActive = false;
    this._clearOrbitControlDeltas();
    this._lockOrbitSolve();
  }

  _clearOrbitControlDeltas() {
    if (this.controls?.sphericalDelta) {
      this.controls.sphericalDelta.set(0, 0, 0);
    }
    if (this.controls?.panOffset) {
      this.controls.panOffset.set(0, 0, 0);
    }
  }

  _unlockOrbitSolve() {
    this._orbitSolveLocked = false;
  }

  _lockOrbitSolve() {
    this._orbitSolveLocked = true;
  }

  /** Run OrbitControls.update + optional tilt; returns whether controls reported motion. */
  _runOrbitSolveAndTilt() {
    const changed = this._updateOrbitControls();
    if (!this._isometricModeActive) {
      this._applyTilt();
    }
    return changed;
  }

  _shouldRunOrbitSolve() {
    if (this._getIsGizmoDragging()) return false;
    if (!this._orbitSolveLocked) return true;
    if (this._orbitInteractionActive) return true;
    if (this.isFocusAnimating()) return true;
    if (this.hasViewportInteraction()) return true;
    return false;
  }

  /**
   * Set camera tilt (rotation around view direction - roll effect)
   * @param {number} degrees - Tilt angle in degrees (-45 to 45)
   */
  setTilt(degrees) {
    if (this._isometricModeActive) return;
    const n = typeof degrees === 'number' ? degrees : Number(degrees);
    this.currentTilt = Number.isFinite(n) ? n : 0;
    this._applyTilt();
  }

  /**
   * Handheld camera shake layered on top of orbit controls (must run after controls + tilt each frame).
   * @param {'off'|'low'|'high'} mode — legacy `medium` is treated as `high`
   */
  setHandheldMode(mode) {
    let m = mode;
    if (m === 'medium') m = 'high';
    const allowed = new Set(['off', 'low', 'high']);
    this.handheldMode = allowed.has(m) ? m : 'off';
    if (this.handheldMode === 'off') {
      this._handheldTime = 0;
    }
  }

  /**
   * Save orbit pose before isometric mode; disables orbit and pan (zoom still works).
   */
  beginIsometricMode() {
    if (this._isometricModeActive || !this.controls) return;
    this._isometricRestoreSnapshot = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      tilt: this.currentTilt,
      minPolar: this.controls.minPolarAngle,
      maxPolar: this.controls.maxPolarAngle,
      minAzimuth: this.controls.minAzimuthAngle,
      maxAzimuth: this.controls.maxAzimuthAngle,
      enableRotate: this.controls.enableRotate,
      enablePan: this.controls.enablePan,
    };
    this._isometricModeActive = true;
    this.currentTilt = 0;
    this._applyIsometricInteractionLock();
  }

  setIsometricPanUnlocked(unlocked) {
    this._isometricPanUnlocked = !!unlocked;
    if (this._isometricModeActive) {
      this._applyIsometricInteractionLock();
    }
  }

  _applyIsometricInteractionLock() {
    if (!this._isometricModeActive || !this.controls) return;
    this.controls.enableRotate = false;
    this.controls.enablePan = !!this._isometricPanUnlocked;
  }

  /**
   * Restore the pre-isometric orbit pose.
   */
  exitIsometricMode() {
    if (!this._isometricModeActive) return;
    const sn = this._isometricRestoreSnapshot;
    if (sn && this.controls) {
      this.camera.position.copy(sn.position);
      this.controls.target.copy(sn.target);
      this.currentTilt = sn.tilt;
      this.controls.minPolarAngle = sn.minPolar;
      this.controls.maxPolarAngle = sn.maxPolar;
      this.controls.minAzimuthAngle = sn.minAzimuth;
      this.controls.maxAzimuthAngle = sn.maxAzimuth;
      this.controls.enableRotate = sn.enableRotate;
      this.controls.enablePan = sn.enablePan;
    }
    this._isometricModeActive = false;
    this._isometricPanUnlocked = false;
    this._isometricRestoreSnapshot = null;
    this._unlockOrbitSolve();
    this._updateOrbitControls();
    this._applyTilt();
    this._lockOrbitSolve();
    this._emitPoseChanged();
  }

  /**
   * Aim at `target` with classic isometric yaw (Y) + elevation above ground (X tilt).
   */
  applyIsometricAngles(horizontalDeg, verticalDeg, target = null) {
    const orbitTarget = target ?? this.controls?.target;
    if (!orbitTarget || !this.controls) return;

    let distance = this.getTargetDistance();
    if (this.modelBounds?.radius > 0) {
      distance = Math.max(distance, this.modelBounds.radius * 2.2);
    }
    distance = Math.max(0.5, distance);

    // Release prior preset locks so OrbitControls does not snap back to the old pose.
    this._releaseIsometricOrbitLimits();

    setCameraOrbitFromAngles(
      this.camera,
      orbitTarget,
      distance,
      horizontalDeg,
      verticalDeg,
    );
    this.controls.target.copy(orbitTarget);

    if (this.controls.sphericalDelta) {
      this.controls.sphericalDelta.set(0, 0, 0);
    }
    this._unlockOrbitSolve();
    this._updateOrbitControls();
    this._lockIsometricOrbitPose();
    this._lockOrbitSolve();
    this._emitPoseChanged();
  }

  _releaseIsometricOrbitLimits() {
    if (!this.controls) return;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.minAzimuthAngle = -Infinity;
    this.controls.maxAzimuthAngle = Infinity;
  }

  /** Freeze azimuth and elevation — no gimbal while isometric mode is active. */
  _lockIsometricOrbitPose() {
    if (!this._isometricModeActive || !this.controls?.target) return;
    const target = this.controls.target;
    const offset = new THREE.Vector3().subVectors(this.camera.position, target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    this.controls.minPolarAngle = spherical.phi;
    this.controls.maxPolarAngle = spherical.phi;
    this.controls.minAzimuthAngle = spherical.theta;
    this.controls.maxAzimuthAngle = spherical.theta;
    this._applyIsometricInteractionLock();
  }

  /**
   * Apply procedural handheld offset to the current camera pose. Orbit math stays unaware;
   * this runs once per frame after OrbitControls and tilt.
   * @param {number} delta seconds
   */
  applyHandheldMotion(delta) {
    if (this._exportCameraDriveActive) return;
    if (this._isometricModeActive) return;
    if (this.handheldMode === 'off') return;
    const d = typeof delta === 'number' ? delta : 0;
    if (!Number.isFinite(d) || d <= 0 || d > 0.25) return;

    const preset = HANDHELD_PRESETS[this.handheldMode];
    if (!preset) return;

    this._handheldTime += d;
    const t = this._handheldTime;
    const dist = Math.max(0.25, this.getTargetDistance());
    const p = dist * preset.pos;
    const rDeg = preset.rot;

    const lx =
      (Math.sin(t * 2.1) * Math.cos(t * 0.37) + 0.35 * Math.sin(t * 5.3)) * p;
    const ly =
      (Math.cos(t * 1.8) * Math.sin(t * 0.52) + 0.28 * Math.sin(t * 4.8)) * p;
    let lz =
      (Math.sin(t * 1.3 + 0.7) * 0.45 + 0.2 * Math.sin(t * 3.1)) * p * 0.35;
    if (this.handheldMode === 'high') {
      lz +=
        Math.sin(t * 0.42 + 0.3) * p * 0.55 +
        Math.sin(t * 2.15) * Math.cos(t * 0.18) * p * 0.25;
    }

    this._handheldPosLocal.set(lx, ly, lz);
    this._handheldPosLocal.applyQuaternion(this.camera.quaternion);
    this.camera.position.add(this._handheldPosLocal);

    const r = THREE.MathUtils.degToRad(rDeg);
    const pitch =
      r *
      (Math.sin(t * 1.9 + 0.2) * Math.cos(t * 0.41) +
        0.4 * Math.sin(t * 4.2));
    const yaw =
      r *
      (Math.cos(t * 2.2) * Math.sin(t * 0.33) + 0.35 * Math.sin(t * 3.7));
    const roll =
      r *
      (Math.sin(t * 1.5 + 1.1) * Math.cos(t * 0.55) + 0.3 * Math.sin(t * 5.1));
    if (this.handheldMode === 'high') {
      const slow = r * 0.55 * Math.sin(t * 0.38 + 0.6);
      const yawExtra = r * 0.4 * Math.sin(t * 0.31);
      this._handheldEuler.set(
        pitch + slow * 0.35,
        yaw + yawExtra,
        roll + slow * 0.5,
        'YXZ',
      );
    } else {
      this._handheldEuler.set(pitch, yaw, roll, 'YXZ');
    }
    this._handheldQuat.setFromEuler(this._handheldEuler);
    this.camera.quaternion.multiply(this._handheldQuat);

    // Dutch roll around view axis (same local-Z roll as UI tilt).
    const dutchDeg = preset.dutch ?? 0;
    if (dutchDeg > 1e-6) {
      const dn =
        Math.sin(t * 1.07 + 0.45) * 0.52 +
        0.3 * Math.sin(t * 2.65 + 0.9) +
        0.22 * Math.sin(t * 3.38 + 0.15) +
        0.14 * Math.sin(t * 6.05 + 1.1) +
        0.12 * Math.sin(t * 0.31 + 0.55) +
        (this.handheldMode === 'high'
          ? 0.26 * Math.sin(t * 0.27 + 0.2) + 0.1 * Math.sin(t * 1.85)
          : 0);
      const dnClamped = THREE.MathUtils.clamp(dn, -1, 1);
      const dutchRad = THREE.MathUtils.degToRad(dutchDeg) * dnClamped;
      this._tiltRollQuat.setFromAxisAngle(this._tiltLocalRollAxis, dutchRad);
      this.camera.quaternion.multiply(this._tiltRollQuat);
    }

    this._tiltSyncedUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.camera.up.copy(this._tiltSyncedUp);
  }

  /**
   * OrbitControls uses `camera.up` as the orbit pole; `_applyTilt()` rolls afterward.
   * Reset to world Y before each update so spherical decompose matches tilt's neutral lookAt
   * and static repaints (state/UI tweaks) do not re-solve orientation differently.
   */
  _prepareOrbitControlsUpdate() {
    this.camera.up.set(0, 1, 0);
  }

  _updateOrbitControls() {
    this._prepareOrbitControlsUpdate();
    return this.controls.update();
  }

  /**
   * Apply tilt rotation to camera (called after OrbitControls updates)
   * Roll around the view axis using a local Z quaternion after a neutral lookAt —
   * avoids fragile pairing of custom camera.up with lookAt when values come from UI/state as strings.
   */
  _applyTilt({ uncapped = false } = {}) {
    const target = this.controls?.target;
    if (!target) return;

    const raw = Number(this.currentTilt);
    const clampedTilt = uncapped
      ? (Number.isFinite(raw) ? raw : 0)
      : THREE.MathUtils.clamp(Number.isFinite(raw) ? raw : 0, -45, 45);

    const towardTarget = this._tiltTowardTarget.subVectors(
      target,
      this.camera.position,
    );
    if (towardTarget.lengthSq() < 1e-10) return;

    // Zero-roll aim toward target (world up), then roll in camera-local space.
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);

    if (Math.abs(clampedTilt) >= 0.01) {
      const radians = THREE.MathUtils.degToRad(clampedTilt);
      this._tiltRollQuat.setFromAxisAngle(this._tiltLocalRollAxis, radians);
      this.camera.quaternion.multiply(this._tiltRollQuat);
      this._tiltSyncedUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.camera.up.copy(this._tiltSyncedUp);
    }
  }

  getTargetDistance() {
    if (!this.controls?.target) return 1;
    return this.camera.position.distanceTo(this.controls.target);
  }

  applyClipPlanes(near, far) {
    const nextNear = Math.max(0.001, Number(near) || 0.1);
    let nextFar = Math.max(nextNear + 0.1, Number(far) || nextNear + 1);
    if (nextFar / nextNear > 2000) nextFar = nextNear * 2000;
    if (
      Math.abs(this.camera.near - nextNear) < 1e-6
      && Math.abs(this.camera.far - nextFar) < 1e-4
    ) {
      return { near: this.camera.near, far: this.camera.far };
    }
    this.camera.near = nextNear;
    this.camera.far = nextFar;
    this.camera.updateProjectionMatrix();
    return { near: nextNear, far: nextFar };
  }

  orbit(deltaAzimuth, deltaPolar) {
    if (!this.controls || this._isometricModeActive) return;
    this._unlockOrbitSolve();
    if (Math.abs(deltaAzimuth) > 1e-4) {
      if (typeof this.controls.rotateLeft === 'function') {
        this.controls.rotateLeft(deltaAzimuth);
      } else if (this.controls.sphericalDelta) {
        this.controls.sphericalDelta.theta -= deltaAzimuth;
      } else {
        this._applyOrbitFallback(deltaAzimuth, 0);
      }
    }
    if (Math.abs(deltaPolar) > 1e-4) {
      if (typeof this.controls.rotateUp === 'function') {
        this.controls.rotateUp(deltaPolar);
      } else if (this.controls.sphericalDelta) {
        this.controls.sphericalDelta.phi -= deltaPolar;
      } else {
        this._applyOrbitFallback(0, deltaPolar);
      }
    }
    this._updateOrbitControls();
    if (this.autoOrbitMode === 'off') {
      this._applyTilt();
    }
    if (!this.controls.enableDamping) {
      this._lockOrbitSolve();
    }
  }

  pan(deltaX, deltaY) {
    if (!this.controls) return;
    if (this._isometricModeActive && !this._isometricPanUnlocked) return;
    if (Math.abs(deltaX) < 1e-5 && Math.abs(deltaY) < 1e-5) return;
    this._unlockOrbitSolve();
    if (typeof this.controls.pan === 'function') {
      this.controls.pan(deltaX, deltaY);
    } else if (this.camera) {
      this.camera.matrix.extractBasis(
        this._panRight,
        this._panUp,
        new THREE.Vector3(),
      );
      this._panRight.normalize().multiplyScalar(deltaX);
      this._panUp.normalize().multiplyScalar(deltaY);
      this._panMove.copy(this._panRight).add(this._panUp);
      this.camera.position.add(this._panMove);
      if (this.controls.target) {
        this.controls.target.add(this._panMove);
      }
    }
    this._updateOrbitControls();
    if (this.autoOrbitMode === 'off') {
      this._applyTilt();
    }
    if (!this.controls.enableDamping) {
      this._lockOrbitSolve();
    }
  }

  dolly(amount) {
    if (!this.controls || Math.abs(amount) < 1e-5) return;
    this._unlockOrbitSolve();
    const scale = 1 + Math.min(Math.abs(amount), 1);
    if (typeof this.controls.dollyIn === 'function') {
      if (amount > 0) {
        this.controls.dollyIn(scale);
      } else {
        this.controls.dollyOut(scale);
      }
    } else {
      const target = this.controls.target ?? new THREE.Vector3();
      this._dollyDirection
        .subVectors(target, this.camera.position)
        .normalize();
      const distance = amount;
      this._dollyOffset.copy(this._dollyDirection).multiplyScalar(distance);
      this.camera.position.add(this._dollyOffset);
      this.camera.lookAt(target);
    }
    this._updateOrbitControls();
    if (this.autoOrbitMode === 'off') {
      this._applyTilt();
    }
    if (!this.controls.enableDamping) {
      this._lockOrbitSolve();
    }
  }

  _applyOrbitFallback(deltaTheta, deltaPhi) {
    const target = this.controls.target ?? new THREE.Vector3();
    this._orbitOffset.copy(this.camera.position).sub(target);
    this._orbitSpherical.setFromVector3(this._orbitOffset);
    this._orbitSpherical.theta -= deltaTheta;
    this._orbitSpherical.phi -= deltaPhi;
    const EPS = 1e-4;
    this._orbitSpherical.phi = THREE.MathUtils.clamp(
      this._orbitSpherical.phi,
      EPS,
      Math.PI - EPS,
    );
    this._orbitOffset.setFromSpherical(this._orbitSpherical);
    this.camera.position.copy(target).add(this._orbitOffset);
    this.camera.lookAt(target);
  }

  /**
   * Begin timed export camera path (orbit and/or dolly zoom from current framing).
   */
  beginExportCameraDrive() {
    if (!this.controls || this._exportCameraDriveActive) return;
    this._preExportCameraControls = {
      pan: this.controls.enablePan,
      rotate: this.controls.enableRotate,
      zoom: this.controls.enableZoom,
      damping: this.controls.enableDamping,
    };
    const target = this.controls.target ?? new THREE.Vector3();
    this._orbitOffset.copy(this.camera.position).sub(target);
    this._orbitSpherical.setFromVector3(this._orbitOffset);
    this._exportCameraSnapshot = new THREE.Spherical().copy(this._orbitSpherical);
    this._exportCameraStartTilt = this.currentTilt;
    this._exportCameraDriveActive = true;
    this.controls.enablePan = false;
    this.controls.enableRotate = false;
    this.controls.enableZoom = false;
    this.controls.enableDamping = false;
  }

  /**
   * @param {number} t — progress in [0, 1] over export duration
   * @param {{ rotationDegrees?: number, rotationSign?: 1 | -1, spins?: 0 | 1 | 2, orbit?: boolean, zoom?: 'in' | 'out' | null, zoomDistance?: number, tilt?: 'left' | 'right' | null, tiltAngle?: number, pitchOffset?: number }} [options]
   */
  applyExportCameraDriveFrame(t, options = {}) {
    if (!this._exportCameraDriveActive || !this._exportCameraSnapshot || !this.controls?.target) {
      return;
    }
    const {
      orbit = false,
      zoom = null,
      zoomDistance = 0,
      tilt = null,
      tiltAngle = 0,
      pitchOffset = 0,
    } = options;
    let rotationDegrees = Number(options.rotationDegrees);
    let rotationSign = options.rotationSign === -1 ? -1 : 1;
    if (!Number.isFinite(rotationDegrees) && options.spins != null) {
      const legacySpins = options.spins === 2 ? 2 : options.spins === 0 ? 0 : 1;
      rotationDegrees = legacySpins * 360;
    }
    if (!Number.isFinite(rotationDegrees)) rotationDegrees = 360;
    const target = this.controls.target;
    const sn = this._exportCameraSnapshot;
    const u = THREE.MathUtils.clamp(typeof t === 'number' ? t : 0, 0, 1);

    let theta = sn.theta;
    if (orbit && rotationDegrees > 0) {
      theta = sn.theta + rotationSign * THREE.MathUtils.degToRad(rotationDegrees) * u;
    }

    let radius = sn.radius;
    const distance = Math.max(0, Number(zoomDistance) || 0);
    if (zoom === 'in' && distance > 0) {
      const minRadius = this.controls.minDistance ?? 0.01;
      // Cap travel so dolly eases over the full export duration — don't slam into minDistance early.
      const travel = Math.min(distance, Math.max(0, sn.radius - minRadius));
      radius = sn.radius - travel * u;
    } else if (zoom === 'out' && distance > 0) {
      const maxRadius = this.controls.maxDistance ?? Infinity;
      const travel = Math.min(distance, Math.max(0, maxRadius - sn.radius));
      radius = sn.radius + travel * u;
    }

    let phi = sn.phi;
    const pitch = Number(pitchOffset) || 0;
    if (Math.abs(pitch) > 1e-6) {
      const EPS = 1e-4;
      // Nod up (+) arcs the camera toward sky; nod down (−) toward ground — fixed orbit target.
      const endPhi = THREE.MathUtils.clamp(
        sn.phi - THREE.MathUtils.degToRad(pitch),
        EPS,
        Math.PI - EPS,
      );
      phi = sn.phi + (endPhi - sn.phi) * u;
    }

    this._orbitSpherical.set(radius, phi, theta);
    this._orbitOffset.setFromSpherical(this._orbitSpherical);
    this.camera.position.copy(target).add(this._orbitOffset);

    const startTilt = Number.isFinite(this._exportCameraStartTilt)
      ? this._exportCameraStartTilt
      : 0;
    const angle = THREE.MathUtils.clamp(Number(tiltAngle) || 0, 0, 180);
    if (tilt === 'left' && angle > 0) {
      this.currentTilt = startTilt - angle * u;
    } else if (tilt === 'right' && angle > 0) {
      this.currentTilt = startTilt + angle * u;
    } else {
      this.currentTilt = startTilt;
    }
    this._applyTilt({ uncapped: true });
  }

  /** Remember current orbit framing for this session (video export panel). */
  saveExportFramingBookmark({ rotationY = null } = {}) {
    if (!this.controls) return false;
    this._exportFramingBookmark = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      tilt: this.currentTilt,
      rotationY: Number.isFinite(rotationY) ? rotationY : null,
    };
    return true;
  }

  hasExportFramingBookmark() {
    return !!this._exportFramingBookmark;
  }

  getExportFramingBookmark() {
    return this._exportFramingBookmark;
  }

  /** Restore session export framing bookmark. Re-snapshots export drives when active. */
  restoreExportFramingBookmark() {
    const sn = this._exportFramingBookmark;
    if (!sn || !this.controls) return false;

    const wasCameraDrive = this._exportCameraDriveActive;
    const wasFovDrive = this._exportFovDriveActive;
    if (wasCameraDrive) {
      this.endExportCameraDrive({ revertToSnapshot: false });
    }
    if (wasFovDrive) {
      this.endExportFovDrive({ revertToStart: false });
    }

    this._cancelFocusAnimation();
    this._suppressPoseEvents = true;
    this.camera.position.copy(sn.position);
    this.controls.target.copy(sn.target);
    this.currentTilt = sn.tilt;
    if (this.controls.sphericalDelta) {
      this.controls.sphericalDelta.set(0, 0, 0);
    }
    this._unlockOrbitSolve();
    this._updateOrbitControls();
    this._applyTilt();
    this._lockOrbitSolve();
    this._suppressPoseEvents = false;
    this._emitPoseChanged({ persist: true });

    if (wasCameraDrive) {
      this.beginExportCameraDrive();
    }
    if (wasFovDrive) {
      this.beginExportFovDrive();
    }
    return true;
  }

  endExportCameraDrive({ revertToSnapshot = true } = {}) {
    if (!this._exportCameraDriveActive) return;
    const snapshot = this._exportCameraSnapshot;
    const target = this.controls?.target;
    if (revertToSnapshot && snapshot && target) {
      this._orbitSpherical.copy(snapshot);
      this._orbitOffset.setFromSpherical(this._orbitSpherical);
      this.camera.position.copy(target).add(this._orbitOffset);
    }
    this._exportCameraDriveActive = false;
    this._exportCameraSnapshot = null;
    if (revertToSnapshot && Number.isFinite(this._exportCameraStartTilt)) {
      this.currentTilt = this._exportCameraStartTilt;
    }
    this._exportCameraStartTilt = null;
    if (this._preExportCameraControls && this.controls) {
      this.controls.enablePan = this._preExportCameraControls.pan;
      this.controls.enableRotate = this._preExportCameraControls.rotate;
      this.controls.enableZoom = this._preExportCameraControls.zoom;
      this.controls.enableDamping = this._preExportCameraControls.damping;
    } else if (
      !this._previewViewportLockActive
      && this.controls
      && this.autoOrbitMode === 'off'
    ) {
      this.controls.enablePan = true;
      this.controls.enableRotate = true;
      this.controls.enableZoom = true;
      this.controls.enableDamping = true;
    }
    this._preExportCameraControls = null;
    this._updateOrbitControls();
    if (this.autoOrbitMode === 'off') {
      this._applyTilt();
    }
    this._lockOrbitSolve();
  }

  /** Lock orbit/pan/zoom while export preview is armed (when camera drive is not active). */
  beginPreviewViewportLock() {
    if (!this.controls || this._exportCameraDriveActive || this._previewViewportLockActive) {
      return;
    }
    this._prePreviewViewportControls = {
      pan: this.controls.enablePan,
      rotate: this.controls.enableRotate,
      zoom: this.controls.enableZoom,
      damping: this.controls.enableDamping,
    };
    this.controls.enablePan = false;
    this.controls.enableRotate = false;
    this.controls.enableZoom = false;
    this.controls.enableDamping = false;
    this._previewViewportLockActive = true;
  }

  endPreviewViewportLock() {
    if (!this._previewViewportLockActive || !this.controls) return;
    const saved = this._prePreviewViewportControls;
    if (saved) {
      this.controls.enablePan = saved.pan;
      this.controls.enableRotate = saved.rotate;
      this.controls.enableZoom = saved.zoom;
      this.controls.enableDamping = saved.damping;
    } else if (this.autoOrbitMode === 'off') {
      this.controls.enablePan = true;
      this.controls.enableRotate = true;
      this.controls.enableZoom = true;
      this.controls.enableDamping = true;
    }
    this._prePreviewViewportControls = null;
    this._previewViewportLockActive = false;
    this._updateOrbitControls();
    this._lockOrbitSolve();
  }

  isPreviewViewportLocked() {
    return !!this._previewViewportLockActive || !!this._exportCameraDriveActive;
  }

  /** Begin timed FOV animation from current lens FOV (independent of orbit/dolly drive). */
  beginExportFovDrive() {
    if (this._exportFovDriveActive) return;
    this._exportStartFov = this.camera?.fov ?? 45;
    this._exportFovDriveActive = true;
  }

  /**
   * @param {number} t — progress in [0, 1] over export duration
   * @param {number} [fovOffset] — degrees added linearly from start FOV (±40 max)
   */
  applyExportFovDriveFrame(t, fovOffset = 0) {
    if (!this._exportFovDriveActive || !Number.isFinite(this._exportStartFov)) return;
    const offset = Number(fovOffset) || 0;
    if (offset === 0) return;
    const u = THREE.MathUtils.clamp(typeof t === 'number' ? t : 0, 0, 1);
    const start = this._exportStartFov;
    const travel = clampFovDeg(start + offset) - start;
    this.camera.fov = clampFovDeg(start + travel * u);
    this.camera.updateProjectionMatrix();
  }

  endExportFovDrive({ revertToStart = true } = {}) {
    if (!this._exportFovDriveActive) return;
    if (revertToStart && Number.isFinite(this._exportStartFov) && this.camera) {
      this.camera.fov = this._exportStartFov;
      this.camera.updateProjectionMatrix();
    }
    this._exportFovDriveActive = false;
    this._exportStartFov = null;
  }

  isExportFovDriving() {
    return !!this._exportFovDriveActive;
  }

  isExportCameraDriving() {
    return !!this._exportCameraDriveActive;
  }

  /** @deprecated use beginExportCameraDrive */
  beginExportOrbitDrive() {
    this.beginExportCameraDrive();
  }

  /** @deprecated use applyExportCameraDriveFrame */
  applyExportOrbitDriveFrame(t, spins = 1) {
    this.applyExportCameraDriveFrame(t, { spins, orbit: true });
  }

  /** @deprecated use endExportCameraDrive */
  endExportOrbitDrive() {
    this.endExportCameraDrive();
  }

  /** @deprecated use isExportCameraDriving */
  isExportOrbitDriving() {
    return this.isExportCameraDriving();
  }

  /**
   * Set auto-orbit mode
   * @param {string} mode - 'off', 'slow', or 'fast'
   */
  setAutoOrbit(mode) {
    this.autoOrbitMode = mode;
    const isActive = mode !== 'off';
    
    if (isActive) {
      // Store current orbit position when starting
      // Use current controls target (where camera is already looking) to avoid jump-cut
      // User can press 'F' to focus on object if they want to orbit around model center
      const target = this.controls.target ?? new THREE.Vector3();
      this._orbitOffset.copy(this.camera.position).sub(target);
      this._orbitSpherical.setFromVector3(this._orbitOffset);
      this.autoOrbitBaseSpherical = this._orbitSpherical.clone();
      this.autoOrbitTime = 0;
      
      // Disable all mouse controls during auto-orbit
      this.controls.enablePan = false;
      this.controls.enableRotate = false;
      this.controls.enableZoom = false; // Disable zoom during auto-orbit
      this.controls.enableDamping = false; // Disable damping to prevent interference
    } else {
      // Restore normal controls when auto-orbit is off
      if (this._isometricModeActive) {
        this._applyIsometricInteractionLock();
      } else {
        this.controls.enablePan = true;
        this.controls.enableRotate = true;
      }
      this.controls.enableZoom = true; // Re-enable zoom
      this.controls.enableDamping = true;
      this.autoOrbitBaseSpherical = null;
    }
  }

  /**
   * Update auto-orbit camera movement
   * Creates interesting multi-axis orbits for screensaver effect
   * @param {number} delta - Time delta in seconds
   */
  updateAutoOrbit(delta) {
    if (this._exportCameraDriveActive) return;
    if (this._isometricModeActive) return;
    if (this.autoOrbitMode === 'off' || !this.autoOrbitBaseSpherical) return;

    // Speed multipliers
    const speeds = {
      slow: 0.15,
      fast: 0.4,
    };
    const speed = speeds[this.autoOrbitMode] || 0;

    this.autoOrbitTime += delta * speed;

    // Use current controls target (where we're orbiting around)
    // This stays consistent with where we started orbiting from
    const target = this.controls.target ?? new THREE.Vector3();
    
    // Create interesting multi-axis orbit pattern
    // Combine horizontal rotation with vertical oscillation and distance variation
    const horizontalSpeed = 1.0; // Full rotation around Y axis
    const verticalSpeed = 0.6; // Slower vertical oscillation
    const distanceSpeed = 0.4; // Even slower distance variation
    
    // Horizontal rotation (theta) - full 360° rotation
    const theta = this.autoOrbitBaseSpherical.theta + this.autoOrbitTime * horizontalSpeed;
    
    // Vertical oscillation (phi) - oscillates between 30° and 80° for interesting angles
    const basePhi = this.autoOrbitBaseSpherical.phi;
    const phiRange = 0.4; // ~23° range
    const phiOffset = Math.sin(this.autoOrbitTime * verticalSpeed) * phiRange;
    const phi = THREE.MathUtils.clamp(
      basePhi + phiOffset,
      0.3, // ~17° from top
      Math.PI - 0.5 // ~29° from bottom
    );
    
    // Distance variation - subtle zoom in/out effect
    const baseRadius = this.autoOrbitBaseSpherical.radius;
    const radiusVariation = 0.15; // 15% variation
    const radiusOffset = Math.sin(this.autoOrbitTime * distanceSpeed) * radiusVariation;
    const radius = baseRadius * (1 + radiusOffset);
    
    // Apply orbit
    this._orbitSpherical.set(radius, phi, theta);
    this._orbitOffset.setFromSpherical(this._orbitSpherical);
    this.camera.position.copy(target).add(this._orbitOffset);
    this.controls.target.copy(target);
    // Apply roll after scripted pose (do not run OrbitControls.update here).
    this._applyTilt();
  }

  update() {
    if (this._exportCameraDriveActive) return;
    // Only update controls if auto-orbit is off (to prevent interference)
    // When auto-orbit is on, updateAutoOrbit sets pose then _applyTilt() there.
    if (this.autoOrbitMode === 'off') {
      const zoomSettling = this.isWheelZoomSettling();
      if (zoomSettling) {
        this._unlockOrbitSolve();
      }

      const runOrbitSolve = this._shouldRunOrbitSolve();
      if (!runOrbitSolve && !zoomSettling) {
        if (this._wheelZoomInteractionActive) {
          this._finalizeWheelZoomInteraction();
        }
        return;
      }

      let changed = false;
      if (runOrbitSolve) {
        changed = this._runOrbitSolveAndTilt();
      }

      if (zoomSettling) {
        const zoomChanged = this._applyWheelZoomSmoothing();
        if (zoomChanged) {
          this._applyTilt();
        }
        changed = changed || zoomChanged;
      }

      if (this._getIsGizmoDragging()) {
        // Mesh gizmo drag — keep the settled orbit pose frozen.
      } else if (zoomSettling || this._wheelZoomInteractionActive) {
        this._orbitSolveLocked = false;
      } else if (
        !this._orbitInteractionActive &&
        !this.isFocusAnimating() &&
        !this.hasViewportInteraction()
      ) {
        // OrbitControls.update() returns false once damping / inertia has settled.
        this._orbitSolveLocked = !changed;
      } else {
        this._orbitSolveLocked = false;
      }

      if (!this.isWheelZoomSettling() && this._wheelZoomInteractionActive) {
        this._finalizeWheelZoomInteraction();
      }
    }
  }

  /**
   * Get the current model bounds
   * @returns {Object|null} Model bounds object with box, size, center, radius
   */
  getModelBounds() {
    return this.modelBounds;
  }

  /**
   * Recompute cached model bounds without moving the camera (e.g. after center pivot).
   * @param {THREE.Object3D} object
   * @returns {Object|null}
   */
  refreshModelBounds(object) {
    if (!object) return null;
    const box = computeObjectBounds(object);
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    this.modelBounds = { box, size, center, radius: size.length() / 2 };
    this.callbacks.onModelBoundsChanged?.(this.modelBounds);
    return this.modelBounds;
  }

  /**
   * Fit camera to an object, calculating bounds and positioning camera
   * @param {THREE.Object3D} object - The object to fit the camera to
   */
  fitCameraToObject(object) {
    const box = computeObjectBounds(object);
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      this.modelBounds = { box, size, center, radius: size.length() / 2 };
      
      // Notify other systems that model bounds have changed
      this.callbacks.onModelBoundsChanged?.(this.modelBounds);
      
      // Adjust target point downward so mesh appears higher in frame (less bottom-heavy)
      // Moving target DOWN makes the mesh appear HIGHER in the frame
      const adjustedCenter = center.clone();
      adjustedCenter.y -= size.y * 0.05; // Negative Y = down, which makes mesh appear higher
      
      this.controls.target.copy(adjustedCenter);
      const distance = (this.modelBounds.radius * 2.2 || 5) * 0.85;
      const direction = defaultModelViewDirection();
      this.camera.position.copy(adjustedCenter.clone().add(direction.multiplyScalar(distance)));
      this._unlockOrbitSolve();
      this._updateOrbitControls();
      if (this.autoOrbitMode === 'off') {
        this._applyTilt();
      }
      this._lockOrbitSolve();
      this._emitPoseChanged();
    }
  }

  _cancelFocusAnimation() {
    if (this._focusTimeline) {
      this._focusTimeline.kill();
      this._focusTimeline = null;
    }
    this._restoreFocusOrbitControls();
  }

  _restoreFocusOrbitControls() {
    if (this._isometricModeActive) {
      this._applyIsometricInteractionLock();
    } else {
      const pan = this.originalControlState?.pan;
      const rotate = this.originalControlState?.rotate;
      this.controls.enablePan = pan ?? true;
      this.controls.enableRotate = rotate ?? true;
    }
    this.controls.enabled = true;
    this._updateOrbitControls();
  }

  /**
   * Smoothly animate camera to focus on an object
   * @param {THREE.Object3D} object - The object to focus on
   * @param {number} duration - Animation duration in seconds (default: 1.0)
   */
  focusOnObjectAnimated(object, duration = 1.0) {
    const box = computeObjectBounds(object);
    if (box.isEmpty()) return;

    this._cancelFocusAnimation();

    this._unlockOrbitSolve();

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    this.modelBounds = { box, size, center, radius: size.length() / 2 };

    this.callbacks.onModelBoundsChanged?.(this.modelBounds);

    const adjustedCenter = center.clone();
    adjustedCenter.y -= size.y * 0.05;

    const distance = (this.modelBounds.radius * 2.2 || 5) * 0.85;
    const direction = defaultModelViewDirection();
    const targetPosition = adjustedCenter.clone().add(direction.multiplyScalar(distance));
    const targetPoint = adjustedCenter.clone();

    const startPosition = this.camera.position.clone();
    const startTarget = this.controls.target.clone();

    this.controls.enablePan = false;
    this.controls.enableRotate = false;

    const positionObj = { x: startPosition.x, y: startPosition.y, z: startPosition.z };
    const targetObj = { x: startTarget.x, y: startTarget.y, z: startTarget.z };

    const generation = ++this._focusGeneration;
    this._focusTimeline = gsap.timeline({
      onComplete: () => {
        if (generation !== this._focusGeneration) return;
        this._focusTimeline = null;
        this._restoreFocusOrbitControls();
        if (this.autoOrbitMode === 'off') {
          this._applyTilt();
        }
        this._lockOrbitSolve();
        this._emitPoseChanged();
      },
    });
    this._wakeRender();

    this._focusTimeline.to(
      positionObj,
      {
        x: targetPosition.x,
        y: targetPosition.y,
        z: targetPosition.z,
        duration,
        ease: 'power2.inOut',
        onUpdate: () => {
          this.camera.position.set(positionObj.x, positionObj.y, positionObj.z);
          this._wakeRender();
        },
      },
      0,
    );

    this._focusTimeline.to(
      targetObj,
      {
        x: targetPoint.x,
        y: targetPoint.y,
        z: targetPoint.z,
        duration,
        ease: 'power2.inOut',
        onUpdate: () => {
          this.controls.target.set(targetObj.x, targetObj.y, targetObj.z);
          this._applyTilt();
          this._wakeRender();
        },
      },
      0,
    );
  }

  /**
   * Apply a camera preset (front, left, right, top)
   * @param {string} preset - Preset name
   */
  applyCameraPreset(preset) {
    if (this._isometricModeActive) return;
    this._cancelFocusAnimation();

    const target =
      this.modelBounds?.center?.clone()
      ?? this.controls?.target?.clone()
      ?? new THREE.Vector3(0, 1, 0);
    const radius = this.modelBounds?.radius ?? 1;
    const distance = radius * 2.4 || 5;
    const yLift = radius * 0.2;
    let position;

    if (preset === 'front') {
      position = target.clone().add(new THREE.Vector3(0, yLift, distance));
    } else if (preset === 'left') {
      position = target.clone().add(new THREE.Vector3(-distance, yLift, 0));
    } else if (preset === 'right') {
      position = target.clone().add(new THREE.Vector3(distance, yLift, 0));
    } else if (preset === 'top') {
      position = target.clone().add(new THREE.Vector3(0, distance, 0.0001));
    } else if (preset === 'three-quarter') {
      position = target
        .clone()
        .add(new THREE.Vector3(distance, yLift * 2, distance));
    }

    if (position) {
      this._unlockOrbitSolve();
      this._suppressPoseEvents = true;
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this._updateOrbitControls();
      if (this.autoOrbitMode === 'off') {
        this._applyTilt();
      }
      this._suppressPoseEvents = false;
      this._lockOrbitSolve();
      this._emitPoseChanged();
    }
  }

  dispose() {
    this._cancelFocusAnimation();
    this._isometricModeActive = false;
    this._isometricPanUnlocked = false;
    this._isometricRestoreSnapshot = null;
    this._unbindWheelZoomSmoothing();
    this.controls.dispose();
    this._unbindAltInteractions();
  }

  _bindWheelZoomSmoothing() {
    this._wheelHandler = (event) => {
      const controls = this.controls;
      if (!controls?.enabled || !controls.enableZoom) return;
      if (
        this._isometricModeActive
        || this._exportCameraDriveActive
        || this._previewViewportLockActive
        || this.autoOrbitMode !== 'off'
      ) {
        return;
      }
      if (this._getIsGizmoDragging()) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const deltaY = this._normalizeWheelDeltaY(event);
      if (!deltaY) return;

      const dollyScale = Math.pow(
        0.95,
        controls.zoomSpeed * Math.abs(deltaY * 0.01),
      );
      if (deltaY < 0) {
        this._wheelZoomPendingScale *= dollyScale;
      } else {
        this._wheelZoomPendingScale /= dollyScale;
      }

      this._beginWheelZoomInteraction();
      this._unlockOrbitSolve();
      this._wakeRender();
    };

    this.canvas.addEventListener('wheel', this._wheelHandler, {
      passive: false,
      capture: true,
    });
  }

  _unbindWheelZoomSmoothing() {
    if (!this._wheelHandler) return;
    this.canvas.removeEventListener('wheel', this._wheelHandler, { capture: true });
    this._wheelHandler = null;
  }

  /**
   * Match OrbitControls `customWheelEvent` so Chrome/Brave/Safari share the same zoom scale.
   * @param {WheelEvent} event
   */
  _normalizeWheelDeltaY(event) {
    let deltaY = event.deltaY;
    switch (event.deltaMode) {
      case 1:
        deltaY *= 16;
        break;
      case 2:
        deltaY *= 100;
        break;
      default:
        break;
    }

    const controlActive =
      this._orbitInteractionActive
      || (typeof this.controls?.state === 'number' && this.controls.state !== -1);
    if (event.ctrlKey && !controlActive) {
      deltaY *= 10;
    }

    return deltaY;
  }

  _beginWheelZoomInteraction() {
    if (this._wheelZoomInteractionActive) return;
    this._wheelZoomInteractionActive = true;
    this.controls.dispatchEvent({ type: 'start' });
    queueMicrotask(() => {
      if (this._getIsGizmoDragging()) {
        this._wheelZoomInteractionActive = false;
        this._wheelZoomPendingScale = 1;
        return;
      }
      this._orbitInteractionActive = true;
      this._unlockOrbitSolve();
    });
  }

  _finalizeWheelZoomInteraction() {
    if (!this._wheelZoomInteractionActive) return;
    this._wheelZoomInteractionActive = false;
    this._wheelZoomPendingScale = 1;
    this._applyTilt();
    this._lockOrbitSolve();
    this.controls.dispatchEvent({ type: 'end' });
    queueMicrotask(() => {
      if (this._getIsGizmoDragging()) return;
      this._orbitInteractionActive = false;
      if (this._suppressPoseEvents || this._exportCameraDriveActive) return;
      if (this.autoOrbitMode !== 'off') return;
      this._emitPoseChanged({ persist: true });
    });
  }

  /**
   * Ease accumulated wheel zoom toward the camera each frame (rotation already damped).
   * @returns {boolean}
   */
  _applyWheelZoomSmoothing() {
    const pending = this._wheelZoomPendingScale;
    if (Math.abs(pending - 1) <= WHEEL_ZOOM_PENDING_EPS) {
      this._wheelZoomPendingScale = 1;
      return false;
    }

    const damping = this.controls?.dampingFactor ?? 0.05;
    const alpha = Math.min(WHEEL_ZOOM_DAMPING_MAX, damping * WHEEL_ZOOM_DAMPING_MULT);
    const step = 1 + (pending - 1) * alpha;
    this._wheelZoomPendingScale = 1 + (pending - 1) * (1 - alpha);

    const target = this.controls?.target;
    if (!target) return false;

    this._orbitOffset.subVectors(this.camera.position, target);
    this._orbitSpherical.setFromVector3(this._orbitOffset);

    const minDist = this.controls.minDistance ?? 0;
    const maxDist = this.controls.maxDistance ?? Infinity;
    const prevRadius = this._orbitSpherical.radius;
    this._orbitSpherical.radius = THREE.MathUtils.clamp(
      this._orbitSpherical.radius * step,
      minDist,
      maxDist,
    );

    if (Math.abs(this._orbitSpherical.radius - prevRadius) < 1e-8) {
      this._wheelZoomPendingScale = 1;
      return false;
    }

    this._orbitOffset.setFromSpherical(this._orbitSpherical);
    this.camera.position.copy(target).add(this._orbitOffset);
    this._updateOrbitControls();
    return true;
  }

  _bindAltInteractions() {
    this.mousedownHandler = (event) => {
      if (event.shiftKey && !event.altKey && event.button === 2) {
        event.preventDefault();
        event.stopPropagation();
        this.shiftRightDragging = true;
        this.lastMouseX = event.clientX;
        this._storeControlState();
        this.controls.enablePan = false;
        this.controls.enableRotate = false;
        this._wakeRender();
        return;
      }

      if (!event.altKey) return;

      if (event.button === 2) {
        event.preventDefault();
        event.stopPropagation();
        this.altRightDragging = true;
        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;
        this._storeControlState();
        this.controls.enablePan = false;
        this.controls.enableRotate = false;
        this._wakeRender();
      } else if (event.button === 0) {
        event.preventDefault();
        event.stopPropagation();
        this.altLeftDragging = true;
        this.altLeftTargetSet = false;
        this._focusOnModelCenter(true);
        this._wakeRender();
      }
    };

    this.mousemoveHandler = (event) => {
      if (this.shiftRightDragging) {
        const deltaX = event.clientX - this.lastMouseX;
        this.lastMouseX = event.clientX;
        if (Math.abs(deltaX) > 0) {
          const deltaDegrees = deltaX * this.altLightRotateSensitivity;
          this.callbacks.onShiftHdriRotate?.(deltaDegrees);
        }
      } else if (this.altRightDragging) {
        const deltaX = event.clientX - this.lastMouseX;
        const deltaY = event.clientY - this.lastMouseY;
        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;
        
        // Horizontal movement = light rotation
        if (Math.abs(deltaX) > 0) {
          const deltaDegrees = deltaX * this.altLightRotateSensitivity;
          this.callbacks.onAltLightRotate?.(deltaDegrees);
        }
        
        // Vertical movement = light height
        if (Math.abs(deltaY) > 0) {
          const deltaHeight = -deltaY * this.altLightHeightSensitivity; // Negative so up = higher
          this.callbacks.onAltLightHeight?.(deltaHeight);
        }
      } else if (this.altLeftDragging) {
        this._focusOnModelCenter(true);
      }
    };

    this.mouseupHandler = (event) => {
      if (this.shiftRightDragging && event.button === 2) {
        this.shiftRightDragging = false;
        this._restoreControlState();
        this.callbacks.onShiftHdriRotateEnd?.();
      } else if (this.altRightDragging && event.button === 2) {
        this.altRightDragging = false;
        this._restoreControlState();
        this.callbacks.onAltLightRotateEnd?.();
        this.callbacks.onAltLightHeightEnd?.();
      } else if (this.altLeftDragging && event.button === 0) {
        this.altLeftDragging = false;
        this.altLeftTargetSet = false;
      }
    };

    this.mouseleaveHandler = () => {
      if (this.shiftRightDragging) {
        this.shiftRightDragging = false;
        this._restoreControlState();
        this.callbacks.onShiftHdriRotateEnd?.();
      }
      if (this.altRightDragging) {
        this.altRightDragging = false;
        this._restoreControlState();
        this.callbacks.onAltLightRotateEnd?.();
        this.callbacks.onAltLightHeightEnd?.();
      }
      if (this.altLeftDragging) {
        this.altLeftDragging = false;
        this.altLeftTargetSet = false;
      }
    };

    this.contextMenuHandler = (event) => {
      if (event.altKey || event.shiftKey) {
        event.preventDefault();
      }
    };

    this.canvas.addEventListener('mousedown', this.mousedownHandler);
    window.addEventListener('mousemove', this.mousemoveHandler);
    window.addEventListener('mouseup', this.mouseupHandler);
    this.canvas.addEventListener('mouseleave', this.mouseleaveHandler);
    this.canvas.addEventListener('contextmenu', this.contextMenuHandler);
  }

  _unbindAltInteractions() {
    this.canvas.removeEventListener('mousedown', this.mousedownHandler);
    window.removeEventListener('mousemove', this.mousemoveHandler);
    window.removeEventListener('mouseup', this.mouseupHandler);
    this.canvas.removeEventListener('mouseleave', this.mouseleaveHandler);
    this.canvas.removeEventListener('contextmenu', this.contextMenuHandler);
  }

  _storeControlState() {
    this.originalControlState = {
      pan: this.controls.enablePan,
      rotate: this.controls.enableRotate,
    };
  }

  _restoreControlState() {
    if (this._isometricModeActive) {
      this._applyIsometricInteractionLock();
      return;
    }
    if (this.originalControlState) {
      this.controls.enablePan =
        this.originalControlState.pan ?? this.controls.enablePan;
      this.controls.enableRotate =
        this.originalControlState.rotate ?? this.controls.enableRotate;
    }
  }

  _focusOnModelCenter(forceUpdate = false) {
    if (!forceUpdate && this.altLeftTargetSet) return;

    // Prefer modelBounds center if available, otherwise use callback
    let point = null;
    if (this.modelBounds?.center) {
      point = this.modelBounds.center;
    } else if (this.callbacks.getFocusPoint) {
      point = this.callbacks.getFocusPoint();
    }
    
    if (!point) return;

    this._unlockOrbitSolve();
    this.controls.target.copy(point);
    this._updateOrbitControls();
    if (this.autoOrbitMode === 'off') {
      this._applyTilt();
    }
    this._lockOrbitSolve();
    this.altLeftTargetSet = true;
  }
}

