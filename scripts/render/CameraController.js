import * as THREE from 'three';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/controls/OrbitControls.js';
import { gsap } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js';

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
    this.camera.fov = initialFov;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    
    // Store base camera rotation for tilt calculation
    this.baseCameraQuaternion = this.camera.quaternion.clone();
    this.currentTilt = 0;

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
    this.currentTilt = degrees;
    this._applyTilt();
  }

  /**
   * Apply tilt rotation to camera (called after OrbitControls updates)
   * This rotates the camera around the view direction (forward axis) for left/right roll
   */
  _applyTilt() {
    // Clamp tilt to -45 to +45 degrees
    const clampedTilt = THREE.MathUtils.clamp(this.currentTilt, -45, 45);
    
    if (Math.abs(clampedTilt) < 0.01) {
      // No tilt - ensure camera up is aligned with world up
      this.camera.up.set(0, 1, 0);
      this.controls.update();
      return;
    }

    const radians = THREE.MathUtils.degToRad(clampedTilt);
    
    // Get the camera's view direction (from camera to target) - this is the forward axis
    const forward = new THREE.Vector3();
    forward.subVectors(this.controls.target, this.camera.position).normalize();
    
    // Get the camera's right vector (perpendicular to forward and world up)
    const worldUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3();
    right.crossVectors(forward, worldUp).normalize();
    
    // If right vector is zero (camera looking straight up/down), use a fallback
    if (right.length() < 0.1) {
      right.set(1, 0, 0);
      right.crossVectors(right, forward).normalize();
    }
    
    // Calculate the base up vector (perpendicular to forward and right)
    // This is what the up vector would be with no tilt
    const baseUp = new THREE.Vector3();
    baseUp.crossVectors(right, forward).normalize();
    
    // Rotate the base up vector around the forward axis by the tilt angle
    // Using Rodrigues' rotation formula: v' = v*cos(θ) + (k×v)*sin(θ) + k*(k·v)*(1-cos(θ))
    // For rotation around forward axis: up' = up*cos(θ) + right*sin(θ)
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const tiltedUp = new THREE.Vector3();
    tiltedUp.copy(baseUp).multiplyScalar(cos);
    tiltedUp.addScaledVector(right, sin);
    tiltedUp.normalize();
    
    // Set the camera's up vector
    this.camera.up.copy(tiltedUp);
    this.controls.update();
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
      // Use model center if available, otherwise use controls target
      const target = this.callbacks.getFocusPoint?.() ?? this.controls.target ?? new THREE.Vector3();
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

    // Get model center (target point) - use focus point callback if available
    const target = this.callbacks.getFocusPoint?.() ?? this.controls.target ?? new THREE.Vector3();
    
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
    
    // Always look at target
    this.camera.lookAt(target);
    
    // Update controls target to keep it in sync
    this.controls.target.copy(target);
    // Note: controls.update() is called in update() method, but pan/rotate are disabled
    // This allows zoom (dolly) to still work while auto-orbit controls position
  }

  update() {
    // Only update controls if auto-orbit is off (to prevent interference)
    // When auto-orbit is on, we manually control camera position
    if (this.autoOrbitMode === 'off') {
      this.controls.update();
    }
    
    // Always apply tilt after controls update to ensure it's maintained
    // This ensures smooth transitions and prevents OrbitControls from overriding it
    this._applyTilt();
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
      const distance = this.modelBounds.radius * 2.2 || 5;
      const direction = new THREE.Vector3(1.5, 1.2, 1.5).normalize();
      this.camera.position.copy(adjustedCenter.clone().add(direction.multiplyScalar(distance)));
      this.camera.near = Math.max(0.01, distance / 200);
      this.camera.far = distance * 50;
      this.camera.updateProjectionMatrix();
      this.controls.update();
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
      
      const distance = this.modelBounds.radius * 2.2 || 5;
      const direction = new THREE.Vector3(1.5, 1.2, 1.5).normalize();
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
          // Use lookAt for smooth camera orientation during animation
          this.camera.lookAt(this.controls.target);
          this.controls.update();
        },
        onComplete: () => {
          // Update camera near/far planes and restore controls
          this.camera.near = Math.max(0.01, distance / 200);
          this.camera.far = distance * 50;
          this.camera.updateProjectionMatrix();
          this.controls.enablePan = wasPanEnabled;
          this.controls.enableRotate = wasRotateEnabled;
          this.controls.update();
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
    this.altLeftTargetSet = true;
  }
}

