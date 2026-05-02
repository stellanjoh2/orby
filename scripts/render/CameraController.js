import * as THREE from 'three';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/controls/OrbitControls.js';
import { gsap } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js';

function defaultModelViewDirection() {
  return new THREE.Vector3(1.5, 0.7, 1.5).normalize();
}

/**
 * pos — fraction of camera–target distance for position wobble;
 * rot — degrees scale for pitch/yaw euler wobble;
 * dutch — max degrees for roll around the lens axis (independent slow noise, very subtle).
 */
const HANDHELD_PRESETS = {
  low: { pos: 0.00045, rot: 0.06, dutch: 0.1575 },
  high: { pos: 0.0013125, rot: 0.18, dutch: 0.36 },
};

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
      altLightRotateSensitivity = 0.5,
      altLightHeightSensitivity = 0.1,
      onModelBoundsChanged = null,
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
      onModelBoundsChanged,
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
    this.controls.update();

    this.currentTilt = 0;
    this._applyTilt();

    // Auto-orbit state
    this.autoOrbitMode = 'off'; // 'off', 'slow', 'fast'
    this.autoOrbitTime = 0; // Time accumulator for smooth orbit
    this.autoOrbitBaseSpherical = null; // Store initial orbit position

    this.altRightDragging = false;
    this.altLeftDragging = false;
    this.altLeftTargetSet = false;
    this.lastMouseX = 0;
    this.originalControlState = {
      pan: this.controls.enablePan,
      rotate: this.controls.enableRotate,
    };

    this._bindAltInteractions();
  }

  getControls() {
    return this.controls;
  }

  /**
   * Set camera tilt (rotation around view direction - roll effect)
   * @param {number} degrees - Tilt angle in degrees (-45 to 45)
   */
  setTilt(degrees) {
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
   * Apply procedural handheld offset to the current camera pose. Orbit math stays unaware;
   * this runs once per frame after OrbitControls and tilt.
   * @param {number} delta seconds
   */
  applyHandheldMotion(delta) {
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

    // Dutch roll around view axis (same local-Z roll as UI tilt) — reads clearly at subtle amps.
    const dutchDeg = preset.dutch ?? 0;
    if (dutchDeg > 1e-6) {
      const dn =
        Math.sin(t * 1.07 + 0.45) * 0.55 +
        0.32 * Math.sin(t * 2.65 + 0.9) +
        (this.handheldMode === 'high' ? 0.22 * Math.sin(t * 0.27 + 0.2) : 0);
      const dutchRad = THREE.MathUtils.degToRad(dutchDeg) * dn;
      this._tiltRollQuat.setFromAxisAngle(this._tiltLocalRollAxis, dutchRad);
      this.camera.quaternion.multiply(this._tiltRollQuat);
    }

    this._tiltSyncedUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.camera.up.copy(this._tiltSyncedUp);
  }

  /**
   * Apply tilt rotation to camera (called after OrbitControls updates)
   * Roll around the view axis using a local Z quaternion after a neutral lookAt —
   * avoids fragile pairing of custom camera.up with lookAt when values come from UI/state as strings.
   */
  _applyTilt() {
    const target = this.controls?.target;
    if (!target) return;

    const raw = Number(this.currentTilt);
    const clampedTilt = THREE.MathUtils.clamp(
      Number.isFinite(raw) ? raw : 0,
      -45,
      45,
    );

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

  orbit(deltaAzimuth, deltaPolar) {
    if (!this.controls) return;
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
    this.controls.update();
    if (this.autoOrbitMode === 'off') {
      this._applyTilt();
    }
  }

  pan(deltaX, deltaY) {
    if (!this.controls) return;
    if (Math.abs(deltaX) < 1e-5 && Math.abs(deltaY) < 1e-5) return;
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
    this.controls.update();
    if (this.autoOrbitMode === 'off') {
      this._applyTilt();
    }
  }

  dolly(amount) {
    if (!this.controls || Math.abs(amount) < 1e-5) return;
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
    this.controls.update();
    if (this.autoOrbitMode === 'off') {
      this._applyTilt();
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
      this.controls.enablePan = true;
      this.controls.enableRotate = true;
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
    // Only update controls if auto-orbit is off (to prevent interference)
    // When auto-orbit is on, updateAutoOrbit sets pose then _applyTilt() there.
    if (this.autoOrbitMode === 'off') {
      this.controls.update();
      this._applyTilt();
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
   * Fit camera to an object, calculating bounds and positioning camera
   * @param {THREE.Object3D} object - The object to fit the camera to
   */
  fitCameraToObject(object) {
    const box = new THREE.Box3().setFromObject(object);
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
      this.camera.near = Math.max(0.01, distance / 200);
      this.camera.far = distance * 50;
      this.camera.updateProjectionMatrix();
      this.controls.update();
      if (this.autoOrbitMode === 'off') {
        this._applyTilt();
      }
    }
  }

  /**
   * Smoothly animate camera to focus on an object
   * @param {THREE.Object3D} object - The object to focus on
   * @param {number} duration - Animation duration in seconds (default: 1.0)
   */
  focusOnObjectAnimated(object, duration = 1.0) {
    const box = new THREE.Box3().setFromObject(object);
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      this.modelBounds = { box, size, center, radius: size.length() / 2 };
      
      // Notify other systems that model bounds have changed
      this.callbacks.onModelBoundsChanged?.(this.modelBounds);
      
      // Calculate target position and target point
      // Adjust target point downward so mesh appears higher in frame (less bottom-heavy)
      // Moving target DOWN makes the mesh appear HIGHER in the frame
      const adjustedCenter = center.clone();
      adjustedCenter.y -= size.y * 0.05; // Negative Y = down, which makes mesh appear higher
      
      const distance = (this.modelBounds.radius * 2.2 || 5) * 0.85;
      const direction = defaultModelViewDirection();
      const targetPosition = adjustedCenter.clone().add(direction.multiplyScalar(distance));
      const targetPoint = adjustedCenter.clone();
      
      // Store current values for animation
      const startPosition = this.camera.position.clone();
      const startTarget = this.controls.target.clone();
      
      // Temporarily disable controls during animation
      const wasPanEnabled = this.controls.enablePan;
      const wasRotateEnabled = this.controls.enableRotate;
      this.controls.enablePan = false;
      this.controls.enableRotate = false;
      
      // Create temporary objects for GSAP animation
      const positionObj = { x: startPosition.x, y: startPosition.y, z: startPosition.z };
      const targetObj = { x: startTarget.x, y: startTarget.y, z: startTarget.z };
      
      // Animate camera position and target together
      gsap.to(positionObj, {
        x: targetPosition.x,
        y: targetPosition.y,
        z: targetPosition.z,
        duration: duration,
        ease: 'power2.inOut',
        onUpdate: () => {
          this.camera.position.set(positionObj.x, positionObj.y, positionObj.z);
        },
      });
      
      // Animate controls target
      gsap.to(targetObj, {
        x: targetPoint.x,
        y: targetPoint.y,
        z: targetPoint.z,
        duration: duration,
        ease: 'power2.inOut',
        onUpdate: () => {
          this.controls.target.set(targetObj.x, targetObj.y, targetObj.z);
          this._applyTilt();
        },
        onComplete: () => {
          // Update camera near/far planes and restore controls
          this.camera.near = Math.max(0.01, distance / 200);
          this.camera.far = distance * 50;
          this.camera.updateProjectionMatrix();
          this.controls.enablePan = wasPanEnabled;
          this.controls.enableRotate = wasRotateEnabled;
          this.controls.update();
          if (this.autoOrbitMode === 'off') {
            this._applyTilt();
          }
        },
      });
    }
  }

  /**
   * Apply a camera preset (front, three-quarter, top)
   * @param {string} preset - Preset name ('front', 'three-quarter', 'top')
   */
  applyCameraPreset(preset) {
    if (!this.modelBounds) return;
    const { center, radius } = this.modelBounds;
    const distance = radius * 2.4 || 5;
    const target = center.clone();
    let position;
    
    if (preset === 'front') {
      position = target.clone().add(new THREE.Vector3(0, radius * 0.2, distance));
    } else if (preset === 'three-quarter') {
      position = target
        .clone()
        .add(new THREE.Vector3(distance, radius * 0.4, distance));
    } else if (preset === 'top') {
      position = target.clone().add(new THREE.Vector3(0, distance, 0.0001));
    }
    
    if (position) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
      if (this.autoOrbitMode === 'off') {
        this._applyTilt();
      }
    }
  }

  dispose() {
    this.controls.dispose();
    this._unbindAltInteractions();
  }

  _bindAltInteractions() {
    this.mousedownHandler = (event) => {
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
      } else if (event.button === 0) {
        event.preventDefault();
        event.stopPropagation();
        this.altLeftDragging = true;
        this.altLeftTargetSet = false;
        this._focusOnModelCenter(true);
      }
    };

    this.mousemoveHandler = (event) => {
      if (this.altRightDragging) {
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
      if (this.altRightDragging && event.button === 2) {
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
      if (event.altKey) {
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

    this.controls.target.copy(point);
    this.controls.update();
    if (this.autoOrbitMode === 'off') {
      this._applyTilt();
    }
    this.altLeftTargetSet = true;
  }
}

